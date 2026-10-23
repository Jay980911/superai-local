// 对话流 · §6 消息/步骤卡/文件卡/空态
import type { Message, Action } from '../../types';
import { genFiles, suggestions } from '../../data/mock';
import { Check, Clock, FileTypeIcon } from '../icons/Icon';

export function UserMessage({ msg }: { msg: Extract<Message, { role: 'user' }> }) {
  return (
    <div className="msg user">
      <div className="who"><span className="st">你</span>{msg.time}</div>
      <div className="body">
        {msg.text}
        {msg.attachments && msg.attachments.map((a) => (
          <div className="file-pill" key={a.name}>
            <span className="x">📎</span>{a.name} <span className="x">{a.size}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCard({ steps }: { steps: NonNullable<Extract<Message, { role: 'agent' }>['steps']> }) {
  const doneCount = steps.filter((s) => s.status === 'done').length;
  return (
    <div className="steps">
      <div className="hd">
        <span className="t">已完成 {doneCount} 步</span>
        <div className="grow" />
        <span className="ok">耗时 9.7s</span>
      </div>
      {steps.map((s) => (
        <div className="row" key={s.label}>
          <span className={`num ${s.status === 'done' ? 'done' : ''}`}>
            {s.status === 'done' ? <Check size={18} /> : <Clock size={18} />}
          </span>
          {s.label}
          <span className="dur">{s.duration}</span>
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
}: {
  msg: Extract<Message, { role: 'agent' }>;
  onAction: (act: string) => void;
}) {
  return (
    <div className="msg bot">
      <div className="who"><span className="st">B</span>bench · {msg.time}</div>
      <div className="body">
        {msg.text && <p>{msg.text}</p>}
        {msg.edit && (
          <div className="file-pill">
            <FileTypeIcon kind="html" size={14} />
            <span style={{ color: 'var(--seal)' }}>{msg.edit.file}</span>
            <span className="x">+{msg.edit.plus} −{msg.edit.minus}</span>
          </div>
        )}
        {msg.steps && <StepCard steps={msg.steps} />}
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
}: {
  messages: Message[];
  onAction: (act: string) => void;
}) {
  return (
    <div className="wrap">
      {messages.map((m) =>
        m.role === 'user' ? (
          <UserMessage key={m.id} msg={m} />
        ) : (
          <AgentMessage key={m.id} msg={m} onAction={onAction} />
        )
      )}
    </div>
  );
}

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="empty">
      <div className="glyph">✦</div>
      <h2>今天想做点什么？</h2>
      <p>
        告诉我要达成的结果就好。案台会自己拆解步骤、调用技能、生成文件——<br />
        所有操作都限定在你授权的工作目录里。
      </p>
      <div className="sugg">
        {suggestions.map((s) => (
          <div className="s" key={s.title} onClick={() => onPick(s.title)}>
            <span className="ic">{s.icon}</span>
            <div>
              <div className="t">{s.title}</div>
              <div className="d">{s.desc}</div>
            </div>
            <span className="go">→</span>
          </div>
        ))}
      </div>
    </div>
  );
}
