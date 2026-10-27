// localize-fonts.cjs — 从 Google Fonts CSS 抽取 latin/latin-ext 子集并下载本地化
// 用法：node scripts/localize-fonts.cjs（在 superai-app 目录下执行）
const fs = require('fs');
const path = require('path');
const https = require('https');

const SRC = 'gf.tmp.css';
const OUT_DIR = path.join(__dirname, '..', 'superai-app', 'public', 'fonts');
const OUT_CSS = path.join(__dirname, '..', 'superai-app', 'src', 'styles', 'fonts.css');

const css = fs.readFileSync(SRC, 'utf-8');

// 按 /* subset */ 注释切块，只留 latin / latin-ext
const parts = css.split(/\/\*\s*([a-z-]+)\s*\*\//);
const kept = [];
for (let i = 1; i < parts.length; i += 2) {
  if (parts[i] === 'latin' || parts[i] === 'latin-ext') {
    kept.push('/* ' + parts[i] + ' */' + parts[i + 1]);
  }
}
if (kept.length === 0) {
  console.error('no latin blocks found');
  process.exit(1);
}
let localCss = kept.join('\n');

const urls = [...localCss.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
console.log('latin woff2 urls:', urls.length);

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let n = 0;
  for (const url of urls) {
    const name = url.split('/').pop();
    const buf = await download(url);
    fs.writeFileSync(path.join(OUT_DIR, name), buf);
    localCss = localCss.split(url).join('../public/fonts/' + name);
    n++;
    console.log('  ✓', name, (buf.length / 1024).toFixed(1) + 'KB');
  }
  fs.writeFileSync(OUT_CSS, '/* 本地化字体（latin/latin-ext 子集，源自 Google Fonts；中文走系统字体栈）*/\n' + localCss, 'utf-8');
  console.log('done:', n, 'files →', OUT_CSS);
})();
