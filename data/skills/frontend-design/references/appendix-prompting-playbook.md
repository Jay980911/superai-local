# 提示撰寫手冊

## 主提示模板

```text
你是一位同時具備 Design Systems Engineer 與 Senior Frontend UI Developer 能力的代理。

[技術棧]
- Framework: {{FRAMEWORK}}
- Styling: {{STYLING}}
- Components: {{UI_LIB}}
- Theme: CSS variables 或專案原生 theming

[設計情境]
- 目標受眾: {{AUDIENCE}}
- 主要 jobs-to-be-done: {{JOBS}}
- 品牌人格 / 語氣: {{TONE}}
- 官方品牌來源: {{BRAND_SOURCE}}
- 限制條件: {{CONSTRAINTS}}
- memorable hook: {{HOOK}}
- system purpose: {{SYSTEM_PURPOSE}}
- entry focus: {{ENTRY_FOCUS}}
- navigation mechanism: {{NAVIGATION_MECHANISM}}
- next-step handoff: {{NEXT_STEP_HANDOFF}}
- user story: {{USER_STORY}}

[設計系統規則]
1. 版面使用共享 spacing system
2. typography hierarchy 必須清楚
3. 色彩只能來自 semantic tokens
4. 形狀與陰影使用共享尺度
5. 動態必須克制且有意義
6. accessibility 為硬性要求
7. 若為多步驟任務，先產出 journey map、user flow 或 wireflow
8. 若元件可重用，交付 guideline docs
9. 最終輸出前先掃 anti-patterns
10. 畫 layout 前先產出 task model、state model、information architecture table、visibility plan
11. 除非任務本質就是 multi-monitoring，否則避免 dashboard / card farm / stacked sections
12. reference 與 exception content 預設不放在主舞台
13. 使用者列出的功能與資訊項目是 coverage requirements，不代表首屏要同時並列展示

[視覺方向]
Style: {{STYLE}}
Key differentiator: {{UNIQUE_FEATURE}}
Primary task: {{PRIMARY_TASK}}

[互動狀態]
Default, Hover, Active, Focus, Disabled, Loading, Empty, Error

[輸出要求]
1. system purpose / audience / entry focus / navigation mechanism / next-step handoff
2. user story + interaction model
3. state machine / state matrix
4. information-role classification
5. information architecture table + visibility plan
6. primary question + first-viewport answer
7. intentionally deferred items（含 hidden_now_because / reveal_trigger / container）
8. implementation slicing plan
9. design token spec / token board document
10. design tokens
11. component implementations
12. 適用時補 journey / user-flow artefact
13. first-viewport inventory：保留 vs 延後 / 移除
14. 各 state 的 page layout
15. visual QA evidence + runtime gate result + revision notes
16. token-only styling
17. 僅保留必要註解
18. 可重用時補 guideline docs
19. audit command
```

規則：若 `AUDIENCE`、`JOBS`、`TONE` 仍不明確，先停下來補設計情境，不要直接生成高保真 UI。

## 設計情境蒐集提示

當使用者只說「modern」「premium」「把畫面做得更好看」時使用。

請要求模型先確認：

- 誰會使用這個介面
- 他們想完成什麼工作
- 介面應該傳達什麼感受
- 是否要先查官方品牌來源
- 有哪些技術與 accessibility 限制
- 什麼會讓這次設計有記憶點
- 這到底是什麼類型的系統
- 使用者第一眼該注意什麼
- UI 如何引導到下一個功能
- 這個畫面服務哪個 user story
- 需要支援哪些主要 state 與 transition

然後強制整理成：

```text
Audience:
System purpose:
Primary job:
User story:
Brand / tone:
Official brand source:
Constraints:
Primary task:
Entry focus:
Navigation mechanism:
Next-step handoff:
State machine:
Memorable hook:
Open assumptions:
```

這份摘要沒出來前，不要進入 page layout。

## Token 生成提示

當 token system 尚未存在時使用。

要求：

- 先交付可視覺審查的 token spec document，再寫原始碼
- 補齊 light / dark semantic color slots
- 補 typography scale
- 補 spacing scale
- 補 radius scale
- 補 shadow scale
- 補 motion tokens
- 補 CSS variables、Tailwind 整合與 TypeScript types

若任務不是 trivial，不要把 component code 與 token 定義塞在同一步。

token spec document 至少要有：

- audience + product rationale
- 涉及公司時的官方品牌來源
- theme name / 方向摘要
- primary / secondary / tertiary / neutral palette
- typography roles 與搭配示例
- spacing scale 與密度設定
- radius / border / shadow 規則
- motion character 與 timing tokens
- do / don't 筆記

## 元件實作提示

當 tokens 已存在，而任務是做單一元件時使用。

要求：

