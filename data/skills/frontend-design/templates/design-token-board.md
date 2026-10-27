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
- 產品性格：
- 任務壓力：
- 無障礙 / 平台限制：
- 官方品牌來源：

## 2. Token 方向

- 主題名稱：
- 核心情緒：
- Dominant direction：
- Memorable hook：
- 為什麼這個方向適合這群受眾：
- 這個方向必須避免什麼：

## 3. 色彩系統

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

- button 語氣：
- input 語氣：
- card / panel 語氣：
- navigation 語氣：
- feedback 語氣：

## 9. 響應式與版面約束

- 首屏必須先看見什麼
- 哪些區塊在 mobile 要退場、收合或改成 drawer / tab
- 哪些 layout 應優先使用 fluid layout 或 container queries
- 哪些區塊不能壓過主功能區

## 10. Do / Don't

### Do

- 
- 

### Don't

- 
- 

## 11. 實作映射

- CSS 產物：
- TypeScript 產物：
- Tailwind theme 映射：
- 對應的 AGENTS / CLAUDE 規則：

## 12. 審查門檻

- 這份文件已具體到可做視覺審查
- 每個 token 家族都能回扣受眾與任務脈絡
- 主功能區與首屏優先序已被明文化
- responsive 要點與禁止反模式已被寫入
