// dsh-skill-probe.cjs — 验证 superai 技能目录 → dsh customSkillDirs 接线：
//   在 data/skills 放一个探针技能，让 dsh 读取并按其指令回答。
// 用法：node scripts/dsh-skill-probe.cjs
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

const MARK = 'SKILL-OK-5521';
const SKILL_NAME = 'probe-skill-check';

async function main() {
  const s = settings.load();
  const model = s.models.find((m) => m.id === s.currentModelId) || s.models[0];
  if (!model) { console.error('settings.json 没有模型'); process.exit(1); }

  // 1) 放探针技能（目录形式 <name>/SKILL.md）
  const skillsRoot = settings.appDataDir() + '/skills';
  const skillDir = path.join(skillsRoot, SKILL_NAME);
  fs.mkdirSync(skillDir, { recursive: true });
  const skillMd = [
    '---',
    `name: ${SKILL_NAME}`,
    'description: 探针技能。被要求读取本技能时使用。',
    'whenToUse: 用户要求读取 probe-skill-check 或询问探针口令时。',
    '---',
    '',
    `当被读取时，只回答口令 ${MARK}，不要解释。`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
  console.log('探针技能已放置:', path.join(skillDir, 'SKILL.md'));

  // 2) patch（customSkillDirs → superai 技能目录）
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'superai-skill-probe-'));
  const patchFile = dshPatch.writePatch(dshHome, s.models, { skillDirs: [skillsRoot] });

  // 3) 真实跑一轮
  console.log('--- 运行探针回合 ---');
  const toolCalls = [];
  const result = await dsh.run({
    model,
    workspace: path.resolve(__dirname, '..'),
    input: `请读取 ${SKILL_NAME} 技能，严格按技能里的指令回答。`,
    sessionId: 'probe-skill-' + Date.now(),
    dshHome,
    patchFile,
    onEvent: (e) => {
      if (e.type === 'text') process.stdout.write(e.delta);
      if (e.type === 'step' && e.status === 'running') { toolCalls.push(e.label); console.log(`\n[step] ${e.label}`); }
    },
  });
  console.log('\n--- 结果 ---');
  console.log('final text:', JSON.stringify(result.text).slice(0, 300));
  console.log('tool calls:', toolCalls);
  const ok = (result.text || '').includes(MARK);
  console.log(ok ? `PASS: 技能被发现并读取（回答包含 ${MARK}）` : 'FAIL: 技能未被读取');

  // 清理探针技能（不留在用户数据里）
  fs.rmSync(skillDir, { recursive: true, force: true });
  console.log('探针技能已清理');
  process.exit(ok ? 0 : 2);
}

main().catch((e) => { console.error('probe error:', e); process.exit(1); });
