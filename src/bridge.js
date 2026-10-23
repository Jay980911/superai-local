'use strict';
/**
 * 本地桥客户端：连服务器 SSE 收 tool_call，执行后 POST 回结果。
 * 用 Node 18+ 原生 fetch + ReadableStream 解析 SSE（免 eventsource 依赖）。
 *
 *   CLI ──GET /api/local/connect?clientId=&token=──▶ 服务器 SSE
 *   CLI ──POST /api/local/tool-result {callId,result,error}──▶ 回填
 *   CLI ──POST /api/local/context {clientId,memory}──▶ 上报 memory
 */
const https = require('https');
const http = require('http');

class Bridge {
  constructor({ server, token, clientId, project, executor, security, onLog }) {
    this.server = (server || '').replace(/\/$/, '');
    this.token = token;
    this.clientId = clientId;
    this.project = project;
    this.executor = executor;
    this.security = security;
    this.onLog = onLog || (() => {});
    this.onPreviewReady = null; // dev ready 回调
    this.onExecLog = null;      // exec 日志回调 → 推工作台 SSE
    this.onFilesChanged = null; // 文件变动回调 → 推工作台 refreshTree+refreshPreview
    this.connected = false;
    this._abort = null;
    this._closing = false;
    this._reconnectDelay = 1000;
  }

  /** 启动：连 SSE(session 建立) 后上报 context */
  async start() {
    if (!this.token) throw new Error('未提供 token（--token 或 ~/.superai/token）');
    if (!this.clientId) throw new Error('未提供 clientId');
    this._connectSSE();
  }

