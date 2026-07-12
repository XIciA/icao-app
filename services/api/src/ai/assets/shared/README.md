# Shared AI Requirement Assets

本目录是跨能力共享规则的唯一入口。这里放结构、状态、few-shot 筛选和输出质检，不放具体能力 prompt、术语正文或样本正文。

## 1. 当前文档

- 文件: `content-asset-structure-v1.md`
  作用: 内容资产结构和生命周期规则
  典型问题: 新内容应该放在哪个目录、状态怎么标

- 文件: `few-shot-selection-v1.md`
  作用: few-shot 候选筛选规则
  典型问题: 哪些 eval 样本适合进入 prompt examples

- 文件: `output-quality-rules-v1.md`
  作用: 输出质检规则
  典型问题: 什么算越界、失败、需要人工复核

## 2. 引用方式

- 来源: `capabilities/`
  如何使用 shared: 引用输出质检规则 ID，不重复复制共性边界

- 来源: `domain/`
  如何使用 shared: 按结构规则维护状态、ID 和字段

- 来源: `evals/`
  如何使用 shared: 按 few-shot 规则标注候选，引用相关质检规则 ID

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
