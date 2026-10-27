# 實作工作流程

## Phase 1：設計分析與 Token 定義

### Step 1：先理解情境

至少確認以下事項：

- Purpose：這個 UI 替誰解決什麼問題
- System type：用使用者聽得懂的語言描述它是什麼系統
- Primary audience：誰會進來使用這個畫面
- Primary task：這個畫面唯一必須幫使用者完成的任務
- Entry focus：使用者一進來第一眼該注意什麼
- Navigation mechanism：介面如何帶往下一步
- User story：使用者為何此刻進入、想得到什麼結果、怎樣算成功
- Structure contract：既有 layout 約束是什麼
- Content reliability：哪些區域能穩定顯示有價值內容
- Aesthetic direction：選哪一條主視覺方向
- Technical constraints：framework、效能、accessibility、design system 限制
- Differentiation：什麼會讓結果有記憶點
- Flow shape：是單頁任務、user flow、wireflow 還是 end-to-end journey
- Reuse scope：一次性頁面還是可重用模式
- Brand source of truth：若涉及真實品牌，官方品牌規範在哪裡

### Step 1.5：把流程外顯化

多步驟 UX 必做。

- 選對 artefact：
  - end-to-end 體驗用 journey map
  - 產品內任務完成用 user flow
  - 畫面骨架與順序要一起審查時用 wireflow
- 固定一個 persona、一個 scenario、一個 goal
- 依時間順序排列步驟
- 每一步都記錄 user action、system feedback、pain point / opportunity

### Step 1.6：鎖定 workbench 階層

任務型工具必做。

- 先命名 primary task surface，例如 viewer、diff panel、editor、preview、compare canvas
- 優先把中央主舞台留給它
- 補充資訊退到 sidebar、inspector、drawer、accordion 或 secondary tab
- 在 polish 前就先定義 empty、error、loading 行為
- 若主舞台無法穩定顯示有價值內容，先重設 hierarchy
- 若這是產品畫面，不要把主舞台浪費在行銷 hero，讓真實 UI 縮成 preview

### Step 1.7：建立資訊優先序與揭露策略

混合 primary action、status、reference 的畫面必做。

- 用一句話寫出 primary job；若寫不出一句話，表示畫面還不夠聚焦
- 把 task model 拆成：
  - primary goal
  - secondary goal
  - low-frequency goal
  - rare goal
- 在畫 layout 前，先列出所有區塊、控制項與訊息
- 逐項標記角色：
  - `action-critical`
  - `decision-supporting`
  - `status-feedback`
  - `reference`
  - `exception-handling`
  - `audit/history`
- 先做 information architecture table：
  - item
  - frequency
  - 是否必須進首屏
  - 對應 task stage / state
  - show condition
  - 建議容器
  - 是否可收合
- 依 state 規劃 visibility，例如 `empty`、`drafting`、`validating`、`resolved`、`blocked`、`submitted`
- 對每個 state 定義：
  - entry condition
  - user goal
  - must-show content
  - hidden content
  - primary CTA
  - exit condition

### Step 1.7b：先畫 state machine，再畫 layout

只要畫面有超過一個重要互動狀態，就必做。

- 列出核心 state，不只列視覺變體
- 每個 state 都要定義：
  - entry condition
  - user intent
  - must-show functional surface
  - optional / deferred information
  - primary CTA
  - transition target
- 若某個區塊跨多個 state 常駐，必須說明理由；否則預設隱藏到需要時再顯示

### Step 1.8：做首屏淘汰檢查

當畫面容易退化成 landing page hero、dashboard summary 或 card farm 時必做。

- 先列出所有想進第一屏的區塊
- 首屏只保留：
  - 1 個主操作表面
  - 1 個狀態區（系統正在處理時）
  - 至多 1 個輔助摘要
- 預設淘汰或延後：
  - 不推進任務的巨大 slogan
  - 產品頁上的行銷 hero
  - 重複主故事的 KPI 卡
  - 可以 inline 或 on-demand 的長說明卡
- 記錄 `kept_in_first_viewport` 與 `removed_or_deferred`
- 若真實產品表面比裝飾或摘要還小，就停下來重設 hierarchy

### Step 1.9：定義 transition contract

畫面包含多種功能、模式或階段時必做。

- 說明使用者如何知道先做什麼
- 說明當前功能如何帶到下一功能
- 明確指定 UI 機制：
  - tab
  - step flow
  - inline reveal
  - drawer
  - mode switch
  - master-detail
- 若 transition 不清楚，就先簡化流程，不要繼續加面板

### Step 1.10：先做 implementation slicing plan，再開始寫檔

