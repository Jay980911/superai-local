# Migration governance — frontend-design

本文件記錄此 skill 的高風險生命週期事件（rename / deprecate / merge / split / retire）治理規範與證據。
此類變更比一般文字修訂風險高，可能影響 routing、使用者習慣、package 路徑、wrapper metadata 與下游引用。
本檔由 SkillNow 融合流程自動產生並更新。

## Rename

Rename 需提供：舊名與新名、改名原因、舊觸發語的 routing 相容計畫、package 路徑與 registry 影響、
search / README / catalog 更新清單，以及確認無本地引用仍指向舊名（除非為刻意保留的別名）。

## Deprecate

Deprecate 需提供：停用原因、替代 skill 或 fallback workflow、生效日、預定移除日（或明示別名無限期保留）、
對使用者的通知文字、回歸風險與回滾條件。

## Merge event 2026-08-04：融入 imagegen-frontend-web、imagegen-frontend-mobile、image-to-code-skill

### 來源與目標
- Source（提供功能）：`imagegen-frontend-web、imagegen-frontend-mobile、image-to-code-skill`
- Target（保留身分）：`frontend-design`
- Merge type：單向內容融合（fusion）。target 維持名稱、description 與 routing 身分，僅吸收採納項。

### 本次採納能力
- 採納能力（已改寫整合進基礎 SKILL.md）：
  - `每區獨立產出橫幅圖像之強制規則`（conflict，衝突已裁決採用來源）— 強制每一個 section（如 landing page 有 8 區就產出 8 張橫幅圖像），嚴禁多區合併或單一 tall image，且若無 section 數會預設（如 landing page=6, full website=8），各 section 應有明確分割、單一風格統一。
  - `高階手機原生形象生成、強化多畫面連貫性與視覺引導（image-focused premium mobile UI/flow image generation）`（conflict，衝突已裁決採用來源）— 可生成高品質、具區辨度、強一致性且符合平台（iOS/Android/中性）規範的手機 UI 螢幕圖、flow image，含細膩模擬質感、色盤、品牌情境、mockup framing，以及主動設計 onboarding、auth、dashboard、chat、電商、健康、社群、productivity 各類多畫面 app，並主動維護設計語言、icon/資產/動態變化與多屏節奏，避開 AI/Template 慣用假象。此能力會主動給圖、不產生 code，並大量針對圖像與流暢性細節進行品管與增生。
  - `強制圖像先行的網站設計與實作流程`（add）— 要求在關鍵視覺前端任務（如 hero/landing/marketing/editorial/product/portfolio/high-visual 免費而不是通用管理介面）時，必須先由技能自己產生高可讀/高可分析的 section 圖像，再對該圖像進行深度設計細節剖析，最後才根據圖像作為唯一視覺依據進行前端實作。
  - `單一 section 對應單一大圖原則與懶散圖像避免規則`（add）— 要求每個網站 section（Hero、Features、Testimonial、CTA 等）都必須個別產出大圖，嚴禁用一張壓縮長條圖總攬多個 section（特別於 Codex），若有多 section 要分多張圖，不可為方便省略與裁切。若需要細節，需額外產圖，不可對舊圖做裁切或放大強行取 detail。
  - `圖像分析驅動的設計細節抽取與忠實落地實作流程`（add）— 在每張圖像產生後，必須檢查 headline/subheadline/CTA/typography/spacing/colors/buttons/component/section rhythm/detail 是否可被具體分析與抽取，必要時補額外 extraction image。實作層必須根據這些視覺證據忠實還原，嚴禁直接用記憶、靠主觀『好 taste』或降階約略代碼推進。
  - `反覆再生專屬細節圖像而不是剪裁舊圖技術（Anti-crop / Re-generation Rule）`（add）— 如設計分析或細節抽取時發現 section/元件圖像訊息不足、文字難辨或配置失真，不得裁切、放大、偷用先前的大圖片段；必須重新產生該區獨立圖像來補足設計細節和參考真實性。避免 spacing/type/layout/buttons 失真或錯置。
  - `Codex 強制 section-by-section 大圖原則（環境例外規則）`（add）— 在 Codex 等支持圖片優先/工程导向的 host，規定一個 section 就生成一個大圖，不可壓縮多 section 於同張圖，也不可只產大併圖；如 eight-section 網頁要產八張分明大圖影像，保證可分析性與工程可還原性。
  - `設計轉碼過程中的反 AI 套板與去重複化規範（Anti-AI Slop, Section Rhythm, Signature Variants）`（enhance）— 主張頁面與 section 要有明確節奏、結構、型態變化，反對重複區塊 copy-paste、一頁到底同構呈現、內嵌卡片農場或 fake complexity 名稱；具體規則避免 AI 型產生重複/平板區塊、僅包 generic card 樣式、fake brand、過度密集配色、type slop、nested boxes。
  - `implementation 階段的設計忠實還原與防設計漂移約束（Anti-drift Implementation Discipline）`（enhance）— 明確要求工程落地必須依據產生的 section image 做視覺元素（layout、type、spacing、色彩、rhythm 等）忠實對應，不可主觀優化或合理化簡化為 default/generic Web UI，不可只用通用設置降格還原，嚴格區隔於“靈感來源”或“憑 taste 補碼”。
- 搬入的支撐檔：
  - （無）

### Boundary rationale
- 融合後仍為單一主責；採納內容作為支援主責的細節，不新增第二種交付物。
- 若融合結果擁有多種不相關交付物，應改回 handoff 而非合併。

## Split

Split 需提供：原 skill、新目標 skills、各新 skill 的 routing 邊界、跨目標請求的 handoff 規則、
eval 重新分配計畫、舊觸發語的相容別名。每個新邊界都需有 should-trigger 與 should-not-trigger 案例才算完成。

## Compatibility

相容性檢視涵蓋：package 路徑、skill 名稱與別名、catalog / README / registry、host wrapper metadata、
`SKILL.md` / `references/` / `assets/` 內本地引用。本次融合未改名、未動 package 路徑，無相容性破壞。

## Migration Evidence

- `migration_type`: merge
- `from`: imagegen-frontend-web、imagegen-frontend-mobile、image-to-code-skill
- `to`: frontend-design
- `effective_date`: 2026-08-04
- `compatibility_policy`: 無破壞性變更；僅新增採納項與治理產物。
- `release_gate_result`: FAIL
- `preexisting_gaps`（融合前即存在、非本次引入的基準債）：structure、workflow_contract
- `rollback_point`（融合前快照）：`C:\Users\allan\AppData\Local\AllanYiin\SkillNow\snapshots\mpl_1c54c7712f0d`
