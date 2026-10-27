// python-runtime.cjs — superai 管理的隔离 Python 解析
// 优先级：
//   1. 打包态 resources/python-runtime/python.exe（由 setup-python-runtime.mjs 预装、随包分发）
//   2. dev 态 项目根 python-runtime/python.exe（开发机跑过安装脚本才有）
//   3. 环境变量 SUPERAI_PYTHON 显式指定
//   4. PATH 里的 python（开发机 anaconda 等，已装 python-pptx 时直接可用）
// 用户机无需装 Python：只要 1 在（随 app 分发），就用隔离版；开发机走 4 兜底。
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let _cached = null;

function exists(p) {
  try { return p && fs.existsSync(p); } catch { return false; }
}

function resolvePythonBin() {
  if (_cached !== null) return _cached;

  const exe = process.platform === 'win32' ? 'python.exe' : 'python3';

  // 1) 打包态 resources
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'python-runtime', exe);
    if (exists(p)) { _cached = p; return p; }
  }
  // 2) dev 态项目根 python-runtime
  {
    const p = path.join(__dirname, '..', 'python-runtime', exe);
    if (exists(p)) { _cached = p; return p; }
  }
  // 3) 环境变量
  if (process.env.SUPERAI_PYTHON && exists(process.env.SUPERAI_PYTHON)) {
    _cached = process.env.SUPERAI_PYTHON; return _cached;
  }
  // 4) PATH 里的 python（开发机 anaconda 等）
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const c = path.join(dir.trim(), exe);
    try { if (fs.statSync(c).isFile()) { _cached = c; return c; } } catch {}
  }
  // 4b) 常见 anaconda 安装位兜底（PATH 没挂时）
  for (const drive of ['C', 'D', 'E', 'F']) {
    for (const sub of ['\\anaconda\\python.exe', '\\ProgramData\\anaconda3\\python.exe', '\\Python\\python.exe']) {
      const c = drive + ':' + sub;
      if (exists(c)) { _cached = c; return c; }
    }
  }
  _cached = exe; // 最后回退（让调用方报可读错）
  return _cached;
}

// 校验该 python 能 import pptx（决定 pptx 预览/生成是否可用）
function hasPptxSupport() {
  const bin = resolvePythonBin();
  try {
    const { spawnSync } = require('child_process');
    const r = spawnSync(bin, ['-c', 'import pptx,PIL,lxml,xlsxwriter'], { encoding: 'utf8', timeout: 8000 });
    return r.status === 0;
  } catch { return false; }
}

module.exports = { resolvePythonBin, hasPptxSupport };
