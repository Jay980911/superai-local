#!/usr/bin/env python3
"""Audit a frontend workspace for journey/flow and Gestalt evidence."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

TEXT_EXTENSIONS = {
    ".astro",
    ".css",
    ".html",
    ".htm",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mdx",
    ".svelte",
    ".ts",
    ".tsx",
    ".txt",
    ".vue",
    ".yaml",
    ".yml",
}
HTML_LIKE_EXTENSIONS = {".astro", ".html", ".htm", ".jsx", ".svelte", ".tsx", ".vue"}
CODE_EXTENSIONS = {
    ".astro",
    ".css",
    ".html",
    ".htm",
    ".js",
    ".jsx",
    ".svelte",
    ".ts",
    ".tsx",
    ".vue",
}
DOC_EXTENSIONS = {".json", ".md", ".mdx", ".txt", ".yaml", ".yml"}
IGNORE_DIRS = {
    ".git",
    ".idea",
    ".next",
    ".turbo",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "logs",
    "node_modules",
    "out",
    "tmp",
}
TOKEN_SPEC_CANDIDATES = (
    Path("docs/design-token-board.md"),
    Path("docs/design-system/design-token-board.md"),
    Path("docs/ui/design-token-board.md"),
)
ANCHOR_JUMP_SKIP_IDS = {"app", "content", "main", "root", "top"}
VISIBLE_SURFACE_TAG_PATTERN = re.compile(
    r"<(?:section|article|aside|div)\b[^>]*(?:class|id)=['\"][^'\"]*"
    r"(hero|intro|flow|stage|panel|shell|board|forecast|insight|ledger|budget|mix|chart|summary|rail|sidebar|deck|transaction|history|report|breakdown)"
    r"[^'\"]*['\"][^>]*>",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)
SECONDARY_SURFACE_HINT_PATTERN = re.compile(
    r"(budget|forecast|insight|ledger|transaction|history|report|breakdown|mix|details?)",
    re.IGNORECASE,
)
HIDDEN_SURFACE_PATTERN = re.compile(
    r"\bhidden\b|aria-hidden\s*=\s*['\"]true['\"]|data-state\s*=\s*['\"](?:closed|collapsed|inactive)['\"]|data-collapsed\s*=\s*['\"]true['\"]|\binert\b|display\s*:\s*none",
    re.IGNORECASE,
)
DEFERRED_CONTAINER_HINT_PATTERN = re.compile(
    r"(panel|section|stage|shell|board|drawer|dialog|modal|sheet|tab|view|accordion|details|sidebar|rail)",
    re.IGNORECASE,
)
NON_DEFERRED_STATE_HINT_PATTERN = re.compile(
    r"(empty|error|loading|skeleton|placeholder)",
    re.IGNORECASE,
)
ANCHOR_LINK_PATTERN = re.compile(
    r"<(?:a|button)\b[^>]*(?:href\s*=\s*['\"]#(?P<href>[A-Za-z][\w:-]*)['\"]|"
    r"data-(?:scroll-target|jump-target|scroll-to)\s*=\s*['\"]#?(?P<data>[A-Za-z][\w:-]*)['\"]|"
    r"aria-controls\s*=\s*['\"](?P<controls>[A-Za-z][\w:-]*)['\"])[^>]*>",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)
JS_SCROLL_TARGET_PATTERN = re.compile(
    r"(?:scrollIntoView|location\.hash\s*=|window\.location\.hash\s*=).*?['\"]#?(?P<id>[A-Za-z][\w:-]*)['\"]",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)

CHECK_ORDER = [
    "journey_map_structure",
    "system_status_visibility",
    "workbench_ia_structure",
    "project_artifact_requirements",
    "viewport_budget_proxies",
    "right_rail_waste_proxies",
    "disclosure_control_signals",
    "always_visible_surface_risk",
    "anchor_jump_stack_risk",
    "card_farm_risk",
    "guideline_doc_structure",
    "gestalt_proximity_common_region",
    "gestalt_similarity",
    "gestalt_figure_ground",
    "gestalt_continuation",
    "anti_pattern_signals",
]
EARLY_UI_GATE_IDS = {
    "viewport_budget_proxies",
    "right_rail_waste_proxies",
    "disclosure_control_signals",
    "always_visible_surface_risk",
    "anchor_jump_stack_risk",
    "card_farm_risk",
}

MANUAL_REVIEW_ITEMS = [
    "人工確認 Closure：畫面是否靠缺口暗示整體，不靠額外文字補救理解。",
    "人工確認 Common Fate：動畫或移動中的元素是否真的屬於同一群組，且不會誤導焦點。",
    "人工確認 Praegnanz：複雜畫面是否被簡化成清楚、可掃描的形狀與層次。",
    "人工確認 deferred blocks 是否真的有合理的隱藏理由、揭露事件與容器，而不是任意藏起來。",
]
ALLOW_ANTI_PATTERN_MARKER = "audit: allow-anti-pattern"


@dataclass(frozen=True)
class Evidence:
    path: str
    line: int
    snippet: str

    def to_dict(self) -> dict[str, object]:
        return {"path": self.path, "line": self.line, "snippet": self.snippet}


PATTERN_GROUPS = {
    "journey_actor": [
        r"\bpersona\b",
        r"\buser\b",
        r"\bactor\b",
        "使用者",
        "角色",
        "目標客群",
    ],
    "journey_scenario": [
        r"\bscenario\b",
        r"\bgoal\b",
        r"\bjob to be done\b",
        r"\btask\b",
        "情境",
        "任務",
        "目標",
    ],
    "journey_steps": [
        r"\bjourney\b",
        r"\buser flow\b",
        r"\bwireflow\b",
        r"\bphase\b",
        r"\bstep\b",
        r"\btouchpoint\b",
        r"\bscreen\b",
        "旅程",
        "流程",
        "步驟",
        "階段",
        "觸點",
    ],
    "journey_evidence": [
        r"\bthinking\b",
        r"\bfeeling\b",
        r"\bsaying\b",
        r"\binsight\b",
        r"\bpain point\b",
        r"\bopportunit(y|ies)\b",
        "想法",
        "感受",
        "洞察",
        "痛點",
        "機會",
        "回饋",
    ],
    "system_status_visibility": [
        r"aria-current\s*=\s*['\"]step['\"]",
        r"aria-current",
        r"\bprogress(bar)?\b",
        r"\bstepper\b",
        r"\bcurrent step\b",
        r"\bcompleted\b",
        r"\bnext step\b",
        "目前步驟",
        "下一步",
        "進度",
        "完成",
        "loading",
    ],
    "workbench_primary_task": [
        r"\bprimary task\b",
        r"\bprimary goal\b",
        "唯一主任務",
        "唯一主目標",
        "主要任務",
        "主舞台",
    ],
    "workbench_task_model": [
        r"\btask model\b",
        "次目標",
        "低頻目標",
        "罕見目標",
        "secondary goal",
        "low-frequency",
        "rare goal",
    ],
    "workbench_state_model": [
        r"\bstate model\b",
        r"\bempty\b",
        r"\bdrafting\b",
        r"\bvalidating\b",
        r"\bresolved\b",
        r"\bblocked\b",
        r"\bsubmitted\b",
        "進入條件",
        "必顯資訊",
        "隱藏資訊",
        "離開條件",
    ],
    "workbench_information_architecture": [
        r"\binformation architecture\b",
        "資訊架構表",
        "是否首屏必須",
        "顯示條件",
        "建議容器",
        "是否可收合",
    ],
    "workbench_visibility_plan": [
        r"\bvisibility plan\b",
        "揭露策略",
        "首屏保留",
        "on-demand",
        "首屏",
        "主要視覺群組",
        "主 CTA",
    ],
    "workbench_content_audit": [
        "must-see-now",
        "next-step-only",
        "error-only",
        "on-demand-reference",
        "keep-off-first-viewport",
        "現在必須看",
        "下一步才需要看",
        "只有出錯才需要看",
        "不應該出現在首屏",
    ],
    "workbench_deferred_reason": [
        "hidden_now_because",
        "reveal_trigger",
        "deferred block",
        "隱藏理由",
        "揭露事件",
        "延後揭露",
        "為什麼現在可以先隱藏",
        "何時應該顯示",
    ],
    "viewport_budget_signals": [
        r"100dvh",
        r"100vh",
        r"min-h-(screen|dvh)",
        r"h-(screen|dvh)",
        r"minmax\(0,\s*1fr\)",
        r"grid-template-columns",
        r"\bflex-1\b",
        r"flex:\s*1\b",
        r"min-width\s*:\s*0",
        r"overflow-wrap\s*:\s*anywhere",
        r"@media",
        r"@container",
        r"clamp\(",
        r"role\s*=\s*['\"]main['\"]",
        r"<main\b",
    ],
    "primary_surface_layout_signals": [
        r"primary[-_ ]task",
        r"primary[-_ ]surface",
        r"primary[-_ ]workbench",
        r"\bworkbench\b",
        r"\bworkspace\b",
        r"\beditor\b",
        r"\bviewer\b",
        r"\bcanvas\b",
        r"\breview-shell\b",
        r"\bapp-frame\b",
        r"\bmain-stage\b",
        "主舞台",
        "主功能區",
        "主要工作區",
    ],
    "disclosure_control_signals": [
        r"aria-expanded",
        r"aria-controls",
        r"aria-selected",
        r"data-state",
        r"data-open",
        r"data-collapsed",
        r"data-panel",
        r"\bhidden\b",
        r"\binert\b",
        r"<Tabs?\b",
        r"<Accordion\b",
        r"<Drawer\b",
        r"<Dialog\b",
        r"<Modal\b",
        r"<Sheet\b",
        r"<Popover\b",
        r"<Collapsible\b",
        r"\baccordion\b",
        r"\bdrawer\b",
        r"\bmodal\b",
        r"\bdialog\b",
        r"\bsheet\b",
        r"\btablist\b",
        r"\btabpanel\b",
        r"\bstepper\b",
        r"\bwizard\b",
    ],
    "card_surface_signals": [
        r"<Card\b",
        r"\bcard-grid\b",
        r"\bcard-list\b",
        r"\bstats-card\b",
        r"\bsummary-card\b",
        r"\bmetric-card\b",
        r"\bkpi-card\b",
        r"\bdashboard-card\b",
        r"\bcard-in-card\b",
        r"class(Name)?\s*=\s*['\"][^'\"]*\bcard\b",
    ],
    "summary_surface_signals": [
        r"\bsummary\b",
        r"\bkpi\b",
        r"\bmetric(s)?\b",
        r"\bstats?\b",
        r"\binsight(s)?\b",
        "摘要",
        "指標",
        "統計",
        "總覽",
    ],
    "gestalt_proximity_common_region": [
        r"\bgap-[a-z0-9-]+\b",
        r"\bspace-[xy]-[a-z0-9-]+\b",
        r"\bp-(x|y|t|r|b|l)?-?[a-z0-9-]+\b",
        r"<section\b",
        r"<fieldset\b",
        r"<ul\b",
        "分組",
        "群組",
        "區塊",
        "間距",
    ],
    "gestalt_similarity": [
        r"\bvariant\b",
        r"\bvariants\b",
        r"\bdesign token\b",
        r"\btokens\b",
        r"--(background|surface|text|primary|secondary)",
        r"\bclass-variance-authority\b",
        "一致",
        "同一套",
        "變體",
        "語意 token",
    ],
    "gestalt_figure_ground": [
        r"--background\b",
        r"--surface\b",
        r"--text\b",
        r"\bcontrast\b",
        r"\bforeground\b",
        r"\bbackground\b",
        "前景",
        "背景",
        "對比",
        "層次",
    ],
    "gestalt_continuation": [
        r"\btimeline\b",
        r"\bstepper\b",
        r"\bconnector\b",
        r"\bsequence\b",
        r"\bpath\b",
        r"<ol\b",
        "時間線",
        "時間軸",
        "導引",
        "連接",
        "順序",
        "流程線",
    ],
}

GUIDELINE_SECTION_PATTERNS = {
    "usage": [r"^#+\s*usage\b", "使用情境", "適用情境", "使用規範"],
    "layout": [r"^#+\s*layout\b", "版面", "佈局", "間距規範"],
    "anatomy": [r"^#+\s*anatomy\b", "結構拆解", "元件結構", "構成"],
    "states_spec": [r"^#+\s*states?\b", r"^#+\s*spec\b", "狀態", "規格"],
    "interaction": [r"^#+\s*interaction\b", "互動", "行為規範", "鍵盤操作"],
    "content_asset": [r"^#+\s*content\b", r"^#+\s*asset\b", "文案", "資產"],
}

ANTI_PATTERN_RULES = {
    "generic-font-stack": {
        "message": "偵測到過度通用的字體選擇，可能落回 skill 已禁止的 generic AI aesthetic。",
        "patterns": [
            r"font-family[^;\n]*(inter|roboto|arial|open sans|system-ui)",
            r"from ['\"]next/font/google['\"].*(Inter|Roboto)",
            r"fonts\.googleapis\.com.*(Inter|Roboto|Open\+Sans)",
        ],
    },
    "gradient-text": {
        "message": "偵測到常見的 gradient text 手法，請確認不是為了追求花俏而犧牲可讀性。",
        "patterns": [
            r"bg-clip-text",
            r"background-clip\s*:\s*text",
            r"text-transparent",
        ],
    },
    "pure-black-white": {
        "message": "偵測到純黑/純白色碼，請確認不是直接套用廉價高對比而忽略層次。",
        "patterns": [
            r"#[0]{3,6}\b",
            r"#[fF]{3,6}\b",
            r"rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)",
            r"rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)",
        ],
    },
    "generic-cta-copy": {
        "message": "偵測到模糊 CTA 文案，應改成對任務更具體的動詞或結果。",
        "patterns": [
            r">\s*(OK|Submit|Yes|No)\s*<",
            r"['\"](OK|Submit|Yes|No)['\"]",
        ],
    },
    "generic-error-copy": {
        "message": "偵測到過度籠統的錯誤訊息，應補上原因、修正方式或 recovery action。",
        "patterns": [
            r"something went wrong",
            r"an error occurred",
            r"invalid input",
        ],
    },
    "process-language-copy": {
        "message": "偵測到可能把 spec/review 語言直接放進 UI copy，請確認使用者可見文案沒有外漏內部流程語言。",
        "patterns": [
            r"避免卡片堆疊",
            r"只保留一個主行動",
            r"不是摘要卡片堆疊",
            r"功能停車場",
            r"決策介面",
            r"design review",
            r"primary task",
        ],
    },
    "glassmorphism-overuse": {
        "message": "偵測到玻璃擬態相關樣式，請確認不是無差別套用造成資訊層次模糊。",
        "patterns": [
            r"backdrop-blur",
            r"backdrop-filter",
            r"glassmorphism",
        ],
    },
}


def iter_text_files(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        relative_parts = path.relative_to(root).parts
        if any(part in IGNORE_DIRS for part in relative_parts):
            continue
        if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS:
            yield path


def is_skill_folder(root: Path) -> bool:
    return (
        (root / "SKILL.md").exists()
        and (root / "references").is_dir()
        and (root / "assets" / "evals").is_dir()
    )


def iter_doc_files(root: Path) -> Iterable[Path]:
    for path in iter_text_files(root):
        if path.suffix.lower() in DOC_EXTENSIONS:
            yield path


def iter_code_files(root: Path) -> Iterable[Path]:
    for path in iter_text_files(root):
        if path.suffix.lower() in CODE_EXTENSIONS:
            yield path


def iter_html_like_files(root: Path) -> Iterable[Path]:
    for path in iter_text_files(root):
        if path.suffix.lower() in HTML_LIKE_EXTENSIONS:
            yield path


def find_matches(path: Path, patterns: list[str]) -> list[Evidence]:
    text = path.read_text(encoding="utf-8")
    matches: list[Evidence] = []
    compiled = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]

    for line_no, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        if any(regex.search(line) for regex in compiled):
            matches.append(
                Evidence(
                    path=str(path),
                    line=line_no,
                    snippet=line[:160],
                )
            )
    return matches


def find_whole_text_match(path: Path, pattern: str) -> Evidence | None:
    text = path.read_text(encoding="utf-8")
    regex = re.compile(pattern, re.IGNORECASE | re.MULTILINE | re.DOTALL)
    match = regex.search(text)
    if not match:
        return None
    line_no = text[: match.start()].count("\n") + 1
    line = text.splitlines()[line_no - 1].strip() if text.splitlines() else ""
    return Evidence(path=str(path), line=line_no, snippet=line[:160])


def build_evidence_from_offset(path: Path, text: str, offset: int) -> Evidence:
    line_no = text[:offset].count("\n") + 1
    line = text.splitlines()[line_no - 1].strip() if text.splitlines() else ""
    return Evidence(path=str(path), line=line_no, snippet=line[:160])


def extract_three_column_balance_evidence(root: Path) -> tuple[Evidence | None, float | None]:
    pattern = re.compile(r"grid-template-columns\s*:\s*([^;]+);", re.IGNORECASE | re.MULTILINE | re.DOTALL)
    fr_pattern = re.compile(r"([0-9]*\.?[0-9]+)fr", re.IGNORECASE)

    for path in iter_code_files(root):
        if path.suffix.lower() != ".css":
            continue
        text = path.read_text(encoding="utf-8")
        for match in pattern.finditer(text):
            value = match.group(1)
            fr_values = [float(item) for item in fr_pattern.findall(value)]
            if len(fr_values) < 3:
                continue
            center = fr_values[1]
            total = sum(fr_values[:3])
            if total <= 0:
                continue
            center_ratio = center / total
            if center_ratio < 0.5:
                line_no = text[: match.start()].count("\n") + 1
                line = text.splitlines()[line_no - 1].strip() if text.splitlines() else ""
                return (
                    Evidence(
                        path=str(path),
                        line=line_no,
                        snippet=(line or value.strip())[:160],
                    ),
                    center_ratio,
                )
    return None, None


def extract_surface_evidence(root: Path) -> tuple[list[Evidence], list[Evidence], list[Evidence]]:
    visible_surfaces: list[Evidence] = []
    hidden_surfaces: list[Evidence] = []
    secondary_surfaces: list[Evidence] = []

    for path in iter_html_like_files(root):
        text = path.read_text(encoding="utf-8")
        for match in VISIBLE_SURFACE_TAG_PATTERN.finditer(text):
            evidence = build_evidence_from_offset(path, text, match.start())
            tag_text = match.group(0)
            if HIDDEN_SURFACE_PATTERN.search(tag_text):
                if DEFERRED_CONTAINER_HINT_PATTERN.search(tag_text) and not NON_DEFERRED_STATE_HINT_PATTERN.search(tag_text):
                    hidden_surfaces.append(evidence)
                continue
            visible_surfaces.append(evidence)
            if SECONDARY_SURFACE_HINT_PATTERN.search(tag_text):
                secondary_surfaces.append(evidence)

    return visible_surfaces, hidden_surfaces, secondary_surfaces


def find_target_surface(root: Path, target_id: str) -> tuple[Evidence | None, bool]:
    id_pattern = re.compile(
        rf"<(?:section|article|aside|div)\b[^>]*id=['\"]{re.escape(target_id)}['\"][^>]*>",
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    for path in iter_html_like_files(root):
        text = path.read_text(encoding="utf-8")
        match = id_pattern.search(text)
        if not match:
            continue
        evidence = build_evidence_from_offset(path, text, match.start())
        tag_text = match.group(0)
        is_secondary = bool(SECONDARY_SURFACE_HINT_PATTERN.search(tag_text))
        return evidence, is_secondary
    return None, False


def extract_anchor_jump_evidence(root: Path) -> tuple[list[Evidence], list[Evidence]]:
    control_evidence: list[Evidence] = []
    target_evidence: list[Evidence] = []

    for path in iter_html_like_files(root):
        text = path.read_text(encoding="utf-8")
        for match in ANCHOR_LINK_PATTERN.finditer(text):
            target_id = match.group("href") or match.group("data") or match.group("controls")
            if not target_id or target_id.lower() in ANCHOR_JUMP_SKIP_IDS:
                continue
            target_match, is_secondary = find_target_surface(root, target_id)
            if not target_match or not is_secondary:
                continue
            control_evidence.append(build_evidence_from_offset(path, text, match.start()))
            target_evidence.append(target_match)

    for path in iter_code_files(root):
        text = path.read_text(encoding="utf-8")
        for match in JS_SCROLL_TARGET_PATTERN.finditer(text):
            target_id = match.group("id")
            if not target_id or target_id.lower() in ANCHOR_JUMP_SKIP_IDS:
                continue
            target_match, is_secondary = find_target_surface(root, target_id)
            if not target_match or not is_secondary:
                continue
            control_evidence.append(build_evidence_from_offset(path, text, match.start()))
            target_evidence.append(target_match)

    return control_evidence, target_evidence


def collect_group_matches(root: Path, group_name: str, docs_only: bool = False) -> list[Evidence]:
    files = iter_doc_files(root) if docs_only else iter_text_files(root)
    evidence: list[Evidence] = []
    for path in files:
        evidence.extend(find_matches(path, PATTERN_GROUPS[group_name]))
    return evidence


def collect_group_matches_by_file(root: Path, group_name: str) -> dict[str, list[Evidence]]:
    matches_by_file: dict[str, list[Evidence]] = {}
    for path in iter_doc_files(root):
        matches = find_matches(path, PATTERN_GROUPS[group_name])
        if matches:
            matches_by_file[str(path)] = matches
    return matches_by_file


def collect_matches_by_file(path: Path, patterns: list[str]) -> list[Evidence]:
    return find_matches(path, patterns)


def evaluate_journey(root: Path) -> tuple[str, str, list[Evidence]]:
    actor_by_file = collect_group_matches_by_file(root, "journey_actor")
    scenario_by_file = collect_group_matches_by_file(root, "journey_scenario")
    steps_by_file = collect_group_matches_by_file(root, "journey_steps")
    context_by_file = collect_group_matches_by_file(root, "journey_evidence")

    shared_files = sorted(
        set(actor_by_file) & set(scenario_by_file) & set(steps_by_file)
    )
    if shared_files:
        best_file = max(
            shared_files,
            key=lambda path: len(actor_by_file[path]) + len(scenario_by_file[path]) + len(steps_by_file[path]),
        )
        evidence = (
            actor_by_file[best_file][:1]
            + scenario_by_file[best_file][:1]
            + steps_by_file[best_file][:2]
            + context_by_file.get(best_file, [])[:1]
        )[:5]
        if context_by_file.get(best_file):
            return (
                "pass",
                "找到含 persona/scenario/steps 並帶有想法、感受或洞察欄位的 journey/flow 證據。",
                evidence,
            )
        return (
            "pass",
            "找到 persona/scenario/steps 的 journey/flow 文件；建議補上 thinking/feeling/insight 以貼近 NNG map 結構。",
            evidence,
        )

    actor = collect_group_matches(root, "journey_actor", docs_only=True)
    scenario = collect_group_matches(root, "journey_scenario", docs_only=True)
    steps = collect_group_matches(root, "journey_steps", docs_only=True)
    context = collect_group_matches(root, "journey_evidence", docs_only=True)
    evidence = (actor[:1] + scenario[:1] + steps[:2] + context[:1])[:5]

    missing = []
    if not actor:
        missing.append("persona/actor")
    if not scenario:
        missing.append("scenario/goal")
    if not steps:
        missing.append("steps/phases")
    return (
        "fail",
        f"缺少可驗證的 journey/flow 結構：{', '.join(missing)}。",
        evidence,
    )


def evaluate_pattern(root: Path, check_id: str) -> tuple[str, str, list[Evidence]]:
    evidence: list[Evidence] = []
    for path in iter_code_files(root):
        evidence.extend(find_matches(path, PATTERN_GROUPS[check_id]))
    if evidence:
        messages = {
            "system_status_visibility": "找到目前步驟、進度或 next/completed 等系統狀態可見性證據。",
            "gestalt_proximity_common_region": "找到以間距、section、fieldset 或群組語意建立鄰近/共同區域的證據。",
            "gestalt_similarity": "找到 token、variant 或共享樣式系統，符合相似性原則。",
            "gestalt_figure_ground": "找到背景/前景/對比 token 或敘述，符合 figure-ground 原則。",
            "gestalt_continuation": "找到 stepper、timeline、ordered sequence 或連接線等連續性證據。",
        }
        return ("pass", messages[check_id], evidence[:5])

    warnings = {
        "system_status_visibility": "找不到 progress、aria-current 或 next/completed 等狀態回饋；多步驟介面通常需要明確回饋。",
        "gestalt_proximity_common_region": "找不到穩定的間距/群組訊號；可能違反 proximity/common region。",
        "gestalt_similarity": "找不到 token/variant/共享元件訊號；可能缺乏 similarity 與一致性。",
        "gestalt_figure_ground": "找不到背景/前景/對比訊號；figure-ground 可能不足。",
        "gestalt_continuation": "找不到明確的視覺路徑或順序訊號；請人工確認使用者視線能順著流程前進。",
    }
    level = "warn" if check_id == "gestalt_continuation" else "fail"
    return (level, warnings[check_id], [])


def evaluate_guideline_docs(root: Path, require_guideline_docs: bool) -> tuple[str, str, list[Evidence]]:
    candidates: list[tuple[Path, dict[str, list[Evidence]]]] = []
    for path in iter_doc_files(root):
        section_hits = {
            section: collect_matches_by_file(path, patterns)
            for section, patterns in GUIDELINE_SECTION_PATTERNS.items()
        }
        matched_sections = sum(bool(hits) for hits in section_hits.values())
        path_hint = path.name.lower()
        looks_like_guideline = any(
            token in path_hint for token in ("guideline", "spec", "component", "design-system", "ui")
        )
        if looks_like_guideline or matched_sections >= 3:
            candidates.append((path, section_hits))

    if not candidates:
        if require_guideline_docs:
            return (
                "fail",
                "此 audit run 要求 guideline 文件，但找不到包含 Usage/Layout/Anatomy/States/Interaction 的文件。",
                [],
            )
        return (
            "pass",
            "本次未強制要求 guideline 文件；若是元件庫或 design system，請加上 --require-guideline-docs。",
            [],
        )

    best_path, best_hits = max(
        candidates,
        key=lambda item: sum(bool(hits) for hits in item[1].values()),
    )
    matched_sections = [section for section, hits in best_hits.items() if hits]
    evidence = []
    for section in ("usage", "layout", "anatomy", "states_spec", "interaction", "content_asset"):
        evidence.extend(best_hits[section][:1])
    evidence = evidence[:6]

    if len(matched_sections) >= 5:
        return (
            "pass",
            f"找到結構完整的 guideline 文件：{Path(best_path).name}。",
            evidence,
        )

    missing = [
        section
        for section in ("usage", "layout", "anatomy", "states_spec", "interaction", "content_asset")
        if not best_hits[section]
    ]
    status = "fail" if require_guideline_docs else "warn"
    return (
        status,
        f"找到 guideline 候選文件，但缺少關鍵段落：{', '.join(missing)}。",
        evidence,
    )


def evaluate_workbench_ia(root: Path, require_workbench_ia: bool) -> tuple[str, str, list[Evidence]]:
    matches = {
        "primary_task": collect_group_matches(root, "workbench_primary_task", docs_only=True),
        "task_model": collect_group_matches(root, "workbench_task_model", docs_only=True),
        "state_model": collect_group_matches(root, "workbench_state_model", docs_only=True),
        "information_architecture": collect_group_matches(root, "workbench_information_architecture", docs_only=True),
        "visibility_plan": collect_group_matches(root, "workbench_visibility_plan", docs_only=True),
        "content_audit": collect_group_matches(root, "workbench_content_audit", docs_only=True),
        "deferred_reason": collect_group_matches(root, "workbench_deferred_reason", docs_only=True),
    }

    evidence = []
    for key in (
        "primary_task",
        "task_model",
        "state_model",
        "information_architecture",
        "visibility_plan",
        "content_audit",
        "deferred_reason",
    ):
        evidence.extend(matches[key][:1])
    evidence = evidence[:7]

    core_missing = [
        label
        for label, key in (
            ("primary task", "primary_task"),
            ("task model", "task_model"),
            ("state model", "state_model"),
            ("information architecture", "information_architecture"),
            ("visibility plan", "visibility_plan"),
        )
        if not matches[key]
    ]
    advanced_missing = [
        label
        for label, key in (
            ("content audit", "content_audit"),
            ("deferred reveal rationale", "deferred_reason"),
        )
        if not matches[key]
    ]

    if not core_missing and not advanced_missing:
        return (
            "pass",
            "找到完整的 workbench IA 證據：primary task、task/state model、IA 表、visibility plan、content audit 與 deferred reveal rationale 都存在。",
            evidence,
        )

    if not core_missing:
        status = "fail" if require_workbench_ia else "warn"
        return (
            status,
            "找到基本 workbench IA 結構，但缺少進階收斂證據："
            + ", ".join(advanced_missing)
            + "。",
            evidence,
        )

    if require_workbench_ia:
        return (
            "fail",
            "缺少 workbench/task-first IA 結構："
            + ", ".join(core_missing + advanced_missing)
            + "。",
            evidence,
        )

    if evidence:
        return (
            "warn",
            "找到部分 workbench/task-first IA 證據，但結構不完整："
            + ", ".join(core_missing + advanced_missing)
            + "。",
            evidence,
        )

    return (
        "pass",
        "本次未強制要求 workbench IA；若頁面屬於 workflow/workbench，請加上 --require-workbench-ia。",
        [],
    )


def evaluate_viewport_budget(root: Path) -> tuple[str, str, list[Evidence]]:
    viewport_matches = collect_group_matches(root, "viewport_budget_signals")
    primary_matches = collect_group_matches(root, "primary_surface_layout_signals")
    evidence = (primary_matches[:3] + viewport_matches[:4])[:6]

    split_layout_patterns = [
        r"<section[^>]+class=['\"][^'\"]*(hero-grid|workspace-grid|dashboard-grid|three-column)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(intro-panel|hero-panel|summary-panel)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(main-stage|primary-stage|workbench|canvas)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(ledger-panel|sidebar|side-rail|rail|aside-panel)[^'\"]*['\"]",
    ]
    below_fold_patterns = [
        r"class=['\"][^'\"]*(budget-board|insight-band|insight-card|refinement|secondary-section)[^'\"]*['\"]",
        r"<section[^>]+id=['\"][^'\"]*(budget|insight|refinement|details)[^'\"]*['\"]",
    ]
    summary_card_patterns = [
        r"class=['\"][^'\"]*(metric-card|summary-card|kpi-card|stats-card)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(metric-cluster|summary-cluster|kpi-cluster)[^'\"]*['\"]",
    ]

    split_evidence: list[Evidence] = []
    split_detected = False
    secondary_detected = False
    summary_detected = False

    for path in iter_html_like_files(root):
        text = path.read_text(encoding="utf-8")
        if all(re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL) for pattern in split_layout_patterns):
            split_detected = True
            for pattern in split_layout_patterns:
                match = find_whole_text_match(path, pattern)
                if match:
                    split_evidence.append(match)
            if any(re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL) for pattern in below_fold_patterns):
                secondary_detected = True
                for pattern in below_fold_patterns:
                    match = find_whole_text_match(path, pattern)
                    if match:
                        split_evidence.append(match)
                        break
            summary_hits = 0
            for pattern in summary_card_patterns:
                summary_hits += len(re.findall(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL))
            summary_detected = summary_hits >= 3
            if summary_detected:
                for pattern in summary_card_patterns:
                    match = find_whole_text_match(path, pattern)
                    if match:
                        split_evidence.append(match)
                        break
            break

    balance_evidence, center_ratio = extract_three_column_balance_evidence(root)
    if split_detected and balance_evidence and (secondary_detected or summary_detected):
        fail_evidence = split_evidence[:5]
        fail_evidence.append(balance_evidence)
        ratio_text = f"{center_ratio:.2f}" if center_ratio is not None else "unknown"
        return (
            "fail",
            "偵測到首屏被 intro/editorial 區、main stage 與 side rail 三分，且主舞台寬度占比不足或重要區塊繼續堆到首屏外；這違反主功能應佔可視區主要部分的要求。"
            + f" 中央欄寬 proxy 比例={ratio_text}。",
            fail_evidence[:7],
        )

    if viewport_matches and primary_matches:
        return (
            "pass",
            "找到主舞台與 viewport-aware layout 的初步代理訊號，可對『主功能需佔據首屏主要部分』做第一層機器檢查。",
            evidence,
        )

    if primary_matches or viewport_matches:
        missing = []
        if not primary_matches:
            missing.append("primary surface")
        if not viewport_matches:
            missing.append("viewport budget")
        return (
            "warn",
            "只找到部分首屏/主舞台代理訊號，仍不足以初步驗證『主功能佔據可視區主要部分』：缺少 "
            + ", ".join(missing)
            + "。",
            evidence,
        )

    return (
        "warn",
        "找不到主舞台與 viewport budget 的穩定代理訊號；目前無法對『主功能是否吃下首屏主要部分』做初步機器檢查。",
        [],
    )


def evaluate_right_rail_waste(root: Path) -> tuple[str, str, list[Evidence]]:
    html_topbar_patterns = [
        r"<header[^>]+class=['\"][^'\"]*(topbar|hero|intro|masthead|page-header|hero-shell)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(header-actions|hero-actions|hero-meta|side-meta|rail-actions|header-rail|meta-column|action-column)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(brand-block|hero-copy|intro-copy|title-block|headline-block|copy-column)[^'\"]*['\"]",
    ]
    css_right_column_patterns = [
        r"\.(header-actions|hero-actions|hero-meta|side-meta|header-rail|meta-column|action-column)\s*\{[^}]*flex-direction\s*:\s*column",
        r"\.(header-actions|hero-actions|hero-meta|side-meta|header-rail|meta-column|action-column)\s*\{[^}]*(min-width|width)\s*:\s*(?:1[45-9]|[2-9]\d)rem",
    ]
    css_copy_column_patterns = [
        r"\.(brand-block|hero-copy|intro-copy|title-block|headline-block|copy-column)\s*\{[^}]*(max-width)\s*:\s*(?:3\d|4\d|5\d)rem",
        r"\.(topbar|hero|intro|masthead|page-header|hero-shell)\s*\{[^}]*justify-content\s*:\s*space-between",
    ]
    follow_up_section_patterns = [
        r"<main\b[^>]*>",
        r"<section[^>]+class=['\"][^'\"]*(flow|dashboard|command|insight|ledger|budget|chart|report)[^'\"]*['\"]",
    ]

    evidence: list[Evidence] = []
    has_html_split = False
    has_css_right_column = False
    has_css_copy_limit = False
    has_follow_up_sections = False

    for path in iter_html_like_files(root):
        text = path.read_text(encoding="utf-8")
        if all(re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL) for pattern in html_topbar_patterns):
            has_html_split = True
            for pattern in html_topbar_patterns:
                match = find_whole_text_match(path, pattern)
                if match:
                    evidence.append(match)
            if all(re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL) for pattern in follow_up_section_patterns):
                has_follow_up_sections = True
                for pattern in follow_up_section_patterns:
                    match = find_whole_text_match(path, pattern)
                    if match:
                        evidence.append(match)
                        break
            break

    for path in iter_code_files(root):
        if path.suffix.lower() != ".css":
            continue
        text = path.read_text(encoding="utf-8")
        if not has_css_right_column and all(re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL) for pattern in css_right_column_patterns):
            has_css_right_column = True
            for pattern in css_right_column_patterns:
                match = find_whole_text_match(path, pattern)
                if match:
                    evidence.append(match)
        if not has_css_copy_limit and any(re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL) for pattern in css_copy_column_patterns):
            has_css_copy_limit = True
            for pattern in css_copy_column_patterns:
                match = find_whole_text_match(path, pattern)
                if match:
                    evidence.append(match)
                    break

    if has_html_split and has_css_right_column and has_css_copy_limit and has_follow_up_sections:
        return (
            "fail",
            "偵測到首屏 header/hero 被拆成文案欄與右側 actions/meta 欄，且右欄有明確寬度約束、下方還接續多個主要區塊；這高度疑似把首屏寬度浪費在稀疏右欄。",
            evidence[:7],
        )

    if has_html_split and has_css_right_column:
        return (
            "warn",
            "偵測到首屏存在右側 actions/meta 欄位與明確欄寬約束；請確認右半部不是只有少量 badge/CTA 卻佔掉過多寬度。",
            evidence[:6],
        )

    return (
        "pass",
        "未偵測到明顯的右側稀疏欄位/rail 浪費寬度靜態代理訊號。",
        evidence[:4],
    )


def evaluate_disclosure_controls(root: Path) -> tuple[str, str, list[Evidence]]:
    control_matches = collect_group_matches(root, "disclosure_control_signals")
    visible_surfaces, hidden_surfaces, secondary_surfaces = extract_surface_evidence(root)
    control_pair_evidence: list[Evidence] = []

    for path in iter_html_like_files(root):
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"aria-controls\s*=\s*['\"]([^'\"]+)['\"]", text, re.IGNORECASE):
            target_id = match.group(1)
            target_pattern = re.compile(
                rf"id=['\"]{re.escape(target_id)}['\"][^>]*(hidden|aria-hidden\s*=\s*['\"]true['\"]|data-state\s*=\s*['\"](?:closed|collapsed|inactive)['\"]|data-collapsed\s*=\s*['\"]true['\"])",
                re.IGNORECASE | re.MULTILINE | re.DOTALL,
            )
            if target_pattern.search(text):
                control_pair_evidence.append(build_evidence_from_offset(path, text, match.start()))
                break

    evidence = (control_pair_evidence[:3] + hidden_surfaces[:2] + control_matches[:3])[:8]
    effective_control_count = len(control_pair_evidence)

    if control_matches and effective_control_count > 0:
        return (
            "pass",
            "找到 reveal/hide 或 mode switch 控制，而且可對應到 hidden/collapsed 的 target，能初步驗證不是把所有內容永久攤開。",
            evidence,
        )

    if control_matches and not hidden_surfaces and len(visible_surfaces) >= 4 and len(secondary_surfaces) >= 3:
        return (
            "fail",
            "偵測到切換控制痕跡，但找不到對應 hidden/collapsed 區塊；同時多個次級表面仍常駐可見，代表控制項沒有真的減少展露量。",
            (control_matches[:4] + visible_surfaces[:3])[:7],
        )

    if control_matches:
        return (
            "warn",
            "找到 aria/data-state/tablist 等控制痕跡，但缺少對應 hidden/collapsed target；不能把它視為有效 deferred reveal。",
            evidence or control_matches[:6],
        )

    return (
        "warn",
        "找不到明確的 reveal/hide 或 mode switch 控制訊號；高密度畫面可能只是把所有資訊同時攤開。",
        [],
    )


def evaluate_always_visible_surface_risk(root: Path) -> tuple[str, str, list[Evidence]]:
    visible_surfaces, hidden_surfaces, secondary_surfaces = extract_surface_evidence(root)
    control_matches = collect_group_matches(root, "disclosure_control_signals")
    evidence = (visible_surfaces[:6] + hidden_surfaces[:1])[:7]

    if len(visible_surfaces) >= 4 and len(secondary_surfaces) >= 2 and not hidden_surfaces:
        return (
            "fail",
            "偵測到多個 major / secondary surfaces 同時常駐可見，卻沒有 hidden/collapsed 證據；這已經接近把主畫面拆成一串永久展開的 panels。",
            evidence,
        )

    if len(secondary_surfaces) >= 4 and not hidden_surfaces:
        return (
            "fail",
            "偵測到四個以上次級 surface/panel 常駐可見，卻沒有 hidden/collapsed 證據；高度疑似把所有內容永久攤開成向下堆疊介面。",
            evidence,
        )

    if len(visible_surfaces) >= 6 and len(hidden_surfaces) == 0:
        return (
            "fail",
            "偵測到大量 major surface 線索都常駐可見，且找不到 hidden/collapsed 代理訊號；這不符合 deferred reveal 與單一主舞台原則。",
            evidence,
        )

    if len(visible_surfaces) >= 4 and len(hidden_surfaces) == 0 and len(control_matches) <= 1:
        return (
            "warn",
            "偵測到多個 surface/panel 直接常駐畫面，且幾乎沒有 reveal/hide 控制；請確認不是把所有區塊平鋪堆疊。",
            evidence,
        )

    return (
        "pass",
        "未偵測到明顯的『所有 major surfaces 永久攤開』靜態訊號，或已看到 hidden/collapsed 代理證據。",
        evidence[:4],
    )


def evaluate_anchor_jump_stack_risk(root: Path) -> tuple[str, str, list[Evidence]]:
    visible_surfaces, hidden_surfaces, secondary_surfaces = extract_surface_evidence(root)
    control_evidence, target_evidence = extract_anchor_jump_evidence(root)
    evidence = (control_evidence[:3] + target_evidence[:3])[:6]

    if control_evidence and len(secondary_surfaces) >= 3 and not hidden_surfaces:
        return (
            "fail",
            "偵測到首屏控制把使用者跳往下方次級區塊，但這些區塊本身仍是向下堆疊的常駐表面；這只是用錨點掩蓋 stacked sections，沒有真正收斂資訊密度。",
            evidence,
        )

    if control_evidence:
        return (
            "warn",
            "偵測到 in-page anchor / scroll jump 指向次級 surface；請確認不是把主要資訊往下堆，再靠錨點跳轉補救。",
            evidence,
        )

    return (
        "pass",
        "未偵測到明顯的『先向下堆疊，再靠錨點跳到下方畫面』靜態代理訊號。",
        [],
    )


def evaluate_card_farm_risk(root: Path) -> tuple[str, str, list[Evidence]]:
    card_matches = collect_group_matches(root, "card_surface_signals")
    summary_matches = collect_group_matches(root, "summary_surface_signals")
    control_matches = collect_group_matches(root, "disclosure_control_signals")
    primary_matches = collect_group_matches(root, "primary_surface_layout_signals")
    evidence = (card_matches[:4] + summary_matches[:2] + control_matches[:2])[:8]

    card_count = len(card_matches)
    summary_count = len(summary_matches)
    control_count = len(control_matches)

    if card_count >= 10 and summary_count >= 3 and control_count == 0:
        return (
            "fail",
            "偵測到高密度 card / summary 代理訊號，卻缺少 reveal/hide 或 mode switch 控制；高度疑似退化成 card farm / summary-first layout。",
            evidence,
        )

    html_summary_first_patterns = [
        r"class=['\"][^'\"]*(intro-panel|hero-panel|summary-panel)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(metric-cluster|metric-card|summary-card|kpi-card)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(main-stage|primary-stage|workbench|canvas)[^'\"]*['\"]",
        r"class=['\"][^'\"]*(ledger-panel|sidebar|side-rail|rail|aside-panel)[^'\"]*['\"]",
    ]
    stacked_follow_up_patterns = [
        r"class=['\"][^'\"]*(budget-board|insight-band|insight-card|refinement|secondary-section)[^'\"]*['\"]",
        r"<section[^>]+id=['\"][^'\"]*(budget|insight|refinement|details)[^'\"]*['\"]",
    ]

    for path in iter_html_like_files(root):
        text = path.read_text(encoding="utf-8")
        if all(re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL) for pattern in html_summary_first_patterns):
            stacked = any(re.search(pattern, text, re.IGNORECASE | re.MULTILINE | re.DOTALL) for pattern in stacked_follow_up_patterns)
            if stacked:
                combo_evidence: list[Evidence] = []
                for pattern in html_summary_first_patterns + stacked_follow_up_patterns[:1]:
                    match = find_whole_text_match(path, pattern)
                    if match:
                        combo_evidence.append(match)
                return (
                    "fail",
                    "偵測到首屏同時存在 intro/summary 區、main stage 與 side rail，且後續又接 stacked sections；這更接近 summary-first dashboard，而不是單一主任務主舞台。",
                    combo_evidence[:6],
                )

    if card_count >= 6 and control_count == 0:
        return (
            "warn",
            "偵測到多個 card 代理訊號，但缺少揭露或切換控制；請確認不是把所有區塊平鋪成卡片堆疊。",
            evidence,
        )

    if card_count >= 6 and not primary_matches:
        return (
            "warn",
            "偵測到多個 card 代理訊號，但缺少主舞台證據；請確認不是等權卡片把主功能稀釋掉。",
            evidence,
        )

    return (
        "pass",
        "未偵測到明顯的 card farm / summary-first 靜態代理訊號，或已同時看到主舞台與揭露控制證據。",
        evidence[:4],
    )


def evaluate_project_artifact_requirements(root: Path) -> tuple[str, str, list[Evidence]]:
    evidence: list[Evidence] = []
    failures: list[str] = []
    warnings: list[str] = []

    agents_path = root / "AGENTS.md"
    if not agents_path.exists():
        warnings.append("缺少 AGENTS.md")
    else:
        agents_token = find_matches(agents_path, [r"design-token-board\.md", r"docs/design-token-board\.md"])
        agents_guardrails = find_matches(
            agents_path,
            [
                r"frontend design guardrails",
                r"card farm",
                r"summary-first dashboard",
                r"主功能區",
                r"primary functional area",
            ],
        )
        evidence.extend(agents_token[:1] + agents_guardrails[:1])
        if not agents_token:
            failures.append("AGENTS.md 未宣告 canonical token spec 路徑")
        if not agents_guardrails:
            failures.append("AGENTS.md 未寫入 frontend design guardrails")

    claude_path = root / "CLAUDE.md"
    if not claude_path.exists():
        warnings.append("缺少 CLAUDE.md")
    else:
        claude_import = find_matches(claude_path, [r"@AGENTS\.md", r"AGENTS\.md"])
        claude_design = find_matches(
            claude_path,
            [
                r"design-token-board\.md",
                r"frontend design guardrails",
                r"Frontend Design Guardrails",
            ],
        )
        evidence.extend(claude_import[:1] + claude_design[:1])
        if not claude_import:
            failures.append("CLAUDE.md 未匯入或引用 AGENTS.md")
        if not claude_design:
            failures.append("CLAUDE.md 未對齊 frontend design guardrails / token spec")

    token_path = next((root / candidate for candidate in TOKEN_SPEC_CANDIDATES if (root / candidate).exists()), None)
    if not token_path:
        warnings.append("缺少 docs 下的 canonical token spec")
    else:
        token_section_checks = {
            "heading": [r"^#\s*Design Token Board\b", r"^#\s*設計 Token", r"^#\s*Token Board\b"],
            "color": [r"色彩系統", r"^#+\s*3\.", r"^#+\s*色彩"],
            "type": [r"字體排印", r"typography", r"^#+\s*字體"],
            "spacing": [r"間距與密度", r"spacing", r"密度"],
            "motion": [r"動態", r"motion"],
            "mapping": [r"實作映射", r"implementation"],
        }
        missing_sections: list[str] = []
        for section_name, patterns in token_section_checks.items():
            matches = find_matches(token_path, patterns)
            if matches:
                evidence.extend(matches[:1])
            else:
                missing_sections.append(section_name)
        if len(missing_sections) >= 2:
            failures.append("token spec 結構不完整，缺少 " + ", ".join(missing_sections))
        elif missing_sections:
            warnings.append("token spec 尚缺少 " + ", ".join(missing_sections))

    if failures:
        message = "未通過 skill artifact 遵循檢查：" + "；".join(failures)
        if warnings:
            message += "。另有待補：" + "；".join(warnings)
        return ("fail", message, evidence[:8])

    if warnings:
        return (
            "warn",
            "已找到 AGENTS.md、CLAUDE.md 與 docs 下 token spec，但仍有細節待補：" + "；".join(warnings),
            evidence[:8],
        )

    return (
        "pass",
        "找到 AGENTS.md、CLAUDE.md 與 docs 下 canonical token spec，且內容符合 skill 要求的基本骨架。",
        evidence[:8],
    )


def evaluate_anti_patterns(root: Path) -> tuple[str, str, list[Evidence]]:
    evidence: list[Evidence] = []
    for path in iter_code_files(root):
        lines = path.read_text(encoding="utf-8").splitlines()
        allow_window = 0
        previous_line = ""
        for rule_id, rule in ANTI_PATTERN_RULES.items():
            compiled = [re.compile(pattern, re.IGNORECASE | re.MULTILINE) for pattern in rule["patterns"]]
            allow_window = 0
            previous_line = ""
            for line_no, raw_line in enumerate(lines, start=1):
                stripped = raw_line.strip()
                if not stripped:
                    previous_line = stripped
                    continue
                if ALLOW_ANTI_PATTERN_MARKER in previous_line.lower():
                    allow_window = 4
                previous_line = stripped
                if allow_window > 0:
                    allow_window -= 1
                    continue
                if any(regex.search(stripped) for regex in compiled):
                    evidence.append(
                        Evidence(
                            path=str(path),
                            line=line_no,
                            snippet=f"[{rule_id}] {stripped[:140]}",
                        )
                    )
                    break

    if evidence:
        return (
            "warn",
            "偵測到可能的 AI slop / UX copy 反模式，請逐條確認是否違反設計意圖與可讀性。",
            evidence[:8],
        )

    return (
        "pass",
        "未偵測到明顯的 generic font、gradient text、模糊 CTA、流程語言外漏或籠統錯誤文案反模式。",
        [],
    )


def audit_workspace(
    root: Path,
    require_guideline_docs: bool = False,
    require_workbench_ia: bool = False,
    stage: str = "default",
) -> dict[str, object]:
    if is_skill_folder(root):
        return {
            "root": str(root),
            "results": [
                {
                    "id": "workspace_target_validation",
                    "status": "fail",
                    "message": "目標看起來是 skill folder，不是實際前端交付 workspace。請改對生成後的 app/repo 執行 audit，否則文件本身會污染檢查結果。",
                    "evidence": [],
                }
            ],
            "summary": {"pass": 0, "warn": 0, "fail": 1},
            "manual_review": MANUAL_REVIEW_ITEMS,
        }

    results: list[dict[str, object]] = []

    journey_status, journey_message, journey_evidence = evaluate_journey(root)
    results.append(
        {
            "id": "journey_map_structure",
            "status": journey_status,
            "message": journey_message,
            "evidence": [item.to_dict() for item in journey_evidence],
        }
    )

    status_visibility_status, status_visibility_message, status_visibility_evidence = evaluate_pattern(
        root,
        "system_status_visibility",
    )
    results.append(
        {
            "id": "system_status_visibility",
            "status": status_visibility_status,
            "message": status_visibility_message,
            "evidence": [item.to_dict() for item in status_visibility_evidence],
        }
    )

    workbench_status, workbench_message, workbench_evidence = evaluate_workbench_ia(
        root,
        require_workbench_ia=require_workbench_ia,
    )
    results.append(
        {
            "id": "workbench_ia_structure",
            "status": workbench_status,
            "message": workbench_message,
            "evidence": [item.to_dict() for item in workbench_evidence],
        }
    )

    artifact_status, artifact_message, artifact_evidence = evaluate_project_artifact_requirements(root)
    results.append(
        {
            "id": "project_artifact_requirements",
            "status": artifact_status,
            "message": artifact_message,
            "evidence": [item.to_dict() for item in artifact_evidence],
        }
    )

    viewport_status, viewport_message, viewport_evidence = evaluate_viewport_budget(root)
    results.append(
        {
            "id": "viewport_budget_proxies",
            "status": viewport_status,
            "message": viewport_message,
            "evidence": [item.to_dict() for item in viewport_evidence],
        }
    )

    right_rail_status, right_rail_message, right_rail_evidence = evaluate_right_rail_waste(root)
    results.append(
        {
            "id": "right_rail_waste_proxies",
            "status": right_rail_status,
            "message": right_rail_message,
            "evidence": [item.to_dict() for item in right_rail_evidence],
        }
    )

    disclosure_status, disclosure_message, disclosure_evidence = evaluate_disclosure_controls(root)
    results.append(
        {
            "id": "disclosure_control_signals",
            "status": disclosure_status,
            "message": disclosure_message,
            "evidence": [item.to_dict() for item in disclosure_evidence],
        }
    )

    always_visible_status, always_visible_message, always_visible_evidence = evaluate_always_visible_surface_risk(root)
    results.append(
        {
            "id": "always_visible_surface_risk",
            "status": always_visible_status,
            "message": always_visible_message,
            "evidence": [item.to_dict() for item in always_visible_evidence],
        }
    )

    anchor_jump_status, anchor_jump_message, anchor_jump_evidence = evaluate_anchor_jump_stack_risk(root)
    results.append(
        {
            "id": "anchor_jump_stack_risk",
            "status": anchor_jump_status,
            "message": anchor_jump_message,
            "evidence": [item.to_dict() for item in anchor_jump_evidence],
        }
    )

    card_farm_status, card_farm_message, card_farm_evidence = evaluate_card_farm_risk(root)
    results.append(
        {
            "id": "card_farm_risk",
            "status": card_farm_status,
            "message": card_farm_message,
            "evidence": [item.to_dict() for item in card_farm_evidence],
        }
    )

    guideline_status, guideline_message, guideline_evidence = evaluate_guideline_docs(
        root,
        require_guideline_docs=require_guideline_docs,
    )
    results.append(
        {
            "id": "guideline_doc_structure",
            "status": guideline_status,
            "message": guideline_message,
            "evidence": [item.to_dict() for item in guideline_evidence],
        }
    )

    for check_id in (
        "gestalt_proximity_common_region",
        "gestalt_similarity",
        "gestalt_figure_ground",
        "gestalt_continuation",
    ):
        status, message, evidence = evaluate_pattern(root, check_id)
        results.append(
            {
                "id": check_id,
                "status": status,
                "message": message,
                "evidence": [item.to_dict() for item in evidence],
            }
        )

    anti_status, anti_message, anti_evidence = evaluate_anti_patterns(root)
    results.append(
        {
            "id": "anti_pattern_signals",
            "status": anti_status,
            "message": anti_message,
            "evidence": [item.to_dict() for item in anti_evidence],
        }
    )

    if stage == "early":
        for result in results:
            if result["id"] in EARLY_UI_GATE_IDS and result["status"] == "warn":
                result["status"] = "fail"
                result["message"] = "Early UI gate 未通過： " + result["message"]

    summary = {"pass": 0, "warn": 0, "fail": 0}
    for result in results:
        summary[result["status"]] += 1

    return {
        "root": str(root),
        "results": results,
        "summary": summary,
        "manual_review": MANUAL_REVIEW_ITEMS,
    }


def print_text_report(report: dict[str, object]) -> None:
    print(f"AUDIT_ROOT {report['root']}")
    for result in report["results"]:
        print(f"[{result['status'].upper()}] {result['id']}: {result['message']}")
        for evidence in result["evidence"]:
            print(f"  - {evidence['path']}:{evidence['line']} {evidence['snippet']}")
    print("MANUAL_REVIEW")
    for item in report["manual_review"]:
        print(f"  - {item}")
    summary = report["summary"]
    print(
        "SUMMARY "
        f"pass={summary['pass']} warn={summary['warn']} fail={summary['fail']}"
    )


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except ValueError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit a frontend workspace for journey/flow structure and Gestalt-aligned evidence."
    )
    parser.add_argument("root", nargs="?", default=".", help="Workspace root to audit")
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format",
    )
    parser.add_argument(
        "--strict-warnings",
        action="store_true",
        help="Return non-zero when warnings exist",
    )
    parser.add_argument(
        "--require-guideline-docs",
        action="store_true",
        help="Fail when reusable-component guideline documents are missing or incomplete.",
    )
    parser.add_argument(
        "--require-workbench-ia",
        action="store_true",
        help="Fail when workbench/workflow pages are missing task-first IA evidence such as task model, state model, IA table, visibility plan, and deferred reveal rationale.",
    )
    parser.add_argument(
        "--stage",
        choices=("default", "early", "final"),
        default="default",
        help="Audit stage. Use --stage early to make viewport/disclosure/card-farm checks fail earlier instead of waiting until final sign-off.",
    )
    args = parser.parse_args()

    configure_stdout()
    root = Path(args.root).resolve()
    report = audit_workspace(
        root,
        require_guideline_docs=args.require_guideline_docs,
        require_workbench_ia=args.require_workbench_ia,
        stage=args.stage,
    )

    if args.format == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_text_report(report)

    fail_count = report["summary"]["fail"]
    warn_count = report["summary"]["warn"]
    if fail_count:
        return 1
    if args.strict_warnings and warn_count:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
