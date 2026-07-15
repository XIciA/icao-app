# 听力题库音频文本规则

> 当前执行状态：暂停使用 Whisper，不生成新的 Whisper 候选，也不依据既有 Whisper 结果修改题库。音频疑点改由人工复听确认；历史候选、快照和报告继续保留。三类题库共性规则见 `docs/rules/audio-text/audio-text-unified-rules.md`。

## 1. 文档目的

本文档用于规范听力题库英文音频原文、中文翻译、问题、选项和正确答案的全链路校准。目标是在不改变音频事实和考点的前提下，使 631 道题的文本、答案和航空格式保持准确、一致、可追溯。

本规则不是自由改写授权。当前不使用 Whisper；如以后重新启用，必须另行获得明确授权。

## 2. 适用范围

- 题库：听力（`listening`）。
- 目标字段：`audioText`、`audioTextZh`、`choices`、`correctChoiceIndex`、`referenceText`。
- 当前基线：631 题，四类数量为 245 / 114 / 95 / 177。
- 规则工具：`tools/listening-text-calibration.mjs`。
- 独立记录：`docs/workstreams/listening-text-calibration-v1/`。

以下内容保持不变：

- 卡片 ID、任务标题、分类、顺序和音频路径；
- 题库数据结构和 App 类型；
- 其他四套题库；
- 历史听力音频映射与音频校准报告。

## 3. 核心原则

1. **音频事实优先**：英文原文应准确表示实际音频，不为语法自然度自由改写。
2. **规范展示**：音频中的数字读法、民航字母和航空代码可以使用规范书面形式。
3. **数字保守**：航班号、跑道、高度、航向、频率和时间只有在音频或现有上下文能够明确确认时才能修改。
4. **人工复听确认**：涉及音频事实或语义的差异必须由人工确认，不使用 Whisper 生成新的判断候选。
5. **答案原子更新**：选项、正确索引和参考答案必须作为一个整体修改。
6. **单一来源**：先修改正式内容源，再同步 App 内嵌题库，不维护平行副本。
7. **可追溯与幂等**：保存源快照、逐题决定和差异报告；重复运行不得继续产生变化。

## 4. 英文音频原文

### 4.1 音频内容

- 保留音频实际表达、信息顺序和考点。
- 明确的漏词、错词或音频错配必须有音频证据才能修改。
- 不因现有句子不够自然就润色整句。
- 未听清内容不得由自动识别或常识猜补。
- 呼号中凡出现可能凭空插入的数字，必须有逐位人工音频证据，否则保留现有数字。
- `Question:` 继续保留在 `audioText` 中，另起一行并统一为半角冒号。

### 4.2 说话人标签

- 英文标签统一使用半角冒号和一个空格，例如 `P: `、`C: `、`CTL: `、`APP: `、`GND: `。
- `PIL:` 统一为 `P:`。
- 角色名称确有语义时可保留 `Captain:`、`Officer:`、`Mechanic:` 等名称。
- 标签只用于区分发言人，不得改变发言内容。

## 5. 航空格式

### 5.1 航司呼号

无线电呼号在四类听力题的中英文原文、选项和参考答案中使用“三字代码 + 一个半角空格 + 原数字”，例如 `QFA 432`。

| 原写法 | 统一代码 |
| --- | --- |
| Qantas | QFA |
| Singapore / Singapore Airlines | SIA |
| Air France / France | AFR |
| Speedbird / British Airways | BAW |
| United / United Airlines | UAL |
| KLM | KLM |
| Japan / Japan Air / Japan Airline(s) | JAL |
| Air Canada | ACA |
| Air China | CCA |
| China Southern / Southern | CSN |
| China Eastern | CES |
| Dragonair | HDA |
| Northwest | NWA |
| Delta | DAL |
| Lufthansa | DLH |
| Korean Air | KAL |
| Danair | DAN |
| Karun Airlines | KRU |
| Greater Bay Airlines / GBA | HGB |
| Gulf Air | GFA |
| 独立呼号 Eastern | EAL |
| Scandinavian | SAS |
| Boliviana | BOV |
| Southwest | SWA |
| Alaska | ASA |
| Iran | IRA |

