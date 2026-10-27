# -*- coding: utf-8 -*-
"""
生成 _icon.png (512x512)。设计系统母题：深底 + 色板样本块 + 细网格。
优先用 PIL；无 PIL 时回落到纯标准库 PNG 编码（zlib），保证可复现。
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
import assets.data as D  # noqa: E402

try:
    from PIL import Image, ImageDraw
    HAVE_PIL = True
except Exception:
    HAVE_PIL = False

SIZE = 512


def _role_colors():
    pal = D.build_palettes()[42]  # 取一个中性偏品牌感的调色板
    return pal["light"]


def _hex2rgb(hx):
    hx = hx.lstrip("#")
    return tuple(int(hx[i:i + 2], 16) for i in (0, 2, 4))


def main():
    out = os.path.join(ROOT, "_icon.png")
    roles = _role_colors()
    bg = _hex2rgb(roles["bg"])
    primary = _hex2rgb(roles["primary"])
    accent = _hex2rgb(roles["accent"])
    secondary = _hex2rgb(roles["secondary"])
    text = _hex2rgb(roles["text"])

    if HAVE_PIL:
        img = Image.new("RGB", (SIZE, SIZE), bg)
        d = ImageDraw.Draw(img)
        # 圆角深色面板（用矩形+边模拟）
        d.rectangle([28, 28, SIZE - 28, SIZE - 28], outline=secondary, width=6)
        # 顶部品牌条
        d.rectangle([28, 28, SIZE - 28, 120], fill=primary)
        # 中部色板样本块
        sw = [primary, secondary, accent, text, bg]
        bw = (SIZE - 80) // 5
        for i, c in enumerate(sw):
            x0 = 40 + i * bw
            d.rectangle([x0, 160, x0 + bw - 10, 300], fill=c, outline=secondary, width=2)
        # 细网格（暗示 design system 栅格）
        for gx in range(40, SIZE - 30, 48):
            d.line([gx, 330, gx, SIZE - 40], fill=primary, width=1)
        for gy in range(330, SIZE - 30, 40):
            d.line([40, gy, SIZE - 40, gy], fill=primary, width=1)
        # 中央 UI 母题圆
        d.ellipse([SIZE // 2 - 60, 340, SIZE // 2 + 60, 460], outline=accent, width=6)
        d.text((SIZE // 2 - 28, 388), "UI", fill=text)
        img.save(out)
        print("icon written (PIL):", out)
    else:
        # 纯标准库回落：竖条样本 + 边框
        rows = []
        for y in range(SIZE):
            row = []
            for x in range(SIZE):
                if x < 12 or x > SIZE - 12 or y < 12 or y > SIZE - 12:
                    row.append(secondary)
                elif y < 110:
                    row.append(primary)
                elif 150 <= y <= 290:
                    # 5 竖条
                    seg = (x - 40) * 5 // (SIZE - 80)
                    seg = max(0, min(4, seg))
                    row.append([primary, secondary, accent, text, bg][seg])
                else:
                    row.append(bg)
            rows.append(row)
        _write_png(out, SIZE, SIZE, rows)
        print("icon written (stdlib fallback):", out)


def _write_png(path, w, h, rgb_rows):
    import struct
    import zlib
    raw = bytearray()
    for row in rgb_rows:
        raw.append(0)
        for (r, g, b) in row:
            raw.extend((r & 255, g & 255, b & 255))
    comp = zlib.compressobj(9)
    data = comp.compress(bytes(raw)) + comp.flush()

    def chunk(typ, body):
        return (struct.pack(">I", len(body)) + typ + body +
                struct.pack(">I", zlib.crc32(typ + body) & 0xffffffff))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", data)
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    main()
