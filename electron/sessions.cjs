// sessions.cjs — 会话持久化（本地 JSON，不依赖服务器）
// 存储结构：userData/sessions/<id>.json + index.json
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const settings = require('./settings.cjs');

function sessionsDir() {
  return path.join(app.getPath('userData'), 'sessions');
}

function indexPath() {
  return path.join(sessionsDir(), 'index.json');
}

function ensureDir() {
  if (!fs.existsSync(sessionsDir())) fs.mkdirSync(sessionsDir(), { recursive: true });
}

function newId() {
  return 's-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
}

/** 读取索引（侧栏列表用） */
function list() {
  ensureDir();
  try {
    const raw = fs.readFileSync(indexPath(), 'utf-8');
    const idx = JSON.parse(raw);
    return Array.isArray(idx) ? idx.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) : [];
  } catch {
    return [];
  }
}

/** 读取单会话完整消息 */
function get(id) {
  ensureDir();
  try {
    const raw = fs.readFileSync(path.join(sessionsDir(), id + '.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 创建新会话 */
function create(workspace) {
  ensureDir();
  const id = newId();
  const now = Date.now();
  const session = {
    id,
    title: '新对话',
    workspace: workspace || settings.defaultWorkspace(),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  fs.writeFileSync(path.join(sessionsDir(), id + '.json'), JSON.stringify(session, null, 2), 'utf-8');
  upsertIndex(session);
  return session;
}

/** 追加消息到会话 */
function appendMessage(id, msg) {
  const session = get(id);
  if (!session) return null;
  session.messages.push(msg);
  session.updatedAt = Date.now();
  // 用首条用户消息生成标题（若还是"新对话"）
  if (session.title === '新对话' && msg.role === 'user' && msg.text) {
    session.title = msg.text.slice(0, 24) + (msg.text.length > 24 ? '…' : '');
  }
  fs.writeFileSync(path.join(sessionsDir(), id + '.json'), JSON.stringify(session, null, 2), 'utf-8');
  upsertIndex(session);
  return session;
}

/** 重命名 */
function rename(id, title) {
  const session = get(id);
  if (!session) return null;
  session.title = title;
  session.updatedAt = Date.now();
  fs.writeFileSync(path.join(sessionsDir(), id + '.json'), JSON.stringify(session, null, 2), 'utf-8');
  upsertIndex(session);
  return session;
}

/** 删除 */
function remove(id) {
  try { fs.unlinkSync(path.join(sessionsDir(), id + '.json')); } catch {}
  // 从索引移除
  const idx = list().filter((s) => s.id !== id);
  fs.writeFileSync(indexPath(), JSON.stringify(idx, null, 2), 'utf-8');
}

function upsertIndex(session) {
  const idx = list().filter((s) => s.id !== session.id);
  idx.unshift({
    id: session.id,
    title: session.title,
    workspace: session.workspace,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  });
  fs.writeFileSync(indexPath(), JSON.stringify(idx, null, 2), 'utf-8');
}

/** 按时间分组（今天/昨天/近 7 天/更早） */
function grouped() {
  const idx = list();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 7 * 86400000;
  const groups = { '今天': [], '昨天': [], '近 7 天': [], '更早': [] };
  for (const s of idx) {
    const t = s.updatedAt || 0;
    if (t >= todayStart) groups['今天'].push(s);
    else if (t >= yesterdayStart) groups['昨天'].push(s);
    else if (t >= weekStart) groups['近 7 天'].push(s);
    else groups['更早'].push(s);
  }
  // 组内摘要
  const result = [];
  for (const g of ['今天', '昨天', '近 7 天', '更早']) {
    if (groups[g].length === 0) continue;
    for (const s of groups[g]) {
      const d = new Date(s.updatedAt || 0);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      result.push({
        id: s.id,
        title: s.title || '新对话',
        summary: `${s.messageCount || 0} 条消息`,
        time: `${hh}:${mm}`,
        group: g,
        workspace: s.workspace || '',
      });
    }
  }
  return result;
}

/** 设置会话工作目录 */
function setWorkspace(id, workspace) {
  const session = get(id);
  if (!session) return null;
  session.workspace = workspace;
  session.updatedAt = Date.now();
  fs.writeFileSync(path.join(sessionsDir(), id + '.json'), JSON.stringify(session, null, 2), 'utf-8');
  upsertIndex(session);
  return session;
}

module.exports = { list, get, create, appendMessage, rename, remove, grouped, setWorkspace };
