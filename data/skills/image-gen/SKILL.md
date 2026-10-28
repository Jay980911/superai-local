---
name: image-gen
description: 生成图片/插图/背景图/配图。用户要生成图片、插画、背景图、海报图、配图时使用。通过 run_command 调本地脚本，脚本支持三种方式（大模型/图库/纹理）可级联，永远能出图。API Key 不暴露给 agent。
---

# image-gen — 通用图片生成（三种方式，可级联）

当用户需要生成图片（插画、背景图、配图、海报图、封面图等）时，用 `run_command` 调用本地脚本：

```
node "$SUPERAI_IMAGEGEN" --prompt "<完整提示词>" --out "<输出路径.png>" [--size 1024x1024] [--mode auto]
```

## 三种生成方式 × 两种调用模式

**两种调用模式**（由 `--mode` 决定）：
- **指定模式** `--mode model|stock|texture`：只用指定的一种，失败即失败（exit 非 0），**不级联退化**。用户明确要求「用大模型生」「用图库」「用纹理」时用此模式，尊重用户意图，不擅自换方式。
- **自动模式** `--mode auto`（默认）：图库 → 纹理 → 大模型 级联，任一成功即停，全败才报错。图库免费优先，纹理零成本兑底，大模型殿后（只在图库+纹理都失败时才花钱调）。用户没指定方式时用此模式。

| 方式 | --mode | 说明 | 依赖 |
|---|---|---|---|
| **大模型** | model | 调 OpenAI 兼容 `POST {baseUrl}/images/generations`，读「设置→图像生成模型」的 baseUrl/apiKey/model | 已配图像模型（`SUPERAI_SETTINGS`） |
| **大模型(chat-images)** | model | 对话式生图（腾讯混元 wand 等），`POST {baseUrl}` 发 messages，从 `assembled_history[role=tool]` 取图；自动探测 | 同上 |
| **图库** | stock | Unsplash 搜索最多 5 个高质量横向候选；默认追加 `minimalism negative space simple background`，优先选择简约、留白多、主体弱的图片；选中后只下载 1 张，并按关键词+主题缓存；`--keyword` 指定搜索词，未给则从 `--prompt` 抽主体词 | `UNSPLASH_ACCESS_KEY` |
| **纹理** | texture | 纯 Node 生成大地低饱和渐变+噪点底图（按 `--theme` 选色板），零依赖 | 无，永远可用 |

## 行为

- **不要在命令里传 API Key**（大模型模式脚本内部读 `SUPERAI_SETTINGS` 的 imageModel，Unsplash 读 `UNSPLASH_ACCESS_KEY`，key 不暴露给 agent）。
- `--out` 相对路径基于当前工作目录；成功时 stdout 输出图片**绝对路径**，stderr 输出 `via <来源>`，失败 stderr 报错并退出非 0。
- `--size` 可选，默认 `1024x1024`；宽屏背景用 `1792x1024` 或 `1536x864`（视模型支持）。
- **大模型协议自动判断**：baseUrl 以 `/v1` 结尾 → 标准 OpenAI 生图（拼 `/images/generations`）；baseUrl 带具体模型路由（如 `…/v1/wand/hunyuan-image/v35-generation`）→ chat-images 协议（直接 POST baseUrl，发 messages，从 `assembled_history[role=tool].content[].image_url.url` 取图）。可用 `--api openai-images|chat-images` 显式覆盖。
- **如何选 mode**（关键）：
  - 用户说「用大模型生」「用 AI 生图」「用模型生」→ `--mode model`（指定，不退化）
  - 用户说「用图库」「找张照片」「用素材库」→ `--mode stock`（指定，不退化）
  - 用户说「用纹理」「纯色底」「程序化背景」→ `--mode texture`（指定，不退化）
  - 用户没指定方式，或说「随便」「你看着办」「保证出图」→ `--mode auto`（默认，级联兜底）
  - **用户明确指定方式时必须用指定模式，不要擅自降级到 auto**——用户要大模型就只试大模型，失败如实报告，不要偷偷换成图库/纹理。
- `--mode auto`（默认）：图库失败（包括额度耗尽或网络错误）→ 自动试纹理 → 最后试大模型，保证一定出图；图库同关键词+主题命中缓存时不消耗 API 请求。
- 指定单方式：`--mode model` 只用大模型（失败不退化）；`--mode stock` 只用图库；`--mode texture` 只用纹理（秒出，零成本）。
- 纹理模式 `--theme` 支持：paper / ink / sand / mist / dunes / bamboo / bronze / default；用于生成与设计风格协调的纯色肌理底。

## 何时用哪种

- **大模型**：要具象画面（竹林、山水、酒店空间、人物剪影）——有画面感、唯一性高。
- **图库**：要真实照片、大模型不可用或想省额度——质量稳定、免费（Unsplash 额度内）。
- **纹理**：只要抽象底（卡片背景、占位、保底）、或大模型+图库都不可用——零成本秒出，永远兜底。
- **auto（推荐）**：不确定时用默认级联，先试图库（免费）拿真实照片，没结果用纹理（零成本）兑底，两者都失败才调大模型，绝不出空。

## 何时不用

- 需要编辑已有图片（裁剪/合成）→ 用 ImageMagick / Pillow 等命令行工具，不是本工具。
- 用户只是要纯色/已知渐变且不涉及"生成"→ 直接写 CSS 或用 Pillow 画。

## 前置条件

- **大模型模式**：「设置 → 图像生成模型」已填 baseUrl / apiKey / model。baseUrl 两种都支持：OpenAI 兼容根（`https://api.xxx.com/v1`）走 `/images/generations`；或完整端点（如腾讯混元 `https://tokenhub.tencentmaas.com/v1/wand/hunyuan-image/v35-generation`）走对话式生图。脚本自动探测，无需手选。
- **图库模式**：环境变量 `UNSPLASH_ACCESS_KEY` 已设（Unsplash 开发者免费 key）；境外访问需代理（设置里配代理地址）。
- **纹理模式**：无前置条件。
- 环境变量 `SUPERAI_IMAGEGEN` / `SUPERAI_SETTINGS` / `SUPERAI_WORKSPACE` 由宿主注入（superai 主进程自动设置）。

## 失败排查

- `大模型生图失败 HTTP 404 / 接口不存在` → 协议判断错误。两种情况：① baseUrl 应为 OpenAI 兼容根（形如 `https://api.xxx.com/v1`）却带了具体路由；② 反之。用 `--api openai-images|chat-images` 显式指定即可。
  - 对话式生图（腾讯混元 wand 等）：baseUrl 就是完整端点（如 `https://tokenhub.tencentmaas.com/v1/wand/hunyuan-image/v35-generation`），脚本自动走 chat-images 协议，无需手动指定。
- `未配置 UNSPLASH_ACCESS_KEY` → 图库模式需要 Unsplash key，未设则跳过；auto 模式下会继续退化到纹理。
- `三种方式全部失败` → 极少见，检查 --out 路径可写、磁盘空间。
