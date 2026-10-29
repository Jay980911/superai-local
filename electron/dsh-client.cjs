// dsh-client.cjs — 驱动 dsh（deepseek-harness）SDK runtime 的 CJS 客户端
//
// 替代原 agent.cjs/llm.cjs/tools.cjs 手写 agent 层：superai 只负责
// spawn runtime、发 prompt、把 dsh 事件翻译成前端 IPC 协议
// （text/step/file/done/error），agent 循环 / 工具 / 沙箱 / 审批全在 dsh 内。
//
// 协议依据（@deepseek-ai/dsh-sdk-protocol 0.2.1-rc.3 实测）：
//   - stdio 上 newline-delimited JSON-RPC 2.0
//   - 请求 {jsonrpc,id,method,params}；响应 {jsonrpc,id,result|error}；
//     通知 {jsonrpc,method,params}
//   - 方法：initialize → session/prompt → （通知流）→ shutdown
//   - 通知：session.event{sessionId,event:{type,seq,time,data}}、
//           session.status{sessionId,status}
//   - 回合结束：session.status = idle（无 wire 级 cancel，超时即整体关闭）
//
// 为什么手写而不 import ESM 客户端：Electron 主进程是 CJS，dynamic import
// ESM 在主进程里不稳；按公开 wire 协议实现最稳，且零依赖。

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { KEY_ENV } = require('./dsh-patch.cjs');

/** initialize 握手超时（runtime 冷启动 + 插件加载可能很慢，官方默认 10s 不够） */
const INIT_TIMEOUT_MS = 60000;
/** shutdown 请求超时 */
const SHUTDOWN_TIMEOUT_MS = 5000;
/** dispose 阶梯：stdin EOF 宽容期 → 强杀前确认期 */
const DISPOSE_EOF_GRACE_MS = 6000;
const DISPOSE_GRACE_MS = 3000;

// ---------------------------------------------------------------------------
// 可执行文件解析
// ---------------------------------------------------------------------------

/**
 * 解析 dsh 可执行入口（node_modules/@deepseek-ai/dsh 的 bin）。
 * @param {string} [override] 打包态由主进程传入 resources 下的路径
 * @returns {string} dsh bin 绝对路径
 */
function resolveDshBin(override) {
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`指定的 dsh 入口不存在: ${override}`);
    }
    return override;
  }
  const pkgPath = require.resolve('@deepseek-ai/dsh/package.json');
  const pkg = require(pkgPath);
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin.dsh;
  if (!rel) throw new Error('@deepseek-ai/dsh 未声明 dsh 可执行入口');
  const bin = path.join(path.dirname(pkgPath), rel);
  if (!fs.existsSync(bin)) {
    throw new Error(`dsh 可执行文件不存在: ${bin}（请确认已安装 @deepseek-ai/dsh）`);
  }
  return bin;
}

/**
 * 解析 dsh 的独立 Node 运行时。Electron 自带的 node.exe 不是独立 Node，
 * dsh 的内部模块加载器会按 Electron/V8 指纹校验并拒绝不支持的 Electron 版本。
 */
function inspectNode(candidate) {
  try {
    const result = execFileSync(candidate, [
      '-p',
      'JSON.stringify({ version: process.version, electron: process.versions.electron || null })',
    ], { encoding: 'utf8', windowsHide: true, timeout: 3000 }).trim();
    const info = JSON.parse(result);
    const major = Number(String(info.version).replace(/^v/, '').split('.')[0]);
    return { ...info, major, usable: !info.electron && major >= 22 };
  } catch {
    return null;
  }
}

function resolveNodeBin(override) {
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  const explicit = override || process.env.SUPERAI_NODE_BIN;
  if (explicit && fs.existsSync(explicit)) {
    const info = inspectNode(explicit);
    if (info?.usable) return explicit;
    throw new Error(`指定的 dsh runtime 不是独立 Node 22+：${explicit}`);
  }

  const candidates = [];
  if (process.versions.electron) {
    candidates.push(path.join(__dirname, '..', 'build', 'dsh-runtime', 'node', exe));
    for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
      if (dir) candidates.push(path.join(dir.trim(), exe));
    }
  } else {
    candidates.push(process.execPath);
  }

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      if (!fs.statSync(candidate).isFile()) continue;
    } catch { continue; }
    if (inspectNode(candidate)?.usable) return candidate;
  }

  throw new Error(
    '未找到可用的独立 Node 22+ 运行时。' +
    '请执行 npm run stage:dsh，或安装 Node 22+ 并加入 PATH，或设置 SUPERAI_NODE_BIN。',
  );
}

// ---------------------------------------------------------------------------
// JSON-RPC line transport（stdio，newline-delimited）
// ---------------------------------------------------------------------------

class TransportClosedError extends Error {
  constructor(message) { super(message); this.name = 'TransportClosedError'; }
}

/** 用户主动停止（UI「停止」按钮）：区别于错误，前端据此复位运行态 */
class RunCancelledError extends Error {
  constructor(message = '已停止') { super(message); this.name = 'RunCancelledError'; }
}

