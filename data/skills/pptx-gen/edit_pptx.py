# -*- coding: utf-8 -*-
"""edit_pptx.py — 打开已有 .pptx 做编辑后存回（python-pptx 的读写能力）。
用法: python edit_pptx.py --in report.pptx --edits edits.json [--out report2.pptx]
edits.json:
  { "replaceText": [ {"slide":0, "find":"旧", "replace":"新"} ],
    "setBody": [ {"slide":1, "bullets":["a","b"]} ],
    "setTitle": [ {"slide":0, "title":"新标题"} ],
    "addSlides": [ {spec 页…} ],          # 追加新页（同 gen spec 结构）
    "deleteSlides": [3] }                 # 删除页（0-based，先删后增，按原索引）
"""
import sys, os, json, argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from pptx import Presentation
    from pptx.util import Pt
    from pptx_tools import build_slide
except Exception as e:
    sys.stdout.write('PPTX_IMPORT_FAIL:' + str(e)); sys.exit(2)

def _slide(prs, idx):
    lst = list(prs.slides)
    if idx < 0 or idx >= len(lst):
        raise IndexError(f'页码 {idx} 越界（共 {len(lst)} 页）')
    return lst[idx]

def replace_text(slide, find, replace):
    n = 0
    for sh in slide.shapes:
        if not sh.has_text_frame: continue
        for p in sh.text_frame.paragraphs:
            for r in p.runs:
                if find in (r.text or ''):
                    r.text = r.text.replace(find, replace)
                    n += 1
    return n

def set_title(slide, title):
    # 优先改现有 title placeholder，否则改第一个文本框
    for sh in slide.shapes:
        if sh.has_text_frame and (sh == slide.shapes.title or 'title' in (sh.name or '').lower()):
            sh.text_frame.text = title
            return True
    # 回退：第一个文本框
    for sh in slide.shapes:
        if sh.has_text_frame:
            sh.text_frame.text = title
            return True
    return False

def set_body(slide, bullets):
    # 找 body placeholder（非 title 的文本框）
    target = None
    for sh in slide.shapes:
        if not sh.has_text_frame: continue
        if sh == slide.shapes.title: continue
        target = sh; break
    if target is None:
        return False
    tf = target.text_frame
    tf.clear()
    lines = ['• ' + b for b in bullets]
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run(); r.text = ln
    return True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inpptx', required=True)
    ap.add_argument('--edits', required=True)
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    if not os.path.exists(args.inpptx):
        sys.stdout.write('PPTX_NOT_FOUND:' + args.inpptx); sys.exit(2)
    with open(args.edits, 'r', encoding='utf-8') as f:
        edits = json.load(f)

    prs = Presentation(args.inpptx)
    log = []
    # 删页（移除引用 + drop 关系，让 part 不被存出，避免 Duplicate name 警告）
    for idx in sorted(edits.get('deleteSlides') or [], reverse=True):
        try:
            xml_slides = prs.slides._sldIdLst
            sldIdLst_entries = list(xml_slides)
            entry = sldIdLst_entries[idx]
            rId = entry.rId
            xml_slides.remove(entry)
            try: prs.part.drop_rel(rId)
            except Exception: pass
            log.append(f'删页 {idx}')
        except Exception as e:
            log.append(f'删页 {idx} 失败: {e}')

    # 改标题/正文/替换文本
    for item in (edits.get('setTitle') or []):
        try:
            s = _slide(prs, item['slide'])
            set_title(s, item['title']); log.append(f'改标题 页{item["slide"]}')
        except Exception as e: log.append(f'改标题失败: {e}')
    for item in (edits.get('setBody') or []):
        try:
            s = _slide(prs, item['slide'])
            set_body(s, item.get('bullets') or []); log.append(f'改正文 页{item["slide"]}')
        except Exception as e: log.append(f'改正文失败: {e}')
    for item in (edits.get('replaceText') or []):
        try:
            s = _slide(prs, item['slide'])
            n = replace_text(s, item['find'], item['replace'])
            log.append(f'替换文本 页{item["slide"]} 替换{n}处')
        except Exception as e: log.append(f'替换失败: {e}')

    # 追加新页
    theme = edits.get('theme') or {}
    base_dir = os.path.dirname(os.path.abspath(args.inpptx))
    for spec in (edits.get('addSlides') or []):
        try:
            build_slide(prs, spec, theme, base_dir=base_dir)
            log.append('追加新页')
        except Exception as e:
            log.append(f'追加页失败: {e}')

    outp = args.out or args.inpptx
    prs.save(outp)
    sys.stdout.write('OK ' + outp + ' | ' + ' ; '.join(log))

if __name__ == '__main__':
    main()
