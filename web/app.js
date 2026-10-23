'use strict';
/* SuperAI Local 工作台前端 */
/* embed 模式: 被 superai 前端 iframe 嵌入时隐藏自带聊天栏(主聊天在 superai 主区进行) */
if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embed');
const $ = (id) => document.getElementById(id);
let state = {};
let activeFile = null;
let es = null;
let sending = false;
let curView = 'preview';          // 当前视图：preview | source
let previewBlobUrl = null;        // static 预览 blob URL
const LOG_LIMIT = 200000;

/* ===== 主题切换（白天/黑夜） ===== */
const THEME_KEY = 'superai-theme';
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = $('theme-toggle');
  if (btn) btn.textContent = t === 'dark' ? '🌙' : '☀️';
  try { localStorage.setItem(THEME_KEY, t); } catch (_) {}
}
if ($('theme-toggle')) {
  $('theme-toggle').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  };
}
try { applyTheme(localStorage.getItem(THEME_KEY) || 'light'); } catch (_) { applyTheme('light'); }

/* ===== SSE 连接 ===== */
function connectSSE() {
  document.body.dataset.state = 'connecting';
  es = new EventSource('/events');
  es.addEventListener('hello', e => {
    const d = JSON.parse(e.data);
    state = d;
    document.body.dataset.state = 'ok';
    $('status').textContent = `已连接 · ${d.name} · ${d.template || '空项目'} · ${d.preview.ready ? '预览就绪' : '无预览'}`;
    renderInfo(); refreshTree(); refreshPreview(); loadHistory(); updateEntry(state.entry);
  });
  es.addEventListener('dev_log', e => appendLog(JSON.parse(e.data).chunk));
  es.addEventListener('exec_log', e => {
    const d = JSON.parse(e.data);
    appendLog(`$ ${d.cmd}\n${d.chunk}`);
  });
  es.addEventListener('preview_ready', e => {
    const d = JSON.parse(e.data);
    refreshPreview(d.url); updateDevState(d);
  });
  es.addEventListener('dev_state', e => updateDevState(JSON.parse(e.data)));
  // 文件变动(agent 写文件/scaffold/exec 后 CLI 广播) → 实时刷新目录树+预览
  es.addEventListener('files_changed', e => { refreshTree(); refreshPreview(); });
  es.onerror = () => {
    document.body.dataset.state = 'down';
    $('status').textContent = 'CLI 已断开，请重启 superai-local';
  };
}

function renderInfo() {
  $('proj-info').textContent = `${state.name} · ${state.workdir}`;
  updateDevState(state.preview || {});
}
function updateDevState(p) {
  const el = $('dev-state');
  if (p && p.ready) { el.textContent = `dev: ${p.mode} ✓`; el.classList.add('ready'); }
  else { el.textContent = 'dev: 未启动'; el.classList.remove('ready'); }
}

/* ===== 文件树 ===== */
let treeData = [];
const expandedMap = {};          // path → bool, 记录目录展开状态
let curToolCard = null;          // 当前工具卡片(tool_start 创建,tool 更新状态)
function initExpanded(items) {
  for (const it of items) {
    if (it.type === 'dir') {
      if (it.collapsed) expandedMap[it.path] = false;
      if (it.children) initExpanded(it.children);
    }
  }
}
async function refreshTree() {
  let r;
  try { r = await fetch('/api/tree').then(x => x.json()); } catch (_) { return; }
  treeData = r;
  initExpanded(r);
  renderTree();
}
function renderTree() {
  const root = $('file-tree');
  root.replaceChildren();
  renderNodes(treeData, 0, root);
}
function renderNodes(items, depth, parent) {
  for (const it of items) {
    const el = document.createElement('div');
    el.className = 'item ' + it.type;
    el.style.paddingLeft = (10 + depth * 14) + 'px';
    el.textContent = it.name;
    if (it.type === 'dir') {
      const expanded = expandedMap[it.path] !== false;
      el.classList.toggle('collapsed', !expanded);
      el.onclick = () => { expandedMap[it.path] = !expanded; renderTree(); };
      parent.appendChild(el);
      if (expanded && it.children) renderNodes(it.children, depth + 1, parent);
    } else {
      el.onclick = () => openFile(it.path);
      if (activeFile === it.path) el.classList.add('active');
      parent.appendChild(el);
    }
  }
}

