// 会话栏 268px · §6 左栏：品牌/搜索/会话分组/用户卡
import type { Session, SessionGroup } from '../../types';

const GROUP_ORDER: SessionGroup[] = ['今天', '昨天', '近 7 天', '更早'];

export default function SessionSidebar({
  activeSessionId,
  sessions,
  onPickSession,
  onNewChat,
  onCollapse,
  onOpenSettings,
  onDeleteSession,
}: {
  activeSessionId: string;
  sessions: Session[];
  onPickSession: (s: Session) => void;
  onNewChat: () => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  onDeleteSession: (id: string) => void;
}) {
  const byGroup = (g: SessionGroup) => sessions.filter((s) => s.group === g);

  return (
    <aside className="sessions">
      <div className="brandrow">
        <div className="logo">S</div>
        <div>
          <div className="nm">SuperAI</div>
          <div className="sub">local · desktop</div>
        </div>
        <div className="grow" />
        <button className="icon-btn" title="收起侧栏" onClick={onCollapse}>«</button>
      </div>

      <button className="new-chat" onClick={onNewChat}>＋ 新建对话</button>

      <div className="search">
        <span>⌕</span>搜索会话与文件<span className="k">⌘K</span>
      </div>

      <div className="side-scroll">
        {/* 会话分组 */}
        {GROUP_ORDER.map((g) => (
          <div key={g}>
            <div className="grp">
              <span className="up" style={{ flex: 1 }}>{g}</span>
              <span className="plus" title="新建">＋</span>
            </div>
            {byGroup(g).map((s) => (
              <div
                key={s.id}
                className={`srow ${s.id === activeSessionId ? 'on' : ''}`}
                onClick={() => onPickSession(s)}
              >
                <span className="tx">
                  <div className="t1">{s.title}</div>
                  <div className="t2">{s.summary}</div>
                </span>
                <span className="tm">{s.time}</span>
                <button className="more" title="删除" onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}>×</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="userbar">
        <div className="avatar">S</div>
        <div>
          <div className="u1">SuperAI</div>
          <div className="u2">本地版</div>
        </div>
        <div className="grow" />
        <button className="icon-btn" title="设置" onClick={onOpenSettings}>⚙</button>
      </div>
    </aside>
  );
}
