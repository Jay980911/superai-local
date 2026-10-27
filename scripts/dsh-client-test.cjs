// dsh-client 集成测试（stub electron，真实驱动 dsh runtime）
// 验证：patch 生成 → spawn → initialize → prompt → 事件翻译 → idle → shutdown
// 运行：
//   $env:SUPERAI_MODEL_API_KEY="sk-xxx"; node scripts/dsh-client-test.cjs
const Module = require('module');
const path = require('path');

// ---- stub electron（settings.cjs 只用到 app.isPackaged）----
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'electron') return { app: { isPackaged: false } };
  return origLoad.apply(this, arguments);
};

const root = path.resolve(__dirname, '..');
const settings = require(path.join(root, 'electron/settings.cjs'));
const dshPatch = require(path.join(root, 'electron/dsh-patch.cjs'));
const dsh = require(path.join(root, 'electron/dsh-client.cjs'));

async function main() {
  const model = settings.getCurrentModel();
  if (!model) {
    console.error('[test] 未配置模型：请先 data/settings.json 里添加并选中模型');
    process.exitCode = 1;
    return;
  }
  console.log('[test] model =', model.name, '|', model.api, '|', model.baseUrl, '|', model.model);

  const dshHome = path.join(settings.appDataDir(), 'dsh-home');
  const patchFile = dshPatch.writePatch(dshHome, settings.load().models);
  console.log('[test] dshHome  =', dshHome);
  console.log('[test] patch    =', patchFile);
  console.log('[test] nodeBin  =', dsh.resolveNodeBin());
  console.log('[test] dshBin   =', dsh.resolveDshBin());

  const events = [];
  const result = await dsh.run({
    model,
    workspace: path.resolve(__dirname, '..', 'workspace'),
    input: '你好，请用一句中文介绍你自己，不要使用任何工具。',
    dshHome,
    patchFile,
    onEvent: (e) => {
      events.push(e);
      if (e.type === 'text') process.stdout.write(e.delta);
      else console.log('\n[event]', JSON.stringify(e).slice(0, 200));
    },
  });

  console.log('\n\n[test] ===== 结果 =====');
  console.log('[test] steps =', result.steps);
  console.log('[test] text  =', result.text.slice(0, 200));
  const counts = events.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] ?? 0) + 1 }), {});
  console.log('[test] event counts =', JSON.stringify(counts));
  if (!result.text) {
    console.error('[test] FAILED: 没有收到文本');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[test] FAILED:', err?.message ?? err);
  process.exitCode = 1;
});
