// memory-roundtrip-test.cjs — 记忆模块存取回环测试（stub electron，用临时 appData）
// 验证：save → list → search → delete → clear → writeDshInstructions（注入/清理）
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'superai-mem-test-'));
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return { app: { isPackaged: false, getPath: () => tmpAppData } };
  }
  return origLoad.apply(this, arguments);
};

const memory = require('../electron/memory.cjs');
const settings = require('../electron/settings.cjs');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

// 隔离：settings 的 appDataDir 在非 packaged 态指向项目 data/，会污染真实数据。
// 直接操作 memory 模块前，把 profile 指向临时目录太 hack——改为备份/恢复真实文件。
const realProfile = path.join(settings.appDataDir(), 'memory', 'profile.md');
const backup = fs.existsSync(realProfile) ? fs.readFileSync(realProfile, 'utf-8') : null;

try {
  // 1) 初始应为空（假设用户没有记忆；有则记录原数量）
  const before = memory.listFacts().length;
  console.log(`（当前已有 ${before} 条记忆，测试在此基础上进行）`);

  // 2) 保存两条（一条带标签，一条中文标签）
  memory.saveMemory('偏好 TypeScript 与 React', ['lang', '前端']);
  memory.saveMemory('部署在 Windows 11', ['环境']);
  check('save 后 list 数量 +2', memory.listFacts().length === before + 2);

  // 3) 搜索
  const r1 = memory.searchMemory('TypeScript');
  check('搜索 TypeScript 命中', r1.results.length === 1 && r1.results[0].content.includes('TypeScript'));
  const r2 = memory.searchMemory('不存在的东西xyz');
  check('搜索无结果返回空', r2.results.length === 0);

  // 4) getMemoryText 注入文本
  const text = memory.getMemoryText();
  check('getMemoryText 包含两条', text.includes('TypeScript') && text.includes('Windows'));

  // 5) delete 单条
  const target = memory.listFacts().find((f) => f.content.includes('Windows'));
  const del = memory.deleteFact(target.id);
  check('delete 返回 ok', del.ok === true && del.count === before + 1);
  check('delete 后搜索不到', memory.searchMemory('Windows').results.length === 0);
  check('delete 不存在的 id 返回 ok:false', memory.deleteFact('nope').ok === false);

  // 6) writeDshInstructions → AGENTS.md
  const dshHome = fs.mkdtempSync(path.join(os.tmpdir(), 'superai-mem-instr-'));
  const w1 = memory.writeDshInstructions(dshHome);
  const agentsMd = path.join(dshHome, 'AGENTS.md');
  check('有记忆时写出 AGENTS.md', fs.existsSync(agentsMd));
  check('AGENTS.md 含记忆内容', fs.readFileSync(agentsMd, 'utf-8').includes('TypeScript'));

  // 7) clear → writeDshInstructions 应删除旧文件（防止过期注入）
  memory.clearAll();
  check('clear 后 list 为空', memory.listFacts().length === 0);
  memory.writeDshInstructions(dshHome);
  check('无记忆时删除 AGENTS.md', !fs.existsSync(agentsMd));

  // 8) profile.md 双写完整性：RAW_JSON 与正文一致
  memory.saveMemory('回环验证条目', ['test']);
  const raw = fs.readFileSync(realProfile, 'utf-8');
  const m = raw.match(/<!-- RAW_JSON_START\n([\s\S]*?)\nRAW_JSON_END -->/);
  check('profile.md 含 RAW_JSON', !!m);
  check('RAW_JSON 可解析且含条目', m && JSON.parse(m[1]).facts.some((f) => f.content === '回环验证条目'));

  console.log(`\n结果: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
} finally {
  // 恢复真实记忆文件
  if (backup === null) {
    try { fs.unlinkSync(realProfile); } catch {}
  } else {
    fs.writeFileSync(realProfile, backup, 'utf-8');
  }
  console.log('（已恢复原始 profile.md）');
}
