// sessions.cjs — 会话持久化（本地 JSON，不依赖服务器）
// 存储结构：<appData>/sessions/<id>.json + index.json
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const settings = require('./settings.cjs');

function sessionsDir() {
  return path.join(settings.appDataDir(), 'sessions');
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

/** 创建新会话
 *  id 可选：登录态由云端 createCloudConversation 返回数字 id，本地用同一 id 建副本，
 *  避免本地/云端两套 id。未传则本地 newId()（s-xxx）。指定 id 已存在则直接返回，不重复建。 */
function create(workspace, id) {
  ensureDir();
  const sid = id || newId();
  const existing = get(sid);
  if (existing) return existing;
  const now = Date.now();
  const session = {
    id: sid,
    title: '新对话',
    workspace: workspace || settings.defaultWorkspace(),
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  fs.writeFileSync(path.join(sessionsDir(), sid + '.json'), JSON.stringify(session, null, 2), 'utf-8');
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

/** 置顶/取消置顶（不改 updatedAt，避免时间错乱）。
 *  pinned 是会话级属性，必须回写主文件 session.json（数据主存储），
 *  否则 index.json 丢失/重建时置顶状态会丢。 */
function togglePin(id) {
  const session = get(id);
  if (!session) return grouped();
  session.pinned = !session.pinned;
  fs.writeFileSync(path.join(sessionsDir(), id + '.json'), JSON.stringify(session, null, 2), 'utf-8');
  upsertIndex(session);
  return grouped();
}

function upsertIndex(session) {
  const idx = list().filter((s) => s.id !== session.id);
  idx.unshift({
    id: session.id,
    title: session.title,
    workspace: session.workspace,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    pinned: session.pinned || false,
  });
  fs.writeFileSync(indexPath(), JSON.stringify(idx, null, 2), 'utf-8');
}

/** 排序：置顶在前，其余按 updatedAt 倒序（不再分今天/更早）。
 *  list() 已按 updatedAt 倒序返回，遍历时置顶先收集即可保持顺序。 */
function grouped() {
  const idx = list();
  const pinned = [];
  const others = [];
  for (const s of idx) {
    (s.pinned ? pinned : others).push(s);
  }
  const fmt = (s) => {
    const d = new Date(s.updatedAt || 0);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
      id: s.id,
      title: s.title || '新对话',
      summary: `${s.messageCount || 0} 条消息`,
      time: `${hh}:${mm}`,
      group: s.pinned ? '置顶' : '其他',
      workspace: s.workspace || '',
      pinned: !!s.pinned,
    };
  };
  return [...pinned.map(fmt), ...others.map(fmt)];
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

module.exports = { list, get, create, appendMessage, rename, remove, grouped, setWorkspace, togglePin };
