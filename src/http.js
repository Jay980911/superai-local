'use strict';
/**
 * 本地 HTTP 服务：API + SSE + 静态工作台页
 * 逐 token 透传不缓冲; 工作台只连 localhost
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 打包(pkg)时 web/ 外置在 exe 同级;开发时在项目根 web/
const WEB_DIR = process.pkg
  ? path.join(path.dirname(process.execPath), 'web')
  : path.join(__dirname, '..', 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

class HttpServer {
  constructor({ port, project, executor, preview, chat, security }) {
    this.port = port;
    this.project = project;
    this.executor = executor;
    this.preview = preview;
    this.chat = chat;
    this.security = security;
    this.sseClients = new Set();
  }

  start() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => this._handle(req, res));
      this.server.listen(this.port, '::', () => resolve());
    });
  }

  _broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.sseClients) {
      try { c.write(payload); c.flush && c.flush(); } catch (_) {}
    }
  }

  _handle(req, res) {
    const parsed = url.parse(req.url, true);
    const p = parsed.pathname;

    // CORS 仅本机无意义；但留头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // SSE
    if (p === '/events') return this._sse(req, res);

    // API
    if (p === '/api/ping' && req.method === 'GET') return this._json(res, { ok: true, version: '1.0.0', port: this.port });
    if (p === '/api/pick-dir' && req.method === 'POST') return this._pickDir(res);
    if (p === '/api/handshake' && req.method === 'POST') return this._handshake(req, res);
    if (p === '/api/state' && req.method === 'GET') return this._json(res, this._state());
    if (p === '/api/tree' && req.method === 'GET') return this._json(res, this.project.readTree());
    if (p === '/api/file' && req.method === 'GET') return this._file(parsed.query.path, res);
    if (p === '/api/preview-url' && req.method === 'GET') {
      let mode = this.preview.mode, url = this.preview.getUrl(), ready = this.preview.isReady();
      if (!mode && this.project.template === 'static-html') { mode = 'static'; ready = true; }
      return this._json(res, { url, mode, ready, entry: this.project.getEntry() });
    }
    if (p === '/api/dev-log' && req.method === 'GET') return this._json(res, { log: this.preview.getRecentLog() });
    if (p === '/api/history' && req.method === 'GET') return this._json(res, this.chat.history || []);

    if (p === '/api/chat' && req.method === 'POST') return this._chat(req, res);
    if (p === '/api/restart-preview' && req.method === 'POST') return this._restartPreview(res);
    if (p === '/api/tool' && req.method === 'POST') return this._tool(req, res);

    // 静态工作台
    return this._static(p, res);
  }

  _state() {
    return {
      workdir: this.project.workdir,
      name: this.project.data.name,
      template: this.project.template,
      clientId: this.project.clientId,
      memory: this.project.readMemory(),
      preview: { mode: this.preview.mode, url: this.preview.getUrl(), ready: this.preview.isReady() },
      entry: this.project.getEntry(),
    };
  }

  /** 弹系统原生文件夹选择框(Windows PowerShell / mac osascript / Linux zenity) */
  _pickDir(res) {
    const { execFile } = require('child_process');
    const platform = process.platform;
    let cmd, args;
    if (platform === 'win32') {
      cmd = 'powershell';
      args = ['-NoProfile', '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; " +
        "$f=New-Object System.Windows.Forms.FolderBrowserDialog; " +
        "$f.Description='选择本地工作目录'; " +
        "if($f.ShowDialog() -eq 'OK'){ [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($f.SelectedPath)) } else { '' }"];
    } else if (platform === 'darwin') {
      cmd = 'osascript';
      args = ['-e', 'POSIX path of (choose folder with prompt "选择本地工作目录")'];
    } else {
      cmd = 'zenity';
      args = ['--file-selection', '--directory', '--title=选择本地工作目录'];
    }
    execFile(cmd, args, { timeout: 120000, windowsHide: false }, (err, stdout) => {
      if (err) { this._json(res, { error: '取消或未安装选择器' }); return; }
      // Windows PowerShell 用 base64 输出避免中文路径乱码
      let dir;
      if (platform === 'win32') {
        try { dir = Buffer.from((stdout || '').trim(), 'base64').toString('utf8'); } catch (_) { dir = ''; }
      } else {
        dir = (stdout || '').trim().replace(/\r/g, '');
      }
      if (!dir) { this._json(res, { error: '未选择目录' }); return; }
      this._json(res, { dir });
    });
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      let b = '';
      req.on('data', d => b += d);
      req.on('end', () => resolve(b));
      req.on('error', reject);
    });
  }

  /** 前端握手: 传 token/server/conversationId/workdir,CLI 重新初始化运行时 + 连 superai */
  async _handshake(req, res) {
    let body;
    try { body = JSON.parse(await this._readBody(req)); } catch { return this._json(res, { error: '参数错误' }, 400); }
    const { token, server, conversationId, workdir } = body;
    if (!workdir) return this._json(res, { error: 'workdir 必填' }, 400);
    // 拒绝乱码/不存在的路径(防止旧版 pick-dir 留下的脏缓存毒到 CLI 状态)
    const fs = require('fs');
    if (!fs.existsSync(workdir)) return this._json(res, { error: 'workdir 路径无效或不存在，请重新选择目录' }, 400);
    if (!this.reinit) return this._json(res, { error: 'CLI 未启用 handshake' }, 500);
    try {
      await this.reinit({ workdir, token, server, conversationId });
      this._broadcastSSE('handshake', { workdir, conversationId });
      return this._json(res, { ok: true, ...this._state() });
    } catch (e) {
      return this._json(res, { error: e.message }, 500);
    }
  }

  _file(rel, res) {
    try {
      const content = this.project.readFile(rel);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(content);
    } catch (e) { res.writeHead(404); res.end(String(e.message)); }
  }

  _chat(req, res) {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { msg } = JSON.parse(body || '{}');
        // SSE 流式回复
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        res.flushHeaders && res.flushHeaders();
        const send = (event, data) => {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
          res.flush && res.flush();
        };
        await this.chat.send(msg, {
          onEvent: (ev, d) => { send(ev, d); this._broadcastSSE(ev, d); this.chat.history.push({ ev, d }); this.chat._scheduleSave(); },
        });
        send('end', {});
        res.end();
      } catch (e) {
        res.writeHead(500); res.end(String(e.message));
      }
    });
  }

  async _restartPreview(res) {
    try {
      await this.preview.stop();
      await this.executor.killAll();
      const onData = (d) => {
        if (d && typeof d === 'object' && d.type === 'dev_ready') {
          this._broadcastSSE('preview_ready', { mode: 'vite', url: d.url, ready: d.url });
        } else {
          const chunk = typeof d === 'string' ? d : (d && d.chunk) || '';
          this._broadcastSSE('dev_log', { chunk: chunk.replace(/\x1b\[[0-9;]*m/g, '') });
        }
      };
      const r = await this.preview.start(onData);
      this._json(res, r);
    } catch (e) { res.writeHead(500); res.end(String(e.message)); }
  }

  // 通用工具 RPC（Design B 契约）：由 superai-py /api/local/tool 经浏览器转发而来。
  // body: {name, arguments, requestId, clientId, conversationId, workdir}
  // 回包: {result, error, status}
  async _tool(req, res) {
    const reply = (payload) => {
      try { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); } catch (_) {}
    };
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      let name = '';
      let args = {};
      try {
        const parsed = JSON.parse(body || '{}');
        name = parsed.name || '';
        args = parsed.arguments || {};
      } catch (e) { return reply({ error: '请求体非法 JSON', status: 'error' }); }
      try {
        let result;
        switch (name) {
          case 'list_files': {
            const rel = args.path ? String(args.path) : '';
            const tree = this.project.readTree();
            result = rel ? pickSubtree(tree, rel) : tree;
            break;
          }
          case 'read_file': {
            const rel = String(args.path || '');
            if (!rel) throw new Error('path 为空');
            const abs = this.security.resolve(rel);
            result = fs.readFileSync(abs, 'utf8');
            break;
          }
          case 'write_file': {
            const rel = String(args.path || '');
            const content = String(args.content || '');
            this.security.assertFileSize(content);
            const abs = this.security.assertWritable(rel);
            fs.writeFileSync(abs, content, 'utf8');
            result = { ok: true, path: rel };
            this._broadcastSSE('files_changed', { tool: 'write_file', path: rel });
            break;
          }
          case 'run_command': {
            // 前台执行，受 executor 默认 120s 超时约束；长跑 dev server 请用 /api/restart-preview。
            const cmd = String(args.command || '').trim();
            if (!cmd) throw new Error('command 为空');
            const [bin, ...rest] = cmd.split(/s+/);
            let stdout = '';
            const r = await this.executor.exec(bin, rest, {}, d => {
              if (d && (d.type === 'stdout' || d.type === 'stderr')) {
                stdout += d.chunk;
                this._broadcastSSE('dev_log', { chunk: d.chunk.replace(/[[0-9;]*m/g, '') });
              }
            });
            result = { ok: r.code === 0, code: r.code, stdout: stdout.slice(-4000) };
            this._broadcastSSE('files_changed', { tool: 'run_command', path: args.path || '' });
            break;
          }
          default:
            return reply({ error: `未知工具: ${name}`, status: 'error' });
        }
        reply({ result, status: 'completed' });
      } catch (e) {
        reply({ error: e.message || String(e), status: 'error' });
      }
    });
  }

  _sse(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.flushHeaders && res.flushHeaders();
    this.sseClients.add(res);
    const hello = `event: hello\ndata: ${JSON.stringify(this._state())}\n\n`;
    res.write(hello);
    req.on('close', () => this.sseClients.delete(res));
  }

  _json(res, obj) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  }

  _static(p, res) {
    let fp = path.join(WEB_DIR, p === '/' ? '/index.html' : p);
    if (!fp.startsWith(WEB_DIR)) { res.writeHead(403); return res.end('forbidden'); }
    fs.stat(fp, (err, st) => {
      if (err || !st.isFile()) {
        // SPA fallback → index.html
        fp = path.join(WEB_DIR, 'index.html');
      }
      fs.readFile(fp, (e, data) => {
        if (e) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        res.end(data);
      });
    });
  }
}

// 从 readTree() 结果里按相对路径定位子树；找不到就返回 []。
function pickSubtree(nodes, rel) {
  const segs = String(rel).split('/').filter(Boolean);
  let cur = nodes;
  for (const seg of segs) {
    const hit = (cur || []).find(n => n.name === seg && n.type === 'dir');
    cur = hit ? (hit.children || []) : [];
  }
  return cur;
}

module.exports = HttpServer;
