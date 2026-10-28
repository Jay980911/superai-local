// memory.cjs — 长期记忆（profile.md 双写：人类可读 + RAW_JSON）
// 存 <appData>/memory/profile.md，不依赖工作目录
const path = require('path');
const fs = require('fs');
const settings = require('./settings.cjs');

function memoryDir() {
  return path.join(settings.appDataDir(), 'memory');
}
function profilePath() {
  return path.join(memoryDir(), 'profile.md');
}
function ensureDir() {
  if (!fs.existsSync(memoryDir())) fs.mkdirSync(memoryDir(), { recursive: true });
}

function loadProfile() {
  ensureDir();
  try {
    const raw = fs.readFileSync(profilePath(), 'utf-8');
    const m = raw.match(/<!-- RAW_JSON_START\n([\s\S]*?)\nRAW_JSON_END -->/);
    if (m) return JSON.parse(m[1]);
  } catch {}
  return { facts: [], version: 1, lastUpdatedAt: null };
}

function saveProfile(data) {
  ensureDir();
  data.version = (data.version || 1) + 1;
  data.lastUpdatedAt = new Date().toISOString();
  // 防御：确保每条 fact 的 tags 是数组
  if (Array.isArray(data.facts)) {
    data.facts = data.facts.map((f) => ({ ...f, tags: Array.isArray(f.tags) ? f.tags : (typeof f.tags === 'string' && f.tags ? f.tags.split(/[,，\s]+/).filter(Boolean) : []) }));
  }
  let md = `# User Memory Profile\n> Last updated: ${data.lastUpdatedAt}\n> Version: ${data.version}\n\n## Facts\n`;
  for (const f of data.facts) {
    md += `- ${f.content}${f.tags && f.tags.length ? ` [${f.tags.join(',')}]` : ''}\n`;
  }
  md += `\n---\n<!-- RAW_JSON_START\n${JSON.stringify(data, null, 2)}\nRAW_JSON_END -->\n`;
  fs.writeFileSync(profilePath(), md, 'utf-8');
}

/** 返回注入 system prompt 的记忆文本 */
function getMemoryText() {
  const p = loadProfile();
  if (!p.facts || p.facts.length === 0) return '';
  return p.facts.map((f) => `- ${f.content}`).join('\n');
}

/** 存一条记忆 */
function saveMemory(content, tags) {
  const p = loadProfile();
  const tagArr = Array.isArray(tags) ? tags : (typeof tags === 'string' && tags ? tags.split(/[,，\s]+/).filter(Boolean) : []);
  p.facts.push({ id: 'f' + Date.now(), content, tags: tagArr, createdAt: new Date().toISOString() });
  saveProfile(p);
  return { ok: true, count: p.facts.length };
}

/** 搜索记忆 */
function searchMemory(query) {
  const p = loadProfile();
  const q = (query || '').toLowerCase();
  const results = p.facts.filter((f) => f.content.toLowerCase().includes(q));
  return { results };
}

/** 列出全部记忆条目（供 UI 管理） */
function listFacts() {
  const p = loadProfile();
  return (p.facts || []).map((f) => ({
    id: f.id,
    content: f.content,
    tags: Array.isArray(f.tags) ? f.tags : [],
    createdAt: f.createdAt || null,
  }));
}

/** 删除单条记忆 */
function deleteFact(id) {
  const p = loadProfile();
  const before = p.facts.length;
  p.facts = p.facts.filter((f) => f.id !== id);
  if (p.facts.length === before) return { ok: false };
  saveProfile(p);
  return { ok: true, count: p.facts.length };
}

/** 清空全部记忆 */
function clearAll() {
  saveProfile({ facts: [], version: 0, lastUpdatedAt: null });
  return { ok: true, count: 0 };
}

/**
 * 把记忆写入 dsh 的全局指令文件 <dshHome>/AGENTS.md。
 * dsh 的 agent-instructions 插件会把该文件作为 user-global 指令注入每次
 * 对话的 system prompt（与 ~/.agents/AGENTS.md、工作目录 AGENTS.md 合并）。
 * 无记忆时也要写平台指令（平台约束始终生效）。
 * @param {string} dshHome dsh 状态目录（DSH_HOME）
 * @returns {{ok: boolean, count: number}}
 */
