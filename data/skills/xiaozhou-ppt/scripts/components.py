# -*- coding: utf-8 -*-
"""xiaozhou-ppt · 可复用视觉组件库（原创能力的版式原子）

设计要点：
  - 全部组件函数签名统一为 (deck, s, spec, ...) ：deck 提供渲染原语
    （add_text / add_bg / _slide 等，来自 build_deck.Deck），s 是当前 slide，
    spec 是 style_spec.StyleSpec。组件不直接依赖某个具体风格。
  - 组件只“画”，不“决定内容”；内容与顺序由 design_synth / 页面 recipe 决定。
  - 颜色统一走 spec 的 hex 字段，必要时用 color= 覆盖。
  - 所有几何用 Inches；圆角用 ROUNDED_RECTANGLE + adjustment。

这让「风格」与「版式」彻底解耦：新增一种原创风格，只需在 design_synth 里
给出启用哪些组件（spec.tags），再用这些原子拼出页面，无需改 build_deck 的坐标。
"""
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from lxml import etree

from style_spec import hex2rgb


# ---------------------------------------------------------------------------
# 内部工具
# ---------------------------------------------------------------------------
def _text(deck, s, x, y, w, h, text, size, color, font=None, bold=False,
          italic=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
          line_spacing=None):
    """在 slide 上加文本框并设好 CJK 字体。返回 textbox。"""
    box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    try:
        tf.vertical_anchor = anchor
    except Exception:
        pass
    font = font or (deck.style.body_font if hasattr(deck, "style") else "Microsoft YaHei")
    for i, ln in enumerate(str(text).split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if line_spacing:
            p.line_spacing = line_spacing
        run = p.add_run()
        run.text = ln
        run.font.size = Pt(size)
        run.font.color.rgb = color if isinstance(color, RGBColor) else hex2rgb(color)
        run.font.bold = bold
        run.font.italic = italic
        run.font.name = font
        rPr = run._r.get_or_add_rPr()
        for tag in ("a:ea", "a:cs"):
            el = rPr.find(qn(tag))
            if el is None:
                el = etree.SubElement(rPr, qn(tag))
            el.set("typeface", font)
    return box


def _soft_shadow(shape, blur=95000, alpha=0.16, offset=34000):
    """给形状加柔和投影（写 a:effectLst/a:outerShdw）。"""
    try:
        sp = shape._element
        spPr = sp.find(qn("p:spPr"))
        if spPr is None:
            return
        eff = spPr.makeelement(qn("a:effectLst"), {})
        shdw = spPr.makeelement(qn("a:outerShdw"), {
            "blurRad": str(blur), "dist": str(offset), "dir": "5400000",
            "rotWithShape": "0",
        })
        clr = spPr.makeelement(qn("a:srgbClr"), {"val": "000000"})
        a = spPr.makeelement(qn("a:alpha"), {"val": str(int(alpha * 100000))})
        clr.append(a)
        shdw.append(clr)
        eff.append(shdw)
        spPr.append(eff)
    except Exception:
        pass


def _rrect(deck, s, x, y, w, h, fill_hex, line_hex=None, line_w=0.75,
           radius=0.12, shadow=True):
    """圆角矩形原子。fill_hex 为 None 表示无填充（仅描边）。返回 shape。"""
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                            Inches(x), Inches(y), Inches(w), Inches(h))
    if fill_hex is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = hex2rgb(fill_hex)
    if line_hex:
        sh.line.color.rgb = hex2rgb(line_hex)
        sh.line.width = Pt(line_w)
    else:
        sh.line.fill.background()
    try:
        sh.adjustments[0] = radius
    except Exception:
        pass
    sh.shadow.inherit = False
    if shadow:
        _soft_shadow(sh)
    return sh


def _oval(deck, s, x, y, w, h, fill_hex, line_hex=None, line_w=1.0, shadow=False):
    sh = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill_hex is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = hex2rgb(fill_hex)
    if line_hex:
        sh.line.color.rgb = hex2rgb(line_hex)
        sh.line.width = Pt(line_w)
    else:
        sh.line.fill.background()
    sh.shadow.inherit = False
    if shadow:
        _soft_shadow(sh)
    return sh


# ---------------------------------------------------------------------------
# 组件
# ---------------------------------------------------------------------------
def rounded_card(deck, s, spec, x, y, w, h, fill=None, line=None,
                 radius=0.1, shadow=True):
    """通用圆角卡片。默认用 spec.card_fill / card_line。"""
    fill = fill if fill is not None else spec.card_fill
    line = line if line is not None else spec.card_line
    return _rrect(deck, s, x, y, w, h, fill, line, 1.0, radius, shadow)


