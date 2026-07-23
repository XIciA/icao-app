# AI 开发文档

状态：第一版

本目录是 ICAO App 后续 AI 功能开发的规范入口。当前只管理两类内容：AI 能力要求和 AI 基础资产。

历史需求文档不迁移、不引用，也不作为后续开发依据；需要的新规则在本目录重新整理。

## 1. AI 能力要求

| 能力 | 适用题库 | 文档 |
| --- | --- | --- |
| 上下文查词 | 听力、900句、陆空通话、OPI、故事复诵 | [`capabilities/contextual-word-lookup.md`](capabilities/contextual-word-lookup.md) |
| 录音转写 | 900句、陆空通话、OPI、故事复诵 | [`capabilities/recording-transcription.md`](capabilities/recording-transcription.md) |
| 语法复核 | 陆空通话、故事复诵、OPI | [`capabilities/grammar-review.md`](capabilities/grammar-review.md) |
| 表达润色 | OPI | [`capabilities/expression-polish.md`](capabilities/expression-polish.md) |

900句的“对比原文”是本地逐词比对能力，不调用模型，不属于本目录定义的 AI 能力。

## 2. AI 基础资产

| 资产 | 文档 |
| --- | --- |
| 资产范围与补充顺序 | [`assets/README.md`](assets/README.md) |
| ASR 实际热词资产 | [`assets/asr-hotwords.json`](assets/asr-hotwords.json) |
| 民航特殊数字读音 | [`assets/aviation-number-pronunciation.md`](assets/aviation-number-pronunciation.md) |
| ICAO 字母拼读 | [`assets/icao-spelling-alphabet.md`](assets/icao-spelling-alphabet.md) |

## 3. 共同要求

- 真实 AI 请求必须由服务端发起，客户端不得保存模型密钥。
- 调用前必须具备有效登录会话和用户 AI 处理同意。
- 只发送完成当前能力所需的最小内容，不把整套题库或无关学习记录发送给模型。
- 模型输出必须经过结构校验后才能返回客户端；校验失败视为 AI 调用失败，不展示未验证内容。
- 修改能力输入、输出或资产后，必须同步检查客户端、服务端、共享契约和测试，不得只改文档或只改其中一端。

## 4. 维护方式

- 一项能力只在对应的 `capabilities/` 文档中定义，不在其他文档重复描述结构化输出。
- 一类基础资产只在对应的 `assets/` 文档中维护。
- 表格一行只表达一个规则或资产；新增内容时优先追加行，不写长段落。
- 当前实现与文档不一致时，先记录差异并确认目标，再决定修改实现还是修改文档。
- 录音转写的实施、同步和维护流程以 [`workstreams/aviation-asr-optimization/closeout.md`](../workstreams/aviation-asr-optimization/closeout.md) 为准。
