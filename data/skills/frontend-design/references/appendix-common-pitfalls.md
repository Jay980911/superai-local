# 常見陷阱

## 從 codebase 直接猜設計情境

問題：
- 一看完 repo 就直接跳到視覺方向
- 受眾、語氣、產品性格都沒被確認

修法：
- 先補最小 design context
- 若情境仍不足，就問聚焦問題，或明列假設與風險
- 用程式碼理解限制，不要用程式碼憑空發明品牌策略

## 把內部 review 語言漏到產品文案

問題：
- 標題、helper text、CTA 看起來像設計審查筆記或 prompt 約束
- UI 在解釋它怎麼被做出來，而不是幫助使用者行動

修法：
- 把 internal artefacts 和 user-facing copy 明確切開
- 標題、輔助文案、CTA 都改寫成產品語言
- 若一句話只有設計師或 reviewer 才懂，就不要放進 UI

## 美學描述太抽象

問題：
- 只說「modern」「clean」「premium」，沒有可執行規格

修法：
- 把形容詞轉成可落地的設計條件
- 明定 spacing、type scale、color system、border 強度、radius、motion 規則與 memorable hook

## 每個元件各自發明樣式

問題：
- 任意 Tailwind 色票
- 一次性 padding
- 半徑與陰影不一致

修法：
- 每個視覺屬性都必須映射到 token
- 沒有明確例外就拒絕 arbitrary values

## 沒有真正選定主視覺方向

問題：
- brief 裡提了很多風格，但沒有一條真正落地
- 結果安全、平庸、沒有觀點

修法：
- 選一個 dominant direction
- 明講什麼會讓畫面有記憶點
- 把方向翻成 typography、color、spacing、motion、copy 規則

## 首屏視覺重量互撞

問題：
- 巨大標題、 oversized summary 卡、裝飾圖表同時搶第一眼
- 眼睛找不到清楚閱讀路徑

修法：
- 先決定誰該支配第一眼，其餘降階
- 用不對稱的 scale、contrast、density 建立秩序
- 若兩塊區域一樣吵，就縮小、移位或合併其中一塊

## 同一畫面混用多套視覺方言

問題：
- editorial 背景、高信任分析卡、dashboard 圖表、admin table 同時出現

修法：
- 選一套主方言，明示排除哪些方向
- 若某個元件導入第二種產品類型，就重做或替換
- 不要把「高級感」理解成可以同時堆多種高級模板

## 高信任產品卻做成泛用分析儀表板

問題：
- 高信任或高頻使用介面仍沿用 donut chart、progress bar、KPI stack、admin table 節奏
- 畫面顯得理性疏離，沒有 calm / trust / control

修法：
- 在選元件前先定義 emotional job
- 預設採較穩定的層級、克制文案與 lived-in workflow
- 只有當主任務真的是分析，才使用厚重 analytics pattern

## CTA 只是為了版面上要有顆按鈕

問題：
- 有醒目的 primary CTA，但前後畫面並沒有自然導向那個動作

修法：
- 把 CTA 綁到當前 state、下一步 handoff 或主工作表面
- 若動作時機還沒到，就降為 inline、secondary 或 deferred action
- 不要為了構圖完整就硬塞 primary CTA

## 缺少互動狀態

問題：
- 只設計 default state

修法：
- 所有可互動表面都要覆蓋 default、hover、active、focus、disabled、loading、empty、error

## 多步驟 UI 做成彼此斷裂的畫面

問題：
- 畫面都很精緻，但流程不清楚

修法：
- 在 polish 前先做 journey map、user flow 或 wireflow
- 固定一個 persona、一個 scenario、一個 goal

## 工作台退化成堆疊式 dashboard

問題：
- 使用者得先滑過一堆 summary 才看到真正工具

修法：
- 用一句話寫出唯一 primary task
- 把 viewer、editor、compare surface 直接放上主舞台

