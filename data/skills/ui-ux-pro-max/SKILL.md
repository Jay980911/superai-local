---
name: ui-ux-pro-max
display_name: "UI/UX 设计智能引擎"
display_name_en: "UI/UX Pro Max"
description: "对标 nextlevelbuilder 的 UI/UX 设计智能技能：本地化、离线、可审计的设计系统引擎。内置 50+ 真实 UI 风格、161 确定性调色板、57 字体搭配、产品类型推理规则、85 条优先级 UX 指南、25 图表类型、24 落地页模式与 15 技术栈最佳实践，BM25 检索驱动设计系统生成器。"
description_zh: "对标 nextlevelbuilder/ui-ux-pro-max 的本地化 UI/UX 设计智能技能。离线纯标准库，可审计。覆盖 50+ UI 风格、161 调色板、57 字体搭配、产品类型推理、85 UX 指南、25 图表、24 落地页模式、15 技术栈；BM25 检索驱动设计系统生成器（pattern/风格/色彩/字体/效果/反模式/QA）。触发词：UI 设计、UX、设计系统、配色、调色板、字体搭配、风格、落地页、可访问性、前端审美、生成设计系统。"
description_en: "Local, offline, auditable reimplementation of nextlevelbuilder/ui-ux-pro-max design-intelligence skill. A methodology engine (pure stdlib, no network) that helps agents reason about UI/UX instead of guessing. Ships 50+ curated UI styles with full CSS specs, 161 deterministically-generated color palettes with WCAG contrast, 57 Google Font pairings, product-type reasoning rules, 85 priority-ranked UX guidelines (P0/P1/P2), 25 chart types, 24 landing-page patterns, and 15 stack best practices. A BM25 Design System Generator maps a product description to a complete system: page pattern, style, color tokens, typography, key effects, anti-patterns, and a pre-delivery QA checklist. Includes a lightweight code auditor. Use for plan/build/create/design/review/improve of websites, landing pages, dashboards, SaaS, e-commerce, mobile, and components across React/Next.js/Vue/Svelte/SwiftUI/RN/Flutter/Tailwind/shadcn/HTML."
category: design
version: 1.0.0
author: nextlevelbuilder-reimpl
tags:
  - ui
  - ux
  - design-system
  - color-palette
  - typography
  - frontend
  - accessibility
  - landing-page
  - bm25
---

# UI/UX Pro Max — 本地化设计智能引擎

> 对标 `nextlevelbuilder/ui-ux-pro-max-skill`。定位：**离线、纯标准库、可审计的设计方法论引擎**，
> 让 coding agent 在写第一行 UI 代码前，先用搜索数据库「科学」地选设计，而不是随机挑。

## 一、什么时候用

- 用户要「设计 / 美化 / 重构」任意界面：网站、落地页、仪表盘、SaaS、电商、移动 App、组件。
- 需要**配色方案、字体搭配、UI 风格、落地页结构、图表选型、技术栈实践**中的任意一项。
- 要生成一整套**设计系统**（pattern + 风格 + 色彩 token + 字体 + 效果 + 反模式 + QA 清单）。
- 对现有 UI 代码做**轻量可访问性/规范审查**。
- 触发词：UI 设计、UX、设计系统、配色、调色板、字体搭配、风格、落地页、可访问性、前端审美。

## 二、怎么跑

引擎在 `scripts/engine.py`，纯标准库，无需任何第三方依赖：

```bash
python scripts/engine.py generate "landing page for a luxury beauty spa" --stack react --mode light --name SerenityApp
python scripts/engine.py search "fintech banking" --dim product
python scripts/engine.py palettes --mode dark --limit 10
python scripts/engine.py styles glassmorphism
python scripts/engine.py fonts
python scripts/engine.py products saas
python scripts/engine.py guidelines accessibility
python scripts/engine.py charts trend
python scripts/engine.py patterns
python scripts/engine.py stacks nextjs
python scripts/engine.py audit path/to/Component.tsx --stack react
python scripts/engine.py demo
```

## 三、命令速查

