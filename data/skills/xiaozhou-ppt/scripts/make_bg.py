# -*- coding: utf-8 -*-
"""xiaozhou-ppt · 背景图准备（独立，仅依赖 Pillow）

优先级（SKILL.md 铁律）:
  1. 用户实拍图     —— make_bg.py --photos a.jpg b.jpg --out dir/
  2. 程序化肌理     —— make_bg.py --theme dunes --out dir/ --count 5
  3. 外部生图模型   —— 见 prompts/backgrounds.md（本脚本不依赖）

程序化主题：paper / ink-mountain / ink-wash / dunes / mist / bamboo / bronze / grid / arcs / lattice / seal
输出 1600x900 PNG，且每次生成自动带随机种子变化，保证同主题也不重复。
其中 grid / arcs / lattice / seal 是低对比度简约图案纹理，适合封面或正文叠加文字。
"""
import argparse
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

W, H = 1600, 900

# 与 build_deck.py 色板对齐
PAL = {
    "ink":   (26, 20, 14),
    "cream": (243, 236, 220),
    "sand":  (210, 180, 136),
    "gold":  (176, 141, 87),
    "muted": (154, 130, 94),
    "deep":  (36, 28, 20),
}


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _grain(img, amount=12):
    noise = Image.effect_noise((img.width, img.height), amount).convert("L")
    noise = ImageEnhance.Contrast(noise).enhance(0.35)
    return Image.composite(img, Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.06),
                           noise.point(lambda p: 255 if p > 128 else 0))


def _soft_grad(size, c1, c2, vertical=True):
    w, h = size
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            t = y / h if vertical else x / w
            px[x, y] = _lerp(c1, c2, t)
    return im


def theme_paper(rng):
    im = _soft_grad((W, H), PAL["cream"], PAL["sand"])
    d = ImageDraw.Draw(im, "RGBA")
    for _ in range(40):
        x, y = rng.randint(0, W), rng.randint(0, H)
        r = rng.randint(80, 320)
        a = rng.randint(6, 16)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(*PAL["muted"], a))
    return im.filter(ImageFilter.GaussianBlur(40))


def theme_ink_wash(rng):
    im = Image.new("RGB", (W, H), PAL["cream"])
    d = ImageDraw.Draw(im, "RGBA")
    for _ in range(14):
        x = rng.randint(-200, W)
        y = rng.randint(H // 3, H + 150)
        rx = rng.randint(180, 520)
        ry = rng.randint(60, 200)
        a = rng.randint(30, 90)
        col = _lerp(PAL["ink"], PAL["muted"], rng.random())
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=(*col, a))
    im = im.filter(ImageFilter.GaussianBlur(28))
    im = ImageEnhance.Color(im).enhance(0.35)
    return im


def theme_ink_mountain(rng):
    im = _soft_grad((W, H), _lerp(PAL["cream"], PAL["muted"], 0.35), PAL["deep"])
    d = ImageDraw.Draw(im, "RGBA")
    layers = [
        (0.52, _lerp(PAL["muted"], PAL["ink"], 0.35), 220),
        (0.62, _lerp(PAL["muted"], PAL["ink"], 0.55), 120),
        (0.72, _lerp(PAL["ink"], PAL["deep"], 0.4), 70),
    ]
    for base_y, col, alpha in layers:
        pts = [(0, H)]
        x = 0
        y = int(H * base_y) + rng.randint(-30, 30)
        pts.append((0, y))
        while x < W:
            x += rng.randint(60, 160)
            y = int(H * base_y) + rng.randint(-70, 50)
            pts.append((x, y))
        pts.append((W, H))
        d.polygon(pts, fill=(*col, alpha))
    im = im.filter(ImageFilter.GaussianBlur(2))
    return im


def theme_dunes(rng):
    im = _soft_grad((W, H), _lerp(PAL["sand"], PAL["cream"], 0.45), PAL["deep"])
    d = ImageDraw.Draw(im, "RGBA")
    for i in range(7):
        y0 = int(H * (0.35 + i * 0.1))
        pts = [(0, H), (0, y0 + rng.randint(-40, 40))]
        x = 0
        while x < W:
            x += rng.randint(80, 180)
            pts.append((x, y0 + int(math.sin(x / 220 + i) * 60) + rng.randint(-25, 25)))
        pts.append((W, H))
        t = i / 6
        col = _lerp(PAL["sand"], PAL["ink"], 0.15 + t * 0.65)
        d.polygon(pts, fill=(*col, 235 - i * 18))
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    im = ImageEnhance.Color(im).enhance(0.55)
    return im