只要預期輸出不是極小 patch，就必做。
- 避免 Windows 路徑長度限制失敗，落盤時使用相對路徑
- 先按體驗骨架切，不要按檔案工序切
- 每個 slice 都要寫：
  - 這一輪只完成哪個體驗片段
  - 對應哪個 state / transition
  - 涉及哪些檔案
  - 驗證方式是什麼
- 優先順序固定為：
  - slice 1：主舞台 + primary CTA + 最小可用 state
  - slice 2：必要狀態切換 + 唯一 supporting summary
  - slice 3：deferred content / on-demand disclosure / docs
- 若第一輪就把首屏拆成多個等權區塊，只因為比較容易分批貼上，代表 slicing plan 失敗，應回到 Step 1.7 與 Step 1.8 重做
- 若預期 HTML / CSS / JS 會很長，先縮小單輪 scope，不要把「先建頁面骨架、再各檔補滿」當成預設
- 切片完成定義應是「主流程更可用」，不是「又多了一張卡」或「又完成一個 summary panel」

### Step 2：生成設計 Tokens

在寫 token 程式碼前，先產出 token spec document 或 token board。

若專案可寫，預設把這份文件落到 `docs/design-token-board.md`，作為後續模組與其他 agents 的共享 source of truth。

這份文件至少要包含：

- palette blocks 與色階
- type roles
- spacing rhythm
- radius / shadow 行為
- motion character
- component tone examples

對每個 token family，都要說明為什麼它適合這群受眾、這種任務壓力與這個產品人格。
若涉及真實品牌，請附上官方品牌來源與使用限制。

建議產物：

- `docs/design-token-board.md`
- 或其他等價文件

最低類別：

- 淺 / 深色主題的 semantic color slots
- typography scale
- spacing scale
- radius scale
- shadow scale
- motion tokens

## Phase 2：元件開發

### Step 3：建立可重用元件

每個互動元件至少定義：

- variants
- sizes
- states
- accessibility support
- responsive behavior
- theme-aware styling
- token-only styling

必備狀態：

- Default
- Hover
- Active
- Focus
- Disabled
- Loading
- Empty
- Error

### Step 3.5：若要重用，就補 guideline

若是 component library、shared pattern 或任何需要別人重用的 UI，至少補上：

- Usage
- Layout
- Anatomy
- States & Spec
- Interaction
- Content / Asset

## Phase 3：組裝頁面

### Step 4：用元件組頁

- 只用既有 tokens 與 components
- 以 mobile-first 檢查可用性
- 每個 screen / main view 只保留一個 primary task
- 主舞台留給 primary task surface，不是任務摘要
- supporting metadata 與低頻控制項退到次層
- 首屏聚焦真實工作，不要塞說明牆或卡片農場
- 不要把巨型 landing-page hero 與縮小版產品 preview 混在同一個主畫面
- 不要讓重複 KPI 或裝飾文案比功能區更大
- 優先把 helper text 貼近對應控制項，而不是做獨立說明卡
- 若多個區塊平起平坐，先回頭修 task model，不要加更多 visual chrome
- 補齊 loading、empty、error state
- 流程可見性要明確：現在在哪、完成了什麼、下一步是什麼
- label 與 navigation 要符合使用者心智模型，而不是內部 jargon
- 當使用者一次只專注一種工作模式時，優先 tabs 或 view switching
- 若採分段實作，先讓 slice 1 單獨成立成真正可用的主流程，再補次要資訊；不要為了讓每輪輸出看起來完整而先鋪 card grid

## Phase 4：品質驗證

### Step 4.5：sign-off 前先做視覺批評循環

第一版可執行 UI 出來後必做。

- 啟動 app 或 preview
- workspace 可運行時先跑 `npm run audit:frontend-runtime -- <workspace> --viewport both --screenshot-dir <dir>`，記錄 desktop / mobile 結果與 screenshot 路徑
- 視覺批評優先用 Playwright 開啟真實頁面並截圖；若外部 Playwright / browser 權限受阻，沿用 runtime CLI 產生的 screenshot 與結果
- 以畫面本身為對象做 critique，不只看 DOM
- 至少回答：
  - 主任務是否最突出
  - 功能表面是否佔據大多數可視面積
  - 是否有重複、低價值或純裝飾區塊
  - 主任務是否能在可視範圍內開始
  - 下一步或 mode switch 是否清楚
  - 核心工作是否需要過早捲動
- 寫出具體 layout finding，再修一輪
- 非 trivial 前端任務至少做一輪 screenshot -> critique -> revision
- 只有在頁面無法啟動且 runtime CLI 也無法執行時，才可明講視覺 QA 尚未完成

