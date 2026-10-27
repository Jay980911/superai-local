// 会话栏 268px · §6 左栏：品牌/搜索/会话分组/用户卡
import { useState, useEffect } from 'react';
import type { Session, SessionGroup, FileEntry } from '../../types';
import type { CloudUser } from '../../data/cloud';

const GROUP_ORDER: SessionGroup[] = ['置顶', '其他'];

export default function SessionSidebar({
  activeSessionId,
  sessions,
  onPickSession,
  onNewChat,
  onCollapse,
  onOpenSettings,
  onDeleteSession,
  onRenameSession,
  onTogglePin,
  fileTree,
  onOpenFile,
  cloudUser,
  onLogout,
}: {
  activeSessionId: string;
  sessions: Session[];
  onPickSession: (s: Session) => void;
  onNewChat: () => void;
  onCollapse: () => void;
  onOpenSettings: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  fileTree?: FileEntry[];
  onOpenFile?: (path: string) => void;
  cloudUser: CloudUser | null;
  onLogout: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [query, setQuery] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  // 点击菜单外任意位置关闭三点菜单
  useEffect(() => {
    if (!menuId) return;
    const onDocClick = () => setMenuId(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuId]);

  const startRename = (s: Session) => {
    setRenamingId(s.id);
    setRenameDraft(s.title);
  };
  const commitRename = () => {
    const t = renameDraft.trim();
    if (t && renamingId) onRenameSession(renamingId, t);
    setRenamingId(null);
  };

  const renderRow = (s: Session) => {
    if (renamingId === s.id) {
      return (
        <div key={s.id} className="srow on">
          <input
            className="srename"
            autoFocus
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            onBlur={commitRename}
          />
        </div>
      );
    }
    return (
      <div
        key={s.id}
        className={`srow ${s.id === activeSessionId ? 'on' : ''}`}
        onClick={() => onPickSession(s)}
      >
        <span className="tx">
          <div className="t1">{s.title}</div>
          <div className="t2">{s.summary}</div>
        </span>
        <button
          className="more session-menu-trigger"
          title="会话操作"
          aria-label={`会话操作：${s.title}`}
          onClick={(e) => { e.stopPropagation(); setMenuId((id) => id === s.id ? null : s.id); }}
        >•••</button>
        {menuId === s.id && (
          <div className="session-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setMenuId(null); onTogglePin(s.id, !s.pinned); }}>{s.pinned ? '取消置顶' : '置顶'}</button>
            <button onClick={() => { setMenuId(null); startRename(s); }}>重命名</button>
            <button className="danger" onClick={() => { setMenuId(null); onDeleteSession(s.id); }}>删除</button>
          </div>
        )}
      </div>
    );
  };

  const q = query.trim().toLowerCase();
  const matchedSessions = q
    ? sessions.filter((s) => (s.title + ' ' + s.summary).toLowerCase().includes(q))
    : sessions;
  const matchedFiles = fileTree?.filter((f) => f.name.toLowerCase().includes(q)) ?? [];
  const hasFiles = !!fileTree && fileTree.length > 0;

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
        <span>⌕</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话与文件"
        />
        {query && <button className="sclear" title="清除" onClick={() => setQuery('')}>×</button>}
      </div>

      <div className="side-scroll">
        {matchedSessions.length === 0 && (!hasFiles || matchedFiles.length === 0) && (
          <div className="sempty">没有匹配的会话或文件</div>
        )}

        {q ? (
          // 搜索模式：扁平列出
          <>
            {matchedSessions.map(renderRow)}
            {hasFiles && matchedFiles.length > 0 && (
              <div className="grp"><span className="up">文件</span></div>
            )}
            {hasFiles && matchedFiles.map((f) => (
              <div
                key={f.path}
                className="srow"
                onClick={() => onOpenFile?.(f.path)}
                title={f.path}
              >
                <span className="tx">
                  <div className="t1">{f.type === 'dir' ? '📁' : '📄'} {f.name}</div>
                  <div className="t2">{f.path}</div>
                </span>
              </div>
            ))}
          </>
        ) : (
          // 分组模式
          GROUP_ORDER.map((g) => {
            const list = sessions.filter((s) => s.group === g);
            if (list.length === 0) return null;
            return (
              <div key={g}>
                <div className="grp">
                  <span className="up" style={{ flex: 1 }}>{g}</span>
                  <span className="plus" title="新建">＋</span>
                </div>
                {list.map(renderRow)}
              </div>
            );
          })
        )}
      </div>

      <div className="userbar">
        <div className="avatar">
          {cloudUser?.avatar
            ? <img src={cloudUser.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
            : (cloudUser?.nickname?.[0] || cloudUser?.username?.[0] || 'U')}
        </div>
        <div>
          <div className="u1">{cloudUser?.nickname || cloudUser?.username || '未登录'}</div>
          <div className="u2">{cloudUser ? `${cloudUser.role} · 配额 ${cloudUser.tokenQuota.toLocaleString()}` : '点击登录'}</div>
        </div>
        <div className="grow" />
        {cloudUser && <button className="icon-btn" title="退出登录" onClick={onLogout}>⏻</button>}
        <button className="icon-btn" title="设置" onClick={onOpenSettings}>⚙</button>
      </div>
    </aside>
  );
}
