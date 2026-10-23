// SettingsDialog.tsx — 设置弹窗：分类导航（workbuddy 风格）
// 模型配置（内置+自定义增删改）/ 通用偏好 / 关于
import { useState, useEffect, useCallback } from 'react';
import {
  getSettings,
  saveSettings,
  addModel,
  removeModel,
  setCurrentModel,
  updateModel,
  listMemory,
  saveMemory,
  searchMemory,
  deleteMemory,
  clearMemory,
  listSkills,
  readSkill,
  type Settings,
  type ModelConfig,
  type MemoryFact,
  type Skill,
} from '../../data/api';

type Tab = 'models' | 'memory' | 'skills' | 'general' | 'about';

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>('models');
  const [editing, setEditing] = useState<string | null>(null); // 正在编辑的模型 id
  const [adding, setAdding] = useState(false); // 是否显示「添加自定义模型」表单
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setS);
  }, []);

  if (!s) return <div className="dialog-overlay" onClick={onClose} />;

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 1600);
  };

  // 选为当前模型
  const onSelect = async (id: string) => {
    const next = await setCurrentModel(id);
    setS(next);
    flash('已切换');
  };

  // 删除自定义模型
  const onDelete = async (id: string) => {
    const r = await removeModel(id);
    if (!r.ok) { flash(r.error || '删除失败'); return; }
    const fresh = await getSettings();
    setS(fresh);
    flash('已删除');
  };

  // 保存模型字段
  const onSaveModel = async (id: string, patch: Partial<ModelConfig>) => {
    await updateModel(id, patch);
    const fresh = await getSettings();
    setS(fresh);
    setEditing(null);
    flash('已保存');
  };

  // 添加自定义模型
  const onAdd = async (m: Omit<ModelConfig, 'id' | 'builtin'>) => {
    await addModel(m);
    const fresh = await getSettings();
    setS(fresh);
    setAdding(false);
    flash('已添加');
  };

  // 保存通用偏好
  const onSaveGeneral = async () => {
    await saveSettings({ autoExec: s.autoExec });
    flash('已保存');
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>设置</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="dialog-body settings-body">
          {/* 左侧分类导航 */}
          <nav className="settings-nav">
            <button className={tab === 'models' ? 'on' : ''} onClick={() => setTab('models')}>模型配置</button>
            <button className={tab === 'memory' ? 'on' : ''} onClick={() => setTab('memory')}>长期记忆</button>
            <button className={tab === 'skills' ? 'on' : ''} onClick={() => setTab('skills')}>技能</button>
            <button className={tab === 'general' ? 'on' : ''} onClick={() => setTab('general')}>通用偏好</button>
            <button className={tab === 'about' ? 'on' : ''} onClick={() => setTab('about')}>关于</button>
          </nav>

          {/* 右侧内容 */}
          <div className="settings-content">
            {tab === 'models' && (
              <ModelsTab
                s={s}
                editing={editing}
                adding={adding}
                onSelect={onSelect}
                onDelete={onDelete}
                onSaveModel={onSaveModel}
                onAdd={onAdd}
                setEditing={setEditing}
                setAdding={setAdding}
              />
            )}

            {tab === 'memory' && <MemoryTab onToast={flash} />}

            {tab === 'skills' && <SkillsTab />}

            {tab === 'general' && (
              <div className="field-group">
                <div className="field">
                  <label>自动执行</label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={s.autoExec}
                      onChange={(e) => setS({ ...s, autoExec: e.target.checked })}
                    />
                    <span>工具调用自动执行（关闭则每次需你确认）</span>
                  </label>
                  <p className="hint">关闭后，AI 每次调用本地工具前会弹出确认框。</p>
                </div>
                <button className="btn pri" onClick={onSaveGeneral}>保存</button>
              </div>
            )}

            {tab === 'about' && (
              <div className="field-group about-block">
                <h3>SuperAI</h3>
                <p>本地 AI 工作台 · v1.0.0</p>
                <p className="hint">密钥明文存储在本地设置文件，不上传任何服务器。</p>
                <p className="hint">工作目录跟随软件安装位置，每个会话可独立设置。</p>
              </div>
            )}
          </div>
        </div>
        {toast && <div className="toast-mini">{toast}</div>}
      </div>
    </div>
  );
}

