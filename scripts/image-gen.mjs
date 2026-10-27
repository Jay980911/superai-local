#!/usr/bin/env node
// image-gen.mjs — 调用配置的图像生成模型（OpenAI 兼容 /images/generations）生成图片并存盘。
//
// 由 agent 通过 run_command 调用：
//   node "$SUPERAI_IMAGEGEN" --prompt "..." --out deck/bg.png [--size 1024x1024]
//
// 脚本内部读 SUPERAI_SETTINGS 指向的 settings.json 的 imageModel 配置，
// API Key 不暴露给 agent。成功 stdout 输出图片绝对路径，失败 stderr 报错并 exit 非 0。
//
// 环境变量（main.cjs 注入）：
//   SUPERAI_SETTINGS  settings.json 绝对路径
//   SUPERAI_WORKSPACE 当前会话工作目录（解析 --out 相对路径用；缺省用 process.cwd()）

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--prompt') out.prompt = argv[++i];
    else if (k === '--out') out.out = argv[++i];
    else if (k === '--size') out.size = argv[++i];
    else if (k === '--model') out.model = argv[++i]; // 可选覆盖
    else if (k === '--base-url') out.baseUrl = argv[++i]; // 可选覆盖
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.prompt || !args.out) {
  console.error('用法: node image-gen.mjs --prompt "<提示词>" --out <路径.png> [--size 1024x1024]');
  process.exit(1);
}

const settingsPath = process.env.SUPERAI_SETTINGS;
const workspace = process.env.SUPERAI_WORKSPACE || process.cwd();

if (!settingsPath || !fs.existsSync(settingsPath)) {
  console.error('未找到 settings（SUPERAI_SETTINGS 环境变量未设置或文件不存在）');
  process.exit(2);
}

let imageModel;
try {
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  imageModel = s.imageModel;
} catch (e) {
  console.error('读取 settings 失败：' + e.message);
  process.exit(2);
}

if (!imageModel || !(args.baseUrl || imageModel.baseUrl) || !(args.model || imageModel.model)) {
  console.error('未配置图像生成模型。请在「设置 → 模型配置 → 图像生成模型」填写 baseUrl / apiKey / model。');
  process.exit(3);
}

const baseUrl = (args.baseUrl || imageModel.baseUrl).replace(/\/+$/, '');
const model = args.model || imageModel.model;
const apiKey = imageModel.apiKey || '';
const size = args.size || '1024x1024';

const url = baseUrl + '/images/generations';
const body = { model, prompt: args.prompt, n: 1, size };

let r;
try {
  r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
} catch (e) {
  console.error('网络错误：' + (e.message || e));
  process.exit(4);
}

if (!r.ok) {
  let t = '';
  try { t = await r.text(); } catch {}
  console.error(`生图失败 HTTP ${r.status}${t ? '：' + t.slice(0, 500) : ''}`);
  process.exit(5);
}

let j;
try { j = await r.json(); } catch (e) {
  console.error('解析响应失败：' + e.message);
  process.exit(6);
}

const item = j.data && j.data[0];
if (!item) {
  console.error('响应无 data：' + JSON.stringify(j).slice(0, 500));
  process.exit(7);
}

let buf;
if (item.b64_json) {
  buf = Buffer.from(item.b64_json, 'base64');
} else if (item.url) {
  try {
    const rr = await fetch(item.url);
    if (!rr.ok) throw new Error('HTTP ' + rr.status);
    buf = Buffer.from(await rr.arrayBuffer());
  } catch (e) {
    console.error('下载图片失败：' + e.message);
    process.exit(8);
  }
} else {
  console.error('响应既无 url 也无 b64_json：' + JSON.stringify(item).slice(0, 300));
  process.exit(9);
}

const outPath = path.isAbsolute(args.out) ? args.out : path.join(workspace, args.out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buf);
console.log(outPath);
