# 反 AI Slop 操作手冊

這份 playbook 不是要追求「特效更多」，而是避免落入便宜、可替換、沒有品牌記憶點的預設產物。

這不是「看了更好、不看也行」的靈感附錄。只要任務屬於高風險頁型，或第一版畫面已出現 generic 化跡象，這份文件就必須載入；使用者有沒有剛好講出特定關鍵字，不是啟動條件。

高風險頁型：

- landing page
- dashboard
- workspace
- editor
- review tool
- 產品首頁

額外強訊號：

- 「不要 AI 味」
- 「畫面要更有設計感」
- 「不要卡片堆疊 / card farm」
- 「不要 hero 壓過功能區」
- 第一版畫面已高風險退化成 summary-first / template-first / hero 壓主功能 / card farm

## 這份文件負責什麼

- 辨識 generic AI 模板感的高風險指紋
- 幫助 Phase 4 在做資訊優先序與控制項決策時避免退化
- 幫助 Phase 6 在 screenshot critique 時判斷問題是不是只能靠重做解決

它不取代 `SKILL.md` 裡的硬門檻，也不取代 Phase 4 / Phase 6 的主流程文件。正確分工是：

- `SKILL.md`：最高優先、不可違反的硬規則
- Phase 主檔：當前步驟一定會用到的判斷方法
- 本文件：高風險 generic 化問題的專題辨識與修正手冊

## 何時一定要跑 Fingerprint Scan

至少有下列任一條件時，交付前一定要跑一次：

- 首屏已經出現多張等權卡片、摘要區或裝飾區互搶
- 使用者特別要求不要 generic、不想要 AI 味、想提高美學辨識度
- 任務是 landing page、dashboard、workspace、editor、review tool、產品首頁
- 第一版畫面看起來像 template 拼裝，而不是有明確主視覺方向與任務階層

## Typography

Do:
- 為 display 與 body text 設定明確分工，必要時做有意識的字體搭配
- 用 scale、weight、tracking、line-height 建立層級，而不是只放大標題
- 在可行時使用 fluid typography，讓字級跟著 viewport 呼吸

Avoid:
- 沒理由就默認 Inter、Roboto、Arial 或 system stack
- 把 monospace 當成「工程感」捷徑
- 每個區塊都用相同字級與字重，導致層級扁平

## Color And Contrast

Do:
- 用 semantic tokens 管顏色，讓 palette 和 component 語意對齊
- 讓中性色帶一點品牌色傾向，提升整體一致性
- 在有色背景上使用經過校正的文字色，而不是偷懶用灰字

Avoid:
- 無理由使用紫藍霓虹漸層、青色發光、深色底配高飽和 accent
- 把 pure black / pure white 當預設基底
- 為了「有質感」就在標題或指標上加漸層文字

## Direction Purity

Do:
- 選一個主視覺語言，並明講哪些語言這次不採用
- 讓 typography、surface、圖表、表格與 CTA 都服從同一個方向
- 若畫面屬高信任產品，先讓 calm / control / trust 先成立，再決定裝飾

Avoid:
- editorial、high-trust analytics、admin panel 三種語言同時出現
- 把多種「高級感」元素疊在一起，最後只剩模板感
- 用風格混搭掩蓋沒有做出真正層級與節奏的事實

## Spatial Design

Do:
- 用疏密節奏製造層級，讓不同資訊群組有不同呼吸感
- 在必要時刻意打破均質格線，形成記憶點
- 讓主任務區域佔據主舞台，而不是平均分配給所有需求

Avoid:
- 把每個需求都包成一張同尺寸卡片
- 卡片裡再套卡片，讓階層變厚卻不清楚
- 所有內容全部置中，失去閱讀路徑與節奏

## Motion

Do:
- 把 motion 用在 state change、focus shift、內容 reveal，而不是純裝飾
- 用少數高影響力動畫建立體驗節點
- 為 reduced motion 提供替代行為

Avoid:
- 到處散落微動效，卻沒有任何一個動效真的在幫使用者理解狀態
- 使用過度彈跳、果凍感 easing
- 直接動畫 width / height / margin 造成 layout 抖動

## Interaction

Do:
- 讓 primary、secondary、ghost、text action 有清楚階層
- 用 empty state 教使用者下一步，而不是只說沒有資料
- 讓 progressive disclosure 真正減少首屏噪音

Avoid:
- 把所有按鈕都做成 primary
- 用重複標題、重複說明、重複摘要填滿畫面
- 長期固定顯示 reference、FAQ、rules 等次要資訊，與主任務搶注意力
- 沒有 flow 支撐，卻硬塞一顆很大的 primary CTA

## Responsive

Do:
- 在 mobile 上保住 primary task，而不是把 desktop 版等比縮小
- 視情況使用 container queries 做元件層級調整
- 重新安排資訊揭露順序，而不是單純壓縮版面

Avoid:
- 因為版面不夠就直接隱藏關鍵功能
- 手機版保留所有 desktop side panels，導致主工作區變得無法使用

## UX Writing

Do:
- 讓按鈕文案、helper text、error copy 都直接服務當前任務
- 減少重述畫面上已經看得到的內容
- 讓空狀態與錯誤狀態都說清楚原因和下一步
- 把 spec、review、設計方法論語言轉寫成使用者聽得懂的產品語氣

Avoid:
- `OK`、`Submit`、`Yes`、`No` 這類脫離情境的 CTA
- `Something went wrong` 這類沒有處理價值的錯誤訊息
- 為了看起來高級而把文案寫得過度抽象
- 把「避免卡片堆疊」「只保留一個主行動」「不要首頁成功能停車場」這類內部規則直接放進 UI

## Fingerprint Scan

交付前，至少掃一次這些高風險指紋：

- 預設字體堆疊沒有被質疑過
- 色彩走向看起來像泛用 AI 模板
- 版面是卡片農場或 summary-first dashboard
- 主要 CTA 不夠明確，或同時有太多「看起來都很重要」的按鈕
- 裝飾效果存在，但無法解釋它幫助了哪個層級或哪個狀態
- 首屏沒辦法直接開始真實工作
- 首屏文案像內部 review 或 prompt 指示，而不是產品語言
- 視覺語言同時像 editorial、data-heavy product 與 admin panel

若 fingerprint scan 命中多項，不要只做表層 polish；應回到 Phase 4 重整 hierarchy、資訊揭露與控制項選型，必要時回到 token 與主視覺方向重做。

