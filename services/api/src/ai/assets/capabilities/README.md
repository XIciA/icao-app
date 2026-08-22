# Capability Content Assets

本目录管理仍由内容资产驱动的单个 AI 能力说明。固定后端 Prompt 的语法纠错和表达润色见 `docs/resources/ai/capabilities/` 与后端代码。

## 1. 当前能力

- 能力: `transcribe`
  文件: `transcribe-hints-v1.md`
  职责: ASR hints、scene context、normalization 边界

- 能力: `word-lookup`
  文件: `word-lookup-v1.md`
  职责: 当前句子里的单词或短语解释

## 2. 能力文档应包含

- 部分: Basic Info
  内容: Prompt ID、能力、输出结构、当前状态

- 部分: Capability Goal
  内容: 该能力做什么，以及专属边界

- 部分: Prompt Draft
  内容: System / User / Return JSON 或 ASR hints 草稿

- 部分: Domain References
  内容: 引用相关 `../domain/` 资产

- 部分: Technical Mapping
  内容: 内容确认后可能落地到哪些代码文件

## 3. 能力文档不应包含

- 内容: 术语、热词、数字和字母读法、表达库正文
  应放位置: `../domain/`

## 4. 推荐引用格式

- 引用类型: Domain assets
  写法: `TER-016`, `PH-021`
