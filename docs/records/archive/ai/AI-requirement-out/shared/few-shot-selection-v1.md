# 历史归档：Few-shot Selection v1

本文档是 few-shot 筛选规则的唯一来源。`evals/` 是评测样本库，不自动等于 few-shot；few-shot 是少量进入 prompt examples 的高价值样本。

## 1. 基本原则

- 原则: 少而稳
  说明: 每个能力先选 2-4 条，宁少勿杂

- 原则: 边界明确
  说明: 样本应展示能力应该做什么、不能做什么

- 原则: 输入短
  说明: 过长样本容易诱导模型生成标准答案或扩写

- 原则: 输出稳定
  说明: 不依赖复杂背景也能得到一致结果

- 原则: 风险可控
  说明: 不诱导评分、补全、润色越界或转写纠错

## 2. 筛选标准

- ID: FS-001
  标准: 单一行为点
  通过条件: 一条样本只展示一个主要能力边界
  不通过示例: 同时要求查词、纠错、润色

- ID: FS-002
  标准: 输入短且典型
  通过条件: 一句话或一个短语即可说明问题
  不通过示例: 长篇 OPI 回答

- ID: FS-003
  标准: 输出格式稳定
  通过条件: 能稳定映射到能力的 JSON 字段
  不通过示例: 需要自由发挥多段说明

- ID: FS-004
  标准: 不补新信息
  通过条件: 期望输出只基于用户输入
  不通过示例: 自动补充天气、航路、处置流程

- ID: FS-005
  标准: 不诱导评分
  通过条件: 样本不包含分数、等级、发音评价
  不通过示例: 输出 ICAO level 或 fluency score

- ID: FS-006
  标准: 能改善模型行为
  通过条件: 样本能明显压住一个常见错误
  不通过示例: 只是普通正确样例，没有边界价值

- ID: FS-007
  标准: 可长期复用
  通过条件: 不依赖某道题的私有背景
  不通过示例: 需要题库上下文才能判断

## 3. 不适合进入 few-shot 的样本

- 类型: 长篇标准答案
  原因: 容易诱导 `polish` 大幅扩写
  处理方式: 留在 evals 做负向样本

- 类型: 多问题混合样本
  原因: 难判断模型学到哪个行为
  处理方式: 拆成多条短样本

- 类型: 高争议航空搭配
  原因: v1 规则未确认
  处理方式: 标为 `candidate` 或 `sample`

- 类型: transcribe 语法纠错样本
  原因: transcribe 不做 LLM few-shot 纠错
  处理方式: 放在 negative evals

- 类型: 需要外部专业判断的样本
  原因: 输出不稳定
  处理方式: 先进入 domain 待确认

## 4. 建议字段

在 `evals/` 样本表中使用这些字段：

- 字段: Few-shot Candidate
  说明: `yes` / `no` / `maybe`

- 字段: Few-shot Role
  说明: `positive` / `negative` / `boundary`

- 字段: Reason
  说明: 为什么适合或不适合

- 字段: Risk
  说明: `low` / `medium` / `high`

- 字段: Target Capability
  说明: 适用能力

- 字段: Related Rules
  说明: 对应输出质检规则 ID

- 字段: Status
  说明: `sample` / `candidate` / `ready` / `implemented`

## 5. 各能力选择口径

- 能力: `word-lookup`
  适合 few-shot: 强民航语境词、短语整体解释、易普通词典化的词
  不适合 few-shot: 普通词典条目、长篇例句、词源解释

- 能力: `grammar-review`
  适合 few-shot: 明确硬语法错误、无明显错误、禁止补全样本
  不适合 few-shot: 高级表达替换、航空专业用词争议

- 能力: `polish`
  适合 few-shot: 简短中式表达到自然民航口语表达
  不适合 few-shot: 长篇标准答案、大幅扩写、带评分反馈

- 能力: `transcribe`
  适合 few-shot: 通常不作为 LLM few-shot；保留 normalization / negative eval 样本
  不适合 few-shot: 任何语法纠错或润色示范

## 6. 第一批 few-shot 建议配比

- 能力: `word-lookup`
  数量: 3 条
  建议组成: 2 条术语解释 + 1 条短语整体解释

- 能力: `grammar-review`
  数量: 3 条
  建议组成: 1 条硬语法错误 + 1 条无明显错误 + 1 条禁止补全边界

- 能力: `polish`
  数量: 3 条
  建议组成: 2 条自然民航表达替换 + 1 条防止扩写边界

- 能力: `transcribe`
  数量: 0-2 条参考样本
  建议组成: 仅作为 normalization 参考，不作为普通 prompt few-shot

## 7. 状态流转

- 阶段: `sample`
  动作: 先进入 evals，记录输入和期望输出

- 阶段: `candidate`
  动作: 标注为 few-shot 候选，补充原因和风险

- 阶段: `ready`
  动作: 内容确认，可进入能力 examples

- 阶段: `implemented`
  动作: 已写入运行时代码或 prompt examples

- 阶段: `deprecated`
  动作: 输出效果不好或边界变化后停用
