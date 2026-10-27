// dsh 工具调用 + 多轮 session 复用验证（stub electron，真实驱动 runtime）
const Module = require('module');
const path = require('path');
const origLoad = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { isPackaged: false } };
  return origLoad.apply(this, arguments);
};
const root = 'E:/Demo/person/superai-local';
const settings = require(root + '/electron/settings.cjs');
const dshPatch = require(root + '/electron/dsh-patch.cjs');
const dsh = require(root + '/electron/dsh-client.cjs');

async function main() {
  const model = settings.getCurrentModel();
  const dshHome = path.join(settings.appDataDir(), 'dsh-home');
  const patchFile = dshPatch.writePatch(dshHome, settings.load().models);
  const ws = path.resolve(root, 'workspace');
  const sid = 'test-multi-turn-' + Date.now();

  // 第一轮：触发工具调用
  console.log('=== 第一轮（工具调用）===');
  const r1 = await dsh.run({
    model, workspace: ws, input: '请用 pwsh 工具运行 echo hello-from-dsh，并告诉我输出。',
    sessionId: sid, dshHome, patchFile,
    onEvent: (e) => {
      if (e.type === 'text') process.stdout.write(e.text);
      else console.log('[event]', JSON.stringify(e).slice(0, 160));
    },
  });
  console.log('\n[round1] steps =', r1.steps);

  // 第二轮：同 sessionId，验证 dsh 自行记住上下文
  console.log('\n=== 第二轮（同 session，考上下文记忆）===');
  const r2 = await dsh.run({
    model, workspace: ws, input: '我刚才让你运行的命令输出是什么？请直接回答。',
    sessionId: sid, dshHome, patchFile,
    onEvent: (e) => {
      if (e.type === 'text') process.stdout.write(e.text);
      else console.log('[event]', JSON.stringify(e).slice(0, 160));
    },
  });
  console.log('\n[round2] text =', r2.text.slice(0, 150));
  console.log(r1.steps > 0 && r2.text.includes('hello-from-dsh') ? '[test] PASS' : '[test] CHECK');
}
main().catch((e) => { console.error('[test] FAILED:', e && e.message ? e.message : e); process.exitCode = 1; });
