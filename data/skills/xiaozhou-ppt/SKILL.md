---
name: xiaozhou-ppt
description: 多风格 PPT 生成引擎。内置新中式/现代/商务稳定模板，并具备「原创能力」——可从一段文字 brief 原创出全新视觉风格（配色/字体/版式组件），无需为每种风格改代码。
---

# xiaozhou-ppt

基于 Python + `python-pptx` + `Pillow` 的多风格 PPT 生成 Skill。

## 风格

通过 `build_deck.py` 的 `--style` 或 `Deck(style=...)` 选择（**稳定模板，向后兼容，行为不变**）：

- `xinzhongshi`：新中式、国风、低饱和大地色、书法标题、朱砂印章、留白虚实。（默认）
- `modern`：现代简约、冷色高对比、无衬线字体、网格版式、信息卡片。
- `business`：商务汇报、深蓝/米白/金色、稳重标题、企业化版式、数据优先。

## 原创能力（从 brief 设计，而非套模板）

当需求不是这 3 套稳定风格时，不要改 `build_deck.py`、也不要新增 `StyleConfig`，
而是用「设计合成器」从一段文字需求原创出整套视觉：

```python
from design_synth import synthesize
out = synthesize({
    "topic": "国潮茶饮品牌",
    "vibe": "甜美潮玩",                       # 或 科技未来 / 美食 / 国风 / 极简 / 商务
    "colors": ["#F7F3EE","#F4A8C4","#E94752","#64C9D4"],  # 可选，不给则用 vibe 默认调色板
    "elements": ["大幅IP图","圆角卡片","贴纸标签","IP矩阵","海外地图","时间轴","图表","闭环"],
    "mood": "年轻鲜明、有收藏感、不过度幼稚",
}, out_dir="workspace/xxx")
# out = {"style": {...}, "plan": [...页面规划...], "image_needs": {"needs":[背景图], "subjects":[主体图]}}
```

`synthesize` 会产出：
1. **`style`**：一份 `StyleSpec` 数据（配色 / 字体 / 组件标签 `tags`），可被 `load_style()` 直接消费。
2. **`plan`**：页面规划（封面 / 目录 / 时间轴 / IP矩阵 / 焦点 / 机制 / 画像 / 渠道 / 地图 / 闭环 / 结语），宿主按此拼页面。
3. **`image_needs`**：背景图 `needs.json`（直接喂给 `prepare_backgrounds.py`）+ 主体图 `subjects.json`（角色/大图，走 image-gen），以及一份 `style_card.json` 供背景级联复用。

### 原理（规则优先，有 LLM 则增强）
- 默认走 `design_synth.VIBE_LIBRARY` / `PALETTE_LIBRARY` 的确定性映射，**完全离线可用**，保证稳定性。
- 若运行时检测到宿主 LLM 钩子（环境变量 `$SUPERAI_LLM` 指向可执行脚本），会把 draft 交给它做一次增强（色彩和谐 / 补充页面 / 丰富提示词），**失败自动回退规则结果，绝不阻断主流程**。

### 版式原子（`components.py`）
原创风格不再写死坐标，而是用可复用组件拼装：`rounded_card` / `sticker_tag` / `chip` / `hero_image` / `stat_tile` / `timeline` / `matrix_grid` / `bar_chart` / `donut` / `abstract_map`（合规：只画无边界大陆剪影，绝不描国界）/ `loop_diagram`。每个组件签名统一为 `(deck, s, spec, ...)`，只“画”不“决定内容”。

### 风格即数据（`style_spec.py`）
`StyleSpec` 替代了原来写死的 `StyleConfig`；可用 4 种方式构造：
命名预设 `load_style("xinzhongshi")` / 直接字典 / `from_style_card()`（参考图风格卡）/ `design_synth` 产出。
`STYLE_PRESETS` 中除 3 套稳定风格外，另含 `candy` / `tech` 两个原创基底示例，证明框架可承载非国风。

> 稳定性约定：**国风等 3 套稳定模板与 `build_deck.py` 既有 8 种版式保持不变**；原创路径是纯新增模块，只在显式传入 brief 时启用。

