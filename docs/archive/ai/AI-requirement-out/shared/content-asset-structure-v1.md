# 历史归档：Content Asset Structure v1

本文档定义 `docs/workstreams/ai-capability-migration/AI-requirement/` 的整体内容资产结构。它是目录分工、命名、状态和生命周期的唯一来源。

## 1. 结构目标

- 目标: 内容先行
  说明: 先用 Markdown 确认内容，再写入运行时代码

- 目标: 能力分离
  说明: 不把 transcribe / grammar-review / polish 的边界混在一起

- 目标: 领域复用
  说明: 民航术语、表达、错误类型集中维护，避免重复解释

- 目标: 样本可追踪
  说明: eval 样本、few-shot 候选、质检规则能互相引用

- 目标: 编辑友好
  说明: 表格、一行一条、状态清楚、方便人工增删改

## 2. 四层目录分工

- 层级: Shared Rules
  目录: `shared/`
  负责内容: 结构规则、few-shot 筛选、输出质检、生命周期
  不负责内容: 具体能力 prompt、术语正文、样本正文
  示例: `output-quality-rules-v1.md`

- 层级: Capability Specs
  目录: `capabilities/`
  负责内容: 单个能力的目标、边界、prompt draft、输入输出、技术映射
  不负责内容: 通用术语表、完整 eval 样本库
  示例: `grammar-review-v1.md`

- 层级: Domain Knowledge
  目录: `domain/`
  负责内容: ICAO / 民航术语、热词、数字和字母读法、表达库、常见错误
  不负责内容: 能力 prompt、评测结论
  示例: `aviation-phrasebook.md`

- 层级: Evaluation Samples
  目录: `evals/`
  负责内容: 输入、期望输出、禁止输出、验收理由、few-shot 候选标注
  不负责内容: 运行时代码、完整 prompt
  示例: `polish-samples.md`

## 3. 单一来源规则

- 内容: 状态定义和生命周期
  唯一维护位置: 本文档
  其他位置如何处理: 只引用，不重复解释

- 内容: few-shot 筛选标准
  唯一维护位置: `few-shot-selection-v1.md`
  其他位置如何处理: 样本表只写候选状态和理由

- 内容: 输出质检规则
  唯一维护位置: `output-quality-rules-v1.md`
  其他位置如何处理: 能力文档只引用规则 ID

- 内容: 能力目标和 prompt draft
  唯一维护位置: `capabilities/`
  其他位置如何处理: README 只做索引

- 内容: 民航知识正文
  唯一维护位置: `domain/`
  其他位置如何处理: 能力和样本只引用

- 内容: 评测样本正文
  唯一维护位置: `evals/`
  其他位置如何处理: 能力文档不重复维护样例正文

## 4. 内容路由规则

- 新内容类型: 能力目标或 prompt 边界
  放置位置: `capabilities/<capability>-v1.md`
  判断标准: 只服务某一个能力

- 新内容类型: 跨能力都要遵守的规则
  放置位置: `shared/`
  判断标准: 至少两个能力会复用

- 新内容类型: 民航词义、缩写、搭配
  放置位置: `domain/aviation-terminology.md`
  判断标准: 解释“这个词在民航里是什么意思”

- 新内容类型: ASR 热词或大小写格式
  放置位置: `domain/aviation-hotwords.md`
  判断标准: 帮助 transcribe 识别或规范格式

- 新内容类型: 数字 / 字母读法
  放置位置: `domain/aviation-number-readings.md`
  判断标准: FL、runway、heading、QNH、squawk 等数字场景，或 taxiway、ATIS information、registration、navaid identifier、airspace class 等字母场景

- 新内容类型: 常见民航表达
  放置位置: `domain/aviation-phrasebook.md`
  判断标准: 帮助 ASR phrase hints、word-lookup、polish

- 新内容类型: 学习者常见错误
  放置位置: `domain/aviation-common-errors.md`
  判断标准: 帮助 grammar-review、polish 或 transcribe negative rules

- 新内容类型: 输入和期望输出样本
  放置位置: `evals/<capability>-samples.md`
  判断标准: 用于验证输出是否符合能力边界

- 新内容类型: few-shot 候选
  放置位置: `evals/<capability>-samples.md` 先标注
  判断标准: 确认后再进入能力 examples 或 prompt

## 5. 命名和版本

- 规则: 文件名使用 kebab-case
  示例: `output-quality-rules-v1.md`
  说明: 方便检索和后续映射

- 规则: 能力文档带版本
  示例: `word-lookup-v1.md`
  说明: 内容变化较大时再新增 v2

- 规则: 共享规则带版本
  示例: `few-shot-selection-v1.md`
  说明: 保留规则演进记录

- 规则: 样本文件不强制带版本
  示例: `polish-samples.md`
  说明: 样本库可持续追加

- 规则: ID 保持稳定
  示例: `OQ-001`, `GR-E-001`
  说明: 后续可被 capability / eval / code 引用

## 6. 状态定义

- 状态: `draft`
  含义: 初步想法，还未审
  可否写入代码: 不建议

- 状态: `sample`
  含义: 样本内容，可用于讨论或评测
  可否写入代码: 不建议直接进入核心规则

- 状态: `candidate`
  含义: 候选内容，需要观察或验证
  可否写入代码: 谨慎

- 状态: `hint-only`
  含义: 只作为 ASR 或 prompt 参考，不自动改输出
  可否写入代码: 视能力而定

- 状态: `ready`
  含义: 已确认，可工程化
  可否写入代码: 可以

- 状态: `implemented`
  含义: 已写入代码
  可否写入代码: 已完成

- 状态: `deprecated`
  含义: 不再推荐使用
  可否写入代码: 不可以

## 7. 引用关系

- 来源: `capabilities/`
  可以引用: `shared/` 规则 ID、`domain/` 资产 ID、`evals/` 样本 ID
  用法: 说明 prompt 应遵守哪些规则

- 来源: `evals/`
  可以引用: `shared/` 规则 ID、`domain/` 资产 ID
  用法: 标明样本验证哪条规则

- 来源: `domain/`
  可以引用: `shared/` 状态和字段规则
  用法: 保持术语、表达、错误类型格式统一

- 来源: `shared/`
  可以引用: 不依赖具体样本正文
  用法: 只定义共性结构和判断标准

## 8. 新内容提交前检查

- 检查项: 位置正确
  通过标准: 内容放在最小且最合适的目录

- 检查项: 状态明确
  通过标准: 每条新增内容有 `Status` 或明确章节状态

- 检查项: 能力清楚
  通过标准: 写明适用能力，避免跨界

- 检查项: 可人工编辑
  通过标准: 表格清楚，一行一条

- 检查项: 不触碰运行时代码
  通过标准: 当前阶段不改 `features/`、`app/`、`components/`

- 检查项: 不改题库数据
  通过标准: 不修改 `lib/question-banks/data/question-bank.json`

- 检查项: 可追踪
  通过标准: 关键规则和样本有稳定 ID
