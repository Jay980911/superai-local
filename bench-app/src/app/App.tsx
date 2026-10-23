import { useState, useRef, useCallback } from 'react';
import './App.css';
import WindowChrome from '../components/chrome/WindowChrome';
import SessionSidebar from '../components/sidebar/SessionSidebar';
import ChatHeader from '../components/chat/ChatHeader';
import { ChatStream, EmptyState } from '../components/chat/ChatStream';
import Composer from '../components/chat/Composer';
import { OutputPanel } from '../components/output/OutputPanel';
import type { Pane } from '../components/output/OutputPanel';
import SettingsDialog from '../components/settings/SettingsDialog';
import type { Session, Message, Step } from '../types';
import {
  getSessions as fetchSessions,
  getInitialMessages,
  runAgent,
  isElectron,
  type AgentEvent,
} from '../data/api';

const allSessions = fetchSessions();
const initialMessages = getInitialMessages();

let _id = 100;
const nid = () => `n${_id++}`;

export default function App() {
  const [side, setSide] = useState<'on' | 'off'>('on');
  const [pane, setPane] = useState<Pane>('tree');
  const [mode, setMode] = useState<'main' | 'empty'>(isElectron ? 'empty' : 'main');
  const [activeSession, setActiveSession] = useState<Session>(allSessions[0]);
  const [msgs, setMsgs] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [autoExec, setAutoExec] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [running, setRunning] = useState(false);
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

  const openCode = useCallback(() => {
    setPane('code');
    setMode('main');
  }, []);

  const pickSession = useCallback((s: Session) => {
    setActiveSession(s);
    if (mode === 'empty') {
      setMode('main');
      setPane('tree');
    }
  }, [mode]);

  const newChat = useCallback(() => {
    setMode('empty');
    setPane('empty');
    setSide('on');
    setDraft('');
    setMsgs([]);
  }, []);

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

    // 添加用户消息 + 占位 agent 消息
    const userMsg: Message = { id: nid(), role: 'user', time: '刚刚', text: txt };
    const agentMsg: Message = { id: nid(), role: 'agent', time: '处理中', text: '', steps: [] };
    setMsgs((prev) => [...prev, userMsg, agentMsg]);

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
        updateLastAgent((m) => ({ ...m, text: (m.text || '') + e.delta }));
      } else if (e.type === 'step') {
        updateLastAgent((m) => {
          const steps = [...(m.steps || [])];
          const existing = steps.find((s) => s.label === e.label);
          if (existing) {
            existing.status = e.status;
            existing.duration = e.duration;
          } else {
            steps.push({ label: e.label, status: e.status, duration: e.duration } as Step);
          }
          return { ...m, steps };
        });
      } else if (e.type === 'file') {
        showToast(`已生成: ${e.name}`);
      } else if (e.type === 'done') {
        updateLastAgent((m) => ({ ...m, time: '刚刚' }));
      } else if (e.type === 'error') {
        showToast(e.message);
        updateLastAgent((m) => ({ ...m, text: (m.text || '') + `\n\n⚠ ${e.message}`, time: '刚刚' }));
      }
      // 自动滚动
      requestAnimationFrame(() => {
        streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
      });
    };

    const result = await runAgent(txt, history, onEvent);
    if (result.error) {
      showToast(result.error);
      updateLastAgent((m) => ({ ...m, text: (m.text || '') + `\n\n⚠ ${result.error}`, time: '刚刚' }));
    }
    setRunning(false);
  }, [draft, running, msgs, showToast, updateLastAgent]);

  const chatMeta =
    mode === 'empty'
      ? '开始一段新对话'
      : running
      ? '正在处理…'
      : `${msgs.length} 条消息${autoExec ? ' · 自动执行已开启' : ''}`;

  return (
    <div className="app" data-side={side} data-screen={mode} style={{ '--left-w': leftW + 'px', '--right-w': rightW + 'px' } as React.CSSProperties}>
      <WindowChrome onOpenSettings={() => setSettingsOpen(true)} />

      <main className="workspace">
        <SessionSidebar
          activeSessionId={mode === 'empty' ? '' : activeSession.id}
          onPickSession={pickSession}
          onNewChat={newChat}
          onCollapse={() => setSide('off')}
        />

        <div className="resizer left" onMouseDown={startResize('L')} title="拖拽调节宽度" />

        <section className="chat">
          <ChatHeader
            title={mode === 'empty' ? '新对话' : activeSession.title}
            meta={chatMeta}
            side={side}
            onOpenSide={openSide}
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
          />
        </section>

        <div className="resizer right" onMouseDown={startResize('R')} title="拖拽调节宽度" />

        <OutputPanel
          pane={pane}
          setPane={setPane}
          hasContent={mode === 'main'}
          onAction={handleAction}
          onOpenCode={openCode}
        />
      </main>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
