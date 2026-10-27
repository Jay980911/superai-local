---
name: pptx-gen
description: 生成或编辑 PowerPoint 演示文稿。当用户要"做PPT/做幻灯片/生成演示文稿"或"改某页PPT的文字/内容"时使用。用 python-pptx 生成标准 .pptx（PowerPoint/WPS/Keynote 原生可打开），支持编辑已有文件。
---

# pptx-gen — PPT 生成与编辑技能

用 superai 管理的隔离 Python（python-pptx）生成标准 `.pptx`，或打开已有 `.pptx` 修改后存回。生成的 pptx 在右栏会自动转 HTML 预览。

## 何时用本技能
- 用户要"做个PPT""生成幻灯片""做演示文稿" → **生成模式**
- 用户要"改第3页的标题""把xxx换成yyy""加一页""删掉第2页" → **编辑模式**
- 主题/风格用户没指定时，你自己定，不要反问。

## 生成模式流程
1. 规划内容：确定主题、风格（深色/浅色 + 主色）、页数与每页要点。
2. 写一个 `spec.json` 到工作目录（用 write 工具），结构如下：
```json
{
  "output": "夜航计划.pptx",
  "theme": {
    "bg": "0F1B2D", "titleColor": "FFFFFF", "bodyColor": "C9D6E3",
    "accent": "4F9CFE", "titleFont": "Microsoft YaHei", "bodyFont": "Microsoft YaHei",
    "titleSize": 32, "bodySize": 20
  },
  "slides": [
    { "layout": "title", "title": "夜航计划", "subtitle": "城市灵感与个人成长" },
    { "layout": "content", "title": "注意力经济", "bullets": ["要点一", "要点二", "要点三"], "notes": "讲稿…" },
    { "layout": "section", "title": "中篇：成长路径" },
    { "layout": "image", "title": "示意图", "image": "assets/diagram.png" }
  ]
}
```
- `theme` 全可选，不写用默认深蓝主题。色值 6 位十六进制无 `#`。
- `layout`：`title`（封面，title+subtitle）、`content`（标题+要点）、`section`（篇章分隔）、`image`（标题+图）、`blank`。
- `bullets` 每条控制在 120 字内（超长会被溢出检查警告，建议拆分要点）。
- `image` 可相对 spec.json 所在目录。

3. 用 pwsh 运行生成命令（python 路径见**全局平台指令**里的"PPT 生成"段）：
   `"<python>" "<gen_pptx.py>" --spec spec.json --out 夜航计划.pptx`
4. 生成成功后，右栏会自动转预览。回复用户"已生成 PPT：xxx.pptx，共 N 页，已在右栏预览"，不要给 localhost 链接。
5. 用户要可编辑源文件时，告诉它 .pptx 在工作目录；要再改，用编辑模式。

## 编辑模式流程
1. 写 `edits.json` 到工作目录：
```json
{
  "replaceText": [ { "slide": 0, "find": "旧词", "replace": "新词" } ],
  "setTitle": [ { "slide": 1, "title": "新标题" } ],
  "setBody": [ { "slide": 1, "bullets": ["新要点A", "新要点B"] } ],
  "addSlides": [ { "layout": "content", "title": "新增页", "bullets": ["x"] } ],
  "deleteSlides": [3]
}
```
- `slide` 是 0 起页码。`deleteSlides` 按原索引删，删除/追加互不影响（先删后增）。
- `addSlides` 每项结构同生成 spec 里的单页。
2. 运行（**--in 是原文件，--out 不写则存回原文件**）：
   `"<python>" "<edit_pptx.py>" --in 夜航计划.pptx --edits edits.json`
   要另存：加 `--out 新文件.pptx`。
3. 回复改了哪些页，右栏会刷新预览。

## 注意
- 路径与命令模板由全局平台指令注入（含隔离 Python 绝对路径），不要自己猜 python 在哪。
- 一次只做一个文件；批量分别写 spec/edits。
- 复杂图（SmartArt/图表/动画）不支持，用要点+图片替代。
- 图片放工作目录下，spec 里给相对路径。
