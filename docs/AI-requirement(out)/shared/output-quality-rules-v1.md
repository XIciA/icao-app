# Output Quality Rules v1

本文档是 AI 输出质检规则的唯一来源。它不替代各能力 prompt，而是供能力文档、eval 样本和后续 schema 校验引用。

## 1. 规则字段

- 字段: ID
  说明: 稳定规则编号

- 字段: Applies To
  说明: 适用能力

- 字段: Rule Type
  说明: `schema` / `boundary` / `style` / `safety` / `review`

- 字段: Pass Condition
  说明: 通过条件

- 字段: Fail Example
  说明: 失败示例

- 字段: Severity
  说明: `fail` / `warn` / `review`

- 字段: Status
  说明: `sample` / `candidate` / `ready` / `implemented`

## 2. 共享输出规则

- ID: OQ-001
  Applies To: word-lookup, grammar-review, polish
  Rule Type: schema
  Pass Condition: 返回严格 JSON object，不带 markdown 或额外说明
  Fail Example: markdown code fence
  Severity: fail
  Status: ready

- ID: OQ-002
  Applies To: word-lookup, grammar-review, polish
  Rule Type: schema
  Pass Condition: 只返回该能力声明的字段
  Fail Example: 额外返回 `score`, `level`, `pronunciation`
  Severity: fail
  Status: ready

- ID: OQ-003
  Applies To: all
  Rule Type: boundary
  Pass Condition: 不输出 ICAO 分数、等级、发音、语调或流利度评价
  Fail Example: `ICAO Level 4`
  Severity: fail
  Status: ready

- ID: OQ-004
  Applies To: all
  Rule Type: boundary
  Pass Condition: 不生成标准答案，不替用户补完整答题内容
  Fail Example: 把短句扩成完整 OPI 范文
  Severity: fail
  Status: ready

- ID: OQ-005
  Applies To: all
  Rule Type: boundary
  Pass Condition: 不添加用户没有表达的关键事实
  Fail Example: 自动补充 thunderstorm、passenger、fuel 等信息
  Severity: fail
  Status: ready

- ID: OQ-006
  Applies To: all
  Rule Type: style
  Pass Condition: 输出简洁，服务当前能力，不做课堂长讲解
  Fail Example: 多段教学说明
  Severity: warn
  Status: ready

- ID: OQ-007
  Applies To: all
  Rule Type: boundary
  Pass Condition: 保留用户原意，不改变事件、原因、动作主体
  Fail Example: `request deviation` 改成 `declare emergency`
  Severity: fail
  Status: ready

- ID: OQ-008
  Applies To: word-lookup, grammar-review
  Rule Type: style
  Pass Condition: 中文解释字段使用简洁中文
  Fail Example: 大段英文解释
  Severity: warn
  Status: ready

## 3. 能力专用规则

- ID: WL-OQ-001
  Applies To: word-lookup
  Rule Type: schema
  Pass Condition: 只返回 `definition` 和 `contextExplanationZh`
  Fail Example: 返回 `examples`、`synonyms`、`score`
  Severity: fail
  Status: ready

- ID: WL-OQ-002
  Applies To: word-lookup
  Rule Type: boundary
  Pass Condition: `definition` 包含词性、通用释义、民航释义
  Fail Example: 只给普通词典释义
  Severity: fail
  Status: ready

- ID: WL-OQ-003
  Applies To: word-lookup
  Rule Type: boundary
  Pass Condition: 查询短语时优先解释短语整体含义
  Fail Example: 逐词硬拆 `go around`
  Severity: fail
  Status: ready

- ID: WL-OQ-004
  Applies To: word-lookup
  Rule Type: style
  Pass Condition: 不讲词源、不列大量无关义项、不输出例句
  Fail Example: 长篇词源和多个无关例句
  Severity: warn
  Status: ready