/** 耗时追踪：SUPERAI_DSH_TRACE=1 时打印每个 RPC 与事件阶段的毫秒数（诊断用） */
const TRACE = !!process.env.SUPERAI_DSH_TRACE;
function trace(label, t0) {
  if (TRACE) console.log(`[dsh-trace] ${label}: +${Date.now() - t0}ms`);
}

/** 进行中的运行表：sessionId → {child, cancel()}，供 agent:cancel 中断 */
const activeRuns = new Map();

class LineTransport {
  /**
   * @param {import('child_process').ChildProcess} child
   * @param {(method:string, params:object)=>void} onNotify
   */
  constructor(child, onNotify) {
    this.child = child;
    this.onNotify = onNotify;
    this.pending = new Map();   // id → {resolve, reject, timer}
    this.buffer = '';
    this.closed = false;
    this.stderrTail = [];
    // 传输关闭回调（runtime 进程退出/出错时触发）：供上层（doRun）在
    // 收不到 session.status=idle 的情况下也能及时结束本轮，而不是永久挂死。
    this.onClose = null;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this._onData(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => this._onStderr(chunk));
    child.on('error', (err) => this._failAll(new TransportClosedError(`dsh runtime 启动失败: ${err.message}`)));
    child.on('exit', (code) => this._failAll(this._closedError(`dsh runtime 退出 (code=${code})`)));
  }

  _onData(chunk) {
    this.buffer += chunk;
    for (;;) {
      const nl = this.buffer.indexOf('\n');
      if (nl < 0) break;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line) this._dispatch(line);
    }
  }

  _onStderr(chunk) {
    this.stderrTail.push(...String(chunk).split('\n').filter(Boolean));
    if (this.stderrTail.length > 400) {
      this.stderrTail.splice(0, this.stderrTail.length - 400);
    }
    // TRACE 模式实时透出 runtime 日志（重试 / 插件警告等只在这里可见）
    if (TRACE) {
      for (const line of String(chunk).split('\n')) {
        const t = line.trim();
        if (t) console.log(`[dsh-stderr] ${t}`);
      }
    }
  }

  _dispatch(line) {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      return; // 非 JSON 行（runtime 的杂项日志），忽略
    }
    if (frame.id !== undefined && frame.method !== undefined) {
      // server→client 请求（rc.3 的 sdk profile 无审批通道；防御性应答）
      this._write({ jsonrpc: '2.0', id: frame.id, error: { code: -32601, message: `method not found: ${frame.method}` } });
      return;
    }
    if (frame.id !== undefined) {
      const entry = this.pending.get(frame.id);
      if (!entry) return;
      this.pending.delete(frame.id);
      clearTimeout(entry.timer);
      if (frame.error) {
        const data = frame.error.data ? ` ${JSON.stringify(frame.error.data).slice(0, 500)}` : '';
        entry.reject(new Error(`${frame.method || frame.id}: ${frame.error.message}${data}`));
      } else {
        entry.resolve(frame.result);
      }
      return;
    }
    if (frame.method !== undefined) {
      try {
        this.onNotify(frame.method, frame.params || {});
      } catch (err) {
        console.error('[dsh-client] notification handler error:', err);
      }
    }
  }

  _write(message) {
    if (this.closed) return;
    try {
      this.child.stdin.write(JSON.stringify(message) + '\n');
    } catch (err) {
      this._failAll(new TransportClosedError(`写入 dsh runtime 失败: ${err.message}`));
    }
  }

  /**
   * 发请求并等待响应。
   * @param {string} method
   * @param {object} params
   * @param {number} [timeoutMs] 超时（协议无 wire 级 cancel：超时仅让调用方放弃，
   *   runtime 仍在跑；由上层整体关闭进程）
   */
  request(method, params, timeoutMs) {
    if (this.closed) return Promise.reject(new TransportClosedError('transport 已关闭'));
    const id = 'req_' + randomUUID().replace(/-/g, '');
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null };
      if (timeoutMs !== undefined) {
        entry.timer = setTimeout(() => {
          this.pending.delete(id);
          entry.reject(new Error(`${method} 超时（${timeoutMs}ms）`));
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      this._write({ jsonrpc: '2.0', id, method, params: params || {} });
    });
  }

  notify(method, params) {
    this._write(params === undefined
      ? { jsonrpc: '2.0', method }
      : { jsonrpc: '2.0', method, params });
  }

  _closedError(reason) {
    const parts = [`dsh runtime: ${reason}`];
    if (this.stderrTail.length > 0) {
      parts.push('stderr tail:\n' + this.stderrTail.slice(-20).join('\n'));
    }
    return new TransportClosedError(parts.join('\n'));
  }

  _failAll(error) {
    if (this.closed) return;
    this.closed = true;
    // 通知上层：runtime 已退出/出错。doRun 据此及时以错误结束本轮，
    // 避免 await idlePromise 永久挂死（从而也不会堵死后续对话的 runChain）。
    const cb = this.onClose;
    this.onClose = null;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    if (cb) { try { cb(error); } catch { /* 上层回调异常不应影响传输清理 */ } }
  }

  /** 协调关闭：stdin EOF → 等退出 → (POSIX) SIGTERM → SIGKILL，逐级确认 */
  async dispose() {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    try { child.stdin.end(); } catch { /* 已断 */ }
    if (await exitsWithin(child, DISPOSE_EOF_GRACE_MS)) return;
    if (process.platform !== 'win32') {
      try { child.kill('SIGTERM'); } catch { /* 已退出 */ }
      if (await exitsWithin(child, DISPOSE_GRACE_MS)) return;
    }
    // Windows 上 SIGTERM/SIGKILL 都映射为 TerminateProcess，直接强杀
    try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
    if (!(await exitsWithin(child, DISPOSE_GRACE_MS))) {
      throw new Error('dsh runtime 进程在 SIGKILL 后仍未退出');
    }
  }
}