| 命令 | 作用 |
|---|---|
| `generate <描述>` | 设计系统生成器：产品匹配 → 风格/调色板/字体推导 → 7 段式系统 |
| `search <查询> [--dim]` | BM25 跨维度检索（style/product/palette/font/chart/pattern/guideline） |
| `styles [查询]` | 浏览 50+ UI 风格库 |
| `palettes [查询] [--mode]` | 浏览 161 确定性调色板（含真实 hex 与对比度） |
| `fonts [查询]` | 浏览 57 组 Google Fonts 搭配 |
| `products [查询]` | 浏览产品类型推理规则（pattern/风格/配色/字体/反模式） |
| `guidelines [类别]` | 浏览 85 条优先级 UX 指南（P0/P1/P2） |
| `charts [查询]` | 浏览 25 种图表类型与适用场景 |
| `patterns [查询]` | 浏览 24 种落地页结构模式 |
| `stacks [名称]` | 浏览 15 个技术栈最佳实践 |
| `audit <文件>` | 启发式代码审查（可访问性/规范粗判） |

## 四、设计系统生成器（旗舰）

`generate` 的推导链完全可解释、可复现：

1. **产品匹配**：BM25 在 30+ 行业推理规则中检索描述，取置信分最高的类别。
2. **风格推导**：取该类别 `style_priority[0]` 的完整规格（关键词 / 适用 / 效果 / 反模式）。
3. **调色板匹配**：解析 `color_mood` → 抽取目标色相（blue→220、green→140、gold→45…）→
   在 161 个调色板中选基础色相最接近者，并自动计算正文对比度。
4. **字体匹配**：解析 `type_mood` → 在 57 组中精确匹配，输出 Google Fonts 引入链接。
5. **组装**：页面结构 → 风格 → 色彩（7 角色 hex + 对比度）→ 字体 → 效果 → 反模式 → P0 交付门禁。

## 五、内置维度库（离线、可审计）

- **50+ UI 风格**：Glassmorphism、Neumorphism、Claymorphism、Brutalism、Neo-Brutalism、
  Minimalism、Flat、Material、Skeuomorphism、Dark Mode、Bento Grid、Aurora、Cyberpunk、
  Vaporwave、Swiss、Bauhaus、Memphis、Retro、Japanese Minimal、Art Deco、Isometric、
  Organic、Editorial、Corporate、Gradient、Soft UI、Typography-Driven、Monochrome、Duotone、
  Tech/HUD、Eco、Luxury、Playful、Data/Dashboard、HIG、Material You、Fluent……（含完整 CSS 变量）
- **161 调色板**：黄金角色相分布，5 种配色方案 × 12 种情绪，确定性 hex，亮/暗双模式。
- **57 字体搭配**：Inter、Space Grotesk、Sora、Fraunces、Playfair、Clash Display、Geist 等。
- **85 UX 指南**：优先级 P0（阻断）/P1（重要）/P2（增强），覆盖无障碍/触控/性能/响应式/色彩/动效。
- **25 图表类型**、**24 落地页模式**、**15 技术栈**（React/Next/Vue/Svelte/SwiftUI/RN/Flutter/Tailwind/shadcn…）。

## 六、铁律与边界（务必遵守）

1. **离线、纯标准库、可审计**：不联网抓取、不下审美终审或合规认证；输出是「推荐起点」。
2. **对比度以真机实测为准**：`generate` 给出的是「文字 vs 背景」单一关系对比度，
   小字/禁用态/叠加层须用 axe 等工具复核。
3. **`audit` 仅启发式粗判**：会漏报（算不出真实对比度）也可能误报；关键无障碍项须人工 + 专用工具复核。
4. **BM25 只认词面重叠**：中英文需分别表达；查询越具体命中越准。
5. **品牌色需人工校正**：算法调色板是色彩关系，不是某品牌的私有资产。
6. **产品类型规则为策展种子集**：覆盖主流行业，长尾子类可能落到相邻类别，须人工确认。

## 七、与同系技能的关系

与 `frontend-design`（Anthropic 设计宪法）、`web-design-guidelines`（149 条 a11y 审计）、
`vercel-react-best-practices`（Next.js 性能）互补，构成「视觉宪法 → 可访问性审计 →
性能规范 → 设计系统选型」的前端质量闭环。
