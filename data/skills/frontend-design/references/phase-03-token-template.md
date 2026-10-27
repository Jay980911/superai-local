# 設計 Token 規格模板

在受眾與產品情境清楚後立刻使用這份模板，不要直接從 brief 跳到 `tokens.css`。

這份文件應該像 token board 或 theme sheet 一樣，足夠具體到能直接做視覺審查。

預設檔名與路徑：

- `docs/design-token-board.md`

若專案已有等價 canonical 設計文件，優先更新既有檔案，而不是再創造第二份。

## 0. 文件狀態

- Status：`canonical`
- Owner：
- Last updated：
- Related implementation：
  - `src/styles/tokens.css`
  - `src/design/tokens.ts`

## 1. 情境摘要

- 系統：
- 受眾：
- 主任務：
- 產品性格：
- 任務壓力：
- 無障礙 / 平台限制：
- 官方品牌來源（若涉及公司或產品）：

## 2. Token 方向

- 主題名稱：
- 核心情緒：
- 為什麼這個方向適合這群受眾：
- 這個方向必須避免什麼：

## 3. 色彩系統

列出實際值，不要只寫形容詞。

| 家族 | 角色 | 數值 | 用途 |
|---|---|---|---|
| Primary | 主行動 / 焦點 | | |
| Secondary | 輔助強調 | | |
| Tertiary | 點綴 / 差異化 | | |
| Neutral-900..50 | 表面 / 文字 / 邊框 | | |
| Success | 正向回饋 | | |
| Warning | 提醒 | | |
| Danger | 錯誤 / 破壞性操作 | | |
| Info | 資訊提示 | | |

另外補充：

- 淺色主題的表面策略
- 深色主題的表面策略
- 前景色配對規則
- 禁用色或禁用組合
- 官方品牌色限制或使用規範

## 4. 字體排印

| 角色 | 字體 | 尺寸 | 字重 | 行高 | 用途 |
|---|---|---|---|---|---|
| Display | | | | | |
| H1 | | | | | |
| H2 | | | | | |
| Body | | | | | |
| Small | | | | | |
| Caption / Label | | | | | |

另外補充：

- 為什麼這組字體適合這群受眾
- 標題與內文如何拉開對比
- 哪些事絕對不能發生

## 5. 間距與密度

| Token | 數值 | 預期用途 |
|---|---|---|
| space-1 | | |
| space-2 | | |
| space-3 | | |
| space-4 | | |
| space-6 | | |
| space-8 | | |
| space-12 | | |

另外補充：

- 這次選擇 compact / comfortable / spacious 的理由
- 對首屏的影響

## 6. 形狀、邊框與陰影

| Token 家族 | 規則 | 意義 |
|---|---|---|
| Radius | | |
| Border | | |
| Shadow | | |

請說明：

- 何時用平面、何時用浮起表面
- 哪些元素應該偏銳利、偏柔和或中性

## 7. 動態

| Token | 數值 | 用途 |
|---|---|---|
| duration-fast | | |
| duration-base | | |
| duration-slow | | |
| ease-standard | | |
| ease-emphasis | | |

請說明：

- 動態應該傳達什麼
- 哪些動態風格禁止使用

## 8. 元件語氣樣本

為下列項目各寫一段簡短說明：

- button 語氣
- input 語氣
- card / panel 語氣
- navigation 語氣
- feedback 語氣

## 9. Do / Don't

### Do
- 
- 

### Don't
- 
- 

## 10. 實作映射

- CSS 產物：
- TypeScript 產物：
- Tailwind theme 映射：
- 需要的截圖或 board 預覽：
- 對應的 AGENTS / CLAUDE 規則：

## 11. 審查門檻

進入元件階段前，至少確認：

- 這份 token 文件已具體到可以做視覺討論
- 每個 token 家族都能回扣受眾與任務脈絡
- 系統沒有退回泛用預設值
- 文件可以直接轉成 CSS / TS，不需要再猜
