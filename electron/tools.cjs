// tools.cjs — 4 个本地工具实现
// read_file / write_file / list_files / run_command
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// 技能读取走 skills.cjs（避免与 agent.cjs 循环依赖：延迟 require）
function readSkillTool(args) {
  const skills = require('./skills.cjs');
  const r = skills.readSkill(args.name);
  if (!r) return { error: `未找到技能: ${args.name}` };
  // 只返回正文，frontmatter meta 摘要已在 system prompt 里给过
  return { name: args.name, body: r.body, meta: r.meta };
}

/** 工具 schema — 传给 LLM 的 function calling 定义 */
const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出指定目录下的文件和文件夹（递归，最多 3 层）。',
      parameters: {
        type: 'object',
        properties: { dir: { type: 'string', description: '要列出的目录路径，默认工作目录' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定文件的文本内容。',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件路径（相对工作目录或绝对路径）' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '将文本内容写入指定文件（覆盖已有内容）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '要写入的内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: '在本地执行 shell 命令（超时 30 秒）。仅用于必要场景。',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: '要执行的命令' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: '保存一条长期记忆。当用户透露个人信息、偏好、项目背景时调用。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '记忆内容，一句话' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签如 profile/work/preference' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description: '搜索已有记忆。当需要回忆用户之前说过的事时调用。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '搜索关键词' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: '读取某个技能的完整指令正文。当用户任务匹配某个已安装技能时调用，按其指令执行。',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '技能名称（来自技能清单）' } },
        required: ['name'],
      },
    },
  },
];

function resolvePath(p, workspace) {
  if (!p) return workspace;
  if (path.isAbsolute(p)) return p;
  return path.join(workspace, p);
}

/**
 * 工作目录边界校验：产品承诺「所有操作都限定在你授权的工作目录里」。
 * 绝对路径必须位于 workspace 内，否则拒绝（相对路径 resolvePath 后自然在内）。
 */
function assertInside(p, workspace) {
  if (!workspace) return;
  const rel = path.relative(path.resolve(workspace), path.resolve(p));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径越界：${p} 不在工作目录 ${workspace} 内`);
  }
}

function listFiles(args, workspace) {
  const dir = resolvePath(args.dir, workspace);
  assertInside(dir, workspace);
  const result = [];
  function walk(d, depth, prefix) {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.gitignore') continue;
      const full = path.join(d, e.name);
      const rel = prefix + e.name;
      const stat = (() => { try { return fs.statSync(full); } catch { return null; } })();
      result.push({
        name: e.name,
        path: rel,
        type: e.isDirectory() ? 'dir' : 'file',
        size: stat ? stat.size : 0,
      });
      if (e.isDirectory()) walk(full, depth + 1, rel + '/');
    }
  }
  walk(dir, 0, '');
  return result;
}

function readFile(args, workspace) {
  const p = resolvePath(args.path, workspace);
  assertInside(p, workspace);
  const size = fs.statSync(p).size;
  if (size > 1024 * 1024) throw new Error('文件过大（>1MB），拒绝读取');
  return fs.readFileSync(p, 'utf-8');
}

function writeFile(args, workspace) {
  const p = resolvePath(args.path, workspace);
  assertInside(p, workspace);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, args.content, 'utf-8');
  const stat = fs.statSync(p);
  return { path: p, size: stat.size };
}

function runCommand(args, workspace) {
  return new Promise((resolve, reject) => {
    exec(args.command, { cwd: workspace, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(`${err.message}\n${stderr}`));
      resolve({ stdout: stdout.slice(0, 5000), stderr: stderr.slice(0, 2000) });
    });
  });
}

// read_skill / save_memory / search_memory 不走 HANDLERS（agent.cjs 单独路由）
const HANDLERS = { list_files: listFiles, read_file: readFile, write_file: writeFile, run_command: runCommand, read_skill: readSkillTool };

async function execute(name, args, workspace) {
  const fn = HANDLERS[name];
  if (!fn) throw new Error(`未知工具: ${name}`);
  // read_skill 不需要 workspace
  if (name === 'read_skill') return fn(args || {});
  return await fn(args, workspace);
}

module.exports = { TOOL_SCHEMAS, execute };
