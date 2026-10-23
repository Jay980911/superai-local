// settings.cjs — 本地设置管理（明文 JSON）
// 模型：内置预设 + 用户自定义条目；工作目录跟随软件安装目录，每会话独立
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let cache = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

/** 内置模型预设（用户可在此基础上改 apiKey/model，但不能删除条目本身） */
const BUILTIN_MODELS = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat', apiType: 'openai', builtin: true },
  { id: 'openai',   name: 'OpenAI',   baseUrl: 'https://api.openai.com',  apiKey: '', model: 'gpt-4o',         apiType: 'openai', builtin: true },
  { id: 'ollama',   name: 'Ollama',    baseUrl: 'http://localhost:11434', apiKey: '', model: 'qwen2.5:14b',     apiType: 'ollama', builtin: true },
];

function defaults() {
  return {
    models: BUILTIN_MODELS.map((m) => ({ ...m })),
    currentModelId: '',   // 空 = 未选择，用户必须选一个
    autoExec: true,
  };
}

/** 默认工作目录 = 软件安装目录/workspace（装哪盘在哪盘）；开发态用项目根 */
function defaultWorkspace() {
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'workspace');
  }
  return path.join(app.getAppPath(), 'workspace');
}

/** 确保数据目录存在：sessions / memory / skills（userData 下）+ workspace（安装目录下） */
function ensureDataDirs() {
  const root = app.getPath('userData');
  for (const sub of ['sessions', 'memory', 'skills']) {
    const p = path.join(root, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
  // 默认工作目录
  const ws = defaultWorkspace();
  if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true });
}

function load() {
  if (cache) return cache;
  ensureDataDirs();
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    cache = { ...defaults(), ...parsed };
    // 兼容旧格式：把旧的 flat provider/apiKey/baseUrl/model 迁移进 models
    if (parsed.provider && !cache.models) {
      cache.models = BUILTIN_MODELS.map((m) => ({ ...m }));
    }
    // 确保 models 数组存在且内置条目齐全
    if (!Array.isArray(cache.models)) cache.models = BUILTIN_MODELS.map((m) => ({ ...m }));
    for (const b of BUILTIN_MODELS) {
      if (!cache.models.find((m) => m.id === b.id)) cache.models.push({ ...b });
    }
  } catch {
    cache = defaults();
  }
  return cache;
}

function save(patch) {
  const next = { ...load(), ...patch };
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8');
  cache = next;
  return next;
}

/** 获取当前选中的模型配置（供 agent.cjs 使用） */
function getCurrentModel() {
  const s = load();
  return s.models.find((m) => m.id === s.currentModelId) || null;
}

/** 添加自定义模型 */
function addModel(model) {
  const s = load();
  const id = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const entry = { ...model, id, builtin: false };
  s.models.push(entry);
  save(s);
  return entry;
}

/** 删除模型（内置不可删） */
function removeModel(id) {
  const s = load();
  const m = s.models.find((x) => x.id === id);
  if (m && m.builtin) return { ok: false, error: '内置模型不可删除' };
  s.models = s.models.filter((x) => x.id !== id);
  if (s.currentModelId === id) s.currentModelId = '';
  save(s);
  return { ok: true };
}

/** 设置当前模型 */
function setCurrentModel(id) {
  save({ currentModelId: id });
  return load();
}

/** 更新模型（改内置的 apiKey/model，或自定义的全部字段） */
function updateModel(id, patch) {
  const s = load();
  const m = s.models.find((x) => x.id === id);
  if (!m) return null;
  Object.assign(m, patch);
  save(s);
  return m;
}

function getPresets() {
  // 兼容旧调用
  const out = {};
  for (const m of BUILTIN_MODELS) out[m.id] = { baseUrl: m.baseUrl, model: m.model };
  return out;
}

module.exports = {
  load, save, defaults, getPresets, ensureDataDirs, defaultWorkspace,
  getCurrentModel, addModel, removeModel, setCurrentModel, updateModel,
  BUILTIN_MODELS,
};
