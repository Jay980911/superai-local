---
name: image-gen
description: 生成图片/插图/背景图/配图。用户要生成图片、插画、背景图、海报图、配图时使用。通过 run_command 调本地脚本，脚本读配置的图像模型生成图片（OpenAI 兼容 /images/generations），API Key 不暴露给 agent。
---

# image-gen — 图片生成

当用户需要生成图片（插画、背景图、配图、海报图、封面图等）时，用 `run_command` 调用本地脚本：

```
node "$SUPERAI_IMAGEGEN" --prompt "<完整提示词>" --out "<输出路径.png>" --size 1024x1024
```

## 行为

- 脚本读「设置 → 模型配置 → 图像生成模型」里的 baseUrl / apiKey / model，调 OpenAI 兼容的 `POST {baseUrl}/images/generations` 生成图片。
- **不要在命令里传 API Key**（脚本内部读配置，key 不暴露）。
- `--out` 相对路径基于当前工作目录；成功时 stdout 输出图片**绝对路径**，失败时 stderr 报错并退出非 0。
- `--size` 可选，默认 `1024x1024`；宽屏背景用 `1792x1024` 或 `1536x864`（视模型支持）。
- 多张图：多次调用，`--out` 各不同；不要并行太多以免限流。

## 何时用

- 用户明确要"生成图片 / 画一张 / 配图 / 背景图"。
- 配合其他 skill 的提示词库时（如 `xinzhongshi-ppt/prompts/backgrounds.md`），把那里的 prompt 填进 `--prompt`，`--out` 指向 skill 期望的背景图目录。

## 何时不用

- 用户只是要程序化/纯色/渐变背景、或环境没配图像模型 → 让对应 skill 走它的 fallback（如 `make_bg.py`）。
- 需要编辑已有图片（裁剪/合成）→ 用 ImageMagick / Pillow 等命令行工具，不是本工具。

## 前置条件

- 「设置 → 模型配置 → 图像生成模型」已填 baseUrl / apiKey / model（如混元 OpenAI 兼容端点）。
- 环境变量 `SUPERAI_IMAGEGEN` / `SUPERAI_SETTINGS` / `SUPERAI_WORKSPACE` 由宿主注入（superai 主进程自动设置）。

## 失败排查

- `未配置图像生成模型` → 提示用户去设置页配置图像生成模型。
- `HTTP 401 / Invalid token` → apiKey 不对或 baseUrl 不是 OpenAI 兼容根。
- `HTTP 4xx` + 厂商错误 → 多半是 size/model 不支持，换 size 或核对模型名。
