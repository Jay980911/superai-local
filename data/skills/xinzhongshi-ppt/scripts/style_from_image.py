# -*- coding: utf-8 -*-
"""xinzhongshi-ppt · 从用户参考图提取风格卡（独立，仅依赖 Pillow）

用途：用户上传一张/多张「我想要这种感觉」的图（海报、截图、照片、
小红书笔记图…），本脚本自动扒出色板与明暗，指导后续背景生成。

输出 style_card.json:
{
  "palette": ["#1a140e", "#c4a574", ...],   # 主色 hex
  "brightness": 0.42,                       # 0~1，偏暗/偏亮
  "saturation": 0.31,                       # 0~1
  "contrast": 0.55,
  "mood": "dark",                           # dark / mid / light
  "theme_hint": "ink-mountain",             # 最接近的程序化主题
  "prompt_hints": "warm golden brown, deep coffee shadows, ..."
}

用法:
  python style_from_image.py a.jpg b.png --out style_card.json
  python style_from_image.py a.jpg --apply-bg --out-dir bg-out --count 6
"""
import argparse
import colorsys
import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageEnhance, ImageStat

# 主题 → 色相/明度画像（粗匹配用）
THEME_PROFILE = {
    "dunes":        {"hue": (25, 50),  "sat": (0.15, 0.55), "val": (0.25, 0.90)},
    "snowmount":    {"hue": (190, 240),"sat": (0.02, 0.25), "val": (0.35, 0.95)},
    "lake":         {"hue": (150, 220),"sat": (0.05, 0.35), "val": (0.30, 0.90)},
    "bamboo":       {"hue": (60, 150), "sat": (0.10, 0.45), "val": (0.15, 0.80)},
    "pine-stone":   {"hue": (70, 150), "sat": (0.05, 0.35), "val": (0.10, 0.70)},
    "mist":         {"hue": (0, 360),  "sat": (0.00, 0.15), "val": (0.45, 0.95)},
    "pavilion":     {"hue": (20, 50),  "sat": (0.20, 0.65), "val": (0.15, 0.85)},
    "eave":         {"hue": (180, 260),"sat": (0.05, 0.30), "val": (0.10, 0.75)},
    "garden-moon":  {"hue": (60, 160), "sat": (0.05, 0.35), "val": (0.25, 0.85)},
    "bridge":       {"hue": (0, 360),  "sat": (0.02, 0.25), "val": (0.30, 0.92)},
    "grotto":       {"hue": (15, 55),  "sat": (0.15, 0.55), "val": (0.10, 0.70)},
    "ink-mountain": {"hue": (0, 360),  "sat": (0.00, 0.18), "val": (0.20, 0.92)},
    "ink-wash":     {"hue": (0, 360),  "sat": (0.00, 0.22), "val": (0.35, 0.95)},
    "bamboo-ink":   {"hue": (70, 150), "sat": (0.05, 0.35), "val": (0.15, 0.85)},
    "plum":         {"hue": (330, 25), "sat": (0.10, 0.50), "val": (0.20, 0.85)},
    "lotus":        {"hue": (0, 360),  "sat": (0.00, 0.25), "val": (0.25, 0.90)},
    "ink-cloud":    {"hue": (0, 360),  "sat": (0.00, 0.15), "val": (0.15, 0.90)},
    "scholar":      {"hue": (0, 360),  "sat": (0.00, 0.20), "val": (0.15, 0.90)},
    "bronze":       {"hue": (30, 80),  "sat": (0.15, 0.55), "val": (0.08, 0.65)},
    "celadon":      {"hue": (100, 180),"sat": (0.05, 0.35), "val": (0.35, 0.90)},
    "manuscript":   {"hue": (30, 55),  "sat": (0.08, 0.40), "val": (0.55, 0.95)},
    "stele":        {"hue": (0, 360),  "sat": (0.00, 0.12), "val": (0.10, 0.85)},
}

PROMPT_HINTS = {
    "warm": "warm golden brown and deep coffee shadows",
    "cool": "cool grey-blue and stone tones",
    "ink": "ink wash, near-monochrome, rice paper cream",
    "dark": "deep umber and charcoal, cinematic low-key light",
    "light": "soft daylight, pale cream and taupe, airy",
    "green": "moss green and bamboo tones",
    "gold": "aged gold and sand highlights",
}