// ===== 模型配置标签页 =====
function ModelsTab({
  s, editing, adding, onSelect, onDelete, onSaveModel, onAdd, setEditing, setAdding,
}: {
  s: Settings;
  editing: string | null;
  adding: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveModel: (id: string, patch: Partial<ModelConfig>) => void;
  onAdd: (m: Omit<ModelConfig, 'id' | 'builtin'>) => void;
  setEditing: (id: string | null) => void;
  setAdding: (v: boolean) => void;
}) {
  return (
    <div className="models-tab">
      <div className="tab-head">
        <h3>AI 模型</h3>
        <button className="btn small" onClick={() => setAdding(!adding)}>＋ 添加自定义</button>
      </div>
      <p className="hint">从内置模型选一个，或添加自定义（任意 OpenAI 兼容 / Ollama 接口）。选中的模型高亮显示。</p>

      {adding && <AddModelForm onAdd={onAdd} onCancel={() => setAdding(false)} />}

      <div className="model-list">
        {s.models.map((m) => (
          <ModelRow
            key={m.id}
            m={m}
            isCurrent={s.currentModelId === m.id}
            editing={editing === m.id}
            onSelect={onSelect}
            onDelete={onDelete}
            onSaveModel={onSaveModel}
            setEditing={setEditing}
          />
        ))}
        {s.models.length === 0 && <p className="hint">还没有模型，点右上「添加自定义」。</p>}
      </div>
    </div>
  );
}

function ModelRow({
  m, isCurrent, editing, onSelect, onDelete, onSaveModel, setEditing,
}: {
  m: ModelConfig;
  isCurrent: boolean;
  editing: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveModel: (id: string, patch: Partial<ModelConfig>) => void;
  setEditing: (id: string | null) => void;
}) {
  const [name, setName] = useState(m.name);
  const [baseUrl, setBaseUrl] = useState(m.baseUrl);
  const [apiKey, setApiKey] = useState(m.apiKey);
  const [model, setModel] = useState(m.model);
  const [apiType, setApiType] = useState<ModelConfig['apiType']>(m.apiType);

  if (editing) {
    return (
      <div className={`model-row editing ${isCurrent ? 'current' : ''}`}>
        <div className="model-edit-form">
          <input className="input" placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} disabled={m.builtin} />
          <input className="input" placeholder="API 地址" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <input className="input" placeholder="模型名" value={model} onChange={(e) => setModel(e.target.value)} />
          <input className="input" type="password" placeholder="API Key（Ollama 可空）" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <select className="input" value={apiType} onChange={(e) => setApiType(e.target.value as ModelConfig['apiType'])} disabled={m.builtin}>
            <option value="openai">OpenAI 兼容</option>
            <option value="ollama">Ollama</option>
          </select>
          <div className="row-actions">
            <button className="btn small pri" onClick={() => onSaveModel(m.id, { name, baseUrl, apiKey, model, apiType })}>保存</button>
            <button className="btn small" onClick={() => setEditing(null)}>取消</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`model-row ${isCurrent ? 'current' : ''}`}>
      <button className="radio" onClick={() => onSelect(m.id)} title="选为当前模型">
        <span className={isCurrent ? 'dot on' : 'dot'} />
      </button>
      <div className="model-info">
        <div className="model-name">
          {m.name} {m.builtin && <span className="tag-builtin">内置</span>}
        </div>
        <div className="model-meta">
          {m.model} · {m.apiType} · {m.baseUrl}
        </div>
      </div>
      <div className="row-actions">
        <button className="btn small" onClick={() => setEditing(m.id)}>编辑</button>
        {!m.builtin && <button className="btn small danger" onClick={() => onDelete(m.id)}>删除</button>}
      </div>
    </div>
  );
}

