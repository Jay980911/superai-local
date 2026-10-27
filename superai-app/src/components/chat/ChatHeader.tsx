// 会话头部 · §6
export default function ChatHeader({
  title,
  meta,
  side,
  onOpenSide,
  workspace,
  onPickWorkspace,
  rightSide,
  onOpenRight,
}: {
  title: string;
  meta: string;
  side: 'on' | 'off';
  onOpenSide: () => void;
  workspace: string;
  onPickWorkspace: () => void;
  rightSide: 'on' | 'off';
  onOpenRight: () => void;
}) {
  const ws = workspace || '未选择工作目录';
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
      <span className="chip dir" title="点击更改工作目录" onClick={onPickWorkspace}>📁 {ws} ▾</span>
      <button
        className="icon-btn right-open"
        title="展开成果面板"
        onClick={onOpenRight}
        style={{ display: rightSide === 'off' ? 'grid' : 'none' }}
      >
        «
      </button>
    </div>
  );
}
