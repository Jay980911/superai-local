# -*- coding: utf-8 -*-
"""
ui-ux-pro-max :: 设计智能引擎 (scripts/engine.py)
纯标准库实现：BM25 检索 + 设计系统生成器 + 维度浏览 + 轻量代码审查。

用法：
  python engine.py search "fintech banking" [--limit 5] [--dim product]
  python engine.py generate "landing page for a luxury beauty spa" --stack react --mode light --name SerenityApp
  python engine.py styles [query]
  python engine.py palettes [query] [--mode light] [--limit 10]
  python engine.py fonts [query]
  python engine.py products [query]
  python engine.py guidelines [category]
  python engine.py charts [query]
  python engine.py patterns [query]
  python engine.py stacks [name]
  python engine.py audit <file> [--stack react]
  python engine.py demo
"""
import os
import re
import sys
import math
import argparse

# ---- 定位并导入知识库 ----
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
import assets.data as D  # noqa: E402


# ============================================================
# BM25 检索
# ============================================================
_STOP = set("a an the of for and or to in on with is are be by from at as".split())


def _tok(s):
    return [w for w in re.findall(r"[a-z0-9\u4e00-\u9fff]+", (s or "").lower())
            if w not in _STOP]


def _build_index(docs):
    """docs: list of (text, payload). 返回 (corpus_tokens, n, avgdl, df, payloads)。"""
    corpus = []
    payloads = []
    for text, payload in docs:
        corpus.append(_tok(text))
        payloads.append(payload)
    n = len(corpus)
    avgdl = sum(len(t) for t in corpus) / n if n else 0.0
    df = {}
    for t in corpus:
        seen = set(t)
        for w in seen:
            df[w] = df.get(w, 0) + 1
    return corpus, n, avgdl, df, payloads


class BM25:
    k1 = 1.5
    b = 0.75

    def __init__(self, docs):
        self.corpus, self.n, self.avgdl, self.df, self.payloads = _build_index(docs)

    def search(self, query, limit=5):
        q = _tok(query)
        if not q:
            return []
        scores = []
        for i, doc in enumerate(self.corpus):
            score = 0.0
            dl = len(doc)
            freq = {}
            for w in doc:
                freq[w] = freq.get(w, 0) + 1
            for term in q:
                if term not in self.df:
                    continue
                f = freq.get(term, 0)
                if f == 0:
                    continue
                idf = math.log(1 + (self.n - self.df[term] + 0.5) / (self.df[term] + 0.5))
                score += idf * (f * (self.k1 + 1)) / (f + self.k1 * (1 - self.b + self.b * dl / self.avgdl))
            if score > 0:
                scores.append((score, i))
        scores.sort(reverse=True)
        out = []
        for score, i in scores[:limit]:
            out.append((round(score, 3), self.payloads[i]))
        return out


# 预构建各维度索引
def _style_docs():
    docs = []
    for s in D.STYLES:
        text = " ".join([s["name"]] + s["keywords"] + s["best_for"])
        docs.append((text, s))
    return docs


def _product_docs():
    docs = []
    for p in D.PRODUCT_TYPES:
        text = " ".join([p["category"]] + p["keywords"] + p["aliases"] +
                        p["style_priority"] + [p["color_mood"]] + p["type_mood"].split("/"))
        docs.append((text, p))
    return docs


def _palette_docs():
    docs = []
    for p in D.build_palettes():
        text = " ".join([p["name"], p["scheme"], p["mood"]])
        docs.append((text, p))
    return docs


def _font_docs():
    docs = []
    for h, b, mood in D.FONT_PAIRINGS:
        docs.append((" ".join([h, b, mood]), (h, b, mood)))
    return docs


def _chart_docs():
    return [(" ".join([c[0], c[1], c[2]]), c) for c in D.CHART_TYPES]


def _pattern_docs():
    return [(" ".join([p[0], p[1], p[2]]), p) for p in D.LANDING_PATTERNS]


def _guideline_docs():
    return [(" ".join([g[0], g[1], g[2], g[3], g[4]]), g) for g in D.UX_GUIDELINES]


