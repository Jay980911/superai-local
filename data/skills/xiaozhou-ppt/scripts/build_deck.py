# -*- coding: utf-8 -*-
"""xiaozhou-ppt · 多风格 PPT 排版引擎（独立，仅依赖 python-pptx）

用法（库模式）:
    from build_deck import Deck, PALETTE
    deck = Deck()
    deck.cover(bg="bg1.png", title="见 山 · 归 然", seal="归然", motto="见山是山\\n见山不是山")
    deck.toc(["项目概述","创意策略","前置运营","营收测算"])
    deck.section("壹", "项目概述", "以山为幕", bg="bg2.png")
    deck.content("以山为幕，\\n以静为席。", "补充说明……", bg="bg3.png")
    deck.keys([("元素","只做点缀","说明"), ...])
    deck.closing(bg="bg4.png", title="见 山 · 归 然")
    deck.save("out.pptx")

色号/字体/间距为 golden-sample 锁定值，勿随意改。
"""
from pathlib import Path
import argparse
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from lxml import etree
# 稳定性兜底：确保本脚本所在目录在 sys.path，便于从任意工作目录直接运行
# （部分内嵌 Python 运行时会剥离 CWD，导致 import styles / style_spec 失败）。
import os as _os
import sys as _sys
_SCRIPT_DIR = _os.path.dirname(_os.path.abspath(__file__))
if _SCRIPT_DIR not in _sys.path:
    _sys.path.insert(0, _SCRIPT_DIR)
try:
    from styles import get_style
except ImportError:
    from .styles import get_style

# 默认风格兼容别名；新代码请通过 Deck(style=...) 取参数。
_DEFAULT = get_style("xinzhongshi")
INK, CREAM, SAND = _DEFAULT.ink, _DEFAULT.cream, _DEFAULT.sand
GOLD, MUTED, SEAL, WHITE = _DEFAULT.gold, _DEFAULT.muted, _DEFAULT.seal, _DEFAULT.white
F_HANG, F_KAI, F_SONG, F_EN = _DEFAULT.title_font, _DEFAULT.body_font, _DEFAULT.secondary_font, _DEFAULT.english_font


def set_cjk(run, name):
    run.font.name = name
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):
        el = rPr.find(qn(tag))
        if el is None:
            el = etree.SubElement(rPr, qn(tag))
        el.set("typeface", name)


def style_run(run, size, color, font=F_KAI, bold=False, italic=False):
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.italic = italic
    set_cjk(run, font)


