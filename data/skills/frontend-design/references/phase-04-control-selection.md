# 控制項選型指南

這份文件用來避免把所有需求都停進卡片。控制項選用必須回應互動模型、任務順序與可見區域限制。

## 選用原則

- 優先選能強化主任務與下一步 handoff 的控制項。
- 若任務有明確先後順序，優先 `step flow / wizard / tab`，不要把所有步驟同頁攤開。
- 若資訊是低頻、參考性或例外性，優先 `accordion / drawer / modal / secondary tab`，不要讓它常駐首屏。
- 卡片只用來表達有明確邊界的單元，不用來取代動線設計。

## 控制項建議

| 控制項 | 適合情境 | 不適合情境 | 常見誤用 |
|---|---|---|---|
| Tabs | 使用者在少數幾個平行模式中切換，且一次只看一個 mode | 流程有明確先後依賴 | 用 tabs 掩蓋其實應該拆步驟的流程 |
| Segmented control | 2-4 個輕量 view/mode 切換 | 選項很多、內容複雜 | 把多步驟流程硬縮成 segmented control |
| Step flow / wizard | 有明確順序、前一步影響下一步 | 使用者需要自由比較多個平行 view | 把所有步驟內容仍舊全部攤在同頁 |
| Accordion | 低頻參考資訊、補充規則、進階設定 | 核心主操作內容 | 把主要 CTA 或核心表單藏進 accordion |
| Drawer / side panel | 次級細節、檢視補充內容、不想離開主表面 | 主任務本身 | 把常用關鍵資訊永遠放在 drawer 裡 |
| Modal / dialog | 短暫確認、危險操作、短流程補充 | 長流程、重度編輯、需要頻繁切換參照 | 把主要工作流程關進 modal |
| Table | 需要掃描、比較、排序大量結構化資料 | 只有 1-2 個摘要資訊 | 為了看起來專業就濫用 table |
| Cards | 明確獨立的實體、列表項目、選擇項 | 單一主任務 workflow 首屏 | 把每個需求都做成等權卡片農場 |
| Sticky action bar | 主要 CTA 需要持續可達，但內容本身很長 | CTA 其實不夠明確 | 用 sticky action bar 掩蓋流程設計混亂 |
| Master-detail | 左側選項，右側深看同一個實體 | 流程是線性的、不是瀏覽式 | 左邊列表與右邊內容都塞太滿，搶焦點 |

## 快速判斷

- `這是模式切換`：優先 tabs / segmented control。
- `這是流程切換`：優先 step flow / wizard。
- `這是補充資訊`：優先 accordion / drawer。
- `這是危險確認或短暫打斷`：優先 modal。
- `這是需要掃描比較的大量資料`：優先 table / master-detail。
- `這只是因為不知道怎麼排版才做成 card`：不要用 cards。

## 禁止拿控制項掩蓋的問題

- 沒有 state machine。
- 沒有 next-step handoff。
- 沒有 first-viewport inventory。
- 主功能超出可視範圍。
- 重複資訊太多，只是換容器繼續存在。