## 命令示例

```bash
python scripts/build_deck.py --style xinzhongshi --out result.pptx
python scripts/build_deck.py --style modern --out result.pptx
python scripts/build_deck.py --style business --out result.pptx
```

也可以在 Python 中使用：

```python
from scripts.build_deck import Deck

deck = Deck(style="modern")
deck.cover(bg="cover.png", title="项目主题")
deck.content("核心主张", "补充说明", bg="content.png")
deck.save("result.pptx")
```

## 设计规则

- 每页背景应不同，不得全篇铺同一张图。
- 各风格使用独立的配色、字体和排版参数。
- 新中式最多使用深咖、米白、沙金和朱砂印章红。
- 现代风格避免装饰性书法和高密度纹样，优先网格和卡片。
- 商务风格优先信息层级、对齐、可读性和数据表达。
- 中文字体必须同时设置 `a:latin`、`a:ea`、`a:cs`。

## 背景图准备（prepare_backgrounds.py）

**用 `scripts/prepare_backgrounds.py` 一键准备本轮 deck 背景**：

```bash
python scripts/prepare_backgrounds.py --needs needs.json [--style-card style_card.json] --out <项目专属背景目录>/ [--bg-mode auto|model|stock|texture]
```

needs.json 每条 = 一页背景需求：
```json
[{"page":"cover","theme":"bamboo","role":"hero"},
 {"page":"content-1","theme":"ink-mountain","role":"content"}]
```

### 级联优先级（--bg-mode auto，默认）

1. **用户实拍图**（needs 条目给 `photo`）→ 裁到 16:9 直接用
2. **本 skill 资产库** `assets/backgrounds/` → 按 `theme + stylehash` 匹配复用（不生图、零成本）
3. **image-gen**（宿主已注入 `$SUPERAI_IMAGEGEN` 且配了图像模型）→ 缺多少生多少；
   image-gen `--mode auto` 内部级联：图库→纹理→大模型（大模型殿后省钱）；
   **生成后自动登记入库**，下一份 deck 同主题同风格直接复用，不再生
4. **make_bg.py 程序化肌理** → image-gen 整体不可用时的终极兜底（不入库）

### 指定模式（--bg-mode model|stock|texture）

用户明确要求「用大模型」「用图库」「用纹理」时，跳过资产库复用和其他层，
只用 image-gen 的指定方式新鲜生成，失败不退化（尊重用户意图）。

### 资产库复用规则

- 库路径：`assets/backgrounds/`，索引：`assets/backgrounds/index.json`
- 每张图登记 `theme` + `stylehash`（风格卡主色+题材+饱和组 hash）+ `source` + `prompt`
- 同一 deck 内不重复用同一张图
- `stylehash` 把不同风格卡（明度/主色/题材）的图隔开，避免混搭
- **只有本库可以跨项目复用**（同 theme+stylehash → 零成本拿库里的图）

### 输出目录（重要）

**背景图必须输出到项目专属子目录**，如 `workspace/<项目名>/backgrounds/`，
**严禁**输出到 workspace 根目录的共享目录（如 `stock_backgrounds/`、`backgrounds/`）。
避免跨项目串图——上一个项目留下的临时图不能给新项目用。

主题菜单见 `prompts/backgrounds.md`（dunes/bamboo/mist/ink-mountain 等主题词，
也是 image-gen 大模型生图的提示词来源）。

## 文件

```text
SKILL.md
requirements.txt
scripts/build_deck.py       排版引擎
scripts/styles.py           多风格配置
scripts/make_bg.py          程序化背景
scripts/prepare_backgrounds.py 背景级联准备（资产库复用→image-gen→make_bg）
scripts/style_from_image.py 参考图风格分析 → style_card.json
scripts/export_preview.py   可选预览导出
prompts/backgrounds.md      外部生图提示词库（prepare_backgrounds.py 解析）
assets/backgrounds/         背景资产库（image-gen 生成的图自动入库，跨项目复用）
assets/backgrounds/index.json  资产库索引（theme/stylehash/prompt/source）
```
