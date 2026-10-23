// Service Worker: CLI 挂了显示断连页，不白屏
const CACHE = 'superai-local-v1';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  // 网络优先，失败返回断连页
  e.respondWith(
    fetch(e.request).catch(() => {
      if (e.request.mode === 'navigate') {
        return new Response(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><title>CLI 已断开</title>
          <style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
          .box{text-align:center}.h1{font-size:24px;margin-bottom:8px}.p{color:#94a3b8}</style></head>
          <body><div class="box"><div class="h1">⚠️ CLI 已断开</div><div class="p">superai-local 进程不在运行，请重启：<br><code>superai-local</code></div></div></body></html>`,
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
      return new Response('', { status: 503 });
    })
  );
});