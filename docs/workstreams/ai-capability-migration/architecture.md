# AI 结构总览

## 总体结构

当前 AI 分为前端入口、API route、能力层、模型 provider、内容资产五层。

```text
学习页 UI
-> app/api/ai/*
-> features/ai/capabilities/*
-> features/ai/server/providers/*
-> DashScope / 阿里百炼模型
```

核心目录：

| 层级 | 目录 | 作用 |
| --- | --- | --- |
| 前端入口 | `components/question-bank/*` | 查词弹层、录音按钮、我的回答区 AI 结果 |
| API route | `app/api/ai/*` | 接收请求，返回统一 envelope |
| AI 能力 | `features/ai/capabilities/*` | prompt、schema、server/client、能力逻辑 |
| 模型调用 | `features/ai/server/*` | provider、配置、错误、响应格式 |
| 内容资产 | `docs/workstreams/ai-capability-migration/AI-requirement` | prompt 规则、领域知识、eval 样本 |
| 领域知识 | `features/ai/domain/aviation/*` | 航空术语、热词、数字读法、转写规范 |

统一响应格式：

```ts
{ ok: true, data }
{ ok: false, error }
```

## 能力矩阵

| AI 能力 | 使用位置 | 使用题库 |
| --- | --- | --- |
| AI 查词 | 查词弹层 | 听力、900句、陆空通话、OPI、故事复诵 |
| 语音转写 | 录音按钮 -> 我的回答 | 900句、陆空通话、OPI、故事复诵 |
| 对比原文 | 我的回答区按钮 | 900句 |
| 检查语法 | 我的回答区按钮 | 陆空通话、故事复诵 |
| 分析表达 | 我的回答区按钮 | OPI |

## 1. AI 查词

使用入口：

- 学习页点击 `查词`
- 点选英文单词或短语
- 弹出 `AI 查词` 面板

技术链路：

```text
InteractiveText
-> WordLookup
-> /api/ai/word-lookup
-> features/ai/capabilities/word-lookup
-> LLM
```

输入：

- word
- 当前词所在句子
- module
- blockLabel / cardTitle / moduleTitle

输出：

- `definition`
- `contextExplanationZh`
- `promptVersion`

优化点：

- 只传当前句子，避免整张卡片干扰查词。
- prompt 固定输出 `释义` 和 `本句理解`。
- schema 限制模型不能输出评分、等级等无关字段。
- 前端缓存相同查词结果。
- 对同一 in-flight 请求去重，避免重复点击或开发模式重复请求。
- provider 对上游连接失败做自动重试。

## 2. 语音转写

使用入口：

- 900句、陆空通话、OPI、故事复诵的录音按钮

技术链路：

```text
RecordButton
-> MediaRecorder audio blob
-> /api/ai/opi/transcribe
-> features/ai/capabilities/transcribe
-> ASR
-> aviation normalization
```

输入：

- audio blob
- module
- questionId
- questionText
- topicId / scenarioId / groupId

输出：

- `rawTranscript`
- `transcript`
- `hintsVersion`

优化点：

- 使用真实 audio blob，不再用浏览器 Web Speech mock。
- ASR hints 版本化：`transcribe-hints:v1`。
- 保留原始转写 `rawTranscript`，同时输出规范化后的 `transcript`。
- 航空 normalization 处理 FL、runway、QNH、heading、squawk、frequency 等表达。
- 保留学习者语法错误，不在 ASR 阶段擅自纠错。
- 前端补齐录音中、转写中、失败、麦克风权限失败状态。

## 3. 对比原文

使用入口：

- 900句 `我的回答` 区域按钮：`对比原文`

技术链路：

```text
我的回答文本
-> compareExactMatch()
-> token diff
-> 我的回答区展示结果
```

输入：

- 用户转写或手动输入文本
- 当前 900句标准原文

输出：

- 是否完全一致
- 缺失内容
- 多余内容
- 替换错误
- 顺序错误

优化点：

- 不走大模型，避免模型随机性。
- 使用 token 化比较，忽略尾部标点差异。
- 能区分 missing、extra、replacement、order。
- 结果直接放在 `我的回答` 区域，和用户输入保持上下文一致。

## 4. 检查语法

使用入口：

- 陆空通话 `我的回答` 区域按钮：`检查语法`
- 故事复诵 `我的回答` 区域按钮：`检查语法`

技术链路：

```text
我的回答文本
-> /api/ai/opi/grammar-review
-> grammar-review:v1
-> schema validate
-> 我的回答区展示结果
```

输入：

- transcript
- mode: `grammar-only`
- module: `atc` 或 `story`
- question / questionId / scenarioId / groupId

输出：

- `overallFeedbackZh`
- `issues`
- `correctedText`
- `promptVersion`

优化点：

- 只检查硬语法错误，不做表达润色。
- 不打分、不评 ICAO 等级、不评价发音/语调/流利度。
- prompt 要求保留用户原意，不生成标准答案。
- schema 限制输出字段，过滤评分、等级等违规内容。
- 使用 high-quality text model，保证纠错稳定性。

## 5. 分析表达

使用入口：

- OPI `我的回答` 区域按钮：`分析表达`

技术链路：

```text
我的回答文本
-> /api/ai/opi/grammar-review
-> grammar-review:v1
-> polish:v1
-> schema validate
-> 我的回答区展示结果
```

输入：

- transcript
- mode: `opi`
- module: `opi`
- category
- topicId / topicTitle
- questionId / question

输出：

- `overallFeedbackZh`
- `issues`
- `correctedText`
- `polishedText`
- `promptVersion`
- `polishPromptVersion`

优化点：

- 先纠错，再润色，避免直接把错误文本改写成不稳定答案。
- 语法阶段只处理硬错误。
- 润色阶段只基于用户原意，不生成标准答案。
- 民航英语表达优化优先，不堆砌难词。
- 输出同时保留纠错结果和优化表达，方便用户对照学习。
- 禁止评分、等级、考试结果等字段。

## 模型与配置

默认配置来自 `.env.local`：

| 变量 | 作用 |
| --- | --- |
| `DASHSCOPE_API_KEY` | DashScope API key |
| `DASHSCOPE_BASE_URL` | 兼容 OpenAI 风格接口地址 |
| `AI_PROVIDER` | 默认 provider |
| `AI_TEXT_MODEL` | 标准文本模型 |
| `AI_HIGH_QUALITY_TEXT_MODEL` | 高质量文本模型 |
| `AI_ASR_MODEL` | ASR 模型 |

## 关键约束

- 不修改题库数据结构。
- 不重做当前 UI 布局。
- AI 结果只进入已有查词弹层和 `我的回答` 区域。
- prompt、schema、domain、ASR normalization 必须与原项目保持一致。
- 听力模块本轮只接入 AI 查词。
