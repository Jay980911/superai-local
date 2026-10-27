// scripts/setup-python-runtime.mjs
// 装 superai 管理的隔离 Python 到 python-runtime/（用户机无需装 Python）。
// python.org 在 Fastly CDN，部分环境被墙 → 全程用国内镜像（清华 tuna）：
//   - embeddable: mirrors.tuna.tsinghua.edu.cn/python/
//   - pip wheel 自举（免 get-pip，bootstrap.pypa.io 也在 Fastly）
//   - 依赖包: pypi.tuna.tsinghua.edu.cn/simple
// 幂等：已装且依赖齐全则跳过。用法: node scripts/setup-python-runtime.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RT = path.join(ROOT, 'python-runtime');
const PYVER = '3.12.8';
const PTHNAME = `python${PYVER.split('.')[0]}${PYVER.split('.')[1]}._pth`; // python312._pth
const ZIP_URL = `https://mirrors.tuna.tsinghua.edu.cn/python/${PYVER}/python-${PYVER}-embed-amd64.zip`;
const PYEXE = process.platform === 'win32' ? 'python.exe' : 'python3';
const PY = path.join(RT, PYEXE);
const SP = path.join(RT, 'Lib', 'site-packages');
const INDEX = 'https://pypi.tuna.tsinghua.edu.cn/simple';
const DEPS = ['python-pptx', 'Pillow', 'lxml', 'XlsxWriter'];

function log(...a) { console.log('[py-runtime]', ...a); }
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
  if (r.status !== 0) {
    log('CMD FAILED', cmd, args.join(' '));
    log('stdout:', (r.stdout || '').slice(0, 1000));
    log('stderr:', (r.stderr || '').slice(0, 1000));
    throw new Error('command failed: ' + cmd);
  }
  return r;
}
async function download(url, dest) {
  log('downloading', url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('download failed: ' + res.status + ' ' + url);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  log('  saved', path.basename(dest), (buf.length / 1024).toFixed(0) + 'KB');
}

// 取某包最新纯 python wheel 的完整 URL（用于自举 pip）。
function cmpVer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
async function latestPureWheelUrl(pkg) {
  const html = await (await fetch(`${INDEX}/${pkg}/`)).text();
  const re = /href="(\.\.\/\.\.\/packages\/[^"]+\/([^"]+))"/g;
  let m, best = null, bestVer = '';
  while ((m = re.exec(html))) {
    const fname = m[2].split('#')[0];
    const vm = fname.match(new RegExp(`${pkg.replace(/-/g,'_')}-(\\d[\\d.]*)-py3-none-any\\.whl$`, 'i'));
    if (vm && cmpVer(vm[1], bestVer) > 0) { bestVer = vm[1]; best = m[1]; }
  }
  if (!best) throw new Error('未找到 ' + pkg + ' 的 py3-none-any wheel');
  return 'https://pypi.tuna.tsinghua.edu.cn/' + best.replace(/^\.\.\/\.\.\//, '');
}

(async () => {
  fs.mkdirSync(RT, { recursive: true });

  // 已装且依赖齐全 → 跳过
  if (fs.existsSync(PY)) {
    try {
      const chk = spawnSync(PY, ['-c', 'import pptx,PIL,lxml,xlsxwriter; print("OK")'], { encoding: 'utf8' });
      if (chk.status === 0 && chk.stdout.trim() === 'OK') { log('已存在且依赖齐全，跳过:', PY); return; }
    } catch {}
  }

  // 1) 下载 embeddable
  const zipPath = path.join(RT, '_pyembed.zip');
  await download(ZIP_URL, zipPath);
  // 2) 解压（PowerShell Expand-Archive）
  log('extracting embeddable...');
  run('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${RT}' -Force`]);
  fs.unlinkSync(zipPath);
  // 3) 启用 site-packages
  const pth = path.join(RT, PTHNAME);
  if (fs.existsSync(pth)) {
    let s = fs.readFileSync(pth, 'utf-8');
    if (!/^import\s+site/m.test(s)) s = s.replace(/^#\s*import site/m, 'import site');
    if (!/^import\s+site/m.test(s)) s += '\nimport site\n';
    fs.writeFileSync(pth, s, 'utf-8');
    log('patched', PTHNAME);
  } else { log('WARN _pth not found:', fs.readdirSync(RT)); }
  fs.mkdirSync(SP, { recursive: true });

  // 4) pip 自举：下最新 pip wheel，解压进 site-packages（wheel 就是 zip）
  log('bootstrapping pip (wheel self-extract)...');
  const pipUrl = await latestPureWheelUrl('pip');
  const pipWhl = path.join(RT, 'Lib', '_pip.whl');
  const pipZip = path.join(RT, 'Lib', '_pip.zip'); // Expand-Archive 只认 .zip，wheel 本质是 zip，改名
  await download(pipUrl, pipWhl);
  fs.copyFileSync(pipWhl, pipZip);
  fs.unlinkSync(pipWhl);
  run('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${pipZip}' -DestinationPath '${SP}' -Force`]);
  fs.unlinkSync(pipZip);

  // 5) 装依赖（走 tuna 索引）
  log('installing deps:', DEPS.join(' '));
  run(PY, ['-m', 'pip', 'install', '--no-warn-script-location',
    '-i', INDEX, '--trusted-host', 'pypi.tuna.tsinghua.edu.cn', ...DEPS], { cwd: RT });

  // 6) 校验
  const chk = spawnSync(PY, ['-c', 'import pptx,PIL,lxml,xlsxwriter; print("OK", pptx.__version__)'], { encoding: 'utf8' });
  log('verify:', (chk.stdout || '').trim(), 'status=', chk.status);
  if (chk.status !== 0) { log('VERIFY FAILED:', (chk.stderr || '').slice(0, 800)); process.exit(1); }
  log('DONE. python:', PY);
})().catch(e => { console.error('[py-runtime] FATAL:', e.message); process.exit(1); });
