import { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';
import SessionSidebar from '../components/sidebar/SessionSidebar';
import ChatHeader from '../components/chat/ChatHeader';
import { ChatStream, EmptyState } from '../components/chat/ChatStream';
import Composer from '../components/chat/Composer';
import { OutputPanel } from '../components/output/OutputPanel';
import type { Pane } from '../components/output/OutputPanel';
import SettingsDialog from '../components/settings/SettingsDialog';
import type { Session, Message, Step, FileEntry } from '../types';
import { messages as mockMessages } from '../data/mock';
import {
  runAgent,
  isElectron,
  getDefaultWorkspace,
  onMenu,
  menuPopup,
  pickWorkspace,
  listFiles,
  readFile,
  listSessions,
  getSession,
  createSession,
  appendSessionMessage,
  deleteSession as apiDeleteSession,
  type AgentEvent,
} from '../data/api';

let _id = 100;
const nid = () => `n${_id++}`;

export default function App() {
  const [side, setSide] = useState<'on' | 'off'>('on');
  const [rightSide, setRightSide] = useState<'on' | 'off'>('on');
  const [pane, setPane] = useState<Pane>('tree');
  const [mode, setMode] = useState<'main' | 'empty'>(isElectron ? 'empty' : 'main');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [msgs, setMsgs] = useState<Message[]>(isElectron ? [] : mockMessages);
  const [draft, setDraft] = useState('');
  const [autoExec, setAutoExec] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [workspace, setWorkspace] = useState('');
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<{ name: string; path: string } | null>(null);
  const [fileContent, setFileContent] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);

  // 可拖拽栏宽
  const [leftW, setLeftW] = useState(268);
  const [rightW, setRightW] = useState(492);
  const drag = useRef<{ which: 'L' | 'R'; startX: number; startW: number } | null>(null);

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

  // 加载工作目录的真实文件树
  const loadFileTree = useCallback(async (ws?: string) => {
    if (!isElectron) return;
    const dir = ws || workspace;
    if (!dir) return;
    try {
      const files = await listFiles(dir || workspace, workspace);
      setFileTree(files);
    } catch (e) {
      showToast('读取目录失败');
    }
  }, [workspace, showToast]);

  // 打开文件：读内容 → 切到源码面板
  const onOpenFile = useCallback(async (path: string) => {
    if (!isElectron) return;
    try {
      const content = await readFile(path, workspace);
      setActiveFile({ name: path.split('/').pop() || path, path });
      setFileContent(content);
      setPane('code');
      setMode('main');
    } catch (e) {
      showToast('读取文件失败');
    }
  }, [workspace, showToast]);

  // 初始化：读工作目录 + 菜单事件桥接 + 加载会话列表
  useEffect(() => {
    if (!isElectron) return;
    getDefaultWorkspace().then((ws) => {
      setWorkspace(ws);
      if (ws) loadFileTree(ws);
    });
    listSessions().then(setSessions);
    onMenu((action) => {
      if (action === 'settings') setSettingsOpen(true);
      else if (action === 'about') showToast('SuperAI · 本地 AI 工作台 v1.0.0');
    });
  }, []);

  // 刷新会话列表（从存储重读）
  const refreshSessions = useCallback(async () => {
    if (!isElectron) return;
    const list = await listSessions();
    setSessions(list);
  }, []);

  // 设置关闭后刷新工作目录显示 + 重载文件树
  const onSettingsClose = useCallback(() => {
    setSettingsOpen(false);
    // 工作目录随会话，不随设置；无需重载
  }, []);

  // 选工作目录（右栏空态 / 标题栏路径点击）
  const onPickWorkspace = useCallback(async () => {
    if (!isElectron) return;
    const dir = await pickWorkspace(activeSession?.id);
    if (dir) {
      setWorkspace(dir);
      loadFileTree(dir);
    }
  }, [loadFileTree, activeSession]);

  const openSide = () => setSide('on');

  // §6.3 动作路由
  const handleAction = useCallback(
    (act: string) => {
      if (act.startsWith('open:')) {
        setPane(act.slice(5) as Pane);
        setMode('main');
      } else if (act === 'undo') {
        showToast('已撤销这次修改');
      } else if (act.startsWith('toast:')) {
        showToast(act.slice(6));
      }
    },
    [showToast],
  );

  const pickSession = useCallback(async (s: Session) => {
    setActiveSession(s);
    setPane('tree');
    setMode('main');
    // 加载该会话的消息历史 + 工作目录
    if (isElectron) {
      const full = await getSession(s.id);
      if (full) {
        setMsgs(full.messages || []);
        if (full.workspace) {
          setWorkspace(full.workspace);
          loadFileTree(full.workspace);
        }
      } else {
        setMsgs([]);
      }
    }
  }, [loadFileTree]);

  const newChat = useCallback(async () => {
    let sid = '';
    if (isElectron && workspace) {
      sid = await createSession(workspace);
    }
    const s: Session = { id: sid || 'temp-' + Date.now(), title: '新对话', summary: '0 条消息', time: '刚刚', group: '今天' };
    setActiveSession(s);
    setMode('empty');
    setPane('empty');
    setSide('on');
    setDraft('');
    setMsgs([]);
    refreshSessions();
  }, [workspace, refreshSessions]);

  const onDeleteSession = useCallback(async (id: string) => {
    if (!isElectron) return;
    await apiDeleteSession(id);
    if (activeSession?.id === id) {
      setActiveSession(null);
      setMode('empty');
      setMsgs([]);
    }
    refreshSessions();
  }, [activeSession, refreshSessions]);

  const pickSuggestion = useCallback((text: string) => {
    setDraft(text);
    setMode('main');
    setPane('tree');
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.cbox textarea')?.focus();
    });
  }, []);

  // 更新最后一条 agent 消息
  const updateLastAgent = useCallback((fn: (m: Extract<Message, { role: 'agent' }>) => Extract<Message, { role: 'agent' }>) => {
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
  }, []);

  const send = useCallback(async () => {
    const txt = draft.trim();
    if (!txt || running) return;
    setDraft('');
    setMode('main');
    setRunning(true);

    // 确保有活动会话（空态发送时自动创建）
    let sid = activeSession?.id || '';
    if (isElectron && !sid && workspace) {
      sid = await createSession(workspace);
      setActiveSession({ id: sid, title: '新对话', summary: '0 条消息', time: '刚刚', group: '今天' });
      refreshSessions();
    }

    // 添加用户消息 + 占位 agent 消息
    const userMsg: Message = { id: nid(), role: 'user', time: '刚刚', text: txt };
    const agentMsg: Message = { id: nid(), role: 'agent', time: '处理中', text: '', steps: [] };
    setMsgs((prev) => [...prev, userMsg, agentMsg]);

    // 存盘：用户消息
    if (sid) appendSessionMessage(sid, userMsg);

    // 本地副本跟踪 agent 最终状态（流式更新 state，结束时存盘）
    let agentFinal: Extract<Message, { role: 'agent' }> = agentMsg as Extract<Message, { role: 'agent' }>;

    // 滚动到底
    requestAnimationFrame(() => {
      streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
    });

    // 构建历史（只取 role+content）
    const history = msgs
      .filter((m) => m.role === 'user' || m.role === 'agent')
      .map((m) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.role === 'user' ? m.text : (m.text || ''),
      }));

    const onEvent = (e: AgentEvent) => {
      if (e.type === 'text') {
        agentFinal = { ...agentFinal, text: (agentFinal.text || '') + e.delta };
        updateLastAgent((m) => ({ ...m, text: (m.text || '') + e.delta }));
      } else if (e.type === 'step') {
        const steps = [...(agentFinal.steps || [])];
        const existing = steps.find((s) => s.label === e.label);
        if (existing) {
          existing.status = e.status;
          existing.duration = e.duration;
        } else {
          steps.push({ label: e.label, status: e.status, duration: e.duration } as Step);
        }
        agentFinal = { ...agentFinal, steps };
        updateLastAgent((m) => { /* 同步 */ const ns = [...(m.steps || [])]; const ex = ns.find((s) => s.label === e.label); if (ex) { ex.status = e.status; ex.duration = e.duration; } else ns.push({ label: e.label, status: e.status, duration: e.duration } as Step); return { ...m, steps: ns }; });
      } else if (e.type === 'file') {
        showToast(`已生成: ${e.name}`);
        // 文件生成后刷新文件树
        loadFileTree(workspace);
      } else if (e.type === 'done') {
        agentFinal = { ...agentFinal, time: '刚刚' };
        updateLastAgent((m) => ({ ...m, time: '刚刚' }));
      } else if (e.type === 'error') {
        showToast(e.message);
        agentFinal = { ...agentFinal, text: (agentFinal.text || '') + `\n\n⚠ ${e.message}`, time: '刚刚' };
        updateLastAgent((m) => ({ ...m, text: (m.text || '') + `\n\n⚠ ${e.message}`, time: '刚刚' }));
      }
      requestAnimationFrame(() => {
        streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
      });
    };

    const result = await runAgent(txt, history, workspace, onEvent);
    if (result.error) {
      showToast(result.error);
      agentFinal = { ...agentFinal, text: (agentFinal.text || '') + `\n\n⚠ ${result.error}`, time: '刚刚' };
      updateLastAgent((m) => ({ ...m, text: (m.text || '') + `\n\n⚠ ${result.error}`, time: '刚刚' }));
    }
    // 存盘：最终 agent 消息
    if (sid) appendSessionMessage(sid, agentFinal);
    refreshSessions();
    setRunning(false);
  }, [draft, running, activeSession, workspace, msgs, showToast, updateLastAgent, refreshSessions, loadFileTree]);

  const chatMeta =
    mode === 'empty'
      ? '开始一段新对话'
      : running
      ? '正在处理…'
      : `${msgs.length} 条消息${autoExec ? ' · 自动执行已开启' : ''}`;

  return (
    <div className="app" data-side={side} data-right={rightSide} data-screen={mode} style={{ '--left-w': leftW + 'px', '--right-w': rightW + 'px' } as React.CSSProperties}>
      <header className="appbar">
        <button className="menu-btn" onClick={() => menuPopup('编辑')}>编辑</button>
        <button className="menu-btn" onClick={() => menuPopup('窗口')}>窗口</button>
        <button className="menu-btn" onClick={() => menuPopup('帮助')}>帮助</button>
        <div className="appbar-drag" />
      </header>

      <main className="workspace">
        <SessionSidebar
          activeSessionId={mode === 'empty' || !activeSession ? '' : activeSession.id}
          sessions={sessions}
          onPickSession={pickSession}
          onNewChat={newChat}
          onCollapse={() => setSide('off')}
          onOpenSettings={() => setSettingsOpen(true)}
          onDeleteSession={onDeleteSession}
        />

        <div className="resizer left" onMouseDown={startResize('L')} title="拖拽调节宽度" />

        <section className="chat">
          <ChatHeader
            title={mode === 'empty' || !activeSession ? '新对话' : activeSession.title}
            meta={chatMeta}
            side={side}
            onOpenSide={openSide}
            workspace={workspace}
            onPickWorkspace={onPickWorkspace}
            rightSide={rightSide}
            onOpenRight={() => setRightSide('on')}
          />

          {mode === 'empty' ? (
            <EmptyState onPick={pickSuggestion} />
          ) : (
            <div className="stream" ref={streamRef}>
              <ChatStream messages={msgs} onAction={handleAction} />
            </div>
          )}

          <Composer
            value={draft}
            onChange={setDraft}
            onSend={send}
            autoExec={autoExec}
            onToggleAuto={() => setAutoExec((v) => !v)}
            workspace={workspace}
            onOpenSettings={() => setSettingsOpen(true)}
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
          onCollapse={() => setRightSide('off')}
        />
      </main>

      {settingsOpen && <SettingsDialog onClose={onSettingsClose} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
