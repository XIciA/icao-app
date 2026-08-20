# 历史归档：Domain Content Assets

本目录管理可复用的 ICAO / 民航英语知识正文。这里维护“词、短语、读法、错误类型”本身；能力文档和样本库只引用这些资产，不重复解释。

## 1. 当前领域资产

- 资产: 民航术语表
  文件: `aviation-terminology.md`
  职责: 统一术语含义、中文解释、常见搭配和适用能力

- 资产: ASR 热词
  文件: `aviation-hotwords.md`
  职责: 管理 ASR 热词、常见变体、缩写和格式规则

- 资产: 数字和字母读法
  文件: `aviation-number-readings.md`
  职责: 管理 FL、runway、heading、QNH、squawk 等数字场景，以及 taxiway、ATIS information、registration、navaid identifier 等字母场景

- 资产: 常见表达
  文件: `aviation-phrasebook.md`
  职责: 管理 ASR phrase hints、word-lookup、polish 可复用表达

- 资产: 常见错误
  文件: `aviation-common-errors.md`
  职责: 管理 grammar-review、polish、transcribe negative rules 可复用错误样本

- 资产: sentence900 AI 语料源
  文件: `sentence900-ai-corpus.md`
  职责: 管理 900 句抽取出的 ASR hotwords / hints、航路点和导航台候选、保守 normalization 场景、word-lookup 与 polish 可复用短语

## 2. 内容归属

- 内容类型: 术语含义、民航中文解释、常见搭配
  放置文件: `aviation-terminology.md`

- 内容类型: ASR 识别词、常见误听、大小写规则
  放置文件: `aviation-hotwords.md`

- 内容类型: 数字 / 字母读法和可规范化场景
  放置文件: `aviation-number-readings.md`

- 内容类型: 固定短语、管制表达、天气表达、紧急表达
  放置文件: `aviation-phrasebook.md`

- 内容类型: 学习者常见语法错误、表达问题、transcribe 禁止改写样例
  放置文件: `aviation-common-errors.md`

- 内容类型: sentence900 专属语料源、句子编号引用、抽取统计和 AI 资产候选
  放置文件: `sentence900-ai-corpus.md`

## 3. 维护规则

- 规则: 一行一条
  说明: 每个术语、短语、读法或错误样本独立维护

- 规则: 保留稳定 ID
  说明: 方便 capability 和 eval 引用

- 规则: 状态按 shared 定义
  说明: 状态含义见 `../shared/content-asset-structure-v1.md`

- 规则: 能力边界写清楚
  说明: `Use For` 或 `Applies To` 必须明确

- 规则: 不写 prompt
  说明: prompt draft 回到 `../capabilities/`

- 规则: 不写 eval 结论
  说明: 输入和期望输出样本回到 `../evals/`
