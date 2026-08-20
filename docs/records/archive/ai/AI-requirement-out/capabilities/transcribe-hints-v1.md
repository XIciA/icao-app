# 历史归档：transcribe-hints:v1

本文档是 `transcribe` 能力的 ASR hints 专属内容入口。它不直接等同于运行时代码，也不是普通 LLM prompt；热词、短语、数字 / 字母读法和负向样本正文分别维护在 `../domain/` 和 `../evals/`。

## 1. 基本信息

- 字段: 资产 ID
  内容: `transcribe-hints:v1`

- 字段: 能力
  内容: `transcribe`

- 字段: 版本
  内容: `v1`

- 字段: 输出结构
  内容: `TranscribeResult`

- 字段: 专属规则
  内容: ASR scene context 和 normalization

- 字段: 共性规则
  内容: `OQ-003` - `OQ-007`, `TR-OQ-001` - `TR-OQ-004`

- 字段: 当前状态
  内容: 内容资产先行，技术接入单独执行

## 2. 能力目标

`transcribe-hints:v1` 的目标是提高民航英语 ASR 转写可用性：

1. 让 ASR 更容易识别 ICAO / 民航高频词。
2. 让 ASR 更容易识别数字 / 字母读法，例如 `flight level two niner zero`、`taxiway Alfa`。
3. 让转写结果的基础格式更稳定，例如 `qnh` 统一为 `QNH`。
4. 保留用户真实说法，不做语法纠错、润色或标准答案生成。

一句话边界：

> 帮助 ASR 听对和写稳，但不替用户说得更好。

## 3. 内容分层

- 层级: 1
  名称: Scene Context
  发生阶段: ASR 前
  存放位置: 本文档

- 层级: 2
  名称: Hotwords
  发生阶段: ASR 前
  存放位置: `../domain/aviation-hotwords.md`

- 层级: 3
  名称: Phrase Hints
  发生阶段: ASR 前
  存放位置: `../domain/aviation-phrasebook.md`

- 层级: 4
  名称: Number / Letter Reading References
  发生阶段: ASR 前 / ASR 后
  存放位置: `../domain/aviation-number-readings.md`

- 层级: 5
  名称: Abbreviation Rules
  发生阶段: ASR 后
  存放位置: `../domain/aviation-hotwords.md`

- 层级: 6
  名称: Normalization Rules
  发生阶段: ASR 后
  存放位置: 本文档

- 层级: 7
  名称: Negative Rules
  发生阶段: ASR 后
  存放位置: `../shared/output-quality-rules-v1.md` / `../domain/aviation-common-errors.md`

- 层级: 8
  名称: Review Samples
  发生阶段: 评测
  存放位置: `../evals/transcribe-samples.md`

## 4. Scene Context

这些内容适合作为 ASR 场景提示，但不是普通 LLM prompt。

- ID: SC-001
  场景提示: The audio is ICAO and civil aviation English.
  用途: 提醒 ASR 当前领域
  状态: ready

- ID: SC-002
  场景提示: The speaker may mention runway, heading, altitude, flight level, QNH, QFE, squawk, ATC, weather, and emergency procedures.
  用途: 提醒高频主题
  状态: ready

- ID: SC-003
  场景提示: Prefer faithful transcription over grammar correction.
  用途: 保留用户原话
  状态: ready

- ID: SC-004
  场景提示: Keep learner grammar errors intact for later grammar review.
  用途: 避免 ASR 自动纠错
  状态: ready

- ID: SC-005
  场景提示: Do not add words the speaker did not say.
  用途: 避免补全内容
  状态: ready

## 5. Normalization Rules

Normalization 是 ASR 输出后的轻量格式整理。它不是纠错、不是润色、不是标准答案生成。

### 5.1 安全等级

- Level: safe
  Meaning: 几乎不改变语义，只整理格式
  Examples: 空格清理、`qnh` -> `QNH`
  Default: 可以启用

- Level: clear-context
  Meaning: 需要上下文明确才转换
  Examples: `flight level two niner zero` -> `FL290`
  Default: 谨慎启用

- Level: hint-only
  Meaning: 先作为 ASR hint，不自动改输出
  Examples: `altitude three thousand feet` -> `altitude 3000 feet`
  Default: 不启用

- Level: forbidden
  Meaning: 超出 transcribe 边界
  Examples: 语法纠错、润色、补全
  Default: 禁止

### 5.2 允许规则

- ID: NM-001
  Input Pattern: multiple spaces
  Output Pattern: single space
  Level: safe
  Notes: 清理多余空格

