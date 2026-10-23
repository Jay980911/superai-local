# BENCH · 案台 — 桌面 AI 工作台（前端）

> 一句话：选一个工作目录，用对话驱动 AI 执行任务、生成文件/项目，右侧实时查看成果。
> 产品性格：安静、克制、可信。像一张整理好的工作台，不是一块仪表盘。

本期为 **MVP 前端 UI 层**（mock 驱动），为后续以 deepseek-harness 为核心的桌面 exe 壳预留接口（§10）。

## 运行

```bash
npm install
npm run dev      # → http://localhost:5174
npm run build    # 类型检查 + 生产构建到 dist/
npm run typecheck
```

## 视觉与交互真值

- **原型（像素真值）**：`../design/bench-ui-ux-prototype.html`（浏览器打开，含 5 个界面状态与全部交互）
- **设计 token（唯一数值来源）**：`../design/bench-design-tokens.css` → 本项目 `src/styles/tokens.css`
- **实现规格**：`../design/bench-implementation-brief.md`

> 冲突优先级：**原型 HTML > token 文件 > 规格书 > 你的判断**。
> `--seal`（墨·行动色）与 `--seal-soft` 取自原型"风格A · 简约高级"的 :root（token 文件缺这两项，按优先级从原型补，非自创）。

## 目录结构（对应规格 §6 组件清单）

```
src/
  main.tsx · app/App.tsx(布局)
  styles/   tokens.css(=bench-design-tokens.css) · base.css
  components/
    chrome/   WindowChrome
    sidebar/  SessionSidebar · SessionRow · UserBar
    chat/     ChatStream · UserMessage · AgentMessage · StepCard · FileCard · Composer · EmptyState
    output/   OutputPanel · TreePane · CodePane · PreviewPane · OutputEmpty
    icons/    Icon（§6.6 全部图标，纯 SVG，24 网格 stroke2 butt miter）
  data/      mock.ts(§7) · preview.ts
  types.ts
  hooks/     useSidebar · useOutputTab · useInspect
```

## mock → 真接口替换点（规格 §10）

组件只依赖 `data/mock.ts` 里与接口同名的 mock 实现，后续接 deepseek-harness 时替换实现、不动组件：

- `chat.send(sessionId, text, attachments)` → `StreamEvent`
- `files.list / files.read / files.write`
- `artifacts.list(project)`
- `actions.request(action)`（危险操作授权）
- `preview.sync(project)` / `preview.locate(elementId)`

## 实现说明

- `.app` 撑满视口（`100vw × 100vh`）。原型里 1600×1260 卡片 + 暗格底是"桌上一张纸"的展示框，真实桌面端铺满窗口。
- 字体走 Google Fonts CDN（Noto Serif SC / Space Grotesk / JetBrains Mono），对应 token `--font-display / --font-body / --font-mono`。
- 进度：✅ P0 骨架（标题栏 + 三栏 + 分段控件） · ⏳ P1 S1 内容进行中。
