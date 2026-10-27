# -*- coding: utf-8 -*-
"""pptx-gen 共享工具：主题应用 + 按 spec 构建单页幻灯片。
被 gen_pptx.py / edit_pptx.py 复用。不直接运行。
spec 约定（每页）:
  layout: "title" | "content" | "section" | "image" | "blank"
  title: str, subtitle: str (title 布局), bullets: [str] (content), image: path (image),
  notes: str
theme:
  bg, titleColor, bodyColor, accent: 6 位十六进制色（无 #）
  titleFont, bodyFont: 字体名
  titleSize, bodySize: pt 数字
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
import os

def _hex(c):
    try:
        return RGBColor.from_string(str(c).lstrip('#'))
    except Exception:
        return None

def slide_size_169(prs):
    # 16:9，单位 EMU
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

def apply_theme_slide(slide, theme):
    bg = _hex(theme.get('bg'))
    if bg:
        try:
            slide.background.fill.solid()
            slide.background.fill.fore_color.rgb = bg
        except Exception:
            pass

def _style_title(shape, theme):
    try:
        tf = shape.text_frame
        for p in tf.paragraphs:
            for r in p.runs:
                r.font.color.rgb = _hex(theme.get('titleColor')) or r.font.color.rgb
                r.font.size = Pt(float(theme.get('titleSize', 32)))
                if theme.get('titleFont'):
                    r.font.name = theme['titleFont']
                r.font.bold = True
    except Exception:
        pass

def _style_body(shape, theme):
    try:
        tf = shape.text_frame
        for p in tf.paragraphs:
            for r in p.runs:
                r.font.color.rgb = _hex(theme.get('bodyColor')) or r.font.color.rgb
                r.font.size = Pt(float(theme.get('bodySize', 20)))
                if theme.get('bodyFont'):
                    r.font.name = theme['bodyFont']
    except Exception:
        pass

def _set_text(tf, text, theme, which):
    tf.clear()
    lines = (text or '').split('\n')
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run()
        r.text = ln
        if which == 'title':
            r.font.size = Pt(float(theme.get('titleSize', 32)))
            r.font.bold = True
            if theme.get('titleFont'): r.font.name = theme['titleFont']
            r.font.color.rgb = _hex(theme.get('titleColor')) or RGBColor(0,0,0)
        else:
            r.font.size = Pt(float(theme.get('bodySize', 20)))
            if theme.get('bodyFont'): r.font.name = theme['bodyFont']
            r.font.color.rgb = _hex(theme.get('bodyColor')) or RGBColor(0,0,0)

def _add_textbox(slide, left, top, width, height, text, theme, which):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    _set_text(tf, text, theme, which)
    return tb

def build_slide(prs, spec, theme, base_dir=None):
    """按 spec 在 prs 上追加一页。layout 决定版式。"""
    layout = (spec.get('layout') or 'content').lower()
    # 用 blank 布局（index 6 in 默认模板；找不到则取最后）手动定位，版式稳定可控。
    try:
        blank = prs.slide_layouts[6]
    except Exception:
        blank = prs.slide_layouts[-1]
    slide = prs.slides.add_slide(blank)
    apply_theme_slide(slide, theme)

    SW = prs.slide_width
    SH = prs.slide_height
    margin = Inches(0.6)

    title = spec.get('title') or ''
    subtitle = spec.get('subtitle') or ''
    bullets = spec.get('bullets') or []
    image = spec.get('image') or ''
    notes = spec.get('notes') or ''

    if layout == 'title':
        # 标题居中偏上，副标题在下
        _add_textbox(slide, margin, Inches(2.2), SW - 2*margin, Inches(2.0), title, theme, 'title')
        if subtitle:
            tb = _add_textbox(slide, margin, Inches(4.4), SW - 2*margin, Inches(1.5), subtitle, theme, 'body')
            try:
                for p in tb.text_frame.paragraphs:
                    p.alignment = PP_ALIGN.CENTER
            except Exception: pass
    elif layout == 'section':
        # 大标题居中
        tb = _add_textbox(slide, margin, Inches(3.0), SW - 2*margin, Inches(2.0), title, theme, 'title')
        try:
            for p in tb.text_frame.paragraphs:
                p.alignment = PP_ALIGN.CENTER
        except Exception: pass
    elif layout == 'image':
        _add_textbox(slide, margin, margin, SW - 2*margin, Inches(1.2), title, theme, 'title')
        if image:
            ip = image if os.path.isabs(image) else os.path.join(base_dir or '.', image)
            try:
                # 限定区域居中放置
                pic = slide.shapes.add_picture(ip, Inches(2.0), Inches(2.0), width=Inches(9.0))
                # 居中：左右留白对称
                pic.left = int((SW - pic.width) / 2)
                pic.top = Inches(2.2)
            except Exception as e:
                _add_textbox(slide, margin, Inches(3.0), SW - 2*margin, Inches(1.0), f'[图片载入失败: {e}]', theme, 'body')
    elif layout == 'blank':
        if title:
            _add_textbox(slide, margin, margin, SW - 2*margin, Inches(1.0), title, theme, 'title')
    else:  # content
        _add_textbox(slide, margin, margin, SW - 2*margin, Inches(1.2), title, theme, 'title')
        body = '\n'.join('• ' + b for b in bullets) if bullets else ''
        if body:
            tb = _add_textbox(slide, margin, Inches(2.0), SW - 2*margin, SH - Inches(2.8), body, theme, 'body')
            try: tb.text_frame.word_wrap = True
            except Exception: pass

    if notes:
        try:
            slide.notes_slide.notes_text_frame.text = notes
        except Exception:
            pass
    return slide

def new_prs():
    prs = Presentation()
    slide_size_169(prs)
    return prs
