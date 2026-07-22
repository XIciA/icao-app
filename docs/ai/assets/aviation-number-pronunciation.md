# 民航特殊数字读音

本资产用于录音转写、航空文本规范化和必要的模型提示。读音采用 ICAO/FAA 航空无线电拼读形式。

## 基础数字

| 字符 | 标准词 | 近似读音 | 常见识别文本 |
| --- | --- | --- | --- |
| `0` | zero | ZE-RO | zero, oh |
| `1` | one | WUN | one |
| `2` | two | TOO | two, to, too |
| `3` | three | TREE | three, tree |
| `4` | four | FOW-ER | four, fower |
| `5` | five | FIFE | five, fife |
| `6` | six | SIX | six |
| `7` | seven | SEV-EN | seven |
| `8` | eight | AIT | eight, ait |
| `9` | nine | NIN-ER | nine, niner |

“常见识别文本”只用于候选匹配。`oh`、`to`、`too` 等普通英语词不能脱离航空数字上下文直接替换。

## 组合规则

| 场景 | 规则 | 示例 |
| --- | --- | --- |
| 航班号、呼号数字 | 通常逐位读出 | `CCA 238` → `Air China two three eight` |
| 高度层 | `flight level` 后逐位读出 | `FL180` → `flight level one eight zero` |
| 航向 | `heading` 后逐位读出，保留前导零 | `heading 080` → `heading zero eight zero` |
| 跑道号 | 两位数字逐位读出，必要时追加 left/right/center | `runway 27L` → `runway two seven left` |
| 应答机编码 | `squawk` 后四位逐位读出 | `squawk 7500` → `squawk seven five zero zero` |
| 无线电频率 | 小数点前后按数字读出 | `118.1` → `one one eight decimal one` |
| 整百、整千高度等 | 数字后使用 `hundred` 或 `thousand` | `3000 feet` → `three thousand feet` |
| 整千加整百 | 先读 thousand，再读 hundred | `4500 feet` → `four thousand five hundred feet` |

## 开发约束

- 先识别场景，再进行数字合并；不能先全局替换数字词。
- 转写后处理只能改变格式，不能改变数值。
- 前导零在航向、频率、应答机编码等需要固定位数的场景中不得丢失。
- 无法确认数字边界或场景时保留原始转写。
- 新增规则时必须同时增加正例和“不得转换”的反例。

## 参考

- [ICAO Annex 10, Volume II](https://www.icao.int/Meetings/anconf12/Document%20Archive/AN10_V2_cons%5B1%5D.pdf)
- [FAA Order JO 7110.65, ICAO Phonetics](https://www.faa.gov/air_traffic/publications/atpubs/fs_html/chap2_section_3.html)
