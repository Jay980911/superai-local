#!/usr/bin/env node
'use strict';
/**
 * superai-local CLI 入口
 * 用法:
 *   命令行模式: superai-local [workdir] [--port 7000] [--token xxx --server xxx]
 *   handshake 模式(无 token): superai-local --port 7000  → 起 http 待命,前端 handshake 驱动
 */
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const os = require('os');
const fs = require('fs');

const Project = require('../src/project');
const Security = require('../src/security');
const Executor = require('../src/executor');
const Preview = require('../src/preview');
const Chat = require('../src/chat');
const HttpServer = require('../src/http');

function parseArgs(argv) {
  const args = { workdir: null, port: 7000, mock: true, token: null, server: null };
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    // superai-local://launch?workdir=...&port=7000 协议唤起
    if (a && a.toLowerCase().startsWith('superai-local://')) {
      const u = parseProtocolUrl(a);
      if (u.workdir) args.workdir = u.workdir;
      if (u.port) args.port = u.port;
      args.launchedByProtocol = true;   // 协议唤起: 不自动弹浏览器(用户已在网页里,前端轮询重连)
      continue;
    }
    if (a === '--port') args.port = parseInt(argv[++i], 10) || 7000;
    else if (a === '--mock') args.mock = true;
    else if (a === '--no-mock') args.mock = false;
    else if (a === '--autostart-install') args.autostartInstall = true;
    else if (a === '--autostart-uninstall') args.autostartUninstall = true;
    else if (a === '--token') args.token = argv[++i];
    else if (a === '--server') args.server = argv[++i];
    else if (a.startsWith('--')) args[a.slice(2)] = argv[++i];
    else rest.push(a);
  }
  if (!args.token) args.token = process.env.SUPERAI_TOKEN || readTokenFile();
  if (!args.server) args.server = process.env.SUPERAI_SERVER || 'http://124.222.130.62:8083';
  return args;
}

function readTokenFile() {
  try {
    const p = path.join(os.homedir(), '.superai', 'token');
    return fs.readFileSync(p, 'utf8').trim();
  } catch (_) { return null; }
}

/** 解析 superai-local://launch?workdir=...&port=... 协议唤起 URL */
function parseProtocolUrl(raw) {
  const out = {};
  try {
    const u = new URL(raw);
    const q = u.searchParams;
    if (q.get('workdir')) out.workdir = q.get('workdir');
    if (q.get('port')) out.port = parseInt(q.get('port'), 10) || 7000;
  } catch (_) {}
  return out;
}

/** 开机自启:写/删 HKCU\...\Run (SAC 允许登录启动签名 node.exe) */
function manageAutostart(install) {
  if (process.platform !== 'win32') return;
  try {
    const { execFileSync } = require('child_process');
    const isNode = /^node(\.exe)?$/i.test(path.basename(process.execPath));
    const exe = process.execPath;
    const cmd = isNode ? `"${exe}" "${__filename}"` : `"${exe}"`;
    const K = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    if (install) {
      execFileSync('reg', ['add', K, '/v', 'SuperAILocal', '/t', 'REG_SZ', '/d', cmd, '/f'], { stdio: 'ignore' });
      console.log('已设置开机自启 (HKCU\\...\\Run\\SuperAILocal)');
    } else {
      execFileSync('reg', ['delete', K, '/v', 'SuperAILocal', '/f'], { stdio: 'ignore' });
      console.log('已取消开机自启');
    }
  } catch (_) {}
}

/** 查开机自启是否已开启 */
function autostartEnabled() {
  if (process.platform !== 'win32') return false;
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'SuperAILocal'], { stdio: ['ignore','pipe','ignore'] }).toString('utf8');
    return /SuperAILocal\s+REG_SZ/.test(out);
  } catch (_) { return false; }
}

/** Windows 启动时自注册 superai-local:// 协议(免安装包也能唤起;写 HKCU 无需管理员)
 *  关键:用 wscript + launcher.vbs 隐藏窗口拉起 node → 协议唤起不弹命令行窗口(否则叉掉=杀进程)
 */
