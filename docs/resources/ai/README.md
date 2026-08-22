# AI 开发文档

状态：当前入口
更新时间：2026-07-30

本目录说明产品能力与维护入口。服务端实际装载的 prompt/领域资产以
`services/api/src/ai/assets/` 及其 manifest 为运行时来源；不要在文档目录建立第二份运行副本。
早期迁出包及评测样例保存在 `docs/records/archive/ai/AI-requirement-out/`，仅用于追溯和选择性复用。

## 1. AI 能力要求

| 能力 | 适用题库 | 文档 |
| --- | --- | --- |
| 上下文查词 | 听力、900句、陆空通话、OPI、故事复诵 | [`word-lookup-v1` 运行时资产](../../../services/api/src/ai/assets/capabilities/word-lookup-v1.md) |
| 录音转写 | 900句、陆空通话、OPI、故事复诵 | [`capabilities/recording-transcription.md`](capabilities/recording-transcription.md) |
| 语法纠错 | 陆空通话、故事复诵、OPI | [`capabilities/grammar-correction.md`](capabilities/grammar-correction.md) |
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

- 语法纠错和表达润色以对应 `capabilities/` 文档中的输入输出案例作为产品效果标准；开发者只维护案例，Prompt、运行时规则和校验由实现根据案例保持一致。
- 其他能力只在对应的 `capabilities/` 文档中定义，不在其他文档重复描述结构化输出。
- 一类基础资产只在对应的 `assets/` 文档中维护。
- 表格一行只表达一个规则或资产；新增内容时优先追加行，不写长段落。
- 当前实现与文档不一致时，先记录差异并确认目标，再决定修改实现还是修改文档。
- 录音转写的历史实施证据见
  [`aviation-asr-optimization/closeout.md`](../../records/workstreams/aviation-asr-optimization/closeout.md)；
  当前行为以代码、contracts、运行时资产和测试为准。
- 修改运行时资产后运行 `pnpm ai:assets:check`；只修改产品说明时不复制运行时内容到本目录。