- props 覆蓋 variants、sizes、composition
- 補齊 default / hover / focus / active / disabled / loading / error
- 補 accessibility 與 keyboard support
- 補 responsive behavior
- styling 只能走 tokens
- 補 usage examples

## 頁面開發提示

當 components 與 tokens 已存在，而任務是組頁時使用。

要求：

- responsive layout
- loading / empty / error states
- 清楚的 primary task hierarchy
- task model 拆成 primary / secondary / low-frequency / rare goals
- state model 包含 entry conditions、must-show、hidden content、primary CTA
- 對 `empty / drafting / validating / blocked / resolved / submitted` 或等價 state 制定 display strategy
- layout 前先做 information architecture table
- 為主要區塊加 information-role labels
- 規劃 reference / exception content 的 progressive disclosure
- 適用時補多步驟流程可見性
- 用 Gestalt 建立 grouping 與 reading path

## 反堆疊工作流提示

當畫面屬 workflow、workbench、reviewer、editor、diff tool、setup flow，或任何容易退化成 card farm 的頁面時使用。

```text
這不是 dashboard，也不是 admin panel。這是一個 single-primary-task workflow screen。

在生成 UI code 前，先輸出：
1. primary task sentence
2. task model：primary / secondary / low-frequency / rare goals
3. state model：entry condition、must-show content、hidden content、primary CTA、exit condition
4. 每個主要區塊的 information-role classification
5. information architecture table
6. visibility plan
7. content audit buckets：must-see-now / next-step-only / error-only / on-demand-reference / keep-off-first-viewport
8. 預設應隱藏哪些區塊，以及理由

限制：
- 避免 dashboard / card farm / stacked sections
- 不要每個功能都給一張卡
- 首屏最多 2-3 個視覺群組
- 首屏只能有 1 個 primary CTA
- 不要用 giant hero/headline 把真實產品表面壓成 secondary preview
- reference content 必須 on-demand
- exception-handling 只在對應 state 顯示
- right rail 除非直接改變當前決策，否則不得常駐
- 先合併或延後區塊，再考慮新增面板
- 若 visibility 邏輯不穩，先輸出 metadata schema：id / role / priority / visibility / stage / container
- brief 中列出的名詞型需求是 coverage requirements，不是同優先級首屏面板
- 先寫出 primary question，再決定哪些需求是首屏回答、哪些需求只是可到達

額外輸出：
- primary question：這一屏此刻只回答哪個問題
- first-viewport answer：首屏用哪個主操作區或主圖表回答它
- intentionally deferred items：哪些需求故意延後，以及為什麼
- implementation slicing plan：如果要分段寫檔，先列出 slice 1 / slice 2 / slice 3，各自只處理哪個體驗切片

生成第一版 layout 後，再切換成 UX critic：
- 刪掉首屏雜訊
- 合併重複回饋面板
- 把大塊說明卡改成貼近控制項的 helper text
- 把低頻內容移到 accordion / drawer / modal / tab
- 若畫面仍像 landing page hero + dashboard preview，就重做 hierarchy，不要只 polish
```

## 首屏淘汰檢查

當模型容易默認 card farm 或 hero section 時，在生成 UI 前先使用。

```text
在生成 layout 前，先輸出兩份清單：
1. kept_in_first_viewport
2. removed_or_deferred

首屏允許：
- 1 個主操作表面
- 1 個狀態區（僅系統正在處理時）
- 至多 1 個輔助摘要

預設必須延後或移除：
- 產品畫面上的 giant slogan 或 marketing headline
- 當真實產品 UI 已應該出現時，仍只放 screenshot/mockup preview
- 重複主圖表 / editor / viewer 的 KPI cards
- 可以 inline 或 on-demand 的 FAQ / rules / explanation cards

對每個 removed / deferred block，補：
- hidden_now_because
- reveal_trigger
- container

若 brief 寫成「首頁需包含 A、B、C、D」，先把每一項改寫成：
- 現在就必須同時可見
- 可以下一步才看
- 只需可到達，不需首屏常駐

若預期會分多輪 patch 或分段輸入，先規劃：
- slice 1：只讓主舞台與 primary CTA 可用
- slice 2：補必要 state 與唯一 supporting summary
- slice 3：補 deferred content、on-demand disclosure、docs

不要用「每輪補一個功能區塊 / 一張卡」當作拆分策略。
```

若主畫面是產品表面，禁止輸出 hero + preview hybrid。

## 內容稽核提示

當需求很多，需要先判斷哪些內容該進首屏時使用。