def theme_mist(rng):
    im = _soft_grad((W, H), _lerp(PAL["cream"], PAL["muted"], 0.5), PAL["deep"])
    d = ImageDraw.Draw(im, "RGBA")
    for _ in range(20):
        x, y = rng.randint(-100, W), rng.randint(0, H)
        rx, ry = rng.randint(200, 500), rng.randint(50, 140)
        a = rng.randint(20, 60)
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=(*PAL["cream"], a))
    im = im.filter(ImageFilter.GaussianBlur(50))
    return im


def theme_bamboo(rng):
    im = _soft_grad((W, H), _lerp(PAL["muted"], PAL["ink"], 0.25), PAL["deep"])
    d = ImageDraw.Draw(im, "RGBA")
    for _ in range(9):
        x = rng.randint(60, W - 60)
        w = rng.randint(10, 26)
        a = rng.randint(90, 160)
        col = _lerp(PAL["ink"], PAL["muted"], rng.random() * 0.5)
        d.rectangle([x, -20, x + w, H + 20], fill=(*col, a))
        y = rng.randint(80, H - 120)
        for seg in range(4):
            yy = y + seg * 90
            d.line([x, yy, x + w, yy], fill=(*PAL["ink"], min(255, a + 40)), width=3)
    im = im.filter(ImageFilter.GaussianBlur(1.5))
    return im


def theme_bronze(rng):
    im = _soft_grad((W, H), _lerp(PAL["ink"], PAL["muted"], 0.35), PAL["deep"])
    d = ImageDraw.Draw(im, "RGBA")
    for _ in range(30):
        x, y = rng.randint(0, W), rng.randint(0, H)
        r = rng.randint(20, 90)
        col = _lerp(PAL["gold"], PAL["ink"], rng.random() * 0.7)
        d.ellipse([x - r, y - r, x + r, y + r], outline=(*col, 90), width=4)
    for _ in range(8):
        x, y = rng.randint(0, W), rng.randint(0, H)
        d.rectangle([x, y, x + rng.randint(80, 220), y + rng.randint(80, 220)],
                    outline=(*PAL["gold"], 50), width=3)
    im = im.filter(ImageFilter.GaussianBlur(3))
    im = ImageEnhance.Color(im).enhance(0.4)
    return im


def _pattern_base(light=False):
    if light:
        return _soft_grad((W, H), PAL["cream"], _lerp(PAL["cream"], PAL["sand"], 0.28))
    return _soft_grad((W, H), _lerp(PAL["ink"], PAL["muted"], 0.20), PAL["deep"])


def _pattern_finish(im, blur=0.35, grain=5):
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    im = _grain(im, grain)
    return ImageEnhance.Color(im).enhance(0.72)


def theme_grid(rng):
    """细线网格：极低对比度，适合承载封面标题。"""
    im = _pattern_base(light=False)
    d = ImageDraw.Draw(im, "RGBA")
    step = rng.choice([96, 112, 128])
    line = (*PAL["sand"], 26)
    for x in range(-H, W + H, step):
        d.line((x, 0, x + H, H), fill=line, width=2)
        d.line((x, H, x + H, 0), fill=(*PAL["gold"], 18), width=2)
    for y in range(0, H, step):
        d.line((0, y, W, y), fill=(*PAL["muted"], 18), width=1)
    return _pattern_finish(im, 0.25, 4)


def theme_arcs(rng):
    """偏心同心弧线：给封面提供一个安静的视觉焦点。"""
    im = _pattern_base(light=False)
    d = ImageDraw.Draw(im, "RGBA")
    cx = rng.choice([int(W * 0.18), int(W * 0.78)])
    cy = rng.choice([int(H * 0.18), int(H * 0.82)])
    max_r = max(W, H) * 1.05
    for i in range(9):
        r = int(max_r * (0.18 + i * 0.095))
        d.ellipse((cx-r, cy-r, cx+r, cy+r), outline=(*PAL["gold"], 20 + (i % 3) * 5), width=3)
    d.ellipse((cx-28, cy-28, cx+28, cy+28), outline=(*PAL["sand"], 48), width=3)
    return _pattern_finish(im, 0.4, 4)


