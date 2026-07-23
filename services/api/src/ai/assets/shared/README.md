# Shared AI Requirement Assets

本目录保存仍由运行时内容资产复用的输出质检规则，不放具体能力 prompt、术语正文或样本正文。

## 1. 当前文档

- 文件: `output-quality-rules-v1.md`
  作用: 静态查词输出质检规则
  典型问题: 什么算越界、失败、需要人工复核

## 2. 引用方式

- 来源: `capabilities/`
  如何使用 shared: 引用输出质检规则 ID，不重复复制共性边界

## 3. 不放在 shared 的内容

- 内容: 某个能力的完整 system prompt
  应放位置: `capabilities/`
  原因: 能力边界不同

- 内容: ICAO 术语解释
  应放位置: `domain/aviation-terminology.md`
  原因: 属于领域知识

- 内容: ASR 热词
  应放位置: `domain/aviation-hotwords.md`
  原因: 属于 transcribe 可复用领域资产

- 内容: 具体输入和期望输出样本
  应放位置: `evals/`
  原因: 属于评测和 few-shot 候选

- 内容: 代码 schema 或 TypeScript 类型
  应放位置: `features/` 后续工程化阶段
  原因: 当前阶段只做内容资产
