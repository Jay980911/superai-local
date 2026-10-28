#!/usr/bin/env node
// image-gen.mjs — 通用图片生成（三种方式，可级联）
//
//   1. 大模型  POST {baseUrl}/images/generations（OpenAI 兼容，读 SUPERAI_SETTINGS 的 imageModel）
//   2. 图库    Unsplash 关键词搜图（需环境变量 UNSPLASH_ACCESS_KEY）
//   3. 纹理    纯 Node 生成渐变+噪点底图（零依赖兜底，永远可用）
//
// --mode auto(默认, 图库→纹理→大模型 级联，大模型殿后省钱) | model | stock | texture
// 由 agent 通过 run_command 调用：
//   node "$SUPERAI_IMAGEGEN" --prompt "..." --out deck/bg.png [--size 1024x1024] [--mode auto]
//
// 成功 stdout 输出图片绝对路径 + 来源标记；失败 stderr 报错并 exit 非 0（auto 模式下三级全败才 exit）。
//
// 环境变量（宿主注入）：
//   SUPERAI_SETTINGS   settings.json 绝对路径（大模型模式读 imageModel）
//   UNSPLASH_ACCESS_KEY  Unsplash API key（图库模式；未设置则跳过图库）
//   SUPERAI_WORKSPACE   当前会话工作目录（解析 --out 相对路径）

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--prompt') out.prompt = argv[++i];
    else if (k === '--keyword') out.keyword = argv[++i];
    else if (k === '--out') out.out = argv[++i];
    else if (k === '--size') out.size = argv[++i];
    else if (k === '--mode') out.mode = argv[++i];
    else if (k === '--model') out.model = argv[++i];
    else if (k === '--base-url') out.baseUrl = argv[++i];
    else if (k === '--api') out.api = argv[++i];
    else if (k === '--theme') out.theme = argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.out) {
  console.error('用法: node image-gen.mjs --out <路径> [--prompt "<提示词>"] [--mode auto|model|stock|texture] [--size 1024x1024] [--keyword "<图库搜索词>"] [--theme <纹理主题>] [--api openai-images|chat-images]');
  process.exit(1);
}

const mode = (args.mode || 'auto').toLowerCase();
const size = args.size || '1024x1024';
const [W, H] = size.toLowerCase().split('x').map((n) => parseInt(n, 10) || 1024);
const workspace = process.env.SUPERAI_WORKSPACE || process.cwd();
const outPath = path.isAbsolute(args.out) ? args.out : path.join(workspace, args.out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const cacheDir = path.join(workspace, '.image-gen-cache');
fs.mkdirSync(cacheDir, { recursive: true });

function cacheKey(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

function cachePath(keyword, theme) {
  return path.join(cacheDir, `${cacheKey(`${keyword}|${theme || ''}`)}.json`);
}

function readCachedImage(keyword, theme) {
  const p = cachePath(keyword, theme);
  if (!fs.existsSync(p)) return null;
  try {
    const item = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!item.file || !fs.existsSync(item.file)) return null;
    return item.file;
  } catch { return null; }
}

function writeCachedImage(keyword, theme, file) {
  fs.writeFileSync(cachePath(keyword, theme), JSON.stringify({ keyword, theme: theme || '', file, createdAt: new Date().toISOString() }, null, 2));
}

// 兑底：env var 没传到时直接从 settings.json 读（SUPERAI_SETTINGS 路径能到子进程）
function readSettingsField(field) {
  const sp = process.env.SUPERAI_SETTINGS;
  if (!sp || !fs.existsSync(sp)) return '';
  try { const s = JSON.parse(fs.readFileSync(sp, 'utf-8')); return s[field] || ''; } catch { return ''; }
}
// 代理：env 没传到时从 settings 读，并用 undici ProxyAgent 显式设全局 dispatcher
// （NODE_USE_ENV_PROXY 只在 Node 启动时生效，运行时设 process.env 无用，必须用 ProxyAgent）
async function ensureProxy() {
  let proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || readSettingsField('proxy');
  if (!proxy) return;
  process.env.HTTPS_PROXY = proxy;
  process.env.HTTP_PROXY = proxy;
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    console.error('[image-gen] proxy via undici ProxyAgent:', proxy);
  } catch (e) {
    console.error('[image-gen] 代理设置失败（undici 不可用）:', e.message);
  }
}

