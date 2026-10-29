// SettingsDialog.tsx — 设置弹窗：分类导航（workbuddy 风格）
// 模型配置（任意大模型增删改）/ 长期记忆 / 技能 / 通用偏好 / 关于
import { useState, useEffect, useCallback } from 'react';
import {
  getSettings,
  saveSettings,
  addModel,
  removeModel,
  setCurrentModel,
  updateModel,
  testModel,
  listMemory,
  saveMemory,
  searchMemory,
  deleteMemory,
  clearMemory,
  listSkills,
  readSkill,
  getSkillsDir,
  getDefaultWorkspace,
  pickWorkspace,
  syncImageModelFromCloud,
  isLoggedIn,
  type Settings,
  type UiTheme,
  type ModelConfig,
  type MemoryFact,
  type Skill,
} from '../../data/api';

export type Tab = 'personalization' | 'models' | 'memory' | 'skills' | 'general' | 'about';

/** API 协议的中文短标签（列表展示用） */
const API_LABELS: Record<string, string> = {
  'openai-completions': 'OpenAI 兼容',
  'openai-responses': 'Responses',
  'anthropic-messages': 'Anthropic',
};

export default function SettingsDialog({ onClose, initialTab = 'models', theme, onThemeChange }: { onClose: () => void; initialTab?: Tab; theme: UiTheme; onThemeChange: (theme: UiTheme) => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState<string | null>(null); // 正在编辑的模型 id
  const [adding, setAdding] = useState(false); // 是否显示「添加自定义模型」表单
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setS);
  }, []);

  // ESC 关闭；不在点遮罩（失焦）时关闭，避免误触
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!s) return <div className="dialog-overlay" />;

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

  // 添加自定义模型（任意大模型）
  const onAdd = async (m: Omit<ModelConfig, 'id'>) => {
    await addModel(m);
    const fresh = await getSettings();
    setS(fresh);
    setAdding(false);
    flash('已添加');
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog settings-dialog">
        <div className="dialog-head">
          <h2>设置</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="dialog-body settings-body">
          {/* 左侧分类导航 */}
          <nav className="settings-nav">
            <button className={tab === 'personalization' ? 'on' : ''} onClick={() => setTab('personalization')}>个性化</button>
            <button className={tab === 'models' ? 'on' : ''} onClick={() => setTab('models')}>模型配置</button>
            <button className={tab === 'memory' ? 'on' : ''} onClick={() => setTab('memory')}>长期记忆</button>
            <button className={tab === 'skills' ? 'on' : ''} onClick={() => setTab('skills')}>技能</button>
            <button className={tab === 'general' ? 'on' : ''} onClick={() => setTab('general')}>通用偏好</button>
            <button className={tab === 'about' ? 'on' : ''} onClick={() => setTab('about')}>关于</button>
          </nav>

          {/* 右侧内容 */}
          <div className="settings-content">
            {tab === 'personalization' && <PersonalizationTab theme={theme} onThemeChange={onThemeChange} onToast={flash} />}

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
                onToast={flash}
                setS={setS}
              />
            )}

            {tab === 'memory' && <MemoryTab onToast={flash} />}

            {tab === 'skills' && <SkillsTab onToast={flash} />}

            {tab === 'general' && (
              <GeneralTab s={s} setS={setS} onToast={flash} />
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

function PersonalizationTab({
  theme,
  onThemeChange,
  onToast,
}: {
  theme: UiTheme;
  onThemeChange: (theme: UiTheme) => void;
  onToast: (message: string) => void;
}) {
  const themes: Array<{ id: UiTheme; name: string; detail: string }> = [
    { id: 'warm', name: '暖纸', detail: '系统默认 · 暖白与柔灰' },
    { id: 'mist', name: '雾灰', detail: '冷中性 · 清晰克制' },
    { id: 'night', name: '夜色', detail: '深色 · 低亮护眼' },
  ];

  const selectTheme = (next: UiTheme) => {
    onThemeChange(next);
    onToast('主题已应用到所有页面');
  };

  return (
    <div className="personalization-tab">
      <div className="tab-head">
        <h3>应用主题</h3>
        <span className="theme-global-badge">全局</span>
      </div>
      <p className="hint">一个主题统一应用于启动加载页、登录页、工作台和设置 / 市场，不需要逐页重复设置。</p>
      <div className="theme-presets">
        {themes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`theme-preset ${theme === item.id ? 'on' : ''}`}
            aria-pressed={theme === item.id}
            onClick={() => selectTheme(item.id)}
          >
            <span className={`theme-preset-preview ${item.id}`}>
              <span className="theme-mini-login"><i /><b /><em /></span>
              <span className="theme-mini-workspace"><i /><b /><em /></span>
            </span>
            <span className="theme-preset-copy">
              <strong>{item.name}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="theme-radio" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="theme-surfaces">
        <span>统一应用到</span>
        <span>加载页</span>
        <span>登录页</span>
        <span>工作台</span>
        <span>设置与市场</span>
      </div>
    </div>
  );
}

// ===== 通用偏好标签页 =====
function GeneralTab({
  s,
  setS,
  onToast,
}: {
  s: Settings;
  setS: (s: Settings) => void;
  onToast: (t: string) => void;
}) {
  const [ws, setWs] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    getDefaultWorkspace().then(setWs);
  }, []);

  const onPick = async () => {
    setPicking(true);
    try {
      // 不传 sessionId：只更新全局默认工作目录（各会话可在标题栏单独改）
      const dir = await pickWorkspace();
      if (dir) { setWs(dir); onToast('已更新默认工作目录'); }
    } finally {
      setPicking(false);
    }
  };

  // 重置：清空全局自定义默认，回到软件安装目录下的 workspace。
  // 用途：之前在空态点标题栏改过工作目录，污染了全局默认，
  // 导致新建会话都继承那个临时目录。点此重置回安装目录。
  const onReset = async () => {
    await saveSettings({ workspace: '' });
    const def = await getDefaultWorkspace();
    setWs(def);
    onToast('已重置为安装目录默认工作目录');
  };

  return (
    <div className="field-group">
      <div className="field">
        <label>默认工作目录</label>
        <p className="hint">新建对话的默认读写范围；每个会话也可以在顶部标题栏单独更改。</p>
        <div className="dir-pick" onClick={onPick} title="点击更改默认工作目录" style={{ opacity: picking ? 0.6 : 1 }}>
          📁 {ws || '未选择'} ▾
        </div>
        <button
          type="button"
          onClick={onReset}
          title="仅清空应用默认工作目录的自定义覆盖，不影响各会话已单独设置的工作目录"
          style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--ink-3)', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >恢复安装目录默认</button>
      </div>
      <div className="field">
        <label>自动执行</label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={s.autoExec}
            onChange={(e) => setS({ ...s, autoExec: e.target.checked })}
          />
          <span>工具调用自动执行</span>
        </label>
        <p className="hint">
          当前引擎版本（dsh 0.2.1-rc.3）暂无审批传输通道，此开关暂不生效——
          工具调用会直接执行（等同开启）。等官方发布审批能力后，关闭此开关将弹出逐次确认。
        </p>
      </div>
      <button className="btn pri" onClick={async () => { await saveSettings({ autoExec: s.autoExec }); onToast('已保存'); }}>保存</button>
    </div>
  );
}

