# 历史归档：Eval Content Assets

本目录管理 AI 输出评测样本和 few-shot 候选。这里记录输入、期望输出、禁止输出和验收理由；是否进入 few-shot 按 `../shared/few-shot-selection-v1.md` 决定。

## 1. 当前样本库

- 能力: `word-lookup`
  文件: `word-lookup-samples.md`
  用途: 检查查词解释是否短、准、贴合民航语境

- 能力: `transcribe`
  文件: `transcribe-samples.md`
  用途: 检查 ASR 是否忠实转写、是否越界纠错

- 能力: `grammar-review`
  文件: `grammar-review-samples.md`
  用途: 检查是否只做语法纠错、不做润色或标准答案

- 能力: `polish`
  文件: `polish-samples.md`
  用途: 检查润色是否自然、简短、不扩写

## 2. 推荐字段

- 字段: ID
  说明: 稳定样本编号

- 字段: Input
  说明: 用户输入或查询对象

- 字段: Context
  说明: 题目原句、模块或必要上下文

- 字段: Expected
  说明: 期望输出或期望方向

- 字段: Forbidden
  说明: 禁止输出或禁止行为

- 字段: Related Rules
  说明: 对应 `../shared/output-quality-rules-v1.md` 规则 ID

- 字段: Few-shot Candidate
  说明: `yes` / `no` / `maybe`

- 字段: Status
  说明: 状态定义见 `../shared/content-asset-structure-v1.md`

## 3. 样本边界

- 样本类型: Positive
  用途: 验证能力应该做什么

- 样本类型: Negative
  用途: 验证能力不能做什么

- 样本类型: Boundary
  用途: 验证能力之间的边界

- 样本类型: Few-shot Candidate
  用途: 候选进入 prompt examples 的少量稳定样本

## 4. 不放在 evals 的内容

- 内容: prompt draft
  应放位置: `../capabilities/`

- 内容: 术语、短语、热词正文
  应放位置: `../domain/`

- 内容: few-shot 筛选标准
  应放位置: `../shared/few-shot-selection-v1.md`

- 内容: 输出质检规则定义
  应放位置: `../shared/output-quality-rules-v1.md`
