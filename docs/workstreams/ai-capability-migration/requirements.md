# AI 能力接入需求

## 文档定位

本项目是 ICAO 学习产品的高保真移动 App 设计稿。AI 接入的核心目标是：在相同模型下，本项目 AI 输出性能必须与 `feizhuicu` 保持一致。

等价链路定义：

```text
输入 -> feizhuicu 前处理 -> AI 模型 -> feizhuicu 后处理 -> 输出
```

因此，本项目不能只迁移 prompt 文本，而要迁移影响模型输入、模型输出解析和用户最终结果的完整处理链路。

## 当前问题

- 查词、录音、回答等界面已有外观，但 AI 结果仍以 mock 或浏览器能力为主。
- 缺少真实 ASR、语法纠错、回答润色、AI 加载/失败/权限状态。
- `feizhuicu` 中影响 AI 性能的前处理、后处理和内容资产，本项目尚未迁入。

## 总目标

完成第一批真实 AI 学习能力接入：

- AI 查词
- 语音转写
- 语法纠错
- 回答润色
- 900句精确复述检查
- 五类性能等价处理迁移

## 冻结边界

本阶段只做 AI 能力迁移，不修改当前 UI 设计和题库数据结构。

- 当前移动端视觉、页面布局、学习卡片结构、工具按钮位置保持不变。
- 当前题库数据结构和 `lib/question-banks/data/question-bank.json` 保持不变。
- AI 能力必须适配当前 UI 已有的交互入口和展示容器。
- 允许为了对齐 `feizhuicu` AI 行为调整 AI 入口文案和 AI 弹层内容结构；不允许借此重做布局。
- 如当前 UI 无法承载某个 AI 能力，只提出缺口和建议，不直接改 UI。

## 大流程

先完成文档大流程，再进入代码小流程：

1. `requirements.md`
2. `technical-audit.md`
3. `technical-plan.md`
4. `roadmap.md`

进入小流程前，需要明确每个能力的迁移方式、页面落点、接口边界和验收标准。

## 接入范围

| 能力 | 需求 | 来源参考 |
| --- | --- | --- |
| AI 查词 | 点选单词/短语后请求真实解释；携带单词、句子、模块、卡片上下文；支持加载、失败、缓存 | `features/ai/capabilities/word-lookup`, `app/api/ai/word-lookup/route.ts`, `features/ai/components/WordLookupPanel.tsx` |
| 语音转写 | 按住说话、松开上传；支持 OPI、900句、陆空通话、故事复诵；返回 `transcript`, `rawTranscript`, `hintsVersion` | `features/ai/capabilities/transcribe`, `features/question-bank/speaking`, `app/api/ai/opi/transcribe/route.ts` |
| 语法纠错 | 基于转写文本返回 `correctedText`、`issues`、`overallFeedbackZh`；不做评分和等级判定 | `features/ai/capabilities/grammar-review`, `app/api/ai/opi/grammar-review/route.ts` |
| 回答润色 | 基于用户原意生成更自然的民航口语表达；不改变核心意思 | `features/ai/capabilities/polish`, `app/api/ai/opi/polish/route.ts` |
| 900句复述检查 | 本地比对用户转写和标准句，展示差异提示；不走大模型 | `features/ai/capabilities/exact-match-check` |

以上来源路径均位于 `/Users/zhouyide/Desktop/icao项目/feizhuicu`。

## AI 入口文案

当前学习页 AI 操作入口不能统一叫“美化”，需要按模块对齐 `feizhuicu` 的能力语义：

| 模块 | AI 入口文案 | 对应能力 |
| --- | --- | --- |
| 900句 | 对比原文 | exact-match-check |
| 陆空通话 | 检查语法 | grammar-review |
| OPI | 分析表达 | grammar-review + polish |
| 故事复诵 | 检查语法 | grammar-review |

听力模块本轮不新增回答分析入口。

## 查词 UI 对齐

AI 查词的界面展示和输出效果必须与 `feizhuicu` 保持一致：

- 弹层标题为 `AI 查词`。
- 输出结构保留 `释义` 和 `本句理解`。
- 查询传入被点选内容所在的当前句子，不扩大为整张卡片全文。
- 加载、失败、关闭、缓存行为与 `feizhuicu` 对齐。
- 不使用当前 mock 词典里的音标、词性、例句结构替代真实 AI 输出。

## 最新执行决策

