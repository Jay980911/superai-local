// memory.cjs — 长期记忆（profile.md 双写：人类可读 + RAW_JSON）
// 存 userData/memory/profile.md，不依赖工作目录
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function memoryDir() {
  return path.join(app.getPath('userData'), 'memory');
}
function profilePath() {
  return path.join(memoryDir(), 'profile.md');
}
function ensureDir() {
  if (!fs.existsSync(memoryDir())) fs.mkdirSync(memoryDir(), { recursive: true });
}

function loadProfile() {
  ensureDir();
  try {
    const raw = fs.readFileSync(profilePath(), 'utf-8');
    const m = raw.match(/<!-- RAW_JSON_START\n([\s\S]*?)\nRAW_JSON_END -->/);
    if (m) return JSON.parse(m[1]);
  } catch {}
  return { facts: [], version: 1, lastUpdatedAt: null };
}

function saveProfile(data) {
  ensureDir();
  data.version = (data.version || 1) + 1;
  data.lastUpdatedAt = new Date().toISOString();
  // 防御：确保每条 fact 的 tags 是数组
  if (Array.isArray(data.facts)) {
    data.facts = data.facts.map((f) => ({ ...f, tags: Array.isArray(f.tags) ? f.tags : (typeof f.tags === 'string' && f.tags ? f.tags.split(/[,，\s]+/).filter(Boolean) : []) }));
  }
  let md = `# User Memory Profile\n> Last updated: ${data.lastUpdatedAt}\n> Version: ${data.version}\n\n## Facts\n`;
  for (const f of data.facts) {
    md += `- ${f.content}${f.tags && f.tags.length ? ` [${f.tags.join(',')}]` : ''}\n`;
  }
  md += `\n---\n<!-- RAW_JSON_START\n${JSON.stringify(data, null, 2)}\nRAW_JSON_END -->\n`;
  fs.writeFileSync(profilePath(), md, 'utf-8');
}

/** 返回注入 system prompt 的记忆文本 */
function getMemoryText() {
  const p = loadProfile();
  if (!p.facts || p.facts.length === 0) return '';
  return p.facts.map((f) => `- ${f.content}`).join('\n');
}

/** 存一条记忆 */
function saveMemory(content, tags) {
  const p = loadProfile();
  const tagArr = Array.isArray(tags) ? tags : (typeof tags === 'string' && tags ? tags.split(/[,，\s]+/).filter(Boolean) : []);
  p.facts.push({ id: 'f' + Date.now(), content, tags: tagArr, createdAt: new Date().toISOString() });
  saveProfile(p);
  return { ok: true, count: p.facts.length };
}

/** 搜索记忆 */
function searchMemory(query) {
  const p = loadProfile();
  const q = (query || '').toLowerCase();
  const results = p.facts.filter((f) => f.content.toLowerCase().includes(q));
  return { results };
}

/** 列出全部记忆条目（供 UI 管理） */
function listFacts() {
  const p = loadProfile();
  return (p.facts || []).map((f) => ({
    id: f.id,
    content: f.content,
    tags: Array.isArray(f.tags) ? f.tags : [],
    createdAt: f.createdAt || null,
  }));
}

/** 删除单条记忆 */
function deleteFact(id) {
  const p = loadProfile();
  const before = p.facts.length;
  p.facts = p.facts.filter((f) => f.id !== id);
  if (p.facts.length === before) return { ok: false };
  saveProfile(p);
  return { ok: true, count: p.facts.length };
}

/** 清空全部记忆 */
function clearAll() {
  saveProfile({ facts: [], version: 0, lastUpdatedAt: null });
  return { ok: true, count: 0 };
}

module.exports = { loadProfile, saveProfile, getMemoryText, saveMemory, searchMemory, listFacts, deleteFact, clearAll };
