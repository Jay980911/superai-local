// dsh-staged-test.cjs — 验证打包树（build/dsh-runtime）端到端可用
// 模拟安装后环境：bundled node + bundled dsh 闭包（已剪枝），跑文本 + 工具两轮。
// 运行：node scripts/dsh-staged-test.cjs
const Module = require('module');
const os = require('os');
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
const nodeBin = path.join(stage, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
const dshBin = path.join(stage, 'pkg', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');

for (const [label, p] of [['bundled node', nodeBin], ['bundled dsh', dshBin]]) {
  if (!require('fs').existsSync(p)) {
    console.error(`[staged-test] ${label} 不存在: ${p}（先跑 npm run stage:dsh）`);
    process.exit(1);
  }
}

async function turn(label, input, sessionId) {
  console.log(`\n=== ${label} ===`);
  const model = settings.getCurrentModel();
  // 测试 home 放系统临时目录，避免污染 build/dsh-runtime（会被 extraResources 打包）
  const dshHome = path.join(os.tmpdir(), 'superai-dsh-staged-test-home');
  const patchFile = dshPatch.writePatch(dshHome, settings.load().models);
  const result = await dsh.run({
    model,
    workspace: path.resolve(root, 'workspace'),
    input,
    sessionId,
    dshHome,
    patchFile,
    nodeBin,
    dshBin,
    onEvent: (e) => {
      if (e.type === 'text') process.stdout.write(e.delta);
      else console.log('[event]', JSON.stringify(e).slice(0, 160));
    },
  });
  console.log(`\n[${label}] steps =`, result.steps);
  return result;
}

async function main() {
  console.log('[staged-test] bundled node =', nodeBin);
  console.log('[staged-test] bundled dsh  =', dshBin);

  const r1 = await turn('文本轮', '你好，请用一句中文介绍你自己，不要使用任何工具。');
  if (!r1.text) throw new Error('文本轮无输出');

  // 工具轮：偶发出现模型不调工具直接回复，加重试（最多 2 次）
  let r2 = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    r2 = await turn(`工具轮（第 ${attempt} 次）`, '这是必须使用工具的测试：请务必调用 pwsh 工具运行 echo staged-ok，然后把输出原样告诉我。不要自己编造输出。', 'staged-test-session');
    if (r2.steps >= 1 && r2.text.includes('staged-ok')) break;
  }
  if (!r2 || r2.steps < 1) throw new Error('工具轮没有触发工具调用');
  if (!r2.text.includes('staged-ok')) throw new Error('工具轮输出未包含 staged-ok');

  console.log('\n[staged-test] PASS — 打包树端到端可用');
}

main().catch((err) => {
  console.error('[staged-test] FAILED:', err?.message ?? err);
  process.exitCode = 1;
});