function exitsWithin(child, ms) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, ms);
    const onExit = () => { clearTimeout(timer); resolve(true); };
    child.once('exit', onExit);
  });
}

// ---------------------------------------------------------------------------
// dsh 事件 → superai IPC 事件翻译
// ---------------------------------------------------------------------------

/** 提取 assistant 消息里的文本（content blocks → string） */
function textOfMessage(message) {
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

/** 工具结果 content → 可读字符串（兼容 string / blocks / 其他） */
function textOfToolResult(message) {
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/** 工具参数摘要（arguments 可能是对象或 JSON 字符串） */
function argsDigest(args) {
  let s;
  if (typeof args === 'string') s = args;
  else { try { s = JSON.stringify(args); } catch { s = String(args); } }
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

// 快照工作目录的文件（相对路径 → mtimeMs），用于回合结束时反查「本次运行新生成/修改的文件」。
// dsh rc.3 不稳定地发送 tool/result 通知（经常缺失），导致按 tool/result 探测文件会漏；
// 改为「回合开始/结束各拍一次快照并 diff」是最可靠的方式。
// 大目录做有界扫描，跳过常见无关目录。
// @returns {Map<string, number>}

// 改为异步：原同步 readdirSync/statSync 在大工作目录上会阻塞 Electron 主进程
// （主进程阻塞 = 整个 UI 卡顿，对话结束那一下尤其明显）。用 fs.promises
// 让出事件循环，文件多时只把 Promise 调度延迟留给 IO，不卡渲染。
async function snapshotWorkspace(workspace) {
  const fsp = fs.promises;
  const map = new Map();
  const ignore = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'build', '.next', '.vite', '.cache']);
  const stack = [workspace];
  let count = 0;
  while (stack.length && count < 8000) {
    const dir = stack.pop();
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (ignore.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      try {
        if (ent.isDirectory()) stack.push(full);
        else if (ent.isFile()) {
          const st = await fsp.stat(full);
          map.set(path.relative(workspace, full), st.mtimeMs);
          count++;
        }
      } catch { /* 无权限或竞态，忽略 */ }
      if (count >= 8000) break;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// 常驻 runtime 管理
// ---------------------------------------------------------------------------

// initialize 握手实测 8-9s（cordis 插件系统冷启动，600+ 包），每轮对话都付这个
// 成本不可接受（用户实测「你好」5-6s，几乎全是它）。改为进程级单例：
//   - 首次 run 时 spawn + initialize，之后常驻复用，后续对话接近零启动成本
//   - 模型 / provider patch / API key 变更 → initialize 参数过期，自动重启
//   - 空闲超时（默认 10 分钟）回收，避免长期占用内存
//   - 用户点「停止」或应用退出 → 强杀（协议无 wire 级 cancel，与原有行为一致）
const RESIDENT_IDLE_MS = 10 * 60 * 1000;
/** @type {{child, transport, holder:{currentRun:null}, key:string, lastUsedAt:number}|null} */
let resident = null;
let residentStarting = null;
let reaperTimer = null;
/** run 串行锁：常驻 runtime 同时只服务一个回合（UI 本就串行，这里是防御） */
let runChain = Promise.resolve();

function residentKey(model, dshHome, patchFile) {
  return JSON.stringify({
    provider: 'superai-' + model.id,
    model: model.model,
    // key 走环境变量注入，不落在 patch 里，必须显式进 key
    apiKey: model.apiKey || '',
    patch: fs.existsSync(patchFile) ? fs.readFileSync(patchFile, 'utf-8') : '',
    dshHome,
  });
}

function spawnRuntime(model, workspace, dshHome, patchFile, nodeBin, dshBin) {
  // 显式从 settings 补注入 image-gen 所需 env（防止 process.env 被中间层过滤）
  try {
    const settings = require('./settings.cjs');
    const cfg = settings.load();
    if (cfg.unsplashKey) process.env.UNSPLASH_ACCESS_KEY = cfg.unsplashKey;
    if (cfg.proxy) {
      process.env.HTTPS_PROXY = cfg.proxy;
      process.env.HTTP_PROXY = cfg.proxy;
      process.env.NODE_USE_ENV_PROXY = '1';
    }
  } catch { /* settings 加载失败不阻塞 spawn */ }
  console.log(`[dsh-client] spawn runtime: node=${nodeBin} dsh=${dshBin}`);
  console.log(`[dsh-client] spawn env: UNSPLASH=${process.env.UNSPLASH_ACCESS_KEY ? 'on' : 'off'} PROXY=${process.env.HTTPS_PROXY || 'off'} IMAGEGEN=${process.env.SUPERAI_IMAGEGEN ? 'on' : 'off'}`);
  return spawn(nodeBin, [dshBin, '--profile', 'sdk', '--patch', patchFile], {
    cwd: workspace,
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      // V8 编译缓存：dsh 闭包 600+ 包的 require 树冷启动要重新编译，
      // Node 22 的 compile cache 能省一部分（实测 initialize 仍以插件初始化为主）。
      NODE_COMPILE_CACHE: path.join(dshHome, '.compile-cache'),
      [KEY_ENV]: model.apiKey || '',
      // rc.3 的 sdk profile 无审批传输通道；工具执行须完全权限直接放行。
      // （superai 的用户确认机制后续可在 UI 侧补齐；当前等价于旧版 autoExec。）
      DSH_PERMISSION_MODE: 'danger-full-access',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** 同步强杀常驻 runtime（取消 / 退出 / 参数过期重启用） */
function killResident() {
  const rt = resident;
  resident = null;
  if (!rt) return;
  try { rt.child.kill('SIGKILL'); } catch { /* 已退出 */ }
}

/** 优雅关闭常驻 runtime（空闲回收 / 退出用） */
async function shutdownResident() {
  const rt = resident;
  if (!rt) return;
  resident = null;
  try {
    await rt.transport.request('shutdown', undefined, SHUTDOWN_TIMEOUT_MS);
  } catch { /* runtime 可能已退出 */ }
  try {
    await rt.transport.dispose();
  } catch (err) {
    console.error('[dsh-client] dispose:', err.message);
  }
}

function ensureReaper() {
  if (reaperTimer) return;
  reaperTimer = setInterval(() => {
    if (resident && Date.now() - resident.lastUsedAt > RESIDENT_IDLE_MS) {
      console.log('[dsh-client] runtime 空闲超时，回收');
      shutdownResident();
    }
    if (!resident && reaperTimer) {
      clearInterval(reaperTimer);
      reaperTimer = null;
    }
  }, 30000);
  if (reaperTimer.unref) reaperTimer.unref();
}

/**
 * 获取常驻 runtime（不存在则创建；参数过期则重启）。
 * @returns {Promise<{child, transport, holder, key, lastUsedAt, ready}>}
 */
async function acquireResident(model, workspace, dshHome, patchFile, nodeBin, dshBin) {
  // 统一在此解析可执行文件：warmResident（预热）不经过 doRun，
  // 原实现把 undefined 的 nodeBin/dshBin 直接传给 spawnRuntime → spawn(undefined,...)
  // 报 TypeError，导致 dev 模式（无 bundled runtime）预热始终静默失败，
  // 8-9s initialize 冷启动从没被藏到启动期，全压在第一条消息上。
  // doRun 也会解析一次，重复解析幂等且廉价，无副作用。
  const _nodeBin = nodeBin || resolveNodeBin(undefined);
  const _dshBin = dshBin || resolveDshBin(undefined);
  nodeBin = _nodeBin;
  dshBin = _dshBin;
  const key = residentKey(model, dshHome, patchFile);
  // 模型 / patch / key 变更，或上次 runtime 已崩溃 → 重启
  if (resident && (resident.key !== key || resident.transport.closed)) {
    killResident();
  }
  if (resident) {
    // 可能仍在 initialize 中（spawn 后立即挂单例，保证取消能杀到）；
    // 等它就绪后再返回。等待期间被取消/重启的话下面重新判断。
    if (resident.ready) {
      try { await resident.ready; } catch { /* 初始化失败：resident 已清或将被替换 */ }
    }
    if (resident && resident.key === key && !resident.transport.closed) {
      resident.lastUsedAt = Date.now();
      ensureReaper();
      console.log('[dsh] runtime 复用（跳过 initialize）');
      return resident;
    }
    // 等待期间单例被换掉 → 走下面的创建/重试逻辑
  }
  // 并发防重入
  if (residentStarting) {
    const rt = await residentStarting;
    rt.lastUsedAt = Date.now();
    return rt;
  }
  residentStarting = (async () => {
    const child = spawnRuntime(model, workspace, dshHome, patchFile, nodeBin, dshBin);
    const holder = { currentRun: null };
    const transport = new LineTransport(child, (method, params) => {
      // 通知只路由给当前回合；回合间到达的噪声（迟到 idle 等）忽略
      if (holder.currentRun) holder.currentRun(method, params);
    });
    const rt = { child, transport, holder, key, lastUsedAt: Date.now(), ready: null };
    // spawn 后立即挂单例：initialize 的 8-9s 里点「停止」也要能杀到进程
    rt.ready = transport.request('initialize', {
      cwd: workspace,
      provider: 'superai-' + model.id,
      model: model.model,
    }, INIT_TIMEOUT_MS).then(() => undefined, (err) => {
      if (resident === rt) resident = null;
      throw err;
    });
    resident = rt;
    await rt.ready;
    console.log('[dsh] runtime 冷启动完成（已付 initialize）');
    return rt;
  })();
  try {
    const rt = await residentStarting;
    ensureReaper();
    return rt;
  } catch (err) {
    resident = null;
    throw err;
  } finally {
    residentStarting = null;
  }
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/**
 * 跑一轮 dsh agent。
 *
 * @param {object} opts
 * @param {object} opts.model        settings 当前模型 {id,name,baseUrl,apiKey,model,api}
 * @param {string} opts.workspace    工作目录（= initialize 的 cwd = 工具可见范围）
 * @param {string} opts.input        用户输入
 * @param {string} [opts.sessionId]  superai 会话 id；同一会话跨轮次复用同一 dsh
 *   session，由 dsh 自行维护多轮上下文（不重复发送 history）
 * @param {string} opts.dshHome      dsh 状态目录（DSH_HOME，持久化 session 日志）
 * @param {string} opts.patchFile    provider patch YAML 路径（dsh-patch.writePatch 产出）
 * @param {(event:object)=>void} opts.onEvent  superai IPC 事件回调
 * @param {string} [opts.nodeBin]    打包态：resources 里的 bundled node 可执行文件
 * @param {string} [opts.dshBin]     打包态：resources 里的 dsh 入口
 * @returns {Promise<{text:string, steps:number}>}
 */
async function doRun({ model, workspace, input, sessionId, dshHome, patchFile, onEvent, nodeBin: nodeOverride, dshBin: dshOverride }) {
  if (!patchFile) {
    throw new Error('dsh provider patch 未生成：请先在设置中添加至少一个模型');
  }
  const dshBin = resolveDshBin(dshOverride);
  const nodeBin = resolveNodeBin(nodeOverride);

  // dsh session id 与 superai 会话一一对应：跨轮次复用即保留上下文
  const dshSessionId = sessionId ? 'superai-' + sessionId : 'superai-' + randomUUID().replace(/-/g, '');
  const runKey = sessionId || 'anon-' + randomUUID().replace(/-/g, '');

  // 运行态注册前移到 acquire 之前：冷启动 initialize（首轮 8-9s）期间点「停止」
  // 也必须生效——否则取消打空、runtime 变孤儿继续跑完整个回合。
  let userCancelled = false;
  let idleReject = null;
  const entry = {
    get child() { return resident ? resident.child : null; },
    cancel: () => {
      userCancelled = true;
      killResident();   // acquire 中（child 已 spawn）或已 acquire 都能杀
      if (idleReject) idleReject(new RunCancelledError());
    },
  };
  activeRuns.set(runKey, entry);

  // 常驻 runtime：initialize 的 8-9s 只在首次（或参数变更重启）时支付
  let rt;
  try {
    rt = await acquireResident(model, workspace, dshHome, patchFile, nodeBin, dshBin);
  } catch (err) {
    activeRuns.delete(runKey);
    if (userCancelled || err instanceof RunCancelledError) {
      onEvent({ type: 'cancelled' });
      throw new RunCancelledError();
    }
    onEvent({ type: 'error', message: err.message });
    throw err;
  }
  // 取消发生在 acquire 期间：kill 已由 entry.cancel 执行，这里补抛取消
  if (userCancelled) {
    activeRuns.delete(runKey);
    killResident();
    onEvent({ type: 'cancelled' });
    throw new RunCancelledError();
  }
  const child = rt.child;
  const transport = rt.transport;

  // ---- 通知循环：session.event → IPC 事件；session.status idle → 结束 ----
  // 常驻 runtime 的通知走 holder 路由：本回合的 handler 挂在 holder.currentRun，
  // 回合结束（finally）摘除，回合间的迟到通知被忽略。
  const tRun0 = Date.now();
  let firstEventAt = 0;
  let lastActivityAt = tRun0;
  let stepCount = 0;
  const callIndex = new Map();   // callId → {index, name, label, startedAt, args}
  let finalText = '';
  let idleResolve = null;
  const idlePromise = new Promise((resolve, reject) => { idleResolve = resolve; idleReject = reject; });
  // 取消可能发生在 run() 还没 await 到 idlePromise 时（session/prompt 回合结束才返回），
  // 提前挂一个空 catch 防止 unhandled rejection 崩进程；await 处仍会正常收到拒绝。
  idlePromise.catch(() => { /* 由 await 处处理 */ });

  // 运行时崩溃/退出兜底：dsh rc.3 若异常退出（OOM / 模型 API 致命错误 / 被外部杀死），
  // 进程退出后不会发 session.status=idle，原逻辑里 await idlePromise 会永久挂起 →
  // 表现为「思考中突然断了、什么也没返回、且后续对话全部卡死（runChain 被这条挂起的
  // Promise 堵死）」。这里显式监听 transport 关闭：runtime 一退出立即以错误结束本轮，
  // 把崩溃原因（含 stderr tail）透传给前端，而不是静默挂死。
  transport.onClose = () => {
    if (idleReject) idleReject(new TransportClosedError('会话运行时（dsh 子进程）已退出，连接中断，本轮未收到完成信号。'));
  };
  // 静默挂死兜底：即便 transport 未真正关闭、但 dsh 中途停止发出任何事件（卡住），
  // 超过阈值（默认 5 分钟）无任何活动也强制以超时结束本轮，避免永久卡在「思考中」。
  const WATCHDOG_MS = 5 * 60 * 1000;
  const watchdogId = setInterval(() => {
    if (idleReject && Date.now() - lastActivityAt > WATCHDOG_MS) {
      idleReject(new Error(`会话响应超时：已 ${Math.round(WATCHDOG_MS / 60000)} 分钟未收到任何事件，可能是模型服务或会话运行时卡住/退出。`));
    }
  }, 15000);
  // 阶段透传：让前端按 dsh 真实事件判断「创建会话环境 / 等待模型 / 思考中 / 整理结果」，
  // 而不是靠固定定时器猜测（固定 12s 会把冷启动误标成“等待模型响应”）。
  let firstModelSeen = false;   // 是否已收到首个模型/工具事件（据此切“思考中”）
  let finalizingSent = false;   // 是否已发“正在整理结果”
  const emitPhase = (p) => onEvent({ type: 'phase', phase: p });
  // 文件探测：dsh rc.3 不稳定发送 tool/result，靠 tool/call + 回合结束目录 diff 双重兜底。
  const emittedFiles = new Set();   // 已发过 file 事件的绝对路径（去重）
  const emitFileEvent = (absPath, action) => {
    if (!absPath || emittedFiles.has(absPath)) return;
    emittedFiles.add(absPath);
    onEvent({ type: 'file', name: path.basename(absPath), path: absPath, action });
  };
  // 回合开始即拍一次目录快照，结束时再拍一次 diff，反查本次新生成/修改的文件
  let wsSnapshot;
  try { wsSnapshot = await snapshotWorkspace(workspace); } catch { wsSnapshot = new Map(); }

  rt.holder.currentRun = (method, params) => {
    if (method === 'session.event' && params.sessionId === dshSessionId) {
      const event = params.event || {};
      const data = event.data || {};
      lastActivityAt = Date.now();
      // 首事件指标：数任意 session 事件（tool/call 也算），而非只数 assistant/message。
      // 原实现只数 assistant/message，导致多步工具回合（如 dashi-ppt 跑 50 步）
      // 日志显示“首事件=5.77分钟”——其实工具一直在跑，只是最终文本最后才到，
      // 指标严重误导诊断。
      if (!firstEventAt) { firstEventAt = Date.now(); if (TRACE) trace('首个 session 事件', tRun0); }
      if (TRACE) trace(`event ${event.type}`, tRun0);
      // 首个 session 事件说明 runtime 已完成初始化并开始处理本回合。
      // 由 UI 自己根据 assistant/tool 事件切换“思考中”。
      switch (event.type) {
        case 'assistant/message': {
          // 快照语义：每个 step 产出一条「该时刻的完整消息」。
          // 必须按全量转发 + 前端替换；按增量转发会把多个快照拼接成重复文本。
          const text = textOfMessage(data.message);
          if (text) {
            finalText = text; // 最后一条即最终回复
            if (!firstModelSeen) { firstModelSeen = true; emitPhase('thinking'); }
            onEvent({ type: 'text', text });
          }
          break;
        }
        case 'tool/call': {
          if (!firstModelSeen) { firstModelSeen = true; emitPhase('thinking'); }
          stepCount += 1;
          const callLabel = `dsh·${data.name || '工具'}(${argsDigest(data.arguments)})`;
          if (data.callId) callIndex.set(data.callId, { index: stepCount, name: data.name || '工具', label: callLabel, startedAt: Date.now(), args: data.arguments });
          onEvent({
            type: 'step',
            status: 'running',
            label: callLabel,
            index: stepCount,
          });
          break;
        }
        case 'tool/result': {
          // tool result message 的关联字段：toolCallId（或 source.callId）
          const m = data.message || {};
          const callId = m.toolCallId || (m.source && m.source.callId);
          const hit = callIndex.get(callId);
          const idx = hit ? hit.index : stepCount;
          const name = hit ? hit.name : '工具';
          const isError = !!(m.isError) || !!data.error;
          // 真实耗时：tool/call 收到时刻 → tool/result 收到时刻
          const duration = hit && hit.startedAt
            ? ((Date.now() - hit.startedAt) / 1000).toFixed(1) + 's'
            : undefined;
          // 工具输出文本：成功也发出去（截断），前端步骤卡可点击展开查看。
          // 原实现只把 error 字段发给报错情况，成功调用零输出 → 用户看不到脚本结果。
          const outText = textOfToolResult(data.message) || '';
          onEvent({
            type: 'step',
            status: isError ? 'error' : 'done',
            label: hit ? hit.label : `dsh·${name}`,
            index: idx,
            duration,
            error: isError ? (outText || '工具执行失败').slice(0, 200) : undefined,
            result: outText ? outText.slice(0, 800) : undefined,
          });
          break;
        }
        case 'turn/end':
          // dsh 已完成当前 turn 的工具阶段，模型正在生成最终答复。
          // 透传“正在整理结果”，避免工具跑完后界面仍笼统显示“等待模型响应”。
          if (firstModelSeen && !finalizingSent) { finalizingSent = true; emitPhase('finalizing'); }
          break;
        case 'step/start':
        case 'step/end':
        case 'agent/inbox/spliced':
        case 'system/message':
        default:
          break; // 协议噪声 / 已有更具体的事件覆盖
      }
      return;
    }
    if (method === 'session.status' && params.sessionId === dshSessionId) {
      lastActivityAt = Date.now();
      if (params.status === 'idle') idleResolve();
      return;
    }
    if (method === 'agent/error') {
      onEvent({ type: 'error', message: String(params && params.message || 'dsh agent 内部错误') });
    }
  };

  try {
    // 1) 握手已在 acquireResident 中完成（initialize 是常驻的，只做一次）
    const tRun = tRun0;

    // 2) 恢复或创建 session
    // rc.3 语义：session/prompt 对「store 里已存在但本 runtime 未打开」的
    // session 报 already exists——跨轮次复用必须先 session/resume 从持久化
    // store 恢复；首次会话 resume 失败可忽略（prompt 会自动创建）。
    try {
      await transport.request('session/resume', { sessionId: dshSessionId });
      trace('resume', tRun);
    } catch (err) {
      // 首次会话：store 中无此 session，下面 prompt 时自动创建
      trace(`resume 失败（${err.message.slice(0, 120)}）`, tRun);
    }

    // 2.5) 强制对齐工作目录。
    // dsh 的 WorkingDirectoryService 把 session 的 cwd 持久化在 session store
    // （workingDirectory 投影，init 自 header.cwd），resume 后 ensure() 直接
    // 返回旧值——spawn 的 cwd 只对首次创建生效。用户切换工作目录后必须显式
    // set，否则 AI 仍在旧目录里读写文件。
    try {
      await transport.request('session/working-directory/set', {
        sessionId: dshSessionId,
        path: workspace,
      });
      trace('working-directory/set', tRun);
    } catch (err) {
      // 目录不存在等场景：保留旧 cwd 并告警（prompt 仍可继续）
      console.warn('[dsh-client] working-directory/set 失败（将继续使用旧目录）:', err.message);
    }

    // 3) 发 prompt（contentBlocks 与 SDK 客户端一致的 text block 数组）
    await transport.request('session/prompt', {
      sessionId: dshSessionId,
      contentBlocks: [{ type: 'text', text: input }],
    });
    trace('prompt 已接受', tRun);
    // 会话环境已就绪、prompt 已入队：进入“等待模型响应”（由真实事件驱动，不靠定时器）
    // phase 取值须与前端 AgentEvent.phase 枚举对齐（preparing|waiting|thinking|finalizing），
    // 原发 'waiting_model' 前端无匹配分支，会落进默认的“思考中”。
    emitPhase('waiting');

    // 4) 等本回合 idle（或用户取消）。dsh 没有 wire cancel，不能因为模型慢就自行中断。
    // 但如果 runtime 在工具/模型处理期间确实退出，transport 会拒绝请求并进入 catch。
    await idlePromise;
    trace('idle（回合结束）', tRun);
    // 宽限窗口：dsh 偶发在 idle 之后才把最后一条 assistant 快照 flush 出来；
    // 若直接发 done，会丢掉最终文本，表现为「答到一半断了」。极短等待即可避免截断。
    await new Promise((r) => setTimeout(r, 350));
    if (TRACE) trace(`finalText 长度=${finalText.length}`, tRun);
    // 反查本次运行新生成/修改的文件：dsh 不稳定发送 tool/result，目录 diff 是最可靠兜底，
    // 保证「生成文档后右侧栏自动展开并展示文件」一定发生（不再依赖缺失的 tool/result）。
    try {
      const after = await snapshotWorkspace(workspace);
      const artifactFiles = [];
      for (const [rel, mtime] of after) {
        const before = wsSnapshot.get(rel);
        if (before === undefined || mtime > before + 100) {
          const absPath = path.resolve(workspace, rel);
          const action = before === undefined ? '生成' : '编辑';
          emitFileEvent(absPath, action);
          artifactFiles.push({ name: path.basename(absPath), path: absPath, action });
        }
      }
      // 目录扫描发现的脚本产物不一定对应 dsh 的 file/tool 事件；单独发送
      // 本轮成果清单，让前端可以在回合收尾时按主产物优先级补开 PPTX/HTML/MD。
      if (artifactFiles.length > 0) onEvent({ type: 'artifacts', files: artifactFiles });
    } catch (err) {
      if (TRACE) console.log('[dsh-client] 目录 diff 失败:', err.message);
    }
    // 空回合告警：idle 了但既无文本也无工具调用，几乎一定是模型 API 空响应/超时
    // 或 runtime 状态异常（实测首轮“你好”80s 后空 idle + runtime 崩溃）。superai 侧
    // 原本静默存一条空 agent 消息，用户只看到空回复。这里打 warn 便于定位。
    if (!finalText && stepCount === 0) {
      console.warn(`[dsh] 回合异常结束：无文本、无工具调用，总耗时 ${Date.now() - tRun0}ms。可能是模型 API 空响应/超时或 runtime 状态异常。`);
    }
    onEvent({ type: 'done', text: finalText, steps: stepCount });
    // 每回合一行诊断日志（无需 TRACE）：总耗时 + 首事件延迟 + 步数。
    // 首事件延迟若远大于 0，说明模型首 token 慢（网络/服务端）；若总耗时大但首事件快，
    // 说明是工具/模型生成阶段长。区分冷启动 vs 事件风暴看 acquireResident 的日志。
    console.log(`[dsh] 回合结束: 总耗时 ${Date.now() - tRun0}ms, steps=${stepCount}, 首事件=${firstEventAt ? (firstEventAt - tRun0) + 'ms' : '无'}；文本=${finalText.length}字`);
    return { text: finalText, steps: stepCount };
  } catch (err) {
    // 用户取消优先于一切下游错误（强杀导致的 TransportClosed 等）：
    // 统一抛 RunCancelledError，主进程据此返回 {error:'已停止'}
    if (userCancelled || err instanceof RunCancelledError) {
      onEvent({ type: 'cancelled' });
      throw new RunCancelledError();
    }
    onEvent({ type: 'error', message: err.message });
    throw err;
  } finally {
    activeRuns.delete(runKey);
    // 清理本轮的兜底：看门狗定时器 + transport 关闭回调，避免泄漏到下一轮。
    if (watchdogId) clearInterval(watchdogId);
    if (rt && rt.transport) rt.transport.onClose = null;
    // 常驻 runtime 不随回合关闭：摘除本回合的通知路由、刷新空闲计时，
    // 由空闲回收器（10 分钟）或退出钩子统一管理生命周期。
    rt.holder.currentRun = null;
    rt.lastUsedAt = Date.now();
    // runtime 在本回合中崩溃（被外部杀死 / OOM 等）→ 摘掉单例，下回合重新 spawn
    if (rt.transport.closed && resident === rt) resident = null;
  }
}

/**
 * 串行执行入口：常驻 runtime 同时只服务一个回合。
 * （UI 层已有 running 态防并发，这里是主进程侧的防御。）
 */
function run(opts) {
  const exec = () => doRun(opts);
  const p = runChain.then(exec, exec);
  runChain = p.catch(() => {});
  return p;
}

/**
 * 中断指定会话正在进行的一轮运行（UI「停止」按钮）。
 * @param {string} sessionId superai 会话 id（与 run() 的 opts.sessionId 一致）
 * @returns {boolean} 是否找到了活动运行并已触发中断
 */
function cancel(sessionId) {
  const entry = activeRuns.get(sessionId);
  if (!entry) return false;
  entry.cancel();
  return true;
}

/**
 * 插话：回合运行中向 agent 注入一条用户消息。
 * dsh 的 session/prompt 走 agent.followup()——消息 splice 进运行中 agent 的
 * inbox，在步骤间隙被拾取，引导当前回合（相当于"顺便说一下，注意 X"），
 * 不打断、不终止。这正是 WorkBuddy 的 steering 语义。
 * @param {string} sessionId superai 会话 id
 * @param {string} text 插话内容
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function steer(sessionId, text) {
  if (!text || !text.trim()) return { ok: false, error: '插话内容为空' };
  if (!activeRuns.has(sessionId) || !resident) {
    return { ok: false, error: '没有正在运行的任务' };
  }
  const dshSessionId = 'superai-' + sessionId;
  try {
    await resident.transport.request('session/prompt', {
      sessionId: dshSessionId,
      contentBlocks: [{ type: 'text', text }],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 强杀全部活动 runtime（应用退出前调用）。
 * Electron 不会向 spawn 的子进程传播退出信号，不清理会留下孤儿 node.exe
 * 长期占用 dsh session store。只 kill 不 await——进程马上要退了。
 * 常驻 runtime 也在击杀范围内。
 * @returns {number} 杀掉的 runtime 数量
 */
function cancelAll() {
  let killed = 0;
  for (const entry of activeRuns.values()) {
    const child = entry.child;
    if (!child) continue;
    try {
      child.kill('SIGKILL');
      killed++;
    } catch { /* 已退出 */ }
  }
  if (resident) {
    killResident();
    killed++;
  }
  return killed;
}

/**
 * 预热常驻 runtime（应用启动 / 模型就绪后调用，非阻塞）。
 * 把 8-9s 的 initialize 冷启动从「用户发第一条消息时」挪到「应用打开时」，
 * 这样平时发消息无需再等初始化。若已常驻或正在初始化则直接复用，不会重复 spawn。
 * 失败时静默吞掉（例如尚未配置模型、模型 key 非法），不影响启动。
 */
async function warmResident(model, workspace, dshHome, patchFile, nodeBin, dshBin) {
  if (!model || !patchFile) return;
  try {
    await acquireResident(model, workspace, dshHome, patchFile, nodeBin, dshBin);
    console.log('[dsh-client] 常驻 runtime 预热完成');
  } catch (err) {
    console.warn('[dsh-client] 常驻 runtime 预热跳过:', err.message);
  }
}

module.exports = { run, doRun, cancel, cancelAll, steer, shutdownResident, warmResident, resolveNodeBin, resolveDshBin, LineTransport, TransportClosedError, RunCancelledError };
