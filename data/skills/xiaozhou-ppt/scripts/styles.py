# -*- coding: utf-8 -*-
"""xiaozhou-ppt 风格入口（兼容层）

历史版本在此硬编码 3 个 frozen StyleConfig。现统一改为数据化 StyleSpec：
本文件仅做重导出，保证 `from styles import get_style / StyleConfig` 的旧调用
继续可用，真正的规格定义见 style_spec.py。

如需新增风格，请编辑 style_spec.STYLE_PRESETS（加一条 dict 即可），
不要再在此写死类。
"""
from style_spec import (  # noqa: F401
    StyleSpec,
    STYLE_PRESETS,
    load_style,
    from_style_card,
    get_style,
    hex2rgb,
    rgb2hex,
)

# 兼容别名：旧代码里的 StyleConfig 即 StyleSpec
StyleConfig = StyleSpec