// 从 prompt 抽图库搜索词：取第一个逗号前的主体，去掉风格后缀
function keywordFromPrompt(prompt) {
  if (!prompt) return '';
  const head = prompt.split(',')[0].trim();
  // 去掉常见修饰词，留主体名词
  return head.replace(/^(a |an |the |photograph of |photo of |image of )/i, '').trim() || head;
}

// ============ 1. 大模型（两种协议自动判断）============
// 协议判断优先级：--api 显式 > imageModel.api > baseUrl 自动探测
//   openai-images: POST {baseUrl}/images/generations  （baseUrl 形如 https://api.x.com/v1）
//   chat-images:   POST {baseUrl} 直接发 messages      （baseUrl 带具体模型路由，如 …/v1/wand/hunyuan-image/v35-generation）
function detectApi(baseUrl, imageModel) {
  if (args.api) return args.api;
  if (imageModel?.api) return imageModel.api;
  // /v1 或 /v1/ 结尾 → 标准 OpenAI 生图；否则视为 chat-style 完整端点
  return /\/v1\/?$/.test(baseUrl) ? 'openai-images' : 'chat-images';
}

async function genModelOpenAIImages(baseUrl, model, apiKey) {
  const url = baseUrl + '/images/generations';
  const body = { model, prompt: args.prompt, n: 1, size };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let t = ''; try { t = await r.text(); } catch {}
    throw new Error(`大模型生图失败 HTTP ${r.status}${t ? '：' + t.slice(0, 300) : ''}`);
  }
  const j = await r.json();
  const item = j.data && j.data[0];
  if (!item) throw new Error('大模型响应无 data：' + JSON.stringify(j).slice(0, 300));
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item.url) {
    const rr = await fetch(item.url);
    if (!rr.ok) throw new Error('下载图片失败 HTTP ' + rr.status);
    return Buffer.from(await rr.arrayBuffer());
  }
  throw new Error('大模型响应既无 url 也无 b64_json');
}

async function genModelChatImages(baseUrl, model, apiKey) {
  // 对话式生图（腾讯混元 wand 等）：POST baseUrl，发 messages，图片在 assembled_history[role=tool].content[].image_url.url
  const session = 'superai-' + Date.now();
  const body = {
    model,
    session,
    messages: [{ role: 'user', content: [{ type: 'text', text: args.prompt }] }],
  };
  const r = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let t = ''; try { t = await r.text(); } catch {}
    throw new Error(`chat-images 生图失败 HTTP ${r.status}${t ? '：' + t.slice(0, 300) : ''}`);
  }
  const j = await r.json();
  // 优先 choices[0].message，其次 assembled_history[role=tool]
  const candidates = [];
  const choices = j.choices || [];
  for (const c of choices) {
    const m = c.message || {};
    candidates.push(m);
    const content = m.content;
    if (Array.isArray(content)) for (const blk of content) if (blk?.image_url?.url) candidates.push({ _img: blk.image_url.url });
  }
  for (const h of (j.assembled_history || [])) {
    if (h.role === 'tool' || h.role === 'assistant') candidates.push(h);
  }
  // 从候选里捞 image_url
  for (const cand of candidates) {
    if (cand._img) return await downloadImage(cand._img);
    const content = cand.content;
    if (Array.isArray(content)) {
      for (const blk of content) {
        if (blk?.image_url?.url) return await downloadImage(blk.image_url.url);
        if (typeof blk === 'string' && /https?:\/\/\S+\.(png|jpe?g|webp)/i.test(blk)) return await downloadImage(blk.match(/https?:\/\/\S+\.(png|jpe?g|webp)/i)[0]);
      }
    } else if (typeof content === 'string') {
      const m = content.match(/https?:\/\/\S+\.(png|jpe?g|webp)/i);
      if (m) return await downloadImage(m[0]);
    }
  }
  throw new Error('chat-images 响应未找到图片 URL：' + JSON.stringify(j).slice(0, 400));
}

