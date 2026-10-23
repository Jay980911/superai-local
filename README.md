# BENCH · 案台 — 桌面 AI 工作台

桌面端 AI 工作台，以 [deepseek-harness](https://github.com/gitzhoujiahao/deepseek-harness) 引擎为核心。选一个工作目录，用对话驱动 AI 执行任务、生成文件/项目，右侧实时查看成果（目录树 / 源码 / 预览）。

## 仓库结构

- `bench-app/` — 桌面端前端（Vite + React + TS，mock 驱动，UI 真值见 `design/`）
- `design/` — 视觉真值与实现规格（`bench-implementation-brief.md` / `bench-ui-ux-prototype.html` / `bench-design-tokens.css`）
- `bin/` `src/` `web/` — 早期本地桥 CLI（保留作为 SignPath 签名那条线的 fallback，后续被桌面壳取代）

## 快速开始（前端）

```bash
cd bench-app
npm install && npm run dev   # → http://localhost:5174
```

详见 `bench-app/README.md`。

## License

MIT. Windows 构建签名走 [SignPath Foundation](https://signpath.org) 免费 OSS 项目。
