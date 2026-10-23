// main.cjs — Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
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
    title: 'SuperAI',
    backgroundColor: '#f8f6f1',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#333333', height: 32 },
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

  // ===== 快捷键拦截（无应用菜单时用 before-input-event）=====
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (ctrl && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
    } else if (ctrl && input.key.toLowerCase() === 'r') {
      win.webContents.reload();
    }
  });
}

// ===== 菜单模板（popup 弹出式，不常驻）=====
function menuTemplate(name) {
  const isMac = process.platform === 'darwin';
  if (name === '编辑') return [
    { role: 'undo', label: '撤销' },
    { role: 'redo', label: '重做' },
    { type: 'separator' },
    { role: 'cut', label: '剪切' },
    { role: 'copy', label: '复制' },
    { role: 'paste', label: '粘贴' },
    { role: 'selectAll', label: '全选' },
  ];
  if (name === '窗口') return [
    { role: 'minimize', label: '最小化' },
    { role: 'zoom', label: '缩放' },
    ...(isMac ? [{ type: 'separator' }, { role: 'front', label: '前置全部窗口' }] : [{ role: 'close', label: '关闭窗口' }]),
  ];
  if (name === '帮助') return [
    { label: '关于 SuperAI', click: () => win && !win.isDestroyed() && win.webContents.send('menu:about') },
    { label: '设置…', click: () => win && !win.isDestroyed() && win.webContents.send('menu:settings') },
    { type: 'separator' },
    { label: '切换开发者工具', accelerator: 'Ctrl+Shift+I', click: () => win && !win.isDestroyed() && win.webContents.toggleDevTools() },
    { label: '重新加载窗口', accelerator: 'Ctrl+R', click: () => win && !win.isDestroyed() && win.webContents.reload() },
    { type: 'separator' },
    { label: '打开仓库', click: () => shell.openExternal('https://github.com/Jay980911/superai-local') },
  ];
  return [];
}

app.whenReady().then(() => {
  // 不常驻菜单栏（菜单按钮在 HTML 标题栏里，点击 popup 弹出）
  Menu.setApplicationMenu(null);
  createWindow();
});

// ===== IPC: 菜单 popup =====
ipcMain.on('menu:popup', (_e, name) => {
  if (!win || win.isDestroyed()) return;
  Menu.buildFromTemplate(menuTemplate(name)).popup(win);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (win === null) createWindow(); });

// ===== IPC: 设置 =====
ipcMain.handle('settings:get', () => settings.load());
ipcMain.handle('settings:save', (_e, patch) => settings.save(patch));
ipcMain.handle('settings:presets', () => settings.getPresets());
ipcMain.handle('settings:defaultWorkspace', () => settings.defaultWorkspace());

// 模型管理（增删改查 + 切换）
ipcMain.handle('models:add', (_e, model) => settings.addModel(model));
ipcMain.handle('models:remove', (_e, id) => settings.removeModel(id));
ipcMain.handle('models:setCurrent', (_e, id) => settings.setCurrentModel(id));
ipcMain.handle('models:update', (_e, id, patch) => settings.updateModel(id, patch));

// ===== IPC: Agent 运行（流式） =====
ipcMain.handle('agent:run', async (e, input, history, workspace) => {
  const model = settings.getCurrentModel();
  if (!model) {
    return { error: '请先在设置中选择 AI 模型' };
  }
  if (model.apiType !== 'ollama' && !model.apiKey) {
    return { error: '请先在设置中填写该模型的 API Key' };
  }
  const ws = workspace || settings.defaultWorkspace();
  const cfg = {
    provider: model.apiType,
    apiKey: model.apiKey,
    baseUrl: model.baseUrl,
    model: model.model,
    workspace: ws,
    autoExec: settings.load().autoExec,
  };
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

ipcMain.handle('files:list', (_e, dir, workspace) => {
  const ws = workspace || settings.defaultWorkspace();
  return tools.execute('list_files', { dir }, ws);
});

ipcMain.handle('files:read', (_e, p, workspace) => {
  const ws = workspace || settings.defaultWorkspace();
  return tools.execute('read_file', { path: p }, ws);
});

ipcMain.handle('files:write', (_e, p, content, workspace) => {
  const ws = workspace || settings.defaultWorkspace();
  return tools.execute('write_file', { path: p, content }, ws);
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

// ===== IPC: 会话持久化 =====
const sessions = require('./sessions.cjs');
ipcMain.handle('sessions:list', () => sessions.grouped());
ipcMain.handle('sessions:get', (_e, id) => sessions.get(id));
ipcMain.handle('sessions:create', (_e, workspace) => sessions.create(workspace));
ipcMain.handle('sessions:append', (_e, id, msg) => sessions.appendMessage(id, msg));
ipcMain.handle('sessions:rename', (_e, id, title) => sessions.rename(id, title));
ipcMain.handle('sessions:delete', (_e, id) => { sessions.remove(id); return true; });

// ===== IPC: 长期记忆 =====
const memory = require('./memory.cjs');
ipcMain.handle('memory:text', () => memory.getMemoryText());
ipcMain.handle('memory:list', () => memory.listFacts());
ipcMain.handle('memory:save', (_e, content, tags) => memory.saveMemory(content, tags));
ipcMain.handle('memory:search', (_e, query) => memory.searchMemory(query));
ipcMain.handle('memory:delete', (_e, id) => memory.deleteFact(id));
ipcMain.handle('memory:clear', () => memory.clearAll());

// ===== IPC: 技能扫描 =====
const skills = require('./skills.cjs');
ipcMain.handle('skills:list', () => skills.listSkills());
ipcMain.handle('skills:read', (_e, name) => skills.readSkill(name));

// ===== IPC: 会话工作目录 =====
ipcMain.handle('sessions:setWorkspace', (_e, id, workspace) => sessions.setWorkspace(id, workspace));