# ============================================================
# 设计系统生成器
# ============================================================
_MOOD_MAP = {
    "trust": "Corporate", "blue": "Corporate", "calm": "Calm", "green": "Organic",
    "premium": "Premium", "luxury": "Premium", "dark": "Cyber", "neon": "Cyber",
    "playful": "Playful", "warm": "Warm", "earth": "Organic", "vibrant": "Vivid",
    "energetic": "Energetic", "soft": "Muted", "pastel": "Muted", "space": "Cool",
    "deep": "Cool", "clinical": "Calm", "elegant": "Premium", "editorial": "Editorial",
    "friendly": "Playful", "tech": "Cool", "ai": "Vivid", "aurora": "Vivid",
}


_HUE_MAP = {
    "blue": 220, "trust": 220, "navy": 225, "sky": 205, "cyan": 190,
    "teal": 175, "green": 140, "eco": 140, "organic": 130, "leaf": 135,
    "mint": 155, "purple": 270, "violet": 265, "indigo": 250,
    "pink": 330, "blush": 340, "magenta": 320, "red": 0, "coral": 10,
    "orange": 30, "amber": 45, "gold": 45, "yellow": 52, "warm": 35,
    "brown": 25, "earth": 30, "cool": 210, "space": 250, "cosmos": 255,
    "neon": 300, "dark": 240, "black": 240, "silver": 210, "gray": 210,
    "calm": 200, "premium": 45, "luxury": 45,
}


def _pick_palette(color_mood, mode="light"):
    palettes = D.build_palettes()
    # 从 color_mood 抽取色相意图
    target_hue = None
    target_mood = None
    low = (color_mood or "").lower()
    for kw, hue in _HUE_MAP.items():
        if kw in low:
            target_hue = hue
            break
    for m in D.MOODS:
        if m.lower() in low:
            target_mood = m
            break
    if target_hue is not None:
        best = None
        best_d = 1e9
        for p in palettes:
            d = min(abs(p["base_hue"] - target_hue),
                    360 - abs(p["base_hue"] - target_hue))
            if target_mood and p["mood"] == target_mood:
                d -= 20  # 情绪命中优先
            if d < best_d:
                best_d = d
                best = p
        if best is not None:
            return best
    # 退而求其次：BM25 名称/情绪匹配
    idx = BM25([(" ".join([p["name"], p["scheme"], p["mood"]]), p) for p in palettes])
    res = idx.search(color_mood, limit=1)
    if res:
        return res[0][1]
    return palettes[0]


def _pick_font(type_mood):
    # type_mood 形如 "Inter / Sora / IBM Plex Sans"
    prefs = [t.strip() for t in type_mood.replace("/", " ").split()]
    for h, b, mood in D.FONT_PAIRINGS:
        if h in prefs or b in prefs:
            return (h, b, mood)
    # 退而求其次：BM25 匹配
    idx = BM25([(" ".join([h, b, mood]), (h, b, mood)) for h, b, mood in D.FONT_PAIRINGS])
    res = idx.search(type_mood, limit=1)
    return res[0][1] if res else D.FONT_PAIRINGS[0]


def _google_fonts_url(heading, body):
    def fmt(name):
        return name.replace(" ", "+")
    return ("https://fonts.googleapis.com/css2?family={h}:wght@400;600;700"
            "&family={b}:wght@400;500&display=swap").format(h=fmt(heading), b=fmt(body))


