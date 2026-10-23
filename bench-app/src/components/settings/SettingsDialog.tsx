// SettingsDialog.tsx — 设置弹窗：LLM 提供商 / API Key / 工作目录
import { useState, useEffect } from 'react';
import { getSettings, saveSettings, getPresets, pickDirectory, type Settings } from '../../data/api';

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [presets, setPresets] = useState<Record<string, { baseUrl: string; model: string }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then(setS);
    getPresets().then(setPresets);
  }, []);

  if (!s) return <div className="dialog-overlay" onClick={onClose} />;

  const onProvider = (provider: string) => {
    const p = presets[provider];
    setS({
      ...s,
      provider,
      baseUrl: p ? p.baseUrl : s.baseUrl,
      model: p ? p.model : s.model,
    });
  };

  const onPickDir = async () => {
    const dir = await pickDirectory();
    if (dir) setS({ ...s, workspace: dir });
  };

  const onSave = async () => {
    setSaving(true);
    await saveSettings(s);
    setSaving(false);
    setSaved(true);
    setTimeout(() => onClose(), 600);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h2>设置</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="dialog-body">
          {/* Provider */}
          <div className="field">
            <label>AI 提供商</label>
            <div className="provider-row">
              <button className={`pbtn ${s.provider === 'deepseek' ? 'on' : ''}`} onClick={() => onProvider('deepseek')}>DeepSeek</button>
              <button className={`pbtn ${s.provider === 'openai' ? 'on' : ''}`} onClick={() => onProvider('openai')}>OpenAI</button>
              <button className={`pbtn ${s.provider === 'ollama' ? 'on' : ''}`} onClick={() => onProvider('ollama')}>Ollama</button>
            </div>
            <p className="hint">不设默认——你自己选。Ollama 本地运行无需 API Key。</p>
          </div>

          {/* API Key */}
          {s.provider !== 'ollama' && (
            <div className="field">
              <label>API Key</label>
              <input
                type="password"
                className="input"
                placeholder="sk-..."
                value={s.apiKey}
                onChange={(e) => setS({ ...s, apiKey: e.target.value })}
              />
              <p className="hint">明文存储在本地设置文件中，不上传任何服务器。</p>
            </div>
          )}

          {/* Base URL */}
          <div className="field">
            <label>API 地址</label>
            <input
              className="input"
              placeholder="https://api.deepseek.com"
              value={s.baseUrl}
              onChange={(e) => setS({ ...s, baseUrl: e.target.value })}
            />
          </div>

          {/* Model */}
          <div className="field">
            <label>模型</label>
            <input
              className="input"
              placeholder="deepseek-chat"
              value={s.model}
              onChange={(e) => setS({ ...s, model: e.target.value })}
            />
          </div>

          {/* Workspace */}
          <div className="field">
            <label>工作目录</label>
            <div className="dir-pick" onClick={onPickDir}>
              📁 {s.workspace || '选择工作目录'}
            </div>
            <p className="hint">AI 只能在此目录内读写文件、执行命令。</p>
          </div>

          {/* Auto exec */}
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
          </div>
        </div>
        <div className="dialog-foot">
          {saved && <span className="saved-tip">已保存 ✓</span>}
          <button className="btn pri" onClick={onSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
