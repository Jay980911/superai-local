// 工具轮对比测试：dev 树（完整 node_modules） vs staged 树（剪枝后）
// 每棵树连跑 3 次工具轮，看是否稳定失败。
const Module = require('module');
const path = require('path');

const origLoad = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { isPackaged: false } };
  return origLoad.apply(this, arguments);
};

const root = path.resolve(__dirname, '..');
const settings = require(path.join(root, 'electron/settings.cjs'));
const dshPatch = require(path.join(root, 'electron/dsh-patch.cjs'));
const dsh = require(path.join(root, 'electron/dsh-client.cjs'));

const stage = path.join(root, 'build', 'dsh-runtime');
const staged = {
  nodeBin: path.join(stage, 'node', process.platform === 'win32' ? 'node.exe' : 'node'),
  dshBin: path.join(stage, 'pkg', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
};
const dev = {};   // 不传覆盖 → require.resolve 用项目根 node_modules

async function toolTurn(label, overrides, sessionId) {
  const model = settings.getCurrentModel();
  const dshHome = path.join(root, 'data', 'dsh-home');
  const patchFile = dshPatch.writePatch(dshHome, settings.load().models);
  const r = await dsh.run({
    model,
    workspace: path.resolve(root, 'workspace'),
    input: '请用 pwsh 工具运行 echo probe-check，并告诉我输出。',
    sessionId,
    dshHome,
    patchFile,
    ...overrides,
    onEvent: () => {},
  });
  const ok = r.steps >= 1 && r.text.includes('probe-check');
  console.log(`[${label}] steps=${r.steps} ok=${ok} text=${JSON.stringify(r.text.slice(0, 80))}`);
  return ok;
}

async function main() {
  console.log('=== staged 树 ×3 ===');
  for (let i = 0; i < 3; i++) await toolTurn(`staged#${i + 1}`, staged, 'probe-staged-' + i);
  console.log('=== dev 树 ×3 ===');
  for (let i = 0; i < 3; i++) await toolTurn(`dev#${i + 1}`, dev, 'probe-dev-' + i);
}

main().catch((err) => { console.error('[probe] FAILED:', err?.message ?? err); process.exitCode = 1; });
