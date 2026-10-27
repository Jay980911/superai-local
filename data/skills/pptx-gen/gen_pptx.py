# -*- coding: utf-8 -*-
"""gen_pptx.py — 按内容规格 spec.json 生成标准 .pptx（调 python-pptx）。
用法: python gen_pptx.py --spec spec.json --out report.pptx
spec.json 结构见 SKILL.md。stdout 打印结果，exit 0=成功。
"""
import sys, os, json, argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from pptx_tools import new_prs, build_slide
except Exception as e:
    sys.stdout.write('PPTX_IMPORT_FAIL:' + str(e))
    sys.exit(2)

DEFAULT_THEME = {
    'bg': '0F1B2D', 'titleColor': 'FFFFFF', 'bodyColor': 'C9D6E3',
    'accent': '4F9CFE', 'titleFont': 'Microsoft YaHei', 'bodyFont': 'Microsoft YaHei',
    'titleSize': 32, 'bodySize': 20,
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True, help='内容规格 json 文件路径')
    ap.add_argument('--out', required=True, help='输出 .pptx 路径')
    args = ap.parse_args()

    if not os.path.exists(args.spec):
        sys.stdout.write('SPEC_NOT_FOUND:' + args.spec); sys.exit(2)
    with open(args.spec, 'r', encoding='utf-8') as f:
        spec = json.load(f)

    theme = dict(DEFAULT_THEME)
    theme.update(spec.get('theme') or {})
    slides = spec.get('slides') or []
    if not slides:
        sys.stdout.write('SPEC_NO_SLIDES'); sys.exit(2)

    prs = new_prs()
    base_dir = os.path.dirname(os.path.abspath(args.spec))
    overflow_warn = []
    for i, s in enumerate(slides):
        try:
            build_slide(prs, s, theme, base_dir=base_dir)
            # 简单溢出检查：正文 bullets 每条 > 120 字 警告
            for b in (s.get('bullets') or []):
                if len(str(b)) > 120:
                    overflow_warn.append(f'第{i+1}页有超长文本({len(str(b))}字)，建议拆分')
        except Exception as e:
            overflow_warn.append(f'第{i+1}页构建失败: {e}')

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or '.', exist_ok=True)
    prs.save(args.out)
    msg = 'OK ' + args.out + f' ({len(prs.slides.__iter__.__self__._sldIdLst)} 页)'
    if overflow_warn:
        msg += '\nWARN ' + ' | '.join(overflow_warn)
    sys.stdout.write(msg)

if __name__ == '__main__':
    main()