async function downloadImage(url) {
  const rr = await fetch(url, { headers: { 'User-Agent': 'superai/1.0' } });
  if (!rr.ok) throw new Error('下载生成图片失败 HTTP ' + rr.status + '：' + url.slice(0, 120));
  return Buffer.from(await rr.arrayBuffer());
}

async function genModel() {
  const settingsPath = process.env.SUPERAI_SETTINGS;
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    throw new Error('未配置 SUPERAI_SETTINGS（大模型模式需要 imageModel）');
  }
  let imageModel;
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    imageModel = s.imageModel;
  } catch (e) { throw new Error('读取 settings 失败：' + e.message); }
  const baseUrl = (args.baseUrl || imageModel?.baseUrl || '').replace(/\/+$/, '');
  const model = args.model || imageModel?.model;
  const apiKey = imageModel?.apiKey || '';
  if (!baseUrl || !model) throw new Error('未配置图像生成模型（baseUrl/model）');
  if (!args.prompt) throw new Error('大模型模式需要 --prompt');

  const api = detectApi(baseUrl, imageModel);
  let buf;
  if (api === 'chat-images') {
    buf = await genModelChatImages(baseUrl, model, apiKey);
  } else {
    buf = await genModelOpenAIImages(baseUrl, model, apiKey);
  }
  fs.writeFileSync(outPath, buf);
  return 'model';
}

