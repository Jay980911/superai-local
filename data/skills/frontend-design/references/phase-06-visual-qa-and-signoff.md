# 視覺 QA 與 Sign-off

這份文件對應 Phase 6。目的不是看 DOM 有沒有 render，而是先完成 runtime gate、再直接批評畫面本身，並用 `references/phase-06-visual-failure-rubric.md` 判定能不能收尾。

若任務屬於 landing page、dashboard、workspace、editor、review tool、產品首頁，或第一版畫面已高風險退化成 generic template，就必讀 `references/appendix-anti-ai-slop.md`，並把 fingerprint scan 併入 Phase 6 視覺 QA。使用者是否明講「不要 AI 味」不是唯一觸發條件。

## 必做流程

1. 啟動可運行的頁面。
2. workspace 可本地運行時，先執行 `npm run audit:frontend-runtime -- <workspace> --viewport both --screenshot-dir <dir>`，記錄 desktop / mobile 結果與 screenshot 路徑。
3. 優先用 Playwright 打開實際畫面並截圖；若外部 Playwright / browser 權限受阻，沿用 runtime CLI 產生的 screenshot 與結果，不得把阻擋當成跳過理由。
4. 針對截圖提出具體批評。
5. 依 `references/phase-06-visual-failure-rubric.md` 標記 fatal / major / minor signals。
6. 至少修正一輪後，才可收尾。

## 最低批評清單

- 主任務是不是最突出。
- 功能區是否佔據大多數可視面積。
- 是否有重複內容、沒意義內容或只是裝飾的大區塊。
- 是否需要太早捲動才開始主任務。
- 主功能區是否在常見 viewport 內直接可見且可開始使用。
- 是否清楚告訴使用者下一步或下一個 mode。
- 是否仍像 `hero + preview hybrid`、`summary-first dashboard` 或 `card farm`。
- 文案像真產品，還是像設計 review / 規格 / prompt。
- 視覺語言是否純，或仍混著 editorial / SaaS / admin 幾套語言。
- 第一眼的視覺重量是否互搶，而不是形成清楚閱讀路徑。
- CTA 是否被當前 flow、state 或下一步切換合理支撐。
- hero、口號、摘要卡或裝飾視覺是否壓過主功能區。
- 若是高信任首頁，是否傳達 calm / control / trust，而不是分析儀表板感。
- 是否命中 `references/appendix-anti-ai-slop.md` 裡的 generic template 指紋。
- 切換控制是否真的減少了首屏展露量，而不是只有 tab / stepper 按鈕存在。

## Rebuild 判定

以下任一項成立時，`Rebuild required` 必須填 `yes`：

- `copy_leakage`
- `mixed_visual_dialect`
- `blank_primary_stage`
- `offscreen_primary_task`
- 2 個以上 major signals 同時成立

若 `Rebuild required = yes`，就不要把修正建議寫成純 polish 清單。

## 輸出格式建議

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

## 無法完成時

- 若頁面無法啟動，明說執行阻塞點。
- 若 Playwright 無法取得截圖，先確認 workspace 是否可本地運行；若可運行，改用 runtime CLI 產生 screenshot 與結果，再繼續 QA。
- 只有在頁面本身無法啟動、或本地 runtime CLI 也無法執行時，才可明說視覺 QA 尚未完成。
- 不要用「我看 DOM 感覺沒問題」代替截圖 review。
- 沒有截圖時，不得宣稱視覺已完成。

