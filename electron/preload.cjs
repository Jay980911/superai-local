// preload.cjs — 安全 IPC 桥，暴露给渲染进程
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bench', {
  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  getPresets: () => ipcRenderer.invoke('settings:presets'),
  defaultWorkspace: () => ipcRenderer.invoke('settings:defaultWorkspace'),

  // 模型管理
  models: {
    add: (model) => ipcRenderer.invoke('models:add', model),
    remove: (id) => ipcRenderer.invoke('models:remove', id),
    setCurrent: (id) => ipcRenderer.invoke('models:setCurrent', id),
    update: (id, patch) => ipcRenderer.invoke('models:update', id, patch),
  },

  // Agent
  runAgent: (input, history, workspace) => ipcRenderer.invoke('agent:run', input, history, workspace),
  onAgentEvent: (cb) => ipcRenderer.on('agent:event', (_e, event) => cb(event)),

  // 文件
  listFiles: (dir, workspace) => ipcRenderer.invoke('files:list', dir, workspace),
  readFile: (p, workspace) => ipcRenderer.invoke('files:read', p, workspace),
  writeFile: (p, content, workspace) => ipcRenderer.invoke('files:write', p, content, workspace),

  // 对话框
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  openExternal: (url) => ipcRenderer.invoke('preview:open', url),

  // 菜单事件（原生菜单点击 → 渲染进程）
  onMenu: (cb) => {
    ipcRenderer.on('menu:settings', () => cb('settings'));
    ipcRenderer.on('menu:about', () => cb('about'));
  },

  // 弹出原生菜单（标题栏菜单按钮点击）
  menuPopup: (name) => ipcRenderer.send('menu:popup', name),

  // 平台信息
  platform: process.platform,

  // 会话持久化
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (workspace) => ipcRenderer.invoke('sessions:create', workspace),
    append: (id, msg) => ipcRenderer.invoke('sessions:append', id, msg),
    rename: (id, title) => ipcRenderer.invoke('sessions:rename', id, title),
    delete: (id) => ipcRenderer.invoke('sessions:delete', id),
    setWorkspace: (id, ws) => ipcRenderer.invoke('sessions:setWorkspace', id, ws),
  },

  // 长期记忆
  memory: {
    text: () => ipcRenderer.invoke('memory:text'),
    list: () => ipcRenderer.invoke('memory:list'),
    save: (content, tags) => ipcRenderer.invoke('memory:save', content, tags),
    search: (query) => ipcRenderer.invoke('memory:search', query),
    delete: (id) => ipcRenderer.invoke('memory:delete', id),
    clear: () => ipcRenderer.invoke('memory:clear'),
  },

  // 技能扫描
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    read: (name) => ipcRenderer.invoke('skills:read', name),
  },
});
