#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""xiaozhou-ppt · 一键准备本轮 deck 背景图（级联）

级联优先级（auto 模式，逐级退化，保证一定出图）：
  1. 用户实拍图（needs 条目给 photo 字段）→ 直接裁切复用
  2. 技能资产库 assets/backgrounds/ → 按 theme+stylehash 匹配复用（不生图、零成本）
  3. image-gen（$SUPERAI_IMAGEGEN）→ 缺多少生多少，prompt 由 prompts/backgrounds.md 主题词 + 通用句式 + 风格卡 prompt_hints 拼成
     → image-gen --mode auto 内部级联：大模型→图库→纹理
     → 生成后登记入库，下一份 deck 同主题同风格直接复用
  4. make_bg.py 程序化肌理 → image-gen 整体不可用时的终极兜底（不入库，临时生成）

指定模式（--bg-mode model|stock|texture）：
  用户明确要求「用大模型」「用图库」「用纹理」时，跳过资产库复用和其他层，
  只用 image-gen 的指定方式新鲜生成，失败不退化（尊重用户意图）。

用法：
  python scripts/prepare_backgrounds.py \
    --needs needs.json \
    [--style-card style_card.json] \
    --out backgrounds/ \
    [--bg-mode auto|model|stock|texture]

needs.json:
  [
    {"page":"cover","theme":"bamboo","role":"hero"},
    {"page":"content-1","theme":"ink-wash","role":"content"},
    {"page":"section-1","theme":"ink-mountain","role":"hero"},
    {"page":"content-2","theme":"paper","role":"content","photo":"ref.jpg"}
  ]

输出：
  out/<page>.png 每页一张背景（统一 1600x900，不足处裁切/压暗）
  stdout: JSON {"cover":"abs/path.png","content-1":"abs/path.png",...}
  副作用：image-gen 生成的图写入 assets/backgrounds/ 并登记 index.json
