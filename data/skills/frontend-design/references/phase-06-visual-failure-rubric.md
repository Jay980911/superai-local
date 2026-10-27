# 視覺失敗評分規準

這份 rubric 用來把 Phase 6 的視覺 QA 轉成明確判定，避免只做模糊審美評論。

## Sign-off Rules

- 沒有真實畫面證據（Playwright 截圖或 runtime CLI screenshot / result）：`sign_off = blocked`
- 有截圖但尚未修正任何一輪：`sign_off = blocked`
- 命中任一 fatal signal：`rebuild_required = yes`
- 命中 2 個以上 major signals：`rebuild_required = yes`
- 只有 minor signals：可修正後再批評一輪

## Fatal Signals

### `copy_leakage`
- 定義：使用者可見文案直接暴露 spec、review、設計方法論、流程語言或 checklist 語言
- 例：標題像「不是摘要卡片堆疊」「只保留一個主行動」
- 預設動作：整段文案重寫，不接受只修字面

### `mixed_visual_dialect`
- 定義：首屏同時混用多套互相衝突的視覺語言，沒有單一主方向
- 例：editorial 背景、heavy summary card、admin table 同時競爭主舞台
- 預設動作：刪掉或重造其中一套，直到只剩一個 dominant direction

### `blank_primary_stage`
- 定義：主舞台被大型空容器、裝飾圖表或低資訊密度區塊占據，無法承載真實任務
- 預設動作：重組 hierarchy；若主舞台沒有真內容，不能靠 polish 收尾

### `offscreen_primary_task`
- 定義：主要功能區必須先捲動才看得到或才開始可用
- 預設動作：重排首屏與內容密度；主功能不可被擠到螢幕外

## Major Signals

### `summary_first_relapse`
- 定義：使用者仍得先讀摘要、KPI 或說明卡，才碰到真實工作區

### `unsupported_primary_cta`
- 定義：primary CTA 沒有被當前 flow、state 或下一步切換支撐

### `visual_weight_collision`
- 定義：兩個以上重區塊同時搶第一眼，沒有清楚閱讀路徑

### `trust_posture_mismatch`
- 定義：高信任首頁沒有傳達 calm / control / trust，反而像 generic analytics dashboard

### `hero_dominance_over_task`
- 定義：hero、口號、裝飾視覺或大摘要卡比主要功能區更佔畫面、更早被看見

## Minor Signals

### `over_decorated_surface`
- 定義：裝飾效果存在，但無法說明它在層級或狀態上的價值

### `repeated_supporting_content`
- 定義：摘要、說明、helper 或 KPI 只是換位置重複一次

### `generic_microcopy`
- 定義：CTA、helper、error copy 可以更具體，卻仍停留在籠統語言

## Required Output Shape

Phase 6 預設輸出：

```text
Evidence source:
Runtime gate result:
Screenshot path(s):
Viewport:
What dominates first:
Primary task visibility:
Fatal signals:
Major signals:
Minor signals:
Rebuild required:
Why polishing is insufficient:
Required revisions:
```

## Decision Rule

- 若 `Fatal signals` 非空：直接重做，不要進入視覺微調
- 若 `Major signals >= 2`：重組版面、資訊密度或 CTA 結構
- 若只剩 `Minor signals`：可進入 polish

