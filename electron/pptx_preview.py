#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
pptx -> HTML 预览转换器（无 LibreOffice 依赖，靠 python-pptx + PIL）。
把每页幻灯片还原成一张按真实比例缩放的画布，形状/文本框/图片按 EMU 坐标定位，
字体大小/颜色/加粗尽量还原。不是 100% 像素级还原（PowerPoint 渲染器太复杂），
但能在应用内看到完整的图文内容与版式，远胜"无法预览"。
用法: python pptx_preview.py <in.pptx> <out.html>
"""
import sys, os, hashlib, base64

try:
    from pptx import Presentation
    from pptx.util import Emu
    from pptx.enum.shapes import MSO_SHAPE_TYPE
except Exception as e:
    sys.stdout.write("PPTX_IMPORT_FAIL:" + str(e))
    sys.exit(2)

EMU_PER_PX = 9525  # 914400 EMU = 1in = 96px

def px(v):
    try:
        return round(float(v) / EMU_PER_PX, 2)
    except Exception:
        return 0

def css_escape(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def color_to_css(rgb):
    try:
        return '#' + str(rgb)
    except Exception:
        return None

def fill_css(shape):
    try:
        f = shape.fill
        if f.type is None:
            return None
        # 0 = solid
        from pptx.enum.dml import MSO_FILL
        if f.type == MSO_FILL.SOLID:
            try:
                c = f.fore_color
                if c.type is not None:
                    return color_to_css(c.rgb)
            except Exception:
                return None
    except Exception:
        return None
    return None

def line_css(shape):
    try:
        ln = shape.line
        if ln.color and ln.color.type is not None:
            w = px(ln.width) if ln.width else 1
            return 'border:%.1fpx solid %s' % (w, color_to_css(ln.color.rgb) or '#000')
    except Exception:
        pass
    return None

def render_runs(tf, base_fs):
    """把 text_frame 的段落/runs 渲染成 HTML 片段。"""
    out = []
    for p in tf.paragraphs:
        out.append('<div style="margin:0 0 4px;">')
        for run in p.runs:
            text = run.text or ''
            if not text:
                continue
            style = []
            fn = run.font
            if fn.size:
                style.append('font-size:%.1fpx' % (float(fn.size.pt) * 96 / 72))
            if fn.bold:
                style.append('font-weight:bold')
            if fn.italic:
                style.append('font-style:italic')
            try:
                if fn.color and fn.color.type is not None and fn.color.rgb:
                    style.append('color:%s' % color_to_css(fn.color.rgb))
            except Exception:
                pass
            if fn.name:
                style.append("font-family:'%s',sans-serif" % fn.name)
            out.append('<span style="%s">%s</span>' % (';'.join(style), css_escape(text)))
        out.append('</div>')
    if not any(p.runs for p in tf.paragraphs):
        # 没有 runs 但有文本（占位符常见）
        for p in tf.paragraphs:
            if p.text:
                out.append('<div style="margin:0 0 4px;">%s</div>' % css_escape(p.text))
    return ''.join(out)

def shape_html(shape, assets_dir, rel_assets):
    """递归把一个 shape 渲染成绝对定位的 div。"""
    left = px(getattr(shape, 'left', 0) or 0)
    top = px(getattr(shape, 'top', 0) or 0)
    w = px(getattr(shape, 'width', 0) or 0)
    h = px(getattr(shape, 'height', 0) or 0)
    style = ['position:absolute', 'left:%.1fpx' % left, 'top:%.1fpx' % top,
             'width:%.1fpx' % w, 'height:%.1fpx' % h, 'overflow:hidden', 'box-sizing:border-box']
    bg = fill_css(shape)
    if bg:
        style.append('background:%s' % bg)
    bd = line_css(shape)
    if bd:
        style.append(bd)

    inner = ''
    # 组合形状：递归
    try:
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            for ch in shape.shapes:
                inner += shape_html(ch, assets_dir, rel_assets)
    except Exception:
        pass

    # 图片
    try:
        if shape.shape_type == MSO_SHAPE_TYPE.PICTURE:
            img = shape.image
            blob = img.blob
            ext = (img.ext or 'png').lower()
            h2 = hashlib.md5(blob).hexdigest()[:10]
            fn = '%s.%s' % (h2, ext)
            with open(os.path.join(assets_dir, fn), 'wb') as f:
                f.write(blob)
            inner += '<img src="%s/%s" style="width:100%%;height:100%%;object-fit:fill;display:block;" />' % (rel_assets, fn)
    except Exception:
        pass

    # 文本
    try:
        if shape.has_text_frame:
            tf = shape.text_frame
            va = 'top'
            try:
                from pptx.enum.text import MSO_ANCHOR
                if tf.vertical_anchor == MSO_ANCHOR.MIDDLE:
                    va = 'center'
                elif tf.vertical_anchor == MSO_ANCHOR.BOTTOM:
                    va = 'bottom'
            except Exception:
                pass
            ha = 'left'
            try:
                # paragraph alignment
                p0 = tf.paragraphs[0] if tf.paragraphs else None
                if p0 is not None and p0.alignment is not None:
                    from pptx.enum.text import PP_ALIGN
                    if p0.alignment == PP_ALIGN.CENTER:
                        ha = 'center'
                    elif p0.alignment == PP_ALIGN.RIGHT:
                        ha = 'right'
            except Exception:
                pass
            inner += '<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:%s;text-align:%s;padding:4px;">%s</div>' % (va, ha, render_runs(tf, None))
    except Exception:
        pass

    # 表格
    try:
        if shape.has_table:
            tbl = shape.table
            rows = []
            for r in tbl.rows:
                cells = []
                for c in r.cells:
                    cells.append('<td style="border:1px solid #ddd;padding:4px;">%s</td>' % render_runs(c.text_frame, None))
                rows.append('<tr>%s</tr>' % ''.join(cells))
            inner += '<table style="width:100%%;border-collapse:collapse;font-size:12px;">%s</table>' % ''.join(rows)
    except Exception:
        pass

    return '<div style="%s">%s</div>' % (';'.join(style), inner)

def main():
    if len(sys.argv) < 3:
        sys.stdout.write('USAGE: pptx_preview.py <in.pptx> <out.html>')
        sys.exit(2)
    inp = sys.argv[1]
    outp = sys.argv[2]
    if not os.path.exists(inp):
        sys.stdout.write('PPTX_NOT_FOUND:' + inp)
        sys.exit(2)
    prs = Presentation(inp)
    sw = px(prs.slide_width)
    sh = px(prs.slide_height)
    ratio = '%.4f' % (sw / sh) if sh else '1.6'
    assets_dir = os.path.join(os.path.dirname(outp), os.path.splitext(os.path.basename(outp))[0] + '_assets')
    os.makedirs(assets_dir, exist_ok=True)
    rel_assets = os.path.basename(assets_dir)

    slides_html = []
    for idx, slide in enumerate(prs.slides):
        # 背景
        bg = None
        try:
            f = slide.background.fill
            from pptx.enum.dml import MSO_FILL
            if f.type == MSO_FILL.SOLID:
                bg = color_to_css(f.fore_color.rgb)
        except Exception:
            pass
        canvas_style = 'position:relative;width:100%%;aspect-ratio:%s;background:%s;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;margin:0 auto;box-shadow:0 2px 12px rgba(0,0,0,.08);' % (ratio, bg or '#fff')
        shapes = ''
        for shp in slide.shapes:
            try:
                shapes += shape_html(shp, assets_dir, rel_assets)
            except Exception as e:
                shapes += '<div style="color:red;font-size:10px;">[shape err: %s]</div>' % css_escape(str(e))
        slides_html.append(
            '<section class="slide" style="margin:0 0 24px;">'
            '<div style="font-size:11px;color:#999;margin-bottom:6px;">第 %d 页</div>'
            '<div style="%s">%s</div>'
            '</section>' % (idx + 1, canvas_style, shapes)
        )

    html = '''<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%s 预览</title>
<style>
*{box-sizing:border-box;}
body{margin:0;font-family:'Microsoft YaHei',sans-serif;background:#f5f6f8;color:#222;}
.wrap{max-width:960px;margin:0 auto;padding:24px 16px 48px;}
.head{font-size:15px;color:#666;margin-bottom:18px;border-bottom:1px solid #eee;padding-bottom:10px;}
.slide canvas{position:relative;}
</style></head><body><div class="wrap">
<div class="head">PPTX 预览 · %s · 共 %d 页</div>
%s
</div></body></html>''' % (
        css_escape(os.path.basename(inp)),
        css_escape(os.path.basename(inp)),
        len(prs.slides),
        ''.join(slides_html),
    )
    with open(outp, 'w', encoding='utf-8') as f:
        f.write(html)
    sys.stdout.write('OK ' + outp)

if __name__ == '__main__':
    main()
