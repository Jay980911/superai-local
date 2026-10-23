// 成果面板 · §6 右栏 492px
import type { GenFile } from '../../types';
import {
  genFiles,
  refFiles,
  previewData,
  codeLines,
  PROJECT,
} from '../../data/mock';
import { Folder, FileTypeIcon } from '../icons/Icon';

export type Pane = 'tree' | 'code' | 'preview' | 'empty';

function FileRow({
  f,
  active,
  onClick,
}: {
  f: GenFile;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className={`titem ${active ? 'on' : ''}`} onClick={onClick}>
      <span className="ind" />
      <span className={`ic2 ftype ${f.kind}`}>
        <FileTypeIcon kind={f.kind} size={20} />
      </span>
      <div>
        <div className="nm">{f.name}</div>
        <div className="sub">{f.desc}</div>
      </div>
      <div className="grow" />
      {f.isNew && <span className="badge-new">新</span>}
      <span className="sz">{f.size}</span>
    </div>
  );
}

export function TreePane({ onOpenCode, onAction }: { onOpenCode: () => void; onAction: (a: string) => void }) {
  return (
    <div className="opane on" data-opane="tree">
      <div className="tree-head">
        <div className="ic"><Folder size={20} /></div>
        <div>
          <div className="nm">{PROJECT}</div>
          <div className="sub">3 个文件 · 27 KB · 生成于今天 14:35</div>
        </div>
      </div>
      <div className="tlist">
        {genFiles.map((f, i) => (
          <FileRow key={f.name} f={f} active={i === 0} onClick={onOpenCode} />
        ))}
        <div className="grp" style={{ paddingLeft: 9 }}>
          <span className="up">引用 · 工作目录</span>
        </div>
        {refFiles.map((f) => (
          <FileRow key={f.name} f={f} />
        ))}
      </div>
      <div className="out-foot">
        <button className="btn pri" onClick={() => onAction('toast:下载全部')}>下载全部</button>
        <button className="btn" onClick={() => onAction('toast:导出 PDF')}>导出 PDF</button>
        <div className="grow" />
        <button className="icon-btn">＋</button>
        <button className="icon-btn">⋯</button>
      </div>
    </div>
  );
}

export function CodePane({ onAction }: { onAction: (a: string) => void }) {
  return (
    <div className="opane on" data-opane="code">
      <div className="code-bar">
        <div className="fn">
          <span className="ftype html" style={{ width: 22, height: 22 }}>
            <FileTypeIcon kind="html" size={22} />
          </span>
          index.html
        </div>
        <div className="grow" />
        <button className="btn" onClick={() => onAction('toast:已复制')}>复制</button>
        <button className="btn" onClick={() => onAction('toast:已下载')}>下载</button>
      </div>
      <div className="code">
        {codeLines.map((cl) => (
          <div className={`cl ${cl.cls ?? ''}`} key={cl.n}>
            <span className="ln">{cl.n}</span>
            <span className="gm" />
            <span className="src">{cl.src}</span>
            {cl.cls === 'hot' && (
              <span className="note">
                <span className="badge-new" style={{ letterSpacing: '.06em' }}>刚刚</span>标红华东区
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="code-foot">
        <span>UTF-8</span>
        <span>HTML</span>
        <span>行 15</span>
        <div className="grow" />
        <span>14:36 由案台修改 · 可撤销</span>
      </div>
    </div>
  );
}

export function PreviewPane({ onAction }: { onAction: (a: string) => void }) {
  const max = Math.max(...previewData.monthly.map((m) => m[1]));
  return (
    <div className="opane on" data-opane="preview">
      <div className="pv-bar">
        <span className="live" />
        <span className="tt">实时预览 · 已同步</span>
        <div className="grow" />
        <button className="icon-btn" onClick={() => onAction('toast:已刷新')}>⟳</button>
        <button className="icon-btn">⛶</button>
        <button className="icon-btn">↗</button>
      </div>
      <div className="pv-canvas">
        <div className="page">
          <div className="page-hd">
            <span className="up">{previewData.eyebrow}</span>
            <h2>{previewData.title}</h2>
            <p>{previewData.source}</p>
          </div>
          <div className="kpis">
            {previewData.kpis.map((k) => (
              <div className="kpi" key={k.label}>
                <span className="up">{k.label}</span>
                <div className="v">{k.value}</div>
                <div className="d">{k.delta}</div>
              </div>
            ))}
          </div>
          <div className="chart">
            <span className="up">月度营收（万元）</span>
            <div className="bars">
              {previewData.monthly.map(([month, val], i) => (
                <div className={`b ${i === previewData.monthlyHlIndex ? 'hl' : ''}`} key={month}>
                  <i style={{ height: `${(val / max) * 84}px` }} />
                  <span>{month}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="ptable">
            <span className="up">区域表现</span>
            {previewData.regions.map((r) => (
              <div className={`tr ${r.highlight ? 'mark' : ''}`} key={r.name}>
                <span className="rg">{r.name}</span>
                <span className="num">{r.value}</span>
                <span className="chg">{r.chg}</span>
              </div>
            ))}
          </div>
          <div className="page-ft">由案台生成 · 点击预览里的任意元素可定位到源码</div>
          <div className="outline" style={{ left: 14, right: 14, top: 406, height: 40 }} />
          <div className="hover-tag" style={{ left: 22, top: 380 }}>index.html · L9</div>
        </div>
      </div>
      <div className="pv-foot">
        <span>点选模式：点击元素 → 定位源码</span>
        <div className="grow" />
        <span>100%</span>
      </div>
    </div>
  );
}

export function OutputEmpty() {
  return (
    <div className="opane on" data-opane="empty">
      <div className="out-empty">
        <div className="glyph">📁</div>
        <div className="t">成果会出现在这里</div>
        <div className="d">
          生成的文件、项目与预览都会显示在这个面板，<br />
          可以在目录树、源码、预览三种视角间切换。
        </div>
        <div className="dir-pick">📁 选择工作目录 ~/Documents ▾</div>
      </div>
    </div>
  );
}

// 分段控件 + 路由
export function OutputPanel({
  pane,
  setPane,
  hasContent,
  onAction,
  onOpenCode,
}: {
  pane: Pane;
  setPane: (p: Pane) => void;
  hasContent: boolean;
  onAction: (a: string) => void;
  onOpenCode: () => void;
}) {
  const tabs: { key: Pane; label: string }[] = [
    { key: 'tree', label: '目录树' },
    { key: 'code', label: '源码' },
    { key: 'preview', label: '预览' },
  ];
  return (
    <aside className="output">
      <div className="out-head">
        <div>
          <div className="t">成果</div>
          <div className="up" style={{ marginTop: 3 }}>{PROJECT} · 14:35 生成</div>
        </div>
        <div className="grow" />
        <div className="segs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={pane === t.key ? 'on' : ''}
              onClick={() => setPane(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button className="icon-btn">⋯</button>
      </div>
      <div className="out-body">
        {pane === 'tree' && hasContent && <TreePane onOpenCode={onOpenCode} onAction={onAction} />}
        {pane === 'code' && hasContent && <CodePane onAction={onAction} />}
        {pane === 'preview' && hasContent && <PreviewPane onAction={onAction} />}
        {(!hasContent || pane === 'empty') && <OutputEmpty />}
      </div>
    </aside>
  );
}
