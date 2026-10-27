// 探针：1) 对话耗时拆解（定位"你好"5-6s 花在哪）2) 工作目录切换修复验证
// 手法与 dsh-tool-test 相同：stub electron，真实驱动 dsh runtime。
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');
const origLoad = Module._load;
Module._load = function (req) {
  if (req === 'electron') return { app: { isPackaged: false, getPath: () => os.tmpdir() } };
  return origLoad.apply(this, arguments);
};
const root = 'E:/Demo/person/superai-local';
const settings = require(root + '/electron/settings.cjs');
const dshPatch = require(root + '/electron/dsh-patch.cjs');
const dshClient = require(root + '/electron/dsh-client.cjs');
const { spawn } = require('child_process');

function textOfMessage(message) {
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

async function timedRun({ label, model, workspace, input, sessionId, dshHome, patchFile }) {
  const t0 = Date.now();
  const marks = [];
  const dshSessionId = 'superai-' + sessionId;

  const child = spawn(dshClient.resolveNodeBin(), [dshClient.resolveDshBin(), '--profile', 'sdk', '--patch', patchFile], {
    cwd: workspace,
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      [dshPatch.KEY_ENV]: model.apiKey || '',
      DSH_PERMISSION_MODE: 'danger-full-access',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.on('data', () => {}); // 吞掉 runtime 噪声

  let firstTextAt = 0;
  let idleAt = 0;
  let finalText = '';
  const transport = new dshClient.LineTransport(child, (method, params) => {
    if (method === 'session.event' && params.sessionId === dshSessionId) {
      const ev = params.event || {};
      if (ev.type === 'assistant/message') {
        const t = textOfMessage((ev.data || {}).message);
        if (t) { finalText = t; if (!firstTextAt) firstTextAt = Date.now() - t0; }
      }
      if (ev.type === 'tool/call') marks.push(`tool/call ${(ev.data || {}).name}: +${Date.now() - t0}ms`);
    }
    if (method === 'session.status' && params.sessionId === dshSessionId && params.status === 'idle' && !idleAt) {
      idleAt = Date.now() - t0;
    }
  });

  // RPC 逐项计时
  const origRequest = transport.request.bind(transport);
  transport.request = (method, params, timeoutMs) => {
    const s = Date.now();
    return origRequest(method, params, timeoutMs).then(
      (r) => { marks.push(`${method}: +${Date.now() - s}ms`); return r; },
      (e) => { marks.push(`${method}: FAILED +${Date.now() - s}ms (${e.message})`); throw e; },
    );
  };

  await transport.request('initialize', { cwd: workspace, provider: 'superai-' + model.id, model: model.model }, 60000);
  try { await transport.request('session/resume', { sessionId: dshSessionId }); } catch { /* 首次 */ }
  const setR = await transport.request('session/working-directory/set', { sessionId: dshSessionId, path: workspace })
    .then(() => 'ok', (e) => 'FAIL: ' + e.message);
  await transport.request('session/prompt', { sessionId: dshSessionId, contentBlocks: [{ type: 'text', text: input }] });
  // 等 idle 通知（与 dsh-client 产品代码一致；session/wait 不等回合结束）
  const deadline = Date.now() + 120000;
  while (!idleAt && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const total = Date.now() - t0;

  try { await transport.request('shutdown', undefined, 5000); } catch { /* 已退出 */ }
  try { await transport.dispose(); } catch { /* ignore */ }

  console.log(`\n=== ${label} ===`);
  console.log(`working-directory/set: ${setR}`);
  marks.forEach((m) => console.log('  ' + m));
  console.log(`  总耗时: ${total}ms（首事件 +${firstTextAt}ms，idle +${idleAt}ms）`);
  console.log(`  模型回答: ${JSON.stringify(finalText.slice(0, 120))}`);
  return { total, finalText };
}

async function main() {
  const model = settings.getCurrentModel();
  if (!model) { console.error('未配置模型'); process.exit(1); }
  const dshHome = path.join(settings.appDataDir(), 'dsh-home');
  const patchFile = dshPatch.writePatch(dshHome, settings.load().models);

  // ---- 耗时拆解：全新 session 跑一次"你好"（冷启动全链路）----
  const cold = await timedRun({
    label: '耗时拆解 · 新 session「你好」（冷启动全链路）', model,
    workspace: path.resolve(root, 'workspace'),
    input: '你好',
    sessionId: 'perf-probe-' + Date.now(), dshHome, patchFile,
  });

  // ---- 工作目录验证：两个目录各放同名不同内容文件 ----
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'superai-cwd-'));
  const dirA = path.join(base, 'ws-a');
  const dirB = path.join(base, 'ws-b');
  fs.mkdirSync(dirA); fs.mkdirSync(dirB);
  fs.writeFileSync(path.join(dirA, 'marker.txt'), 'MARKER-IS-A', 'utf-8');
  fs.writeFileSync(path.join(dirB, 'marker.txt'), 'MARKER-IS-B', 'utf-8');

  const sid = 'cwd-probe-' + Date.now();
  await timedRun({
    label: 'cwd 第一轮 · 目录 A（创建 session）', model, workspace: dirA,
    input: '读取 marker.txt 的内容，原样告诉我文件内容，不要加任何解释。',
    sessionId: sid, dshHome, patchFile,
  });
  const r2 = await timedRun({
    label: 'cwd 第二轮 · 同 session 切到目录 B（复现用户场景）', model, workspace: dirB,
    input: '读取 marker.txt 的内容，原样告诉我文件内容，不要加任何解释。',
    sessionId: sid, dshHome, patchFile,
  });

  const ok = r2.finalText.includes('MARKER-IS-B');
  const stale = r2.finalText.includes('MARKER-IS-A');
  console.log(`\n[cwd 判定] ${ok ? 'PASS：读了新目录 B' : stale ? 'FAIL：仍读旧目录 A' : 'INCONCLUSIVE：回答里没有 marker'}`);
  fs.rmSync(base, { recursive: true, force: true });
  void cold;
}
main().catch((e) => { console.error('[probe] FAILED:', e && e.message ? e.message : e); process.exitCode = 1; });
