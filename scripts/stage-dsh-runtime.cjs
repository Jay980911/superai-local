// stage-dsh-runtime.cjs — 为 electron-builder 打包预备 dsh runtime
//
// 产出 build/dsh-runtime/：
//   node/    独立 Node 运行时（node.exe，Electron 主进程的 execPath 不能用）
//   pkg/     dsh 生产依赖闭包（npm install --omit=dev，零 native addon，纯 JS）
//
// 该目录经 package.json 的 build.extraResources 随安装包分发，
// 运行时位于 <install>/resources/dsh-runtime/。
//
// Node 来源优先级：
//   1. SUPERAI_NODE_EXE 环境变量显式指定
//   2. PATH 里的 node（CI 的 setup-node / 本机已装 node）
//   3. 下载 nodejs.org 官方 zip（兜底，保证可复现）
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const root = path.resolve(__dirname, '..');
const stageDir = path.join(root, 'build', 'dsh-runtime');
const pkgDir = path.join(stageDir, 'pkg');

/** 从项目 devDependencies 读 dsh 版本（单一来源，避免两处漂移） */
function dshVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
  const spec = pkg.devDependencies && pkg.devDependencies['@deepseek-ai/dsh'];
  if (!spec) throw new Error('package.json devDependencies 缺少 @deepseek-ai/dsh');
  return spec.replace(/^[\^~]/, '');
}

function log(...args) { console.log('[stage]', ...args); }

// ---------------------------------------------------------------------------
// Node 运行时
// ---------------------------------------------------------------------------

function findOnPath(exe) {
  const dirs = String(process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir.trim(), exe);
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch { /* 不在这个目录 */ }
  }
  return null;
}

/** 下载并解压 Node 发行 zip（tar：Windows 10 1803+ / Linux / macOS 均可用） */
async function downloadNode() {
  const version = process.env.SUPERAI_NODE_VERSION || await latestNode22();
  const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  const name = `node-${version}-${platform}-${arch}`;
  const url = `https://nodejs.org/dist/${version}/${name}.zip`;
  const zip = path.join(os.tmpdir(), `${name}.zip`);

  log(`下载 Node ${version} (${platform}-${arch})…`);
  await downloadFile(url, zip);
  log('解压…');
  execFileSync('tar', ['-xf', zip, '-C', os.tmpdir()], { stdio: 'inherit' });

  const extracted = path.join(os.tmpdir(), name);
  const nodeExe = path.join(extracted, process.platform === 'win32' ? 'node.exe' : 'bin/node');
  if (!fs.existsSync(nodeExe)) throw new Error(`解压后未找到 node 可执行文件: ${nodeExe}`);
  return nodeExe;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u, hops) => {
      if (hops > 5) return reject(new Error(`重定向过多: ${url}`));
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return follow(new URL(res.headers.location, u).href, hops + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`下载失败 ${res.statusCode}: ${u}`));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    follow(url, 0);
  });
}