function AddModelForm({ onAdd, onCancel }: { onAdd: (m: Omit<ModelConfig, 'id' | 'builtin'>) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [apiType, setApiType] = useState<ModelConfig['apiType']>('openai');

  const submit = () => {
    if (!name || !model) return;
    onAdd({ name, baseUrl, apiKey, model, apiType });
  };

  return (
    <div className="add-model-form">
      <input className="input" placeholder="名称（如 我的模型）" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" placeholder="API 地址（https://...）" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      <input className="input" placeholder="模型名（如 gpt-4o）" value={model} onChange={(e) => setModel(e.target.value)} />
      <input className="input" type="password" placeholder="API Key（Ollama 可空）" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <select className="input" value={apiType} onChange={(e) => setApiType(e.target.value as ModelConfig['apiType'])}>
        <option value="openai">OpenAI 兼容</option>
        <option value="ollama">Ollama</option>
      </select>
      <div className="row-actions">
        <button className="btn small pri" onClick={submit}>添加</button>
        <button className="btn small" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

// ===== 长期记忆标签页 =====
function MemoryTab({ onToast }: { onToast: (t: string) => void }) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const reload = useCallback(async () => {
    setFacts(await listMemory());
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const onAdd = async () => {
    const txt = content.trim();
    if (!txt) return;
    const tagArr = tags.split(/[,，\s]+/).filter(Boolean);
    await saveMemory(txt, tagArr);
    setContent('');
    setTags('');
    await reload();
    onToast('已保存记忆');
  };

  const onDelete = async (id: string) => {
    await deleteMemory(id);
    await reload();
    onToast('已删除');
  };

  const onClear = async () => {
    await clearMemory();
    await reload();
    onToast('已清空');
  };

  const onSearch = async () => {
    const q = query.trim();
    if (!q) { setSearching(false); await reload(); return; }
    setSearching(true);
    const { results } = await searchMemory(q);
    setFacts(results);
  };

  const onClearSearch = async () => {
    setQuery('');
    setSearching(false);
    await reload();
  };

  return (
    <div className="memory-tab">
      <div className="tab-head">
        <h3>长期记忆</h3>
        {facts.length > 0 && <button className="btn small danger" onClick={onClear}>清空全部</button>}
      </div>
      <p className="hint">AI 在对话中会主动记录你的偏好与背景，注入到每次对话的 system prompt。这里可查看 / 手动增删。</p>

      <div className="add-model-form">
        <textarea
          className="input memory-input"
          placeholder="一条记忆，一句话（如：偏好 TypeScript、常用 React）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="memory-add-row">
          <input className="input" placeholder="标签（逗号分隔，可空）" value={tags} onChange={(e) => setTags(e.target.value)} />
          <button className="btn small pri" onClick={onAdd} disabled={!content.trim()}>添加</button>
        </div>
      </div>

      <div className="search">
        <input className="memory-search" placeholder="搜索记忆…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }} />
        {searching && <button className="btn small" onClick={onClearSearch}>清除</button>}
      </div>

      <div className="fact-list">
        {facts.length === 0 && <p className="hint">{searching ? '没有匹配的记忆' : '还没有记忆条目'}</p>}
        {facts.map((f) => (
          <div className="fact-row" key={f.id}>
            <div className="fact-body">
              <div className="fact-content">{f.content}</div>
              <div className="fact-meta">
                {f.tags.map((t) => <span className="fact-tag" key={t}>{t}</span>)}
                {f.createdAt && <span className="fact-time">{new Date(f.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            </div>
            <button className="btn small danger" onClick={() => onDelete(f.id)}>删除</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== 技能标签页 =====
function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [active, setActive] = useState<Skill | null>(null);
  const [body, setBody] = useState('');

  const reload = useCallback(async () => {
    setSkills(await listSkills());
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const onOpen = async (s: Skill) => {
    if (active?.name === s.name) { setActive(null); setBody(''); return; }
    const r = await readSkill(s.name);
    setActive(s);
    setBody(r?.body || s.body || '');
  };

  return (
    <div className="skills-tab">
      <div className="tab-head">
        <h3>技能</h3>
        <span className="hint" style={{ margin: 0 }}>{skills.length} 个已安装</span>
      </div>
      <p className="hint">技能存放在 userData/skills/ 目录（每个技能一个 SKILL.md）。对话中任务匹配时 AI 会自动调用 read_skill 读取指令执行。</p>

      <div className="skill-list">
        {skills.length === 0 && <p className="hint">还没有技能。把 SKILL.md 放到 userData/skills/&lt;name&gt;/ 下即可。</p>}
        {skills.map((s) => (
          <div key={s.name}>
            <div className={`skill-row ${active?.name === s.name ? 'on' : ''}`} onClick={() => onOpen(s)}>
              <div className="skill-info">
                <div className="skill-name">{s.display_name || s.name}{s.version && <span className="tag-builtin">v{s.version}</span>}</div>
                <div className="skill-desc">{s.description || '（无描述）'}</div>
                <div className="skill-cat">{s.category}{s.author ? ' · ' + s.author : ''}</div>
              </div>
              <div className="skill-tags">
                {s.tags.slice(0, 3).map((t) => <span className="fact-tag" key={t}>{t}</span>)}
              </div>
            </div>
            {active?.name === s.name && (
              <pre className="skill-body">{body}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
