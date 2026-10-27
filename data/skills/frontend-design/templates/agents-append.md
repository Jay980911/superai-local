## Frontend Design Guardrails

### Shared Design Source of Truth

- 將 `docs/design-token-board.md` 視為設計 token 與視覺方向的 canonical source of truth。
- 若 tokens、視覺方向或 responsive 原則改變，先更新 `docs/design-token-board.md`，再同步實作檔案。
- 不要在元件或頁面內臨時發明第二套 token 系統。

### Definition of Done

- 完成條件是高品質、具美學高度且可直接使用的介面，不是功能點交。
- 主功能區必須在常見 viewport 內可見且可開始使用，不得要求使用者先滑過裝飾內容。
- 同一畫面一次只服務一個主要功能；次要或低頻內容應延後揭露、收合或退到次層。
- 功能區必須主導畫面，不得讓 hero、口號或摘要卡壓過真實任務表面。

### Responsive Design

- 響應式設計是必要交付條件，不是附加項。
- 優先使用 fluid layout、內容驅動斷點與 container queries。
- 不要把桌機多欄硬縮成不可用的 mobile 縮圖。
- 不要交付 card-farm mobile layout。

### Anti-Patterns

- 避免 `hero + preview hybrid`
- 避免 `summary-first dashboard`
- 避免 `card farm`
- 避免 `viewport waste`
