// 输入区 · §6
export default function Composer({
  value,
  onChange,
  onSend,
  autoExec,
  onToggleAuto,
  workspace,
  onOpenSettings,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  autoExec: boolean;
  onToggleAuto: () => void;
  workspace: string;
  onOpenSettings: () => void;
}) {
  return (
    <div className="composer">
      <div className="inner">
        <div className="cbox">
          <textarea
            placeholder="说说你想做什么… 也可以直接拖文件进来"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <div className="ctools">
            <button className="tbtn b">＋ 附件</button>
            <button className="tbtn b">✨ 技能</button>
            <button className="tbtn" onClick={onOpenSettings} title="模型设置">模型 ▾</button>
            <button className="tbtn" onClick={onToggleAuto}>
              <span className={`switch ${autoExec ? '' : 'off'}`} />自动执行
            </button>
            <div className="grow" />
            <button className="send" title="发送" onClick={onSend}>↑</button>
          </div>
        </div>
        <div className="cfoot">
          <span>ENTER 发送</span>
          <span>SHIFT+ENTER 换行</span>
          <div style={{ flex: 1 }} />
          <span>读写范围 {workspace || '未选择'}</span>
        </div>
      </div>
    </div>
  );
}