def generate(description, stack="react", mode="light", name="Project"):
    products = _product_docs()
    best = BM25(products).search(description, limit=1)
    if not best:
        return "# 设计系统生成失败\n未匹配到产品类型，请补充更具体的描述。"
    pt = best[0][1]
    style_name = pt["style_priority"][0]
    style = next((s for s in D.STYLES if s["name"] == style_name), D.STYLES[0])
    palette = _pick_palette(pt["color_mood"], mode)
    font = _pick_font(pt["type_mood"])

    colors = palette[mode] if mode in palette else palette["light"]
    lines = []
    lines.append("# {name} — 设计系统 (Design System)".format(name=name))
    lines.append("")
    lines.append("> 生成依据：BM25 匹配产品类型 **{cat}**（置信分 {score}）"
                 .format(cat=pt["category"], score=best[0][0]))
    lines.append("> 技术栈建议：**{stack}** ｜ 模式：**{mode}**".format(stack=stack, mode=mode))
    lines.append("")
    lines.append("## 1. 页面结构 Pattern")
    lines.append(pt["pattern"])
    lines.append("")
    lines.append("## 2. UI 风格 Style")
    lines.append("- 推荐风格：**{s}**（备选：{alt}）".format(s=style["name"],
             alt="、".join(pt["style_priority"][1:3])))
    lines.append("- 关键词：" + "、".join(style["keywords"]))
    lines.append("- 适用：" + "、".join(style["best_for"]))
    lines.append("- 典型效果：" + "；".join(style["effects"]))
    lines.append("")
    lines.append("## 3. 色彩系统 Colors（调色板 #{pid} · {pn}）".format(
        pid=palette["id"], pn=palette["name"]))
    lines.append("| 角色 | 色值 |")
    lines.append("| --- | --- |")
    for role in ["primary", "secondary", "accent", "bg", "surface", "border", "text"]:
        lines.append("| {r} | `{c}` |".format(r=role, c=colors.get(role, "#000000")))
    # 对比度提示
    c_ratio = D.contrast_ratio(colors.get("text", "#000"), colors.get("bg", "#fff"))
    lines.append("")
    lines.append("- 正文/背景对比度：**{r}:1**（WCAG AA 正文需 >= 4.5）".format(r=c_ratio))
    lines.append("- 配色方案：{sch} ｜ 情绪基调：{mood}".format(sch=palette["scheme"], mood=palette["mood"]))
    lines.append("")
    lines.append("## 4. 字体系统 Typography")
    lines.append("- 标题字体：**{h}** ｜ 正文字体：**{b}** ｜ 调性：{m}".format(
        h=font[0], b=font[1], m=font[2]))
    lines.append("- 引入：")
    lines.append("  ```html")
    lines.append('  <link rel="preconnect" href="https://fonts.googleapis.com">')
    lines.append('  <link href="{u}" rel="stylesheet">'.format(u=_google_fonts_url(font[0], font[1])))
    lines.append("  ```")
    lines.append("")
    lines.append("## 5. 关键效果 Effects")
    lines.append("- " + "；".join(pt["effects"]))
    lines.append("")
    lines.append("## 6. 反模式清单 Anti-Patterns（本行业须规避）")
    for ap in pt["anti_patterns"]:
        lines.append("- ❌ {ap}".format(ap=ap))
    lines.append("")
    lines.append("## 7. 交付前检查清单 Pre-Delivery QA（P0 门禁）")
    p0 = [g for g in D.UX_GUIDELINES if g[2] == "P0"]
    for g in p0[:12]:
        lines.append("- [ ] {id} {rule}".format(id=g[0], rule=g[3]))
    lines.append("")
    lines.append("---")
    lines.append("_本设计为本地方法论推导，非审美终审；落地前请结合真实用户测试与 WCAG 实测。_")
    return "\n".join(lines)


# ============================================================
# 浏览输出
# ============================================================
def _render_styles(query=None):
    items = D.STYLES
    if query:
        items = [s for s in items if query.lower() in " ".join(
            [s["name"]] + s["keywords"]).lower()]
    out = ["# UI 风格库（{n} 种）".format(n=len(items)), ""]
    for s in items:
        out.append("- **{n}** — {kw} ｜ 适用：{bf}".format(
            n=s["name"], kw="、".join(s["keywords"][:3]), bf="、".join(s["best_for"][:2])))
    return "\n".join(out)


def _render_palettes(query=None, mode="light", limit=10):
    pals = D.build_palettes()
    if query:
        res = BM25([(" ".join([p["name"], p["scheme"], p["mood"]]), p) for p in pals]).search(query, limit=limit)
        pals = [r[1] for r in res]
    else:
        pals = pals[:limit]
    out = ["# 调色板（共 161 个，显示 {n}）".format(n=len(pals)), ""]
    for p in pals:
        c = p[mode] if mode in p else p["light"]
        sw = " ".join("■{r}:{v}".format(r=r, v=c[r]) for r in ["primary", "accent", "bg", "text"])
        out.append("- #{id} **{n}** ｜ {sw}".format(id=p["id"], n=p["name"], sw=sw))
    return "\n".join(out)


def _render_fonts(query=None):
    items = D.FONT_PAIRINGS
    if query:
        items = [f for f in items if query.lower() in " ".join(f).lower()]
    out = ["# 字体搭配（{n} 组）".format(n=len(items)), ""]
    for h, b, mood in items:
        out.append("- **{h}** / {b} — {m}".format(h=h, b=b, m=mood))
    return "\n".join(out)