// ===== 模型配置标签页 =====
function ModelsTab({
  s, editing, adding, onSelect, onDelete, onSaveModel, onAdd, setEditing, setAdding, onToast, setS,
}: {
  s: Settings;
  editing: string | null;
  adding: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveModel: (id: string, patch: Partial<ModelConfig>) => void;
  onAdd: (m: Omit<ModelConfig, 'id'>) => void;
  setEditing: (id: string | null) => void;
  setAdding: (v: boolean) => void;
  onToast: (t: string) => void;
  setS: (s: Settings) => void;
}) {
  return (
    <div className="models-tab">
      <div className="tab-head">
        <h3>AI 模型</h3>
        <button className="btn small" onClick={() => setAdding(!adding)}>＋ 添加模型</button>
      </div>
      <p className="hint">不内置任何模型——任意大模型都可以自己添加：OpenAI 兼容 / Responses / Anthropic 接口均可。选中的模型高亮显示。</p>

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

      <ImageModelBlock s={s} onToast={onToast} setS={setS} />
    </div>
  );
}

// ===== 图像生成模型配置（image-gen 技能用） =====
function ImageModelBlock({ s, onToast, setS }: { s: Settings; onToast: (t: string) => void; setS: (s: Settings) => void }) {
  const img = s.imageModel || { baseUrl: '', apiKey: '', model: '' };
  const [baseUrl, setBaseUrl] = useState(img.baseUrl);
  const [apiKey, setApiKey] = useState(img.apiKey);
  const [model, setModel] = useState(img.model);
  const [unsplashKey, setUnsplashKey] = useState(s.unsplashKey || '');
  const [proxy, setProxy] = useState(s.proxy || '');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const i = s.imageModel;
    if (i) { setBaseUrl(i.baseUrl); setApiKey(i.apiKey); setModel(i.model); }
    setUnsplashKey(s.unsplashKey || '');
    setProxy(s.proxy || '');
  }, [s.imageModel, s.unsplashKey, s.proxy]);
  const onSave = async () => {
    if (!baseUrl || !model) { onToast('baseUrl 和 model 不能为空'); return; }
    const fresh = await saveSettings({ imageModel: { baseUrl, apiKey, model }, unsplashKey, proxy });
    setS(fresh); setSaved(true); onToast('已保存图像生成配置');
    setTimeout(() => setSaved(false), 2000);
  };
  const onTest = async () => {
    if (!baseUrl || !model) { onToast('baseUrl 和 model 不能为空'); return; }
    const r = await testModel({ baseUrl, apiKey, model, api: 'openai-completions' });
    onToast(r.ok ? '✅ 连接成功' : '❌ ' + r.detail);
  };
  const onClear = async () => {
    const fresh = await saveSettings({ imageModel: null });
    setS(fresh); setBaseUrl(''); setApiKey(''); setModel('');
    onToast('已清除图像模型');
  };
  const onSync = async () => {
    const r = await syncImageModelFromCloud();
    onToast(r.ok ? '✅ ' + r.msg : '❌ ' + r.msg);
    if (r.fresh) setS(r.fresh);
  };
  return (
    <div className="add-model-form" style={{ marginTop: 16 }}>
      <h4 style={{ margin: '0 0 4px' }}>图像生成模型{saved ? ' · 已保存 ✓' : (img.model ? ' · 已配置' : '')}</h4>
      <p className="hint">用于 image-gen 技能生成背景图/插图。自动探测协议：baseUrl 以 /v1 结尾走 OpenAI 标准 /images/generations；带具体模型路由（如腾讯混元 wand）走对话式生图。本地明文存储，不进对话模型列表。</p>
      <input className="input" placeholder="API 地址（如 https://api.lkeap.com/v1 或腾讯混元完整端点）" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setSaved(false); }} />
      <input className="input" placeholder="模型名（如 hy-image-v3.5-preview）" value={model} onChange={(e) => { setModel(e.target.value); setSaved(false); }} />
      <input className="input" type="password" placeholder="API Key" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setSaved(false); }} />
      <div className="row-actions">
        <button className="btn small pri" onClick={onSave}>保存</button>
        <button className="btn small" onClick={onTest}>测试连接</button>
        <button className="btn small" onClick={onClear}>清除</button>
        {isLoggedIn() && <button className="btn small" onClick={onSync}>从云端同步</button>}
      </div>
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-dim)', fontSize: 13 }}>图库 & 代理（可选，image-gen 级联第 2/3 层）</summary>
        <div style={{ marginTop: 8 }}>
          <input className="input" placeholder="Unsplash Access Key（留空=图库模式跳过）" value={unsplashKey} onChange={(e) => { setUnsplashKey(e.target.value); setSaved(false); }} />
          <input className="input" placeholder="代理地址（如 http://127.0.0.1:7890，访问境外图库用）" value={proxy} onChange={(e) => { setProxy(e.target.value); setSaved(false); }} />
          <p className="hint">image-gen 默认级联：大模型 → 图库(Unsplash) → 纹理。图库需 Key，境外访问需代理。两者都不配也能出片（走纹理兜底）。</p>
        </div>
      </details>
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
  const [api, setApi] = useState<ModelConfig['api']>(m.api);
  const [kind, setKind] = useState<'chat' | 'image'>(m.kind || 'chat');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const onTest = async () => {
    setTesting(true); setResult(null);
    const r = await testModel({ id: m.id, baseUrl: m.baseUrl, apiKey: m.apiKey || '', model: m.model, api: m.api });
    setResult((r.ok ? '✅ ' : '❌ ') + r.detail);
    setTesting(false);
  };

  if (editing) {
    return (
      <div className={`model-row editing ${isCurrent ? 'current' : ''}`}>
        <div className="model-edit-form">
          <input className="input" placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="API 地址" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <input className="input" placeholder="模型名" value={model} onChange={(e) => setModel(e.target.value)} />
          <input className="input" type="password" placeholder={m.hasKey ? '已配置，留空保留旧 Key' : 'API Key（本地服务可空）'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <select className="input" value={api} onChange={(e) => setApi(e.target.value as ModelConfig['api'])}>
            <option value="openai-completions">OpenAI 兼容（Chat Completions）</option>
            <option value="openai-responses">OpenAI Responses</option>
            <option value="anthropic-messages">Anthropic Messages</option>
          </select>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'chat' | 'image')}>
            <option value="chat">用途：对话</option>
            <option value="image">用途：图像生成</option>
          </select>
          <div className="row-actions">
            <button className="btn small pri" onClick={() => onSaveModel(m.id, { name, baseUrl, apiKey, model, api, kind })}>保存</button>
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
        <div className="model-name">{m.name}</div>
        <div className="model-meta">
          {m.model} · {API_LABELS[m.api] ?? m.api} · {m.baseUrl}{m.hasKey ? ' · 🔑' : ''}
        </div>
        {result && <div className="model-test-result" style={{ fontSize: 11, color: result.startsWith('✅') ? 'var(--green)' : 'var(--danger)', marginTop: 4 }}>{result}</div>}
      </div>
      <div className="row-actions">
        <button className="btn small" onClick={onTest} disabled={testing}>{testing ? '测试中…' : '测试'}</button>
        <button className="btn small" onClick={() => setEditing(m.id)}>编辑</button>
        <button className="btn small danger" onClick={() => onDelete(m.id)}>删除</button>
      </div>
    </div>
  );
}

