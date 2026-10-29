import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import './App.css';
import SessionSidebar from '../components/sidebar/SessionSidebar';
import LoginScreen from '../components/auth/LoginScreen';
import Splash from '../components/auth/Splash';
import ChatHeader from '../components/chat/ChatHeader';
import { ChatStream, ChatSkeleton, EmptyState } from '../components/chat/ChatStream';
import Composer from '../components/chat/Composer';
import { OutputPanel } from '../components/output/OutputPanel';
import type { Pane } from '../components/output/OutputPanel';
import SettingsDialog from '../components/settings/SettingsDialog';
import type { Tab as SettingsTab } from '../components/settings/SettingsDialog';
import type { Session, Message, Step, FileEntry } from '../types';
import { messages as mockMessages } from '../data/mock';
import {
  runAgent,
  cancelAgent,
  steerAgent,
  isElectron,
  getSettings,
  saveSettings,
  getDefaultWorkspace,
  onMenu,
  menuPopup,
  pickDirectory,
  setSessionWorkspace,
  listFiles,
  readFile,
  openSystemFile,
  saveFileAs,
  listSessions,
  togglePinSession,
  getSession,
  createSession,
  appendSessionMessage,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
  pickFiles,
  readAttachment,
  copyAttachmentIn,
  type AgentEvent,
  type PickedFile,
  type UiTheme,
} from '../data/api';
import {
  getStoredToken,
  getStoredUser,
  fetchMe,
  logout as cloudLogout,
  listModels,
  getSelectedCredentials,
  getCredentials,
  type CloudUser,
} from '../data/cloud';

let _id = 100;
const nid = () => `n${Date.now().toString(36)}-${_id++}`;

