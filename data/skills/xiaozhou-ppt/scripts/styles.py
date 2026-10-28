# -*- coding: utf-8 -*-
"""xiaozhou-ppt 的多风格设计参数。"""
from dataclasses import dataclass
from pptx.dml.color import RGBColor

@dataclass(frozen=True)
class StyleConfig:
    name: str
    ink: RGBColor
    cream: RGBColor
    sand: RGBColor
    gold: RGBColor
    muted: RGBColor
    seal: RGBColor
    white: RGBColor
    title_font: str
    body_font: str
    secondary_font: str
    english_font: str
    title_size: int
    content_title_size: int
    body_size: int
    darken: float
    layout: str
    card_fill: RGBColor
    card_line: RGBColor

STYLES = {
    "xinzhongshi": StyleConfig(
        "xinzhongshi", RGBColor(0x1A,0x14,0x0E), RGBColor(0xF3,0xEC,0xDC),
        RGBColor(0xD2,0xB4,0x88), RGBColor(0xB0,0x8D,0x57), RGBColor(0x9A,0x82,0x5E),
        RGBColor(0xA6,0x3A,0x2A), RGBColor(0xF8,0xF3,0xE7), "STXingkai", "KaiTi",
        "SimSun", "Times New Roman", 78, 48, 15, 0.32, "editorial", RGBColor(0xE6,0xDD,0xCA), RGBColor(0xD4,0xC6,0xAC)
    ),
    "modern": StyleConfig(
        "modern", RGBColor(0x12,0x1A,0x2A), RGBColor(0xF5,0xF7,0xFA),
        RGBColor(0xD8,0xE3,0xF0), RGBColor(0x3B,0x82,0xF6), RGBColor(0x6B,0x78,0x8C),
        RGBColor(0xF0,0x6A,0x6A), RGBColor(0xFF,0xFF,0xFF), "Aptos Display", "Aptos",
        "Microsoft YaHei", "Aptos", 54, 40, 16, 0.24, "grid", RGBColor(0xE9,0xF0,0xF8), RGBColor(0xC9,0xD7,0xE8)
    ),
    "business": StyleConfig(
        "business", RGBColor(0x18,0x22,0x2D), RGBColor(0xF4,0xF1,0xEA),
        RGBColor(0xD8,0xC8,0xA8), RGBColor(0x9A,0x70,0x2F), RGBColor(0x70,0x7A,0x85),
        RGBColor(0x9B,0x3A,0x32), RGBColor(0xFF,0xFF,0xFF), "Georgia", "Microsoft YaHei",
        "SimSun", "Arial", 52, 38, 15, 0.30, "corporate", RGBColor(0xE9,0xE4,0xD9), RGBColor(0xD2,0xC7,0xB4)
    ),
}

def get_style(name):
    key = (name or "xinzhongshi").lower()
    if key not in STYLES:
        raise ValueError(f"未知风格: {name}，可选: {', '.join(STYLES)}")
    return STYLES[key]
