# 使用者故事與狀態機

這份文件對應 Phase 2。重點是把「功能清單」轉成「互動模型」。

## 先做 user story

至少回答：

- 誰在什麼情境下進入這個畫面。
- 他現在想完成什麼。
- 成功的定義是什麼。
- 完成這一步後，下一步要去哪裡。

建議格式：

```text
As a {{audience}}
I enter this screen when {{trigger}}
I need to {{primary task}}
So that {{outcome}}
After that I should be guided to {{next step}}
```

## 再做 interaction model

不要從「有哪些功能」開始，而是先回答：

- 現在只能聚焦一個功能，哪一個是唯一主任務。
- 次要資訊哪些延後揭露。
- 系統用什麼機制切換到下一功能。
- 使用者怎麼知道目前在哪個 mode / step / state。

## 狀態機最低要求

每個 state 至少要定義：

- `entry_condition`
- `user_intent`
- `must_show`
- `hidden_or_deferred`
- `primary_cta`
- `transition_target`
- `exit_condition`

常見 state：

- `empty`
- `drafting`
- `validating`
- `blocked`
- `resolved`
- `submitted`

關鍵原則：

- 資訊是否該出現，優先看使用者目前處在哪個 state，不是看資訊本身是否「很重要」。
- 同一塊資訊若橫跨多個 state，都要說明為什麼仍需常駐；否則預設應該延後揭露。
- 畫面可見性要和 state 綁定，避免所有區塊永久攤開。

## state matrix 模板

| State | Entry condition | Must show | Hidden / deferred | Primary CTA | Transition target |
|---|---|---|---|---|---|
| empty | 無內容 / 尚未開始 | 主輸入區、簡短提示 | 摘要、歷史、進階設定 | 開始 / 建立 | drafting |
| drafting | 正在輸入但尚未驗證 | 主輸入區、可編輯內容、主 CTA | 評分細節、送件摘要 | 驗證 / 下一步 | validating |
| validating | 系統正在處理 | 進度、必要狀態 | FAQ、歷史、次要摘要 | 等待 / 取消 | resolved / blocked |
| blocked | 驗證失敗或缺資料 | 錯誤原因、補件入口 | 正常流程摘要 | 修正 / 補件 | drafting |
| resolved | 已產生可行結果 | 主結果、下一步 | 不必要說明 | 送出 / 套用 | submitted |
| submitted | 已送出 / 已完成 | 結果、後續動作、狀態 | 編輯區、驗證中介面 | 檢視結果 / 返回列表 | any |

## 依 state 規定顯示策略

- `empty`：只顯示主輸入框、簡短說明與主 CTA。
- `drafting`：保留可編輯區與主要操作，不先展開決策摘要。
- `validating`：隱藏評分細節與低頻參考，只保留進度、取消或等待資訊。
- `blocked`：顯示錯誤原因與補件上傳區，其他正常流程資訊退場。
- `resolved`：才展開摘要、判斷依據與送件決策。
- `submitted`：把編輯 UI 收掉，改顯示結果與後續動作。

這種 state-driven UI 是避免「所有資訊永久常駐」最有效的方式之一。

## 失敗訊號

只要出現以下任一項，就代表還不能進入 layout：

- state 只有名稱，沒有顯示與切換規則。
- user story 寫成功能描述，沒有使用情境與完成條件。
- 畫面上每個區塊都像同等重要。
- 完成當前任務後，沒有明確的下一步 handoff。
- `submitted` 之後仍永久保留完整編輯區，沒有收斂資訊與操作。

