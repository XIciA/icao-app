# 历史归档：AI Requirement Assets

> 这是 AI 迁出快照，保留评测与领域素材，但不是当前运行时唯一来源。

本目录用于集中管理飞猪 ICAO 学习产品的 AI 内容资产。这里先沉淀内容、样例和边界，内容确认后再由 Codex 写入运行时代码。

## 1. 目录入口

- 目录: `shared/`
  职责: 跨能力共享规则：结构、状态、few-shot、输出质检
  入口: `shared/README.md`

- 目录: `capabilities/`
  职责: 单个 AI 能力的目标、输入输出、prompt draft、专属边界
  入口: `capabilities/README.md`

- 目录: `domain/`
  职责: 可复用的民航英语知识：术语、热词、数字和字母读法、表达、常见错误
  入口: `domain/README.md`

- 目录: `evals/`
  职责: 评测样本和 few-shot 候选样本
  入口: `evals/README.md`

## 2. 单一来源

- 内容: 目录分工、命名、状态和生命周期
  唯一维护位置: `shared/content-asset-structure-v1.md`

- 内容: few-shot 筛选规则
  唯一维护位置: `shared/few-shot-selection-v1.md`

- 内容: 输出质检规则
  唯一维护位置: `shared/output-quality-rules-v1.md`

- 内容: 能力目标和 prompt draft
  唯一维护位置: `capabilities/`

- 内容: 民航术语和表达正文
  唯一维护位置: `domain/`

- 内容: 输入、期望输出、禁止输出样本
  唯一维护位置: `evals/`

## 3. 当前资产

- 类型: 共享规则
  文件: `shared/content-asset-structure-v1.md`, `shared/few-shot-selection-v1.md`, `shared/output-quality-rules-v1.md`

- 类型: 能力文档
  文件: `capabilities/transcribe-hints-v1.md`, `capabilities/word-lookup-v1.md`, `capabilities/grammar-review-v1.md`, `capabilities/polish-v1.md`

- 类型: 领域资产
  文件: `domain/aviation-terminology.md`, `domain/aviation-hotwords.md`, `domain/aviation-number-readings.md`, `domain/aviation-phrasebook.md`, `domain/aviation-common-errors.md`, `domain/sentence900-ai-corpus.md`

- 类型: 评测样本
  文件: `evals/word-lookup-samples.md`, `evals/transcribe-samples.md`, `evals/grammar-review-samples.md`, `evals/polish-samples.md`

## 4. 编辑顺序

1. 先判断内容的唯一归属：`shared`、`capabilities`、`domain` 或 `evals`。
2. 在对应 Markdown 中新增或调整内容，并保留稳定 ID。
3. 共性规则只写在 `shared/`，其他文件引用规则 ID。
4. 样本先进入 `evals/`，再按 `shared/few-shot-selection-v1.md` 标记 few-shot 候选。
5. 内容确认后再进入工程化阶段。

## 5. 当前阶段不做

- 不做项: 不改运行时代码
  说明: 不改 `features/`、`app/`、`components/`

- 不做项: 不改题库数据
  说明: 不改 `lib/question-banks/data/question-bank.json`

- 不做项: 不新增生产依赖
  说明: 内容资产阶段只维护 Markdown

- 不做项: 不部署
  说明: 内容确认后再进入技术实现
