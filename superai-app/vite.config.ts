import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SuperAI — Vite 配置
// 设计 token / 视觉真值见 ../design/；本期 mock 驱动，不接后端。

// dev CSP：与生产（index.html meta）对齐，仅放开 dev 必需项：
// - script 'unsafe-inline'：@vitejs/plugin-react 的 react-refresh runtime 是 inline script
// - connect ws/wss：HMR  websocket
// 不加 unsafe-eval——Electron 对「无 CSP 或含 unsafe-eval」会弹安全警告，
// dev 下同样要守住这条线（生产警告会消失，但 dev 体验也该干净）。
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: superai-preview:",
  "font-src 'self' data: superai-preview:",
  "connect-src 'self' ws: wss: http://localhost:*",
  "frame-src 'self' superai-preview: blob: data:",
].join('; ');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    open: true,
    headers: { 'Content-Security-Policy': DEV_CSP },
  },
  base: './',
});