async function openFile(path) {
  activeFile = path;
  $('file-path').textContent = path;
  try {
    const r = await fetch('/api/file?path=' + encodeURIComponent(path));
    $('editor').textContent = await r.text();
  } catch (_) {
    $('editor').textContent = '（读取失败）';
  }
  renderTree();
  if (curView !== 'source') setView('source');
}

/* ===== 视图切换（预览/源码） ===== */
function setView(v) {
  curView = v;
  $('tab-preview').classList.toggle('active', v === 'preview');
  $('tab-source').classList.toggle('active', v === 'source');
  $('preview').hidden = v !== 'preview';
  $('editor').hidden = v !== 'source';
}
$('tab-preview').onclick = () => setView('preview');
$('tab-source').onclick = () => setView('source');

/* ===== 拖拽调整聊天宽度 ===== */
(function initResizer() {
  const resizer = $('resizer');
  let dragging = false;
  resizer.addEventListener('mousedown', e => {
    dragging = true; resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    // 聊天列宽 = 鼠标 x 坐标，限制 260 ~ 60% 窗口
    const w = Math.min(Math.max(e.clientX, 260), window.innerWidth * 0.62);
    document.documentElement.style.setProperty('--chat-w', w + 'px');
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; resizer.classList.remove('dragging');
    document.body.style.cursor = ''; document.body.style.userSelect = '';
  });
})();

/* ===== 预览 ===== */
function setPreviewSrc(src) {
  const frame = $('preview');
  if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); previewBlobUrl = null; }
  frame.src = src;
}
async function refreshPreview(forceUrl) {
  let r = {};
  try { r = await fetch('/api/preview-url').then(x => x.json()); } catch (_) {}
  if (r.entry) updateEntry(r.entry);
  const url = forceUrl || r.url;
  if (r.mode === 'static' || (!url && r.mode === 'static')) {
    try {
      const fr = await fetch('/api/file?path=index.html');
      const html = await fr.text();
      const blob = new Blob([html], { type: 'text/html' });
      previewBlobUrl = URL.createObjectURL(blob);
      $('preview').src = previewBlobUrl;
      updateDevState({ mode: 'static', ready: true });
    } catch (_) { setPreviewSrc('about:blank'); }
  } else if (url) {
    const frame = $('preview');
    const cur = frame.src || '';
    // vite 改文件后 url 不变但内容变了,强制 reload(about:blank 闪一下可接受)
    if (cur && cur.replace(/\/$/, '') === url.replace(/\/$/, '')) {
      frame.src = 'about:blank';
      setTimeout(() => { frame.src = url; }, 30);
    } else {
      setPreviewSrc(url);
    }
  } else {
    setPreviewSrc('about:blank');
  }
}
let _previewPoll = null;
let curBotMsg = null;      // 当前流式 bot 消息(累积 reply 片段)
let _taskTimer = null;    // 任务计时器(每秒更新状态栏,防用户以为卡死)
let _taskStart = 0;
let _curCmd = '';
function startTaskTimer() {
  clearInterval(_taskTimer);
  _taskStart = Date.now(); _curCmd = '';
  _taskTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - _taskStart) / 1000);
    $('status').textContent = _curCmd
      ? `⏳ 执行 ${_curCmd.slice(0, 25)}… 已 ${sec}s（实时日志见脚本输出区）`
      : `⏳ AI 处理中… 已 ${sec}s`;
  }, 1000);
}
function stopTaskTimer() { clearInterval(_taskTimer); _taskTimer = null; }
$('restart-preview').onclick = async () => {
  $('status').textContent = '重启预览中…';
  await fetch('/api/restart-preview', { method: 'POST' });
  $('status').textContent = `已连接 · ${state.name || ''} · ${state.template || ''} · 预览启动中…`;
  // 轮询 preview-url 直到 ready(SSE 万一断了也能检测)
  clearInterval(_previewPoll);
  const t0 = Date.now();
  _previewPoll = setInterval(async () => {
    try {
      const r = await fetch('/api/preview-url').then(x => x.json());
      if (r.ready) {
        clearInterval(_previewPoll);
        refreshPreview(r.url); updateDevState({ mode: r.mode, ready: true });
        $('status').textContent = `已连接 · ${state.name || ''} · ${state.template || ''} · 预览就绪`;
      } else if (Date.now() - t0 > 20000) {
        clearInterval(_previewPoll);
        $('status').textContent = `已连接 · ${state.name || ''} · ${state.template || ''} · 预览启动超时，请查看脚本输出`;
      }
    } catch (_) {}
  }, 1500);
};

