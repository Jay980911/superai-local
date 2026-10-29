// 会话头部 · §6
import { Folder } from '../icons/Icon';

export default function ChatHeader({
  title,
  meta,
  side,
  onOpenSide,
  workspace,
  onPickWorkspace,
  rightSide,
  onOpenRight,
  scrolled,
}: {
  title: string;
  meta: string;
  scrolled: boolean;
  side: 'on' | 'off';
  onOpenSide: () => void;
  workspace: string;
  onPickWorkspace: () => void;
  rightSide: 'on' | 'off';
  onOpenRight: () => void;
}) {
  const ws = workspace || '未选择工作目录';
  return (
    <div className={`chat-head ${scrolled ? 'scrolled' : ''}`}>
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
      <button className="chip dir" type="button" title="更改工作目录" aria-label={`工作目录：${ws}，点击更改`} onClick={onPickWorkspace}>
        <Folder size={14} />
        <span className="workspace-name">{ws}</span>
        <span className="workspace-chevron" aria-hidden="true">⌄</span>
      </button>
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
