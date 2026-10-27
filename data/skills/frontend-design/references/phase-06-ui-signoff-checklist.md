# 品質檢查清單

這份清單用於前端 UI 與設計交付的 sign-off。

## 輸出品質標準

### 程式碼品質
- 可直接交付正式環境，不是只給示意碼
- 命名一致
- 重複最小化
- 該走 token 的地方不得硬編 magic number
- 技術棧支援時應補齊 TypeScript 型別

### 設計品質
- 有清楚且可辨識的美學方向
- token 使用一致
- 視覺語言連貫
- 微互動有意義
- 間距、陰影與轉場都經過打磨

### 無障礙品質
- 至少達到 WCAG AA
- 可用鍵盤完整操作
- 優先使用 semantic HTML
- ARIA 只在必要時補充
- focus 管理與可見指示清楚

### 效能品質
- bundle size 合理
- 適合時採 lazy loading
- 優先使用 CSS-first 動態
- 圖片與資產有基本節制

## 驗證檢查清單

### 設計情境
- 已確認 target audience，或明列可追溯假設
- 已確認 primary jobs-to-be-done
- 已確認品牌人格與語氣
- 已確認 emotional job、avoided tone、voice register
- 涉及公司品牌時，已引用官方品牌來源
- 已確認主要限制條件
- 已定義 memorable hook，或說明為何刻意不做

### Token 與系統
- 已有具體 token spec / token board 文件
- token rationale 能回扣受眾與產品情境
- 色彩全部來自 semantic tokens
- 間距來自共享尺度
- 圓角來自共享尺度
- 陰影有清楚層級理由
- 字體層級清楚
- 內文行高舒適

### 狀態與互動
- default state 完整
- hover state 完整
- active state 完整
- focus state 完整
- disabled state 完整
- loading state 完整
- empty state 完整
- error state 完整

### 無障礙
- 對比符合 WCAG AA
- 鍵盤導覽完整
- focus 指示可見
- semantic HTML 正確
- 需要時補 ARIA labels
- labels 與 alt text 正確

### 響應式設計
- mobile 版可用
- tablet 版可用
- desktop 版可用
- touch target 足夠大
- 沒有意外的 horizontal scroll
- 主任務在常見 viewport 中仍能啟動且不會過早溢出