  _connectSSE() {
    const url = `${this.server}/api/local/connect?clientId=${encodeURIComponent(this.clientId)}&token=${encodeURIComponent(this.token)}`;
    this.onLog(`[bridge] 连接 ${this.server}/api/local/connect ...`);
    const ac = new AbortController();
    this._abort = ac;
    fetch(url, { headers: { Accept: 'text/event-stream' }, signal: ac.signal })
      .then(res => {
        if (!res.ok) { this.onLog(`[bridge] 连接失败 HTTP ${res.status}`); this._scheduleReconnect(); return; }
        this.connected = true;
        this._reconnectDelay = 1000;  // 重置退避
        this.onLog('[bridge] 已连接，等待 tool_call ...');
        // session 已由 connect 建立，现在上报 context（memory + workdir）
        this._post('/api/local/context', { clientId: this.clientId, memory: this.project.readMemory(), workdir: this.project.workdir })
          .catch(e => this.onLog('[bridge] 上报 context 失败: ' + e.message));
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        const pump = () => reader.read().then(({ done, value }) => {
          if (done) { this.onLog('[bridge] SSE 断开'); this.connected = false; this._scheduleReconnect(); return; }
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
            this._handleBlock(block);
          }
          pump();
        }).catch(e => {
          if (e.name !== 'AbortError') { this.onLog('[bridge] SSE 错误: ' + e.message); this.connected = false; this._scheduleReconnect(); }
        });
        pump();
      }).catch(e => {
        if (e.name !== 'AbortError') { this.onLog('[bridge] 连接异常: ' + e.message); this._scheduleReconnect(); }
      });
  }
  /** SSE 断开后自动重连(指数退避 1s→30s,主动 stop 不重连) */
  _scheduleReconnect() {
    if (this._closing) return;
    const delay = this._reconnectDelay;
    this._reconnectDelay = Math.min(delay * 2, 30000);
    this.onLog(`[bridge] ${delay}ms 后重连...`);
    setTimeout(() => this._connectSSE(), delay);
  }

  _handleBlock(block) {
    let event = 'message', data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (event === 'tool_call') {
      let d; try { d = JSON.parse(data); } catch (_) { return; }
      this._handleToolCall(d).catch(e => this.onLog('[bridge] tool_call 处理异常: ' + e.message));
    }
  }

  async _handleToolCall({ callId, tool, arguments: argsJson }) {
    let result, error;
    const args = argsJson ? JSON.parse(argsJson) : {};
    try {
      switch (tool) {
        case 'write_file': {
          this.security.assertFileSize(args.content || '');
          this.project.writeFile(args.path, args.content);
          result = JSON.stringify({ ok: true, path: args.path });
          break;
        }
        case 'exec_command': {
          const [cmd, ...rest] = (args.cmd || '').split(/\s+/);
          let stdout = '';
          const isDev = /run\s+dev|vite/.test(args.cmd || '');
          if (isDev) {
            // dev 长跑：注入端口+host，检测 ready 立即返回，进程后台继续
            const port = await findFreePort(5173);
            rest.push('--port', String(port), '--host', '127.0.0.1');
            const readyUrl = await new Promise(resolve => {
              let done = false;
              this.executor.exec(cmd, rest, { timeout: 0 }, d => {
                if (d.type === 'stdout' || d.type === 'stderr') {
                  stdout += d.chunk;
                  this.onLog(`[exec] ${args.cmd}\n${d.chunk}`);
                  const clean = d.chunk.replace(/\x1b\[[0-9;]*m/g, '');
                  this.onExecLog && this.onExecLog({ cmd: args.cmd, chunk: clean });
                  const m = /Local:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/.exec(clean);
                  if (m && !done) { done = true; resolve(`http://localhost:${m[1]}`); }
                }
              }).catch(() => {});
              setTimeout(() => { if (!done) { done = true; resolve(null); } }, 12000);
            });
            if (readyUrl) {
              this.project.setDevPort(port);
              result = JSON.stringify({ ok: true, devUrl: readyUrl });
              this.onPreviewReady && this.onPreviewReady({ mode: 'vite', url: readyUrl });
            } else {
              result = JSON.stringify({ ok: false, error: 'dev server 12s 未就绪', stdout: stdout.slice(-2000) });
            }
          } else {
            const r = await this.executor.exec(cmd, rest, {}, d => {
              if (d.type === 'stdout' || d.type === 'stderr') {
                stdout += d.chunk;
                this.onLog(`[exec] ${args.cmd}\n${d.chunk}`);
                this.onExecLog && this.onExecLog({ cmd: args.cmd, chunk: d.chunk.replace(/\x1b\[[0-9;]*m/g, '') });
              }
            });
            result = JSON.stringify({ ok: r.code === 0, code: r.code, stdout: stdout.slice(-4000) });
          }
          break;
        }
        case 'save_memory': {
          this.project.appendMemory(args.content || '');
          result = JSON.stringify({ ok: true });
          break;
        }
        case 'scaffold_project': {
          const r = this.project.scaffold(args.template);
          result = (r && r.skipped)
            ? JSON.stringify({ ok: false, skipped: true, error: r.reason })
            : JSON.stringify({ ok: true, template: args.template });
          break;
        }
        default:
          error = `未知工具: ${tool}`;
      }
    } catch (e) {
      error = e.message || String(e);
    }
    // 文件变动通知(成功执行且非纯读工具) → iframe 工作台实时刷新文件树/预览
    if (!error && tool !== 'save_memory') {
      try { this.onFilesChanged && this.onFilesChanged({ tool, path: args.path }); } catch (_) {}
    }
    // 回传结果
    await this._post('/api/local/tool-result', { callId, result, error });
  }

  async _post(path, body) {
    const url = `${this.server}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body),
    });
    return res;
  }

  stop() {
    this._closing = true;  // 主动关闭,不重连
    if (this._abort) this._abort.abort();
    this.connected = false;
  }
}

module.exports = Bridge;

function findFreePort(start) {
  return new Promise(resolve => {
    const net = require('net');
    const tryP = p => {
      const srv = net.createServer(); srv.unref();
      srv.on('error', () => tryP(p + 1));
      srv.listen(p, '127.0.0.1', () => srv.close(() => resolve(p)));
    };
    tryP(start);
  });
}
