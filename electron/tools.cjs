// tools.cjs — 4 个本地工具实现
// read_file / write_file / list_files / run_command
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

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
];

function resolvePath(p, workspace) {
  if (!p) return workspace;
  if (path.isAbsolute(p)) return p;
  return path.join(workspace, p);
}

function listFiles(args, workspace) {
  const dir = resolvePath(args.dir, workspace);
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
  const size = fs.statSync(p).size;
  if (size > 1024 * 1024) throw new Error('文件过大（>1MB），拒绝读取');
  return fs.readFileSync(p, 'utf-8');
}

function writeFile(args, workspace) {
  const p = resolvePath(args.path, workspace);
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

const HANDLERS = { list_files: listFiles, read_file: readFile, write_file: writeFile, run_command: runCommand };

async function execute(name, args, workspace) {
  const fn = HANDLERS[name];
  if (!fn) throw new Error(`未知工具: ${name}`);
  return await fn(args, workspace);
}

module.exports = { TOOL_SCHEMAS, execute };