function AddModelForm({ onAdd, onCancel }: { onAdd: (m: Omit<ModelConfig, 'id'>) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [api, setApi] = useState<ModelConfig['api']>('openai-completions');
  const [kind, setKind] = useState<'chat' | 'image'>('chat');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const onTest = async () => {
    if (!baseUrl) return;
    setTesting(true); setResult(null);
    const r = await testModel({ baseUrl, apiKey, model, api });
    setResult((r.ok ? '✅ ' : '❌ ') + r.detail);
    setTesting(false);
  };

  const submit = () => {
    if (!name || !model || !baseUrl) return;
    onAdd({ name, baseUrl, apiKey, model, api, kind });
  };

  return (
    <div className="add-model-form">
      <input className="input" placeholder="名称（如 我的 DeepSeek）" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" placeholder="API 地址（如 https://api.deepseek.com，Ollama 填 http://localhost:11434/v1）" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      <input className="input" placeholder="模型名（如 deepseek-chat）" value={model} onChange={(e) => setModel(e.target.value)} />
      <input className="input" type="password" placeholder="API Key（本地服务可空）" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <select className="input" value={api} onChange={(e) => setApi(e.target.value as ModelConfig['api'])}>
        <option value="openai-completions">OpenAI 兼容（Chat Completions）</option>
        <option value="openai-responses">OpenAI Responses</option>
        <option value="anthropic-messages">Anthropic Messages</option>
      </select>
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'chat' | 'image')}>
        <option value="chat">用途：对话</option>
        <option value="image">用途：图像生成</option>
      </select>
      <div className="row-actions">
        <button className="btn small" onClick={onTest} disabled={testing || !baseUrl}>{testing ? '测试中…' : '测试连接'}</button>
        <button className="btn small pri" onClick={submit}>添加</button>
        <button className="btn small" onClick={onCancel}>取消</button>
      </div>
      {result && <div style={{ fontSize: 11, color: result.startsWith('✅') ? 'var(--green)' : 'var(--danger)', marginTop: 4 }}>{result}</div>}
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
      <p className="hint">记忆会写入 dsh 的全局指令文件，注入到每次对话的 system prompt。这里可查看 / 搜索 / 手动增删。</p>

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
function SkillsTab({ onToast }: { onToast: (t: string) => void }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [active, setActive] = useState<Skill | null>(null);
  const [body, setBody] = useState('');
  const [dir, setDir] = useState('');
  const [scanGlobal, setScanGlobal] = useState(false);

  const reload = useCallback(async () => {
    setSkills(await listSkills());
  }, []);
  useEffect(() => {
    reload();
    getSkillsDir().then(setDir);
    getSettings().then((st) => setScanGlobal(!!st.scanGlobalSkills));
  }, [reload]);

  const onToggleScan = async (v: boolean) => {
    setScanGlobal(v);
    await saveSettings({ scanGlobalSkills: v });
    onToast(v ? '已开启：同时扫描 ~/.agents/skills 等全局目录' : '已关闭：仅扫描 SuperAI 技能目录');
  };

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
      <p className="hint">
        技能是带 frontmatter 的 SKILL.md，放在下面的技能目录即生效。默认 <b>只扫描 SuperAI 自己的技能目录</b>，
        不会读取 ~/.agents/skills 等系统全局技能目录；如需使用那里的技能，开启下方开关（视为你同意访问该目录）。
      </p>
      {dir && (
        <div className="dir-pick" style={{ cursor: 'default' }} title="技能目录（在文件管理器中打开此目录放入 SKILL.md）">
          📁 {dir}
        </div>
      )}
      <div className="field" style={{ marginTop: 8 }}>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={scanGlobal}
            onChange={(e) => onToggleScan(e.target.checked)}
          />
          <span>同时扫描全局技能目录（~/.agents/skills 等）</span>
        </label>
      </div>

      <div className="skill-list">
        {skills.length === 0 && <p className="hint">还没有技能。把 SKILL.md 放到上面的技能目录即可。</p>}
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