## 產品頁退化成 hero + preview hybrid

問題：
- 巨大 slogan 或行銷標題占據首屏
- 真正的產品 UI 被縮成小小 preview 或裝飾 mockup

修法：
- 如果這是產品頁，就把行銷 hero 移出第一屏
- 讓真實工具佔最大、最早被看到的區域
- 首屏最多保留一個會影響下一步判斷的摘要

## 功能清單變成功能停車場

問題：
- prompt 列出很多需求，畫面就給每個需求一張等權卡片

修法：
- 先把每一項分類成 action-critical、decision-supporting、status-feedback、reference、exception-handling、audit/history
- 在畫 layout 前先合併或延後低優先項

## 按檔案工序拆分，最後拼成卡片農場

問題：
- 一開始就規劃成「先寫 HTML 骨架、再補 CSS、再補 JS、再補文件」
- 或者大 patch 被拒後，臨時改成每輪補一個功能區塊 / 一張卡
- 結果每一輪都偏向低耦合 panel，主舞台被拆散成多個等權區塊

修法：
- 在寫檔前先做 implementation slicing plan
- 按體驗骨架拆，不按檔案工序拆
- 第一輪只讓主舞台與 primary CTA 成立
- 第二輪再補必要 state 與 supporting summary
- deferred content、FAQ、規則、歷史、次要圖表放到後段或 on-demand
- 若工具限制導致單輪輸入太大，就縮小 scope，不要增加面板數

## KPI 堆疊重複主故事

問題：
- 已經有主圖表或主工作區，卻再放 3-6 張摘要卡講同一件事

修法：
- 首屏最多保留一個 summary surface
- 次要 KPI 收到 tabs、drill-down 或後段區塊
- 若 summary 只是描述，不如貼近主表面 inline 呈現

## 常駐右側欄搶走主任務注意力

問題：
- summary cards、rules、help content 長駐畫面，但此刻根本用不到

修法：
- 只有會直接影響下一步決策的 side panel 才能常駐
- 其他一律改成 drawer、accordion、modal 或 secondary tab

## 參考內容與任務執行搶主舞台

問題：
- instructions、scoring rules、FAQ 與主操作並列成大型 panel

修法：
- 短 helper copy 直接貼在控制項附近
- 長參考內容退到 on-demand disclosure

## 各 state 的 UI 一次全部渲染

問題：
- empty、validating、blocked、resolved、submitted 同時出現在畫面上，厚重卻不清楚

修法：
- 先建 state model
- 可見性綁定 active state，不要讓所有 state 永久共存

## 主舞台被大片空白容器佔住

問題：
- 畫面中最大的區塊無法穩定顯示有意義內容

修法：
- 重做階層，或提供能解釋缺口與下一步的 instructive empty state

## 只談 Gestalt，沒有把它做成規則

問題：
- 設計文件提到 Gestalt，但 layout 並沒有被這些原則約束

修法：
- 把 grouping、similarity、figure-ground、reading path 轉成 spacing、container、token 與 navigation 規則

## 可重用元件沒有附指南文件

問題：
- 程式碼有了，但設計師與工程師不知道怎麼安全重用

修法：
- 至少補 Usage、Layout、Anatomy、States & Spec、Interaction、Content / Asset

## 稽核只驗原則，不驗低品質預設

問題：
- review 看起來合規，卻放過大量低品質預設

修法：
- 額外掃 vague CTA / error copy、generic fonts、無層級理由的 gradient text、card farm、泛用 AI 配色
- 也要掃 internal-process copy leakage、mixed visual dialect、unsupported CTA prominence、trust-sensitive surface 卻仍像 dashboard template

## 把 accessibility 當成事後補救

問題：
- 等到最後才檢查 accessibility，導致返工成本高

修法：
- 第一輪實作就把 keyboard flow、focus ring、semantic HTML、ARIA、contrast、reduced motion 納入
