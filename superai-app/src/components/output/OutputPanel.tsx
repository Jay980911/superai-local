// 成果面板 · 右栏：目录树 / 源码 / 预览（真实文件系统）
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { FileEntry } from '../../types';
import { writeFile, openSystemFile, convertPptx, readArrayBuffer } from '../../data/api';
import { Folder } from '../icons/Icon';
import Markdown from '../chat/Markdown';

export type Pane = 'tree' | 'code' | 'preview' | 'empty';

// ===== 目录树构建（扁平 → 树）=====
type TreeNode = { name: string; path: string; type: 'dir' | 'file'; size: number; children?: TreeNode[] };

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();
  for (const f of files) {
    const parts = f.path.split('/');
    let cur = root;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      acc = acc ? acc + '/' + seg : seg;
      const isLast = i === parts.length - 1;
      if (isLast && f.type === 'file') {
        cur.push({ name: seg, path: acc, type: 'file', size: f.size });
      } else {
        let node = map.get(acc);
        if (!node) {
          node = { name: seg, path: acc, type: 'dir', size: 0, children: [] };
          map.set(acc, node);
          cur.push(node);
        }
        cur = node.children!;
      }
    }
  }
  // 排序：目录在前，文件在后，各自字母序
  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh');
    });
    for (const n of nodes) if (n.children) sort(n.children);
  }
  sort(root);
  return root;
}

function fmtSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

function TreeList({
  nodes,
  depth,
  activePath,
  expanded,
  onToggle,
  onOpenFile,
}: {
  nodes: TreeNode[];
  depth: number;
  activePath?: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => {
        const isOpen = expanded.has(n.path);
        return (
          <div key={n.path}>
            <div
              className={`trow ${n.type === 'file' && n.path === activePath ? 'on' : ''}`}
              style={{ paddingLeft: depth * 14 + 9 }}
              onClick={n.type === 'file' ? () => onOpenFile(n.path) : () => onToggle(n.path)}
              onDoubleClick={n.type === 'dir' ? () => onToggle(n.path) : undefined}
              title={n.path}
            >
              <span className="ic2">
                {n.type === 'dir' ? (isOpen ? '▾' : '▸') : '📄'}
              </span>
              <span className="nm">{n.name}</span>
              {n.type === 'file' && <span className="sz">{fmtSize(n.size)}</span>}
            </div>
            {n.type === 'dir' && isOpen && n.children && n.children.length > 0 && (
              <TreeList nodes={n.children} depth={depth + 1} activePath={activePath} expanded={expanded} onToggle={onToggle} onOpenFile={onOpenFile} />
            )}
          </div>
        );
      })}
    </>
  );
}

