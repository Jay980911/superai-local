# -*- coding: utf-8 -*-
"""xiaozhou-ppt · 数据化风格规格（替代写死的 StyleConfig）

设计目标：
  把「风格」从写死在代码里的 frozen dataclass，变成一份可被以下三种方式
  任意构造的 *数据*：
    1) 命名预设   load_style("xinzhongshi" | "modern" | "business" | ...)
    2) 直接字典   load_style({"ink": "#1A140E", "accent": "#F4A8C4", ...})
    3) 参考图卡   from_style_card(style_from_image 的输出)
    4) 文字 brief design_synth.synthesize(...) 最终也会产出可被 load_style 消费的字典

这样「原创能力」才成立：宿主（superai-local）可以按需从一段文字需求合成出
全新的风格规格，而不必为每种风格改一次代码。

字段向后兼容 build_deck.py 既有的 get_style() 用法（ink/cream/sand/gold/
muted/seal/white/title_font/.../card_fill/card_line 全部保留），并新增
accent / accent2 / tags 等原创风格常用字段。
"""
from dataclasses import dataclass, field, asdict, fields
from typing import List, Optional
from pptx.dml.color import RGBColor


def hex2rgb(hex_str):
    """'#F4A8C4' / 'F4A8C4' / RGBColor -> RGBColor。非法值回退到深灰。"""
    try:
        if isinstance(hex_str, RGBColor):
            return hex_str
        h = str(hex_str).lstrip("#").strip()
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return RGBColor(r, g, b)
    except Exception:
        return RGBColor(0x33, 0x2E, 0x2B)


def rgb2hex(color) -> str:
    try:
        return "#{:02X}{:02X}{:02X}".format(color[0], color[1], color[2])
    except Exception:
        return "#000000"


# 所有颜色字段（load_style 时统一转 RGBColor；to_dict 时统一转 hex）
COLOR_FIELDS = ("ink", "cream", "sand", "gold", "muted", "seal", "white",
               "accent", "accent2", "card_fill", "card_line")


@dataclass(frozen=True)
class StyleSpec:
    # —— 身份 ——
    name: str = "custom"
    vibe: str = ""
    mood: str = "mid"            # dark / mid / light
    layout: str = "editorial"
    # —— 色彩（兼容旧字段）——
    ink: str = "#1A140E"         # 深墨（底/压暗）
    cream: str = "#F3ECdc"       # 米白（主文字/浅底）
    sand: str = "#D2B488"        # 沙金（次文字）
    gold: str = "#B08D57"        # 点缀金线
    muted: str = "#9A825E"       # 弱文字
    seal: str = "#A63A2A"        # 印章/强调红
    white: str = "#F8F3E7"       # 纯亮
    # —— 原创风格扩展色 ——
    accent: str = "#E94752"      # 主强调（如泡泡粉/亮红）
    accent2: str = "#64C9D4"     # 次强调（如湖水蓝）
    card_fill: str = "#E6DDCA"
    card_line: str = "#D4C6AC"
    # —— 字体 ——
    title_font: str = "STXingkai"
    body_font: str = "KaiTi"
    secondary_font: str = "SimSun"
    english_font: str = "Times New Roman"
    # —— 字号 ——
    title_size: int = 78
    content_title_size: int = 48
    body_size: int = 15
    # —— 渲染参数 ——
    darken: float = 0.32
    # —— 组件标签（design_synth 决定启用哪些版式原语）——
    tags: tuple = field(default_factory=tuple)   # e.g. ("rounded_card","sticker","hero","matrix","map","timeline","chart")

    # ---- 便捷：返回 pptx 颜色对象 ----
    def rgb(self, key):
        return hex2rgb(getattr(self, key))

    def to_dict(self):
        # 手动构造，避免 asdict 递归处理 RGBColor(tuple 子类) 报错
        d = {}
        for f in fields(self):
            v = getattr(self, f.name)
            if f.name in COLOR_FIELDS and v is not None:
                d[f.name] = rgb2hex(v)
            elif f.name == "tags":
                d[f.name] = list(v)
            else:
                d[f.name] = v
        return d