function writeDshInstructions(dshHome, opts = {}) {
  const file = path.join(dshHome, 'AGENTS.md');
  const p = loadProfile();
  const facts = Array.isArray(p.facts) ? p.facts : [];
  const lines = [
    '# SuperAI 平台指令（自动生成，勿手改）',
    '',
    '## 平台能力与约定',
    '',
    '- 你运行在 SuperAI 桌面工作台里。用户在左侧对话，右侧成果栏会自动展示工作目录的文件树、源码、预览。',
    '- **生成的文件会自动在右侧预览栏渲染**（HTML/SVG/Markdown 直接内嵌预览，其他文件可点开看源码）。',
    '- 因此：生成 HTML / PPT / 报告等可预览文件后，**不要在回复里给出 localhost / http 预览链接**，也不要让用户“在浏览器打开 http://127.0.0.1:xxxx”。直接告诉用户“已在右侧预览栏展示”即可。',
    '- 不要为了预览而启动 live-server / http-server 等本地 Web 服务；文件直接生成到工作目录即可被预览。',
    '- 生成的产物默认放工作目录下（可建子目录组织），路径用相对工作目录的形式给出。',
    '- **生成演示文稿/报告时，默认输出 HTML 文件**（superai 右栏可完美预览 HTML，含字体/样式/翻页）。',
    '  只有当用户明确要求“导出 pptx / 可下载的 Office 文件”时，才额外生成 .pptx；',
    '  .pptx 在 superai 里会自动转换预览（用内置 python-pptx 解析为 HTML，还原图文版式），',
    '  无需让用户去外部打开。但仍建议默认产 HTML，pptx 作为可选导出。',
    '- 支持右栏预览的格式：HTML/SVG/Markdown/PDF/图片；pptx 会自动转预览。',
    '',
    '## 联网查资料（网页抓取）',
    '',
    '- 需要查网络资料（文档、教程、新闻、API 说明、实时信息）时，用 pwsh 运行下面命令抓取网页，',
    '  它返回去标签后的正文（截断约 8000 字），据此回答用户、不要让用户自己去浏览器查：',
    (opts.nodeBin && opts.fetchScript
      ? '  `"' + opts.nodeBin + '" "' + opts.fetchScript + '" "<url>"`'
      : '  （未配置网页抓取：缺 node/fetch 脚本路径）'),
    '- 例如查某框架 API：把 <url> 换成具体页面地址即可。JSON/纯文本接口也能抓（原样返回）。',
    '- 抓不全或内容不符时，换更具体的 URL 再抓一次；不要拿错误信息当结论。',
    '- 抓取是联网动作，仅在确需外部资料时调用，不要无意义频繁抓。',
    '',
    '## 生成/编辑 PPT（pptx-gen 技能）',
    '',
    '- 用户要做 PPT/幻灯片/演示文稿，或改已有 PPT 的文字/页时，读 pptx-gen 技能指令后执行。',
    '- 生成：先写 spec.json 到工作目录（结构见技能 SKILL.md），再运行（python 路径已注入）：',
    (opts.pythonBin && opts.pptxGenDir
      ? '  `"' + opts.pythonBin + '" "' + opts.pptxGenDir + '\\gen_pptx.py" --spec spec.json --out 输出文件.pptx`'
      : '  （未配置 pptx-gen：缺 python/脚本路径）'),
    '- 编辑：写 edits.json，运行 `"' + (opts.pythonBin||'python') + '" "' + (opts.pptxGenDir||'') + '\\edit_pptx.py" --in 原.pptx --edits edits.json`（不写 --out 则存回原文件）。',
    '- 生成后右栏自动转 HTML 预览，回复“已生成 PPT、共 N 页、已在右栏预览”，不要给 localhost 链接。',
    '- spec/edits 结构详见 pptx-gen 技能 SKILL.md（用 read_skill 读取）。',
    '',
    '## 生图方式：尊重用户指定',
    '',
    '- 调 image-gen（或 xinzhongshi-ppt 的 prepare_backgrounds.py）生图时，**用户明确说了方式就必须用指定模式，不擅自级联退化**：',
    '  - 用户说「用大模型生 / 用 AI 生图 / 用模型生」→ `--mode model`（或 `--bg-mode model`）',
    '  - 用户说「用图库 / 找张照片 / 用素材库」→ `--mode stock`（或 `--bg-mode stock`）',
    '  - 用户说「用纹理 / 纯色底 / 程序化背景」→ `--mode texture`（或 `--bg-mode texture`）',
    '  - 用户没指定方式，或说「随便 / 你看着办 / 保证出图」→ 默认 `auto`（图库→纹理→大模型 级联，大模型殿后省钱）',
    '- 指定模式失败时如实告诉用户「指定方式失败」，**不要偷偷换成别的方式**；auto 模式才会自动退化。',
    '- **找图片/照片用 image-gen --mode stock，不要用 web_search**。image-gen 的 stock 模式内置 Unsplash 搜图+下载，宿主已把 UNSPLASH_ACCESS_KEY 注入环境变量，你不需要也不应该去检查或传递 key——直接调 image-gen，它自己读 env。',
    '- **你看不到环境变量，不要凭猜测说「key 未配置」**。image-gen 调失败时它会自己报错告诉你具体原因（key 缺失/网络超时/无搜索结果），按报错信息转达给用户即可，不要自己下结论。',
    '',
    '## 生成的 HTML 页面规范',
    '',
    '- **每个项目的素材（背景图/配图/中间产物）必须放在项目专属子目录**：`workspace/<项目名>/...`，**严禁**放在 workspace 根目录的共享目录。避免跨项目串图/串文件——上一个项目留下的临时产物不能给新项目用。',
    '- **新项目不要复用 workspace 里残留的旧产物**。只有 skill 内置的资产库（如 `assets/backgrounds/`）可以按自身规则跨项目复用，workspace 级的临时文件不行。',
    '- **按当前技能的 SKILL.md 指引走，不要混用其他技能的机制/产物**。每个技能有自己的背景/排版/导出流程，不要拿 A 技能的中间产物去给 B 技能用。',
    '- **演示类 HTML（翻页 PPT/汇报）必须支持点击翻页**：不能只靠键盘 ←→，因为 iframe 预览没有焦点时键盘不触发。必须包含：',
    '  - 点击翻页（点击右侧→下一页，左侧→上一页，避开按钮区域）',
    '  - 可见的翻页按钮（‹ ›）和进度点（可点击跳页）',
    '  - 键盘/滚轮/触摸作为补充',
    '- **不要用 fonts.googleapis.com 加载字体**——国内被墙，`<link rel=stylesheet>` 是渲染阻塞资源，超时会导致整页白屏。',
    '  - 中文字体优先用系统字体（微软雅黑/黑体/宋体），不依赖网络字体。',
    '  - 确需网络字体时：用国内镜像（`fonts.font.im`），且必须非阻塞加载：`<link rel="preload" as="style" href="..." onload="this.onload=null;this.rel=\'stylesheet\'">`，并始终带系统字体兑底（`font-family:"Noto Sans SC","Microsoft YaHei",sans-serif`）。',
    '- 不要引用任何境外 CDN（googleapis/gstatic/unpkg/jsdelivr 的境外节点），用国内镜像或本地内联资源。',
    '',
    '## 用户长期记忆',
    '',
    '以下是 SuperAI 工作台记录的长期记忆，代表用户的偏好与背景。',
    '在对话中遵循这些偏好；与用户当前指令冲突时，以当前指令为准。',
    '',
  ];
  if (facts.length === 0) {
    lines.push('（暂无记忆条目）', '');
  } else {
    for (const f of facts) lines.push(`- ${f.content}`);
    lines.push('');
  }
  fs.mkdirSync(dshHome, { recursive: true });
  fs.writeFileSync(file, lines.join('\n'), 'utf-8');
  return { ok: true, count: facts.length };
}

module.exports = { loadProfile, saveProfile, getMemoryText, saveMemory, searchMemory, listFacts, deleteFact, clearAll, writeDshInstructions };
