// main.cjs — Electron 主进程
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const settings = require('./settings.cjs');
const dsh = require('./dsh-client.cjs');
const dshPatch = require('./dsh-patch.cjs');
// 以下几个原本声明在各自 IPC 分区里（靠后），靠 whenReady 异步回调的时序巧合才能
// 访问到。提到顶部与其它 require 合并，避免后续重构把它们的引用挪到同步路径时
// 触发 TDZ ReferenceError。
const tools = require('./tools.cjs');
const sessions = require('./sessions.cjs');
const memory = require('./memory.cjs');
const skills = require('./skills.cjs');
const plugins = require('./plugins.cjs');

const isDev = process.env.SUPERAI_DEV === '1';

let win = null;

// 云端模型镜像供设置缓存与图像模型同步；对话 runtime 始终使用本地 settings.json。
function cloudModelToLocal(c) {
  if (!c || c.id == null) return null;
  return {
    id: String(c.id), cloudId: String(c.id), name: c.name || '',
    baseUrl: String(c.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: c.apiKey || '',
    model: c.modelName || c.model || '',
    api: c.apiType || c.api || 'openai-completions',
    hasKey: c.hasKey !== undefined ? !!c.hasKey : !!c.apiKey,
    isDefault: !!c.isDefault,
    kind: c.kind || 'chat',
  };
}


/** 云端图像模型凭证 → 本地 settings.imageModel 结构 */
function imageCredToLocal(c) {
  if (!c) return null;
  const model = c.modelName || c.model || '';
  const baseUrl = String(c.baseUrl || '').trim().replace(/\/+$/, '');
  if (!model || !baseUrl) return null;
  return { baseUrl, apiKey: c.apiKey || '', model };
}

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
      // 启用 <webview>：右栏 HTML 预览（如生成的 PPT）用 webview 以 file:// 加载，
      // 独立进程 + 自带浏览器能力，不受父 CSP 限制，相对资源（css/js/字体）
      // 按文件目录正确解析。与腾讯 WorkBuddy 内嵌浏览器视图同思路。
      webviewTag: true,
    },
  });

  if (isDev) {
    // 先轮询 Vite 就绪再加载，根除「Electron 比 Vite 早加载→入口模块 null→渲染 bundle 跑不起来→白屏」竞态。
    // 仅靠 did-fail-load 重试不够：HTML 能加载成功（只是模块脚本拿到空），不触发 fail-load。
    const http = require('http');
    let devReady = false;
    const pollVite = () => new Promise((resolve) => {
      const req = http.get('http://localhost:5174/', { timeout: 800 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
    (async () => {
      for (let i = 0; i < 60 && !devReady; i++) {
        devReady = await pollVite();
        if (!devReady) await new Promise(r => setTimeout(r, 300));
      }
      if (win && !win.isDestroyed()) {
        win.loadURL('http://localhost:5174').catch(() => { /* 失败由 did-fail-load 重试兜底 */ });
        win.webContents.openDevTools();
      }
    })();
    // 仍保留 did-fail-load 兜底，防 Vite 临时挂掉
    let devRetries = 0;
    win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (devRetries++ >= 20) {
        console.error('[main] dev server unreachable after 20 retries:', validatedURL);
        return;
      }
      setTimeout(() => {
        if (win && !win.isDestroyed()) win.loadURL('http://localhost:5174').catch(() => {});
      }, 500);
    });
  } else {
    win.loadFile(path.join(__dirname, '..', 'superai-app', 'dist', 'index.html'));
  }

  win.on('closed', () => { win = null; });

  // 新窗口 / 页面导航一律转系统浏览器：markdown 链接带 target="_blank"，
  // 默认行为会在 Electron 里开新渲染窗口加载任意 URL——配合 CSP connect-src
  // 'self'，把外部内容的执行环境彻底挡在渲染进程之外
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const isDevOrigin = url.startsWith('http://localhost:5174') || url.startsWith('http://127.0.0.1:5174');
    const isLocal = url.startsWith('file://');
    if (!isDevOrigin && !isLocal) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // 渲染进程崩溃兜底：留白屏不如自动重载一次（仅 dev/异常场景，正常不会触发）
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] render-process-gone:', JSON.stringify(details), '→ reload');
    if (!win || win.isDestroyed()) return;
    setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.reload(); }, 500);
  });

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

