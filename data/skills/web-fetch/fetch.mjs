#!/usr/bin/env node
// web-fetch — agent 通过 pwsh 调用：抓取网页并返回去标签后的正文。
// 用 superai 自己的 node 跑（路径由 AGENTS.md 注入），用户机无需装 node。
// 用法: node fetch.mjs <url> [maxChars]
const url = process.argv[2];
const maxChars = parseInt(process.argv[3] || '8000', 10);

if (!url) {
  console.error('用法: fetch.mjs <url> [maxChars]');
  process.exit(1);
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function htmlToText(html) {
  // 去掉脚本/样式/导航/页脚/头部
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');
  // 优先取 main / article
  const main = h.match(/<(?:main|article)\b[\s\S]*?<\/(?:main|article)>/i);
  if (main) h = main[0];
  // 块级元素转换行
  h = h.replace(/<\/(p|div|li|h[1-6]|tr|br|section)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  // 去标签
  h = h.replace(/<[^>]+>/g, '');
  h = decodeEntities(h);
  // 压缩空白
  h = h.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').replace(/ \n/g, '\n').trim();
  return h;
}

(async () => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/json,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timer);
    const ct = r.headers.get('content-type') || '';
    const status = r.status;
    if (status >= 400) {
      console.log(`HTTP ${status} ${ct} — ${url}`);
      process.exitCode = 0;
    }
    const body = await r.text();
    if (!ct.includes('text/html')) {
      // JSON / 纯文本 / 其他：原样截断返回
      const out = body.length > maxChars ? body.slice(0, maxChars) + `\n…(截断，共 ${body.length} 字)` : body;
      console.log(`[${status} ${ct}] ${url}\n${out}`);
      process.exitCode = 0;
    }
    const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
    const text = htmlToText(body);
    const out = text.length > maxChars ? text.slice(0, maxChars) + `\n…(截断，共 ${text.length} 字)` : text;
    console.log(`[${status}] ${url}\n标题: ${decodeEntities(title)}\n\n${out}`);
    process.exitCode = 0;
  } catch (e) {
    clearTimeout(timer);
    const msg = e && e.name === 'AbortError' ? '请求超时（25s）' : (e && e.message || String(e));
    console.error('web_fetch 失败:', msg);
    process.exitCode = 2;
  }
})();