### Step 5：Review Council 輪番審查

不要只做單一自評。每個 phase 產出一旦落地，就切換 reviewer 角色輪番批評；預設至少 3 角度，複雜頁面用 5 角度。

建議順序：

1. `task-first design director`
2. `interaction architect`
3. `visual systems critic`
4. `responsive and accessibility auditor`
5. `product language editor`

至少檢查：

- 所有顏色都來自 semantic tokens
- 間距與圓角使用共享尺度
- typography hierarchy 與 line-height 合理
- 互動狀態完整
- accessibility 涵蓋 WCAG AA、鍵盤操作、ARIA、focus 指示
- responsive 在 mobile / tablet / desktop 都可用
- 主任務在常見 viewport 中仍然可用
- loading / empty / error state 存在
- layout 保住 primary task hierarchy
- 若是 workbench / workflow 頁面，已有 task model、state model、information architecture table、visibility plan
- task model 已拆成 primary / secondary / low-frequency / rare goals
- 每個資訊區塊都標明角色
- 每個 state 都定義 entry condition、must-show content、hidden content、primary CTA
- reference 與 exception content 採條件式揭露，不長期霸佔主舞台
- 首屏主要視覺群組不超過 2-3 個
- 多步驟 UX 已補 journey map、user flow 或 wireflow
- 可重用元件已附 guideline docs
- 明顯 AI-slop 反模式已消失或有合理化理由
- 視覺證據（Playwright 截圖或 runtime CLI screenshot）已被審查，視覺問題已修掉或明列未解

每位 reviewer 輸出格式：

- `Role`
- `Findings`
- `Required changes`
- `Can proceed: yes/no`

只要任一 reviewer 回 `no`，就先修，再重跑該 reviewer。

### Step 6：跑 deterministic audit

不要等到 sign-off 才第一次跑。建議至少分兩次：

1. 第一版 layout / workbench shell 出來後，先跑 early gate，提早抓主舞台、可視區佔比 proxy、reveal/hide 控制與 card farm 風險。
2. 若頁面已可運行，立刻跑 runtime CLI，直接量 desktop / mobile 的主舞台面積、hero 佔比、below-the-fold 大區塊與 disclosure 是否真的生效。這一步對 workflow / workbench / dashboard / app home 類頁面視為必要 gate，不是可選建議。
3. 若 Playwright MCP、外部瀏覽器權限或截圖工具受阻，不接受以此跳過驗證；workspace 可運行時，改用本地 runtime CLI 產生文字結果與 screenshot。
4. 完成 final 視覺 QA 與修正後，再跑 final audit。

```bash
python skills/frontend-design/scripts/audit_frontend_principles.py <workspace>
python skills/frontend-design/scripts/audit_frontend_principles.py <workspace> --stage early
python skills/frontend-design/scripts/audit_frontend_principles.py <workspace> --stage early --require-workbench-ia
npm run audit:frontend-runtime -- <workspace> --viewport both --screenshot-dir <dir>
python skills/frontend-design/scripts/audit_frontend_principles.py <workspace> --format json
python skills/frontend-design/scripts/audit_frontend_principles.py <workspace> --require-guideline-docs
```

結果解讀：

- `FAIL`：缺少必要結構或必要 proxy
- `WARN`：大概率需要視覺或人工確認
- `MANUAL_REVIEW`：例如 Closure、Common Fate 這類感知型檢查仍需人工判斷

`--stage early` 會把以下警告直接提升成 fail，避免拖到最後才發現：

- `viewport_budget_proxies`
- `disclosure_control_signals`
- `card_farm_risk`

目前 deterministic audit 也會對以下項目做初步 proxy 檢查：

- `viewport_budget_proxies`：是否有主舞台與 viewport-aware layout 的程式訊號
- `disclosure_control_signals`：是否有 tabs / accordion / drawer / dialog / aria-expanded / data-state 等 reveal/hide 控制
- `card_farm_risk`：是否疑似把多個 card / summary 區平鋪卻缺少切換與收合機制

runtime CLI 另外會直接量：

- desktop / mobile 下主舞台在第一個 viewport 內的實際可視面積
- hero / intro 區與 side rail 是否壓過主功能區
- 大型次級區塊是否直接堆到首屏外
- tablist / 控制項是否真的對應到 hidden / tabpanel / collapsed 內容，而不是假切換

若 runtime CLI 對任一 viewport 回傳 `FAIL`，先重做 hierarchy / disclosure / responsive，不要跳過這步直接進 sign-off。
若以「權限不足無法截圖」結束任務，但 workspace 其實可本地運行，視為流程違規。