def theme_lattice(rng):
    """东方窗棂式菱格：规则、克制，不模拟具体图像。"""
    im = _pattern_base(light=True)
    d = ImageDraw.Draw(im, "RGBA")
    step = rng.choice([108, 126, 144])
    for x in range(-H, W + H, step):
        d.line((x, 0, x + H, H), fill=(*PAL["muted"], 24), width=2)
        d.line((x, H, x + H, 0), fill=(*PAL["gold"], 20), width=2)
    for x in range(0, W, step * 2):
        for y in range(0, H, step * 2):
            d.ellipse((x-9, y-9, x+9, y+9), outline=(*PAL["gold"], 34), width=2)
    return _pattern_finish(im, 0.25, 4)


def theme_seal(rng):
    """印章/圆窗抽象纹理：少量圆形和方形印记，避免出现文字。"""
    im = _pattern_base(light=True)
    d = ImageDraw.Draw(im, "RGBA")
    for _ in range(7):
        x = rng.randint(80, W - 80)
        y = rng.randint(70, H - 70)
        size = rng.randint(90, 230)
        col = (*PAL["seal"], rng.randint(16, 32))
        if rng.random() < 0.55:
            d.ellipse((x-size, y-size, x+size, y+size), outline=col, width=4)
            d.ellipse((x-size+18, y-size+18, x+size-18, y+size-18), outline=(*PAL["gold"], 20), width=2)
        else:
            d.rounded_rectangle((x-size, y-size, x+size, y+size), radius=22, outline=col, width=4)
    return _pattern_finish(im, 0.45, 4)


THEMES = {
    "paper": theme_paper,
    "ink-wash": theme_ink_wash,
    "ink-mountain": theme_ink_mountain,
    "dunes": theme_dunes,
    "mist": theme_mist,
    "bamboo": theme_bamboo,
    "bronze": theme_bronze,
    "grid": theme_grid,
    "arcs": theme_arcs,
    "lattice": theme_lattice,
    "seal": theme_seal,
}


def gen_theme(theme, out_path, seed=None):
    rng = random.Random(seed)
    fn = THEMES.get(theme, theme_dunes)
    im = fn(rng)
    im = _grain(im, 10)
    im = ImageEnhance.Brightness(im).enhance(rng.uniform(0.92, 1.06))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    im.save(out_path, "PNG")
    return out_path


def from_photo(src, out_path, darken=0.0):
    """用户实拍图 → 16:9 居中裁剪，可加暗。"""
    im = Image.open(src).convert("RGB")
    tw, th = W, H
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    im = im.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    im = im.crop((left, top, left + tw, top + th))
    if darken > 0:
        overlay = Image.new("RGB", (tw, th), PAL["ink"])
        im = Image.blend(im, overlay, min(darken, 0.8))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    im.save(out_path, "PNG")
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="bg-out")
    ap.add_argument("--count", type=int, default=3, help="程序化生成张数")
    ap.add_argument("--themes", nargs="*", default=None,
                    help=f"主题列表，可选 {list(THEMES)}")
    ap.add_argument("--photos", nargs="*", default=None, help="用户实拍图路径")
    ap.add_argument("--darken", type=float, default=0.0, help="实拍图压暗 0~0.8")
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    made = []

    if args.photos:
        for i, p in enumerate(args.photos):
            dest = out / f"photo-{i+1:02d}.png"
            made.append(from_photo(Path(p), dest, darken=args.darken))
            print("photo", dest)

    themes = args.themes or list(THEMES.keys())
    for i in range(args.count):
        theme = themes[i % len(themes)]
        seed = args.seed if args.seed is not None else random.randint(1, 10**8)
        dest = out / f"bg-{theme}-{i+1:02d}.png"
        made.append(gen_theme(theme, dest, seed=seed))
        print("theme", theme, "->", dest)

    print("DONE", len(made), "images ->", out)


if __name__ == "__main__":
    main()