/* ===== 聊天 ===== */
async function sendMsg() {
  if (sending) return;
  const txt = $('msg-input').value.trim();
  if (!txt) return;
  $('msg-input').value = '';
  appendChat('user', esc(txt));
  sending = true;
  $('send-btn').disabled = true;
  $('send-btn').classList.add('loading');
  curBotMsg = null;
  showThinking();
  startTaskTimer();
  try {
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg: txt }),
    });
    if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
        handleSSEBlock(block);
      }
    }
  } catch (err) {
    appendChat('err', '⚠️ ' + esc(err && err.message ? err.message : String(err)));
  } finally {
    sending = false;
    $('send-btn').disabled = false;
    $('send-btn').classList.remove('loading');
    stopTaskTimer();
    hideThinking();
    refreshTree(); refreshPreview();
  }
}
function handleSSEBlock(block) {
  let event = 'message', data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  let d = {}; try { d = JSON.parse(data); } catch (_) { d = { text: data }; }
  switch (event) {
    case 'reply': hideThinking(); appendReplyChunk(esc(d.text)); break;
    case 'tool_start': curBotMsg = null; appendToolCard('call', d.name, d.arguments); break;
    case 'tool': curBotMsg = null; appendToolCard('result', d.name, d.result); break;
    case 'exec_log':
      appendLog(`$ ${d.cmd}\n${d.chunk}`);
      if (sending) _curCmd = d.cmd;
      break;
    case 'dev_log': appendLog(typeof d.chunk === 'string' ? d.chunk : JSON.stringify(d.chunk)); break;
    case 'preview_ready':
      clearInterval(_previewPoll);
      refreshPreview(d.url); updateDevState(d);
      $('status').textContent = `已连接 · ${state.name || ''} · ${state.template || ''} · 预览就绪`;
      break;
    case 'error': curBotMsg = null; hideThinking(); appendChat('err', '⚠️ ' + esc(d.message || JSON.stringify(d))); break;
    case 'end':
      if (curBotMsg && curBotMsg.textContent.trim()) curBotMsg.innerHTML = renderMarkdown(curBotMsg.textContent);
      curBotMsg = null;
      sending = false;
      stopTaskTimer();
      $('send-btn').disabled = false;
      $('send-btn').classList.remove('loading');
      $('msg-input').focus();
      break;
  }
}
function appendChat(cls, html) {
  const el = document.createElement('div');
  el.className = 'msg ' + cls;
  el.innerHTML = html;
  if (cls === 'tool') {
    el.style.maxHeight = '120px';
    el.onclick = function() {
      const expanded = this.classList.toggle('expanded');
      this.style.maxHeight = expanded ? 'none' : '120px';
    };
  }
  const log = $('chat-log');
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}
/** 工具卡片: tool_start 创建(调用中)+调用区,tool 追加结果区+状态变完成.调用脚本和结果都展示 */
function prettyJson(p) {
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (_) {} }
  return typeof p === 'string' ? p : JSON.stringify(p, null, 2);
}
function makeSection(label, payload) {
  const sec = document.createElement('div');
  sec.className = 'tool-sec';
  const h = document.createElement('div');
  h.className = 'tool-sec-h'; h.textContent = label;
  const pre = document.createElement('pre');
  pre.className = 'tool-pre'; pre.textContent = prettyJson(payload);
  sec.appendChild(h); sec.appendChild(pre);
  return sec;
}
function appendToolCard(kind, name, payload) {
  // result 事件: 追加结果区 + 状态变完成
  if (kind === 'result' && curToolCard && curToolCard.parentNode) {
    curToolCard.querySelector('.tool-ic').textContent = '✓';
    curToolCard.querySelector('.tool-st').textContent = '完成';
    const body = curToolCard.querySelector('.tool-body');
    body.appendChild(makeSection('结果', payload));
    curToolCard = null;
    const log = $('chat-log');
    log.scrollTop = log.scrollHeight;
    return;
  }
  // call 事件或无配对: 创建新卡片,body 先放调用区
  const card = document.createElement('div');
  card.className = 'tool-card';
  const head = document.createElement('div');
  head.className = 'tool-head';
  const icon = kind === 'call' ? '⚙' : '✓';
  const status = kind === 'call' ? '调用中' : '完成';
  head.innerHTML = `<span class="tool-ic">${icon}</span><span class="tool-nm">${esc(name)}</span><span class="tool-st">${status}</span><span class="tool-arr">▾</span>`;
  const body = document.createElement('div');
  body.className = 'tool-body';
  body.appendChild(makeSection('调用', payload));
  card.appendChild(head);
  card.appendChild(body);
  head.onclick = () => {
    const collapsed = card.classList.toggle('collapsed');
    head.querySelector('.tool-arr').textContent = collapsed ? '▸' : '▾';
  };
  const log = $('chat-log');
  log.appendChild(card);
  log.scrollTop = log.scrollHeight;
  if (kind === 'call') curToolCard = card;  // 存引用,等 result 事件追加结果
}
/** 流式追加 reply 片段到同一条 bot 消息(不每片新建) */
function appendReplyChunk(html) {
  if (!curBotMsg || !curBotMsg.parentNode) {
    curBotMsg = document.createElement('div');
    curBotMsg.className = 'msg bot';
    $('chat-log').appendChild(curBotMsg);
  }
  curBotMsg.innerHTML += html;
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
}
/** 显示“思考中”临时消息 */
function showThinking() {
  hideThinking();
  const t = document.createElement('div');
  t.id = 'thinking';
  t.className = 'msg bot thinking';
  t.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> 思考中…';
  $('chat-log').appendChild(t);
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
}
function hideThinking() {
  const t = $('thinking');
  if (t) t.remove();
}
function appendLog(text) {
  const el = $('dev-log');
  // 前端兑底 strip 所有 ANSI CSI 序列(颜色/光标等),防方框乱码
  const clean = String(text).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
  el.textContent += clean;
  if (el.textContent.length > LOG_LIMIT) el.textContent = el.textContent.slice(-LOG_LIMIT);
  el.scrollTop = el.scrollHeight;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** 简单 markdown 渲染: 代码块/行内代码 */
function renderMarkdown(text) {
  let html = esc(text);
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return html;
}

/** 刷新后恢复历史聊天记录(CLI 内存存着) */
async function loadHistory() {
  let h;
  try { h = await fetch('/api/history').then(x => x.json()); } catch (_) { return; }
  const log = $('chat-log');
  log.innerHTML = '';
  curBotMsg = null;
  curToolCard = null;
  for (const it of h) {
    const { ev, d } = it;
    if (ev === 'user') { curBotMsg = null; appendChat('user', esc(d.text)); }
    else if (ev === 'reply') { appendReplyChunk(esc(d.text)); }
    else if (ev === 'tool_start') { curBotMsg = null; appendToolCard('call', d.name, d.arguments); }
    else if (ev === 'tool') { curBotMsg = null; appendToolCard('result', d.name, d.result); }
    else if (ev === 'error') { curBotMsg = null; appendChat('err', '⚠️ ' + esc(d.message || JSON.stringify(d))); }
  }
  log.scrollTop = log.scrollHeight;
}

/** 更新预览入口标签(点击跳转入口文件源码) */
function updateEntry(entry) {
  const el = $('entry-link');
  if (!el) return;
  if (entry && entry.label) {
    el.textContent = '入口: ' + entry.label;
    el.onclick = () => { if (entry.file) openFile(entry.file); };
    el.title = '点击查看 ' + entry.file;
  } else {
    el.textContent = '入口: -';
    el.onclick = null;
  }
}

$('send-btn').onclick = sendMsg;
$('msg-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});
$('clear-log').onclick = () => { $('dev-log').textContent = ''; };
// 工具卡片展开/折叠由 appendChat 的 onclick 直接绑定(不用事件委托,避免双 toggle 冲突)
connectSSE();
