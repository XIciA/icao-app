# AI 能力接入技术盘点

## 盘点目的

确认 `icao设计稿` 与 `feizhuicu` 在 AI 管线上的差距，并明确为了“相同模型下性能一致”必须迁移的 `feizhuicu处理`。

## 总体判断

当前项目可以接入真实 AI，但不能只搬 prompt。要达到性能一致，必须迁移从请求构造到结果校验的完整链路：

```text
输入 -> prompt/messages/hints/context/schema/orchestration -> 模型 -> schema/normalization/merge/error handling -> 输出
```

## 当前项目现状

| 位置 | 现状 | 差距 |
| --- | --- | --- |
| `components/question-bank/word-lookup.tsx` | 本地 mock 查词 | 无真实接口、无 prompt、无 schema |
| `components/question-bank/record-button.tsx` | Web Speech API 或示例文本 | 无真实音频上传、ASR、hints、normalization |
| `components/question-bank/card-study-view.tsx` | 已有学习卡片、回答区和工具入口 | 缺少真实 AI 状态链路和反馈结果 |
| `app/` | 无 AI API route | 无服务端模型调用 |
| `features/` | 无 `features/ai` | 无 AI 能力分层、provider、schema、domain |
| `docs/` | 已新增本 workstream 和 `AI-requirement` 资产副本 | 后续技术方案需把 AI 实现约束到这些规则 |

## feizhuicu 等价源

| 等价层 | 必看目录 / 文件 | 说明 |
| --- | --- | --- |
| Prompt / Messages | `features/ai/capabilities/*/prompt.ts`, `features/ai/prompts/` | 构造实际发给模型的 system/user messages、maxTokens、版本 |
| 领域知识资产 | `features/ai/domain/aviation/`, `docs/workstreams/ai-capability-migration/AI-requirement/domain/` | 民航术语、热词、数字读法、常见错误、表达库 |
| ASR hints / normalization | `features/ai/capabilities/transcribe/hints.ts`, `features/ai/domain/aviation/transcriptNormalization.ts` | ASR hints 版本、hotwords、转写后处理 |
| 输出 schema / 质检 | `features/ai/capabilities/*/schema.ts`, `features/ai/server/response.ts` | 输出字段校验、禁止字段、错误响应 envelope |
| 调用编排 | `app/api/ai/*`, `features/ai/capabilities/*/server.ts`, `features/question-bank/speaking/hooks/useSpeakingPractice.ts` | 能力组合、请求读取、结果合并、前端触发方式 |

## 能力链路盘点

| 能力 | feizhuicu 链路 | 当前项目缺口 |
| --- | --- | --- |
| AI 查词 | `WordLookupPanel` -> client cache -> `/api/ai/word-lookup` -> prompt -> schema -> response | 当前只有 mock 面板，UI 和输出结构也不一致 |
| 语音转写 | recorder -> FormData -> `/api/ai/opi/transcribe` -> ASR server -> hints/normalization -> response | 当前没有真实录音上传和 ASR |
| 语法纠错 | speaking hook -> grammar-review client -> route -> prompt -> schema -> feedback | 当前没有纠错接口和反馈面板 |
| 回答润色 | grammar-review route 可串联 polish，或单独 `/api/ai/opi/polish` | 当前没有 polish 能力 |
| 900句复述检查 | ASR transcript -> `exact-match-check` 本地比对 -> compare panel | 当前没有等价比对逻辑 |

## 当前 UI 接口检查

原则：不修改当前 UI 外观和题库数据结构，只判断现有界面是否能承载 AI 能力。

| 能力 | 当前 UI 是否有入口 | 是否满足完整接口 | 需要补的非视觉接口 |
| --- | --- | --- | --- |
| AI 查词 | 有。`查词`按钮 + `InteractiveText` 点击单词 + `WordLookup` 弹层 | 部分满足 | 点击事件只有 `word`，缺少句子、模块、卡片标题、blockLabel 等上下文；弹层需改为 `feizhuicu` 的 `AI 查词 / 释义 / 本句理解` 结构 |
| 语音转写 | 有。`RecordButton` + `我的回答`文本框 | 不满足 | `RecordButton` 只返回文本，缺少真实音频 Blob、转写中、失败、麦克风权限失败等状态 |
| 语法纠错 | 有承载区。`我的回答`文本框和顶部 `美化`按钮可作为入口 | 不满足 | 入口文案需按模块改为 `检查语法` 或 `分析表达`；缺少纠错触发、结果字段、问题列表、反馈状态和错误状态 |
| 回答润色 | 有入口雏形。当前 `美化`按钮可承载 polish | 部分满足 | OPI 入口文案应为 `分析表达`；当前 `beautify()` 是本地格式化，不是 AI polish；缺少 loading/error 和 `polishedText` 来源标识 |
| 900句复述检查 | 有基础输入。900句有录音和我的回答 | 不满足 | 缺少标准句对比结果展示、差异提示、匹配度状态 |

结论：当前视觉入口基本够用，不建议改 UI 布局；但代码接口不完整。后续技术方案应通过内部 props、状态和现有容器内容填充来补足，不改变页面结构。

补充决策：查词上下文只补当前单词所在句子；语音转写补齐 audio blob、ASR hints、hotwords、normalization、loading、error、mic permission；回答分析结果放在控制台 `我的回答` 区域；听力模块只保留查词。

## AI 入口文案检查

当前 UI 在 `components/question-bank/card-study-view.tsx` 中统一使用 `美化`。该文案不能准确表达不同模块的 AI 能力，需要在不改变按钮位置和样式的前提下改为：

| 模块 | 当前文案 | 目标文案 |
| --- | --- | --- |
| 900句 | 美化 | 对比原文 |
| 陆空通话 | 美化 | 检查语法 |
| OPI | 美化 | 分析表达 |
| 故事复诵 | 美化 | 检查语法 |

## 关键风险

- P0：只迁移 prompt 会导致输入结构、输出校验、ASR 后处理和调用顺序不一致，无法保证性能一致。
- P0：不能把 `feizhuicu` 的账号、数据库、学习同步、AI 使用日志作为本阶段依赖。
- P1：当前设计稿卡片状态是本地组件状态，接入 AI 时要保留高保真 UI，不引入生产级复杂数据流。
- P1：ASR 当前 feizhuicu 仍有 hints 管理结构和保守 normalization，技术方案必须确认哪些是运行时代码、哪些只是文档资产。
- P2：mock fallback 可以保留，但必须与真实 AI 输出路径明显区分。

## 后续技术方案重点

- 以 `features/ai` 为迁移单元，而不是只复制 prompt 文本。
- 保留 feizhuicu 的请求/响应 envelope：`{ ok: true, data }` / `{ ok: false, error }`。
- 保留 prompt/hints 版本字段，方便对账。
- 先接入学习卡片中的查词、录音转写、纠错、润色和 900句复述检查。
- 将 `docs/workstreams/ai-capability-migration/AI-requirement` 作为 AI 内容规则源，后续 prompt、schema、hints 和页面反馈不得违背其中规则。
