# Capability Content Assets

本目录管理单个 AI 能力的内容说明。能力文档只写该能力独有的目标、输入输出、prompt draft、边界和技术映射；共性规则引用 `../shared/`，不重复维护。

## 1. 当前能力

- 能力: `transcribe`
  文件: `transcribe-hints-v1.md`
  职责: ASR hints、scene context、normalization 边界

- 能力: `word-lookup`
  文件: `word-lookup-v1.md`
  职责: 当前句子里的单词或短语解释

- 能力: `grammar-review`
  文件: `grammar-review-v1.md`
  职责: 明确硬语法错误检查和保守纠错

- 能力: `polish`
  文件: `polish-v1.md`
  职责: 基于用户原意的民航口语润色

## 2. 能力文档应包含

- 部分: Basic Info
  内容: Prompt ID、能力、输出结构、当前状态

- 部分: Capability Goal
  内容: 该能力做什么，以及专属边界

- 部分: Prompt Draft
  内容: System / User / Return JSON 或 ASR hints 草稿

- 部分: Shared Rules
  内容: 引用 `../shared/output-quality-rules-v1.md` 中的规则 ID

- 部分: Domain References
  内容: 引用相关 `../domain/` 资产

- 部分: Eval References
  内容: 引用相关 `../evals/` 样本

- 部分: Technical Mapping
  内容: 内容确认后可能落地到哪些代码文件

## 3. 能力文档不应包含

- 内容: 通用状态定义和生命周期
  应放位置: `../shared/content-asset-structure-v1.md`

- 内容: 通用 JSON / 禁止评分 / 禁止标准答案规则
  应放位置: `../shared/output-quality-rules-v1.md`

- 内容: few-shot 筛选标准
  应放位置: `../shared/few-shot-selection-v1.md`

- 内容: 术语、热词、数字和字母读法、表达库正文
  应放位置: `../domain/`

- 内容: 输入和期望输出样本正文
  应放位置: `../evals/`

## 4. 推荐引用格式

- 引用类型: Shared rules
  写法: `OQ-001`, `WL-OQ-002`

- 引用类型: Domain assets
  写法: `TER-016`, `PH-021`, `CE-001`

- 引用类型: Eval samples
  写法: `WL-001`, `GR-E-001`, `PO-N-001`
