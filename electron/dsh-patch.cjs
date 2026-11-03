// dsh-patch.cjs — 把 superai 的模型设置映射为 dsh（deepseek-harness）的 provider patch
// 生成的 YAML 经 `dsh --patch` 叠加到 sdk profile，把用户自配的任意大模型
// 注册成 dsh 的 provider。API Key 经环境变量注入（apiKeyEnv），不落盘。
//
// 与 dsh 的契约（@deepseek-ai/dsh-llm-pi-ai，版本 0.2.1-rc.3 实测）：
//   - patch 条目用 profile 里目标条目的 id 匹配（llm-pi-ai），不是插件包名
//   - providers.<id> = { api, baseURL, apiKeyEnv, displayName, models: [{id, name}] }
//   - api 取值与 settings 的 ModelConfig.api 同名单：openai-completions /
//     openai-responses / anthropic-messages
const path = require('path');
const fs = require('fs');

/** API Key 统一经此环境变量注入（spawn 时按当前模型赋值） */
const KEY_ENV = 'SUPERAI_MODEL_API_KEY';

/** settings 模型 id → dsh provider id（YAML key，须为纯 ASCII） */
function providerId(model) {
  return 'superai-' + model.id;
}

/**
 * 输出一个 YAML 双引号标量。JSON 字符串是 YAML 1.2 的合法 flow scalar，
 * 用 JSON.stringify 转义比手写 YAML 转义可靠（用户输入含引号/冒号/换行都安全）。
 */
function yamlString(value) {
  return JSON.stringify(String(value));
}

/**
 * 由模型列表生成 provider patch YAML。
 * @param {Array<{id,name,baseUrl,apiKey,model,api}>} models
 * @param {object} [opts]
 * @param {string[]} [opts.skillDirs] superai 技能目录绝对路径列表；
 *   dsh 的 skill-filesystem 插件默认只读 <DSH_HOME>/skills 等工作区根，
 *   经 customSkillDirs 指向 superai 自己的技能目录，设置面板里的技能
 *   才能被 agent 发现（skill/read_skill 工具）。
 * @returns {string|null} YAML 文本；无可用模型时返回 null（调用方应先行报错）
 */
function buildPatchYaml(models, opts = {}) {
  const usable = (models || []).filter((m) => m && m.id && m.baseUrl && m.model);
  if (usable.length === 0) return null;

  const lines = [
    '# 由 SuperAI 设置自动生成：用户模型 → dsh llm-pi-ai providers',
    '# 请勿手改；每次 agent:run 前按 settings.json 重写。',
    '# 注意：patch 条目用目标条目 id 匹配（llm-pi-ai），不是插件包名。',
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
  ];
  for (const m of usable) {
    lines.push(`      ${providerId(m)}:`);
    lines.push(`        api: ${yamlString(m.api || 'openai-completions')}`);
    lines.push(`        baseURL: ${yamlString(m.baseUrl)}`);
    lines.push(`        apiKeyEnv: ${yamlString(KEY_ENV)}`);
    lines.push(`        displayName: ${yamlString(m.name || m.model)}`);
    lines.push('        models:');
    lines.push(`          - id: ${yamlString(m.model)}`);
    lines.push(`            name: ${yamlString(m.model)}`);
    // 新版 OpenAI 模型（gpt-4o/gpt-5/gpt-6 等）要求 max_completion_tokens，
    // 不接受旧的 max_tokens。按模型名自动判断。
    const needsCompletionTokens = /^(gpt-[456]|o[134]|o[134]-|chatgpt)/i.test(m.model);
    if (needsCompletionTokens) {
      lines.push('            compat:');
      lines.push('              maxTokensField: "max_completion_tokens"');
      // 多数 OpenAI 兼容网关（Azure 转发类）在 /chat/completions 上不允许
      // 「function tools + 非 none 的 reasoning_effort」并存，且缺省按非 none
      // 处理——不带参数也 400。必须显式发送 reasoning_effort: "none"。
      // pi-ai 的 off 映射：默认档位（不思考）时发送 off 的值；
      // 至少要声明一个非 off 档位，否则 schema 拒绝。
      lines.push('            reasoningEfforts:');
      lines.push('              off: "none"');
      lines.push('              low: "low"');
      lines.push('              medium: "medium"');
      lines.push('              high: "high"');
    }
  }

  // 技能发现范围：默认只扫 superai 自己的 data/skills（includeDefaultRoots=false），
  // 不扫 ~/.agents/skills、DSH_HOME/skills、工作目录 .agents/skills 等 dsh 默认根。
  // 用户在设置里开启“扫描全局技能目录”才放行默认根（=显式同意），避免 agent
  // 默默拿用 ~/.agents/skills 里的技能（如 dashi-ppt）而不告知用户。
  // 始终输出 skill-filesystem 条目（即使 data/skills 为空也要关掉默认根）。
  const skillDirs = (opts.skillDirs || []).filter((d) => typeof d === 'string' && d.trim());
  const includeDefaults = opts.includeDefaultRoots === true; // 默认 false
  lines.push(
    '# superai 技能发现范围：默认只扫 data/skills，不扫 ~/.agents/skills 等默认根',
    '- id: skill-filesystem',
    '  config:',
    `    includeDefaultRoots: ${includeDefaults}`,
    '    customSkillDirs:',
  );
  for (const d of skillDirs) lines.push(`      - ${yamlString(d)}`);
  if (skillDirs.length === 0) lines.push('      []');
  return lines.join('\n') + '\n';
}

/**
 * 把 patch 写入 dshHome 并返回文件路径。
 * @param {string} dshHome dsh 的状态目录（同时是 DSH_HOME）
 * @param {Array} models settings 模型列表
 * @param {object} [opts] 同 buildPatchYaml
 * @returns {string|null} patch 文件绝对路径；无可用模型时返回 null
 */
function writePatch(dshHome, models, opts = {}) {
  const yaml = buildPatchYaml(models, opts);
  if (!yaml) return null;
  fs.mkdirSync(dshHome, { recursive: true });
  const file = path.join(dshHome, 'superai-providers.patch.yml');
  fs.writeFileSync(file, yaml, 'utf-8');
  return file;
}

module.exports = { KEY_ENV, providerId, buildPatchYaml, writePatch };
