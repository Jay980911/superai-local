// settings.cjs — 本地设置管理（明文 JSON）
// 模型：不内置任何预设，全部由用户自行添加（任意大模型）。
// 协议与 dsh（deepseek-harness）llm-pi-ai 对齐：
//   openai-completions  — OpenAI Chat Completions 兼容（绝大多数服务，含 Ollama 的 /v1）
//   openai-responses    — OpenAI Responses API
//   anthropic-messages  — Anthropic Messages API
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let cache = null;

/** 合法的 API 协议取值 */
const API_TYPES = ['openai-completions', 'openai-responses', 'anthropic-messages'];

/** 旧版 apiType → 新版 api 的迁移映射（ollama 走其 /v1 OpenAI 兼容端点） */
const LEGACY_API_MAP = { openai: 'openai-completions', ollama: 'openai-completions' };

/** app 状态目录：打包=安装目录/data，开发=项目根/data（远离 C 盘，和 workspace 平级） */
function appDataDir() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'data');
  }
  // 开发态：settings.cjs 在 electron/ 下，上一级即项目根
  return path.resolve(__dirname, '..', 'data');
}

function settingsPath() {
  return path.join(appDataDir(), 'settings.json');
}

/** 默认配置：不内置模型，用户必须自行添加并选择 */
function defaults() {
  return {
    models: [],
    currentModelId: '',   // 空 = 未选择，用户必须选一个
    cloudModelCache: null,
    autoExec: true,
    uiTheme: 'warm',          // 全局主题，同时作用于加载页、登录页与工作台
    userAvatarDataUrl: '',    // 本地头像覆盖，空时沿用云端账户头像
    assistantAvatarDataUrl: '', // 本地 AI 头像，空时使用内置图片
    scanGlobalSkills: false,  // 默认只扫 superai data/skills；true=同时扫 ~/.agents/skills 等 dsh 默认根（需用户显式同意）
    workspace: '',        // 全局默认工作目录覆盖（用户在无活动会话时选的目录）；
                          // 空 = 用安装目录/workspace。每个会话可再单独覆盖。
    imageModel: null,     // 图像生成模型配置（独立于对话模型，本地明文存，不进 dsh provider patch）
                          // { baseUrl, apiKey, model }，供 scripts/image-gen.mjs 使用
    unsplashKey: '',      // Unsplash 图库 API Access Key（可选，留空则 image-gen 图库模式跳过）
    proxy: '',            // HTTP/HTTPS 代理地址（可选，如 http://127.0.0.1:7890），供 image-gen 访问境外图库
                          // 仅注入为子进程 HTTPS_PROXY，不影响大模型（境内的不走代理）
  };
}

/** 原始默认工作目录 = 软件安装目录/workspace（装哪盘在哪盘）；开发态用项目根。
 *  不读 settings——ensureDataDirs 在 load() 内部调用，读 settings 会递归 */
function rawDefaultWorkspace() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'workspace');
  }
  // 开发态：项目根/workspace
  return path.resolve(__dirname, '..', 'workspace');
}

/** 默认工作目录 = 用户选过的全局目录（settings.workspace）→ 原始默认目录 */
function defaultWorkspace() {
  const override = load().workspace;
  if (override && typeof override === 'string' && override.trim()) return override;
  return rawDefaultWorkspace();
}

