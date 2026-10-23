'use strict';
/**
 * 预览管理：单 HTML 用 srcdoc，vite 项目起 dev server
 * R6 进程生命周期; R5 错误回传; 端口递增
 */
const net = require('net');

class Preview {
  constructor(executor, project, security) {
    this.executor = executor;
    this.project = project;
    this.security = security;
    this.mode = null;        // 'static' | 'vite'
    this.devProc = null;     // vite dev 进程信息
    this.devUrl = null;
    this.devPort = null;
    this.onError = null;     // 错误回传 cb
    this._devData = [];
  }

  /** 启动预览：根据模板类型 */
  async start(onData) {
    const tpl = this.project.template;
    if (tpl === 'static-html') {
      this.mode = 'static';
      this.devUrl = null; // 前端读 /file 读 index.html srcdoc
      return { mode: 'static' };
    }
    // vite 类
    this.mode = 'vite';
    return this._startViteDev(onData);
  }

  async _startViteDev(onData) {
    const port = await findFreePort(5173);
    // 设置 vite host + port
    const env = { ...process.env };
    // 跑 npm run dev -- --port port --host
    let buf = '';
    const onDataCb = (d) => {
      if (d.type === 'stdout' || d.type === 'stderr') {
        const clean = d.chunk.replace(/\x1b\[[0-9;]*m/g, '');
        this._devData.push(clean);
        buf += clean;
        onData && onData(clean);
        // 检测 vite 监听成功(在累积 buffer 里匹配,防分片)
        const m = /Local:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/.exec(buf);
        if (m && !this.devUrl) {
          this.devPort = parseInt(m[1], 10);
          this.devUrl = `http://127.0.0.1:${m[1]}`;  // IPv4 直连,避免 Windows localhost 走 IPv6 连不上
          this.project.setDevPort(this.devPort);
          onData && onData({ type: 'dev_ready', url: this.devUrl, port: this.devPort });
        }
        // 检测错误
        if (/error|fail|EADDRINUSE/i.test(clean)) {
          this.onError && this.onError(clean);
        }
      }
    };
    // dev 长跑不超时，但记录在 executor.children 里以便 killAll
    const p = this.executor.exec(this.executor._detectPm(), ['run', 'dev', '--', '--port', String(port), '--host', '127.0.0.1'], { timeout: 0 }, onDataCb);
    this.devProc = p;
    return { mode: 'vite', port };
  }

  isReady() { return this.mode === 'static' || (this.mode === 'vite' && this.devUrl); }
  getUrl() { return this.devUrl; }

  async stop() {
    // executor.killAll 会清；这里只清引用
    this.devUrl = null;
    this.devProc = null;
  }

  getRecentLog() { return this._devData.slice(-200).join(''); }
}

function findFreePort(start) {
  return new Promise((resolve) => {
    const tryP = (p) => {
      const srv = net.createServer();
      srv.unref();
      srv.on('error', () => tryP(p + 1));
      srv.listen(p, '127.0.0.1', () => {
        srv.close(() => resolve(p));
      });
    };
    tryP(start);
  });
}

module.exports = Preview;