- ID: NM-002
  Input Pattern: leading / trailing spaces
  Output Pattern: trimmed text
  Level: safe
  Notes: 清理首尾空格

- ID: NM-003
  Input Pattern: atc
  Output Pattern: ATC
  Level: safe
  Notes: 仅 whole word

- ID: NM-004
  Input Pattern: qnh
  Output Pattern: QNH
  Level: safe
  Notes: 仅 whole word

- ID: NM-005
  Input Pattern: qfe
  Output Pattern: QFE
  Level: safe
  Notes: 仅 whole word

- ID: NM-006
  Input Pattern: fl 290
  Output Pattern: FL290
  Level: clear-context
  Notes: 后面是三位数字时可转

- ID: NM-007
  Input Pattern: FL 290
  Output Pattern: FL290
  Level: clear-context
  Notes: 去掉 FL 和数字之间空格

- ID: NM-008
  Input Pattern: flight level two niner zero
  Output Pattern: FL290
  Level: clear-context
  Notes: 读法明确时转换

- ID: NM-009
  Input Pattern: runway two seven
  Output Pattern: runway 27
  Level: clear-context
  Notes: 跑道号明确时转换

- ID: NM-010
  Input Pattern: runway two seven left
  Output Pattern: runway 27L
  Level: clear-context
  Notes: 左 / 右 / 中后缀可后续扩展

- ID: NM-011
  Input Pattern: heading one eight zero
  Output Pattern: heading 180
  Level: clear-context
  Notes: 三位航向明确时转换

- ID: NM-012
  Input Pattern: qnh one zero one three
  Output Pattern: QNH 1013
  Level: clear-context
  Notes: 四位气压明确时转换

- ID: NM-013
  Input Pattern: qfe one zero one three
  Output Pattern: QFE 1013
  Level: clear-context
  Notes: 四位气压明确时转换

- ID: NM-014
  Input Pattern: squawk seven five zero zero
  Output Pattern: squawk 7500
  Level: clear-context
  Notes: 四位编码明确时转换

- ID: NM-015
  Input Pattern: pan pan
  Output Pattern: pan-pan
  Level: safe
  Notes: 紧急呼叫格式

- ID: NM-016
  Input Pattern: may day
  Output Pattern: mayday
  Level: safe
  Notes: 遇险呼叫格式

## 6. Boundary References

- 内容: 输出质检规则
  位置: `../shared/output-quality-rules-v1.md`
  说明: `TR-OQ-001` - `TR-OQ-004` 定义 transcribe 边界

- 内容: 常见错误边界
  位置: `../domain/aviation-common-errors.md`
  说明: `TN-*` 样本记录 transcribe 不能改写的学习者原话

- 内容: 评测样本
  位置: `../evals/transcribe-samples.md`
  说明: `TR-N-*` 样本用于检查越界纠错、润色和补全

## 7. 技术映射

- 内容: Scene Context
  建议代码文件: `features/ai/capabilities/transcribe/hints.ts`
  说明: 构造 ASR hints

- 内容: Hotwords
  建议代码文件: `features/ai/domain/aviation/hotwords.ts`
  说明: 热词表

- 内容: Phrase Hints
  建议代码文件: `features/ai/domain/aviation/phrasebook.ts` 或 `hotwords.ts`
  说明: 高频短语

- 内容: Number / Letter Reading References
  建议代码文件: `features/ai/domain/aviation/numberWords.ts` 或 `features/ai/domain/aviation/spellingAlphabet.ts`
  说明: 数字和字母读法

- 内容: Abbreviation Rules
  建议代码文件: `features/ai/domain/aviation/abbreviations.ts`
  说明: 缩写和大小写

- 内容: Normalization Rules
  建议代码文件: `features/ai/domain/aviation/transcriptNormalization.ts`
  说明: 输出后格式整理

- 内容: Review Samples
  建议代码文件: `features/ai/capabilities/transcribe/examples.ts` 或测试文件
  说明: 后续评测样例

## 8. 扩展记录模板

当发现新的 ASR 转写问题时，先判断属于 hotword、phrase hint、number reading、abbreviation、normalization 还是 negative boundary，再写入对应文件。

- Field: rawAudioContext
  Example: OPI weather answer

- Field: possibleTranscript
  Example: `q and h one zero one three`

- Field: desiredHint
  Example: `QNH one zero one three`

- Field: desiredNormalization
  Example: `QNH 1013`

- Field: risk
  Example: `collapse-if-clear`

- Field: status
  Example: `candidate`