def _render_products(query=None):
    items = D.PRODUCT_TYPES
    if query:
        res = BM25(_product_docs()).search(query, limit=10)
        items = [r[1] for r in res]
    out = ["# 产品类型推理规则（{n} 类）".format(n=len(items)), ""]
    for p in items:
        out.append("- **{c}** — 推荐风格：{sp} ｜ 配色：{cm}".format(
            c=p["category"], sp="、".join(p["style_priority"][:2]), cm=p["color_mood"]))
    return "\n".join(out)


def _render_guidelines(category=None):
    items = D.UX_GUIDELINES
    if category:
        items = [g for g in items if category.lower() in g[1].lower()]
    if not items:
        items = D.UX_GUIDELINES
    out = ["# UX 指南（{n} 条，按优先级）".format(n=len(items)), ""]
    for g in sorted(items, key=lambda x: x[2]):
        out.append("- **{id} [{p}]** {r} _({cat})_".format(id=g[0], p=g[2], r=g[3], cat=g[1]))
    return "\n".join(out)


def _render_charts(query=None):
    items = D.CHART_TYPES
    if query:
        res = BM25(_chart_docs()).search(query, limit=10)
        items = [r[1] for r in res]
    out = ["# 图表类型（{n} 种）".format(n=len(items)), ""]
    for c in items:
        out.append("- **{n}** — 适用：{w} ｜ 避免：{a}".format(n=c[0], w=c[1], a=c[2]))
    return "\n".join(out)


def _render_patterns(query=None):
    items = D.LANDING_PATTERNS
    if query:
        res = BM25(_pattern_docs()).search(query, limit=10)
        items = [r[1] for r in res]
    out = ["# 落地页结构模式（{n} 种）".format(n=len(items)), ""]
    for p in items:
        out.append("- **{n}** — {st} ｜ 适用：{bf}".format(n=p[0], st=p[1], bf=p[2]))
    return "\n".join(out)


def _render_stacks(name=None):
    items = D.STACKS
    if name:
        items = [s for s in items if name.lower() in s[0].lower()]
    out = ["# 技术栈最佳实践（{n} 个）".format(n=len(items)), ""]
    for s in items:
        out.append("- **{n}**".format(n=s[0]))
        for t in s[1]:
            out.append("  - {t}".format(t=t))
    return "\n".join(out)


# ============================================================
# 轻量代码审查（启发式，可审计但可能漏报/误报）
# ============================================================
def audit(path, stack="react"):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            src = fh.read()
    except OSError as e:
        return "无法读取文件：{e}".format(e=e)
    lines = src.splitlines()
    findings = []

    def add(ln, rule, detail):
        findings.append((ln, rule, detail))

    for i, line in enumerate(lines, 1):
        low = line.lower()
        if "<html" in low and "lang=" not in low:
            add(i, "UX-010", "html 缺少 lang 属性")
        if "<img" in low and "alt=" not in low:
            add(i, "UX-009", "img 缺少 alt 属性")
        if "<button" in low and "aria-label=" not in low and ">" in low:
            # 仅当按钮内无可见文本近似判断（粗判）
            if re.search(r"<button[^>]*>\s*</button>", low) or "<button" in low and ">" in low and not re.search(r">[^<\s]", low):
                pass  # 保守，不误报有文本的按钮
        if "role=\"button\"" in low and "tabindex" not in low:
            add(i, "UX-004", "role=button 但缺少 tabindex（无键盘可达）")
        if "outline:none" in low or "outline: none" in low:
            if "focus" not in low:
                add(i, "UX-005", "outline:none 且未提供替代焦点样式")
        if "transition: all" in low or "transition:all" in low:
            add(i, "UX-065", "transition: all 可能触发布局重排（建议指定属性）")
        if "maximum-scale=1" in low or "user-scalable=no" in low:
            add(i, "UX-014", "禁用缩放，违反可访问性")
        if "<table" in low and "<th" not in low:
            add(i, "UX-010", "table 缺少 th 表头")
        if "onclick" in low and "onkeydown" not in low and "onkeypress" not in low:
            add(i, "UX-004", "onclick 缺少键盘等价处理（粗判）")
        if "!important" in low:
            add(i, "UX-071", "使用 !important，破坏设计令牌单一来源")

    if not findings:
        return ("# 代码审查（{stack}）\n\n零命中启发式检查。"
                "注意：启发式可能漏报，关键项（对比度/语义）需人工与 WCAG 工具复核。".format(stack=stack))
    out = ["# 代码审查（{stack}）— {n} 项发现".format(stack=stack, n=len(findings)), ""]
    for ln, rule, detail in findings:
        out.append("- 第 {ln} 行  **{rule}** {d}".format(ln=ln, rule=rule, d=detail))
    out.append("")
    out.append("_启发式扫描：可能误报/漏报；对比度、真实语义与动效安全请用专用无障碍工具实测。_")
    return "\n".join(out)


