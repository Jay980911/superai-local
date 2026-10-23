// preload.cjs — 安全 IPC 桥，暴露给渲染进程
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bench', {
  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  getPresets: () => ipcRenderer.invoke('settings:presets'),

  // Agent
  runAgent: (input, history) => ipcRenderer.invoke('agent:run', input, history),
  onAgentEvent: (cb) => ipcRenderer.on('agent:event', (_e, event) => cb(event)),

  // 文件
  listFiles: (dir) => ipcRenderer.invoke('files:list', dir),
  readFile: (p) => ipcRenderer.invoke('files:read', p),
  writeFile: (p, content) => ipcRenderer.invoke('files:write', p, content),

  // 对话框
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  openExternal: (url) => ipcRenderer.invoke('preview:open', url),

  // 平台信息
  platform: process.platform,
});
