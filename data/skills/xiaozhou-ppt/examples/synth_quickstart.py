# -*- coding: utf-8 -*-
"""xiaozhou-ppt · 原创能力演示 / 冒烟测试（中性主题，不依赖任何成品）

运行：
    python examples/synth_quickstart.py
产出：
    - 打印 synthesize 得到的 style / plan / image_needs 摘要
    - 用合成出的风格 + 组件库画一张“组件货架”测试页，存到 examples/_smoke.pptx
      （证明 StyleSpec + components 可离线渲染，不依赖任何外部图）
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from style_spec import load_style, hex2rgb
from design_synth import synthesize
from components import (rounded_card, sticker_tag, chip, stat_tile, bar_chart,
                        timeline, abstract_map, loop_diagram, matrix_grid)
from build_deck import Deck


def main():
    # 1) 从文字 brief 原创出风格（中性主题：国潮茶饮，验证“非国风也能原创”）
    brief = {
        "topic": "国潮茶饮品牌「青厘」",
        "vibe": "甜美潮玩",                     # candy 基底：奶油白+泡泡粉+亮红+湖水蓝
        "colors": ["#F7F3EE", "#F4A8C4", "#E94752", "#64C9D4"],
        "elements": ["圆角卡片", "贴纸标签", "IP矩阵", "时间轴", "图表", "海外地图", "闭环"],
        "mood": "年轻鲜明、有收藏感、不过度幼稚",
    }
    res = synthesize(brief, out_dir=str(HERE / "_synth_out"))
    print("=== synthesize 摘要 ===")
    print("风格名 :", res["style"]["name"], "| 标签:", res["style"]["tags"])
    print("页面规划:", [p["type"] for p in res["plan"]])
    print("主体图需求数:", len(res["image_needs"]["subjects"]))

    # 2) 用合成出的风格构造 Deck，画一张“组件货架”测试页
    spec = load_style(res["style"])
    deck = Deck(style=spec)
    s = deck._slide()
    deck.fill_bg(s, hex2rgb(spec.cream))

    rounded_card(deck, s, spec, 0.5, 0.5, 3.0, 1.6, radius=0.1)
    sticker_tag(deck, s, spec, 0.7, 0.7, "NEW 上新", bg=spec.accent, rotate=-6)
    chip(deck, s, spec, 0.7, 1.7, "#国潮 #茶饮", bg=spec.accent2)

    stat_tile(deck, s, spec, 3.8, 0.5, 2.4, 1.6, "1.2亿", "年营收(元)", "同比 +48%", color=spec.accent)
    bar_chart(deck, s, spec, 6.5, 0.5, 6.0, 3.2,
              [("华东", 82), ("华南", 64), ("华北", 51), ("海外", 37)], color=spec.accent)

    timeline(deck, s, spec, 0.5, 4.0, 12.0,
             [("2018", "创立", "首店"), ("2020", "出圈", "联名"), ("2023", "出海", "东南亚"), ("2025", "生态", "全品类")])
    abstract_map(deck, s, spec, 0.5, 6.6, 6.0, 0.7,
                 [(0.22, 0.4, "上海"), (0.5, 0.3, "东京"), (0.78, 0.5, "新加坡")])
    loop_diagram(deck, s, spec, 10.5, 7.0, 1.4,
                 [("产品", "IP茶"), ("内容", "社媒"), ("渠道", "门店"), ("用户", "复购")], color=spec.accent)

    out = HERE / "_smoke.pptx"
    deck.save(str(out))
    print("\n冒烟测试通过：", out, "（共", len(deck.prs.slides._sldIdLst), "页）")


if __name__ == "__main__":
    main()
