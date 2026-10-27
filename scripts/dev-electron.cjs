// dev-electron.cjs — 以真正的 Electron 模式启动主进程，并在 electron/ 下
// 文件变更时自动重启主进程（对齐 Vite HMR 体验）。
//
// 背景：部分宿主环境（IDE / Agent 沙箱）会注入 ELECTRON_RUN_AS_NODE=1，
// 此时 electron 可执行文件退化为纯 Node 运行：require('electron') 只返回
// 可执行文件路径字符串，拿不到 app/BrowserWindow，主进程直接崩溃。
// 本脚本在启动子进程前删除该变量，保证 Electron 以 GUI 模式运行。
//
// 另注：RUN_AS_NODE 下或普通 Node 下，require('electron') 均返回
// node_modules/electron 的可执行文件路径，可直接用于 spawn。
//
// 重启策略：preload / main / tools 等 *.cjs 改动后，旧主进程的
// contextBridge 仍是旧 API（如新加的 window.superai.xxx 不会生效）。
// 监听 electron/ 与 scripts/ 下 *.cjs 变化，debounce 后重启子进程。

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

delete process.env.ELECTRON_RUN_AS_NODE;

const electronBin = require('electron');
const mainPath = path.join(__dirname, '..', 'electron', 'main.cjs');

const watchRoots = [
  path.join(__dirname, '..', 'electron'),
  path.join(__dirname, '..', 'scripts'),
];

let child = null;
let restartTimer = null;
let restarting = false;

function launch() {
  console.log(`\n[dev-electron] launching: ${electronBin} ${mainPath}`);
  child = spawn(electronBin, [mainPath], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    // 主动重启导致退出：不结束父进程，继续等新进程
    if (restarting) {
      restarting = false;
      return;
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

function restart(reason) {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    restarting = true;
    console.log(`\n[dev-electron] ${reason} → restarting main process...`);
    if (child) {
      try { child.kill(); } catch { /* ignore */ }
    }
    // 稍等释放，再启动新进程
    setTimeout(() => {
      launch();
    }, 200);
  }, 300);
}

function startWatching() {
  for (const root of watchRoots) {
    if (!fs.existsSync(root)) continue;
    // Windows 支持递归 watch；非 Windows 退化为只 watch 顶层目录（够用）
    try {
      fs.watch(root, { recursive: true }, (_evt, file) => {
        if (!file) return;
        if (!/\.(cjs|js|mjs)$/.test(file)) return;
        // 忽略生成产物与缓存
        if (file.includes('node_modules') || file.endsWith('.tsbuildinfo')) return;
        restart(`change: ${path.basename(root)}/${file}`);
      });
    } catch {
      // 递归不支持：遍历顶层文件单独 watch
      for (const name of fs.readdirSync(root)) {
        const p = path.join(root, name);
        if (!fs.statSync(p).isFile()) continue;
        if (!/\.(cjs|js|mjs)$/.test(name)) continue;
        fs.watch(p, () => restart(`change: ${path.basename(root)}/${name}`));
      }
    }
  }
  console.log('[dev-electron] watching electron/ & scripts/ for auto-restart');
}

launch();
// 延迟启用 watch：避开 fs.watch 注册瞬间对最近变更文件的噪声事件，
// 否则每次冷启动都会无谓重启一次主进程（浪费 dsh 预热）。
setTimeout(startWatching, 1500);
