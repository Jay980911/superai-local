# 專案產物與 Agent 指令檔約定

這份文件定義 `frontend-design` 在目標專案內應留下哪些持久化產物，讓後續模組、後續工程師與其他 coding agents 能沿用同一套設計依據，而不是每次重猜。

## Token board 的預設檔名與位置

預設把 token board 寫入：

- `docs/design-token-board.md`

選這個路徑的理由：

- 它是人可讀、可審查、可版本控制的 Markdown 文件。
- `docs/` 是多數專案都能接受的共用知識區，不會和執行期程式碼混在一起。
- `design-token-board.md` 直接描述內容用途，後續 agent、設計師與工程師都容易搜尋。

只有在目標專案已經有明確文件慣例時，才改用等價路徑，例如：

- `docs/design-system/design-token-board.md`
- `docs/ui/design-token-board.md`

不要把這份共享設計依據只寫成單一 CSS 檔、單一 TypeScript 常數檔或單次對話內的口頭描述，因為那些形式不利於審查，也不適合讓後續模組快速理解「為什麼是這組 tokens」。

## Token board 的建議格式

格式以結構化 Markdown 為主，不要求 YAML frontmatter。這樣最容易讓人類與 agent 共同閱讀、比對與更新。

建議骨架：

```md
# Design Token Board

- Status: canonical
- Owner:
- Last updated:
- Related implementation:
  - `src/styles/tokens.css`
  - `src/design/tokens.ts`

## 1. 情境摘要
- 系統：
- 受眾：
- 主任務：
- 品牌來源：

## 2. Token 方向
- 主題名稱：
- 核心情緒：
- Dominant direction：
- Memorable hook：
- 避免方向：

## 3. 色彩系統
| 家族 | 角色 | 數值 | 用途 |
|---|---|---|---|

## 4. 字體排印
| 角色 | 字體 | 尺寸 | 字重 | 行高 | 用途 |
|---|---|---|---|---|---|

## 5. 間距與密度
| Token | 數值 | 用途 |
|---|---|---|

## 6. 形狀、邊框與陰影
| 家族 | 規則 | 意義 |
|---|---|---|

## 7. 動態
| Token | 數值 | 用途 |
|---|---|---|

## 8. 元件語氣樣本
- Button：
- Input：
- Panel：
- Navigation：
- Feedback：

## 9. 響應式與版面約束
- 首屏必須先看見什麼
- 哪些區塊在 mobile 要退場或收合
- 哪些 layout 可用 container queries

## 10. Do / Don't
### Do
- 
### Don't
- 

## 11. 實作映射
- CSS：
- TypeScript：
- Tailwind：
```

## 寫入規則

- 若任務已進入視覺方向或設計系統層級，不要只在回覆裡描述 token board；直接寫入專案檔案。
- 若專案可寫，預設建立或更新 `docs/design-token-board.md`。
- 若專案已有等價 canonical token 文件，優先更新既有檔案，不額外創造第二份真相來源。
- 若同時產生 `tokens.css`、`tokens.ts`、Tailwind theme，必須在 token board 裡記錄映射位置。

## 高注意力規則應放在哪個指令檔

高注意力規則指的是那種跨畫面、跨模組、跨 agent 都必須反覆遵守的原則，例如：

- 完成條件是高品質具美學高度的使用者介面，不是功能點交
- 主功能區必須在常見 viewport 內可開始使用
- 一次只聚焦一個主要功能
- 功能區應是主畫面主角，不是 hero 或摘要卡
- 響應式設計是必要交付條件
- 避免 `hero + preview hybrid`、`summary-first dashboard`、`card farm`

放置策略：

- 若 repo 已有 `AGENTS.md`，直接 append 到既有檔案中對應的前端 / UI / design guardrails 區段；若無對應區段，再新增一個區段，不覆蓋整份檔案。
- 若 repo 已有 `CLAUDE.md`，同樣以 append 或增補既有區段為原則，不覆蓋整份檔案。
- 若兩者都存在，避免寫兩套不同版本；把共享規則集中在 `AGENTS.md`，再讓 `CLAUDE.md` 匯入 `@AGENTS.md`。
- 若兩者都不存在，預設建立 `AGENTS.md` 作為跨 agent 的共享規則檔。
- 只有在團隊明確使用 Claude Code，或 repo 已有 Claude 慣例時，才另外建立 `CLAUDE.md`。

## 為什麼預設用 AGENTS.md 當共享來源

從工具相容性來看，`AGENTS.md` 較適合當多 agent 共享的 canonical instruction file：

- OpenAI Codex 官方文件明確示範把 MCP 使用規則寫進 `AGENTS.md`
- Claude Code 官方文件明確說 Claude 讀的是 `CLAUDE.md`，但可在 `CLAUDE.md` 內匯入 `@AGENTS.md`

因此最佳做法不是維護兩份平行規則，而是：

1. 把共享高注意力設計原則放在 `AGENTS.md`
2. 若需要支援 Claude Code，再建立 `CLAUDE.md` 並匯入 `@AGENTS.md`
3. 只把 Claude 專屬操作補充留在 `CLAUDE.md`

## 建議 append 進 AGENTS.md 的內容骨架

```md
## Frontend Design Guardrails

### Shared Design Source of Truth
- Treat `docs/design-token-board.md` as the canonical design-token source of truth.
- When tokens or visual direction change, update `docs/design-token-board.md` before or alongside implementation files.
- Keep implementation files aligned with the token board; do not invent a second token system ad hoc.

### Definition of Done
- The goal is a high-quality, aesthetically strong user interface, not a feature checklist.
- The primary functional area must be visible and usable in common viewports without requiring the user to scroll past decorative content first.
- The screen should focus on one primary job at a time; secondary or low-frequency information must be deferred, collapsed, or moved to a secondary surface.
- The functional area must dominate the screen; do not let hero copy, slogan blocks, or summary cards outrank the real task surface.

### Responsive Design
- Responsive behavior is required, not optional.
- Prefer fluid layout, content-driven breakpoints, and container queries where appropriate.
- Do not ship card-farm mobile layouts or shrink desktop multi-panel layouts into unusable miniatures.

### Anti-Patterns
- Avoid `hero + preview hybrid`.
- Avoid `summary-first dashboard`.
- Avoid `card farm`.
- Avoid viewport waste where the main task is pushed below the fold.
```

repo 內可直接參考：

- `templates/agents-append.md`

## 建議 append 進 CLAUDE.md 的最小內容

若需要 Claude Code 支援，保持精簡即可：

```md
@AGENTS.md

## Frontend Design Guardrails
- Follow the shared frontend design guardrails from `AGENTS.md`.
- Treat `docs/design-token-board.md` as the canonical design source of truth when editing UI.
```

repo 內可直接參考：

- `templates/claude-append.md`

## 可直接落地的 token board 模板

若要在專案內直接建立初始檔，可參考：

- `templates/design-token-board.md`

## 參考來源

- OpenAI Developers: [Docs MCP](https://developers.openai.com/learn/docs-mcp)
- Anthropic Claude Code Docs: [How Claude remembers your project](https://code.claude.com/docs/en/memory)
