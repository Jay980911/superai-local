# 進階技巧

## 流體字級

使用 `clamp()` 建立會隨 viewport 平順變化的字級，而不是只靠斷點硬切。

```css
:root {
  --font-size-sm: clamp(0.875rem, 0.8rem + 0.2vw, 1rem);
  --font-size-base: clamp(1rem, 0.9rem + 0.3vw, 1.125rem);
  --font-size-lg: clamp(1.125rem, 1rem + 0.4vw, 1.25rem);
  --font-size-xl: clamp(1.25rem, 1.1rem + 0.5vw, 1.5rem);
  --font-size-2xl: clamp(1.5rem, 1.3rem + 0.7vw, 2rem);
}
```

重點是讓字級在不同裝置上維持節奏，而不是讓大標與內文同時失控放大。

## 進階配色系統

當瀏覽器與技術棧支援時，優先考慮 `oklch` 這類知覺色彩空間，讓明度與色相調整更可控。

```css
:root {
  --primary-base: oklch(60% 0.15 250);
  --primary-subtle: oklch(95% 0.02 250);
  --primary-emphasis: oklch(50% 0.18 250);
}
```

切換明暗主題時，先調整明度，再判斷是否需要改變彩度或色相，避免整體視覺語氣突然跑掉。

## Skeleton Loading 模式

Skeleton 必須維持版面穩定，並清楚傳達層級，不是只放一排灰條應付。

```tsx
const Skeleton = ({ className }: { className?: string }) => (
  <div className={className} aria-hidden="true" />
);
```

Skeleton 的尺寸、比例與密度應盡量貼近最終內容，避免資料回來後整個版面跳動。

## 進階動態設計

動態的任務是引導注意力與說明狀態，不是增加炫技感。

- 微互動使用短時長，避免拖慢操作節奏。
- stagger reveal 只在能提升理解時才使用。
- 必須尊重 `prefers-reduced-motion`。
- 進場、離場、狀態轉換都要有可辨識差異。

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