function registerProtocol() {
  if (process.platform !== 'win32') return;
  try {
    const isNode = /^node(\.exe)?$/i.test(path.basename(process.execPath));
    const exe = process.execPath.replace(/"/g, '');
    const cliJs = isNode ? __filename : '';  // pkg: exe 自身即 main, 无需 cli.js 参数
    // launcher.vbs 位置:打包=exe 同级,开发=项目根
    const appRoot = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
    const vbsPath = path.join(appRoot, 'launcher.vbs');
    // VBS: 隐藏窗口(0) 运行 node cli.js <url>,不等待(False)
    // 引号规则: VBS 字符串中 "" = 一个字面 "
    const runCmd = isNode
      ? `"""${exe}"" ""${cliJs}"" """ & WScript.Arguments(0) & """"`
      : `"""${exe}"" """ & WScript.Arguments(0) & """"`;
    const vbs = `Set sh=CreateObject("WScript.Shell")\r\nsh.Run ${runCmd}, 0, False\r\n`;
    fs.writeFileSync(vbsPath, vbs);
    const handler = `wscript.exe "${vbsPath}" "%1"`;
    const K = 'HKCU\\Software\\Classes\\superai-local';
    execFileSync('reg', ['add', K, '/ve', '/d', 'URL:SuperAI Local Protocol', '/f'], { stdio: 'ignore' });
    execFileSync('reg', ['add', K, '/v', 'URL Protocol', '/d', '', '/f'], { stdio: 'ignore' });
    execFileSync('reg', ['add', K + '\\DefaultIcon', '/ve', '/d', exe, '/f'], { stdio: 'ignore' });
    execFileSync('reg', ['add', K + '\\shell\\open\\command', '/ve', '/d', handler, '/f'], { stdio: 'ignore' });
  } catch (_) { /* 注册失败不影响启动 */ }
}

function checkNode() {
  const v = parseInt(process.versions.node.split('.')[0], 10);
  if (v < 18) {
    console.error(`✗ 需要 Node.js >= 18，当前 ${process.versions.node}。请升级：https://nodejs.org/`);
    process.exit(1);
  }
  try { process.title = 'SuperAI Local'; } catch(_) {}  // 任务栏/任务管理器可辨认
}

function openBrowser(url) {
  const plat = process.platform;
  const cmd = plat === 'win32' ? `start "" "${url}"`
    : plat === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  try { spawn(cmd, { shell: true, stdio: 'ignore', detached: true }).unref(); }
  catch (_) {}
}

let runtime = null;       // {project, executor, preview, chat, bridge, security, workdir}
let httpServer = null;    // HttpServer 实例(handshake 可更新引用)

/** handshake 驱动:重新初始化运行时(切 workdir/token/server/conversationId) */
async function initRuntime({ workdir, token, server, conversationId }) {
  // 停旧 runtime
  if (runtime) {
    try { runtime.bridge && runtime.bridge.stop(); } catch (_) {}
    try { await runtime.preview.stop(); } catch (_) {}
    try { await runtime.executor.killAll(); } catch (_) {}
  }
  workdir = path.resolve(workdir);
  if (!fs.existsSync(workdir)) fs.mkdirSync(workdir, { recursive: true });
  workdir = fs.realpathSync(workdir);
  const security = new Security(workdir);
  security.checkDisk();
  const project = new Project(workdir);
  await project.ensure();
  if (conversationId) project.saveConversationId(String(conversationId));
  const executor = new Executor(security, workdir);
  const preview = new Preview(executor, project, security);
  const chat = new Chat({ project, executor, preview, security, mock: false, token, server, clientId: project.clientId, bridge: null });
  let bridge = null;
  if (token && server) {
    const Bridge = require('../src/bridge');
    bridge = new Bridge({ server, token, clientId: project.clientId, project, executor, security, onLog: l => console.log(l) });
    bridge.onPreviewReady = (info) => {
      preview.mode = info.mode; preview.devUrl = info.url;
      try { preview.devPort = parseInt(require('url').parse(info.url).port, 10); } catch (_) {}
      httpServer && httpServer._broadcastSSE('preview_ready', { mode: info.mode, url: info.url });
    };
    bridge.onExecLog = (info) => httpServer && httpServer._broadcastSSE('exec_log', info);
    bridge.onFilesChanged = (info) => { httpServer && httpServer._broadcastSSE('files_changed', info); };
    await bridge.start().catch(e => console.error('[bridge]', e.message));
    chat.bridge = bridge;
  }
  runtime = { project, executor, preview, chat, bridge, security, workdir };
  // 更新 http server 引用
  if (httpServer) {
    httpServer.project = project; httpServer.executor = executor;
    httpServer.preview = preview; httpServer.chat = chat; httpServer.security = security;
  }
  console.log(`[runtime] workdir=${workdir} convId=${conversationId || '-'} bridge=${bridge ? 'on' : 'off'}`);
}

async function main() {
  checkNode();
  registerProtocol();
  const args = parseArgs(process.argv);
  if (args.autostartInstall) { manageAutostart(true); return; }
  if (args.autostartUninstall) { manageAutostart(false); return; }
  // 单实例:若 7000 已有健康 CLI(协议重拉起场景),静默退出,前端轮询会重连
  try {
    const alive = await fetch(`http://localhost:${args.port}/api/ping`).then(r => r.json()).catch(() => null);
    if (alive && alive.ok) {
      console.log(`[single-instance] ${args.port} 已在运行,本次唤起静默退出`);
      process.exit(0);
    }
  } catch(_) {}

  // 初始 workdir:命令行模式用 args.workdir,handshake 模式用临时待命目录
  let workdir = args.workdir
    ? path.resolve(args.workdir)
    : path.join(os.homedir(), 'superai-projects', 'standby-' + Date.now());
  if (!fs.existsSync(workdir)) fs.mkdirSync(workdir, { recursive: true });
  workdir = fs.realpathSync(workdir);

  // 先用初始 workdir 起 http server(待命),handshake 后 reinit 切换
  const security = new Security(workdir);
  security.checkDisk();
  const project = new Project(workdir);
  await project.ensure();
  const executor = new Executor(security, workdir);
  const preview = new Preview(executor, project, security);
  const chat = new Chat({ project, executor, preview, security, mock: args.mock, token: args.token, server: args.server, clientId: project.clientId, bridge: null });
  httpServer = new HttpServer({ port: args.port, project, executor, preview, chat, security });
  httpServer.reinit = initRuntime;
  globalThis.__tray = null;

  // 命令行模式:有 token 直接起 bridge 连服务器
  if (!args.mock && args.token) {
    const Bridge = require('../src/bridge');
    const bridge = new Bridge({
      server: args.server, token: args.token, clientId: project.clientId,
      project, executor, security, onLog: (line) => console.log(line),
    });
    bridge.onPreviewReady = (info) => {
      preview.mode = info.mode; preview.devUrl = info.url;
      try { preview.devPort = parseInt(require('url').parse(info.url).port, 10); } catch (_) {}
      httpServer._broadcastSSE('preview_ready', { mode: info.mode, url: info.url });
    };
    bridge.onExecLog = (info) => httpServer._broadcastSSE('exec_log', info);
    await bridge.start().catch(e => console.error('[bridge] 启动失败:', e.message));
    chat.bridge = bridge;
    runtime = { project, executor, preview, chat, bridge, security, workdir };
  } else {
    runtime = { project, executor, preview, chat, bridge: null, security, workdir };
  }

  process.stderr.write(`[DBG] token=${args.token ? args.token.slice(0, 12) + '...' : 'NULL'} server=${args.server} mode=${args.token ? '联机' : '待命(handshake)'}\n`);

  await httpServer.start();
  const url = `http://localhost:${args.port}`;
  console.log(`\n  SuperAI Local 工作台已启动`);
  console.log(`  工作目录: ${workdir}`);
  console.log(`  工作台:   ${url}`);
  console.log(`  模式:     ${args.token ? '联机(需服务器)' : '待命(handshake 驱动,等前端连接)'}`);
  console.log(`\n  按 Ctrl+C 退出\n`);

  // 系统托盘(PowerShell WinForms,系统签名 powershell.exe → SAC 放行)
  try {
    const Tray = require('../src/tray');
    globalThis.__tray = new Tray({
      onOpen: () => openBrowser(`http://localhost:${args.port}`),
      onAutostart: () => { manageAutostart(!autostartEnabled()); },
      onExit: () => { process.emit('SIGTERM'); },
      onLog: (l) => console.log(l),
    });
    __tray.start();
  } catch (e) { console.error('[tray] 未启用:', e.message); }

  const cleanup = async (sig) => {
    console.log(`\n收到 ${sig}，清理子进程...`);
    try { globalThis.__tray && globalThis.__tray.stop(); } catch (_) {}
    try { runtime.bridge && runtime.bridge.stop(); } catch (_) {}
    try { await runtime.preview.stop(); } catch (_) {}
    try { await runtime.executor.killAll(); } catch (_) {}
    process.exit(0);
  };
  process.on('SIGINT', () => cleanup('SIGINT'));
  process.on('SIGTERM', () => cleanup('SIGTERM'));
  if (process.platform === 'win32') {
    require('readline').createInterface({ input: process.stdin }).on('SIGINT', () => cleanup('SIGINT'));
  }

  // 命令行模式开浏览器;协议唤起/握手模式不开(前端会连)
  if (args.token && !args.launchedByProtocol) openBrowser(url);
}

main().catch(e => {
  console.error('启动失败:', e && e.stack || e);
  process.exit(1);
});
