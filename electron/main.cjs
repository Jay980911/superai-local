// main.cjs — Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./settings.cjs');
const { run } = require('./agent.cjs');
const { listFiles, readFile, writeFile } = (() => {
  // 复用 tools.cjs 里的纯函数（不暴露 schema）
  const t = require('./tools.cjs');
  // tools.cjs 的函数需要 workspace 参数，这里包装
  return {};
})();

const isDev = process.env.BENCH_DEV === '1';

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '案台 BENCH',
    backgroundColor: '#f8f6f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5174');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', 'bench-app', 'dist', 'index.html'));
  }

  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (win === null) createWindow(); });

// ===== IPC: 设置 =====
ipcMain.handle('settings:get', () => settings.load());
ipcMain.handle('settings:save', (_e, patch) => settings.save(patch));
ipcMain.handle('settings:presets', () => settings.getPresets());

// ===== IPC: Agent 运行（流式） =====
ipcMain.handle('agent:run', async (e, input, history) => {
  const cfg = settings.load();
  if (!cfg.provider || !cfg.model) {
    return { error: '请先在设置中选择 AI 提供商和模型' };
  }
  if (!cfg.workspace) {
    return { error: '请先选择工作目录' };
  }
  try {
    await run(input, history || [], cfg, (event) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('agent:event', event);
      }
    });
    return { ok: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ===== IPC: 文件操作 =====
const tools = require('./tools.cjs');

ipcMain.handle('files:list', (_e, dir) => {
  const cfg = settings.load();
  return tools.execute('list_files', { dir }, cfg.workspace);
});

ipcMain.handle('files:read', (_e, p) => {
  const cfg = settings.load();
  return tools.execute('read_file', { path: p }, cfg.workspace);
});

ipcMain.handle('files:write', (_e, p, content) => {
  const cfg = settings.load();
  return tools.execute('write_file', { path: p, content }, cfg.workspace);
});

// ===== IPC: 对话框 =====
ipcMain.handle('dialog:pickDirectory', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: '选择工作目录',
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

// ===== IPC: 预览/打开外部 =====
ipcMain.handle('preview:open', (_e, url) => {
  shell.openExternal(url);
});