- ID: GR-OQ-001
  Applies To: grammar-review
  Rule Type: schema
  Pass Condition: 只返回 `overallFeedbackZh`, `issues`, `correctedText`
  Fail Example: 返回 `polishedText` 或 `score`
  Severity: fail
  Status: ready

- ID: GR-OQ-002
  Applies To: grammar-review
  Rule Type: boundary
  Pass Condition: 只指出明确通用硬语法错误
  Fail Example: 把 `tell ATC` 直接润色为 `advise ATC`
  Severity: fail
  Status: ready

- ID: GR-OQ-003
  Applies To: grammar-review
  Rule Type: boundary
  Pass Condition: `correctedText` 只保守纠错，不扩写
  Fail Example: 补成完整标准答案
  Severity: fail
  Status: ready

- ID: GR-OQ-004
  Applies To: grammar-review
  Rule Type: boundary
  Pass Condition: 无明显硬语法错误时 `issues` 为空数组，`correctedText` 尽量保持原文
  Fail Example: 强行挑风格问题
  Severity: fail
  Status: ready

- ID: PO-OQ-001
  Applies To: polish
  Rule Type: schema
  Pass Condition: 只返回 `polishedText`
  Fail Example: 返回错误列表或解释原因
  Severity: fail
  Status: ready

- ID: PO-OQ-002
  Applies To: polish
  Rule Type: boundary
  Pass Condition: 可修正语法，但不解释错误
  Fail Example: 输出 grammar issues
  Severity: fail
  Status: ready

- ID: PO-OQ-003
  Applies To: polish
  Rule Type: boundary
  Pass Condition: 润色后长度接近原文，不大幅扩写
  Fail Example: 一句话扩成一整段
  Severity: fail
  Status: ready

- ID: PO-OQ-004
  Applies To: polish
  Rule Type: style
  Pass Condition: 使用自然、简洁、贴近民航口语的表达
  Fail Example: 写成书面作文或堆砌难词
  Severity: warn
  Status: ready

- ID: TR-OQ-001
  Applies To: transcribe
  Rule Type: boundary
  Pass Condition: 忠实保留用户原话和语法错误
  Fail Example: `I has` 改成 `I have`
  Severity: fail
  Status: ready

- ID: TR-OQ-002
  Applies To: transcribe
  Rule Type: boundary
  Pass Condition: 只做安全 normalization，不做润色
  Fail Example: `I meet thunderstorm` 改成 `I encountered a thunderstorm`
  Severity: fail
  Status: ready

- ID: TR-OQ-003
  Applies To: transcribe
  Rule Type: boundary
  Pass Condition: 不补全用户没说的话
  Fail Example: `request deviation` 补成 `request deviation due to thunderstorm`
  Severity: fail
  Status: ready

- ID: TR-OQ-004
  Applies To: transcribe
  Rule Type: style
  Pass Condition: 缩写和格式只在明确时规范化
  Fail Example: 把不明确数字强行转写
  Severity: review
  Status: ready

## 4. 质检结果口径

- 结果: `pass`
  含义: 输出符合规则
  后续动作: 可作为通过样本

- 结果: `warn`
  含义: 有轻微风格问题，但不一定失败
  后续动作: 人工观察，必要时补 eval

- 结果: `review`
  含义: 规则依赖上下文，需人工判断
  后续动作: 暂不自动失败

- 结果: `fail`
  含义: 明确越界或字段不合格
  后续动作: 必须修正 prompt / schema / few-shot

## 5. 管理方式

- 场景: 新增规则
  做法: 先放入本文件，状态为 `candidate` 或 `ready`

- 场景: 能力文档引用
  做法: 在 capability 文档中引用规则 ID，不重复复制全文

- 场景: eval 样本引用
  做法: 样本表可增加 `Related Rules` 字段

- 场景: 后续工程化
  做法: 只把 `ready` 规则写入 prompt / schema / examples

- 场景: 规则废弃
  做法: 保留 ID，状态改为 `deprecated`，说明原因