- AI 查词以原项目为准，固定使用 `AI 查词`、`释义`、`本句理解` 结构。
- 查词上下文只传当前单词所在句子。
- 真实语音迁移必须补齐 audio blob、ASR hints、hotwords、normalization、loading、error、mic permission 等内部能力；UI 布局不变。
- 900句、陆空通话、OPI、故事复诵保持原按钮位置，只改变文案和动作绑定。
- AI 结果统一放在控制台 `我的回答` 区域；允许在该区域内做合理、简洁、逻辑清晰的结果展示设计。
- 听力模块本轮只保留查词，不新增回答分析入口。

## 性能等价范围

以下五类必须在本项目中体现，作为相同模型下性能等价的基础：

| 类型 | 作用 | 必迁来源 |
| --- | --- | --- |
| Prompt / Messages | 决定模型如何理解任务、输出什么、禁止输出什么 | `features/ai/capabilities/word-lookup/prompt.ts`, `features/ai/capabilities/grammar-review/prompt.ts`, `features/ai/capabilities/polish/prompt.ts`, `features/ai/prompts/` |
| 领域知识资产 | 决定民航英语语境、术语、热词、数字读法和常见错误 | `features/ai/domain/aviation/`, `docs/workstreams/ai-capability-migration/AI-requirement/domain/` |
| ASR hints / hotwords / normalization | 影响语音转写、航空数字规范和转写后处理 | `features/ai/capabilities/transcribe/hints.ts`, `features/ai/domain/aviation/transcriptNormalization.ts`, `docs/workstreams/ai-capability-migration/AI-requirement/capabilities/transcribe-hints-v1.md` |
| 输出 schema / 质检规则 | 决定模型输出是否被接受、过滤、警告或判为无效 | `features/ai/capabilities/*/schema.ts`, `features/ai/server/response.ts` |
| 调用编排 | 决定能力组合顺序、请求字段、结果合并和页面调用方式 | `app/api/ai/*`, `features/ai/capabilities/*/server.ts`, `features/question-bank/speaking/hooks/useSpeakingPractice.ts` |

辅助资产也需要迁移：

- eval 样本：查词、转写、语法纠错、润色
- 版本字段：`promptVersion`、`polishPromptVersion`、`hintsVersion`
- AI 规则目录：`docs/workstreams/ai-capability-migration/AI-requirement`
- 上游审计参考：`/Users/zhouyide/Desktop/icao项目/feizhuicu/docs/workstreams/ai-prompt-management`

后续 AI 能力实现不得违背 `AI-requirement` 中的 shared、capabilities、domain 和 evals 规则。

## 界面状态要求

AI 界面必须延续 `docs/design/ui-style-guide.md` 的移动学习 App 气质，优先补齐这些状态：

- 查词加载、成功、失败
- 录音中、转写中、转写失败
- 麦克风权限失败
- 网络离线或 AI 服务不可用
- 语法纠错中、反馈生成失败
- 润色中、润色失败
- AI 结果生成后保存失败

## 技术边界

允许：

- 迁移必要的 AI client、server、provider、schema、prompt、错误响应和调用编排。
- 新增 API route 和环境变量说明。
- 在当前学习卡片已有入口和容器内接入真实 AI 状态。
- 保留明确标识的 mock fallback，作为无 key 或离线预览兜底。

暂不做：

- 不迁移账号、数据库、云端学习同步、AI 使用日志。
- 不重做题库 UI、导航和整体视觉风格。
- 不修改当前题库数据结构。
- 不把 prompt 资产散落到组件中重复维护。
- 不在需求阶段实现代码。

## 环境变量

技术方案阶段需确认是否沿用：

- `DASHSCOPE_API_KEY`
- `DASHSCOPE_BASE_URL`
- `AI_PROVIDER`
- `AI_TEXT_MODEL`
- `AI_HIGH_QUALITY_TEXT_MODEL`
- `AI_ASR_MODEL`

缺少 key 时，页面必须进入明确的不可用状态或标识清楚的预览模式。

## 验收标准

- AI 能力、页面落点、接口边界和五类性能等价范围清楚。
- 当前 UI 是否满足各 AI 能力接口已有检查结论。
- 真实 AI 与 mock fallback 的边界清楚。
- prompt / messages、domain、ASR hints、schema、调用编排有对应迁移路径。
- AI 能力遵守 `AI-requirement` 中的规则和边界。
- 移动端学习页能呈现完整 AI 状态链路。
- 后续小流程可按能力拆分执行。
