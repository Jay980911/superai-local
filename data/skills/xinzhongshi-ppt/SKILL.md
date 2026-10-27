---
name: xinzhongshi-ppt
description: 生成新中式/国风高级感提案 PPT（.pptx）。大地低饱和、书法标题、朱砂印章、每页背景不同、留白虚实风格。用户提到新中式PPT/国风PPT/中式提案/酒店文旅地产提案等时使用。
---

# xinzhongshi-ppt — 新中式高级提案 PPT

生成「新中式 / 国风」高级感提案 PPT（.pptx）。风格基线已定稿：大地低饱和、书法标题、朱砂印章、每页背景不同、留白虚实。

**独立运行**：不依赖任何其他 skill、不依赖特定厂商生图工具。只要 Python + `python-pptx` + `Pillow` 即可出片。

---

## 何时使用

用户提到：新中式 PPT / 国风 PPT / 古风 PPT / 中式提案 / 酒店文旅地产提案 / 中国风汇报 / 「做一版见山那种 PPT」等。

不要用于：普通商务扁平 PPT、数据周报、英文 deck（风格不匹配）。

---

## 铁律（违背即失败）

1. **每页背景必须不同** — 禁止一张底图通铺全篇。封面/目录/章节/内容/尾页各用各的。
2. **三色以内** — 深咖 `#1A140E` / 米白 `#F3ECDC` / 沙金 `#D2B488`，朱砂 `#A63A2A` 仅用于印章。
3. **禁 AI 味** — 紫蓝渐变、发光描边、玻璃拟态、彩虹色、卡通图标，一律禁止。
4. **书法字做标题**，简洁字体做正文；字距适当拉开。
5. **留白优先** — 单页主张 ≤ 15 字；宁可少写，不堆纹样。
6. **背景图不得含文字** — 字全部由 PPT 排版层负责（可编辑、不糊）。

## 设计规范（与 golden sample 一致，勿改数值）

| 项 | 值 |
|---|---|
| 画布 | 16:9 · 13.333 × 7.5 in |
| 色板 | INK `#1A140E` · CREAM `#F3ECDC` · SAND `#D2B488` · GOLD `#B08D57` · MUTED `#9A825E` · SEAL `#A63A2A` · WHITE `#F8F3E7` |
| 标题 | `STXingkai`（华文行楷），60–78pt，字距拉开；无此字体退回 `KaiTi` |
| 副题/竖排 | `SimSun` 宋体，12–18pt |
| 正文 | `KaiTi` 或 `Microsoft YaHei`，13–16pt |
| 英文 | `Times New Roman` italic，10–13pt |
| 印章 | 0.58–0.68 in 圆角方块，SEAL 底、白字 2 字，放标题旁 |
| 竖排 | 标题右侧或左侧，行距 1.7–1.8 |
| 发丝线 | 0.012 in 高，GOLD 色 |
| 背景遮罩 | INK 半透明 alpha 28%–42%（保证白字可读） |

CJK 字体必须同时设 `a:latin` / `a:ea` / `a:cs`（见 `scripts/build_deck.py` 的 `set_cjk`），否则中文豆腐块。

## 页面模板（6 种）

1. **封面** — 全幅背景 + 行楷主标题（居中）+ 印章 + 右侧竖排禅句 + 底部副题
2. **目录** — 深色底 + 左侧壹贰叁肆圆标列表 + 右侧大字「目录」
3. **章节页** — 背景 + 章节序号（行楷大字）+ 章节名 + 一句主张
4. **内容页** — 一句主张（行楷 48pt）+ 短文 + 角落信息块
5. **要点页** — 米白底 + 3–5 张同色系卡片（圆角、细边）
6. **尾页** — 呼应封面 + 「感谢聆听」+ 英文小字

## 生成流程

### 0. 收集信息
问清（若用户没说）：主题/项目名、页数（默认 8–12）、章节结构、背景主题偏好（见下菜单）。

**用户给了参考图（我想要这种感觉）→ 先做风格分析：**

```bash
python scripts/style_from_image.py <参考图...> --out style_card.json
```

产出风格卡：主色 hex / 明暗 / 饱和 / `theme_hint` / 生图用 `prompt_hints`。
- 若宿主 agent 能看图：再补一层语义判断（题材：山水/古建/水墨？意境：萧瑟/华贵？），和 `theme_hint` 互相印证
- 后续背景按风格卡走：`make_bg.py --themes <theme_hint…>` 或把 `prompt_hints` 插入生图提示词
- 参考图本身也可直接当背景（`make_bg.py --photos`），一图一页不重复

### 1. 背景图（每页一张，全部不同）
优先级：
1. **用户提供实拍图** → 直接用（裁到 16:9）
2. **程序化肌理**（默认，零依赖）→ `python scripts/make_bg.py --theme <theme> --out dir/`
3. **外部生图模型**（若有）→ 用 `prompts/backgrounds.md` 的提示词 + 风格卡 `prompt_hints`；产出**必须无文字**

主题菜单（让用户选 1–3 类，据此分配到各页）：

| 类 | 主题 key |
|---|---|
| 自然实景 | dunes / snowmount / lake / bamboo / pine-stone / mist |
| 古代建筑 | pavilion / eave / garden-moon / bridge / grotto |
| 水墨意象 | ink-mountain / ink-bamboo / plum / lotus / ink-cloud |
| 人物意象 | scholar（泛指水墨高士剪影，不画具体真人） |
| 器物纹样 | bronze / celadon / manuscript / stele |

同一份 deck 内背景不重复；相邻页明暗交替（深-浅-深）更好翻页。

### 2. 先出 3 页小样，确认后再铺全篇（强制）
1. 只做 **封面 + 1 内容页 + 1 章节/要点页**
2. 导出预览图或让用户打开 pptx 确认（背景风格 / 标题字 / 印章 / 留白）
3. 用户点头后再补剩余页；有意见就改小样，不要先写完 20 页再返工

### 3. 排版
用 `scripts/build_deck.py`（库模式，见文件头 docstring）。要点：
- 标题走 `F_HANG`，正文走 `F_KAI/F_SONG`
- 每页至少一处留白；内容页主张 ≤ 15 字
- 印章每页 0–1 枚，不连用

### 4. 自检（出片前必过）
- [ ] 每页背景文件路径都不相同
- [ ] 无紫蓝渐变/发光
- [ ] 浅纹理区无浅色字（对比度）
- [ ] 单页背景不过花（正文可读）
- [ ] 中文无豆腐块、同句字重一致
- [ ] 三色 + 印章红以外无其他彩色

### 5. 交付
- 主文件：`<主题>-新中式提案.pptx`
- 预览：Windows 下可选 PowerPoint COM 导出 PNG（脚本 `scripts/export_preview.py`）；无 Office 时直接交 pptx
- 生成脚本与背景图一并给出（用户可复用改文案）

---

## 依赖与安装

```bash
pip install -r requirements.txt   # python-pptx, Pillow
```

- Windows + 已装 PowerPoint：可选运行 `scripts/export_preview.py` 出预览图
- 无 PowerPoint / 无 LibreOffice：跳过预览，交 pptx 即可
- 若环境有生图工具：参考 `prompts/backgrounds.md`；没有就用 `make_bg.py`

## 文件

```
SKILL.md                    本文件
requirements.txt            依赖
scripts/build_deck.py       排版引擎（python-pptx）
scripts/make_bg.py          背景生成（PIL 程序化肌理 / 用户实拍）
scripts/style_from_image.py 参考图风格分析 → style_card.json
scripts/export_preview.py   可选：PowerPoint COM 导出 PNG
prompts/backgrounds.md      外部生图提示词库
```
