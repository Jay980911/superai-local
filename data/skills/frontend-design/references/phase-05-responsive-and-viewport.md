# 響應式與視窗規則

這份文件對應 Phase 5。響應式不是附加項，而是主功能可用性的基本條件。若畫面在常見裝置上不能讓使用者立刻開始主任務，就不算完成。

## 第一優先 MUST RULES

Phase 5 不只是補 breakpoint；以下規則必須全部同時成立：

- 主功能區必須完整落在常見首屏可視範圍內，且可直接開始使用。
- 主功能區必須是目前畫面的視覺中心，不得被 hero、摘要或 side rail 壓過。
- 嚴禁 card farm；不得把 desktop 的多卡片堆疊直接縮成更高的 mobile 長頁。
- Web 型應用一律必須 responsive，且不得出現 accidental horizontal scroll 或固定寬度造成的主功能外溢。

## 官方要點摘要

### 1. 先讓內容 fit viewport，再談美化

- 每個頁面都要有正確的 viewport 設定，避免瀏覽器用桌機縮圖模式渲染 mobile。
- 主要內容寬度要能跟著視窗收縮，避免固定寬度容器把主功能擠到螢幕外。
- 文字、表單與資料列要允許換行、折行或改變排列，不要假設永遠有足夠橫向空間。

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

```css
.page-shell {
  width: min(100%, 72rem);
  margin-inline: auto;
  padding-inline: clamp(1rem, 2vw, 2rem);
}

.title,
.table-cell,
.helper-text {
  overflow-wrap: anywhere;
}
```

### 2. 先用彈性版面，再用 media queries 補強

- 官方文件一致建議先建立 fluid layout，例如 `flex`、`grid`、百分比、`minmax()`、`auto-fit`。
- media queries 應該拿來處理內容開始失衡的時刻，而不是把幾個裝置寬度硬背成模板。
- 若同一組內容可以靠彈性 tracks 自動重排，就不要先切成多套斷點版面。

```css
.workspace-grid {
  display: grid;
  gap: clamp(1rem, 2vw, 1.5rem);
  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
}
```

### 3. 斷點要依內容壓力決定，不是依裝置型號決定

- breakpoints 應在內容開始擁擠、閱讀困難、主操作被擠壓時才介入。
- 常用斷點可以作為起點，但不能取代實際內容驗證。
- 若主功能在 900px 就失真，那就該在 900px 左右調整，而不是死守 768/1024。

```css
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 20rem;
  gap: 1.25rem;
}

@media (max-width: 60rem) {
  .layout {
    grid-template-columns: 1fr;
  }

  .side-panel {
    order: -1;
  }
}
```

### 4. 元件層級的響應式優先考慮 container queries

- 當元件會出現在不同欄寬、不同殼層中時，container queries 比 viewport queries 更穩定。
- dashboard 卡片、設定表單、摘要模組、檢視面板這類可重用區塊，應根據父容器寬度決定內部排列。
- 這能降低「桌機沒問題，但放進 sidebar / split pane 就爆掉」的風險。

```css
.settings-panel {
  container-type: inline-size;
  display: grid;
  gap: 1rem;
}

.settings-fields {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: 1fr;
}

@container (min-width: 42rem) {
  .settings-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

### 5. 動態版面控制要能收放主舞台，不要把空間浪費給固定欄

- 工作台、editor、審查頁、分析工具等高密度介面，常需要 sidebar / inspector / secondary rail 動態開關。
- 這類頁面應把主舞台視為優先資源，用 CSS 變數或 data attribute 控制欄寬，而不是硬寫死多欄。
- 收合後應真的把空間還給主功能區，不是只把內容藏起來但保留空白欄位。

```css
.app-frame {
  --nav-width: 16rem;
  --aside-width: 22rem;
  --aside-state: 1;
  display: grid;
  min-height: 100dvh;
  grid-template-columns:
    minmax(0, var(--nav-width))
    minmax(0, 1fr)
    minmax(0, calc(var(--aside-width) * var(--aside-state)));
  transition: grid-template-columns 180ms ease;
}

.app-frame[data-aside-collapsed="true"] {
  --aside-state: 0;
}

.primary-workbench {
  min-width: 0;
}

