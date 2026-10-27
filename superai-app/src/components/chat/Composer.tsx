// 输入区 · §6
import { useState } from 'react';
import type { PickedFile } from '../../data/api';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / 1024 / 1024).toFixed(1)}M`;
}

export default function Composer({
  value,
  onChange,
  onSend,
  onSteer,
  onCancel,
  running,
  autoExec,
  onToggleAuto,
  workspace,
  onOpenSettings,
  onOpenSkills,
  onAttach,
  attachments,
  onRemoveAttachment,
  onDropFiles,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onSteer: () => void;
  onCancel: () => void;
  running: boolean;
  autoExec: boolean;
  onToggleAuto: () => void;
  workspace: string;
  onOpenSettings: () => void;
  onOpenSkills: () => void;
  onAttach: () => void;
  attachments: PickedFile[];
  onRemoveAttachment: (path: string) => void;
  onDropFiles: (files: PickedFile[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const dropped = files.map((f) => {
      const p = (window as any).superai?.getPathForFile?.(f) || '';
      return { path: p, name: f.name, size: f.size };
    }).filter((f) => f.path);
    if (dropped.length > 0) onDropFiles(dropped);
  };

  return (
    <div className="composer">
      <div className="inner">
        <div
          className={`cbox ${dragOver ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {attachments.length > 0 && (
            <div className="attach-row">
              <div className="attach-hint" style={{ width: '100%', fontSize: '10.5px', color: 'var(--ink-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                已保存到 工作目录/_attachments · 文本内容随消息发给 AI · 二进制仅存目录
              </div>
              {attachments.map((a) => (
                <span className="attach-chip" key={a.path} title={a.path}>
                  <span>📎</span>
                  <span className="an">{a.name}</span>
                  <span className="as">{fmtSize(a.size)}</span>
                  <button title="移除附件" onClick={() => onRemoveAttachment(a.path)}>×</button>
                </span>
              ))}
            </div>
          )}
          <textarea
            placeholder={running ? '运行中·可插话引导任务，或点 ■ 停止…' : '说说你想做什么… 也可以直接拖文件进来'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (running) onSteer();
                else onSend();
              }
            }}
          />
          <div className="ctools">
            <button className="tbtn b" onClick={onAttach} title="添加附件（保存到工作目录/_attachments，文本随消息发给 AI，二进制仅存目录）">＋ 附件</button>
            <button className="tbtn b" onClick={onOpenSkills} title="查看已安装的技能">✨ 技能</button>
            <button className="tbtn" onClick={onOpenSettings} title="模型设置">模型 ▾</button>
            <button className="tbtn" onClick={onToggleAuto} title="工具调用执行策略">
              <span className={`switch ${autoExec ? '' : 'off'}`} />自动执行
            </button>
            <div className="grow" />
            {running ? (
              <>
                <button
                  className="send steer"
                  title="插话：引导当前运行中的任务（不打断，AI 会在步骤间隙读取）"
                  onClick={onSteer}
                  disabled={!value.trim()}
                >↳ 插话</button>
                <button className="send stop" title="停止本轮运行" onClick={onCancel}>■</button>
              </>
            ) : (
              <button className="send" title="发送" onClick={onSend}>↑</button>
            )}
          </div>
        </div>
        <div className="cfoot">
          <span>{running ? '运行中 · 可插话引导，或点 ■ 停止' : 'ENTER 发送'}</span>
          {!running && <span>SHIFT+ENTER 换行</span>}
          <div style={{ flex: 1 }} />
          <span>读写范围 {workspace || '未选择'}</span>
        </div>
      </div>
    </div>
  );
}
