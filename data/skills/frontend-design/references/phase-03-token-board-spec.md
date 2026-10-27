# Token Board 規格

這份文件對應 Phase 3。受眾與情境一確認，就先交付 token 文件，再開始做元件與頁面。

## 預設持久化位置

若任務是在實際專案內落地，預設把 token board 寫入：

- `docs/design-token-board.md`

只有在專案已經有明確文件慣例時，才改成等價既有路徑。不要同時建立兩份功能相同、內容不同的 token 文件。

## 交付原則

- token 文件必須是可閱讀、可審查的具體文件，不是只剩 CSS 變數清單。
- 內容要能讓人一眼看出 palette、type、spacing、radius、shadow、motion 與 component tone sample。
- 若涉及品牌，必須標明官方品牌來源與限制。
- token 文件應是後續模組與後續 agent 的共享 source of truth，而不是一次性的設計筆記。

## 最低欄位

```text
Theme name:
Audience fit:
System purpose:
Dominant direction:
Memorable hook:
Official brand source:
Palette:
Typography:
Spacing:
Radius:
Shadow:
Motion:
Component tone samples:
Do / Don't:
```

## 視覺 token board 應包含

- `primary / secondary / tertiary / neutral` 色帶或等價語意色群
- 主要字級與字重 sample
- spacing rhythm
- radius / border / shadow 規則
- button / input / nav / chip 等 tone sample
- light / dark mode 對照（若產品需要）

## 什麼時候不應繼續往下

- 只有抽象風格詞，沒有 dominant direction。
- 無法說明某組 token 為何適合這個受眾與任務壓力。
- 品牌色來自猜測而不是官方來源。
- token board 只列數值，沒有 component tone sample。

## 參考

- `references/phase-03-token-template.md`
- `references/phase-03-project-artifacts-and-agent-instructions.md`
- `examples/css/tokens.css`
- `examples/typescript/design-tokens.ts`