@media (max-width: 75rem) {
  .app-frame {
    grid-template-columns: minmax(0, 1fr);
  }

  .app-nav,
  .app-aside {
    position: fixed;
    inset-block: 0;
    z-index: 20;
    background: var(--surface-elevated);
  }

  .app-aside {
    inset-inline-end: 0;
    width: min(24rem, 100vw);
    transform: translateX(100%);
    transition: transform 180ms ease;
  }

  .app-frame[data-aside-open="true"] .app-aside {
    transform: translateX(0);
  }
}
```

### 6. 字級、間距與區塊寬度要流體化，但必須有上下界

- `clamp()` 適合控制字級、間距、元件高度與區塊寬度，避免在不同尺寸突然跳級。
- 但流體值必須設最小值與最大值，否則小螢幕可能過小、大螢幕可能過鬆。
- 流體排印的目的不是炫技，而是讓閱讀節奏與視覺層級在不同寬度下都穩定。

```css
:root {
  --step-0: clamp(0.95rem, 0.88rem + 0.3vw, 1.05rem);
  --step-2: clamp(1.4rem, 1.1rem + 1vw, 2.1rem);
  --section-gap: clamp(1rem, 0.75rem + 1.2vw, 2rem);
}

.hero-title,
.screen-title {
  font-size: var(--step-2);
  line-height: 1.1;
}
```

### 7. 響應式不只看寬度，也要看互動能力與使用者偏好

- 觸控優先介面與滑鼠 hover 介面的 affordance 不同，必要時要用 `hover`、`pointer` 等 media features。
- 有動效的收闔、面板切換、骨架載入，應尊重 `prefers-reduced-motion`。
- 響應式完成條件應包含 reflow、可點擊面積、鍵盤焦點與動作回饋，而不是只有寬度縮放。

```css
@media (hover: hover) and (pointer: fine) {
  .row-action {
    opacity: 0;
  }

  .data-row:hover .row-action,
  .data-row:focus-within .row-action {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    scroll-behavior: auto;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

## viewport budget

優先保留：

- 主操作區
- 當前 state 必要的狀態回饋
- 下一步切換線索

優先隱藏、收合或改容器：

- 低頻摘要
- 補充說明
- 參考規則
- 稽核 / 歷史
- 次要工具列

## 常見 responsive 修法

- 把 persistent right rail 改成 drawer、tab、sheet 或可展開的 inspector。
- 把四張摘要卡收斂成一個切換式 summary 區，而不是把 card farm 疊得更高。
- 把大型說明卡改成 inline helper text 或 step-level guidance。
- 把雙主角 layout 改成單主舞台 + 次級切換。
- 把固定表格改成可重排欄位、優先欄位、橫向摘要 + 明細抽屜。

## 動態版面控制範例

### 表單區依容器寬度自動改欄數

```css
.form-section {
  container-type: inline-size;
}

.field-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

@container (min-width: 36rem) {
  .field-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (min-width: 56rem) {
  .field-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

### 工作台畫面在桌機是三欄，在窄視窗退回單主舞台

```css
.review-shell {
  --queue-width: 18rem;
  --detail-width: 24rem;
  display: grid;
  gap: 1rem;
  grid-template-columns:
    minmax(0, var(--queue-width))
    minmax(0, 1fr)
    minmax(0, var(--detail-width));
}

@media (max-width: 80rem) {
  .review-shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .review-queue,
  .review-detail {
    display: none;
  }

  .review-shell[data-panel="queue"] .review-queue,
  .review-shell[data-panel="detail"] .review-detail {
    display: block;
  }
}
```

### 卡片集合改成彈性網格，而不是每列硬塞固定數量

```css
.result-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
  align-items: start;
}
```

## fail conditions

以下任一項成立，就不要宣稱 responsive 完成：

- 有 accidental horizontal scroll。
- 主 CTA、主輸入區或主工作台在常見 viewport 被擠到首屏外。
- 主功能區沒有完整落在常見首屏可視範圍內，或進畫面後仍需先捲動才能開始主要任務。
- 主功能面積明顯小於摘要、說明或裝飾面積。
- mobile 只是把 desktop 卡片農場變成更高的卡片農場。
- 收合 sidebar / aside 後沒有把空間還給主功能區。
- 元件只能依賴 viewport 斷點，放進較窄容器就立即崩壞。

## 參考來源

- MDN: [Using media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries)
- MDN: [Using container size and style queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_size_and_style_queries)
- MDN: [`clamp()`](https://developer.mozilla.org/en-US/docs/Web/CSS/clamp)
- MDN: [`grid-template-columns`](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-columns)
- web.dev: [Responsive web design basics](https://web.dev/articles/responsive-web-design-basics)
- web.dev: [Container queries and units in action](https://web.dev/articles/baseline-in-action-container-queries)
- W3C WAI: [Understanding Success Criterion 1.4.10 Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html)
