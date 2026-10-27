# 設計情境協定

`frontend-design` 不是純視覺潤飾器。沒有設計上下文就直接畫畫面，通常只會產出更精緻的通用模板。

## Minimum Context

在做任何非 trivial UI 任務前，至少確認：

- `target_audience`: 誰會使用這個介面，他們在什麼情境下操作
- `jobs_to_be_done`: 他們要完成的主工作是什麼
- `brand_personality`: 介面應該給人的感受、語氣與人格
- `constraints`: 技術棧、效能、accessibility、法規、既有設計系統或裝置限制
- `memorable_hook`: 這次設計最應該被記住的一個視覺或互動特徵

如果上面缺 2 項以上，不要直接進入高保真實作。

## Gathering Order

1. 先讀目前對話、任務描述、spec、設計 brief、issue、PRD。
2. 再讀 repo 內和品牌、內容策略、使用情境直接相關的文件與既有介面。
3. 若還是不足，就提出最少量、最高資訊密度的問題。
4. 若時間或上下文限制無法補問，明示假設與風險，再決定是否繼續。

## What Not To Infer

不要只從這些訊號直接推論品牌語氣或受眾：

- component 名稱
- 資料表欄位
- API schema
- CSS class 命名
- 單一舊畫面上的偶然配色

這些只能幫你理解現況，不能單獨構成設計人格。

## Small Fix Exception

若任務只是既有介面的局部修正：

- 先找出現有 tokens、spacing、type、interaction 規則
- 以延續現有產品語言為預設
- 除非使用者明說要重做方向，否則不要自行引入全新品牌調性

## Context Brief Template

在開始做設計前，可先整理成這個簡表：

```text
Audience:
Primary job:
Brand / tone:
Constraints:
Primary task on this screen:
Memorable hook:
Open assumptions:
```

## Stop Conditions

遇到以下狀況，先停下來補 context 或縮 scope：

- 使用者要求「做得更有設計感」但沒有產品定位或受眾線索
- 既有 UI 風格互相矛盾，無法判定要延續哪一套
- 任務同時要求「延續現有設計」與「徹底換風格」
- 技術棧或 design system 限制會直接影響可行的視覺方向

