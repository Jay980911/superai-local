# UI/UX Pro Max — 实跑示例 (examples_cases.md)

> 以下均由 `scripts/engine.py` 真实运行产出，非示意。


---
## 1. generate：豪华美容 SPA 落地页（light / react）

```markdown
# SerenityApp — 设计系统 (Design System)

> 生成依据：BM25 匹配产品类型 **Beauty / Spa / Wellness**（置信分 12.681）
> 技术栈建议：**react** ｜ 模式：**light**

## 1. 页面结构 Pattern
Lifestyle hero -> rituals/products -> testimonials -> booking CTA

## 2. UI 风格 Style
- 推荐风格：**Botanical**（备选：Luxury / Premium、Soft UI / Pastel）
- 关键词：botanical、leaf、cream green、organic
- 适用：wellness、skincare、tea、eco
- 典型效果：botanical illustration；cream+green；soft organic shapes

## 3. 色彩系统 Colors（调色板 #57 · Cool Complementary 057）
| 角色 | 色值 |
| --- | --- |
| primary | `#40B568` |
| secondary | `#C559A0` |
| accent | `#2BD465` |
| bg | `#F6F9F7` |
| surface | `#FFFFFF` |
| border | `#D7EADD` |
| text | `#16181D` |

- 正文/背景对比度：**16.75:1**（WCAG AA 正文需 >= 4.5）
- 配色方案：complementary ｜ 情绪基调：Cool

## 4. 字体系统 Typography
- 标题字体：**Fraunces** ｜ 正文字体：**Inter** ｜ 调性：luxury-serif
- 引入：
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  ```

## 5. 关键效果 Effects
- botanical illustration；soft organic shapes；serif display

## 6. 反模式清单 Anti-Patterns（本行业须规避）
- ❌ clinical coldness
- ❌ hard neon
- ❌ cluttered promo

## 7. 交付前检查清单 Pre-Delivery QA（P0 门禁）
- [ ] UX-001 All interactive elements need an accessible name (aria-label/visible text)
- [ ] UX-002 Color contrast >= 4.5:1 for body text, >= 3:1 for large text/UI
- [ ] UX-003 Never rely on color alone to convey meaning
- [ ] UX-004 All functionality available via keyboard
- [ ] UX-005 Visible focus indicator on every focusable element
- [ ] UX-013 Primary action reachable by thumb in single-hand reach
- [ ] UX-017 Largest Contentful Paint < 2.5s on mid-range mobile
- [ ] UX-018 No layout shift (CLS < 0.1) from late images/fonts
- [ ] UX-023 Mobile-first; fluid layout 320px -> desktop
- [ ] UX-024 Tap targets not overlapping; no horizontal scroll
- [ ] UX-028 One primary CTA per screen, visually dominant
- [ ] UX-033 Body text >= 16px on mobile

---
_本设计为本地方法论推导，非审美终审；落地前请结合真实用户测试与 WCAG 实测。_
```

---
## 2. generate：金融科技银行 App（dark / nextjs）

```markdown
# PayFlow — 设计系统 (Design System)

> 生成依据：BM25 匹配产品类型 **Fintech / Banking**（置信分 8.637）
> 技术栈建议：**nextjs** ｜ 模式：**dark**

## 1. 页面结构 Pattern
Trust-first: hero trust badges -> value prop -> security -> product -> CTA

## 2. UI 风格 Style
- 推荐风格：**Fintech / Trust**（备选：Corporate / Enterprise、Minimalism）
- 关键词：fintech、trust、green/blue、secure
- 适用：banking、payments、investing、crypto
- 典型效果：trust blue；clear P/L colors；secure badges

## 3. 色彩系统 Colors（调色板 #157 · Calm Complementary 157）
| 角色 | 色值 |
| --- | --- |
| primary | `#759CC7` |
| secondary | `#CDAA84` |
| accent | `#337CCC` |
| bg | `#12171C` |
| surface | `#1B232C` |
| border | `#2C3C4E` |
| text | `#EDEFF3` |

- 正文/背景对比度：**15.66:1**（WCAG AA 正文需 >= 4.5）
- 配色方案：complementary ｜ 情绪基调：Calm

