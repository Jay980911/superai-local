# SuperAI — 桌面 AI 工作台

桌面端 AI 工作台，agent 引擎为 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（dsh，DeepSeek 官方开源，MIT）。选一个工作目录，用对话驱动 AI 执行任务、生成文件/项目，右侧实时查看成果（目录树 / 源码 / 预览）。

## 仓库结构

- `electron/` — Electron 主进程（CJS）：IPC 中枢 + dsh 子进程驱动（JSON-RPC over stdio）
  - `main.cjs` — 窗口 / 菜单 / 全部 IPC handler
  - `dsh-client.cjs` — dsh runtime 的 CJS JSON-RPC 客户端（零依赖，按 sdk 协议手写）+ dsh 事件 → 前端 IPC 事件（text/step/file/done/error）翻译层
  - `dsh-patch.cjs` — settings 模型 → dsh provider patch 生成（API Key 走环境变量，不落盘）
  - `settings.cjs` — 模型配置（不内置任何模型，用户自行添加，支持三种 API 协议）
  - `sessions.cjs` / `memory.cjs` / `skills.cjs` — 会话 / 长期记忆 / 技能（UI 侧数据）
  - `tools.cjs` — 文件系统纯函数（仅供 files IPC 用，不给 LLM）
  - `preload.cjs` — contextBridge 白名单（`window.superai`）
- `superai-app/` — 桌面端前端（Vite + React + TS，UI 真值见 `design/`）
- `design/` — 视觉真值与实现规格（`superai-implementation-brief.md` / `superai-ui-ux-prototype.html` / `superai-design-tokens.css`）
- `scripts/` — dsh 接线验证脚本（smoke test / 协议探针 / 客户端集成测试）
- `bin/` `src/` `web/` — 早期本地桥 CLI（保留作为 SignPath 签名那条线的 fallback，后续被桌面壳取代）
- `data/` — 运行时数据（gitignore）：模型配置、会话、记忆、技能、dsh-home

## 快速开始

```bash
npm install

# 开发（前端 dev server + Electron 壳）
npm run dev            # → http://localhost:5174

# 仅前端
cd superai-app
npm install && npm run dev

# 打包
npm run build:win
```

开发态要求：Node 22+（dsh runtime 需要独立 node 进程；Electron 主进程的
`process.execPath` 是 electron.exe 不能直接用，按 PATH 查找或设
`SUPERAI_NODE_BIN` 指定）。

## 模型设置（任意大模型）

设置面板里添加模型即可，不内置任何预设。三种协议（与 dsh 的 llm-pi-ai 对齐）：

| 协议 | 适用 |
|---|---|
| `openai-completions` | OpenAI Chat Completions 兼容：DeepSeek、通义、Kimi、智谱、Ollama（地址填到 `/v1`）、vLLM、LiteLLM… |
| `openai-responses` | OpenAI Responses API |
| `anthropic-messages` | Anthropic Messages API |

API Key 存在 `data/settings.json`（已 gitignore），运行时经环境变量注入 dsh，不进 patch 文件。

## dsh 引擎接线

主进程 spawn `node @deepseek-ai/dsh --profile sdk`（stdio newline-delimited JSON-RPC）：

```
App.tsx ──runAgent(input, …, sessionId)──▶ IPC agent:run
  ▶ dsh-patch: settings.models → provider patch YAML（写入 dshHome）
  ▶ dsh-client: spawn → initialize{cwd,provider,model} → [session/resume] →
    session/prompt → 事件流（assistant/message→text / tool/call→step /
    tool/result→step）→ session.status=idle → shutdown → 进程阶梯清理
```

- 多轮上下文：同一会话 sessionId 映射到同一 dsh session（持久化于 dsh-home），
  跨轮次自动 resume，不重复发送 history
- 长期记忆：`data/memory/profile.md` 的记忆条目每次运行前写入
  `<dshHome>/AGENTS.md`，由 dsh 的 agent-instructions 插件注入 system prompt
- 技能：设置面板扫描 `data/skills/`（`<name>/SKILL.md` 或 `<name>.md`），
  该目录经 patch 注册为 dsh skill-filesystem 的 `customSkillDirs`，
  agent 对话中可被发现并读取
- 停止：dsh rc.3 协议无 wire 级 cancel，「停止」按钮走进程级中断
  （强杀 runtime；dsh 原子写持久化 session，下次 resume 继续）
- 工具权限：`DSH_PERMISSION_MODE=danger-full-access`（rc.3 的 SDK 协议还没有
  审批传输通道，等官方发布后可在 UI 侧补确认弹窗）

```bash
# 最小闭环验证（需 OpenAI 兼容端点的 key）
SUPERAI_MODEL_API_KEY=sk-xxx node scripts/dsh-smoke.mjs

# CJS 客户端集成测试（stub electron，真实驱动 runtime，含工具调用 + 多轮）
node scripts/dsh-client-test.cjs
node scripts/dsh-tool-test.cjs

# 打包树端到端（bundled node + 剪枝后的 dsh 闭包，模拟安装后环境）
npm run stage:dsh && node scripts/dsh-staged-test.cjs
```

详见 `scripts/dsh-litellm.patch.yml` 与 `scripts/dsh-probe.mjs`。

## 打包

`npm run build:win` / `build:dir` 会先跑 `stage:dsh`（`scripts/stage-dsh-runtime.cjs`）：

```
build/dsh-runtime/
  node/  独立 Node 22 运行时（node.exe）
         —— Electron 主进程的 process.execPath 是 electron.exe，不能跑 dsh
         来源：SUPERAI_NODE_EXE → PATH 里的 node → 下载 nodejs.org 官方 zip
  pkg/   dsh 生产依赖闭包（npm install --omit=dev --omit=optional）
         —— omit=optional 跳过平台二进制（LibreOffice kit / sherpa-onnx /
            sharp-win32，共 ~230M；均为 optionalDependencies 且懒加载，
            缺失只影响 Office 转 PDF / 语音转写 / 图片处理，不影响 agent 主链路）
```

该目录经 electron-builder `extraResources` 分发到 `<安装目录>/resources/dsh-runtime/`，
主进程打包态自动解析 bundled node + dsh 入口（`dshRuntimePaths()`），
开发态回退 PATH 里的 node + 项目 node_modules。

已知体积：staged 树 ~750M（未压缩，node-pty 27M 保留——懒加载的终端实现，
剪它要递归删除 51 个文件会触发安全策略，收益不值）。安装包经 NSIS 压缩后约 150–200M。

## License

MIT. Windows 构建签名走 [SignPath Foundation](https://signpath.org) 免费 OSS 项目。