/** 从 nodejs.org/dist/index.json 取最新 v22 LTS 版本号 */
async function latestNode22() {
  const json = await new Promise((resolve, reject) => {
    https.get('https://nodejs.org/dist/index.json', (res) => {
      if (res.statusCode !== 200) return reject(new Error(`index.json ${res.statusCode}`));
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  const v22 = json
    .filter((r) => /^v22\./.test(r.version))
    .map((r) => r.version)
    .sort((a, b) => cmpSemver(a, b));
  if (v22.length === 0) throw new Error('未在 index.json 找到 v22 版本');
  return v22[v22.length - 1];
}

function cmpSemver(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

async function stageNode() {
  const nodeDir = path.join(stageDir, 'node');
  const target = path.join(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node');

  // 已 stage 过且可用则跳过（支持重复构建）
  if (fs.existsSync(target)) {
    log('node 已存在，跳过:', target);
    return;
  }

  let src = process.env.SUPERAI_NODE_EXE || findOnPath(process.platform === 'win32' ? 'node.exe' : 'node');
  if (src && fs.existsSync(src)) {
    log('使用 node:', src);
  } else {
    src = await downloadNode();
    log('已下载 node:', src);
  }
  fs.mkdirSync(nodeDir, { recursive: true });
  fs.copyFileSync(src, target);
  if (process.platform !== 'win32') fs.chmodSync(target, 0o755);

  const version = execFileSync(target, ['--version'], { encoding: 'utf-8' }).trim();
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  if (major < 22) {
    throw new Error(`Node 版本过低: ${version}（dsh runtime 需要 22+；可设 SUPERAI_NODE_EXE 指定）`);
  }
  log('staged node', version);
}

// ---------------------------------------------------------------------------
// dsh 依赖闭包
// ---------------------------------------------------------------------------

function npmCommand() {
  // 1. 经 npm script 调用：node <npm-cli.js>
  if (process.env.npm_execpath) {
    return { cmd: process.execPath, args: [process.env.npm_execpath] };
  }
  // 2. node 安装目录下的 npm-cli.js（官方发行版布局：node.exe 旁 node_modules/npm）
  const sibling = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(sibling)) {
    return { cmd: process.execPath, args: [sibling] };
  }
  // 3. PATH 里的 npm
  const found = findOnPath(process.platform === 'win32' ? 'npm.cmd' : 'npm');
  if (found) return { cmd: found, args: [], shell: true };
  return { cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: [], shell: true };
}

function stageDsh() {
  const version = dshVersion();
  const marker = path.join(pkgDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
  if (fs.existsSync(marker)) {
    const installed = JSON.parse(fs.readFileSync(marker, 'utf-8')).version;
    if (installed !== version) {
      log(`dsh 版本变化 (${installed} → ${version})，npm 将就地协调`);
    }
  }
  const { cmd, args, shell } = npmCommand();
  log(`安装/协调 dsh@${version} 生产闭包 →`, pkgDir);
  // --omit=optional：不装平台二进制（libreoffice-kit-win32-x64 184M /
  // sherpa-onnx-win-x64 23M / sharp-win32-x64 28M…）。这些均为
  // optionalDependencies，父包仍在、懒加载，缺失只影响对应功能
  // （Office 转 PDF / 语音转写 / 图片处理），不影响 agent 主链路。
  // npm 就地协调即可移除已装的 optional 包（树最新时数秒完成）。
  execFileSync(cmd, [
    ...args, 'install', '--omit=dev', '--omit=optional', '--no-package-lock',
    '--no-audit', '--no-fund', '--loglevel=error',
    '--prefix', pkgDir,
    `@deepseek-ai/dsh@${version}`,
  ], { stdio: 'inherit', shell });
  if (!fs.existsSync(path.join(pkgDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) {
    throw new Error('dsh 安装后未找到 lib/bin.js');
  }
  warnLeftovers(pkgDir);
  log('dsh 闭包就绪');
}

/**
 * npm 删除 optional 平台包时可能在 node_modules 留下 `.` 前缀的原子替换暂存
 * 目录（体积可达数百 MB）。CI 全新安装（--omit=optional）不会产生；本地在已有
 * 树上协调版本时才可能出现。此处仅告警——自动递归删除会被安全策略拦截，
 * 按提示手动清理即可（纯构建垃圾，删了不影响运行）。
 */
function warnLeftovers(dir) {
  const nm = path.join(dir, 'node_modules');
  if (!fs.existsSync(nm)) return;
  const roots = [nm, ...fs.readdirSync(nm)
    .filter((d) => d.startsWith('@'))
    .map((d) => path.join(nm, d))];
  const leftovers = [];
  for (const r of roots) {
    let entries;
    try { entries = fs.readdirSync(r, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      // .bin 是 npm 标准可执行文件目录，不是暂存残留
      if (e.isDirectory() && e.name.startsWith('.') && e.name !== '.bin') {
        leftovers.push(path.join(r, e.name));
      }
    }
  }
  if (leftovers.length > 0) {
    console.warn('[stage] ⚠ 发现 npm 暂存残留（可手动删除，不影响运行）:');
    for (const l of leftovers) console.warn('  -', l);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  await stageNode();
  stageDsh();
  log('完成 →', stageDir);
}

main().catch((err) => {
  console.error('[stage] FAILED:', err?.message ?? err);
  process.exitCode = 1;
});