## 4. 字体系统 Typography
- 标题字体：**Inter** ｜ 正文字体：**Inter** ｜ 调性：neutral-modern
- 引入：
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  ```

## 5. 关键效果 Effects
- secure badges；clear P/L colors；subtle elevation

## 6. 反模式清单 Anti-Patterns（本行业须规避）
- ❌ AI purple/pink gradients
- ❌ gamified risk
- ❌ neon speculation vibe

## 7. 交付前检查清单 Pre-Delivery QA（P0 门禁）
- [ ] UX-001 All interactive elements need an accessible name (aria-label/visible text)
- [ ] UX-002 Color contrast >= 4.5:1 for body text, >= 3:1 for large text/UI
- [ ] UX-003 Never rely on color alone to convey meaning
- [ ] UX-004 All functionality available via keyboard
- [ ] UX-005 Visible focus indicator on every focusable element
- [ ] UX-013 Primary action reachable by thumb in single-hand reach
- [ ] UX-017 Largest Contentful Paint < 2.5s on mid-range mobile
- [ ] UX-018 No layout shift (CLS < 0.1) from late images/fonts
- [ ] UX-023 Mobile-first; fluid layout 320px -> desktop
- [ ] UX-024 Tap targets not overlapping; no horizontal scroll
- [ ] UX-028 One primary CTA per screen, visually dominant
- [ ] UX-033 Body text >= 16px on mobile

---
_本设计为本地方法论推导，非审美终审；落地前请结合真实用户测试与 WCAG 实测。_
```

---
## 3. search：fintech banking（跨维度）

```
- [9.945] Fintech / Banking
- [2.596] Finance / Insurance
- [2.28] AI / ML Product
```

---
## 4. palettes：前 5 个（light）

```markdown
# 调色板（共 161 个，显示 5）

- #1 **Calm Analogous 001** ｜ ■primary:#A74444 ■accent:#CC3333 ■bg:#F9F6F6 ■text:#16181D
- #2 **Vivid Complementary 002** ｜ ■primary:#22D356 ■accent:#0DF250 ■bg:#F6F9F7 ■text:#16181D
- #3 **Premium Triadic 003** ｜ ■primary:#724294 ■accent:#8B38C7 ■bg:#F8F6F9 ■text:#16181D
- #4 **Playful Monochromatic 004** ｜ ■primary:#D0BB25 ■accent:#F0D40F ■bg:#F9F8F6 ■text:#16181D
- #5 **Corporate Split Complementary 005** ｜ ■primary:#3DA3B8 ■accent:#29B9D6 ■bg:#F6F8F9 ■text:#16181D
```

---
## 5. products：SaaS 匹配

```markdown
# 产品类型推理规则（1 类）

- **SaaS / B2B** — 推荐风格：Minimalism、Bento Grid ｜ 配色：one brand accent + neutral grays
```

---
## 6. guidelines：accessibility 类前 5

```
- UX-001 [P0] All interactive elements need an accessible name (aria-label/visible text)
- UX-002 [P0] Color contrast >= 4.5:1 for body text, >= 3:1 for large text/UI
- UX-003 [P0] Never rely on color alone to convey meaning
- UX-004 [P0] All functionality available via keyboard
- UX-005 [P0] Visible focus indicator on every focusable element
```

---
## 7. audit：坏样本审查

```markdown
# 代码审查（react）— 6 项发现

- 第 1 行  **UX-010** html 缺少 lang 属性
- 第 4 行  **UX-009** img 缺少 alt 属性
- 第 5 行  **UX-004** role=button 但缺少 tabindex（无键盘可达）
- 第 5 行  **UX-004** onclick 缺少键盘等价处理（粗判）
- 第 6 行  **UX-005** outline:none 且未提供替代焦点样式
- 第 8 行  **UX-010** table 缺少 th 表头

_启发式扫描：可能误报/漏报；对比度、真实语义与动效安全请用专用无障碍工具实测。_
```

---
## 8. 数据集规模自检

```
STYLES        : 59
PALETTES      : 161
FONT_PAIRINGS : 63
PRODUCT_TYPES : 30
UX_GUIDELINES : 85
CHART_TYPES   : 25
LANDING_PATNS : 24
STACKS        : 15
```