### 流程與感知
- 第一優先 MUST RULES 已全部成立：主功能完整落在常見首屏、當前畫面只服務一個主要功能、主功能區是視覺中心、沒有 card farm、Web 型應用已完成 responsive 約束
- 多步驟任務已有 journey map、user flow 或 wireflow
- actor、scenario、goal 明確
- current step / completed / next action 可見
- 當前畫面只有一個明確 primary task
- workbench / workflow 類畫面已有 task model
- workbench / workflow 類畫面已有 state model
- task model 已拆成 primary / secondary / low-frequency / rare goals
- 每個資訊區塊都有明確角色，例如 action-critical、status-feedback、reference
- layout 前已先做 information architecture table
- 已做 content audit，區分 must-see-now / next-step-only / error-only / on-demand-reference / keep-off-first-viewport
- 每個 state 都定義了 entry condition、must-show content、hidden content 與 primary CTA
- 每個 state 都有 display strategy，不會把所有區塊預設全開
- 主任務佔據主舞台
- 主任務在常見首屏內可見且可用
- 主功能區完整落在常見首屏可視範圍內，而不只是「有一部分露出來」
- 主功能區是目前畫面的視覺中心，而不是被 hero、摘要卡、口號或裝飾區搶走注意力
- reference content 除非直接影響當前決策，否則採 on-demand 顯示
- exception-handling 內容是條件式顯示，不會永久常駐
- 使用者可見文案不外漏 internal review、prompt 或 checklist 語言
- 首屏只有一套主視覺語言
- 首屏視覺重量能形成閱讀路徑，而不是區塊互撞
- 每個 deferred block 都定義了 hidden_now_because、reveal_trigger 與 container
- 沒有任何區塊在缺乏 state 或 trigger 理由下永久顯示
- supporting information 已被降階，除非它真的是此刻必要內容
- 已在開始寫檔前先做 implementation slicing plan，而不是等大 patch 被拒後才臨時拆分
- 若採分段實作，第一輪已先讓主舞台可用，而不是先鋪出多個等權卡片區
- 首屏能直接開始真實工作
- 首屏主要視覺群組不超過 2-3 個
- 同一時間只有一個 primary CTA 搶第一層注意力
- 每個 primary CTA 都能回扣 visible flow、current state 或 next-step handoff
- 控制項選擇依據 interaction model，而不是因為元件庫剛好有
- tabs / step flow / drawer / modal / accordion 的選用符合任務階段與資訊揭露需求
- 若畫面有 4 個以上大型區塊，已改成 tabs、wizard 或 step flow，除非有充分例外說明
- 沒有把多張等權卡片、摘要面板或 side modules 一路堆成 card farm
- 產品畫面沒有 hero + product-preview hybrid
- hero、口號或裝飾摘要沒有壓過功能主舞台
- 巨大標題的存在有任務價值，不是純裝飾
- 高信任 consumer surface 先傳達 calm / control / trust，而非 analysis density
- 高信任首頁不會默認變成 donut + progress + KPI stack
- empty state 有說明缺什麼、為什麼缺、下一步是什麼
- 標籤符合使用者心智模型
- recovery path 已被記錄
- grouping、similarity、figure-ground、reading path 在畫面上看得出來
- sign-off 前已做真實 screenshot review；Playwright 優先，受阻時改用 runtime CLI screenshot / result
- screenshot critique 依 `references/phase-06-visual-failure-rubric.md` 執行
- screenshot critique 已確認當前任務可在可視範圍內開始
- sign-off 前沒有 unresolved fatal signal
- rebuild-required verdict 沒有被忽略
- 第二輪 UX review 已刪除重複、低價值、無 trigger 的區塊
- deterministic audit 已檢查 `viewport_budget_proxies`、`disclosure_control_signals` 與 `card_farm_risk`
- 第一版結構 layout 出來時已先跑 `--stage early`，沒有把這些問題拖到最後才檢查
- runtime CLI 已在 desktop / mobile 下量過主舞台、hero、side rail、below-fold sections 與 disclosure 是否真的生效
- runtime CLI 對 desktop / mobile 沒有任何 `FAIL`
- 任何 tablist / segmented control / stepper 都有對應的 `hidden` / `tabpanel` / `collapsed` 被控制內容
- 若外部截圖或瀏覽器權限受阻，已改用本地 runtime CLI 產生結果與 screenshot，而不是只做口頭說明

### 指南與反模式
- 可重用元件已附 guideline docs
- CTA copy 直接服務當前任務
- 錯誤文案有說明原因與下一步
- 裝飾效果都有層級理由
- generic font stack 不是未經思考的預設
- 沒有靠 autopilot 用泛用 AI 指紋配色或特效
- 沒有沒有理由的 card farm / card-in-card 結構
- 當畫面需要強閱讀路徑時，沒有退化成 centered-everything
- 沒有把多種 premium-template trope 疊在一起卻缺乏統一方向

### 程式碼審查
- 適用處已補齊型別定義
- 沒有 linter error
- 元件邊界清楚
- 命名一致
- 註解只出現在真正有幫助的地方
- 輸出已達 production-ready

## 優化提示

1. 先做 tokens，再做元件。
2. 先以 mobile-first 驗證可用性。
3. 早點確認 state，不要最後才補。
4. 美學可以大膽，但系統必須嚴謹。
5. Accessibility 不可退讓。
6. 用真實內容測試，不要只看 placeholder。
7. 交付前先跑 Review Council，不要只做 self-audit。
8. 非直覺的設計決策要留下說明。
9. 讓下一位工程師能維護，而不是只能沿用。