/** 确保数据目录存在：appData 下 sessions/memory/skills + workspace（安装目录下） */
function ensureDataDirs() {
  const root = appDataDir();
  for (const sub of ['sessions', 'memory', 'skills']) {
    const p = path.join(root, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
  // 默认工作目录（注意用 raw 版本：load() 调用本函数，不能回头读 settings）
  const ws = rawDefaultWorkspace();
  if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
}

/**
 * 旧格式迁移：
 *  - apiType('openai'|'ollama') → api('openai-completions' 等)
 *  - ollama 的 baseUrl 补 /v1（其 OpenAI 兼容端点）
 *  - 去掉 builtin 标记（不再有内置模型，全部可删）
 *  - 收敛非法 api 取值；currentModelId 指向失效条目时清空
 */
function migrate(s) {
  if (!['warm', 'mist', 'night'].includes(s.uiTheme)) s.uiTheme = 'warm';
  if (typeof s.userAvatarDataUrl !== 'string') s.userAvatarDataUrl = '';
  if (typeof s.assistantAvatarDataUrl !== 'string') s.assistantAvatarDataUrl = '';
  if (!s.cloudModelCache || typeof s.cloudModelCache !== 'object' || Array.isArray(s.cloudModelCache) || typeof s.cloudModelCache.accountId !== 'string' || !Array.isArray(s.cloudModelCache.models)) {
    s.cloudModelCache = null;
  } else if (typeof s.cloudModelCache.currentModelId !== 'string') {
    s.cloudModelCache.currentModelId = '';
  }
  if (!Array.isArray(s.models)) { s.models = []; return s; }
  // workspace 全局默认目录：只接受非空字符串，其他值收敛为空
  if (typeof s.workspace !== 'string') s.workspace = '';
  // scanGlobalSkills 布尔收敛（旧 settings 无此字段时默认 false）
  if (typeof s.scanGlobalSkills !== 'boolean') s.scanGlobalSkills = false;
  // imageModel：图像生成模型配置（独立于对话模型，本地明文存，不进 dsh provider patch）
  if (!s.imageModel || typeof s.imageModel !== 'object') s.imageModel = null;
  if (typeof s.unsplashKey !== 'string') s.unsplashKey = '';
  if (typeof s.proxy !== 'string') s.proxy = '';
  s.models = s.models.map((m) => {
    const next = { ...m };
    if (next.apiType && !next.api) {
      next.api = LEGACY_API_MAP[next.apiType] || 'openai-completions';
      if (next.apiType === 'ollama' && next.baseUrl && !/\/v1\/?$/.test(next.baseUrl)) {
        next.baseUrl = next.baseUrl.replace(/\/+$/, '') + '/v1';
      }
    }
    delete next.apiType;
    delete next.builtin;
    if (!API_TYPES.includes(next.api)) next.api = 'openai-completions';
    return next;
  });
  if (s.currentModelId && !s.models.find((m) => m.id === s.currentModelId)) {
    s.currentModelId = '';
  }
  return s;
}

function load() {
  if (cache) return cache;
  ensureDataDirs();
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    cache = migrate({ ...defaults(), ...parsed });
  } catch {
    cache = defaults();
  }
  return cache;
}

function save(patch) {
  const next = migrate({ ...load(), ...patch });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8');
  cache = next;
  return next;
}

/** 获取当前选中的模型配置（供 agent.cjs 使用） */
function getCurrentModel() {
  const s = load();
  return s.models.find((m) => m.id === s.currentModelId) || null;
}

/** 获取单个模型配置 */
function getModel(id) {
  const s = load();
  return s.models.find((x) => x.id === id) || null;
}

/** 添加模型（任意大模型，字段齐才能用） */
function addModel(model) {
  const s = load();
  const entry = {
    id: 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name: String(model.name || '').trim(),
    baseUrl: String(model.baseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: String(model.apiKey || ''),
    model: String(model.model || '').trim(),
    api: API_TYPES.includes(model.api) ? model.api : 'openai-completions',
    kind: model.kind === 'image' ? 'image' : 'chat',
  };
  if (!entry.name || !entry.baseUrl || !entry.model) {
    return { ok: false, error: '名称、API 地址、模型名不能为空' };
  }
  s.models.push(entry);
  save(s);
  return entry;
}

/** 删除模型（无内置概念，全部可删） */
function removeModel(id) {
  const s = load();
  s.models = s.models.filter((x) => x.id !== id);
  if (s.currentModelId === id) {
    s.currentModelId = s.models.find((model) => model.kind !== 'image')?.id || '';
  }
  save(s);
  return { ok: true };
}

/** 设置当前模型 */
function setCurrentModel(id) {
  save({ currentModelId: id });
  return load();
}

/** 更新模型字段 */
function updateModel(id, patch) {
  const s = load();
  const m = s.models.find((x) => x.id === id);
  if (!m) return null;
  const next = { ...patch };
  delete next.id;
  delete next.builtin;
  delete next.apiType;
  if (next.api && !API_TYPES.includes(next.api)) delete next.api;
  Object.assign(m, next);
  save(s);
  return m;
  save(s);
  return m;
}

/** 旧调用兼容：已无内置预设，返回空 */
function getPresets() {
  return {};
}

module.exports = {
  load, save, defaults, getPresets, ensureDataDirs, defaultWorkspace, appDataDir,
  getCurrentModel, addModel, removeModel, setCurrentModel, updateModel, getModel,
  API_TYPES,
};
