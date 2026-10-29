# -*- coding: utf-8 -*-
"""xiaozhou-ppt · 设计合成器（原创能力的“大脑”）

把一段文字 brief 原创成：
  1) 一个 StyleSpec（颜色 / 字体 / 组件标签）
  2) 一份页面规划 page_plan（用哪些版式、每页讲什么）
  3) 一份配图需求 image_needs（背景图 needs + 主体图 subjects）

用法（库）：
    from design_synth import synthesize
    out = synthesize({
        "topic": "泡泡玛特",
        "vibe": "潮玩展览册",
        "colors": ["#F7F3EE","#F4A8C4","#E94752","#64C9D4"],
        "elements": ["大幅IP图","圆角卡片","贴纸标签","IP矩阵","海外地图"],
        "mood": "年轻鲜明/有收藏感/不过度幼稚",
    }, out_dir="workspace/xxx")
    # out = {"style": {...}, "plan": [...], "image_needs": {...}}

用法（CLI）：
    python design_synth.py --brief brief.json --out workspace/xxx

原则：**规则优先，有 LLM 则增强**。
  - 默认走内置 VIBE_LIBRARY / PALETTE_LIBRARY 的确定性映射，完全离线可用；
  - 若运行时检测到宿主 LLM 钩子（环境变量 $SUPERAI_LLM 指向可执行脚本），
    则把 draft 交给它做一次增强（色彩和谐、补充页面、丰富配图提示词），
    失败自动回退到规则结果，绝不阻断主流程。
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from style_spec import load_style, StyleSpec


# ---------------------------------------------------------------------------
# 规则库：氛围 -> 视觉配方
# ---------------------------------------------------------------------------
# 每条：palette 顺序 = [bg/cream, 主强调, 次强调, 深墨]; fonts; tags; darken;
#       bg_theme = 背景图回退用的 make_bg 主题; img = 主体图风格提示词基调
VIBE_LIBRARY = {
    "candy": dict(
        keys=["潮玩", "盲盒", "玩具", "pop", "candy", "甜", "可爱", "卡通",
              "展览册", "收藏", "泡泡", "娃娃"],
        palette=["#F7F3EE", "#F4A8C4", "#E94752", "#64C9D4"],
        ink="#332E2B", fonts=("Microsoft YaHei", "Microsoft YaHei", "Microsoft YaHei", "Arial"),
        tags=("rounded_card", "sticker", "hero", "chip", "matrix", "map", "timeline", "chart", "loop"),
        darken=0.12, bg_theme="arcs",
        img="3D rendered designer vinyl blind-box art toy, pastel cream and bubble-pink background, cute but edgy character, clean product photography, no text, no logo",
    ),
    "guofeng": dict(
        keys=["国风", "新中式", "古风", "东方", "水墨", "禅", "茶", "归然", "山"],
        palette=["#F3ECdc", "#A63A2A", "#B08D57", "#9A825E"],
        ink="#1A140E", fonts=("STXingkai", "KaiTi", "SimSun", "Times New Roman"),
        tags=("seal", "hairline", "vline", "quote"),
        darken=0.32, bg_theme="ink-mountain",
        img="misty ink-wash mountain, quiet luxury editorial, muted earth tone, no text",
    ),
    "tech": dict(
        keys=["科技", "未来", "极客", "ai", "数字", "智能", "数据", "赛博"],
        palette=["#0B1020", "#4F8CFF", "#36E0C8", "#9DB4D8"],
        ink="#EAF2FF", fonts=("Aptos Display", "Microsoft YaHei", "Microsoft YaHei", "Aptos"),
        tags=("rounded_card", "chip", "grid", "chart", "loop", "timeline"),
        darken=0.28, bg_theme="grid",
        img="futuristic abstract tech visualization, deep blue glow, clean geometric, no text",
    ),
    "food": dict(
        keys=["美食", "餐饮", "茶饮", "咖啡", "烘焙", "餐厅", "味觉"],
        palette=["#FBF3E6", "#E8924A", "#7BA05B", "#C0392B"],
        ink="#3A2A1E", fonts=("Microsoft YaHei", "Microsoft YaHei", "Microsoft YaHei", "Georgia"),
        tags=("rounded_card", "sticker", "chip", "hero"),
        darken=0.16, bg_theme="paper",
        img="warm food photography, soft daylight, appetizing, no text",
    ),
    "minimal": dict(
        keys=["极简", "简约", "modern", "干净", "留白"],
        palette=["#F5F7FA", "#3B82F6", "#64C9D4", "#6B788C"],
        ink="#121A2A", fonts=("Aptos Display", "Aptos", "Microsoft YaHei", "Aptos"),
        tags=("rounded_card", "chip", "grid"),
        darken=0.20, bg_theme="lattice",
        img="minimalist soft gradient background, airy, no text",
    ),
    "business": dict(
        keys=["商务", "汇报", "品牌", "企业", "战略", "咨询"],
        palette=["#F4F1EA", "#9A702F", "#3B6EA5", "#707A85"],
        ink="#18222D", fonts=("Georgia", "Microsoft YaHei", "SimSun", "Arial"),
        tags=("rounded_card", "chip", "hairline"),
        darken=0.30, bg_theme="paper",
        img="corporate abstract background, deep blue and gold, professional, no text",
    ),
}

# 命名调色板（brief 用 "palette":"ocean" 之类引用）
PALETTE_LIBRARY = {
    "cream-pink": ["#F7F3EE", "#F4A8C4", "#E94752", "#64C9D4"],
    "ocean": ["#0B1020", "#4F8CFF", "#36E0C8", "#9DB4D8"],
    "earth": ["#1A140E", "#A63A2A", "#B08D57", "#9A825E"],
    "forest": ["#F2F6EE", "#7BA05B", "#E8924A", "#3C5A3C"],
    "mono": ["#F5F5F5", "#222222", "#888888", "#CCCCCC"],
}


def _match_vibe(vibe):
    v = (vibe or "").lower()
    best, best_score = "minimal", 0
    for name, lib in VIBE_LIBRARY.items():
        score = sum(1 for k in lib["keys"] if k.lower() in v)
        if score > best_score:
            best, best_score = name, score
    return VIBE_LIBRARY[best], best


def resolve_colors(brief, lib):
    """brief.colors 优先；否则用 vibe 默认调色板；支持引用命名调色板。"""
    colors = brief.get("colors")
    if isinstance(colors, str):
        colors = PALETTE_LIBRARY.get(colors.lower())
    if isinstance(colors, list) and len(colors) >= 3:
        # 规整为 4 色：[cream, accent, accent2, ink?]
        cream, accent, accent2 = colors[0], colors[1], colors[2]
        ink = colors[3] if len(colors) >= 4 else lib["ink"]
        return cream, accent, accent2, ink
    pal = lib["palette"]
    return pal[0], pal[1], pal[2], lib["ink"]


def resolve_fonts(brief, lib):
    f = brief.get("fonts")
    if isinstance(f, list) and len(f) >= 2:
        t, b = f[0], f[1]
        return (t, b, f[2] if len(f) > 2 else b, f[3] if len(f) > 3 else "Arial")
    return lib["fonts"]


def build_spec(brief):
    """规则映射：brief -> StyleSpec dict。"""
    lib, vibe_name = _match_vibe(brief.get("vibe"))
    cream, accent, accent2, ink = resolve_colors(brief, lib)
    t, b, sec, eng = resolve_fonts(brief, lib)
    # 依据元素关键词补标签
    tags = set(lib["tags"])
    elem = " ".join(brief.get("elements") or [])
    if "圆角" in elem or "卡片" in elem:
        tags.add("rounded_card")
    if "贴纸" in elem or "标签" in elem:
        tags.add("sticker")
    if "IP" in elem or "矩阵" in elem:
        tags.add("matrix")
    if "地图" in elem or "海外" in elem:
        tags.add("map")
    if "时间轴" in elem or "历程" in elem or "发展" in elem:
        tags.add("timeline")
    if "图表" in elem or "数据" in elem or "画像" in elem:
        tags.add("chart")
    if "闭环" in elem or "模式" in elem or "循环" in elem:
        tags.add("loop")
    if "大图" in elem or "角色" in elem:
        tags.add("hero")
    spec = dict(
        name=brief.get("vibe") or vibe_name,
        vibe=brief.get("vibe") or vibe_name,
        mood="light" if lib["darken"] < 0.25 else "dark",
        layout="playful" if vibe_name in ("candy",) else "grid",
        ink=ink, cream=cream, sand=accent2, gold=accent, muted="#9A825E",
        seal=accent, white="#FFFFFF", accent=accent, accent2=accent2,
        card_fill=cream if vibe_name == "candy" else "#E6DDCA",
        card_line="rgba(0,0,0,0.08)" if vibe_name == "candy" else "#D4C6AC",
        title_font=t, body_font=b, secondary_font=sec, english_font=eng,
        title_size=60, content_title_size=42, body_size=15,
        darken=lib["darken"],
        tags=tuple(tags),
    )
    return spec, lib


def build_page_plan(brief, spec, lib):
    """基于标签生成一份“品牌/主题分析”通用页面规划。宿主可后续覆盖。"""
    tags = set(spec["tags"])
    topic = brief.get("topic", "主题")
    plan = [
        {"page": "cover", "type": "cover", "title": topic, "subtitle": brief.get("vibe", "")},
        {"page": "toc", "type": "toc", "items": ["品牌发展", "核心 IP", "重点 IP", "机制", "用户画像", "渠道布局", "海外市场", "商业模式"]},
    ]
    if "timeline" in tags:
        plan.append({"page": "timeline", "type": "timeline", "title": "品牌发展历程", "items": []})
    if "matrix" in tags:
        plan.append({"page": "matrix", "type": "matrix", "title": f"{topic} 核心 IP 矩阵", "cells": []})
    if "hero" in tags:
        plan.append({"page": "hero_focus", "type": "hero_focus", "title": "明星 IP 聚焦", "items": []})
    if "loop" in tags:
        plan.append({"page": "mechanism", "type": "mechanism", "title": "核心机制", "items": []})
    if "chart" in tags:
        plan.append({"page": "chart", "type": "chart", "title": "用户画像与数据", "items": []})
    plan.append({"page": "channel", "type": "grid", "title": "渠道布局", "items": []})
    if "map" in tags:
        plan.append({"page": "map", "type": "map", "title": "海外市场", "points": []})
    if "loop" in tags:
        plan.append({"page": "loop", "type": "loop", "title": "商业模式闭环", "items": []})
    plan.append({"page": "closing", "type": "closing", "title": topic})
    return plan


def build_image_needs(brief, plan, spec, lib):
    """生成背景图 needs（兼容 prepare_backgrounds）+ 主体图 subjects。"""
    needs = []
    subjects = []
    for p in plan:
        role = "hero" if p["type"] in ("cover", "hero_focus") else "content"
        needs.append({"page": p["page"], "theme": lib["bg_theme"], "role": role})
        if p["type"] in ("hero_focus", "matrix"):
            subjects.append({
                "key": p["page"] + "_subject",
                "role": p["type"],
                "prompt": lib["img"] + (f", themed for {brief.get('topic','')}" if brief.get("topic") else ""),
            })
    # 风格卡：供 prepare_backgrounds 用 prompt_hints
    style_card = {
        "palette": [spec["cream"], spec["accent"], spec["accent2"], spec["ink"]],
        "mood": "light" if spec["darken"] < 0.25 else "dark",
        "theme_hint": lib["bg_theme"],
        "prompt_hints": lib["img"],
        "brightness": 0.7 if spec["darken"] < 0.25 else 0.4,
        "saturation": 0.5,
        "contrast": 0.5,
    }
    return {"needs": needs, "subjects": subjects, "style_card": style_card}


# ---------------------------------------------------------------------------
# 可选 LLM 增强（有钩子才用，失败静默回退）
# ---------------------------------------------------------------------------
def _llm_enrich(brief, draft):
    script = os.environ.get("SUPERAI_LLM")
    if not script or not Path(script).exists():
        return draft
    node = os.environ.get("SUPERAI_NODE") or shutil_which("node") or shutil_which("node.exe")
    if not node:
        return draft
    try:
        payload = json.dumps({"task": "design_synth_enrich", "brief": brief, "draft": draft},
                             ensure_ascii=False)
        r = subprocess.run([node, script], input=payload, capture_output=True, text=True, timeout=120)
        if r.returncode == 0 and r.stdout.strip():
            out = json.loads(r.stdout)
            if isinstance(out, dict):
                return out
    except Exception:
        pass
    return draft


def shutil_which(name):
    from shutil import which
    return which(name)


# ---------------------------------------------------------------------------
# 对外主入口
# ---------------------------------------------------------------------------
def synthesize(brief, out_dir=None):
    """brief -> {style, plan, image_needs}；若给 out_dir 则落盘 style_card.json / plan.json / needs.json。"""
    spec_dict, lib = build_spec(brief)
    plan = build_page_plan(brief, spec_dict, lib)
    image_needs = build_image_needs(brief, plan, spec_dict, lib)

    draft = {"style": spec_dict, "plan": plan, "image_needs": image_needs}
    # 可选增强
    enriched = _llm_enrich(brief, draft)
    style = enriched.get("style", spec_dict)
    plan = enriched.get("plan", plan)
    image_needs = enriched.get("image_needs", image_needs)

    result = {
        "style": style,
        "plan": plan,
        "image_needs": image_needs,
        "spec": load_style(style).to_dict(),
    }
    if out_dir:
        d = Path(out_dir)
        d.mkdir(parents=True, exist_ok=True)
        (d / "style_card.json").write_text(json.dumps(image_needs["style_card"], ensure_ascii=False, indent=2), encoding="utf-8")
        (d / "plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        (d / "needs.json").write_text(json.dumps(image_needs["needs"], ensure_ascii=False, indent=2), encoding="utf-8")
        (d / "subjects.json").write_text(json.dumps(image_needs["subjects"], ensure_ascii=False, indent=2), encoding="utf-8")
        (d / "design_synth_result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True, help="brief.json 路径，含 topic/vibe/colors/elements/mood")
    ap.add_argument("--out", default=None, help="输出目录（落盘 style_card/plan/needs/subjects）")
    args = ap.parse_args()
    brief = json.loads(Path(args.brief).read_text(encoding="utf-8"))
    res = synthesize(brief, args.out)
    print(json.dumps({"style_name": res["style"].get("name"),
                      "pages": [p["type"] for p in res["plan"]],
                      "subjects": len(res["image_needs"]["subjects"])},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
