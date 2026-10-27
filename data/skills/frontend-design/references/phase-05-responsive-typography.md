# 響應式與字體排印指南

## 響應式設計

- 以 mobile-first 建立資訊優先序，先保護首屏可開始的主任務，再逐步增加 tablet / desktop 的次要資訊。
- 斷點應依內容壓力決定，不要只套固定裝置寬度；若在中間寬度就失衡，應提早重排。
- 小尺寸優先使用單欄、清楚的視覺層級與可立即操作的主 CTA。

## 字體排印

- 文字是頁面核心，優先建立穩定層級、對比與閱讀節奏。
- 內文字級、標題字級與段落間距可使用 `clamp()` 建立流體比例，但要設定最小與最大值。
- 內文預設 `line-height` 建議至少 `1.5`，標題可依視覺密度降到 `1.1` 到 `1.25`。
- 長段落建議控制在可閱讀欄寬，避免桌機上單行過長、mobile 上單行過擠。

```css
:root {
  --font-body: clamp(0.95rem, 0.9rem + 0.2vw, 1.05rem);
  --font-title: clamp(1.5rem, 1.15rem + 1.3vw, 2.4rem);
  --measure-reading: min(68ch, 100%);
}

.article-body {
  font-size: var(--font-body);
  line-height: 1.65;
  max-width: var(--measure-reading);
}

.screen-title {
  font-size: var(--font-title);
  line-height: 1.15;
}
```

## 參考來源

- web.dev: [Learn Responsive Design](https://web.dev/learn/design/)
- web.dev: [Learn CSS: Typography](https://web.dev/learn/css/typography/)
- MDN: [`clamp()`](https://developer.mozilla.org/en-US/docs/Web/CSS/clamp)
