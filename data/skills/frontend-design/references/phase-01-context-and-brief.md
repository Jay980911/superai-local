# 情境與品牌

這份文件對應 Phase 1，只處理「先釐清這是什麼系統、給誰用、要查哪些品牌依據」，不要在這一步先做 layout。

## 必答問題

- 這是什麼功能的系統，不要只寫成 dashboard / 平台 / 管理後台。
- 主要受眾是誰，他們在什麼工作情境下打開這個介面。
- 使用者一進來最先要注意什麼。
- 系統靠什麼機制引導下一步，例如 tabs、step flow、master-detail、inline reveal、sticky action bar。
- 這個畫面的唯一主任務是什麼。
- 這個畫面應該先讓使用者感到什麼，例如安心、掌控、節奏感、可信度、速度感。
- 這個畫面不應該讓使用者感到什麼，例如被說教、被推銷、被儀表板轟炸、被系統責備。
- 使用者可見文案的 voice register 是什麼；哪些話只能留在規格與 review，不可出現在 UI。
- 若涉及企業、產品或第三方品牌：官方品牌色與品牌使用規範的來源是哪裡。

## 最小 context brief

```text
Audience:
System purpose:
Primary job:
Primary task on this screen:
Entry focus:
Navigation mechanism:
Next-step handoff:
Brand / tone:
Emotional job:
Avoided emotional tone:
Voice register:
Official brand source:
Constraints:
Memorable hook:
Open assumptions:
```

## 品牌規則

- 不要只從舊畫面、logo 截圖或記憶猜品牌色。
- 優先查官方 brand assets、brand guidelines、press kit、design resources。
- 找不到官方來源時，要明講「未取得官方品牌來源」，並改採 neutral token strategy，不要假裝命中品牌色。
- 若任務只是既有介面的局部小修，先延續現有產品語言；除非使用者要求重做方向，否則不要擅自重做人設。
- 若畫面承載高信任、敏感資訊或高決策壓力，先寫明 trust posture 與情緒目標，再決定字體、配色、摘要與 CTA。
- 內部規則、方法論、review 結論與 prompt 指示只屬於製作過程；若一句話不適合直接放給最終使用者看，就不能進 UI copy。

## Stop conditions

遇到以下情況先停下來補資訊或縮 scope：

- 只收到「modern / premium / clean / 不要 AI 味」這類抽象要求。
- 同時要求「延續現有設計」與「徹底換風格」。
- 技術棧、既有 design system 或 accessibility 條件會直接影響視覺方向。
- 品牌任務需要官方色，但目前沒有可信來源。
- 無法分清楚哪些話是內部規格語言，哪些話是產品文案。

