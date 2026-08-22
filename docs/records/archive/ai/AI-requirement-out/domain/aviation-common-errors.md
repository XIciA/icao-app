# 历史归档：Aviation Common Errors

本文档管理学习者在 ICAO / 民航英语答题中常见的语言问题和边界样例。通用维护规则见 `README.md`，状态定义见 `../shared/content-asset-structure-v1.md`。

## 1. Scope

- 项目: 主要用途
  说明: 服务 `grammar-review`、`polish` 和 transcribe negative boundary

- 项目: 重要边界
  说明: 这里只记录错误类型、修正方向和能力差异，不写标准答案

## 2. 常见语法错误样本

- ID: CE-001
  Error Type: subject-verb agreement
  Learner Text: I has turbulence.
  Correction Direction: I have turbulence.
  Applies To: grammar-review
  Status: ready

- ID: CE-002
  Error Type: be verb
  Learner Text: I is ready.
  Correction Direction: I am ready.
  Applies To: grammar-review
  Status: ready

- ID: CE-003
  Error Type: tense
  Learner Text: I fly to Beijing yesterday.
  Correction Direction: I flew to Beijing yesterday.
  Applies To: grammar-review
  Status: ready

- ID: CE-004
  Error Type: article
  Learner Text: runway is not clear.
  Correction Direction: the runway is not clear.
  Applies To: grammar-review
  Status: ready

- ID: CE-005
  Error Type: preposition
  Learner Text: descend flight level two niner zero.
  Correction Direction: descend to flight level two niner zero.
  Applies To: grammar-review
  Notes: grammar-review 只补介词；`FL290` 这类格式化交给 transcribe normalization 或 polish
  Status: ready

## 3. 常见表达问题样本

- ID: AE-001
  Learner Text: I meet thunderstorm.
  Better Aviation Expression: I encountered a thunderstorm.
  Applies To: polish
  Notes: transcribe 不应自动改
  Status: ready

- ID: AE-002
  Learner Text: I will tell ATC.
  Better Aviation Expression: I will advise ATC.
  Applies To: polish
  Notes: 简洁民航表达
  Status: ready

- ID: AE-003
  Learner Text: I change route.
  Better Aviation Expression: I request a route deviation.
  Applies To: polish
  Notes: 不补充原因
  Status: ready

- ID: AE-004
  Learner Text: bad weather
  Better Aviation Expression: adverse weather
  Applies To: polish / word-lookup
  Notes: 视上下文使用
  Status: ready

## 4. Transcribe Negative Boundary

这些样例用于提醒：ASR 转写阶段不能做 grammar-review 或 polish 的工作。

- ID: TN-001
  Input: `I has turbulence`
  Forbidden Transcribe Output: `I have turbulence`
  Expected Transcribe Output: `I has turbulence`

- ID: TN-002
  Input: `I meet thunderstorm`
  Forbidden Transcribe Output: `I encountered a thunderstorm`
  Expected Transcribe Output: `I meet thunderstorm`

- ID: TN-003
  Input: `request deviation`
  Forbidden Transcribe Output: `request deviation due to thunderstorm`
  Expected Transcribe Output: `request deviation`

- ID: TN-004
  Input: `We go around because runway not clear`
  Forbidden Transcribe Output: `We are going around because the runway is not clear`
  Expected Transcribe Output: `We go around because runway not clear`

## 5. 待确认问题

- ID: TODO-001
  Question: grammar-review 是否检查航空搭配错误
  Suggested Handling: 当前 v1 先只检查通用硬语法
  Status: open

- ID: TODO-002
  Question: polish 是否可少量补足状语
  Suggested Handling: 只有非常必要且不改变原意时允许
  Status: open

- ID: TODO-003
  Question: common errors 是否按模块拆分
  Suggested Handling: 样本变多后可拆 OPI / ATC / story
  Status: open
