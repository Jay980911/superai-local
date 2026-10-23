import { useState, useRef, useCallback } from 'react';
import './App.css';
import WindowChrome from '../components/chrome/WindowChrome';
import SessionSidebar from '../components/sidebar/SessionSidebar';
import ChatHeader from '../components/chat/ChatHeader';
import { ChatStream, EmptyState } from '../components/chat/ChatStream';
import Composer from '../components/chat/Composer';
import { OutputPanel } from '../components/output/OutputPanel';
import type { Pane } from '../components/output/OutputPanel';
import type { Session, Message } from '../types';
import { messages as initialMessages, sessions as allSessions } from '../data/mock';

let _id = 100;
const nid = () => `n${_id++}`;

export default function App() {
  const [side, setSide] = useState<'on' | 'off'>('on');
  const [pane, setPane] = useState<Pane>('tree');
  const [mode, setMode] = useState<'main' | 'empty'>('main');
  const [activeSession, setActiveSession] = useState<Session>(allSessions[0]);
  const [msgs, setMsgs] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [autoExec, setAutoExec] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
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
  }, []);

  const pickSuggestion = useCallback((text: string) => {
    setDraft(text);
    setMode('main');
    setPane('tree');
    // 聚焦输入框：靠浏览器原生 focus 钩子
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('.cbox textarea')?.focus();
    });
  }, []);

  const send = useCallback(() => {
    const txt = draft.trim() || '把这份汇报页导出成 PDF，顺便生成一页给客户看的摘要';
    setDraft('');
    setMode('main');
    const user: Message = { id: nid(), role: 'user', time: '刚刚', text: txt };
    const bot: Message = {
      id: nid(),
      role: 'agent',
      time: '处理中',
      text: '收到，正在拆解任务…（原型演示到此）',
    };
    setMsgs((prev) => [...prev, user, bot]);
    requestAnimationFrame(() => {
      streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
    });
  }, [draft]);

  const chatMeta =
    mode === 'empty'
      ? '开始一段新对话'
      : '今天 14:32 · 12 条消息 · 自动执行已开启';

  return (
    <div className="app" data-side={side} data-screen={mode} style={{ '--left-w': leftW + 'px', '--right-w': rightW + 'px' } as React.CSSProperties}>
      <WindowChrome />

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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