// ============ 2. 图库 Unsplash ============
async function genStock() {
  const key = process.env.UNSPLASH_ACCESS_KEY || readSettingsField('unsplashKey');
  if (!key) throw new Error('未配置 UNSPLASH_ACCESS_KEY（图库模式跳过）');
  const kw = (args.keyword || keywordFromPrompt(args.prompt) || 'abstract texture').trim();
  if (!kw) throw new Error('图库模式需要 --keyword 或 --prompt');
  // 背景图优先选择留白多、主体弱、构图简约的横向照片，减少抢占文字层的风险。
  const theme = (args.theme || '').toLowerCase();
  const cached = readCachedImage(kw, theme);
  if (cached) {
    fs.copyFileSync(cached, outPath);
    console.error(`[image-gen] stock cache hit: ${cached}`);
    return 'stock-cache';
  }
  const query = `${kw} minimalism negative space simple background`;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape&content_filter=high`;
  const r = await fetch(url, { headers: { Authorization: 'Client-ID ' + key } });
  if (!r.ok) {
    let t = ''; try { t = await r.text(); } catch {}
    throw new Error(`Unsplash 搜索失败 HTTP ${r.status}${t ? '：' + t.slice(0, 200) : ''}`);
  }
  const j = await r.json();
  const results = Array.isArray(j.results) ? j.results : [];
  const hit = results.find((item) => {
    const alt = `${item.alt_description || ''} ${item.description || ''}`.toLowerCase();
    const tags = (item.tags || []).map((tag) => `${tag.title || ''}`).join(' ').toLowerCase();
    const text = `${alt} ${tags}`;
    return !/(portrait|person|people|face|logo|text|sign|poster|busy|crowd|close[- ]?up)/i.test(text);
  }) || results[0];
  if (!hit) throw new Error('Unsplash 无匹配结果：' + kw);
  const imgUrl = hit.urls && (hit.urls.regular || hit.urls.full || hit.urls.raw);
  if (!imgUrl) throw new Error('Unsplash 结果无图片 URL');
  const rr = await fetch(imgUrl, { headers: { 'User-Agent': 'superai/1.0' } });
  if (!rr.ok) throw new Error('下载图库图片失败 HTTP ' + rr.status);
  const buf = Buffer.from(await rr.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  const cachedFile = path.join(cacheDir, `${cacheKey(`${kw}|${theme}`)}.img`);
  fs.writeFileSync(cachedFile, buf);
  writeCachedImage(kw, theme, cachedFile);
  return 'stock';
}

// ============ 3. 纹理（纯 Node，零依赖）============
// 生成大地低饱和渐变 + 噪点底图，按 theme 选色板。永远可用，作为终极兜底。
const PALETTES = {
  paper:   [[243, 236, 220], [210, 180, 136]],
  ink:     [[26, 20, 14], [60, 50, 38]],
  sand:    [[210, 180, 136], [176, 141, 87]],
  mist:    [[167, 156, 136], [127, 117, 101]],
  dunes:   [[184, 150, 100], [120, 90, 60]],
  bamboo:  [[90, 110, 70], [60, 80, 50]],
  bronze:  [[120, 100, 70], [70, 58, 40]],
  default: [[180, 160, 130], [90, 75, 55]],
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function genTexture() {
  const theme = (args.theme || '').toLowerCase();
  const pal = PALETTES[theme] || PALETTES.default;
  const [c1, c2] = pal;
  // 每行前置 filter 字节(0) + RGB
  const rowLen = W * 3 + 1;
  const raw = Buffer.alloc(rowLen * H);
  // 伪随机（确定性，基于 theme 哈希），让同主题每次略不同
  let seed = 0;
  for (let i = 0; i < theme.length; i++) seed = (seed * 131 + theme.charCodeAt(i)) & 0x7fffffff;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  for (let y = 0; y < H; y++) {
    const rowOff = y * rowLen;
    raw[rowOff] = 0; // filter none
    // 对角渐变 + 径向暗角
    const gy = y / H;
    for (let x = 0; x < W; x++) {
      const gx = x / W;
      let t = gx * 0.5 + gy * 0.5;
      // 径向暗角：四角偏暗
      const dx = (gx - 0.5) * 2, dy = (gy - 0.5) * 2;
      const vig = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 0.5);
      t = t * 0.6 + vig * 0.4;
      // 噪点
      const n = (rnd() - 0.5) * 28;
      const off = rowOff + 1 + x * 3;
      raw[off]     = Math.max(0, Math.min(255, Math.round(c1[0] * t + c2[0] * (1 - t) + n)));
      raw[off + 1] = Math.max(0, Math.min(255, Math.round(c1[1] * t + c2[1] * (1 - t) + n)));
      raw[off + 2] = Math.max(0, Math.min(255, Math.round(c1[2] * t + c2[2] * (1 - t) + n)));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8bit, RGB, deflate, filter 0, no interlace
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(outPath, png);
  return 'texture';
}

// ============ 主流程：按 mode 执行 / 级联 ============
const RUNNERS = {
  model: genModel,
  stock: genStock,
  texture: () => Promise.resolve(genTexture()),
};

async function main() {
  await ensureProxy();
  if (mode === 'auto') {
    // 图库额度/网络失败后自动退到程序化纹理，再尝试大模型。
    // 图库缓存命中不消耗 API 请求。
    // 1→2→3 级联，任一成功即停；全败才报错
    const errors = [];
    for (const m of ['stock', 'texture', 'model']) {
      try {
        const src = await RUNNERS[m]();
        console.log(outPath);
        console.error(`[image-gen] via ${src}`);
        return;
      } catch (e) {
        errors.push(`${m}: ${e.message || e}`);
      }
    }
    console.error('[image-gen] 三种方式全部失败：\n  ' + errors.join('\n  '));
    process.exit(2);
  } else if (RUNNERS[mode]) {
    try {
      const src = await RUNNERS[mode]();
      console.log(outPath);
      console.error(`[image-gen] via ${src}`);
    } catch (e) {
      console.error(`[image-gen] ${mode} 模式失败：${e.message || e}`);
      process.exit(3);
    }
  } else {
    console.error(`未知 --mode ${mode}（可选 auto|model|stock|texture）`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('[image-gen] 致命错误：' + (e.message || e)); process.exit(4); });
