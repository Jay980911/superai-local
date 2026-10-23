'use strict';
/**
 * 聊天代理：mock 模式返回固定 tool_call 序列验证全链路
 * 真实模式(第2步)：经 WS 转发服务器 LLM
 */
const Mock = require('./mock');

class Chat {
  constructor({ project, executor, preview, security, mock, token, server, clientId, bridge }) {
    this.project = project;
    this.executor = executor;
    this.preview = preview;
    this.security = security;
    this.mock = mock !== false;
    this.token = token;
    this.server = (server || '').replace(/\/$/, '');
    this.clientId = clientId;
    this.bridge = bridge;
    this.conversationId = project.readConversationId() || null;   // 会话 ID(持久化到 .superai/conversation.json,CLI 重启也恢复)
    this.history = project.readHistory() || [];  // 聊天历史(持久化到 .superai/history.json)
    this._saveTimer = null;
  }

  /**
   * @param msg 用户消息
   * @param {onEvent(ev,data)} cb
   * 流程：mock → emit tool_start/tool → 执行(write_file/scaffold/exec) → emit tool result → emit reply → end
   */
  async send(msg, { onEvent }) {
    this.history.push({ ev: 'user', d: { text: msg } });
    this._scheduleSave();
    if (this.mock) return this._mock(msg, onEvent);
    return this._real(msg, onEvent);
  }
  /** debounce 写入磁盘(避免每事件一次 IO) */
  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.project.writeHistory(this.history), 1000);
  }

  /** 真实模式：转发服务器 /api/agent/execute 的 SSE 流给工作台 */
  async _real(msg, onEvent) {
    if (!this.server || !this.token) {
      onEvent('error', { message: '未配置服务器/token，请用 --server --token' });
      onEvent('end', {}); return;
    }
    const url = `${this.server}/api/agent/execute?task=${encodeURIComponent(msg)}${this.clientId ? '&clientId=' + encodeURIComponent(this.clientId) : ''}${this.conversationId ? '&conversationId=' + encodeURIComponent(this.conversationId) : ''}`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
      if (!res.ok) {
        onEvent('error', { message: `服务器 HTTP ${res.status}` });
        onEvent('end', {}); return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          this._forwardBlock(block, onEvent);
        }
      }
    } catch (e) {
      onEvent('error', { message: e.message });
    }
    onEvent('end', {});
  }

  _forwardBlock(block, onEvent) {
    // 跳过注释行(心跳 :keep-alive)
    if (block.startsWith(':')) return;
    let event = 'message', data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    let d = {}; try { d = JSON.parse(data); } catch (_) { d = { text: data }; }
    // conversation 事件: 存 conversationId,不转发工作台
    if (event === 'conversation') {
      this.conversationId = d.conversationId || (d.data && d.data.conversationId) || null;
      if (this.conversationId) this.project.saveConversationId(this.conversationId);
      return;
    }
    // 服务器事件映射到工作台事件
    const map = { reply: 'reply', reasoning: 'reasoning', tool_start: 'tool_start', tool: 'tool',
                  end: 'end', agent_error: 'error', error: 'error', timeout: 'error' };
    const ev = map[event] || 'reply';
    if (event === 'agent_error' || event === 'error' || event === 'timeout') d = { message: d.message || JSON.stringify(d) };
    if (event === 'tool') d = { name: d.name, arguments: d.arguments, result: d.result };
    if (event === 'tool_start') d = { name: d.name, arguments: d.arguments };
    onEvent(ev, d);
  }

  async _mock(msg, onEvent) {
    const plan = Mock.planFor(msg, this.project);
    if (!plan) {
      onEvent('reply', { text: `我收到了："${msg}"。mock 模式下，试试说"做个落地页"或"做个 React 仪表盘"。` });
      return;
    }
    onEvent('reply', { text: plan.intro });

    for (const step of plan.steps) {
      if (step.type === 'scaffold') {
        onEvent('tool_start', { name: 'scaffold_project', arguments: { template: step.template } });
        await this._execStep(step, onEvent);
        onEvent('tool', { name: 'scaffold_project', result: { template: step.template, ok: true } });
      } else if (step.type === 'write_file') {
        onEvent('tool_start', { name: 'write_file', arguments: { path: step.path, size: step.content.length } });
        await this._execStep(step, onEvent);
        onEvent('tool', { name: 'write_file', result: { path: step.path, ok: true } });
      } else if (step.type === 'exec') {
        onEvent('tool_start', { name: 'exec_command', arguments: { cmd: step.cmd } });
        await this._execStep(step, onEvent);
        onEvent('tool', { name: 'exec_command', result: { cmd: step.cmd, ok: true } });
      } else if (step.type === 'start_preview') {
        onEvent('tool_start', { name: 'start_preview', arguments: {} });
        await this._startPreview(onEvent);
        onEvent('tool', { name: 'start_preview', result: { mode: this.preview.mode, url: this.preview.getUrl(), ok: this.preview.isReady() } });
      }
    }
    onEvent('reply', { text: plan.outro });
  }

  async _execStep(step, onEvent) {
    try {
      if (step.type === 'scaffold') {
        this.project.scaffold(step.template);
      } else if (step.type === 'write_file') {
        this.security.assertFileSize(step.content);
        this.project.writeFile(step.path, step.content);
      } else if (step.type === 'exec') {
        const [cmd, ...args] = step.cmd.split(/\s+/);
        await this.executor.exec(cmd, args, {}, d => {
          if (d.type === 'stdout' || d.type === 'stderr') onEvent('exec_log', { cmd: step.cmd, chunk: d.chunk });
        });
      }
    } catch (e) {
      onEvent('error', { step: step.type, message: e.message });
    }
  }

  async _startPreview(onEvent) {
    await this.preview.start(chunk => {
      onEvent('dev_log', { chunk: typeof chunk === 'string' ? chunk : JSON.stringify(chunk) });
    });
    // 等一下让 vite 起来
    await new Promise(r => setTimeout(r, this.preview.mode === 'vite' ? 3000 : 100));
    onEvent('preview_ready', { mode: this.preview.mode, url: this.preview.getUrl() });
  }
}

module.exports = Chat;
