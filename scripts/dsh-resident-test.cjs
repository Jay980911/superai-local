// 常驻 runtime 验证：同进程连跑两轮，第二轮应零 initialize 成本。
const Module = require('module');
const path = require('path');
const os = require('os');
const origLoad = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { isPackaged: false, getPath: () => os.tmpdir() } };
  return origLoad.apply(this, arguments);
};
const root = 'E:/Demo/person/superai-local';
const settings = require(root + '/electron/settings.cjs');
const dshPatch = require(root + '/electron/dsh-patch.cjs');
const dsh = require(root + '/electron/dsh-client.cjs');

async function timed(label, input, sessionId) {
  const model = settings.getCurrentModel();
  const dshHome = path.join(settings.appDataDir(), 'dsh-home');
  const patchFile = dshPatch.writePatch(dshHome, settings.load().models);
  const t0 = Date.now();
  const r = await dsh.run({
    model, workspace: path.resolve(root, 'workspace'), input,
    sessionId, dshHome, patchFile,
    onEvent: (e) => {
      if (e.type === 'text' && !timed._first) { timed._first = Date.now() - t0; console.log(`  [${label}] 首文本 +${timed._first}ms`); }
    },
  });
  console.log(`[${label}] 总耗时 ${Date.now() - t0}ms，steps=${r.steps}，回答 ${JSON.stringify(r.text.slice(0, 60))}`);
}

async function main() {
  const sid = 'resident-test-' + Date.now();
  await timed('第一轮（冷启动，付 initialize）', '你好，请只回答「收到」两个字。', sid);
  await timed('第二轮（常驻复用）', '请只回答「再见」两个字。', sid);
  await timed('第三轮（新 session）', '请只回答「新会话」三个字。', 'resident-test-2-' + Date.now());
  console.log(timed._first ? '' : '[warn] 未捕获首文本事件');
}
main().catch((e) => { console.error('[test] FAILED:', e && e.message ? e.message : e); process.exitCode = 1; });
