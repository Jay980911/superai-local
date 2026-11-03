// preload.cjs — 安全 IPC 桥，暴露给渲染进程
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Agent 事件 / 菜单事件：单订阅语义。
// 原实现每次 onAgentEvent/onMenu 都用 ipcRenderer.on 新挂一个 listener，
// 每发一条消息就叠加一个回调——第 N 条消息时每个 agent:event 触发 N 次
// 回调 → N× setState + N× Markdown 全量重解析 = “越聊越慢”的根因。
// 改为：ipcRenderer 监听器只注册一次，回调指针可替换。
let _agentEventCb = null;
let _menuCb = null;
ipcRenderer.on('agent:event', (_e, event) => {
  if (typeof _agentEventCb === 'function') {
    try { _agentEventCb(event); } catch { /* 渲染进程回调异常不应影响后续通知 */ }
  }
});
ipcRenderer.on('menu:settings', () => {
  if (typeof _menuCb === 'function') { try { _menuCb('settings'); } catch {} }
});
ipcRenderer.on('menu:about', () => {
  if (typeof _menuCb === 'function') { try { _menuCb('about'); } catch {} }
});

contextBridge.exposeInMainWorld('superai', {
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
    test: (cfg) => ipcRenderer.invoke('models:test', cfg),
    get: (id) => ipcRenderer.invoke('models:get', id),
  },

  // 图像生成模型测试（独立协议，不复用 models:test）
  image: {
    test: (cfg) => ipcRenderer.invoke('image:test', cfg),
  },

  // Agent
  runAgent: (input, history, workspace, sessionId) => ipcRenderer.invoke('agent:run', input, history, workspace, sessionId),
  cancelAgent: (sessionId) => ipcRenderer.invoke('agent:cancel', sessionId),
  steerAgent: (sessionId, text) => ipcRenderer.invoke('agent:steer', sessionId, text),
  onAgentEvent: (cb) => { _agentEventCb = cb; },  // 单订阅：后注册者覆盖前者

  // 文件
  listFiles: (dir, workspace) => ipcRenderer.invoke('files:list', dir, workspace),
  readFile: (p, workspace) => ipcRenderer.invoke('files:read', p, workspace),
  writeFile: (p, content, workspace) => ipcRenderer.invoke('files:write', p, content, workspace),
  openSystem: (p, workspace) => ipcRenderer.invoke('files:openSystem', p, workspace),
  saveAs: (p, workspace) => ipcRenderer.invoke('files:saveAs', p, workspace),
  convertPptx: (p, workspace) => ipcRenderer.invoke('files:convertPptx', p, workspace),
  readArrayBuffer: (p, workspace) => ipcRenderer.invoke('files:readArrayBuffer', p, workspace),

  // 对话框
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles'),
  openExternal: (url) => ipcRenderer.invoke('preview:open', url),

  // 附件读取（用户显式选中，可越出 workspace；主进程限大小 + 二进制检测）
  readAttachment: (p) => ipcRenderer.invoke('attachment:read', p),
  // 附件复制进工作目录（成为工作区内一等文件，agent 可读写、文件树可见）
  copyAttachmentIn: (src, workspace) => ipcRenderer.invoke('attachment:copyIn', src, workspace),

  // 拖拽进来的 File → 磁盘绝对路径（渲染进程拿不到，必须走 webUtils）
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // 菜单事件（原生菜单点击 → 渲染进程）
  onMenu: (cb) => { _menuCb = cb; },  // 单订阅：覆盖前者，避免 StrictMode 双注册

  // 弹出原生菜单（标题栏菜单按钮点击）
  menuPopup: (name) => ipcRenderer.send('menu:popup', name),

  // 平台信息
  platform: process.platform,

  // 会话持久化
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    get: (id) => ipcRenderer.invoke('sessions:get', id),
    create: (workspace, id) => ipcRenderer.invoke('sessions:create', workspace, id),
    append: (id, msg) => ipcRenderer.invoke('sessions:append', id, msg),
    rename: (id, title) => ipcRenderer.invoke('sessions:rename', id, title),
    delete: (id) => ipcRenderer.invoke('sessions:delete', id),
    togglePin: (id) => ipcRenderer.invoke('sessions:togglePin', id),
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
    dir: () => ipcRenderer.invoke('skills:dir'),
  },

  // dsh 插件管理
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    install: (spec, registry) => ipcRenderer.invoke('plugins:install', spec, registry),
    remove: (name) => ipcRenderer.invoke('plugins:remove', name),
    setEnabled: (name, enabled) => ipcRenderer.invoke('plugins:setEnabled', name, enabled),
  },

  // 云端 API 代理（绕过渲染进程 mixed content 限制，走主进程 fetch）
  cloud: {
    api: (path, init) => ipcRenderer.invoke('cloud:api', path, init),
    model: {
      // 把云端 selected(含 apiKey)+列表同步给主进程，agent:run 用云端模型发 LLM；
      // 第三个参数 imageCredentials：云端图像模型明文凭证，主进程写入 settings.imageModel
      sync: (credentials, models, imageCredentials, accountId) => ipcRenderer.invoke('cloud:model:sync', credentials, models, imageCredentials, accountId),
    },
  },
});