// ===== 目录树面板 =====
export function TreePane({
  fileTree,
  activePath,
  onOpenFile,
  workspace,
}: {
  fileTree: FileEntry[];
  activePath?: string;
  onOpenFile: (path: string) => void;
  workspace?: string;
}) {
  const tree = useMemo(() => buildTree(fileTree), [fileTree]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // 新目录或文件刷新后保持折叠；用户手动展开的目录继续由本地状态控制。
  const toggle = (p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };
  const fileCount = fileTree.filter((f) => f.type === 'file').length;
  return (
    <div className="opane on" data-opane="tree">
      <div className="tree-head">
        <div className="ic"><Folder size={20} /></div>
        <div>
          <div className="nm">工作目录</div>
          <div className="sub">{fileCount} 个文件</div>
        </div>
        <div className="grow" />
        <button className="icon-btn" title="打开所在文件夹" onClick={() => {
          if (workspace) (window as any).superai?.openSystem?.('', workspace);
        }}>📂</button>
      </div>
      <div className="tlist">
        {tree.length === 0 ? (
          <div className="out-empty" style={{ padding: '40px 16px' }}>
            <div className="d" style={{ color: 'var(--ink-3)' }}>目录为空</div>
          </div>
        ) : (
          <TreeList nodes={tree} depth={0} activePath={activePath} expanded={expanded} onToggle={toggle} onOpenFile={onOpenFile} />
        )}
      </div>
    </div>
  );
}

// ===== 源码面板 =====
export function CodePane({
  fileName,
  filePath,
  content,
  workspace,
  onToast,
  onSaved,
}: {
  fileName: string;
  filePath?: string;
  content: string;
  workspace?: string;
  onToast: (t: string) => void;
  onSaved?: () => void;
}) {
  const lines = content.split('\n');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(content).then(() => onToast('已复制'));
  };

  const startEdit = () => {
    setDraft(content);
    setEditing(true);
  };

  const save = async () => {
    if (!filePath) return;
    setSaving(true);
    try {
      const r = await writeFile(filePath, draft, workspace);
      onToast(`已保存（${(r.size / 1024).toFixed(1)} KB）`);
      setEditing(false);
      onSaved?.();
    } catch (e: any) {
      onToast(`保存失败：${e?.message || '未知错误'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="opane on" data-opane="code">
      <div className="code-bar">
        <div className="fn">📄 {fileName}</div>
        <div className="grow" />
        {editing ? (
          <>
            <button className="btn" onClick={() => setEditing(false)} disabled={saving}>取消</button>
            <button className="btn" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={copy}>复制</button>
            <button className="btn" onClick={startEdit} title="编辑并保存到工作目录">编辑</button>
          </>
        )}
      </div>
      {editing ? (
        <textarea
          className="code-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <div className="code">
          {lines.map((ln, i) => (
            <div className="cl" key={i}>
              <span className="ln">{i + 1}</span>
              <span className="src">{ln || ' '}</span>
            </div>
          ))}
        </div>
      )}
      <div className="code-foot">
        <span>{editing ? `${draft.split('\n').length} 行（编辑中）` : `${lines.length} 行`}</span>
        <span>{(editing ? draft.length : content.length)} 字符</span>
      </div>
    </div>
  );
}

// ===== PPTX 预览：默认嵌入 PPTist 编辑器（随包 dist，走 superai-preview://pptist/）=====
// 通过 postMessage 把 pptx 的 ArrayBuffer 推给 iframe，PPTist 端 onMounted 注册的
// 监听器收到后用 pptxtojson 原生导入，可浏览/编辑/导出。另提供「HTML 快照」模式
// （python-pptx 离线转 html）作为只读兜底。
function PptxPreview({ fileName, filePath, workspace, onToast }: { fileName: string; filePath?: string; workspace?: string; onToast: (t: string) => void }) {
  const [mode, setMode] = useState<'pptist' | 'snapshot'>('pptist');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState('');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pptistSrc = 'superai-preview://pptist/index.html';

  // PPTist 模式：iframe 载入完成后读取 pptx 字节并 postMessage 推过去
  const pushPptxToIframe = useCallback(async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win || !filePath) return;
    const r = await readArrayBuffer(filePath, workspace);
    if (r?.ok && r.buffer) {
      try {
        win.postMessage({ source: 'superai', type: 'pptist:load', arrayBuffer: r.buffer, name: fileName }, '*');
      } catch {
        /* ignore */
      }
    } else {
      setErr(r?.error || '读取 pptx 失败');
      setLoadState('error');
    }
  }, [filePath, workspace, fileName]);

  useEffect(() => {
    if (mode !== 'pptist') return;
    setLoadState('loading');
    setErr('');
    let got = false;
    let failed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handler = (ev: MessageEvent) => {
      const d = ev.data;
      if (!(d && d.source === 'pptist')) return;
      if (d.type === 'pptist:loaded') { if (!failed) { got = true; setLoadState('ready'); } }
      // pptxtojson 解析报错：显示错误并自动回退到 snapshot（python-pptx 转只读 HTML）
      if (d.type === 'pptist:error') {
        failed = true; got = true;
        console.warn('[pptist] import error:', d.error, d.stack);
        setErr(d.error || 'pptx 解析失败');
        setLoadState('error');
        setTimeout(() => setMode('snapshot'), 800);
      }
    };
    window.addEventListener('message', handler);
    // 重试推送：PPTist 的 Vue 应用可能在 iframe load 事件后才挂载完监听器（字体加载慢），
    // 因此定时重试 postMessage，直到收到 pptist:loaded 回执或超时。
    let attempts = 0;
    const retry = async () => {
      if (got || attempts > 14) { if (!got) {
        setErr('PPTist 未响应，可能加载失败；回退 HTML 快照'); setLoadState('error');
        setTimeout(() => setMode('snapshot'), 800);  // 超时也回退 snapshot
      } return; }
      attempts++;
      await pushPptxToIframe();
      timer = setTimeout(retry, 700);
    };
    timer = setTimeout(retry, 600);
    return () => { window.removeEventListener('message', handler); if (timer) clearTimeout(timer); };
  }, [mode, filePath]);

  // snapshot 模式：python-pptx 转 html
  const [snapState, setSnapState] = useState<'converting' | 'done' | 'error'>('converting');
  const [htmlAbs, setHtmlAbs] = useState('');
  useEffect(() => {
    if (mode !== 'snapshot') return;
    let cancelled = false;
    setSnapState('converting');
    (async () => {
      const r = await convertPptx(filePath || '', workspace);
      if (cancelled) return;
      if (r?.ok && r.htmlPath) { setHtmlAbs(r.htmlPath.replace(/\\/g, '/')); setSnapState('done'); }
      else { setErr(r?.error || '未知错误'); setSnapState('error'); }
    })();
    return () => { cancelled = true; };
  }, [mode, filePath, workspace]);
  const snapSrc = htmlAbs ? filePreviewUrl(htmlAbs) : '';

  return (
    <div className="opane on" data-opane="preview">
      <div className="pv-bar">
        <span className="live" />
        <span className="tt">预览 · {fileName}</span>
        <div className="grow" />
        <button className={`icon-btn${mode === 'pptist' ? ' on' : ''}`} title="PPTist 编辑器" onClick={() => setMode('pptist')}>✎</button>
        <button className={`icon-btn${mode === 'snapshot' ? ' on' : ''}`} title="HTML 快照（只读）" onClick={() => setMode('snapshot')}>☡</button>
        <button className="icon-btn" onClick={() => { if (mode === 'pptist') pushPptxToIframe(); else setSnapState('converting'); }} title="刷新">⟳</button>
      </div>
      <div className="pv-canvas" style={{ position: 'relative', background: '#f5f6f8' }}>
        {mode === 'pptist' && (
          <>
            <iframe
              ref={iframeRef}
              src={pptistSrc}
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
              title="pptist-editor"
              onLoad={() => pushPptxToIframe()}
            />
            {loadState === 'loading' && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,246,248,0.9)', pointerEvents: 'none' }}>
                <div className="out-empty" style={{ textAlign: 'center' }}>
                  <div className="t">正在载入 PPTist 编辑器…</div>
                  <div className="d" style={{ color: 'var(--ink-3)', marginTop: 6 }}>导入 {fileName}</div>
                </div>
              </div>
            )}
            {loadState === 'error' && (
              <div className="out-empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
                <div className="t" style={{ fontSize: 15 }}>无法载入 pptx 到编辑器</div>
                <div className="d" style={{ color: 'var(--ink-3)', marginTop: 8, fontSize: 12, wordBreak: 'break-all' }}>{err}</div>
                <button className="btn pri" style={{ marginTop: 18 }} onClick={async () => { const r = await openSystemFile(filePath || '', workspace); onToast(r?.ok ? '已用系统默认程序打开' : '打开失败：' + (r?.error || '未知')); }}>用系统默认程序打开</button>
              </div>
            )}
          </>
        )}
        {mode === 'snapshot' && snapState === 'converting' && (
          <div className="out-empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
            <div className="t">正在转换为 HTML 快照…</div>
            <div className="d" style={{ color: 'var(--ink-3)', marginTop: 6 }}>用 python-pptx 解析 {fileName}</div>
          </div>
        )}
        {mode === 'snapshot' && snapState === 'error' && (
          <div className="out-empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
            <div className="t" style={{ fontSize: 15 }}>无法生成 HTML 快照</div>
            <div className="d" style={{ color: 'var(--ink-3)', marginTop: 8, fontSize: 12, wordBreak: 'break-all' }}>{err}</div>
            <button className="btn pri" style={{ marginTop: 18 }} onClick={async () => { const r = await openSystemFile(filePath || '', workspace); onToast(r?.ok ? '已用系统默认程序打开' : '打开失败：' + (r?.error || '未知')); }}>用系统默认程序打开</button>
          </div>
        )}
        {mode === 'snapshot' && snapState === 'done' && snapSrc && (
          <iframe src={snapSrc} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} title="pptx-snapshot" />
        )}
      </div>
    </div>
  );
}

// ===== 预览面板 =====
// HTML 走自定义协议 superai-preview://（独立 origin，相对资源按文件目录解析，
// 不用易崩的 <webview>）。协议未就绪前回退 iframe srcDoc（dev 下资源可能 404，
// 但不崩页面）。md 走渲染。
function toFileUrl(filePath: string, workspace?: string): string {
  const p = (filePath || '').replace(/\\/g, '/');
  if (!p) return '';
  let abs: string;
  if (/^[A-Za-z]:\//.test(p) || p.startsWith('/')) {
    abs = p;
  } else {
    const ws = (workspace || '').replace(/[\\/]+$/, '').replace(/\\/g, '/');
    abs = (ws ? ws + '/' : '') + p.replace(/^\/+/, '');
  }
  return abs.replace(/^\/+/, '');
}

// 把绝对路径编成 superai-preview://file/<path> 形式的 URL。
// 关键：逐段 encodeURIComponent 但保留真实 `/` 作分隔符。
// 若整段 encodeURIComponent，路径里的 `/` 会变成 %2F，浏览器把它当普通字符、
// 认不出目录分隔符，HTML 内的相对资源（./images/x.svg）就会被解析到协议根、
// 丢掉文件所在目录 → 404。保留 `/` 后相对资源能正确按文档目录解析。
function filePreviewUrl(absPath: string): string {
  if (!absPath) return '';
  const segs = absPath.split('/').map(encodeURIComponent).join('/');
  return 'superai-preview://file/' + segs;
}

export function PreviewPane({
  fileName,
  filePath,
  content,
  workspace,
  onToast,
}: {
  fileName: string;
  filePath?: string;
  content: string;
  workspace?: string;
  onToast: (t: string) => void;
}) {
  const isHtml = /\.(html?|svg)$/i.test(fileName);
  const isMarkdown = /\.(md|markdown)$/i.test(fileName);
  const isPdf = /\.pdf$/i.test(fileName);
  const isPptx = /\.pptx$/i.test(fileName);
  const isOffice = /\.(ppt|docx?|xlsx?)$/i.test(fileName);  // .pptx 走 PptxPreview，这里不含 pptx
  const isImage = /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(fileName);
  // pptx 离线转 html 预览
  if (isPptx) {
    return <PptxPreview fileName={fileName} filePath={filePath} workspace={workspace} onToast={onToast} />;
  }
  // 相对路径解析成绝对路径，再走自定义协议 superai-preview://file/<path>
  const absPath = filePath ? toFileUrl(filePath, workspace) : '';
  const previewSrc = absPath ? filePreviewUrl(absPath) : '';
  if (!isHtml && !isMarkdown && !isPdf && !isOffice && !isImage) {
    return (
      <div className="opane on" data-opane="preview">
        <div className="out-empty" style={{ padding: '40px 16px' }}>
          <div className="t">无法预览</div>
          <div className="d" style={{ color: 'var(--ink-3)' }}>支持 HTML、SVG、Markdown、PDF、图片预览；Office 文件可点下方打开</div>
        </div>
      </div>
    );
  }
  if (isOffice) {
    return (
      <div className="opane on" data-opane="preview">
        <div className="pv-bar">
          <span className="live" />
          <span className="tt">预览 · {fileName}</span>
        </div>
        <div className="out-empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
          <div className="t" style={{ fontSize: 16 }}>该格式无法在应用内直接预览</div>
          <div className="d" style={{ color: 'var(--ink-3)', marginTop: 8 }}>
            {fileName} 是 Office 文档（{fileName.split('.').pop()?.toUpperCase()}），需用 PowerPoint/WPS/Office 打开。
          </div>
          <button
            className="btn pri"
            style={{ marginTop: 18 }}
            onClick={async () => {
              const r = await openSystemFile(filePath || '', workspace);
              if (!r?.ok) onToast('打开失败：' + (r?.error || '未知'));
              else onToast('已用系统默认程序打开');
            }}
          >用系统默认程序打开</button>
        </div>
      </div>
    );
  }
  return (
    <div className="opane on" data-opane="preview">
      <div className="pv-bar">
        <span className="live" />
        <span className="tt">预览 · {fileName}</span>
        <div className="grow" />
        <button className="icon-btn" onClick={() => onToast('已刷新')} title="刷新">⟳</button>
      </div>
      <div className={`pv-canvas ${isMarkdown ? 'md-preview' : ''} ${isImage ? 'img-preview' : ''}`}>
        {isMarkdown ? (
          <div className="md-preview-content"><Markdown text={content} /></div>
        ) : isImage && previewSrc ? (
          <img src={previewSrc} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', margin: 'auto' }} />
        ) : (isHtml || isPdf) && previewSrc ? (
          <iframe src={previewSrc} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} title="preview" />
        ) : (
          <iframe srcDoc={content} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} title="preview" />
        )}
      </div>
    </div>
  );
}

// ===== 空态 =====
export function OutputEmpty({ workspace, onPickWorkspace }: { workspace: string; onPickWorkspace: () => void }) {
  const ws = workspace || '未选择';
  return (
    <div className="opane on" data-opane="empty">
      <div className="out-empty">
        <div className="glyph">📁</div>
        <div className="t">成果会出现在这里</div>
        <div className="d">
          选好工作目录后，这里会显示目录里的真实文件。<br />
          点文件查看源码，HTML 文件可预览。
        </div>
        <div className="dir-pick" onClick={onPickWorkspace} title="点击更改工作目录">
          📁 {ws} ▾
        </div>
      </div>
    </div>
  );
}

// ===== 分段控件 + 路由 =====
export function OutputPanel({
  pane,
  setPane,
  hasContent,
  workspace,
  onPickWorkspace,
  fileTree,
  activeFile,
  fileContent,
  onOpenFile,
  onToast,
  onCollapse,
  onFileSaved,
  maximized,
  onToggleMax,
}: {
  pane: Pane;
  setPane: (p: Pane) => void;
  hasContent: boolean;
  workspace: string;
  onPickWorkspace: () => void;
  fileTree: FileEntry[];
  activeFile: { name: string; path: string } | null;
  fileContent: string;
  onOpenFile: (path: string) => void;
  onToast: (t: string) => void;
  onCollapse: () => void;
  onFileSaved?: () => void;
  maximized?: boolean;
  onToggleMax?: () => void;
}) {
  const tabs: { key: Pane; label: string }[] = [
    { key: 'tree', label: '目录树' },
    { key: 'code', label: '源码' },
    { key: 'preview', label: '预览' },
  ];
  return (
    <aside className="output">
      <div className="out-head">
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
        <div className="grow" />
        <button className="icon-btn" title={maximized ? '还原' : '擑满窗口'} onClick={() => onToggleMax?.()}>{maximized ? '⤡' : '⤢'}</button>
        <button className="icon-btn" title="折叠成果面板" onClick={onCollapse}>»</button>
      </div>
      <div className="out-body">
        <div style={{ display: pane === 'tree' ? 'block' : 'none', height: '100%' }}>
          <TreePane fileTree={fileTree} activePath={activeFile?.path} onOpenFile={onOpenFile} workspace={workspace} />
        </div>
        {pane === 'code' && hasContent && activeFile && (
          <CodePane fileName={activeFile.name} filePath={activeFile.path} content={fileContent} workspace={workspace} onToast={onToast} onSaved={onFileSaved} />
        )}
        {pane === 'preview' && hasContent && activeFile && (
          <PreviewPane fileName={activeFile.name} filePath={activeFile.path} content={fileContent} workspace={workspace} onToast={onToast} />
        )}
        {pane === 'code' && !activeFile && (
          <div className="out-empty" style={{ padding: '40px 16px' }}>
            <div className="d" style={{ color: 'var(--ink-3)' }}>从目录树选一个文件查看源码</div>
          </div>
        )}
        {pane === 'preview' && !activeFile && (
          <div className="out-empty" style={{ padding: '40px 16px' }}>
            <div className="d" style={{ color: 'var(--ink-3)' }}>从目录树选一个支持的文件预览</div>
          </div>
        )}
        {pane === 'empty' && <OutputEmpty workspace={workspace} onPickWorkspace={onPickWorkspace} />}
      </div>
    </aside>
  );
}