- 中文航司名称同样转换为三字代码，不保留“国航101”“法航321”等形式。
- 三字代码规则只适用于呼号。新闻、事故叙述或普通说明中的航空公司名称保留自然表达，例如 `A British Airways Boeing 737`，不得机械改为 `A BAW B737`。
- 航班号数字保持原值；数字词只在明确的呼号位置转换，例如 `Air China One Zero One → CCA 101`。
- `Delta` 等歧义词按语境判断：`Delta 443` 是航司呼号，`Delta Alpha 26` 是航路点。
- 无法确定的航司别名只进入报告，不猜测转换。
- 当前人工确认 `Pacific 28` 没有可用三字代码，保留原写法；客舱广播中的 `Transworld Airlines Flight 455` 属于普通叙述，保留自然表达。

### 5.2 民航字母

- 两个及以上连续 ICAO 字母词转换为紧凑大写代码，例如 `Whiskey Zulu Foxtrot → WZF`。
- 与代码所属的数字紧凑书写，例如 `Alpha 3 → A3`、`Delta Alpha 26 → DA26`、`35 Lima → 35L`。
- 明确的单字母情报或导航语境可转换，例如 `information Echo → information E`、`at Mike → at M`。
- 普通英语词不得转换，例如酒店语境中的 `hotel` 和日期中的 `November 16` 保持原样。

### 5.3 进离场代号

- 使用“代码-原数字及后缀”格式，保留数字位数。
- 代号与 `arrival` / `departure` 之间保留一个空格。
- 示例：`HZ 01 departure → HZ-01 departure`、`Vortex 1 departure → VORTEX-1 departure`。

### 5.4 Runway 大小写

- `runway` 后直接跟跑道数字及可选 `L/R/C` 后缀时写作 `Runway 36R`。
- `right/left/center/centre` 后缀分别紧凑为 `R/L/C`。
- 其他位置使用小写 `runway`，只调整单词和后缀格式，不改变跑道数字。

## 6. 中文翻译

- `audioTextZh` 与英文原文逐句、逐数字对应。
- 中文问题另起一行并统一为 `问题：`。
- 不得把选项或正确答案混入中文原文。
- 航司呼号使用与英文相同的三字代码格式。
- `P/C/CTL` 可翻译为“飞行员/管制员”，同一题内保持一致。
- 英文发生事实性修改时，中文必须同步复核；纯格式变化可以按确定性映射同步。

## 7. 问题、选项和答案

- 每题必须有四个选项，正确索引必须在 0–3。
- 问题必须能由音频内容回答，正确选项必须与音频事实一致。
- 干扰项不得造成多个同样正确的答案。
- 修改正确答案时，`choices`、`correctChoiceIndex` 和 `referenceText` 必须原子更新。
- `referenceText` 统一由正确索引生成：`正确答案：B. <选项内容>`。
- 重复文本不自动删除；分别核对音频、问题、选项和答案后决定保留或修正。

## 8. 明确禁止

- 当前不得运行 Whisper 或使用既有 Whisper 输出覆盖 `audioText`。
- 不得根据任务标题或场景常识改写航班号及其他事实数字。
- 不得把普通英语中的 ICAO 同形词盲目转换为字母。
- 不得为了统一格式改变问题考点或选项语义。
- 不得删除重复题或音频文件，除非另有明确授权和引用审计。
- 不得覆盖历史快照、映射报告或其他题库内容。

## 9. 执行流程

```bash
node tools/listening-text-calibration.mjs audit
node tools/listening-text-calibration.mjs apply
node tools/listening-text-calibration.mjs verify
```

1. `audit` 保存快照并生成格式与答案候选。
2. 人工复核格式候选、重复题和答案变化；涉及音频事实的内容必须人工复听。
3. `apply` 只写入已批准的差异并同步内嵌题库。
4. `verify` 检查幂等、字段同步、非目标摘要、历史报告和残留规则。

## 10. 验收标准

- 题目总数保持 631，分类数量保持 245 / 114 / 95 / 177。
- 631 个稳定 ID 和音频路径保持不变，音频映射验证通过。
- 631 题均有英文原文、中文翻译、四个选项、有效索引和匹配参考答案。
- 未复核人工候选为 0；已复核且决定保持原文的记录允许存在。
- 航司全称呼号、代码数字粘连、目标民航字母词、错误进离场代号和 Runway 格式残留为 0。
- 所有数字变化均有对应的确定性呼号转换或人工音频决定。
- 正式内容源与 App 内嵌题库五个目标字段完全一致。
- 其他题库和听力非目标字段不变，历史报告校验值不变。
- 全量内容检查和项目检查通过。