def sticker_tag(deck, s, spec, x, y, text, bg=None, fg=None, rotate=-6,
                size=0.52, font=None):
    """贴纸标签：小圆角块 + 白字，可微旋转。强调“手账/收藏感”。"""
    bg = bg or spec.accent
    fg = fg or "#FFFFFF"
    sh = _rrect(deck, s, x, y, size * 1.8, size, bg, None, 0.9, 0.18, shadow=False)
    try:
        sh.rotation = rotate
    except Exception:
        pass
    _text(deck, s, x, y, size * 1.8, size, text, 12, fg,
          font or spec.title_font, bold=True,
          align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    return sh


def chip(deck, s, spec, x, y, text, bg=None, fg=None, w=None, h=0.42):
    """胶囊标签。用于分类/关键词。"""
    bg = bg or spec.accent2
    fg = fg or "#FFFFFF"
    txt_w = w or max(1.0, 0.18 * len(text) + 0.4)
    sh = _rrect(deck, s, x, y, txt_w, h, bg, None, 0.9, 0.5, shadow=False)
    _text(deck, s, x, y, txt_w, h, text, 11, fg,
          spec.body_font, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    return sh


def hero_image(deck, s, spec, x, y, w, h, img_path, radius=0.05,
               border=True, border_color=None, shadow=True):
    """角色/主体大图：加图 + 圆角描边框（真圆角裁剪在 pptx 不稳定，用描边模拟）。"""
    if not img_path or not __import__("pathlib").Path(img_path).exists():
        _rrect(deck, s, x, y, w, h, spec.card_fill, spec.card_line, 1.0, radius, shadow)
        return None
    pic = s.shapes.add_picture(str(img_path), Inches(x), Inches(y),
                               Inches(w), Inches(h))
    if shadow:
        _soft_shadow(pic, blur=110000, alpha=0.20, offset=40000)
    if border:
        bc = border_color or spec.accent
        frame = _rrect(deck, s, x, y, w, h, None, bc, 2.0, radius, shadow=False)
    return pic


def stat_tile(deck, s, spec, x, y, w, h, big, label, sub="", color=None,
              fill=None, line=None):
    """数据 tile：大数字 + 标签 + 小注。"""
    rounded_card(deck, s, spec, x, y, w, h, fill, line, 0.12, shadow=True)
    c = color or spec.accent
    _text(deck, s, x + 0.18, y + 0.12, w - 0.36, h * 0.5, big, 34, c,
          spec.english_font if big.isascii() else spec.title_font, bold=True,
          anchor=MSO_ANCHOR.MIDDLE)
    _text(deck, s, x + 0.2, y + h * 0.55, w - 0.4, 0.34, label, 13, spec.ink,
          spec.body_font, bold=True)
    if sub:
        _text(deck, s, x + 0.2, y + h * 0.55 + 0.32, w - 0.4, 0.3, sub, 10.5, spec.muted,
              spec.body_font)
    return None


def timeline(deck, s, spec, x, y, w, items, h=2.4):
    """横向时间轴。items: [(year, title, desc), ...]"""
    line_y = y + 0.55
    _rrect(deck, s, x, line_y, w, 0.05, spec.accent, None, 0.5, 0.5, shadow=False)
    n = len(items)
    step = w / n
    for i, (yr, title, desc) in enumerate(items):
        cx = x + step * i + step / 2
        dot = _oval(deck, s, cx - 0.13, line_y - 0.08, 0.26, 0.26, spec.accent,
                    spec.cream, 2.0, shadow=False)
        card_y = line_y + 0.45 if i % 2 == 0 else line_y - 1.05
        cw = step - 0.3
        rounded_card(deck, s, spec, cx - cw / 2, card_y, cw, 0.95,
                     spec.card_fill, spec.card_line, 0.12, shadow=True)
        _text(deck, s, cx - cw / 2, card_y + 0.08, cw, 0.3, yr, 13, spec.accent,
              spec.english_font, bold=True, align=PP_ALIGN.CENTER)
        _text(deck, s, cx - cw / 2, card_y + 0.38, cw, 0.3, title, 12, spec.ink,
              spec.body_font, bold=True, align=PP_ALIGN.CENTER)
        if desc:
            _text(deck, s, cx - cw / 2, card_y + 0.66, cw, 0.28, desc, 9.5, spec.muted,
                  spec.body_font, align=PP_ALIGN.CENTER)
    return None


def matrix_grid(deck, s, spec, x, y, w, h, cells, cols=3, cell_h=2.4):
    """IP 矩阵：图片 + 名称 + 小注的网格。cells: [(img, name, sub), ...]"""
    n = len(cells)
    rows = (n + cols - 1) // cols
    gx, gy = 0.3, 0.35
    cw = (w - gx * (cols - 1)) / cols
    for i, (img, name, sub) in enumerate(cells):
        r, c = divmod(i, cols)
        cx = x + c * (cw + gx)
        cy = y + r * (cell_h + gy)
        rounded_card(deck, s, spec, cx, cy, cw, cell_h, spec.card_fill,
                     spec.card_line, 0.1, shadow=True)
        iw = cw - 0.5
        hero_image(deck, s, spec, cx + 0.25, cy + 0.2, iw, cell_h - 0.95,
                   img, radius=0.08, border=False, shadow=False)
        _text(deck, s, cx + 0.2, cy + cell_h - 0.72, cw - 0.4, 0.3, name, 13,
              spec.ink, spec.title_font, bold=True)
        if sub:
            _text(deck, s, cx + 0.2, cy + cell_h - 0.42, cw - 0.4, 0.3, sub, 10,
                  spec.muted, spec.body_font)
    return None


def bar_chart(deck, s, spec, x, y, w, h, data, color=None, maxv=None):
    """竖向柱状图。data: [(label, value), ...]，value 任意正数（自动归一）。"""
    color = color or spec.accent
    maxv = maxv or max((v for _, v in data), default=1) or 1
    n = len(data)
    pad_b = 0.45  # 底部标签区
    plot_h = h - pad_b
    bw = (w - 0.2 * (n - 1)) / n
    base_y = y + plot_h
    for i, (label, val) in enumerate(data):
        bh = plot_h * (val / maxv) if maxv else 0
        bx = x + i * (bw + 0.2)
        _rrect(deck, s, bx, base_y - bh, bw, bh, color, None, 1.0, 0.25, shadow=True)
        _text(deck, s, bx - 0.1, base_y + 0.05, bw + 0.2, 0.3, label, 10.5, spec.ink,
              spec.body_font, bold=True, align=PP_ALIGN.CENTER)
        _text(deck, s, bx, base_y - bh - 0.3, bw, 0.28, f"{val:g}", 11, color,
              spec.english_font, bold=True, align=PP_ALIGN.CENTER)
    return None


def donut(deck, s, spec, cx, cy, r, ratio, color=None, track=None, label=None):
    """环形进度/占比（粗描边圆近似环）。cx,cy,r 单位英寸。"""
    color = color or spec.accent
    track = track or spec.card_line
    _oval(deck, s, cx - r, cy - r, 2 * r, 2 * r, None, track, 10, shadow=False)
    ring = _oval(deck, s, cx - r, cy - r, 2 * r, 2 * r, None, color, 14, shadow=False)
    # 用 arc 近似：画一个缺口圆——pptx 无原生 arc，用细线圆表示外环高亮即可
    if label:
        _text(deck, s, cx - r, cy - 0.2, 2 * r, 0.4, label, 13, spec.ink,
              spec.title_font, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    return ring


def abstract_map(deck, s, spec, x, y, w, h, points, blob_color=None):
    """抽象世界地图（合规：只画无边界大陆色块剪影 + 定位点，绝不描国界）。

    points: [(rel_x 0~1, rel_y 0~1, label), ...]
    """
    blob = blob_color or spec.accent2
    # 几块柔边大陆剪影（位置为示意，不代表真实地理边界）
    blobs = [
        (0.18, 0.40, 0.30, 0.42), (0.46, 0.34, 0.22, 0.34),
        (0.70, 0.42, 0.26, 0.34), (0.82, 0.70, 0.16, 0.22),
        (0.30, 0.74, 0.18, 0.20),
    ]
    for (rx, ry, rw, rhh) in blobs:
        _rrect(deck, s, x + rx * w, y + ry * h, rw * w, rhh * h, blob, None,
               1.0, 0.5, shadow=False)
    for (px, py, label) in points:
        ax = x + px * w
        ay = y + py * h
        _oval(deck, s, ax - 0.09, ay - 0.09, 0.18, 0.18, spec.accent, spec.cream,
              2.0, shadow=True)
        _text(deck, s, ax + 0.12, ay - 0.16, 1.6, 0.3, label, 10.5, spec.ink,
              spec.body_font, bold=True)
    return None


def loop_diagram(deck, s, spec, cx, cy, r, items, color=None):
    """环形业务闭环：围绕圆心排布若干节点（chip）+ 中心标题。"""
    color = color or spec.accent
    n = len(items)
    import math
    for i, (label, sub) in enumerate(items):
        ang = 2 * math.pi * i / n - math.pi / 2
        nx = cx + r * math.cos(ang)
        ny = cy + r * math.sin(ang) * 0.62  # 压扁成椭圆
        ww = 1.7
        rounded_card(deck, s, spec, nx - ww / 2, ny - 0.42, ww, 0.84,
                     spec.card_fill, color, 0.12, shadow=True)
        _text(deck, s, nx - ww / 2, ny - 0.36, ww, 0.34, label, 12, spec.ink,
              spec.body_font, bold=True, align=PP_ALIGN.CENTER)
        if sub:
            _text(deck, s, nx - ww / 2, ny - 0.02, ww, 0.3, sub, 9, spec.muted,
                  spec.body_font, align=PP_ALIGN.CENTER)
    _oval(deck, s, cx - 0.6, cy - 0.6, 1.2, 1.2, color, None, 1.0, shadow=True)
    return None