// ===== 预览协议：superai-preview:// =====
// 右栏 HTML 预览（如生成的 PPT）用 iframe 加载该协议，独立 origin、相对资源按
// 文件目录解析，避开易崩的 <webview>，也不受渲染进程 webSecurity 限制 file:// 的影响。
// 必须在 app.ready 前注册为 privileged（standard+secure），相对 URL 才能正常解析。
protocol.registerSchemesAsPrivileged([
  { scheme: 'superai-preview', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

function previewMime(p) {
  const ext = (p.split('.').pop() || '').toLowerCase();
  return ({
    html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript',
    css: 'text/css', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff',
    ttf: 'font/ttf', otf: 'font/otf', json: 'application/json', md: 'text/markdown',
    txt: 'text/plain', csv: 'text/csv', ico: 'image/x-icon',
    pdf: 'application/pdf',
  })[ext] || 'application/octet-stream';
}

// ===== GPU 兼容性 =====
// 部分环境（虚拟机 / 远程桌面 / 沙箱）GPU 进程会以 0xC0000005 崩溃，
// 进而 FATAL「GPU process isn't usable」导致整个应用退出。
// 本应用无重渲染需求，默认禁用硬件加速；确认 GPU 可用时可用 SUPERAI_ENABLE_GPU=1 开启。
if (process.env.SUPERAI_ENABLE_GPU !== '1') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// ===== 渲染进程兼容性（白屏修复）=====
// 部分环境（装有内核级安全软件 / EDR 的系统）Chromium 渲染器在沙箱内启动即
// 0xC0000005 访问冲突崩溃，表现为：窗口创建成功但整页白屏，devtools 无报错，
// 系统浏览器访问同一地址却完全正常。
// 实测（scripts/diag-window.cjs）：baseline 下连 about:blank 都崩；加 no-sandbox 后
// 页面加载 / preload 注入 / React 挂载全部恢复。
// 安全权衡：本应用是本地单用户工作台，只加载自己的 Vite dev server 或打包产物；
// contextIsolation + nodeIntegration:false 已开；markdown 渲染禁用原始 HTML
// （见 ChatStream）；远程页面（preview:open）一律走系统浏览器，不进 Chromium
// 渲染进程，关闭沙箱不扩大攻击面。
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(() => {
  // 不常驻菜单栏（菜单按钮在 HTML 标题栏里，点击 popup 弹出）
  Menu.setApplicationMenu(null);

  // 预览协议处理器：superai-preview://file/<encoded-abs-path> → 读取本地文件返回。
  // iframe 加载该 URL 后，页面里的相对资源（css/js/字体）会按文件目录解析成
  // superai-preview://file/<dir>/<asset>，同样走本处理器读盘返回。
  // 额外：superai-preview://pptist/<path> → 映射到随包分发的 PPTist 编辑器 dist 目录，
  // 供右栏 pptx 预览/编辑嵌入使用（独立 origin，相对资源自动解析回本路由）。
  const pptistDistDir = app.isPackaged
    ? path.join(process.resourcesPath, 'data', 'pptist', 'dist')
    : path.join(__dirname, '..', 'data', 'pptist', 'dist');
  protocol.handle('superai-preview', async (req) => {
    try {
      const u = new URL(req.url);
      // host === 'pptist'：从随包 dist 目录读取
      if (u.host === 'pptist') {
        // pathname 形如 /index.html 或 /assets/xxx.js；防止路径穿越
        const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
        const abs = path.resolve(pptistDistDir, rel);
        if (!abs.startsWith(path.resolve(pptistDistDir))) {
          return new Response('forbidden', { status: 403, headers: { 'Content-Type': 'text/plain' } });
        }
        const buf = fs.readFileSync(abs);
        return new Response(buf, { headers: { 'Content-Type': previewMime(abs) } });
      }
      // host === 'file'：pathname 形如 /E%3A%2Fworkspacetest%2F...%2Findex.html
      const abs = decodeURIComponent(u.pathname.replace(/^\//, ''));
      const buf = fs.readFileSync(abs);
      return new Response(buf, { headers: { 'Content-Type': previewMime(abs) } });
    } catch (e) {
      return new Response('preview load failed: ' + (e && e.message), { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }
  });

  // dev 体验：安装 React DevTools 扩展。
  // 已禁用：REACT_DEVELOPER_TOOLS v8.0.0（Manifest V3）在 Electron 31 下其渲染脚本
  // 跑不起来（console 报 "renderer.bundle.js script failed to run / object null is not iterable"），
  // 属噪声但不排除干扰。需调试 React 时手动在 DevTools 里装，或设 SUPERAI_RDT=1 启用。
  if (isDev && process.env.SUPERAI_RDT === '1') {
    try {
      const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');
      installExtension(REACT_DEVELOPER_TOOLS)
        .then((name) => console.log('[main] devtools extension installed:', name))
        .catch((err) => console.warn('[main] devtools extension skipped:', err.message));
    } catch (err) {
      console.warn('[main] devtools extension unavailable:', err.message);
    }
  }
  const s = require('./settings.cjs');
  console.log(`[SuperAI] data=${s.appDataDir()}  workspace=${s.defaultWorkspace()}`);
  // 注入 image-gen 脚本所需环境变量（dsh 子进程经 ...process.env 继承）
  process.env.SUPERAI_SETTINGS = path.join(s.appDataDir(), 'settings.json');
  process.env.SUPERAI_IMAGEGEN = path.join(__dirname, '..', 'scripts', 'image-gen.mjs');
  // Unsplash 图库 key + 代理（image-gen 图库模式需要访问境外 API）
  const cfg = s.load();
  if (cfg.unsplashKey) process.env.UNSPLASH_ACCESS_KEY = cfg.unsplashKey;
  if (cfg.proxy) {
    process.env.HTTPS_PROXY = cfg.proxy;
    process.env.HTTP_PROXY = cfg.proxy;
    process.env.NODE_USE_ENV_PROXY = '1';
  }
  console.log(`[SuperAI] image-gen env: unsplash=${cfg.unsplashKey ? 'on' : 'off'} proxy=${cfg.proxy || 'off'}`);
  if (app.isPackaged) {
    const runtime = dshRuntimePaths();
    if (runtime) {
      console.log(`[SuperAI] dsh runtime: node=${runtime.nodeBin}`);
      console.log(`[SuperAI] dsh runtime: bin =${runtime.dshBin}`);
    } else {
      console.warn('[SuperAI] dsh runtime 未随包分发（resources/dsh-runtime 缺失），将回退查找 PATH 中的 node');
    }
  }
  createWindow();

  // 预热常驻 dsh runtime：把 8-9s 的 initialize 冷启动挪到应用打开时，
  // 用户发第一条消息时即可复用，无需现场初始化。非阻塞、失败静默。
  try {
    const model = s.getCurrentModel();
    if (model) {
      const dshHome = path.join(s.appDataDir(), 'dsh-home');
      const patchFile = dshPatch.writePatch(dshHome, s.load().models, { skillDirs: [skills.skillsDir()], includeDefaultRoots: !!s.load().scanGlobalSkills });
      const runtime = dshRuntimePaths() || {};
      dsh.warmResident(model, s.defaultWorkspace(), dshHome, patchFile, runtime.nodeBin, runtime.dshBin);
    }
  } catch (err) {
    console.warn('[main] runtime 预热跳过:', err.message);
  }
});

// ===== IPC: 菜单 popup =====
ipcMain.on('menu:popup', (_e, name) => {
  if (!win || win.isDestroyed()) return;
  Menu.buildFromTemplate(menuTemplate(name)).popup(win);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (win === null) createWindow(); });

// 退出前强杀所有 dsh runtime 子进程：Electron 不向 spawn 的子进程传播退出信号，
// 运行中直接关窗会留下孤儿 node.exe 占用 session store
app.on('before-quit', () => {
  // cancelAll 同步强杀活动 runtime + 常驻 runtime；shutdownResident 兜底优雅关闭
  // （cancelAll 之后 resident 已为 null，这里是双保险，不拖慢退出——不 await）
  const killed = dsh.cancelAll();
  if (killed > 0) console.log(`[main] before-quit: killed ${killed} dsh runtime(s)`);
  dsh.shutdownResident();
});

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
ipcMain.handle('models:get', (_e, id) => settings.getModel(id));
ipcMain.handle('models:test', async (_e, cfg) => {
  const { baseUrl, apiKey, model, api } = cfg || {};
  if (!baseUrl) return { ok:false, status:0, detail:'缺少 API 地址' };
  const hdr = (h) => ({ 'Content-Type':'application/json', ...h });
  try {
    let r;
    if (api === 'anthropic-messages') {
      let base = String(baseUrl).replace(/\/+$/, '').replace(/\/v1\/messages$/i, '').replace(/\/messages$/i, '');
      r = await fetch(base + '/v1/messages', { method:'POST', headers: hdr({ 'x-api-key': apiKey||'', 'anthropic-version':'2023-06-01' }), body: JSON.stringify({ model, max_tokens:1, messages:[{role:'user',content:'ping'}] }) });
    } else if (api === 'openai-responses') {
      let base = String(baseUrl).replace(/\/+$/, '').replace(/\/responses$/i, '');
      r = await fetch(base + '/responses', { method:'POST', headers: hdr(apiKey?{'Authorization':'Bearer '+apiKey}:{}), body: JSON.stringify({ model, input:'ping' }) });
    } else {
      let base = String(baseUrl).replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
      r = await fetch(base + '/models', { headers: apiKey?{'Authorization':'Bearer '+apiKey}:{} });
    }
    if (r.ok) return { ok:true, status:r.status, detail:'连接成功' };
    let t=''; try { t=await r.text(); } catch {}
    return { ok:false, status:r.status, detail:`HTTP ${r.status}${t?('：'+t.slice(0,300)):''}` };
  } catch(e) { return { ok:false, status:0, detail:'网络错误：'+(e && e.message || e) }; }
});

// 图像生成模型测试：按 image-gen.mjs 的协议探测逻辑做最小化真实 POST，
// 而不是复用 models:test 的 GET /models（对图像端点是错误端点，必失败）。
// 协议：
//   openai-images: POST {baseUrl}/images/generations   （baseUrl 以 /v1 结尾）
//   chat-images:   POST {baseUrl} 直接发 messages      （baseUrl 带具体模型路由，如腾讯混元 wand）
// 用一个极短 prompt + 最小 size 做探活，仅看 HTTP 状态；不下载图片，省配额。
ipcMain.handle('image:test', async (_e, cfg) => {
  const { baseUrl, apiKey, model } = cfg || {};
  if (!baseUrl) return { ok:false, status:0, detail:'缺少 API 地址' };
  if (!model) return { ok:false, status:0, detail:'缺少模型名' };
  const base = String(baseUrl).replace(/\/+$/, '');
  // 与 image-gen.mjs detectApi 一致：/v1 或 /v1/ 结尾 → openai-images，否则 chat-images
  const isOpenAIImages = /\/v1\/?$/.test(base);
  const hdr = { 'Content-Type':'application/json', ...(apiKey ? { Authorization:'Bearer '+apiKey } : {}) };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    let r;
    if (isOpenAIImages) {
      // OpenAI 兼容生图：POST {base}/images/generations
      r = await fetch(base + '/images/generations', {
        method:'POST', headers: hdr,
        body: JSON.stringify({ model, prompt:'superai connectivity test', n:1, size:'256x256' }),
        signal: ac.signal,
      });
    } else {
      // chat-images（腾讯混元 wand 等）：POST {base} 发 messages
      r = await fetch(base, {
        method:'POST', headers: hdr,
        body: JSON.stringify({ model, session:'superai-test-'+Date.now(), messages:[{ role:'user', content:[{ type:'text', text:'test' }] }] }),
        signal: ac.signal,
      });
    }
    if (r.ok) return { ok:true, status:r.status, detail:`连接成功（${isOpenAIImages?'openai-images':'chat-images'} 协议）` };
    let t=''; try { t=await r.text(); } catch {}
    return { ok:false, status:r.status, detail:`HTTP ${r.status}${t?('：'+t.slice(0,300)):''}` };
  } catch(e) {
    if (e && e.name === 'AbortError') return { ok:false, status:0, detail:'请求超时（30s）' };
    return { ok:false, status:0, detail:'网络错误：'+(e && e.message || e) };
  } finally {
    clearTimeout(timer);
  }
});

// ===== IPC: Agent 运行（流式） =====
// 核心 agent 层由 dsh（deepseek-harness）承担：spawn dsh --profile sdk，
// stdio JSON-RPC 驱动；dsh 事件翻译为前端 text/step/file/done/error 协议。

/** 打包态：extraResources 里的 dsh runtime（node + 依赖闭包）；不存在返回 null 走回退 */
function dshRuntimePaths() {
  if (!app.isPackaged) return null;
  const dir = path.join(process.resourcesPath, 'dsh-runtime');
  const nodeBin = path.join(dir, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  const dshBin = path.join(dir, 'pkg', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  if (!fs.existsSync(nodeBin) || !fs.existsSync(dshBin)) return null;
  return { nodeBin, dshBin };
}

// 解析给 agent 用的 node 可执行文件路径：打包态用 resources 里的 bundled node；
// dev 态从 PATH 找。用于让 agent 通过 pwsh 跑 superai 自带的脚本（如网页抓取），
// 不依赖用户机是否装了 node。
function resolveAgentNodeBin() {
  const rt = dshRuntimePaths();
  if (rt && rt.nodeBin && fs.existsSync(rt.nodeBin)) return rt.nodeBin;
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const c = path.join(dir.trim(), exe);
    try { if (fs.statSync(c).isFile()) return c; } catch {}
  }
  return 'node'; // 兜底（让 pwsh 自己找，找不到 agent 会看到报错）
}

ipcMain.handle('agent:run', async (e, input, history, workspace, sessionId) => {
  const model = settings.getCurrentModel();
  if (!model) {
    return { error: '请先在设置中添加并选择 AI 模型' };
  }
  const ws = workspace || settings.defaultWorkspace();
  // 注入当前会话工作目录，供 image-gen 等脚本解析相对路径
  process.env.SUPERAI_WORKSPACE = ws;
  // 本地端点（Ollama / vLLM 等）允许空 Key
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(model.baseUrl || '');
  if (!model.apiKey && !isLocal) {
    return { error: '请先在设置中填写该模型的 API Key' };
  }
  // 模型设置 → dsh provider patch（每次按最新 settings 重写）
  const dshHome = path.join(settings.appDataDir(), 'dsh-home');
  const patchFile = dshPatch.writePatch(dshHome, settings.load().models, {
    // superai 技能目录注册进 dsh，设置面板里的技能才能被 agent 发现
    skillDirs: [skills.skillsDir()],
    // 默认只扫 superai 自己的技能目录；用户在设置里开启才放行 ~/.agents/skills 等默认根
    includeDefaultRoots: !!settings.load().scanGlobalSkills,
  });
  if (!patchFile) {
    return { error: '请先在设置中添加至少一个模型' };
  }
  // 长期记忆 → dsh 全局指令 <dshHome>/AGENTS.md（agent-instructions 插件注入 system prompt）
  // 注入 node/fetch 脚本 / python / pptx-gen 脚本绝对路径，让 agent 能用 superai 自带的运行时
  // （打包后用户机 PATH 无 node/python，必须用 superai 管理的路径）
  // fetch、pptx-gen 脚本随包分发：dev 走源 data，打包走 resources/data
  const dataSkillsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'data', 'skills')
    : path.join(__dirname, '..', 'data', 'skills');
  memory.writeDshInstructions(dshHome, {
    nodeBin: resolveAgentNodeBin(),
    fetchScript: path.join(dataSkillsDir, 'web-fetch', 'fetch.mjs'),
    pythonBin: pyrt.resolvePythonBin(),
    pptxGenDir: path.join(dataSkillsDir, 'pptx-gen'),
  });
  try {
    const runtime = dshRuntimePaths() || {};
    await dsh.run({
      model,
      workspace: ws,
      input,
      sessionId,   // 同一会话复用同一 dsh session，保留多轮上下文
      dshHome,
      patchFile,
      nodeBin: runtime.nodeBin,
      dshBin: runtime.dshBin,
      onEvent: (event) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('agent:event', { ...event, sessionId });
        }
      },
    });
    return { ok: true };
  } catch (err) {
    console.error('[agent:run] 运行失败:', err && err.message);
    return { error: err.message };
  }
});

// ===== IPC: 停止进行中的 agent 运行 =====
// dsh rc.3 协议无 wire 级 cancel：中断 = 强杀该会话的 runtime 进程
// （dsh 原子写持久化 session，下次 resume 继续，不损坏上下文）。
ipcMain.handle('agent:cancel', (_e, sessionId) => {
  if (!sessionId) return { ok: false, error: '缺少 sessionId' };
  return { ok: dsh.cancel(sessionId) };
});

// 插话：运行中注入用户消息引导当前回合（dsh followup → inbox splice，不打断）
ipcMain.handle('agent:steer', (_e, sessionId, text) => {
  if (!sessionId) return { ok: false, error: '缺少 sessionId' };
  return dsh.steer(sessionId, String(text || ''));
});

// ===== IPC: 文件操作 =====

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

// ===== IPC: 用系统默认程序打开文件（pptx/docx/xlsx 等二进制格式预览不了，给用户一个出口）=====
// p 可能是相对工作目录的路径，先解析成绝对路径再交给 shell.openPath。
// 用系统默认程序打开文件：把可能相对工作目录的路径解析成绝对路径再 openPath。
function resolveAbs(p, workspace) {
  if (!p) return '';
  if (path.isAbsolute(p)) return p;
  return path.join(workspace || process.cwd(), p);
}

// 解析 python 可执行文件：优先环境变量，再 PATH 里的 python，再常见 anaconda 安装位。
// 用于 pptx→html 预览转换（无 LibreOffice 时的离线方案）。
// 优先 superai 管理的隔离版（打包 resources/python-runtime），开发机兜底 anaconda。
const pyrt = require('./python-runtime.cjs');
function resolvePythonBin() { return pyrt.resolvePythonBin(); }

// pptx -> html 预览转换。按 mtime 缓存：pptx 未变则复用已有的 .preview.html。
ipcMain.handle('files:convertPptx', async (_e, p, workspace) => {
  const abs = resolveAbs(p, workspace || settings.defaultWorkspace());
  if (!abs || !/\.pptx?$/i.test(abs)) return { ok: false, error: '非 pptx' };
  // 缓存目录在应用 userData 下，不污染工作目录、不进文件树。
  const crypto = require('crypto');
  const cacheDir = path.join(app.getPath('userData'), 'pptx-cache');
  try { require('fs').mkdirSync(cacheDir, { recursive: true }); } catch {}
  const stem = path.basename(abs).replace(/\.pptx?$/i, '');
  const hash = crypto.createHash('md5').update(abs).digest('hex').slice(0, 8);
  const previewHtml = path.join(cacheDir, stem + '.' + hash + '.preview.html');
  try {
    // 前置校验：python + python-pptx 是否可用
    if (!pyrt.hasPptxSupport()) {
      return { ok: false, error: '未找到可用的 Python（需 python-pptx）。开发机请装 anaconda；打包版随 superai 管理的隔离 Python。' };
    }
    const fsSync = require('fs');
    const pptxM = fsSync.statSync(abs).mtimeMs;
    let needConvert = true;
    try {
      const htmlM = fsSync.statSync(previewHtml).mtimeMs;
      if (htmlM >= pptxM) needConvert = false;
    } catch {}
    if (needConvert) {
      const { spawnSync } = require('child_process');
      const script = path.join(__dirname, 'pptx_preview.py');
      const py = resolvePythonBin();
      const r = spawnSync(py, [script, abs, previewHtml], { encoding: 'utf8', timeout: 60000 });
      if (r.status !== 0 || (r.stdout && r.stdout.startsWith('PPTX_'))) {
        return { ok: false, error: '转换失败: ' + (r.stdout || r.stderr || '').slice(0, 200) };
      }
    }
    return { ok: true, htmlPath: previewHtml };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

ipcMain.handle('files:openSystem', (_e, p, workspace) => {
  const ws = workspace || settings.defaultWorkspace();
  const abs = p ? resolveAbs(p, ws) : ws;
  if (!abs) return { ok: false, error: '无法解析路径' };
  return shell.openPath(abs).then(msg => (msg ? { ok: false, error: msg } : { ok: true }));
});

// 另存为：把工作目录里的文件复制到用户选的位置（present_files「下载」按钮）。
ipcMain.handle('files:saveAs', async (_e, p, workspace) => {
  const abs = resolveAbs(p, workspace || settings.defaultWorkspace());
  if (!abs) return { ok: false, error: '无法解析路径' };
  if (!win) return { ok: false, error: '无窗口' };
  const base = path.basename(abs);
  const r = await dialog.showSaveDialog(win, {
    title: '另存为',
    defaultPath: base,
  });
  if (r.canceled || !r.filePath) return { ok: false, error: '取消' };
  try {
    const fsp = require('fs').promises;
    await fsp.copyFile(abs, r.filePath);
    return { ok: true, dest: r.filePath };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
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

// 附件选择：多选文件，返回 {path,name,size}（size 用于 UI 展示，读取在发送时做）
ipcMain.handle('dialog:pickFiles', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    title: '选择要发送给 AI 的文件',
    // 软限制：默认筛常用类型，但仍可选“所有文件”——Agent 场景可能需要任意文件
    filters: [
      { name: '常用文档与数据', extensions: ['txt','md','markdown','json','csv','tsv','xls','xlsx','pdf','doc','docx','html','htm','xml','yaml','yml','log'] },
      { name: '图片', extensions: ['png','jpg','jpeg','gif','webp','bmp','svg'] },
      { name: '代码', extensions: ['js','mjs','cjs','ts','tsx','jsx','py','java','c','cpp','h','go','rs','rb','php','sh','sql','css','scss','vue'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths.map((p) => {
    let size = 0;
    try { size = fs.statSync(p).size; } catch { /* 已消失 */ }
    return { path: p, name: path.basename(p), size };
  });
});

// 附件读取：用户显式选中的文件（可位于工作目录外），与 files:read 的
// workspace 边界通道分开。硬上限 256KB（模型上下文友好），二进制只报大小。
ipcMain.handle('attachment:read', (_e, p) => {
  if (!p || typeof p !== 'string') return { error: '缺少文件路径' };
  let stat;
  try { stat = fs.statSync(p); } catch { return { error: '文件不存在或不可读' }; }
  if (!stat.isFile()) return { error: '不是普通文件' };
  const MAX = 256 * 1024;
  let buf;
  try { buf = fs.readFileSync(p); } catch (e) { return { error: e.message }; }
  const truncated = buf.length > MAX;
  if (truncated) buf = buf.subarray(0, MAX);
  // 二进制检测：头部含 NUL 字节即视为二进制，不注入模型上下文
  const head = buf.subarray(0, Math.min(8192, buf.length));
  if (head.includes(0)) return { binary: true, size: stat.size };
  return { content: buf.toString('utf-8'), truncated, size: stat.size };
});

// 附件复制到工作目录：让上传文件成为工作区内的一等文件（文件树可见、agent 可读写）。
// 返回工作区内副本的绝对路径；同名文件追加序号避免覆盖。
console.log('[main] register attachment:copyIn handler (module-load)');
ipcMain.handle('attachment:copyIn', async (_e, srcPath, workspace) => {
  if (!srcPath || typeof srcPath !== 'string') return null;
  const ws = workspace || settings.defaultWorkspace();
  if (!ws) return null;
  let src;
  try { src = path.resolve(srcPath); } catch { return null; }
  let stat;
  try { stat = fs.statSync(src); } catch { return null; }
  if (!stat.isFile()) return null;
  const dir = path.join(ws, '_attachments');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* 忽略，下方写入会再报错 */ }
  const base = path.basename(src);
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  let dest = path.join(dir, base);
  let i = 1;
  while (fs.existsSync(dest)) {
    dest = path.join(dir, `${stem} (${i})${ext}`);
    i++;
  }
  try { fs.copyFileSync(src, dest); } catch { return null; }
  return { path: dest, name: path.basename(dest), size: stat.size };
});

// 读取文件二进制为 ArrayBuffer：供右栏 PPTist 嵌入预览自动导入 pptx 用（通过 postMessage 推给 iframe）。
ipcMain.handle('files:readArrayBuffer', async (_e, p, workspace) => {
  const abs = resolveAbs(p, workspace || settings.defaultWorkspace());
  if (!abs) return { error: '无法解析路径' };
  try {
    const fsp = require('fs').promises;
    const buf = await fsp.readFile(abs);
    return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
});

// ===== IPC: 预览/打开外部 =====
ipcMain.handle('preview:open', (_e, url) => {
  shell.openExternal(url);
});

// ===== IPC: 会话持久化 =====
ipcMain.handle('sessions:list', () => sessions.grouped());
ipcMain.handle('sessions:get', (_e, id) => sessions.get(id));
ipcMain.handle('sessions:create', (_e, workspace, id) => sessions.create(workspace, id));
ipcMain.handle('sessions:append', (_e, id, msg) => sessions.appendMessage(id, msg));
ipcMain.handle('sessions:rename', (_e, id, title) => sessions.rename(id, title));
ipcMain.handle('sessions:delete', (_e, id) => { sessions.remove(id); return true; });
ipcMain.handle('sessions:togglePin', (_e, id) => sessions.togglePin(id));

// ===== IPC: 长期记忆 =====
ipcMain.handle('memory:text', () => memory.getMemoryText());
ipcMain.handle('memory:list', () => memory.listFacts());
ipcMain.handle('memory:save', (_e, content, tags) => memory.saveMemory(content, tags));
ipcMain.handle('memory:search', (_e, query) => memory.searchMemory(query));
ipcMain.handle('memory:delete', (_e, id) => memory.deleteFact(id));
ipcMain.handle('memory:clear', () => memory.clearAll());

// ===== IPC: 技能扫描 =====
ipcMain.handle('skills:list', () => skills.listSkills());
ipcMain.handle('skills:read', (_e, name) => skills.readSkill(name));
ipcMain.handle('skills:dir', () => skills.skillsDir());

// ===== dsh 插件管理 =====
ipcMain.handle('plugins:list', () => plugins.listBundles());
ipcMain.handle('plugins:install', async (_e, spec, registry) => plugins.installBundle(spec, registry));
ipcMain.handle('plugins:remove', async (_e, name) => plugins.removeBundle(name));
ipcMain.handle('plugins:setEnabled', (_e, name, enabled) => plugins.setBundleEnabled(name, enabled));

// ===== IPC: 会话工作目录 =====
ipcMain.handle('sessions:setWorkspace', (_e, id, workspace) => sessions.setWorkspace(id, workspace));

// ===== IPC: 云端 API 代理 =====
// 渲染进程 fetch 明文 http 到公网会被 Chromium mixed content 策略拦
// （localhost 是 secure context，fetch 明文 http 公网 = mixed content），
// 改走主进程代理调 superAi-py API（http://124.222.130.62:8083），绕过该限制。
const CLOUD_API_BASE = 'http://124.222.130.62:8083';
ipcMain.handle('cloud:api', async (_e, path, init) => {
  init = init || {};
  init.headers = init.headers || {};
  let r;
  try {
    r = await fetch(CLOUD_API_BASE + path, init);
  } catch (e) {
    return { ok: false, status: 0, error: '网络错误：' + (e && e.message || '无法连接服务器') };
  }
  const text = await r.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* 非 JSON，保留文本 */ }
  return { ok: r.ok, status: r.status, body };
});

// ===== IPC: 云端模型同步 =====
// 本地 settings.json 是对话模型的权威来源；此通道只缓存云端镜像并同步云端图像模型凭证。
// imageCredentials 为云端 kind=image 模型凭证；有则写入本地 settings.imageModel，
// 无（null/undefined）则保留用户手动配置的图像模型。
ipcMain.handle('cloud:model:sync', (_e, credentials, models, imageCredentials, accountId) => {
  if (!credentials) {
    dsh.cancelAll();
    return { ok: true, hasModel: false, modelCount: 0, imageSynced: false };
  }
  const selected = cloudModelToLocal(credentials);
  const cachedModels = (Array.isArray(models) ? models : [])
    .map(cloudModelToLocal)
    .filter(Boolean);
  if (selected) {
    const selectedIndex = cachedModels.findIndex((m) => m.id === selected.id);
    if (selectedIndex >= 0) cachedModels[selectedIndex] = { ...cachedModels[selectedIndex], ...selected };
    else cachedModels.push(selected);
  }
  if (accountId != null && selected) {
    settings.save({ cloudModelCache: { accountId: String(accountId), models: cachedModels, currentModelId: selected.id, updatedAt: Date.now() } });
  }
  let imageSynced = false;
  const img = imageCredToLocal(imageCredentials);
  if (img) {
    try {
      settings.save({ imageModel: img });
      imageSynced = true;
      console.log(`[main] cloud imageModel synced: ${img.model} @ ${img.baseUrl}`);
    } catch (e) {
      console.warn('[main] sync imageModel failed:', e.message);
    }
  }
  return { ok: true, hasModel: !!selected, modelCount: cachedModels.length, imageSynced };
});
