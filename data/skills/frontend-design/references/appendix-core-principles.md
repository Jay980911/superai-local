# 核心原則

## 1. 先情境，後風格

- 在做高風險視覺決策前，先確認受眾、jobs-to-be-done、語氣、限制與 memorable hook。
- 不要只從程式碼推導品牌人格；程式碼能告訴你結構，不能取代產品性格。
- 如果任務只是小修，預設沿用既有設計語言；除非使用者明講要換方向，否則不要擅自重做。
- 要先用白話確認產品框架：這個系統做什麼、誰會進來、第一眼該看到什麼、介面如何帶往下一步。
- 從 user story 與 state transition 出發，而不是從功能清單出發；畫面要承接互動，不是把需求平鋪出來。
- 若任務涉及真實公司或產品品牌，先查官方 brand assets 或 brand guidelines，再決定品牌色。

## 2. 系統性與創造力並重

### 系統性基底
- 先做 design tokens，再做 UI 元件。
- 顏色、間距、陰影、圓角不能隨意硬編。
- Typography、spacing、radius、elevation 必須使用一致尺度。
- 完整覆蓋 default、hover、active、focus、disabled、loading、empty、error。
- 把 accessibility 當作設計約束，不是最後補件。

### 創意執行
- 避免泛用 AI-slop 審美，例如默認 Inter/Roboto、白底紫漸層、制式卡片格線。
- 選一條清楚的視覺方向，例如 brutalist、retro-futuristic、luxury、playful、editorial。
- 讓 typography、color、layout、motion、copy 都是為這個任務量身打造，而不是可互換模板。
- 設定一個 memorable hook，讓介面有觀點，而不是只剩通用 polish。

## 3. Tokens First 方法

固定依這個順序工作：

```text
Design Tokens -> Component Styles -> Page Layouts -> Interactive States
```

不要跳過 token 定義。所有視覺屬性都應該能回溯到 token system。

## 4. 技術棧保持彈性

### 預設技術棧
- Framework: React + TypeScript
- Styling: Tailwind CSS
- Components: shadcn/ui
- Theme: CSS custom properties，並支援 light/dark mode

### 可接受的替代方案
- Frameworks: Vue、Svelte、Angular、vanilla HTML/CSS
- Styling: CSS Modules、SCSS、Styled Components、Emotion
- Libraries: MUI、Ant Design、Chakra UI、Headless UI

選擇與 repo 現況或使用者限制最相符的技術棧，不要為了理想型而強推新棧。

## 5. Tailwind CSS 實務原則

正式交付時不要用 Tailwind CDN。

### 必要的 build-time 整合

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 為什麼要 build-time
- 才能 tree-shaking。
- 才能完整自訂 token。
- 才有 IDE autocomplete 與較安全的維護性。
- 才能和 Vite、webpack、Next.js 等 bundler 正確整合。

### CDN 只適用於
- 快速原型
- 內部 demo
- 用完即丟的實驗

## 6. 多步驟 UX 必須外顯化流程

若任務包含 onboarding、checkout、signup、settings wizard、跨頁 dashboard 任務，或任何有分支 / 狀態切換的流程：

- 在 polish UI 前先產出 `journey map`、`user flow` 或 `wireflow`。
- 固定一個 actor、一個 scenario、一個 goal。
- 以時間順序排流程，不要交付一堆彼此斷裂的畫面。
- 每一步都記錄 user action、system status、friction / opportunity。
- 在 UI 中明示 current step、completed steps 與 next step。

只有高保真畫面，無法解釋流程本身。

## 7. Gestalt 原則是交付約束，不是理論裝飾

把它們當成實作規則：

- Proximity / Common Region：相關控制項必須共享間距節奏與容器邊界。
- Similarity：同角色元件共用 token、尺寸與互動模式。
- Figure-Ground：主行動、當前狀態、關鍵訊息必須與背景清楚分離。
- Continuation：版面要形成自然的閱讀路徑，把目光帶向下一步或 CTA。
- Closure / Common Fate：需要靠真實視覺檢查；若自動化無法證明，就標成 manual review，不要假裝已驗證。

## 8. 任務型工作台必須保住主任務

對 dashboard、review tool、document viewer、editor、compare screen，或任何以中央主表面完成操作的 workspace：

- 在畫版前先定義唯一 `primary task`。
- 讓主任務佔據最大、最中心、最先被掃到的區域。
- metadata、環境資訊、說明文與次要控制項退到 sidebar、drawer、tab 或 collapse layer。
- 不要把工作台做成一進來先看 summary cards 的堆疊式 landing page。
- 不要拿 cards 代替流程設計；若使用者看不出先做什麼、下一步是什麼，就算需求全擺上去也算失敗。
- 若既有結構已指定 `top action bar + left navigation + central viewer`，就要尊重這份契約。
- 主舞台容器如果無法穩定顯示有價值內容，應該重設階層，而不是加裝飾。
- Empty state 必須說清楚缺什麼、為什麼缺、下一步該做什麼。
- 行動版要優先保護主任務，不要把桌面版每個 panel 等比縮小。
- 儘量讓當前任務能在可視範圍內完成；現在不需要的內容應延後揭露。
- 功能表面要支配 viewport；重複摘要、填充文案或裝飾區不能比真實工作區更大。
- Responsive 是硬性條件；如果主功能掉到常見 viewport 之外，就不算完成。

## 9. 可重用 UI 必須附指南產物

若任務產出可重用元件、design system 或共享模式，交付時要附 guideline document。

最低結構：
- Usage
- Layout
- Anatomy
- States & Spec
- Interaction
- Content / Asset

若工程端仍然要靠猜，這份 guideline 就不完整。

## 10. 不只驗原則，也要驗反模式

不要只寫原則，還要主動掃反模式。

至少檢查：
- 泛用字體堆疊讓畫面退化成 AI-slop
- 缺乏設計情境，逼得視覺方向只能亂猜
- 沒有層級理由卻使用 gradient text 或 glassmorphism
- 模糊 CTA 文案，例如 `OK`、`Submit`、`Yes`、`No`
- 模糊錯誤訊息，例如 `Something went wrong`、`Invalid input`
- 紫藍霓虹、card farm、centered-everything 當作預設捷徑

若某個反模式是刻意選用，請把理由寫出來，不要默默合理化。
