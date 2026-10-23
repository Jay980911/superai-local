// 会话栏 268px · §6 左栏：品牌/搜索/智能体/会话分组/用户卡
import type { Session, SessionGroup } from '../../types';
import { sessions as allSessions } from '../../data/mock';
import { Sparkle } from '../icons/Icon';

const GROUP_ORDER: SessionGroup[] = ['智能体', '今天', '昨天', '近 7 天'];

const agentRows = [
  { label: '数据分析师', tag: '技能' },
  { label: '报告撰写', tag: '技能' },
  { label: '网页制作', tag: '技能' },
];

export default function SessionSidebar({
  activeSessionId,
  onPickSession,
  onNewChat,
  onCollapse,
}: {
  activeSessionId: string;
  onPickSession: (s: Session) => void;
  onNewChat: () => void;
  onCollapse: () => void;
}) {
  const byGroup = (g: SessionGroup) => allSessions.filter((s) => s.group === g);

  return (
    <aside className="sessions">
      <div className="brandrow">
        <div className="logo">案</div>
        <div>
          <div className="nm">案台</div>
          <div className="sub">bench · desktop</div>
        </div>
        <div className="grow" />
        <button className="icon-btn" title="收起侧栏" onClick={onCollapse}>«</button>
      </div>

      <button className="new-chat" onClick={onNewChat}>＋ 新建对话</button>

      <div className="search">
        <span>⌕</span>搜索会话与文件<span className="k">⌘K</span>
      </div>

      <div className="side-scroll">
        {/* 智能体分组 */}
        <div className="grp">
          <span className="up" style={{ flex: 1 }}>智能体</span>
          <span className="plus" title="添加">＋</span>
        </div>
        {agentRows.map((a) => (
          <div className="agent-row" key={a.label}>
            <span className="ic"><Sparkle size={18} /></span>
            {a.label}
            <span className="tag">{a.tag}</span>
          </div>
        ))}

        {/* 会话分组 */}
        {GROUP_ORDER.filter((g) => g !== '智能体').map((g) => (
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
                <span className="more" title="更多">⋯</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="userbar">
        <div className="avatar">周</div>
        <div>
          <div className="u1">周佳豪</div>
          <div className="u2">个人版 · 已登录</div>
        </div>
        <div className="grow" />
        <span className="upgrade">升级</span>
        <button className="icon-btn">⚙</button>
      </div>
    </aside>
  );
}
