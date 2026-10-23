// 会话头部 · §6
import { WORKSPACE } from '../../data/mock';

export default function ChatHeader({
  title,
  meta,
  side,
  onOpenSide,
}: {
  title: string;
  meta: string;
  side: 'on' | 'off';
  onOpenSide: () => void;
}) {
  return (
    <div className="chat-head">
      <button
        className="icon-btn side-open"
        title="展开侧栏"
        onClick={onOpenSide}
        style={{ display: side === 'off' ? 'grid' : 'none' }}
      >
        ☰
      </button>
      <div>
        <div className="ttl">{title}</div>
        <div className="meta">{meta}</div>
      </div>
      <div className="grow" />
      <span className="chip dir">📁 {WORKSPACE}</span>
      <button className="icon-btn" title="在新窗口打开">↗</button>
      <button className="icon-btn" title="更多">⋯</button>
    </div>
  );
}