export default function App() {
  const [side, setSide] = useState<'on' | 'off'>('on');
  const [rightSide, setRightSide] = useState<'on' | 'off'>('off');
  const [outputMax, setOutputMax] = useState(false);
  const [pane, setPane] = useState<Pane>('tree');
  const [mode, setMode] = useState<'main' | 'empty'>(isElectron ? 'empty' : 'main');
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [msgs, setMsgs] = useState<Message[]>(isElectron ? [] : mockMessages);
  const [draft, setDraft] = useState('');
  const [autoExec, setAutoExec] = useState(true);
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem('superai_ui_theme') : null;
    return cached === 'mist' || cached === 'night' || cached === 'warm' ? cached : 'warm';
  });
  const themeTouchedRef = useRef(false);
  const [attachments, setAttachments] = useState<PickedFile[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('models');
  const [runningSids, setRunningSids] = useState<Set<string>>(new Set());
  /** 草稿按会话缓存：切换会话时保存/恢复输入框内容 */
  const draftCache = useRef<Map<string, string>>(new Map());
  const [workspace, setWorkspace] = useState('');
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<{ name: string; path: string } | null>(null);
  const [fileContent, setFileContent] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatScrolled, setChatScrolled] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [hoveredHistoryId, setHoveredHistoryId] = useState<string | null>(null);
  const stickToBottomRef = useRef(true);
  const messageNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const historyItems = useMemo(() => msgs.filter((m) => m.role === 'user'), [msgs]);
  const hoveredHistoryIndex = historyItems.findIndex((message) => message.id === hoveredHistoryId);
  const isNearBottom = useCallback((el: HTMLDivElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight < 72, []);
  const updateScrollState = useCallback(() => {
    const el = streamRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    const readLine = el.getBoundingClientRect().top + Math.min(128, el.clientHeight * 0.28);
    let nearestId: string | null = null;
    let nearestDistance = Infinity;
    for (const message of historyItems) {
      const node = messageNodesRef.current.get(message.id);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      const distance = readLine < rect.top ? rect.top - readLine : readLine > rect.bottom ? readLine - rect.bottom : 0;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = message.id;
      }
    }
    setActiveHistoryId((current) => current === nearestId ? current : nearestId);
    setChatScrolled(el.scrollTop > 0);
    stickToBottomRef.current = near;
    setShowJumpBottom(!near);
    if (near) setUnreadCount(0);
  }, [historyItems, isNearBottom]);
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    updateScrollState();
  }, [updateScrollState]);
  const registerMessageNode = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) messageNodesRef.current.set(id, node);
    else messageNodesRef.current.delete(id);
  }, []);
  const jumpToMessage = useCallback((id: string) => {
    const node = messageNodesRef.current.get(id);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);
  /** 本轮是否已选中可预览主产物（HTML/PPT 等）；优先展示主产物，避免被后到的 .json/.log 覆盖 */
  const preferredOpened = useRef(false);
  /** 当前活跃会话 ref（避免 onEvent 闭包里 activeSession 过期） */
  const activeSessionRef = useRef<Session | null>(null);
  /** 运行中会话的消息缓存：切走再切回时恢复实时状态（后端只存最终结果） */
  const runMsgsCache = useRef<Map<string, Message[]>>(new Map());
  /** 按 sessionId 路由 agent 事件：每个会话的 send() 注册自己的 handler */
  const eventHandlers = useRef<Map<string, (e: AgentEvent) => void>>(new Map());

  // 可拖拽栏宽
  const [leftW, setLeftW] = useState(268);
  const [rightW, setRightW] = useState(492);
  const drag = useRef<{ which: 'L' | 'R'; startX: number; startW: number } | null>(null);

  // ===== 云端登录态 =====
  // 强制登录：有有效 token 才进主应用；无 token / token 失效 → 显示登录界面
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(getStoredUser());
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    if (getStoredToken()) {
      fetchMe()
        .then(setCloudUser)
        .catch(() => { cloudLogout(); setCloudUser(null); })
        .finally(() => setAuthReady(true));
    } else {
      setAuthReady(true);
    }
  }, []);

  // 同步 activeSession ref（onEvent 闭包用这个判断当前会话是否活跃）
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);

  // 全局事件路由：主进程给每个事件打了 sessionId，按 sessionId 分发给对应会话的 handler。
  // 解决切换会话后旧会话事件串到新会话 UI 的 bug。
  useEffect(() => {
    if (!isElectron) return;
    const superai = (window as any).superai;
    superai.onAgentEvent((e: AgentEvent) => {
      const sid = e.sessionId;
      const handler = sid ? eventHandlers.current.get(sid) : null;
      if (handler) handler(e);
    });
  }, []);
  const onLogoutCloud = useCallback(() => {
    cloudLogout();
    setCloudUser(null);
    setActiveSession(null);
    setIsSessionLoading(false);
    setMsgs([]);
    setSessions([]);
    setMode('empty');
  }, []);

  // 登录后/切换模型后：把云端 selected(含 apiKey) + 列表同步给主进程，agent:run 用云端模型发 LLM
  // 同时：若云端有 kind=image 且已配 Key 的图像模型，拉其明文凭证一并同步，
  // 主进程写入本地 settings.imageModel，image-gen 技能即可直接用（无需用户手动点“从云端同步”）
  const syncCloudModel = useCallback(async () => {
    if (!cloudUser) return;
    try {
      const [creds, models] = await Promise.all([getSelectedCredentials(), listModels()]);
      let imgCred = null;
      const img = models.find((m) => (m as any).kind === 'image' && m.hasKey);
      if (img) {
        try { imgCred = await getCredentials(img.id); } catch { /* 图像凭证拉取失败不阻塞对话模型同步 */ }
      }
      await (window as any).superai.cloud.model.sync(creds, models, imgCred);
    } catch { /* 静默：回退本地 settings */ }
  }, [cloudUser]);
  useEffect(() => { syncCloudModel(); }, [cloudUser, syncCloudModel]);

  const startResize = useCallback(
    (which: 'L' | 'R') => (e: React.MouseEvent) => {
      e.preventDefault();
      drag.current = { which, startX: e.clientX, startW: which === 'L' ? leftW : rightW };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        if (!drag.current) return;
        const dx = ev.clientX - drag.current.startX;
        if (drag.current.which === 'L') {
          setLeftW(Math.max(200, Math.min(440, drag.current.startW + dx)));
        } else {
          setRightW(Math.max(340, Math.min(720, drag.current.startW - dx)));
        }
      };
      const onUp = () => {
        drag.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [leftW, rightW],
  );

  const showToast = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 1800);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.uiTheme = uiTheme;
  }, [uiTheme]);

  const applyUiTheme = useCallback((theme: UiTheme) => {
    themeTouchedRef.current = true;
    setUiTheme(theme);
    localStorage.setItem('superai_ui_theme', theme);
    void saveSettings({ uiTheme: theme }).catch(() => showToast('主题已切换，但保存失败'));
  }, [showToast]);

  // 加载工作目录的真实文件树
  const loadFileTree = useCallback(async (ws?: string) => {
    if (!isElectron) return;
    const dir = ws || workspace;
    if (!dir) return;
    try {
      // 边界 = 要浏览的目录本身。不能用闭包里的 workspace state 做边界——
      // 切换目录时 setWorkspace 和 loadFileTree 在同一 tick，闭包里还是旧目录，
      // 会把新目录判成「越界」导致读取失败。
      const files = await listFiles(dir, dir);
      setFileTree(files);
    } catch (e) {
      showToast('读取目录失败');
    }
  }, [workspace, showToast]);

  // 打开文件：读内容 → 按扩展名自动选预览/源码面板
  const onOpenFile = useCallback(async (path: string) => {
    if (!isElectron) return;
    try {
      const ext = (path.split('.').pop() || '').toLowerCase();
      // 二进制/预览类格式（pptx/pdf/图片/HTML 等）不需要文本内容：PptxPreview 自己读字节，
      // 图片/PDF/HTML 走 superai-preview 协议。readFile 对 >1MB 文件会抛“文件过大”，
      // 这里跳过，避免大 HTML/pptx 点击即“读取文件失败”。
      const skipRead = ['pptx','ppt','docx','doc','xlsx','xls','pdf','png','jpg','jpeg','gif','webp','bmp','avif','html','htm','svg'];
      let content = '';
      if (!skipRead.includes(ext)) {
        content = await readFile(path, workspace);
      }
      setActiveFile({ name: path.split(/[\\/]/).pop() || path, path });
      setFileContent(content);
      // 按扩展名自动选面板：HTML/SVG/MD/PDF → 预览；Office(pptx/docx/xlsx) → 预览（走兑底卡）；其他 → 源码。
      const previewable = ['html', 'htm', 'svg', 'md', 'markdown', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls'];
      setPane(previewable.includes(ext) ? 'preview' : 'code');
      setMode('main');
    } catch (e) {
      showToast('读取文件失败');
    }
  }, [workspace, showToast]);

  // 初始化菜单、默认工作目录和偏好。会话恢复在 pickSession 声明之后执行，避免 TDZ。
  useEffect(() => {
    if (!isElectron) return;
    getDefaultWorkspace().then((ws) => {
      setWorkspace(ws);
      if (ws) loadFileTree(ws);
    });
    getSettings().then((st) => {
      setAutoExec(!!st.autoExec);
      if (!themeTouchedRef.current) {
        const cached = localStorage.getItem('superai_ui_theme');
        const savedTheme = cached === 'warm' || cached === 'mist' || cached === 'night' ? cached : st.uiTheme || 'warm';
        setUiTheme(savedTheme);
      }
    });
    onMenu((action) => {
      if (action === 'settings') setSettingsOpen(true);
      else if (action === 'about') showToast('SuperAI · 本地 AI 工作台 v1.0.0');
    });
  }, [loadFileTree, showToast]);

  // 刷新会话列表（从存储重读）
  const refreshSessions = useCallback(async () => {
    if (!isElectron) return;
    const list = await listSessions();
    setSessions(list);
  }, []);

  // 选工作目录（右栏空态 / 标题栏路径点击）
  const onPickWorkspace = useCallback(async () => {
    if (!isElectron) return;
    const dir = await pickDirectory();
    if (!dir) return;
    // 乐观更新：UI 立即切换显示 + 文件树，不等写回，保证「点了就变」
    setWorkspace(dir);
    loadFileTree(dir);

    const id = activeSession?.id;
    if (!id) {
      // 无活动会话（空态）：仅临时设为当前显示目录，不写 settings.workspace。
      // 此时发消息建会话仍用此目录，但「新建对话」按钮走安装目录默认。
      return;
    }
    // 有活动会话：只改当前会话工作目录，绝不写全局默认，
    // 否则新建会话会继承这个临时改的目录，而不是安装目录下的默认工作目录。
    const ephemeral = id.startsWith('temp-') || id.startsWith('mock-');
    try {
      if (ephemeral) {
        // 临时会话还没真正落库：以该目录创建真实会话（创建即带 workspace），并替换活动会话 id
        const created = await createSession(dir);
        setActiveSession((s) => (s && s.id === id ? { ...s, id: created.id, workspace: created.workspace || dir } : s));
        refreshSessions();
      } else {
        await setSessionWorkspace(id, dir);
      }
    } catch (e: any) {
      showToast('工作目录已切换，但同步会话存储失败：' + (e?.message || '未知'));
    }
  }, [loadFileTree, activeSession, showToast, refreshSessions]);

  const openSide = () => setSide('on');

  // 打开设置（可指定初始 tab）
  const openSettings = useCallback((tab: SettingsTab = 'models') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  // 自动执行开关：本地即时切换 + 持久化到 settings
  const onToggleAuto = useCallback(() => {
    setAutoExec((v) => {
      const next = !v;
      saveSettings({ autoExec: next });
      return next;
    });
  }, []);

  // §6.3 动作路由
  const handleAction = useCallback(
    (act: string) => {
      if (act.startsWith('preview:')) {
        const p = act.slice(8);
        void onOpenFile(p);
        setPane('preview');
        setMode('main');
      } else if (act.startsWith('sysopen:')) {
        const p = act.slice(8);
        void openSystemFile(p, workspace).then(r => showToast(r?.ok ? '已用系统默认程序打开' : '打开失败：' + (r?.error || '未知')));
      } else if (act.startsWith('download:')) {
        const p = act.slice(9);
        void saveFileAs(p, workspace).then(r => showToast(r?.ok ? '已另存为：' + (r.dest || '') : r?.error === '取消' ? '已取消' : '下载失败：' + (r?.error || '未知')));
      } else if (act.startsWith('open:')) {
        setPane(act.slice(5) as Pane);
        setMode('main');
      } else if (act === 'undo') {
        showToast('已撤销这次修改');
      } else if (act.startsWith('toast:')) {
        showToast(act.slice(6));
      }
    },
    [showToast, onOpenFile, workspace],
  );

  const pickSession = useCallback(async (s: Session) => {
    // 先同步 ref，再启动异步读取，避免旧会话请求覆盖用户刚选中的会话。
    const requestedId = s.id;
    activeSessionRef.current = s;
    setActiveSession(s);
    setPane('tree');
    setMode('main');
    if (isElectron) {
      // 切到正在运行的会话：从缓存恢复实时状态（后端只存最终结果，运行中消息还没落盘）
      if (runningSids.has(s.id) && runMsgsCache.current.has(s.id)) {
        setMsgs(runMsgsCache.current.get(s.id)!);
        setIsSessionLoading(false);
        const ws = s.workspace || '';
        setWorkspace(ws);
        if (ws) loadFileTree(ws);
        return;
      }
      setIsSessionLoading(true);
      try {
        const full = await getSession(requestedId);
        // 用户在读取期间切换了另一个会话时，丢弃这次旧请求的结果。
        if (activeSessionRef.current?.id !== requestedId) return;
        if (full) {
          setMsgs(full.messages || []);
          // 空会话回到空态，不要留一片空白流
          if (!full.messages || full.messages.length === 0) setMode('empty');
          // 云端会话 workspace 在 Session 上，本地在 full 上
          const ws = full.workspace || s.workspace || '';
          // 始终同步当前显示，避免切到无工作目录的会话时残留上一个会话的目录
          setWorkspace(ws);
          if (ws) loadFileTree(ws);
        } else {
          setMsgs([]);
          setMode('empty');
        }
      } finally {
        if (activeSessionRef.current?.id === requestedId) setIsSessionLoading(false);
      }
    }
  }, [loadFileTree, runningSids]);

  // 会话列表异步加载后恢复左侧列表第一项（列表接口已按最新回复排序）。
  // 只执行一次，避免 pickSession 的状态依赖变化后重复覆盖用户手动选择。
  const sessionsRestoredRef = useRef(false);
  useEffect(() => {
    if (!isElectron || sessionsRestoredRef.current) return;
    let cancelled = false;
    listSessions().then((list) => {
      if (cancelled) return;
      // 先写入列表，再标记完成；StrictMode 或热更新重新执行时不会丢失列表。
      setSessions(list);
      if (!sessionsRestoredRef.current) {
        sessionsRestoredRef.current = true;
        const latest = list[0];
        if (latest) void pickSession(latest);
      }
    }).catch(() => {
      if (!cancelled) showToast('读取会话列表失败');
    });
    return () => { cancelled = true; };
  }, [pickSession, showToast]);

  const newChat = useCallback(async () => {
    // 保存当前会话草稿
    if (activeSession) draftCache.current.set(activeSession.id, draft);
    let sid = '';
    let ws = workspace;
    if (isElectron) {
      // 新建会话始终从全局默认目录开始，不继承当前会话切换过的目录
      const defWs = await getDefaultWorkspace();
      ws = defWs || workspace;
      if (ws) {
        const created = await createSession(ws);
        sid = created.id;
        if (created.workspace) ws = created.workspace;
      }
    }
    const s: Session = { id: sid || 'temp-' + Date.now(), title: '新对话', summary: '0 条消息', time: '刚刚', group: '其他', workspace: ws };
    setActiveSession(s);
    if (ws && ws !== workspace) { setWorkspace(ws); loadFileTree(ws); }
    setIsSessionLoading(false);
    setMode('empty');
    setPane('empty');
    setSide('on');
    setDraft('');
    setMsgs([]);
    refreshSessions();
  }, [workspace, refreshSessions, loadFileTree, activeSession, draft]);

  const onDeleteSession = useCallback(async (id: string) => {
    if (!isElectron) return;
    await apiDeleteSession(id);
    if (activeSession?.id === id) {
      setActiveSession(null);
      setIsSessionLoading(false);
      setMode('empty');
      setMsgs([]);
    }
    refreshSessions();
  }, [activeSession, refreshSessions]);

  // 重命名会话（侧栏行内编辑提交）
  const onRenameSession = useCallback(async (id: string, title: string) => {
    if (!isElectron) return;
    await apiRenameSession(id, title);
    refreshSessions();
    if (activeSession?.id === id) setActiveSession({ ...activeSession, title });
  }, [activeSession, refreshSessions]);

  // 置顶/取消置顶会话
  const onTogglePin = useCallback(async (id: string, pinned: boolean) => {
    if (!isElectron) return;
    await togglePinSession(id, pinned);
    refreshSessions();
  }, [refreshSessions]);

  const pickSuggestion = useCallback((text: string) => {
    setDraft(text);
    setMode('main');
    setPane('tree');
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.cbox textarea')?.focus();
    });
  }, []);

  useEffect(() => {
    if (mode !== 'main') return;
    let frame = 0;
    const scrollLatest = () => {
      const el = streamRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      updateScrollState();
    };
    // 会话切换后等待消息节点完成布局，再执行两次定位，确保回到最新消息。
    frame = requestAnimationFrame(() => {
      scrollLatest();
      frame = requestAnimationFrame(() => {
        scrollLatest();
        frame = requestAnimationFrame(scrollLatest);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSession?.id, msgs.length, mode, isSessionLoading, updateScrollState]);


  // 更新最后一条 agent 消息
  const updateLastAgent = useCallback((fn: (m: Extract<Message, { role: 'agent' }>) => Extract<Message, { role: 'agent' }>, eventSid?: string) => {
    const sid = eventSid;
    // 更新运行中会话的消息缓存（始终更新，保证切回时状态最新）
    if (sid && runMsgsCache.current.has(sid)) {
      const cached = runMsgsCache.current.get(sid)!;
      const idx = [...cached].reverse().findIndex((m) => m.role === 'agent');
      if (idx !== -1) {
        const realIdx = cached.length - 1 - idx;
        const target = cached[realIdx];
        if (target.role === 'agent') {
          const next = [...cached];
          next[realIdx] = fn(target);
          runMsgsCache.current.set(sid, next);
        }
      }
    }
    // 更新 UI（仅当运行中会话是当前活跃会话时）
    if (sid === activeSessionRef.current?.id) {
      setMsgs((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m.role === 'agent');
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const target = prev[realIdx];
        if (target.role !== 'agent') return prev;
        const next = [...prev];
        next[realIdx] = fn(target);
        return next;
      });
    }
  }, []);

  /** 把仍在 running 的步骤标记为 done（取消/收尾时用） */
  const markStepsSettled = useCallback((m: Extract<Message, { role: 'agent' }>): Step[] =>
    (m.steps || []).map((st) => (st.status === 'running' ? { ...st, status: 'done' as const } : st)),
  []);

  // 「停止」按钮：强杀当前会话的 dsh runtime（协议无 wire 级 cancel）
  const onCancelRun = useCallback(async () => {
    const sid = activeSession?.id || '';
    if (!sid || !runningSids.has(sid)) return;
    const r = await cancelAgent(sid);
    if (!r.ok) showToast(r.error || '没有正在运行的任务');
  }, [activeSession, runningSids, showToast]);

  // 插话：运行中发送，注入当前回合引导 AI（不打断）。
  // 消息立即上屏 + 存盘；dsh 侧走 followup → inbox，步骤间隙被拾取。
  const onSteer = useCallback(async () => {
    const txt = draft.trim();
    if (!txt || !runningSids.has(activeSession?.id || '')) return;
    const sid = activeSession?.id || '';
    setDraft('');
    const userMsg: Message = { id: nid(), role: 'user', time: '刚刚', text: txt, createdAt: Date.now() };
    setMsgs((prev) => [...prev, userMsg]);
    // 同步更新运行中会话的消息缓存（steer 的用户消息也要进缓存）
    if (sid && runMsgsCache.current.has(sid)) {
      const cached = runMsgsCache.current.get(sid)!;
      runMsgsCache.current.set(sid, [...cached, userMsg]);
    }
    if (sid) appendSessionMessage(sid, userMsg);
    const r = await steerAgent(sid || '', txt);
    if (!r.ok) {
      showToast(r.error || '插话失败');
      // 插话未送达时撤回本地乐观消息，避免历史与 UI 不一致。
      setMsgs((prev) => prev.filter((m) => m.id !== userMsg.id));
      if (sid && runMsgsCache.current.has(sid)) {
        const cached = runMsgsCache.current.get(sid)!;
        runMsgsCache.current.set(sid, cached.filter((m) => m.id !== userMsg.id));
      }
    } else showToast('已插入，AI 会在当前步骤间隙读取');
  }, [draft, runningSids, activeSession, showToast]);

  // 附件：选择 / 拖入（按 path 去重）
  // 上传文件复制一份进工作目录（成为工作区一等文件：文件树可见、agent 可读写），
  // 失败或无工作区时回退到原路径。复制后刷新文件树让副本立即出现。
  const copyIntoWorkspace = useCallback(async (p: PickedFile): Promise<PickedFile> => {
    if (!isElectron || !workspace) return p;
    const copy = await copyAttachmentIn(p.path, workspace);
    return copy ? { path: copy.path, name: copy.name, size: copy.size } : p;
  }, [workspace]);

  const onAttach = useCallback(async () => {
    const picked = await pickFiles();
    if (!picked || picked.length === 0) return;
    const mapped = await Promise.all(picked.map(copyIntoWorkspace));
    setAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.path));
      return [...prev, ...mapped.filter((p) => !seen.has(p.path))];
    });
    if (workspace) loadFileTree(workspace);
  }, [copyIntoWorkspace, workspace, loadFileTree]);

  const onDropFiles = useCallback(async (files: PickedFile[]) => {
    if (!files || files.length === 0) return;
    const mapped = await Promise.all(files.map(copyIntoWorkspace));
    setAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.path));
      return [...prev, ...mapped.filter((p) => !seen.has(p.path))];
    });
    if (workspace) loadFileTree(workspace);
  }, [copyIntoWorkspace, workspace, loadFileTree]);

  const onRemoveAttachment = useCallback((p: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== p));
  }, []);

  /** 把附件读成可注入模型 input 的文本块；返回注入块 + 用户消息里展示的元信息 */
  const buildAttachmentBlock = useCallback(async (): Promise<{
    block: string;
    meta: Array<{ name: string; size: string; kind: 'xls' | 'pdf' | 'img' | 'other' }>;
  }> => {
    let block = '';
    const meta: Array<{ name: string; size: string; kind: 'xls' | 'pdf' | 'img' | 'other' }> = [];
    if (attachments.length === 0) return { block, meta };
    const extOf = (name: string) => name.split('.').pop()?.toLowerCase() || '';
    const kindOf = (ext: string): 'xls' | 'pdf' | 'img' | 'other' =>
      ['xls', 'xlsx', 'csv'].includes(ext) ? 'xls'
      : ext === 'pdf' ? 'pdf'
      : ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext) ? 'img'
      : 'other';
    // 并行读取所有附件，再按原顺序拼装：原串行 for-await 每个附件一次 IPC 往返，
    // 挂 3 个附件就要等 3 次往返才发出主 prompt，拖慢首 token。
    const results = await Promise.all(attachments.map((a) => readAttachment(a.path)));
    results.forEach((r, i) => {
      const a = attachments[i];
      const kind = kindOf(extOf(a.name));
      if (r.error) {
        meta.push({ name: a.name, size: '读取失败', kind });
        return;
      }
      if (r.binary) {
        meta.push({ name: a.name, size: '二进制', kind });
        block += `\n<file path="${a.path}" note="binary ${r.size}B，内容未注入" />\n`;
        return;
      }
      meta.push({ name: a.name, size: r.truncated ? '已截断' : `${(a.size / 1024).toFixed(1)}K`, kind });
      block += `\n<file path="${a.path}"${r.truncated ? ' note="truncated 256KB"' : ''}>\n${r.content}\n</file>\n`;
    });
    return { block, meta };
  }, [attachments]);

  const send = useCallback(async () => {
    const txt = draft.trim();
    if (!txt || runningSids.has(activeSession?.id || '')) return;
    setDraft('');
    setMode('main');
    setRunningSids((prev) => new Set(prev).add(sid));

    // 确保有活动会话（空态 / 临时会话发送时自动创建真实会话）
    let sid = activeSession?.id || '';
    let ws = workspace;
    const ephemeral = !!sid && (sid.startsWith('temp-') || sid.startsWith('mock-'));
    if (isElectron && (!sid || ephemeral)) {
      const created = await createSession(ws);
      sid = created.id;
      if (created.workspace) ws = created.workspace;
      setActiveSession({ id: sid, title: '新对话', summary: '0 条消息', time: '刚刚', group: '其他', workspace: ws });
      refreshSessions();
    }
    preferredOpened.current = false;   // 新一轮：重置“主产物已选中”标记

    // 附件 → 注入块 + 用户消息展示元信息（读取失败不阻断发送）
    const { block: attachBlock, meta: attachMeta } = await buildAttachmentBlock();
    // 立即清空输入框附件预览：已捕获进注入块/用户消息元信息，无需等 AI 回复
    setAttachments([]);
    const sendText = attachBlock ? `${txt}\n${attachBlock}` : txt;

    // 添加用户消息 + 占位 agent 消息
    const userMsg: Message = {
      id: nid(), role: 'user', time: '刚刚', text: txt, createdAt: Date.now(),
      ...(attachMeta.length > 0 ? { attachments: attachMeta } : {}),
    };
    const runStartedAt = Date.now();
    const fmtElapsed = () => ((Date.now() - runStartedAt) / 1000).toFixed(1);
    // 不预置 steps：没有工具调用就不渲染步骤卡（避免「已执行 0 步」空卡）
    // 初始 phase=preparing（正在创建会话环境）；后续由主进程按 dsh 真实事件切换
    // waiting_model → thinking → finalizing，前端不再用固定定时器猜测。
    const agentMsg: Message = { id: nid(), role: 'agent', time: '处理中', text: '', phase: 'preparing', createdAt: Date.now() };
    setMsgs((prev) => [...prev, userMsg, agentMsg]);
    // 缓存运行中会话的消息：切走再切回时恢复实时状态（后端只存最终结果）
    runMsgsCache.current.set(sid, [...msgs, userMsg, agentMsg]);

    // 实时计时器：无工具调用时头部走秒（唯一耗时显示）；有步骤后耗时归步骤卡，
    // 头部只保留「处理中」，避免同一时刻出现两个耗时数字。
    const timer = setInterval(() => {
      updateLastAgent((m) => ({
        ...m,
        time: m.steps && m.steps.length > 0 ? '处理中' : `处理中 ${fmtElapsed()}s`,
        elapsed: fmtElapsed(),
      }), sid);
    }, 500);

    // 存盘：用户消息（附件只进本次发送，不持久化内容）
    if (sid) appendSessionMessage(sid, userMsg);

    // 本地副本跟踪 agent 最终状态（流式更新 state，结束时存盘）
    let agentFinal: Extract<Message, { role: 'agent' }> = agentMsg as Extract<Message, { role: 'agent' }>;

    // 发送后回到最新位置
    requestAnimationFrame(() => scrollToBottom('smooth'));

    // 构建历史（只取 role+content）
    const history = msgs
      .filter((m) => m.role === 'user' || m.role === 'agent')
      .map((m) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.role === 'user' ? m.text : (m.text || ''),
      }));

    // IPC 事件回调是同步 fire-and-forget（preload 里 _agentEventCb(event) 不 await），
    // 若 onEvent 是 async，多个 file 事件的 await 会交错：pptx 事件刚 await onOpenFile 挂起，
    // 图片事件就进来抢右栏。用 Promise 链串行化，保证事件一个处理完再处理下一个。
    let _evtChain: Promise<void> = Promise.resolve();
    const onEvent = (e: AgentEvent) => {
      _evtChain = _evtChain.then(() => processEvent(e)).catch(() => { /* 单条事件异常不阻塞后续 */ });
    };
    // 注册到全局路由器：主进程按 sessionId 分发事件到此处
    eventHandlers.current.set(sid, onEvent);
    const isActive = () => sid === activeSessionRef.current?.id;
    const processEvent = async (e: AgentEvent) => {
      if (e.type === 'text') {
        // 全量快照：直接替换（拼接会把多个快照变成重复文本）
        agentFinal = { ...agentFinal, text: e.text, phase: 'thinking' };
        updateLastAgent((m) => ({ ...m, text: e.text, phase: 'thinking' }), sid);
      } else if (e.type === 'phase') {
        // 主进程按 dsh 真实事件推送的阶段：preparing/waiting/thinking/finalizing
        agentFinal = { ...agentFinal, phase: e.phase };
        updateLastAgent((m) => ({ ...m, phase: e.phase }), sid);
        // 进入「正在整理结果」= 工具已全部跑完、模型在生成最终答复：
        // 把仍显示 running 的步骤卡收尾为 done（dsh 经常不发 tool/result，否则会一直转圈）
        if (e.phase === 'finalizing') {
          agentFinal = { ...agentFinal, steps: markStepsSettled(agentFinal) };
          updateLastAgent((m) => ({ ...m, steps: markStepsSettled(m) }), sid);
        }
      } else if (e.type === 'step') {
        // 按 index 匹配（label 带参数摘要，call/result 两阶段文案不同，不能按 label 匹配）
        const applySteps = (prev: Step[]): Step[] => {
          const ns = [...prev];
          const idx = e.index - 1;
          if (idx >= 0 && idx < ns.length) {
            ns[idx] = { ...ns[idx], status: e.status, duration: e.duration ?? ns[idx].duration, error: e.error, result: e.result ?? ns[idx].result };
          } else {
            ns.push({ label: e.label, status: e.status, duration: e.duration, error: e.error, result: e.result });
          }
          return ns;
        };
        agentFinal = { ...agentFinal, steps: applySteps(agentFinal.steps || []), phase: 'thinking' };
        updateLastAgent((m) => ({ ...m, steps: applySteps(m.steps || []), phase: 'thinking' }), sid);
      } else if (e.type === 'file') {
        showToast(`已${e.action}: ${e.name}`);
        // present_files：把本轮产出/修改的文件累积到当前 agent 消息的 produced 卡
        updateLastAgent((m) => {
          const arr = m.produced ? [...m.produced] : [];
          const ext = (e.name.split('.').pop() || '').toLowerCase();
          const kind = ['html','htm','svg'].includes(ext) ? 'html' : ['md','markdown'].includes(ext) ? 'md' : ['pptx','ppt'].includes(ext) ? 'pptx' : ext === 'pdf' ? 'pdf' : ['png','jpg','jpeg','gif','webp','bmp'].includes(ext) ? 'img' : ext === 'json' ? 'json' : 'file';
          // 同名去重（改后的覆盖原条目）
          const idx = arr.findIndex(x => x.name === e.name);
          const entry = { name: e.name, path: e.path, kind, action: e.action };
          if (idx >= 0) arr[idx] = entry; else arr.push(entry);
          return { ...m, produced: arr };
        }, sid);
        // 文件生成后刷新文件树（用本次运行的实际目录 ws，不用闭包里的 workspace state——
        // 空态首轮时 createSession 刚建目录，state 还没更新）
        // 先让右栏进入可见状态，再刷新目录树和读取内容；否则侧栏处于 off 时，
        // CSS 仍会把它移出布局，用户会感觉“没有自动展开”。
        // ⚠ 右栏操作仅在当前会话活跃时执行（切走后不抢 UI）
        if (isActive()) setRightSide('on');
        const fileExt = (e.name.split('.').pop() || '').toLowerCase();
        // 区分主产物与次级素材：
        //   主产物  = html/htm/svg/md/markdown/pdf/pptx/ppt/docx/doc/xlsx/xls —— 成果交付物
        //   素材    = png/jpg/jpeg/gif/webp/bmp/avif —— 插图、配图，服务于主产物
        // 一轮常连出多个文件（PPT 会连生成 goal.json、page-content-pack.json、
        // index.html，最后还可能补几张配图）。期望右栏稳定停在主产物（HTML），
        // 而不是被后到的 .json 或插图覆盖。
        // 规则：
        //   1) 主产物一来就打开并锁定（preferredOpened=true）；之后任何文件都不再抢右栏。
        //   2) 主产物尚未到来时，图片作兑底预览；主产物一到即覆盖图片并锁定。
        //   3) 非可预览（json/log/py…）仅在尚未打开任何东西时按源码打开，主产物已到则忽略。
        const PRIMARY = ['html', 'htm', 'svg', 'md', 'markdown', 'pdf', 'pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls'];
        const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'];
        const isPrimary = PRIMARY.includes(fileExt);
        const isImage = IMAGE.includes(fileExt);
        if (isPrimary) {
          // 先同步置锁再 await：防止 await 期间交错的图片事件抢右栏。
          // （事件已串行化，但保险起见仍先置锁，语义清晰）
          preferredOpened.current = true;
          if (isActive()) { setPane('preview'); await loadFileTree(ws); await onOpenFile(e.path); }
        } else if (isImage && !preferredOpened.current) {
          if (isActive()) { setPane('preview'); await loadFileTree(ws); await onOpenFile(e.path); }            // 主产物未到时图片兑底；主产物一到即覆盖
        } else if (!isPrimary && !isImage && !preferredOpened.current) {
          if (isActive()) { setPane('code'); await loadFileTree(ws); await onOpenFile(e.path); }            // 非可预览仅在尚未锁定时按源码打开
        }
      } else if (e.type === 'artifacts') {
        // dsh 有时不会为脚本直接落盘的 PPTX 发 file 事件；回合结束扫描到的成果
        // 通过 artifacts 事件补报。将主产物纳入 produced，并在前端统一按优先级打开。
        const PRIMARY = ['html', 'htm', 'svg', 'md', 'markdown', 'pdf', 'pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls'];
        const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'];
        const candidates = e.files || [];
        updateLastAgent((m) => {
          const arr = m.produced ? [...m.produced] : [];
          for (const f of candidates) {
            const ext = (f.name.split('.').pop() || '').toLowerCase();
            const kind = ['html','htm','svg'].includes(ext) ? 'html' : ['md','markdown'].includes(ext) ? 'md' : ['pptx','ppt'].includes(ext) ? 'pptx' : ext === 'pdf' ? 'pdf' : IMAGE.includes(ext) ? 'img' : ext === 'json' ? 'json' : 'file';
            const idx = arr.findIndex(x => x.name === f.name);
            const entry = { name: f.name, path: f.path, kind, action: f.action };
            if (idx >= 0) arr[idx] = entry; else arr.push(entry);
          }
          return { ...m, produced: arr };
        }, sid);
        const preferred = candidates
          .slice()
          .sort((a, b) => {
            const ae = (a.name.split('.').pop() || '').toLowerCase();
            const be = (b.name.split('.').pop() || '').toLowerCase();
            const ai = PRIMARY.indexOf(ae); const bi = PRIMARY.indexOf(be);
            return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
          })
          .find((f) => PRIMARY.includes((f.name.split('.').pop() || '').toLowerCase()));
        if (preferred) {
          preferredOpened.current = true;
          if (isActive()) { setRightSide('on'); setPane('preview'); await loadFileTree(ws); await onOpenFile(preferred.path); }
        }
      } else if (e.type === 'done') {
        agentFinal = { ...agentFinal, time: '刚刚', elapsed: fmtElapsed(), phase: undefined };
        updateLastAgent((m) => ({ ...m, time: '刚刚', elapsed: fmtElapsed(), phase: undefined }), sid);
      } else if (e.type === 'cancelled') {
        // 用户点了「停止」：保留已有文本，running 步骤标记为完成
        showToast('已停止');
        agentFinal = { ...agentFinal, time: '刚刚', elapsed: fmtElapsed(), steps: markStepsSettled(agentFinal), phase: undefined };
        updateLastAgent((m) => ({ ...m, time: '刚刚', elapsed: fmtElapsed(), steps: markStepsSettled(m), phase: undefined }), sid);
      } else if (e.type === 'error') {
        showToast(e.message);
        agentFinal = { ...agentFinal, text: (agentFinal.text || '') + `\n\n⚠ ${e.message}`, time: '刚刚', elapsed: fmtElapsed(), steps: markStepsSettled(agentFinal) };
        updateLastAgent((m) => ({ ...m, text: (m.text || '') + `\n\n⚠ ${e.message}`, time: '刚刚', elapsed: fmtElapsed(), steps: markStepsSettled(m) }), sid);
      }
      if (isActive() && stickToBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom('smooth'));
      } else if (isActive()) {
        setShowJumpBottom(true);
        setUnreadCount((n) => n + 1);
      }
    };

    // sessionId 透传：dsh 侧同一会话复用同一 session，自行维护多轮上下文
    try {
      const result = await runAgent(sendText, history, ws, onEvent, sid || undefined);
      // 等事件链排空：runAgent 返回只表示主进程已结束发事件，串行的 processEvent
      // 可能还在处理最后几条 file/done（含 loadFileTree/onOpenFile 的 await）。
      // 不等的话存盘会漏掉最后这批事件的影响（如最终产物的 produced 卡）。
      await _evtChain;
      // 兑底收尾：done 事件经 webContents.send（通知通道）与 agent:run 的 invoke 响应
      // （handle 响应通道）走不同 IPC 通道，不保证 done 一定先于 invoke 响应到达。
      // 若 done 迟到，agentFinal 会停留在 '处理中'/'finalizing' 就被 appendSessionMessage
      // 存盘（实测 PPT 那轮中招：文本/步骤都对，但 time='处理中'/phase='finalizing'）。
      // 存盘前无条件收尾，不再依赖 done 事件的到达时序。与 done/cancelled 事件里的
      // 同样操作幂等，重复执行无副作用。
      agentFinal = { ...agentFinal, time: '刚刚', elapsed: fmtElapsed(), phase: undefined, steps: markStepsSettled(agentFinal) };
      updateLastAgent((m) => ({ ...m, time: '刚刚', elapsed: fmtElapsed(), phase: undefined, steps: markStepsSettled(m) }), sid);
      // '已停止' = 用户主动取消（cancelled 事件已提示），不当错误重复弹Toast
      if (result.error && result.error !== '已停止') {
        showToast(result.error);
        agentFinal = { ...agentFinal, text: (agentFinal.text || '') + `\n\n⚠ ${result.error}` };
        updateLastAgent((m) => ({ ...m, text: (m.text || '') + `\n\n⚠ ${result.error}` }), sid);
      }
      // 存盘：最终 agent 消息
      if (sid) appendSessionMessage(sid, agentFinal);
      refreshSessions();
    } finally {
      clearInterval(timer);
      eventHandlers.current.delete(sid);
      runMsgsCache.current.delete(sid);
      setRunningSids((prev) => { const n = new Set(prev); n.delete(sid); return n; });
    }
  }, [draft, runningSids, activeSession, workspace, msgs, attachments, showToast, updateLastAgent, markStepsSettled, refreshSessions, loadFileTree, buildAttachmentBlock, onOpenFile, scrollToBottom]);

  const isRunningHere = !!activeSession && runningSids.has(activeSession.id);

  const chatMeta =
    mode === 'empty'
      ? '开始一段新对话'
      : isRunningHere
      ? '正在处理…'
      : `${msgs.length} 条消息${autoExec ? ' · 自动执行已开启' : ''}`;

  if (!authReady) {
    return <Splash status="正在校验登录" />;
  }
  if (!cloudUser) {
    return <LoginScreen onSuccess={setCloudUser} />;
  }
  return (
    <div className="app" data-side={side} data-right={rightSide} data-screen={mode} data-output-max={outputMax ? 'on' : 'off'} style={{ '--left-w': leftW + 'px', '--right-w': rightW + 'px' } as React.CSSProperties}>
      <header className="appbar">
        <button className="menu-btn" onClick={() => menuPopup('编辑')}>编辑</button>
        <button className="menu-btn" onClick={() => menuPopup('窗口')}>窗口</button>
        <button className="menu-btn" onClick={() => menuPopup('帮助')}>帮助</button>
        <div className="appbar-drag" />
      </header>

      <main className="workspace">
        <SessionSidebar
          activeSessionId={activeSession ? activeSession.id : ''}
          sessions={sessions}
          onPickSession={pickSession}
          onNewChat={newChat}
          onCollapse={() => setSide('off')}
          onOpenSettings={() => openSettings('models')}
          onDeleteSession={onDeleteSession}
          onRenameSession={onRenameSession}
          onTogglePin={onTogglePin}
          fileTree={fileTree}
          onOpenFile={onOpenFile}
          cloudUser={cloudUser}
          onLogout={onLogoutCloud}
        />

        <div className="resizer left" onMouseDown={startResize('L')} title="拖拽调节宽度" />

        <section className="chat">
          <ChatHeader
            title={mode === 'empty' || !activeSession ? '新对话' : activeSession.title}
            meta={chatMeta}
            scrolled={mode !== 'empty' && chatScrolled}
            side={side}
            onOpenSide={openSide}
            workspace={workspace}
            onPickWorkspace={onPickWorkspace}
            rightSide={rightSide}
            onOpenRight={() => setRightSide('on')}
          />

          {isSessionLoading ? (
            <div className="stream session-loading" role="status" aria-live="polite" aria-label="正在加载会话">
              <ChatSkeleton />
            </div>
          ) : mode === 'empty' ? (
            <EmptyState onPick={pickSuggestion} />
          ) : (
            <div
              className="stream"
              ref={streamRef}
              onScroll={updateScrollState}
            >
              <ChatStream messages={msgs} onAction={handleAction} registerMessageNode={registerMessageNode} user={cloudUser} assistantAvatar="/avatar-superai.svg" />
              {showJumpBottom && (
                <button className="jump-bottom" onClick={() => scrollToBottom('smooth')} aria-label="回到最新消息">
                  <span className="jump-arrow">↓</span>
                  {unreadCount > 0 && <span className="jump-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                </button>
              )}
              <div className="history-rail">
                <div
                  className="history-rail-track"
                  role="navigation"
                  aria-label="消息位置"
                  style={{ height: `${Math.min(224, Math.max(72, historyItems.length * 8))}px` }}
                >
                  {historyItems.map((m, i) => {
                    const distance = hoveredHistoryIndex < 0 ? Infinity : Math.abs(i - hoveredHistoryIndex);
                    const tickState = distance === 0
                      ? 'focused'
                      : distance === 1
                      ? 'neighbor'
                      : hoveredHistoryIndex < 0 && m.id === activeHistoryId
                      ? 'current'
                      : '';
                    const speaker = m.role === 'user' ? '你' : 'SuperAI';
                    const preview = (m.text || '').replace(/\s+/g, ' ').slice(0, 48) || '处理中…';
                    return (
                      <button
                        key={m.id}
                        className={`history-tick ${tickState}`}
                        type="button"
                        title={`${speaker} · ${preview}`}
                        aria-label={`跳到第 ${i + 1} 条消息：${speaker}，${preview}`}
                        onMouseEnter={() => setHoveredHistoryId(m.id)}
                        onMouseLeave={() => setHoveredHistoryId(null)}
                        onFocus={() => setHoveredHistoryId(m.id)}
                        onBlur={() => setHoveredHistoryId(null)}
                        onClick={() => jumpToMessage(m.id)}
                      >
                        <span className="history-tick-bar" aria-hidden="true" />
                        {tickState === 'focused' && (
                          <span className="history-tick-preview" role="tooltip">
                            <strong>{speaker} · {i + 1}</strong>
                            <span>{preview}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            onSteer={onSteer}
            onCancel={onCancelRun}
            running={isRunningHere}
            autoExec={autoExec}
            onToggleAuto={onToggleAuto}
            workspace={workspace}
            onOpenSettings={() => openSettings('models')}
            onOpenSkills={() => openSettings('skills')}
            onAttach={onAttach}
            attachments={attachments}
            onRemoveAttachment={onRemoveAttachment}
            onDropFiles={onDropFiles}
          />
        </section>

        <div className="resizer right" onMouseDown={startResize('R')} title="拖拽调节宽度" />

        <OutputPanel
          pane={pane}
          setPane={setPane}
          hasContent={mode === 'main'}
          workspace={workspace}
          onPickWorkspace={onPickWorkspace}
          fileTree={fileTree}
          activeFile={activeFile}
          fileContent={fileContent}
          onOpenFile={onOpenFile}
          onToast={showToast}
          onCollapse={() => { setRightSide('off'); setOutputMax(false); }}
          onFileSaved={() => loadFileTree(workspace)}
          maximized={outputMax}
          onToggleMax={() => setOutputMax(v => !v)}
        />
      </main>

      {settingsOpen && <SettingsDialog initialTab={settingsTab} theme={uiTheme} onThemeChange={applyUiTheme} onClose={() => { setSettingsOpen(false); syncCloudModel(); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
