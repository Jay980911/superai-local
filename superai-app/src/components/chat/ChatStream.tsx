// 对话流 · §6 消息/步骤卡/文件卡/空态
import type { Message, Action, ProducedFile } from '../../types';
import { useState, useEffect } from 'react';
import type { CloudUser } from '../../data/cloud';
import { genFiles, suggestions as mockSuggestions } from '../../data/mock';
import { isElectron, getSuggestions } from '../../data/api';
import Markdown from './Markdown';

const suggestions = isElectron ? getSuggestions() : mockSuggestions;
import { Check, Clock, FileTypeIcon, Folder, Sparkle, Chart } from '../icons/Icon';

const DEFAULT_USER_AVATAR = '/avatar-user-default.svg';
const DEFAULT_ASSISTANT_AVATAR = '/avatar-superai.svg';

function MessageAvatar({ src, fallback, alt }: { src?: string | null; fallback: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const usingFallback = !src || failed;
  return (
    <img
      className="avatar-st"
      src={usingFallback ? fallback : src}
      alt={alt}
      onError={() => { if (!usingFallback) setFailed(true); }}
    />
  );
}

export function UserMessage({ msg, user }: { msg: Extract<Message, { role: 'user' }>; user?: CloudUser | null }) {
  const userName = user?.nickname || user?.username || '你';
  return (
    <div className="msg user">
      <div className="who">
        <MessageAvatar src={user?.avatar} fallback={DEFAULT_USER_AVATAR} alt={`${userName}头像`} />
        <span className="speaker">{userName}</span>
      </div>
      <div className="body">
        {msg.text}
        {msg.attachments && msg.attachments.map((a) => (
          <div className="file-pill" key={`${a.name}-${a.size}`}>
            <span className="x">📎</span>{a.name} <span className="x">{a.size}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCard({
  steps,
  elapsed,
  running,
}: {
  steps: NonNullable<Extract<Message, { role: 'agent' }>['steps']>;
  elapsed?: string;
  running?: boolean;
}) {
  const doneCount = steps.filter((s) => s.status === 'done').length;
  // 可展开：点击某一步行展开/折叠，查看该工具的真实输出（result）/报错（error）。
  // 默认折叠；running 中或无输出的步骤不展开。输出超长会滚动。
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  // 总结生成后（running 变 false）自动折叠所有步骤：总结出现时步骤应处于收起状态，
  // 保持“先看结论、需要时再点开查过程”的整洁版面。运行中用户手动展开不受影响。
  useEffect(() => { if (!running) setExpandedIdx(null); }, [running]);
  return (
    <div className="steps">
      <div className="hd">
        <span className="t">已完成 {doneCount} 步</span>
        <div className="grow" />
        <span className="ok">
          {running ? `处理中 ${elapsed ?? '0.0'}s` : elapsed ? `耗时 ${elapsed}s` : '耗时 —'}
        </span>
      </div>
      {steps.map((s, i) => {
        const expandable = !!(s.result || s.error);
        const open = expandedIdx === i;
        return (
          <div key={`${s.label}-${i}`}>
            <div
              className={`row ${expandable ? 'clickable' : ''} ${open ? 'expanded' : ''}`}
              onClick={() => { if (expandable) setExpandedIdx(open ? null : i); }}
            >
              <span className={`num ${s.status === 'done' ? 'done' : ''} ${s.status === 'error' ? 'err' : ''}`}>
                {s.status === 'done' ? <Check size={18} /> : <Clock size={18} />}
              </span>
              <span className="step-label">{s.label}</span>
              <span className="dur">{s.duration || (s.status === 'running' ? '…' : '')}</span>
              {expandable && <span className="step-toggle" aria-hidden="true">{open ? '▾' : '▸'}</span>}
            </div>
            {open && expandable && (
              <pre className="step-output">
                {s.error ? `⚠ ${s.error}\n\n` : ''}{s.result || ''}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// present_files：本轮真实产出的文件卡。每行三个动作：预览(右栏)/打开(系统)/下载(另存)。
function ProducedFiles({ items, onAction }: { items: ProducedFile[]; onAction: (act: string) => void }) {
  return (
    <div className="files produced">
      <div className="hd">
        <span className="t">已产出 {items.length} 个文件</span>
        <div className="grow" />
        <span className="up">本轮</span>
      </div>
      {items.map((f, i) => (
        <div className="frow" key={`${f.name}-${i}`}>
          <span className={`ftype ${f.kind}`}><FileTypeIcon kind={(f.kind === 'img' ? 'html' : f.kind) as any} size={20} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
            <div className="sub">{f.action} · {f.kind.toUpperCase()}</div>
          </div>
          <button className="btn mini" onClick={() => onAction(`preview:${f.path}`)} title="在右栏预览">预览</button>
          <button className="btn mini" onClick={() => onAction(`sysopen:${f.path}`)} title="用系统默认程序打开">打开</button>
          <button className="btn mini pri" onClick={() => onAction(`download:${f.path}`)} title="另存为…">下载</button>
        </div>
      ))}
    </div>
  );
}

function FileCard({
  heading,
  tag,
  items,
  actions,
  onAction,
}: {
  heading: string;
  tag: string;
  items: typeof genFiles;
  actions: Action[];
  onAction: (act: string) => void;
}) {
  return (
    <div className="files">
      <div className="hd">
        <span className="t">{heading}</span>
        <div className="grow" />
        <span className="up">{tag}</span>
      </div>
      {items.map((f) => (
        <div className="frow" key={f.name} data-open="code" onClick={() => onAction('open:code')}>
          <span className={`ftype ${f.kind}`}><FileTypeIcon kind={f.kind} size={20} /></span>
          <div>
            <div className="nm">{f.name}</div>
            <div className="sub">{f.desc}</div>
          </div>
          <div className="grow" />
          {f.isNew && <span className="badge-new">新</span>}
          <span className="sz">{f.size}</span>
        </div>
      ))}
      <div className="ft">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`btn ${a.kind === 'primary' ? 'pri' : ''}`}
            onClick={() => onAction(a.act)}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AgentMessage({
  msg,
  onAction,
  assistantAvatar = DEFAULT_ASSISTANT_AVATAR,
}: {
  msg: Extract<Message, { role: 'agent' }>;
  onAction: (act: string) => void;
  assistantAvatar?: string;
}) {
  const running = msg.time.startsWith('处理中');
  return (
    <div className="msg bot">
      <div className="who">
        <MessageAvatar src={assistantAvatar} fallback={DEFAULT_ASSISTANT_AVATAR} alt="SuperAI头像" />
        <span className="speaker">SuperAI</span>
      </div>
      <div className="body">
        {/* 1) 步骤卡在最前：脚本执行过程展示在总结之上，符合“先执行、后总结”的阅读顺序。
            原实现把 msg.text 放在最顶，导致“总结”出现在“脚本执行”之前。 */}
        {msg.edit && (
          <div className="file-pill">
            <FileTypeIcon kind="html" size={14} />
            <span style={{ color: 'var(--seal)' }}>{msg.edit.file}</span>
            <span className="x">+{msg.edit.plus} −{msg.edit.minus}</span>
          </div>
        )}
        {/* 有真实工具调用才渲染步骤卡——纯对话不展示「已执行 0 步」 */}
        {msg.steps && msg.steps.length > 0 && <StepCard steps={msg.steps} elapsed={msg.elapsed} running={running} />}
        {/* 2) 思考动画：无文本且仍在跑时显示。两种情形互斥：
            a) 还没任何步骤（等首响应/创建会话环境）→ 显眼动画
            b) 步骤已跑完、模型在整理结果 → 低饱和动画（避免“跑完还在等”困惑） */}
        {!msg.text && running && (!msg.steps || msg.steps.length === 0) && (
          <div className="thinking">
            <span>{msg.phase === 'preparing' ? '正在创建会话环境' : msg.phase === 'waiting' ? '等待模型响应' : msg.phase === 'finalizing' ? '正在整理结果' : '思考中'}</span>
            <span className={msg.phase === 'waiting' || msg.phase === 'finalizing' ? 'waiting-dots' : 'thinking-dots'} aria-hidden="true">•••</span>
          </div>
        )}
        {running && !msg.text && msg.steps && msg.steps.length > 0 && (
          <div className="thinking subtle">
            <span>{msg.phase === 'finalizing' ? '正在整理结果' : msg.phase === 'waiting' ? '等待模型响应' : '思考中'}</span>
            <span className={(msg.phase === 'finalizing' || msg.phase === 'waiting') ? 'waiting-dots' : 'thinking-dots'} aria-hidden="true">•••</span>
          </div>
        )}
        {/* 3) 总结在最后：模型最终答复（流式快照）展示在步骤之后 */}
        {msg.text && <Markdown text={msg.text} />}
        {msg.produced && msg.produced.length > 0 && (
          <ProducedFiles items={msg.produced} onAction={onAction} />
        )}
        {msg.files && (
          <FileCard
            heading={msg.files.heading}
            tag={msg.files.tag}
            items={msg.files.items}
            actions={msg.files.actions}
            onAction={onAction}
          />
        )}
        {msg.actions && (
          <div className="acts" style={{ marginTop: 12 }}>
            {msg.actions.map((a) => (
              <button
                key={a.label}
                className={`btn ${a.kind === 'primary' ? 'pri' : ''}`}
                onClick={() => onAction(a.act)}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatStream({
  messages,
  onAction,
  registerMessageNode,
  user,
  assistantAvatar,
}: {
  messages: Message[];
  onAction: (act: string) => void;
  registerMessageNode?: (id: string, node: HTMLDivElement | null) => void;
  user?: CloudUser | null;
  assistantAvatar?: string;
}) {
  return (
    <div className="wrap">
      {messages.map((m) => (
        <div className={`message-anchor ${m.role === 'user' ? 'user-anchor' : 'agent-anchor'}`} key={m.id} ref={(node) => registerMessageNode?.(m.id, node)}>
          {m.role === 'user' ? (
            <UserMessage msg={m} user={user} />
          ) : (
            <AgentMessage msg={m} onAction={onAction} assistantAvatar={assistantAvatar} />
          )}
        </div>
      ))}
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="wrap chat-skeleton" aria-hidden="true">
      <div className="skeleton-user-message">
        <span className="skeleton-bar w-short" />
        <span className="skeleton-bar w-long" />
      </div>
      <div className="skeleton-agent-message">
        <div className="skeleton-speaker">
          <span className="skeleton-avatar" />
          <span className="skeleton-bar w-label" />
        </div>
        <span className="skeleton-bar w-full" />
        <span className="skeleton-bar w-78" />
        <div className="skeleton-steps">
          {[0, 1, 2].map((n) => (
            <div className="skeleton-step" key={n}>
              <span className="skeleton-step-mark" />
              <span className={`skeleton-bar ${n === 1 ? 'w-62' : 'w-72'}`} />
              <span className="skeleton-bar w-time" />
            </div>
          ))}
        </div>
      </div>
      <div className="skeleton-user-message compact">
        <span className="skeleton-bar w-78" />
      </div>
      <div className="skeleton-agent-message compact">
        <div className="skeleton-speaker">
          <span className="skeleton-avatar" />
          <span className="skeleton-bar w-label" />
        </div>
        <span className="skeleton-bar w-90" />
        <span className="skeleton-bar w-58" />
      </div>
    </div>
  );
}

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="empty">
      <div className="glyph">✦</div>
      <h2>今天想做点什么？</h2>
      <p>
        告诉我要达成的结果就好。SuperAI 会自己拆解步骤、调用技能、生成文件——<br />
        所有操作都限定在你授权的工作目录里。
      </p>
      <div className="sugg">
        {suggestions.map((s, i) => {
          const SuggestionIcon = [Folder, Sparkle, Chart][i % 3];
          return (
            <div className="s" key={`${s.title}-${i}`} onClick={() => onPick(s.title)}>
              <span className="ic"><SuggestionIcon size={17} /></span>
              <div>
                <div className="t">{s.title}</div>
                <div className="d">{s.desc}</div>
              </div>
              <span className="go">→</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