# ============================================================
# demo
# ============================================================
def demo():
    out = []
    out.append(generate("landing page for a luxury beauty spa", "react", "light", "SerenityApp"))
    out.append("\n\n----- 检索示例：fintech -----\n")
    res = BM25(_product_docs()).search("fintech banking payment", limit=3)
    for score, p in res:
        out.append("- [{s}] {c}".format(s=score, c=p["category"]))
    out.append("\n----- 调色板前 5 -----\n")
    out.append(_render_palettes(limit=5))
    return "\n".join(out)


# ============================================================
# CLI
# ============================================================
def main(argv=None):
    ap = argparse.ArgumentParser(prog="ui-ux-pro-max", description="UI/UX 设计智能引擎")
    sub = ap.add_subparsers(dest="cmd")

    p_search = sub.add_parser("search")
    p_search.add_argument("query")
    p_search.add_argument("--limit", type=int, default=5)
    p_search.add_argument("--dim", default="all")

    p_gen = sub.add_parser("generate")
    p_gen.add_argument("description")
    p_gen.add_argument("--stack", default="react")
    p_gen.add_argument("--mode", default="light")
    p_gen.add_argument("--name", default="Project")

    p_styles = sub.add_parser("styles")
    p_styles.add_argument("query", nargs="?")

    p_pal = sub.add_parser("palettes")
    p_pal.add_argument("query", nargs="?")
    p_pal.add_argument("--mode", default="light")
    p_pal.add_argument("--limit", type=int, default=10)

    p_fonts = sub.add_parser("fonts")
    p_fonts.add_argument("query", nargs="?")

    p_prod = sub.add_parser("products")
    p_prod.add_argument("query", nargs="?")

    p_guide = sub.add_parser("guidelines")
    p_guide.add_argument("category", nargs="?")

    p_charts = sub.add_parser("charts")
    p_charts.add_argument("query", nargs="?")

    p_pat = sub.add_parser("patterns")
    p_pat.add_argument("query", nargs="?")

    p_stack = sub.add_parser("stacks")
    p_stack.add_argument("name", nargs="?")

    p_audit = sub.add_parser("audit")
    p_audit.add_argument("path")
    p_audit.add_argument("--stack", default="react")

    sub.add_parser("demo")

    args = ap.parse_args(argv)
    cmd = args.cmd

    if cmd == "search":
        dims = {"style": _style_docs(), "product": _product_docs(),
                "palette": _palette_docs(), "font": _font_docs(),
                "chart": _chart_docs(), "pattern": _pattern_docs(),
                "guideline": _guideline_docs()}
        if args.dim == "all":
            targets = [(k, v) for k, v in dims.items()]
        else:
            targets = [(args.dim, dims.get(args.dim, []))]
        out = ["# 检索：{q}".format(q=args.query), ""]
        for dim, docs in targets:
            idx = BM25(docs)
            res = idx.search(args.query, limit=args.limit)
            out.append("## 维度：{d}（{n} 命中）".format(d=dim, n=len(res)))
            for score, payload in res:
                label = payload.get("name") if isinstance(payload, dict) else str(payload)[:80]
                out.append("- [{s}] {l}".format(s=score, l=label))
            out.append("")
        print("\n".join(out))
    elif cmd == "generate":
        print(generate(args.description, args.stack, args.mode, args.name))
    elif cmd == "styles":
        print(_render_styles(args.query))
    elif cmd == "palettes":
        print(_render_palettes(args.query, args.mode, args.limit))
    elif cmd == "fonts":
        print(_render_fonts(args.query))
    elif cmd == "products":
        print(_render_products(args.query))
    elif cmd == "guidelines":
        print(_render_guidelines(args.category))
    elif cmd == "charts":
        print(_render_charts(args.query))
    elif cmd == "patterns":
        print(_render_patterns(args.query))
    elif cmd == "stacks":
        print(_render_stacks(args.name))
    elif cmd == "audit":
        print(audit(args.path, args.stack))
    elif cmd == "demo":
        print(demo())
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
