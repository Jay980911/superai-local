'use strict';
/**
 * 命令执行器：白名单、超时、tree-kill、流式 stdout
 * R1 超时 kill; R3 防死循环(次数/超时); R6 tree-kill 跨平台
 */
const { spawn, exec } = require('child_process');

/**
 * 原生 tree-kill：杀进程树(替 tree-kill 依赖,纯 Node 无 native)
 * Win: taskkill /T /F /PID   Unix: pkill -P / kill 进程组
 */
function treeKill(pid, sig, cb) {
  if (typeof sig === 'function') { cb = sig; sig = null; }
  if (!pid) return cb && cb();
  if (process.platform === 'win32') {
    exec(`taskkill /T /F /PID ${pid}`, () => cb && cb());
  } else {
    exec(`pkill -P ${pid} 2>/dev/null; kill -9 ${pid} 2>/dev/null`, () => cb && cb());
  }
}

const DEFAULT_TIMEOUT = 120000; // exec 120s
const NPM_MIRROR = 'https://registry.npmmirror.com';

class Executor {
  constructor(security, workdir) {
    this.security = security;
    this.workdir = workdir;
    this.children = new Map(); // id -> {proc, timer}
    this.seq = 0;
  }

  /**
   * 执行命令，流式回调 stdout/stderr/exit
   * @returns Promise<{code, signal}>
   */
  exec(command, args = [], opts = {}, onData) {
    return new Promise((resolve, reject) => {
      try { this.security.checkExec(command); }
      catch (e) { return reject(e); }

      const isNpm = /^(npm|npx|pnpm|yarn)$/.test(path_base(command));
      const finalArgs = args.slice();
      // 国内 npm 自动换源
      if (isNpm && finalArgs[0] === 'install' && !finalArgs.includes('--registry')) {
        finalArgs.push('--registry', NPM_MIRROR);
      }
      const shell = process.platform === 'win32';
      const proc = spawn(command, finalArgs, {
        cwd: this.workdir,
        shell,
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const id = ++this.seq;
      const timeout = opts.timeout || DEFAULT_TIMEOUT;
      const timer = setTimeout(() => {
        this._kill(id, () => {
          const err = new Error(`exec 超时(${timeout}ms): ${command} ${args.join(' ')}`);
          err.timeout = true;
          reject(err);
        });
      }, timeout);

      this.children.set(id, { proc, timer });

      const push = (type, chunk) => { if (onData) onData({ type, chunk: chunk.toString('utf8') }); };
      proc.stdout.on('data', d => push('stdout', d));
      proc.stderr.on('data', d => push('stderr', d));

      proc.on('error', e => { clearTimeout(timer); this.children.delete(id); reject(e); });
      proc.on('close', (code, signal) => {
        clearTimeout(timer);
        this.children.delete(id);
        if (onData) onData({ type: 'exit', code, signal });
        resolve({ code, signal });
      });
    });
  }

  _kill(id, cb) {
    const c = this.children.get(id);
    if (!c) return cb && cb();
    clearTimeout(c.timer);
    if (!c.proc.pid) { this.children.delete(id); return cb && cb(); }
    treeKill(c.proc.pid, 'SIGKILL', () => { this.children.delete(id); cb && cb(); });
  }

  killAll() {
    const ids = [...this.children.keys()];
    return Promise.all(ids.map(id => new Promise(r => this._kill(id, r))));
  }

  npmInstall(onData) {
    const pm = this._detectPm();
    return this.exec(pm, ['install'], { timeout: 180000 }, onData);
  }

  npmRunDev(onData) {
    const pm = this._detectPm();
    // dev 不超时(长跑)，但 onExit 回调处理
    return this.exec(pm, ['run', 'dev'], { timeout: 0 }, onData);
  }

  _detectPm() {
    if (fs.existsSync(path.join(this.workdir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(this.workdir, 'yarn.lock'))) return 'yarn';
    return 'npm';
  }
}

function path_base(cmd) {
  const p = require('path');
  return p.basename(cmd).replace(/\.exe$/i, '').replace(/\.cmd$/i, '').replace(/\.bat$/i, '');
}

const fs = require('fs');
const path = require('path');

module.exports = Executor;
