// settings.cjs — 本地设置管理（明文 JSON，符合用户要求）
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let cache = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function defaults() {
  return {
    provider: '',          // 'deepseek' | 'openai' | 'ollama' — 无默认值，用户选
    apiKey: '',            // 明文存储
    baseUrl: '',           // 自定义 API 地址（留空用各 provider 默认）
    model: '',             // 模型名
    workspace: '',         // 工作目录
    autoExec: true,        // 自动执行工具
  };
}

const PROVIDER_PRESETS = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  openai:   { baseUrl: 'https://api.openai.com',    model: 'gpt-4o' },
  ollama:   { baseUrl: 'http://localhost:11434',   model: 'qwen2.5:14b' },
};

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    cache = { ...defaults(), ...JSON.parse(raw) };
  } catch {
    cache = defaults();
  }
  return cache;
}

function save(patch) {
  const next = { ...load(), ...patch };
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8');
  cache = next;
  return next;
}

function getPresets() {
  return PROVIDER_PRESETS;
}

module.exports = { load, save, defaults, getPresets, settingsPath };
