// plugins.cjs — dsh 插件管理（通过 profile 文件 + dsh plugin CLI）
// 读取 sdk profile 的 bundle 列表 / 安装 / 卸载 / 启停。
// 不依赖 dsh 内部 remote API，只用文件读写 + 子进程 CLI，保证跨版本稳定。
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { app } = require('electron');

const dshHome = () => path.join(
  app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..'),
  'data', 'dsh-home'
);
const profileDir = () => path.join(dshHome(), 'profiles', 'sdk');
const profilePkgPath = () => path.join(profileDir(), 'package.json');

/** 解析 dsh 运行时 node 与入口（与 dsh-client.cjs 的打包态逻辑对齐） */
function runtimePaths() {
  if (app.isPackaged) {
    const dir = path.join(process.resourcesPath, 'dsh-runtime');
    return {
      nodeBin: path.join(dir, 'node', process.platform === 'win32' ? 'node.exe' : 'node'),
      dshBin: path.join(dir, 'pkg', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    };
  }
  // 开发态：优先 build/dsh-runtime，回退 PATH
  const stagedNode = path.resolve(__dirname, '..', 'build', 'dsh-runtime', 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  const stagedDsh = path.resolve(__dirname, '..', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  return {
    nodeBin: fs.existsSync(stagedNode) ? stagedNode : 'node',
    dshBin: stagedDsh,
  };
}

function readProfile() {
  try {
    return JSON.parse(fs.readFileSync(profilePkgPath(), 'utf-8'));
  } catch {
    return { dependencies: {}, dsh: { profile: { bundles: [] } } };
  }
}

function writeProfile(pkg) {
  fs.mkdirSync(profileDir(), { recursive: true });
  fs.writeFileSync(profilePkgPath(), JSON.stringify(pkg, null, 2), 'utf-8');
}

/** 列出 profile 中的 bundle（含安装状态、启用状态） */
function listBundles() {
  const pkg = readProfile();
  const deps = pkg.dependencies || {};
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  const all = new Set([...Object.keys(deps), ...bundles]);
  return [...all].map((name) => ({
    name,
    version: deps[name] || null,
    enabled: bundles.includes(name),
    isOfficial: name.startsWith('@deepseek-ai/dsh-'),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/** 调用 dsh plugin CLI（同步执行，短命令） */
function runDshPlugin(args) {
  return new Promise((resolve) => {
    const { nodeBin, dshBin } = runtimePaths();
    execFile(nodeBin, [dshBin, 'plugin', '--profile', 'sdk', ...args], {
      cwd: profileDir(),
      timeout: 120000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: stdout?.slice(0, 4000) || '', stderr: stderr?.slice(0, 2000) || '' });
    });
  });
}

async function installBundle(spec, registry) {
  const args = registry ? ['add', spec, '--registry', registry] : ['add', spec];
  return runDshPlugin(args);
}

async function removeBundle(name) {
  return runDshPlugin(['remove', name]);
}

/** 启用/停用 bundle（编辑 profile 的 bundles 列表） */
function setBundleEnabled(name, enabled) {
  const pkg = readProfile();
  const bundles = new Set((pkg.dsh?.profile?.bundles) || []);
  if (enabled) bundles.add(name); else bundles.delete(name);
  pkg.dsh = { ...(pkg.dsh || {}), profile: { ...(pkg.dsh?.profile || {}), bundles: [...bundles] } };
  writeProfile(pkg);
  return true;
}

module.exports = { listBundles, installBundle, removeBundle, setBundleEnabled, profileDir };