```text
在生成 layout 前，先把每個需求分類到：
- must-see-now
- next-step-only
- error-only
- on-demand-reference
- keep-off-first-viewport

對每個不是 must-see-now 的區塊，補：
- hidden_now_because
- reveal_trigger
- container（inline / accordion / drawer / modal / tab / separate step）

若做完這輪後，首屏仍有超過 3 個主要群組，先改成 tabs / wizard / step navigation，不要再加卡片。
若需求清單仍停留在名詞堆疊，先補 `primary question` 與使用者要做的單一決策，再繼續。
若工具限制使你無法一次寫完大檔，先縮小每一輪的體驗 slice，而不是把頁面拆成更多等權 panel。
```

## 結構化中繼資料提示

當畫面包含大量條件式區塊，自然語言已不足以穩定約束時使用。

要求模型先輸出 JSON-like schema：

- `id`
- `role`
- `priority`
- `visibility`
- `stage`
- `container`

再依這份 schema 生成頁面，而不是直接從散亂功能清單開始。

## 兩階段 UX 審查提示

當第一版很可能退化成 card farm 時使用。

```text
Pass 1:
- 生成 IA、state visibility rules、content audit 與第一版 layout

Pass 2:
- 切換成 review council，不要只保留單一 UX reviewer
- 先用 `task-first design director` 抓 card farm、hero 壓主功能、往下堆疊便宜行事
- 再用 `interaction architect` 抓 state / disclosure / next-step handoff
- 再用 `visual systems critic` 抓 generic template 指紋與視覺語言混血
- 必要時加上 `responsive and accessibility auditor` 與 `product language editor`
- 刪掉不屬於當前 state 的內容
- 合併重複回饋面板
- 將 reference content 移到 on-demand 容器
- 移除沒有 trigger 卻永久可見的區塊
- 再檢查一次：使用者能不能在可視範圍內開始當前任務
```

## Review Council 提示

不要讓模型只用作者本人視角自評。改用多角色 review，逐輪切換 reviewer 身份，用不同專業角度批評同一份產出。

建議 reviewer：

- `task-first design director`
- `interaction architect`
- `visual systems critic`
- `responsive and accessibility auditor`
- `product language editor`

至少檢查：

- design context 完整度
- token compliance
- typography hierarchy
- spacing / layout 一致性
- interactive states
- accessibility
- responsive behavior
- maintainability
- creative differentiation
- flow visibility
- task-first information architecture
- progressive disclosure discipline
- guideline delivery
- anti-pattern scan

每輪輸出格式：

```text
Role:
Findings:
Required changes:
Can proceed:
```

若任何 reviewer 的 `Can proceed` 是 `no`，先修正，不要直接往下一階段推進。

## 視覺 QA / 截圖批評提示

在第一版可執行 UI 出來後就使用，不要等到全部 polish 完才做。

要求模型：

- 先在 workspace 可運行時執行 `npm run audit:frontend-runtime -- <workspace> --viewport both --screenshot-dir <dir>`
- 優先用 Playwright 打開頁面；若外部 Playwright / browser 權限受阻，沿用 runtime CLI 已產生的 screenshot
- 擷取一張或多張真實截圖，並回報使用的證據來源
- 以視覺成品而不是原始碼做批評

批評至少要回答：

- 這個畫面視覺上最先傳達的 primary task 是什麼
- 主功能表面是否佔據大多數可視面積
- 哪些區塊是重複、低價值或純裝飾
- 使用者是否能在不過早捲動的前提下開始任務
- 下一步或下一個 mode switch 長什麼樣
- 哪些區塊應該被刪除、合併、延後或縮小

然後強制做一輪 revision，才能 sign-off。

只有在頁面無法啟動，或 runtime CLI 與 Playwright 都無法取得畫面證據時，輸出才可明說視覺 QA 尚未完成。

## AI 指紋審查提示

當結果在技術上正確，但視覺上過度泛用時使用。

檢查：

- 是否用了未經思考的預設字體堆疊
- 是否退化成紫藍霓虹、泛用 dark-mode glow
- 是否變成 card farm、card-in-card、summary-first workbench
- 是否用巨大行銷標題壓過真實工具
- 是否出現 landing-page hero + product-preview hybrid
- 是否一切都置中、失去閱讀節奏
- 是否文案重複、控制項重複、每個按鈕都像 primary
- 是否有不服務層級的玻璃感或裝飾性動態

若找到指紋，修根因，不要只加更多 polish。

## 快速上手範例

可用如下 brief 啟動：

```text
Build a team dashboard for a project management app.

Stack: React + TypeScript + Tailwind CSS + shadcn/ui
Style: Minimal Premium SaaS
Audience: product managers and software teams

Components:
- header with search and user menu
- team members grid
- invite modal
- empty state
- loading skeleton

Output:
- design tokens
- component implementations
- dashboard page
- all states
- accessibility notes
```

規則：若任務不簡單，不要把 token 設計、流程設計、元件設計與最終審查全擠進一個模糊 prompt。
