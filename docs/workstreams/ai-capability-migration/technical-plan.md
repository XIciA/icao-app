# AI 能力迁移技术方案

## 目标

在不修改题库数据结构、不重做学习页布局的前提下，把 `feizhuicu` 的 AI 前处理、模型调用、schema 校验、ASR 后处理和前端调用编排迁入当前设计稿。

## 迁移策略

- 运行时 AI 层以 `features/ai` 为迁移单元。
- API route 保持 `feizhuicu` 的 response envelope：`{ ok: true, data }` / `{ ok: false, error }`。
- 账号、数据库、AI 日志不迁移；`features/ai/server/persistence.ts` 在本项目中使用 noop 实现。
- prompt 文档引用指向当前项目 `docs/workstreams/ai-capability-migration/AI-requirement`。
- 评测开发台不迁入运行时代码；eval 内容资产保留在 `AI-requirement/evals`。

## 服务端接口

| 接口 | 能力 | 说明 |
| --- | --- | --- |
| `/api/ai/word-lookup` | AI 查词 | 使用原项目 prompt/schema，输出 `definition`、`contextExplanationZh` |
| `/api/ai/opi/transcribe` | 语音转写 | 上传 audio blob，返回 `transcript`、`rawTranscript`、`hintsVersion` |
| `/api/ai/grammar-review` | 语法纠错 | grammar-only，供陆空通话和故事复诵使用 |
| `/api/ai/opi/grammar-review` | OPI 表达分析 | 先语法纠错，再串联 polish |
| `/api/ai/opi/polish` | 单独润色 | 保留原项目能力 |

## 前端接入

| UI 位置 | 接入方式 |
| --- | --- |
| 查词弹层 | 保留入口，内容改为 `AI 查词 / 释义 / 本句理解` |
| 点击文本 | `InteractiveText` 回传当前词所在句子 |
| 录音按钮 | 使用 MediaRecorder 采集 audio blob 并调用 ASR |
| 我的回答按钮 | 保持原位置，按模块显示 `对比原文`、`检查语法`、`分析表达` |
| 我的回答区域 | 展示 AI 对比、纠错、表达分析结果 |

## 模块映射

| 当前题库 | AI module | 我的回答 AI 动作 |
| --- | --- | --- |
| `sentences900` | `sentence900` | 对比原文 |
| `radiotelephony` | `atc` | 检查语法 |
| `opi` | `opi` | 分析表达 |
| `storytelling` | `story` | 检查语法 |
| `listening` | `listening` | 只保留查词 |

## 验收

- `pnpm exec tsc --noEmit` 通过。
- `pnpm build` 通过。
- localhost 可打开学习页。
- 无 key 时显示明确 AI 不可用提示；有 `DASHSCOPE_API_KEY` 时可真实调用 AI。
