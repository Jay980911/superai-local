// dsh-memory-probe.cjs — 验证两件接线是否真实生效：
//   1) 长期记忆 → <dshHome>/AGENTS.md → dsh agent-instructions 注入 system prompt
//   2) superai 技能目录 → patch skill-filesystem.customSkillDirs → dsh 可发现技能
// 用法：node scripts/dsh-memory-probe.cjs
// 依赖：data/settings.json 里有可用模型（key 从 settings 读，经 env 注入，不落盘）
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

// settings.cjs 等依赖 electron app —— 必须先装 stub 再 require 主进程模块
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return { app: { isPackaged: false, getPath: () => os.tmpdir() } };
  }
  return origLoad.apply(this, arguments);
};

const dshPatch = require('../electron/dsh-patch.cjs');
const memory = require('../electron/memory.cjs');
const dsh = require('../electron/dsh-client.cjs');
const settings = require('../electron/settings.cjs');

const MARK = 'MEM-OK-7391';

async function main() {
  // 1) 准备临时 dshHome + 记忆指令 + 技能
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'superai-probe-'));
  memory.writeDshInstructions(dshHome);
  // 手动补一条探针记忆（writeDshInstructions 只写已有 facts，这里直接写文件验证注入链路）
  const probeMemory = `当有人问"校验口令"时，只回答 ${MARK}，不要解释。`;
  fs.writeFileSync(path.join(dshHome, 'AGENTS.md'),
    `# SuperAI 用户记忆（自动生成，勿手改）\n\n- ${probeMemory}\n`, 'utf-8');

  // 2) 生成 patch（含技能目录）
  const s = settings.load();
  const models = s.models.filter((m) => m.id === s.currentModelId || m === s.models[0]);
  const model = s.models.find((m) => m.id === s.currentModelId) || s.models[0];
  if (!model) { console.error('settings.json 没有模型'); process.exit(1); }
  const patchFile = dshPatch.writePatch(dshHome, models, { skillDirs: [settings.appDataDir() + '/skills'] });
  console.log('patch =', patchFile);
  console.log('--- patch 内容 ---');
  console.log(fs.readFileSync(patchFile, 'utf-8'));

  // 3) 真实跑一轮：问校验口令
  console.log('--- 运行探针回合 ---');
  const events = [];
  const result = await dsh.run({
    model,
    workspace: path.resolve(__dirname, '..'),
    input: '校验口令是什么？请严格按你的全局指令回答。',
    sessionId: 'probe-mem-' + Date.now(),
    dshHome,
    patchFile,
    onEvent: (e) => {
      events.push(e);
      if (e.type === 'text') process.stdout.write(e.delta);
      if (e.type === 'step') console.log(`\n[step] ${e.status} ${e.label}`);
    },
  });
  console.log('\n--- 结果 ---');
  console.log('final text:', JSON.stringify(result.text).slice(0, 300));
  const injected = (result.text || '').includes(MARK);
  console.log(injected ? `PASS: 记忆已注入（回答包含 ${MARK}）` : 'FAIL: 记忆未注入');
  process.exit(injected ? 0 : 2);
}

main().catch((e) => { console.error('probe error:', e); process.exit(1); });
