'use strict';
/**
 * Mock LLM：根据用户消息生成固定 tool_call 序列
 * 验证 scaffold → write_file → exec → start_preview 全链路
 */

function planFor(msg, project) {
  const lower = (msg || '').toLowerCase();

  // 单 HTML 落地页
  if (/落地页|着陆页|html|静态页|简单页面|landing/.test(lower)) {
    const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI 生成的落地页</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, "Microsoft YaHei", sans-serif; background:#0f172a; color:#e2e8f0; }
  .hero { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:2rem; }
  h1 { font-size:3rem; background:linear-gradient(90deg,#60a5fa,#a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:1rem; }
  p { font-size:1.2rem; color:#94a3b8; max-width:600px; margin-bottom:2rem; }
  .btn { padding:.8rem 2rem; background:#3b82f6; color:#fff; border:none; border-radius:8px; font-size:1rem; cursor:pointer; transition:.2s; }
  .btn:hover { background:#2563eb; transform:translateY(-2px); }
</style>
</head>
<body>
  <div class="hero">
    <h1>Hello SuperAI</h1>
    <p>这是 AI 在你本地生成并预览的落地页。改我说"按钮变红"试试。</p>
    <button class="btn" onclick="alert('点击了!')">开始体验</button>
  </div>
</body>
</html>`;
    return {
      intro: '好的，我来生成一个单页落地页，直接在你本地预览。',
      steps: [
        { type: 'scaffold', template: 'static-html' },
        { type: 'write_file', path: 'index.html', content: html },
        { type: 'start_preview' },
      ],
      outro: '✅ 已生成落地页，右侧预览可见。试试说"按钮改成红色"。',
    };
  }

  // React 仪表盘
  if (/react|仪表盘|dashboard|后台|管理系统/.test(lower)) {
    return {
      intro: '我来生成一个 React + Vite 项目。先 scaffold，装依赖（约 30-60 秒），再起 dev server 预览。',
      steps: [
        { type: 'scaffold', template: 'vite-react' },
        { type: 'exec', cmd: 'npm install' },
        { type: 'start_preview' },
      ],
      outro: '✅ React 项目已起，预览可见。dev server 在 localhost:5173 左右。',
    };
  }

  // 改按钮颜色（演示增量 write_file）
  if (/按钮.*红|变红|红色/.test(lower)) {
    const html = (project.readFile('index.html') || '').replace(/background:#3b82f6/g, 'background:#ef4444').replace(/background:#2563eb/g, 'background:#dc2626');
    return {
      intro: '把按钮改成红色。',
      steps: [
        { type: 'write_file', path: 'index.html', content: html },
      ],
      outro: '✅ 按钮已改红，预览会刷新。',
    };
  }

  return null;
}

module.exports = { planFor };