# ---------------------------------------------------------------------------
# 命名预设（旧 3 套原样保留，另加两套通用原创基底，证明“数据即风格”）
# ---------------------------------------------------------------------------
STYLE_PRESETS = {
    "xinzhongshi": dict(
        name="xinzhongshi", vibe="新中式", mood="dark", layout="editorial",
        ink="#1A140E", cream="#F3ECdc", sand="#D2B488", gold="#B08D57",
        muted="#9A825E", seal="#A63A2A", white="#F8F3E7",
        accent="#A63A2A", accent2="#B08D57",
        card_fill="#E6DDCA", card_line="#D4C6AC",
        title_font="STXingkai", body_font="KaiTi", secondary_font="SimSun",
        english_font="Times New Roman",
        title_size=78, content_title_size=48, body_size=15, darken=0.32,
        tags=("seal", "hairline", "vline", "quote"),
    ),
    "modern": dict(
        name="modern", vibe="现代简约", mood="light", layout="grid",
        ink="#121A2A", cream="#F5F7FA", sand="#D8E3F0", gold="#3B82F6",
        muted="#6B788C", seal="#F06A6A", white="#FFFFFF",
        accent="#3B82F6", accent2="#64C9D4",
        card_fill="#E9F0F8", card_line="#C9D7E8",
        title_font="Aptos Display", body_font="Aptos", secondary_font="Microsoft YaHei",
        english_font="Aptos",
        title_size=54, content_title_size=40, body_size=16, darken=0.24,
        tags=("rounded_card", "chip", "grid"),
    ),
    "business": dict(
        name="business", vibe="商务汇报", mood="dark", layout="corporate",
        ink="#18222D", cream="#F4F1EA", sand="#D8C8A8", gold="#9A702F",
        muted="#707A85", seal="#9B3A32", white="#FFFFFF",
        accent="#9A702F", accent2="#3B6EA5",
        card_fill="#E9E4D9", card_line="#D2C7B4",
        title_font="Georgia", body_font="Microsoft YaHei", secondary_font="SimSun",
        english_font="Arial",
        title_size=52, content_title_size=38, body_size=15, darken=0.30,
        tags=("rounded_card", "chip", "hairline"),
    ),
    # —— 以下两套为“原创基底”示例：证明框架可承载非国风 ——
    "candy": dict(
        name="candy", vibe="甜美潮玩", mood="light", layout="playful",
        ink="#332E2B", cream="#F7F3EE", sand="#F4A8C4", gold="#E94752",
        muted="#A892A0", seal="#E94752", white="#FFFFFF",
        accent="#F4A8C4", accent2="#64C9D4",
        card_fill="#FFFFFF", card_line="rgba(233,71,82,0.15)",
        title_font="Microsoft YaHei", body_font="Microsoft YaHei",
        secondary_font="Microsoft YaHei", english_font="Arial",
        title_size=60, content_title_size=42, body_size=15, darken=0.12,
        tags=("rounded_card", "sticker", "hero", "chip", "matrix", "map", "timeline", "chart", "loop"),
    ),
    "tech": dict(
        name="tech", vibe="科技未来", mood="dark", layout="grid",
        ink="#0B1020", cream="#EAF2FF", sand="#9DB4D8", gold="#4F8CFF",
        muted="#7C8AA8", seal="#36E0C8", white="#FFFFFF",
        accent="#4F8CFF", accent2="#36E0C8",
        card_fill="#13203B", card_line="#27406E",
        title_font="Aptos Display", body_font="Microsoft YaHei",
        secondary_font="Microsoft YaHei", english_font="Aptos",
        title_size=58, content_title_size=40, body_size=15, darken=0.28,
        tags=("rounded_card", "chip", "grid", "chart", "loop", "timeline"),
    ),
}

# 保证所有预设都有完整字段（用默认补齐缺失键）
_DEFAULTS = asdict(StyleSpec())
for _k, _v in STYLE_PRESETS.items():
    _merged = dict(_DEFAULTS)
    _merged.update(_v)
    _merged["tags"] = tuple(_merged.get("tags", ()))
    STYLE_PRESETS[_k] = _merged


def load_style(name_or_dict):
    """str -> 预设；dict -> 直接构造（颜色字段统一转 RGBColor）。返回 StyleSpec。"""
    if isinstance(name_or_dict, StyleSpec):
        return name_or_dict
    if isinstance(name_or_dict, dict):
        d = dict(_DEFAULTS)
        d.update(name_or_dict)
        d["tags"] = tuple(d.get("tags", ()) or ())
        for f in COLOR_FIELDS:
            if f in d and d[f] is not None:
                d[f] = hex2rgb(d[f])
        return StyleSpec(**d)
    key = (name_or_dict or "xinzhongshi").lower()
    if key not in STYLE_PRESETS:
        raise ValueError(f"未知风格: {name_or_dict}，可选: {', '.join(STYLE_PRESETS)}")
    base = dict(STYLE_PRESETS[key])
    for f in COLOR_FIELDS:
        if f in base and base[f] is not None:
            base[f] = hex2rgb(base[f])
    return StyleSpec(**base)


def from_style_card(card: dict):
    """把 style_from_image.py 产出的风格卡 -> StyleSpec。

    规则：取 palette 里最深色作 ink、最浅色作 cream，次深作 accent；
    依据 theme_hint / mood 选字体；仅作启发式映射，不追求精确。
    """
    pal = card.get("palette") or ["#1A140E", "#F3ECdc", "#D2B488"]
    # 按亮度排序
    def lum(h):
        c = hex2rgb(h)
        return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    srt = sorted(pal, key=lum)
    ink = srt[0]
    cream = srt[-1]
    accent = srt[min(1, len(srt) - 1)]
    theme = (card.get("theme_hint") or "").lower()
    guofeng = any(k in theme for k in ("ink", "bamboo", "dune", "mist", "bronze", "mount", "plum", "lotus", "scholar", "stele"))
    if guofeng:
        title_font, body_font, secondary_font, english_font = "STXingkai", "KaiTi", "SimSun", "Times New Roman"
    else:
        title_font, body_font, secondary_font, english_font = "Microsoft YaHei", "Microsoft YaHei", "Microsoft YaHei", "Arial"
    mood = card.get("mood", "mid")
    d = dict(
        name="from_image", vibe=theme or "参考图风格", mood=mood, layout="editorial",
        ink=ink, cream=cream, sand=accent, gold=accent, muted="#9A825E",
        seal=accent, white="#FFFFFF", accent=accent, accent2=accent,
        card_fill="#E6DDCA", card_line="#D4C6AC",
        title_font=title_font, body_font=body_font, secondary_font=secondary_font,
        english_font=english_font,
        title_size=72, content_title_size=46, body_size=15,
        darken=0.30 if mood == "dark" else 0.18,
        tags=("rounded_card", "sticker", "chip"),
    )
    return load_style(d)


# 让老调用方 `from styles import get_style` 继续可用
def get_style(name_or_dict):
    return load_style(name_or_dict)