class Deck:
    def __init__(self, width_in=13.333, height_in=7.5, style="xinzhongshi"):
        self.style = get_style(style)
        self.prs = Presentation()
        self.prs.slide_width = Inches(width_in)
        self.prs.slide_height = Inches(height_in)
        self.blank = self.prs.slide_layouts[6]
        self._bgs = []

    # ---------- 基础 ----------
    def _slide(self):
        return self.prs.slides.add_slide(self.blank)

    def add_text(self, s, x, y, w, h, text, size, color=None, font=None,
                 bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
                 line_spacing=None, italic=False):
        color = color or self.style.cream
        font = font or self.style.body_font
        box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = box.text_frame
        tf.word_wrap = True
        tf.auto_size = None
        try:
            tf.vertical_anchor = anchor
        except Exception:
            pass
        for i, ln in enumerate(text.split("\n")):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.alignment = align
            if line_spacing:
                p.line_spacing = line_spacing
            run = p.add_run()
            run.text = ln
            style_run(run, size, color, font, bold, italic)
        return box

    def add_bg(self, s, path, darken=None):
        darken = self.style.darken if darken is None else darken
        """全幅背景 + 半透明墨色遮罩。path 允许为 None（纯深色底）。"""
        if path:
            self._bgs.append(str(path))
            s.shapes.add_picture(str(path), 0, 0,
                                 width=self.prs.slide_width,
                                 height=self.prs.slide_height)
        else:
            self._bgs.append(None)
            self.fill_bg(s, INK)
            return
        ov = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0,
                                self.prs.slide_width, self.prs.slide_height)
        ov.fill.solid()
        ov.fill.fore_color.rgb = INK
        fill = ov.fill._xPr.find(qn("a:solidFill"))
        clr = fill.find(qn("a:srgbClr"))
        a = etree.SubElement(clr, qn("a:alpha"))
        a.set("val", str(int(darken * 100000)))
        ov.line.fill.background()
        ov.shadow.inherit = False

    def fill_bg(self, s, color):
        sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0,
                                self.prs.slide_width, self.prs.slide_height)
        sh.fill.solid()
        sh.fill.fore_color.rgb = color
        sh.line.fill.background()
        sh.shadow.inherit = False
        spTree = s.shapes._spTree
        sp = sh._element
        spTree.remove(sp)
        spTree.insert(2, sp)
        self._bgs.append(None)

    def hairline(self, s, x, y, w, color=GOLD, h=0.012):
        sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(x), Inches(y), Inches(w), Inches(h))
        sh.fill.solid()
        sh.fill.fore_color.rgb = color
        sh.line.fill.background()
        sh.shadow.inherit = False

    def vline(self, s, x, y, h, color=GOLD, w=0.012):
        sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE,
                                Inches(x), Inches(y), Inches(w), Inches(h))
        sh.fill.solid()
        sh.fill.fore_color.rgb = color
        sh.line.fill.background()
        sh.shadow.inherit = False

    def seal_stamp(self, s, x, y, size=0.62, text="归然"):
        sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                Inches(x), Inches(y), Inches(size), Inches(size))
        sh.fill.solid()
        sh.fill.fore_color.rgb = SEAL
        sh.line.color.rgb = SEAL
        sh.line.width = Pt(1)
        sh.shadow.inherit = False
        try:
            sh.adjustments[0] = 0.12
        except Exception:
            pass
        tf = sh.text_frame
        tf.word_wrap = True
        try:
            tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        except Exception:
            pass
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = text
        style_run(run, 13, WHITE, F_SONG, bold=True)

    # ---------- 页面模板 ----------
    def cover(self, bg, title, subtitle="五 星 旅 居 · 前 置 运 营 提 案",
              seal="归然", motto=None, en="THE  MOUNTAIN  ·  THE  HOME",
              tag="吉  祥  ·  禾  风", foot="山色入怀，心归自然"):
        s = self._slide()
        self.add_bg(s, bg, darken=0.30)
        self.add_text(s, 0.85, 0.75, 3, 0.35, tag, 11, MUTED, F_SONG)
        self.add_text(s, 1.0, 2.55, 9.8, 1.7, title, self.style.title_size, self.style.cream, self.style.title_font,
                      bold=True, align=PP_ALIGN.CENTER)
        if seal:
            self.seal_stamp(s, 8.55, 2.72, 0.68, seal)
        self.add_text(s, 1.0, 4.35, 9.8, 0.4, en, 13, self.style.sand, self.style.english_font,
                      italic=True, align=PP_ALIGN.CENTER)
        self.hairline(s, 4.7, 4.95, 3.2)
        self.add_text(s, 1.0, 5.25, 9.8, 0.5, subtitle, 18, self.style.cream, self.style.secondary_font,
                      align=PP_ALIGN.CENTER)
        if foot:
            self.add_text(s, 1.0, 6.55, 9.8, 0.35, foot, 12, MUTED, F_KAI,
                          align=PP_ALIGN.CENTER)
        if motto:
            self.add_text(s, 11.55, 1.15, 0.55, 4.6, motto, 15, SAND, F_SONG,
                          align=PP_ALIGN.CENTER, line_spacing=1.7)
            self.vline(s, 11.35, 1.15, 4.6)
        return s

    def toc(self, items, bg=None):
        s = self._slide()
        if bg:
            self.add_bg(s, bg, darken=0.5)
        else:
            self.fill_bg(s, RGBColor(0x24, 0x1C, 0x14))
        self.add_text(s, 7.6, 1.9, 4.5, 1.8, "目录", 72, SAND, F_HANG,
                      bold=True, align=PP_ALIGN.CENTER)
        self.add_text(s, 7.6, 3.7, 4.5, 0.4, "C O N T E N T S", 12, MUTED, F_EN,
                      align=PP_ALIGN.CENTER)
        self.hairline(s, 9.0, 4.25, 1.6)
        nums = ["壹", "贰", "叁", "肆", "伍", "陆"]
        for i, item in enumerate(items):
            cn = item if isinstance(item, str) else item[0]
            en = "" if isinstance(item, str) else (item[1] if len(item) > 1 else "")
            y = 1.85 + min(i, 5) * 1.15
            self._circle_num(s, 1.4, y, 0.55, nums[i % len(nums)])
            self.add_text(s, 2.2, y + 0.02, 3.5, 0.45, cn, 24, CREAM, F_SONG, bold=True)
            if en:
                self.add_text(s, 2.2, y + 0.52, 3.5, 0.3, en, 10, MUTED, F_EN, italic=True)
        self.add_text(s, 1.4, 6.4, 5, 0.35, "宁少勿多 · 虚实相生", 12, MUTED, F_SONG)
        return s

    def _circle_num(self, s, x, y, d, text):
        sh = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(d), Inches(d))
        sh.fill.background()
        sh.line.color.rgb = GOLD
        sh.line.width = Pt(1.2)
        sh.shadow.inherit = False
        tf = sh.text_frame
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        run = p.add_run()
        run.text = text
        style_run(run, 18, SAND, F_HANG, bold=True)

    def section(self, num, title, claim, bg, en="PROJECT  OVERVIEW"):
        s = self._slide()
        self.add_bg(s, bg, darken=0.35)
        self.add_text(s, 1.2, 2.0, 1.4, 1.2, num, 48, SAND, F_HANG, bold=True)
        self.hairline(s, 1.25, 3.7, 1.2)
        self.add_text(s, 1.25, 4.05, 8, 0.7, title, 34, CREAM, F_SONG, bold=True)
        self.add_text(s, 1.25, 4.85, 8, 0.35, en, 12, MUTED, F_EN, italic=True)
        self.add_text(s, 1.25, 5.45, 8.5, 0.5, claim, 14, SAND, F_SONG)
        return s

    def content(self, claim, body, bg, seal=None, tag=None,
                claim_size=None, foot_title="ENCOUNTER  NATURE",
                foot_cn="见山之境 · 归然之居"):
        s = self._slide()
        self.add_bg(s, bg, darken=0.38)
        if tag:
            self.add_text(s, 0.9, 0.75, 5, 0.4, tag, 14, SAND, F_SONG)
            self.hairline(s, 0.95, 1.35, 1.3)
        self.add_text(s, 0.9, 1.85, 7.2, 1.5, claim, claim_size or self.style.content_title_size, self.style.cream, self.style.title_font,
                      bold=True, line_spacing=1.25)
        if body:
            self.add_text(s, 0.95, 4.35, 6.4, 1.2, body, 15, SAND, F_SONG,
                          line_spacing=1.7)
        self.hairline(s, 8.7, 5.35, 3.4)
        self.add_text(s, 8.7, 5.55, 3.6, 0.35, foot_title, 10, MUTED, F_EN)
        self.add_text(s, 8.7, 5.95, 3.6, 0.35, foot_cn, 13, CREAM, F_KAI)
        if seal:
            self.seal_stamp(s, 11.85, 0.85, 0.58, seal)
        return s

    def quote(self, big, sub, bg, motto=None, source=None):
        """居中大字页（如「境 界」）"""
        s = self._slide()
        self.add_bg(s, bg, darken=0.34)
        self.add_text(s, 7.6, 1.35, 4.6, 1.2, big, 66, CREAM, F_HANG,
                      bold=True, align=PP_ALIGN.CENTER)
        self.hairline(s, 8.9, 3.3, 2.0)
        self.add_text(s, 7.35, 3.7, 5.1, 1.2, sub, 30, CREAM, F_KAI,
                      align=PP_ALIGN.CENTER, line_spacing=1.4)
        if motto:
            self.add_text(s, 0.85, 1.5, 0.55, 4.2, motto, 14, SAND, F_SONG,
                          align=PP_ALIGN.CENTER, line_spacing=1.8)
            self.vline(s, 1.55, 1.5, 4.2)
            self.seal_stamp(s, 0.95, 5.95, 0.62, big.replace(" ", "")[:2])
        if source:
            self.add_text(s, 7.6, 5.85, 4.6, 0.35, source, 11, MUTED, F_KAI,
                          align=PP_ALIGN.CENTER)
        return s

    def keys(self, points, title="新中式高级感的五个核心", bg=None):
        """要点页：背景图(压暗) + 卡片。points: [(key, short, desc), ...] ≤6
        bg 传背景图路径；不传则回退纯色米白底。"""
        s = self._slide()
        if bg:
            self.add_bg(s, bg, darken=0.5)
        else:
            self.fill_bg(s, CREAM)
        title_color = self.style.cream if bg else RGBColor(0x5C, 0x46, 0x32)
        sub_color = SAND if bg else MUTED
        self.add_text(s, 0.9, 0.65, 10, 0.55, title, 28, title_color,
                      F_HANG, bold=True)
        self.add_text(s, 0.95, 1.25, 8, 0.3,
                      "FIVE  KEYS  OF  REFINED  CHINESE  STYLE", 10, sub_color, F_EN)
        self.hairline(s, 0.95, 1.7, 1.5)
        for i, (k, t, d) in enumerate(points[:6]):
            col, row = i % 3, i // 3
            x, y = 0.95 + col * 4.0, 2.35 + row * 2.15
            sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                    Inches(x), Inches(y), Inches(3.55), Inches(1.85))
            sh.fill.solid()
            sh.fill.fore_color.rgb = self.style.card_fill
            sh.line.color.rgb = self.style.card_line
            sh.line.width = Pt(0.75)
            sh.shadow.inherit = False
            self.add_text(s, x + 0.25, y + 0.18, 1.2, 0.35, f"0{i+1}", 11, GOLD, F_EN)
            self.add_text(s, x + 0.25, y + 0.52, 2.2, 0.45, k, 22,
                          RGBColor(0x5C, 0x46, 0x32), F_HANG, bold=True)
            self.add_text(s, x + 1.55, y + 0.62, 1.8, 0.35, t, 13, MUTED, F_SONG)
            self.add_text(s, x + 0.25, y + 1.15, 3.1, 0.55, d, 11,
                          RGBColor(0x6B, 0x58, 0x40), F_KAI)
        return s

    def list_page(self, title, rows, bg, tag=None):
        """编号列表页。rows: [(num, title, desc), ...]"""
        s = self._slide()
        self.add_bg(s, bg, darken=0.45)
        self.add_text(s, 0.9, 0.7, 8, 0.55, title, 28, SAND, F_HANG, bold=True)
        if tag:
            self.add_text(s, 0.95, 1.3, 8, 0.3, tag, 10, MUTED, F_EN)
        self.hairline(s, 0.95, 1.75, 1.5)
        for i, (num, t, d) in enumerate(rows[:6]):
            y = 2.35 + i * 1.12
            self._circle_num(s, 1.0, y, 0.52, num)
            self.add_text(s, 1.8, y + 0.02, 3.2, 0.4, t, 18, CREAM, F_SONG, bold=True)
            self.add_text(s, 5.1, y + 0.08, 6.8, 0.45, d, 13, SAND, F_KAI)
            if i < len(rows) - 1:
                self.hairline(s, 1.0, y + 0.85, 10.8,
                              RGBColor(0x4A, 0x3A, 0x2A), 0.008)
        return s

    def closing(self, bg, title="见 山 · 归 然",
                sub="感谢聆听 · 期待同行",
                en="M O U N T A I N   V I S I O N   ·   T H E   R E A L M"):
        s = self._slide()
        self.add_bg(s, bg, darken=0.40)
        self.add_text(s, 1.5, 2.7, 10.3, 1.2, title, 56, CREAM, F_HANG,
                      bold=True, align=PP_ALIGN.CENTER)
        self.hairline(s, 5.9, 4.15, 1.5)
        self.add_text(s, 1.5, 4.5, 10.3, 0.45, sub, 18, SAND, F_SONG,
                      align=PP_ALIGN.CENTER)
        self.add_text(s, 1.5, 5.15, 10.3, 0.35, en, 10, MUTED, F_EN,
                      align=PP_ALIGN.CENTER)
        return s

    # ---------- 保存 / 自检 ----------
    def backgrounds(self):
        return list(self._bgs)

    def save(self, path):
        used = [b for b in self._bgs if b]
        if used:
            uniq = {str(Path(b).resolve()) for b in used}
            if len(uniq) < len(used):
                raise SystemExit("铁律违反：出现重复背景图，每页必须不同")
        self.prs.save(str(path))
        return path


def _cli():
    parser = argparse.ArgumentParser(description="xiaozhou-ppt multi-style deck engine")
    parser.add_argument("--style", choices=["xinzhongshi", "modern", "business"], default="xinzhongshi")
    parser.add_argument("--out", default="xiaozhou-ppt-demo.pptx")
    args = parser.parse_args()
    deck = Deck(style=args.style)
    deck.cover(bg=None, title="小舟 · 方案提案", subtitle=f"{args.style} style demo", seal="小舟")
    deck.toc(["项目概述", "核心策略", "实施路径"])
    deck.section("壹", "项目概述", "以清晰主张，抵达共同目标", bg=None)
    deck.content("让内容更有秩序", "通过主题、层级与留白建立统一的阅读路径。", bg=None, tag="PROJECT OVERVIEW")
    deck.keys([("结构", "清楚", "每页只保留一个核心主张"), ("节奏", "从容", "深浅页面交替推进"), ("表达", "准确", "标题与正文层级分明")])
    deck.closing(bg=None, title="小舟 · 方案提案")
    deck.save(args.out)
    print(f"saved: {args.out} style={args.style}")


if __name__ == "__main__":
    _cli()
