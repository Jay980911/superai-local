# 背景图提示词库（外部生图模型用，可选通道）

> 本文件不绑定任何生图服务。宿主 agent 有图片生成能力时使用；
> 没有则跳过，改用 `scripts/make_bg.py`（程序化/实拍）。
> **所有 prompt 强制无文字**——字由 PPT 排版层负责。

## 通用句式（务必保留）

```
…, muted earth-tone low saturation, medium format film look,
quiet luxury editorial photography,
absolutely NO text, NO letters, NO Chinese characters,
NO logos, NO people(除非主题要求), 16:9 landscape,
darker calm area in the <位置> for overlay typography later
```

构图要求：**留一块暗部/空区**给排字，不要满幅高对比。

---

## 自然实景

**dunes 沙丘**
```
Cinematic desert sand dunes photograph, warm golden brown and deep coffee shadows,
soft directional evening light from the left, fine sand grain texture,
layered dune ridges creating abstract organic curves
```

**snowmount 雪山**
```
Snow-capped mountain range photograph at dawn, cold blue-grey peaks with warm amber
sky glow, vast empty valley in foreground, minimalist composition
```

**lake 湖山**
```
Still lake reflecting misty mountains, ink-like water surface, distant peaks fading
into fog, muted sage and stone colors
```

**bamboo 竹林**
```
Dense bamboo forest photograph, vertical green-gold stalks, soft mist between them,
dappled light, quiet and meditative
```

**pine-stone 松石**
```
Twisted pine tree growing from dark granite rock, dramatic side light,
Mediterranean-Japanese garden mood, deep umber and moss tones
```

**mist 雾岚**
```
Mountain valley filled with morning mist, layered ridgelines fading into white,
extremely minimal, almost monochrome ink-wash photograph
```

---

## 古代建筑

**pavilion 亭台楼阁**
```
Traditional Chinese wooden pavilion with sweeping tiled roof at dusk, warm lantern
glow, surrounding garden in shadow, architectural photography
```

**eave 飞檐斗拱**
```
Close-up of traditional Chinese temple eaves and dougong brackets, aged timber and
grey tiles, dramatic upward angle against dark sky
```

**garden-moon 月洞门**
```
Classical Suzhou garden moon gate framed by bamboo and rockery, view through circular
opening into a quiet courtyard, soft overcast light
```

**bridge 古桥**
```
Arched stone bridge over still water in a water town, mist at dawn, reflections,
empty of people, quiet travel photography
```

**grotto 石窟**
```
Ancient Buddhist grotto interior with carved stone figures in shadow, warm sandstone
texture, single beam of light from the entrance, reverent atmosphere
```

---

## 水墨意象

**ink-mountain 水墨山水**
```
Traditional Chinese ink wash painting of layered mountains and mist, large areas of
empty rice-paper cream, minimal brush strokes, museum scroll aesthetic, no signature
no seal no text
```

**ink-bamboo 墨竹**
```
Chinese ink wash painting of bamboo stalks and leaves, sumi-e style, sparse
composition on cream paper, elegant brushwork
```

**plum 寒梅**
```
Chinese ink wash plum blossom branches, dark red blossoms on aged paper,
sparse and poetic, no calligraphy no seals
```

**lotus 残荷**
```
Ink wash painting of withered lotus pods and leaves in autumn pond, melancholy
minimalist Chinese painting style
```

**ink-cloud 泼墨云烟**
```
Abstract Chinese ink wash clouds and mist, large gradient washes of black and grey
on cream paper, splashed ink texture
```

---

## 人物意象

**scholar 高士（泛指剪影，不画具体名人）**
```
Minimal ink wash silhouette of a robed ancient Chinese scholar standing alone facing
distant mountains, back view, tiny figure in vast landscape, no facial features,
traditional painting mood
```

> 注意：只出**泛指的背影/剪影**，不指定真实历史人物姓名，不画正脸肖像。

---

## 器物纹样

**bronze 青铜**
```
Aged bronze ritual vessel surface with taotie pattern, patina texture, dark green
and umber, museum artifact photography, extreme close-up abstract composition
```

**celadon 宋瓷开片**
```
Cracked celadon glaze surface close-up, craquelure texture, pale jade green and
cream, Song dynasty ceramics aesthetic
```

**manuscript 古籍**
```
Aged thread-bound Chinese book pages, yellowed rice paper texture, blank pages with
fiber grain, soft overhead light, no readable text
```

**stele 碑帖拓片**
```
Rubbing texture from a stone stele, black ink on white with distressed edges,
abstract eroded surface, no readable characters
```

---

## 使用规则

1. 同一份 deck 内**每个主题只用一次**，页页不同
2. 相邻页明暗交替（深底页 → 浅底页）
3. 生成分辨率 ≥ 1536×864；入库前统一裁 16:9
4. 出图后检查：必须无文字/无水印；否则重roll 或降级到 make_bg.py
