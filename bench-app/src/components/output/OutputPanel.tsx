// 成果面板 · 右栏：目录树 / 源码 / 预览（真实文件系统）
import { useState, useMemo, useEffect } from 'react';
import type { FileEntry } from '../../types';
import { Folder } from '../icons/Icon';

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
}: {
  fileTree: FileEntry[];
  activePath?: string;
  onOpenFile: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(fileTree), [fileTree]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // 默认展开第一层目录
    const s = new Set<string>();
    for (const n of tree) if (n.type === 'dir') s.add(n.path);
    return s;
  });
  // tree 变化时重置默认展开（只展开第一层目录）
  useEffect(() => {
    const s = new Set<string>();
    for (const n of tree) if (n.type === 'dir') s.add(n.path);
    setExpanded(s);
  }, [tree]);
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
  content,
  onToast,
}: {
  fileName: string;
  content: string;
  onToast: (t: string) => void;
}) {
  const lines = content.split('\n');
  const copy = () => {
    navigator.clipboard.writeText(content).then(() => onToast('已复制'));
  };
  return (
    <div className="opane on" data-opane="code">
      <div className="code-bar">
        <div className="fn">📄 {fileName}</div>
        <div className="grow" />
        <button className="btn" onClick={copy}>复制</button>
      </div>
      <div className="code">
        {lines.map((ln, i) => (
          <div className="cl" key={i}>
            <span className="ln">{i + 1}</span>
            <span className="src">{ln || ' '}</span>
          </div>
        ))}
      </div>
      <div className="code-foot">
        <span>{lines.length} 行</span>
        <span>{content.length} 字符</span>
      </div>
    </div>
  );
}

// ===== 预览面板（HTML 文件 iframe srcdoc）=====
export function PreviewPane({
  fileName,
  content,
  onToast,
}: {
  fileName: string;
  content: string;
  onToast: (t: string) => void;
}) {
  const isHtml = /\.(html?|svg)$/i.test(fileName);
  if (!isHtml) {
    return (
      <div className="opane on" data-opane="preview">
        <div className="out-empty" style={{ padding: '40px 16px' }}>
          <div className="t">无法预览</div>
          <div className="d" style={{ color: 'var(--ink-3)' }}>只支持 HTML/SVG 文件预览</div>
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
      <div className="pv-canvas">
        <iframe srcDoc={content} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} title="preview" />
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
        <button className="icon-btn" title="折叠成果面板" onClick={onCollapse}>»</button>
      </div>
      <div className="out-body">
        {pane === 'tree' && <TreePane fileTree={fileTree} activePath={activeFile?.path} onOpenFile={onOpenFile} />}
        {pane === 'code' && hasContent && activeFile && (
          <CodePane fileName={activeFile.name} content={fileContent} onToast={onToast} />
        )}
        {pane === 'preview' && hasContent && activeFile && (
          <PreviewPane fileName={activeFile.name} content={fileContent} onToast={onToast} />
        )}
        {pane === 'code' && !activeFile && (
          <div className="out-empty" style={{ padding: '40px 16px' }}>
            <div className="d" style={{ color: 'var(--ink-3)' }}>从目录树选一个文件查看源码</div>
          </div>
        )}
        {pane === 'preview' && !activeFile && (
          <div className="out-empty" style={{ padding: '40px 16px' }}>
            <div className="d" style={{ color: 'var(--ink-3)' }}>从目录树选一个 HTML 文件预览</div>
          </div>
        )}
        {pane === 'empty' && <OutputEmpty workspace={workspace} onPickWorkspace={onPickWorkspace} />}
      </div>
    </aside>
  );
}