"""
import argparse
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # 技能根目录
ASSETS = ROOT / 'assets' / 'backgrounds'
INDEX = ASSETS / 'index.json'
PROMPTS_MD = ROOT / 'prompts' / 'backgrounds.md'
MAKE_BG = ROOT / 'scripts' / 'make_bg.py'

W, H = 1600, 900


# ---------- 资产库 ----------

def load_index():
    if INDEX.exists():
        try:
            return json.loads(INDEX.read_text(encoding='utf-8'))
        except Exception:
            return []
    return []


def save_index(entries):
    ASSETS.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding='utf-8')


def style_hash(style_card):
    """用风格卡的主色+题材+饱和组 hash，不同视觉风格的图隔开。"""
    if not style_card:
        return 'default'
    key = '|'.join(str(style_card.get(k, '')) for k in ('theme_hint', 'main_hex', 'sat', 'bright'))
    return hashlib.md5(key.encode('utf-8')).hexdigest()[:8] or 'default'


def library_pick(entries, theme, sh, used):
    """从库里挑一张未用过的（theme+stylehash 匹配），返回 entry 或 None。"""
    pool = [e for e in entries if e.get('theme') == theme and e.get('stylehash') == sh
            and e.get('file') not in used]
    if not pool:
        return None
    return random.choice(pool)


def library_register(src_file, theme, sh, prompt, source):
    """把一张生成好的图登记入库（移动到 assets 目录，写 index）。"""
    ASSETS.mkdir(parents=True, exist_ok=True)
    entries = load_index()
    n = len([e for e in entries if e.get('theme') == theme and e.get('stylehash') == sh]) + 1
    stem = f"{theme}_{sh}_{n:03d}"
    ext = Path(src_file).suffix.lower() or '.png'
    dst = ASSETS / f"{stem}{ext}"
    shutil.move(str(src_file), str(dst))
    entries.append({
        'file': str(dst),
        'theme': theme,
        'stylehash': sh,
        'prompt': prompt,
        'source': source,
        'created': int(os.path.getmtime(dst)),
    })
    save_index(entries)
    return dst


# ---------- prompt 拼装 ----------

def load_prompts():
    """解析 prompts/backgrounds.md → {theme_key: prompt_text}。单一来源，避免双份维护。"""
    if not PROMPTS_MD.exists():
        return {}
    md = PROMPTS_MD.read_text(encoding='utf-8')
    prompts = {}
    for m in re.finditer(r'\*\*([a-zA-Z][\w\-]*)[^\n*]*\*\*\n```\n(.*?)\n```', md, re.S):
        prompts[m.group(1)] = m.group(2).strip()
    return prompts


COMMON_SUFFIX = (
    "muted earth-tone low saturation, medium format film look, "
    "quiet luxury editorial photography, 16:9 landscape, "
    "absolutely NO text, NO letters, NO Chinese characters, NO logos, "
    "darker calm area on one side for overlay typography later"
)


def build_prompt(theme, prompts, style_card):
    base = prompts.get(theme)
    if not base:
        return None  # 主题不在提示词库 → 无法用大模型/图库生图
    hints = ''
    if style_card:
        hints = style_card.get('prompt_hints', '') or style_card.get('theme_hint', '')
    parts = [base, COMMON_SUFFIX]
    if hints:
        parts.append(hints)
    return ', '.join(parts)


# ---------- 各级生成器 ----------

def gen_image_gen(prompt, out_path, bg_mode='auto'):
    """调 image-gen.mjs（环境变量 $SUPERAI_IMAGEGEN）生成一张，成功返回 True。
    bg_mode: auto(级联) / model / stock / texture，透传给 image-gen --mode。"""
    script = os.environ.get('SUPERAI_IMAGEGEN')
    if not script or not Path(script).exists():
        return False
    node = os.environ.get('SUPERAI_NODE') or shutil.which('node') or shutil.which('node.exe')
    if not node:
        return False
    try:
        r = subprocess.run(
            [node, script, '--prompt', prompt, '--out', str(out_path), '--size', f'{W}x{H}', '--mode', bg_mode],
            capture_output=True, text=True, timeout=180,
        )
        return r.returncode == 0 and out_path.exists()
    except Exception:
        return False


def gen_make_bg(theme, out_path):
    """程序化兜底：调 make_bg.py 生成一张该主题肌理。"""
    if not MAKE_BG.exists():
        return False
    py = sys.executable or 'python'
    try:
        r = subprocess.run(
            [py, str(MAKE_BG), '--themes', theme, '--out', str(out_path.parent), '--count', '1'],
            capture_output=True, text=True, timeout=60,
        )
        # make_bg 输出 <out>/bg-<theme>-NN.png，找最新的
        if r.returncode == 0:
            cands = sorted(out_path.parent.glob(f'*{theme}*.png'), key=os.path.getmtime, reverse=True)
            if cands:
                shutil.move(str(cands[0]), str(out_path))
                return out_path.exists()
        return False
    except Exception:
        return False


def ensure_size(path):
    """统一到 1600x900（裁切/缩放），避免比例不一致。"""
    try:
        from PIL import Image
        im = Image.open(path).convert('RGB')
        if im.size == (W, H):
            return
        tw, th = im.size
        target_ratio = W / H
        cur = tw / th
        if cur > target_ratio:
            new_w = int(th * target_ratio)
            left = (tw - new_w) // 2
            im = im.crop((left, 0, left + new_w, th))
        else:
            new_h = int(tw / target_ratio)
            top = (th - new_h) // 2
            im = im.crop((0, top, tw, top + new_h))
        im = im.resize((W, H))
        im.save(path)
    except Exception:
        pass


# ---------- 主流程 ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--needs', required=True, help='needs.json 路径')
    ap.add_argument('--style-card', default=None, help='style_from_image.py 产出的风格卡（可选）')
    ap.add_argument('--out', required=True, help='本轮背景输出目录')
    ap.add_argument('--bg-mode', default='auto', choices=['auto', 'model', 'stock', 'texture'],
                   help='背景生成方式：auto(级联,默认) / model(只大模型) / stock(只图库) / texture(只纹理)。用户指定方式时用非 auto。')
    ap.add_argument('--seed', type=int, default=None)
    args = ap.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    needs = json.loads(Path(args.needs).read_text(encoding='utf-8'))
    style_card = None
    if args.style_card and Path(args.style_card).exists():
        style_card = json.loads(Path(args.style_card).read_text(encoding='utf-8'))
    sh = style_hash(style_card)
    prompts = load_prompts()

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = load_index()
    used = set()   # 本轮已用的资产文件，避免同 deck 内重复
    result = {}
    specified = args.bg_mode != 'auto'

    for item in needs:
        page = item['page']
        theme = item.get('theme', 'paper')
        role = item.get('role', 'content')
        photo = item.get('photo')
        dest = out_dir / f"{page}.png"

        # 0. 用户实拍图（始终优先）
        if photo and Path(photo).exists():
            shutil.copy(str(photo), str(dest))
            ensure_size(dest)
            result[page] = str(dest)
            print(f"[bg] {page} <- photo {photo}", file=sys.stderr)
            continue

        done = False

        # 1. 资产库复用（仅 auto 模式；指定方式时跳过，保证用指定方式新鲜生成）
        if not done and not specified:
            pick = library_pick(entries, theme, sh, used)
            if pick:
                shutil.copy(pick['file'], str(dest))
                used.add(pick['file'])
                ensure_size(dest)
                result[page] = str(dest)
                print(f"[bg] {page} <- library {pick['file']}", file=sys.stderr)
                done = True

        # 2. image-gen 生成并入库（按 bg_mode 调用；auto 时 image-gen 内部级联 model→stock→texture）
        if not done:
            prompt = build_prompt(theme, prompts, style_card)
            need_prompt = args.bg_mode != 'texture'
            if prompt or not need_prompt:
                tmp = out_dir / f"_gen_{page}.png"
                gen_arg = prompt if need_prompt else theme
                if gen_image_gen(gen_arg, tmp, args.bg_mode):
                    src_tag = f"image-gen:{args.bg_mode}"
                    reg_prompt = prompt if prompt else f"texture:{theme}"
                    registered = library_register(tmp, theme, sh, reg_prompt, src_tag)
                    shutil.copy(str(registered), str(dest))
                    used.add(str(registered))
                    ensure_size(dest)
                    result[page] = str(dest)
                    print(f"[bg] {page} <- image-gen({args.bg_mode}) 入库", file=sys.stderr)
                    done = True
                else:
                    print(f"[bg] {page} image-gen({args.bg_mode}) 失败", file=sys.stderr)

        # 3. auto 模式终极兜底：image-gen 整体不可用时用 make_bg（指定模式不走此层）
        if not done and not specified:
            if gen_make_bg(theme, dest):
                ensure_size(dest)
                result[page] = str(dest)
                print(f"[bg] {page} <- make_bg (程序化兜底)", file=sys.stderr)
                done = True

        if not done:
            # 全部失败：纯色底保底，绝不留空
            try:
                from PIL import Image
                Image.new('RGB', (W, H), (26, 20, 14)).save(dest)
            except Exception:
                pass
            result[page] = str(dest)
            tag = "纯色兜底（指定方式失败，未退化）" if specified else "纯色兜底（全部生成失败）"
            print(f"[bg] {page} <- {tag}", file=sys.stderr)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
