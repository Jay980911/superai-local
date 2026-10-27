# 資訊優先序與版面配置

這份文件對應 Phase 4。先收斂資訊與首屏，再決定版面。

若任務高風險退化成 `hero + preview hybrid`、`summary-first dashboard`、`card farm` 或 generic template，追加讀 `references/appendix-anti-ai-slop.md`。那份文件不是可有可無的靈感附錄，而是用來辨識與壓制 generic 化指紋的專題手冊。

## 第一優先 MUST RULES

一旦進入網站、Web App、dashboard、workspace、editor 或其他頁面設計，以下規則必須全部同時成立；任一條不成立就回到 IA 重做：

- 主功能區必須完整落在常見首屏可視範圍內，且可立刻開始主要任務。
- 當前畫面必須只回答一個 `primary_question`；其他資訊只能 deferred、收合、分步或退到次層。
- 主功能區必須是視覺中心，不得被 hero、口號、摘要卡、裝飾視覺或 side rail 壓過。
- 嚴禁 card farm；不得把多張等權卡片一路堆到首屏外。
- Web 型應用一律必須 responsive；不得用固定寬度或多欄硬排把主功能擠出可視範圍。

## 先做 task model

至少拆成：

- `primary_goal`
- `secondary_goal`
- `low_frequency_goal`
- `rare_goal`

如果寫完仍像功能清單，而不是互動順序，就不要進入 layout。
若需求以「首頁需包含 A、B、C、D」表達，先把它改寫成單一 `primary_question` 與 `first_viewport_answer`，再決定哪些項目延後揭露。

## 每個區塊都要有 role

- `action-critical`
- `decision-supporting`
- `status-feedback`
- `reference`
- `exception-handling`
- `audit/history`

沒有 role 的區塊，不應直接上版面。

範例對照：

- 分享連結輸入框：`action-critical`
- 送件摘要：`decision-supporting`
- 逐筆狀態面板：`status-feedback`
- 繳交指引與評分規則：`reference`
- PDF / 截圖補件：`exception-handling`

## 資訊架構表最低欄位

| 資訊項目 | 使用頻率 | 首屏是否必須 | 所屬 state / stage | 顯示條件 | 建議容器 | 是否可收合 |
|---|---|---|---|---|---|---|

建議先填一版內容，例如：

| 資訊項目 | 使用頻率 | 首屏是否必須 | 所屬 state / stage | 顯示條件 | 建議容器 | 是否可收合 |
|---|---|---|---|---|---|---|
| 送件按鈕 | 高 | 是 | resolved | 驗證通過後 | sticky footer | 否 |
| 評分規則 | 中低 | 否 | any | 使用者主動查看 | accordion | 是 |
| 補件上傳 | 低 | 否 | blocked | 驗證失敗時 | inline panel | 否 |

## 首屏淘汰規則

先列兩份清單：

1. `kept_in_first_viewport`
2. `removed_or_deferred`

首屏預設只保留：

- 1 個主操作區
- 1 個狀態區（只有系統真的在處理時）
- 至多 1 個次要摘要

預設淘汰：

- giant slogan / giant headline
- hero + preview 混搭
- 與主操作區重複的 KPI 卡
- 大型說明卡 / FAQ 卡 / 規則卡
- 為了填版而存在的空容器
- 只是因為 brief 點名，就被硬塞進首屏的次要資訊

## reveal / hide 規則

每個 deferred block 都要寫：

- `hidden_now_because`
- `reveal_trigger`
- `container`

寫不出來，代表 reveal / hide 邏輯還沒想清楚。

## content audit

在 layout 前，先把所有資訊分成：

- `must-see-now`
- `next-step-only`
- `error-only`
- `on-demand-reference`
- `keep-off-first-viewport`

另外強制補：

- `primary_question`
- `first_viewport_answer`
- `intentionally_deferred_items`

這一步的目的，是逼模型先判斷「現在該不該出現」，不是直接進入切版。

## disclosure rules

- 首屏最多只允許 1 個主操作區、1 個狀態區、1 個次要摘要。
- brief 中的 coverage requirements 不等於首屏同時可見需求；先證明它服務同一個 `primary_question`，否則不要上首屏。
- `reference` 類資訊預設收合。
- `exception-handling` 只在錯誤 state 顯示。
- 進階設定放進 `accordion / drawer / modal`，不要常駐。
- 相同任務流中的說明文字優先嵌在元件旁，不要獨立成大 card。
- 主功能區若未同時滿足「完整落在首屏」與「成為視覺中心」，不得宣稱 layout 已收斂。
- 單頁最多 3 個主要視覺群組；超過就合併、拆步驟或延後揭露。
- `tablist`、segmented control、stepper 或任何切換 UI，若沒有對應 `hidden` / `tabpanel` / `collapsed` 的內容切換，只算裝飾，不算 disclosure。
- 與當前工作無關的 `hidden` 節點、loading skeleton、預載內容，不算有效 disclosure 證據。

## metadata schema

若自然語言不夠穩，先把區塊寫成結構化資料，再生成 UI：

```json
[
  {
    "id": "input_links",
    "role": "primary-action",
    "priority": "high",
    "visibility": "always",
    "stage": ["empty", "drafting"]
  },
  {
    "id": "submission_summary",
    "role": "decision-supporting",
    "priority": "medium",
    "visibility": "conditional",
    "stage": ["resolved"]
  },
  {
    "id": "upload_evidence",
    "role": "exception-handling",
    "priority": "medium",
    "visibility": "conditional",
    "stage": ["blocked"]
  }
]
```

加入 `priority / visibility / stage / role` 這類 metadata，會比單純自然語言 prompt 穩很多。

## 兩階段生成

對複雜 workflow screen，預設採兩階段：

1. 先輸出 IA / visibility plan / metadata schema。
2. 再生成 UI。
3. 再切成 UX reviewer 身份，刪掉首屏不必要資訊、合併重複區塊、把低頻內容收合。

## 失敗型態

以下任一項成立，就回到 IA 重做：

- 首屏超過 2-3 個主要視覺群組。
- 使用者必須先讀摘要卡才碰到真實工具表面。
- 首屏同時試圖回答多個 primary questions。
- 主功能沒有佔據大多數可視面積。
- 主功能區沒有完整落在常見首屏可視範圍內。
- 右欄、卡片牆或說明區只是因為版面有空位而存在。
- 畫面無法回答「現在先做什麼、接著去哪裡」。
- 區塊沒有明確 trigger 卻永久常駐。
- fingerprint scan 顯示畫面仍像 generic AI 模板，而不是有明確 hierarchy 的產品介面。

