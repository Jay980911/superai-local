import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BENCH 案台 — Vite 配置
// 设计 token / 视觉真值见 ../design/；本期 mock 驱动，不接后端。
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, open: true },
  base: './',
});