def dominant_colors(img, n=6):
    small = img.copy()
    small.thumbnail((160, 160))
    pixels = list(small.convert("RGB").getdata())
    # 量化到 16 级减少噪点
    q = [(r // 16 * 16, g // 16 * 16, b // 16 * 16) for r, g, b in pixels]
    cnt = Counter(q)
    out = []
    for (r, g, b), c in cnt.most_common(n * 3):
        # 与已选颜色拉开距离
        ok = True
        for (rr, gg, bb) in out:
            if abs(r - rr) + abs(g - gg) + abs(b - bb) < 60:
                ok = False
                break
        if ok:
            out.append((r, g, b))
        if len(out) >= n:
            break
    return out


def rgb_to_hex(rgb):
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def hsv_of(rgb):
    r, g, b = [x / 255 for x in rgb]
    return colorsys.rgb_to_hsv(r, g, b)


def analyze(img):
    stat = ImageStat.Stat(img.convert("RGB"))
    r, g, b = stat.mean
    brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    extrema = img.convert("L").getextrema()
    contrast = (extrema[1] - extrema[0]) / 255

    hsv = [hsv_of(c) for c in dominant_colors(img, 8)]
    sat = sum(h for _, h, _ in hsv) / max(len(hsv), 1)

    pal = dominant_colors(img, 6)
    hues = [h * 360 for h, _, _ in hsv]
    sats = [s for _, s, _ in hsv]
    vals = [v for _, _, v in hsv]
    h_avg = sum(hues) / len(hues) if hues else 0
    s_avg = sum(sats) / len(sats) if sats else 0
    v_avg = sum(vals) / len(vals) if vals else 0

    # 主题匹配：色相/明度/饱和落在画像区间则加分
    best, best_score = "dunes", -1
    for name, prof in THEME_PROFILE.items():
        score = 0
        lo, hi = prof["hue"]
        if lo <= hi and lo <= h_avg <= hi:
            score += 2
        if lo > hi and (h_avg >= lo or h_avg <= hi):  # 环绕
            score += 2
        lo, hi = prof["sat"]
        if lo <= s_avg <= hi:
            score += 1.5
        lo, hi = prof["val"]
        if lo <= v_avg <= hi:
            score += 1.5
        # 低饱和 = 新中式气质
        if s_avg < 0.25:
            score += 0.5
        if score > best_score:
            best, best_score = name, score

    mood = "dark" if brightness < 0.38 else "light" if brightness > 0.62 else "mid"

    hints = []
    if mood == "dark":
        hints.append(PROMPT_HINTS["dark"])
    elif mood == "light":
        hints.append(PROMPT_HINTS["light"])
    if s_avg < 0.18:
        hints.append(PROMPT_HINTS["ink"])
    if 20 <= h_avg <= 55 and s_avg >= 0.12:
        hints.append(PROMPT_HINTS["warm"])
        hints.append(PROMPT_HINTS["gold"])
    if 160 <= h_avg <= 250:
        hints.append(PROMPT_HINTS["cool"])
    if 70 <= h_avg <= 150:
        hints.append(PROMPT_HINTS["green"])

    return {
        "palette": [rgb_to_hex(c) for c in pal],
        "brightness": round(brightness, 3),
        "saturation": round(s_avg, 3),
        "contrast": round(contrast, 3),
        "mood": mood,
        "theme_hint": best,
        "prompt_hints": ", ".join(dict.fromkeys(hints)) or PROMPT_HINTS["ink"],
    }


def analyze_files(paths):
    cards = []
    for p in paths:
        im = Image.open(p).convert("RGB")
        card = analyze(im)
        card["source"] = str(p)
        cards.append(card)
    # 多图取综合：palette 合并去重，mood 取多数
    if len(cards) == 1:
        return cards[0]
    merged = {"palette": [], "brightness": 0, "saturation": 0,
              "contrast": 0, "mood": Counter(), "theme_hint": Counter(),
              "prompt_hints": [], "sources": []}
    for c in cards:
        merged["palette"] += c["palette"]
        merged["brightness"] += c["brightness"]
        merged["saturation"] += c["saturation"]
        merged["contrast"] += c["contrast"]
        merged["mood"][c["mood"]] += 1
        merged["theme_hint"][c["theme_hint"]] += 1
        merged["prompt_hints"].append(c["prompt_hints"])
        merged["sources"].append(c.get("source"))
    n = len(cards)
    seen, pal = set(), []
    for h in merged["palette"]:
        if h not in seen:
            seen.add(h)
            pal.append(h)
    return {
        "palette": pal[:8],
        "brightness": round(merged["brightness"] / n, 3),
        "saturation": round(merged["saturation"] / n, 3),
        "contrast": round(merged["contrast"] / n, 3),
        "mood": merged["mood"].most_common(1)[0][0],
        "theme_hint": merged["theme_hint"].most_common(1)[0][0],
        "prompt_hints": "; ".join(dict.fromkeys(merged["prompt_hints"])),
        "sources": merged["sources"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--out", default="style_card.json")
    ap.add_argument("--apply-bg", action="store_true",
                    help="按风格卡直接生成背景（调 make_bg）")
    ap.add_argument("--out-dir", default="bg-out")
    ap.add_argument("--count", type=int, default=6)
    args = ap.parse_args()

    card = analyze_files([Path(p) for p in args.images])
    out = Path(args.out)
    out.write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(card, ensure_ascii=False, indent=2))
    print("SAVED", out)

    if args.apply_bg:
        import make_bg
        import random
        theme = card["theme_hint"]
        out_dir = Path(args.out_dir)
        for i in range(args.count):
            # 用风格卡 theme 为主，轮换相邻主题避免雷同
            keys = list(make_bg.THEMES)
            if theme in keys:
                t = keys[(keys.index(theme) + i) % len(keys)]
            else:
                t = keys[i % len(keys)]
            dest = out_dir / f"styled-{t}-{i+1:02d}.png"
            make_bg.gen_theme(t, dest, seed=random.randint(1, 10**8))
            print("bg", dest)


if __name__ == "__main__":
    main()
