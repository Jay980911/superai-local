// dsh-cancel-probe.cjs — 验证「停止」链路：
//   起一个会长跑的回合，中途 dsh.cancel(sessionId)，期望：
//   1) 收到 cancelled 事件；2) run() 抛 RunCancelledError；3) runtime 进程真的退出。
// 用法：node scripts/dsh-cancel-probe.cjs
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return { app: { isPackaged: false, getPath: () => os.tmpdir() } };
  }
  return origLoad.apply(this, arguments);
};

const dshPatch = require('../electron/dsh-patch.cjs');
const dsh = require('../electron/dsh-client.cjs');
const settings = require('../electron/settings.cjs');

async function main() {
  const s = settings.load();
  const model = s.models.find((m) => m.id === s.currentModelId) || s.models[0];
  if (!model) { console.error('settings.json 没有模型'); process.exit(1); }

  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'superai-cancel-probe-'));
  const patchFile = dshPatch.writePatch(dshHome, s.models, {});
  const sessionId = 'probe-cancel-' + Date.now();

  let cancelled = false;
  const done = dsh.run({
    model,
    workspace: path.resolve(__dirname, '..'),
    input: '请用 write 工具把 1 到 200 的每个数字单独写成一个文件（数字.txt），一个一个慢慢写，写完为止。',
    sessionId,
    dshHome,
    patchFile,
    onEvent: (e) => {
      if (e.type === 'cancelled') { cancelled = true; console.log('[event] cancelled 收到'); }
      if (e.type === 'step' && e.status === 'running') console.log(`[step] ${e.label}`);
      if (e.type === 'text') process.stdout.write('.');
    },
  }).then(
    (r) => ({ ok: true, r }),
    (e) => ({ ok: false, e }),
  );

  // 4 秒后取消（此时应在写文件中）
  await new Promise((res) => setTimeout(res, 4000));
  const t0 = Date.now();
  const hit = dsh.cancel(sessionId);
  console.log(`\ncancel() 命中活动运行: ${hit}`);

  const outcome = await done;
  const dt = Date.now() - t0;
  console.log('run 结局:', outcome.ok ? 'resolve' : `reject: ${outcome.e?.name}: ${outcome.e?.message}`);
  console.log(`取消到退出耗时: ${dt}ms`);
  const pass = hit && !outcome.ok && outcome.e?.name === 'RunCancelledError' && cancelled;
  console.log(pass ? 'PASS: 停止链路正常' : 'FAIL: 停止链路异常');
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error('probe error:', e); process.exit(1); });
