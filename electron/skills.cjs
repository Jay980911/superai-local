// skills.cjs — 扫描 <appData>/skills/ 目录，读取 SKILL.md frontmatter
// 不依赖工作目录，技能存 <appData>/skills/<name>/
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const settings = require('./settings.cjs');

function skillsDir() {
  // 打包态：技能随包分发在 resources/data/skills（静态只读资源，由 extraResources 落地）；
  // 开发态：在项目根/data/skills（= appDataDir/data/skills）。
  if (app && app.isPackaged) return path.join(process.resourcesPath, 'data', 'skills');
  return path.join(settings.appDataDir(), 'skills');
}
function ensureDir() {
  if (!fs.existsSync(skillsDir())) fs.mkdirSync(skillsDir(), { recursive: true });
}

/** 解析 YAML frontmatter（简单实现，不引入额外依赖） */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  const lines = m[1].split('\n');
  for (const line of lines) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    // 数组 [a, b]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    } else if (/^-?\d+$/.test(val)) {
      val = parseInt(val, 10);
    } else {
      // 去引号
      val = val.replace(/^["']|["']$/g, '');
    }
    meta[key] = val;
  }
  return { meta, body: m[2] };
}

/** 扫描所有技能，返回列表 */
function listSkills() {
  ensureDir();
  const result = [];
  let entries = [];
  try {
    entries = fs.readdirSync(skillsDir(), { withFileTypes: true });
  } catch {
    return result;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() && !ent.isFile()) continue;
    // 支持目录形式（<name>/SKILL.md）和单文件形式（<name>.md）
    let name, skillPath;
    if (ent.isDirectory()) {
      name = ent.name;
      skillPath = path.join(skillsDir(), ent.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
    } else if (ent.name.endsWith('.md')) {
      name = ent.name.replace(/\.md$/, '');
      skillPath = path.join(skillsDir(), ent.name);
    } else {
      continue;
    }
    // 跳过隐藏目录
    if (name.startsWith('.') || name.startsWith('_')) continue;
    try {
      const raw = fs.readFileSync(skillPath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      result.push({
        name: meta.name || name,
        display_name: meta.display_name || meta.name || name,
        description: meta.description || '',
        category: meta.category || '其他',
        version: meta.version || '1.0.0',
        author: meta.author || '',
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        dir: ent.isDirectory() ? path.join(skillsDir(), ent.name) : null,
        body,
      });
    } catch {
      // 跳过读不了的
    }
  }
  return result;
}

/** 读单个技能完整内容（含正文） */
function readSkill(name) {
  ensureDir();
  // 先试目录形式
  let p = path.join(skillsDir(), name, 'SKILL.md');
  if (!fs.existsSync(p)) {
    p = path.join(skillsDir(), name + '.md');
  }
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf-8');
  const { meta, body } = parseFrontmatter(raw);
  return { meta, body, path: p };
}

module.exports = { listSkills, readSkill, skillsDir };
