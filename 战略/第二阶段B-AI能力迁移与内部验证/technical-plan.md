# 第二阶段 B 技术方案：AI 能力迁移与内部验证

状态：已确认

更新日期：2026-07-12

## 1. 方案结论

不复制 Web 代码，而是将 Web 标准库的五项能力、Prompt、输出 contract 和民航资产重新落到现有 React Native + NestJS + Drizzle 架构中。

```text
React Native 学习卡
  -> @icao/contracts 版本化请求/结果
  -> NestJS AI Module
       -> 同意 / 限额 / 并发 / 成本门禁
       -> TextProvider / AsrProvider
       -> Prompt + 民航资产选择
       -> 结构校验 / 使用流水
  -> 阿里云百炼文本 / ASR API
```

900 句原文比对在客户端使用确定性规则完成，不经过模型。已成功的 AI 文本只在用户点击“保存”后进入现有学习记录与同步链路；AI 使用流水单独存储。

## 2. 能力分层

| 能力 | 运行位置 | 核心结果 |
| --- | --- | --- |
| `word-lookup` | 服务端文本模型 | `definition`, `contextExplanationZh`, `promptVersion` |
| `transcribe` | 服务端 ASR + 保守规范化 | `rawTranscript`, `transcript`, `hintsVersion` |
| `exact-match-check` | RN 本地纯函数 | 一致性、缺失/多余/替换/顺序问题 |
| `grammar-review` | 服务端文本模型 | `issues`, `correctedText`, `promptVersion` |
| `polish` | 服务端文本模型 | `polishedText`, `promptVersion`, 警告 |

- OPI “分析表达”组合 `grammar-review -> polish`，但 `polish` 仍保持独立服务能力，不新增独立产品入口。
- 链式请求每步有独立状态和结果，后续失败时不重跑已成功步骤。
- 所有结果结构先进入共享 contract，再分别由服务端 Zod 与客户端解析验证。

## 3. 民航语言资产

- `docs/ai/` 继续是人工可读的权威来源；运行时基础资产的稳定 ID 和含义不变。
- 建立确定性的资产编译/校验流程，生成供后端运行的版本化结构数据；生成物不作为手工编辑源。
- 运行时按能力、题库、题目上下文和长度上限选择相关术语、读法、短语和错误边界，不全量塞入每个 Prompt。
- `hint-only` 资产只进入提示或候选；确定性规范化只处理高置信的缩写、数字、航向、跑道、QNH 等场景。
- Prompt、hints 和运行资产都带版本号，使用流水记录版本而不记录完整 Prompt。

## 4. 模型供应商

- 默认沿用 Web 已验证的阿里云百炼，文本和 ASR 分别通过可替换 provider adapter 访问。
- 文本能力使用 OpenAI-compatible Chat Completions JSON mode，但 JSON mode 只保证可解析 JSON，仍必须执行字段白名单、类型与禁止字段校验。
- ASR 默认使用经实测确认的 `qwen3-asr-flash` 快照版；它支持 WAV/Base64/本地文件，官方上限为 10 MB/5 分钟，覆盖本项目 2 分钟上限。
- 模型 ID、地域、价格表和 API 基址只在服务端配置；小流程 B0 实测后锁定具体快照，不在用户界面暴露模型选择。
- 已授权从 `/Users/zhouyide/Desktop/icao项目/feizhuicu/.env.local` 读取现有模型配置和密钥。执行时只将必要值安全写入 `icao-app` 本地或 ECS 受限环境，不输出、不复制进文档或 Git。

## 5. 录音上传与清理

- 继续使用已验证的 `expo-audio` 16 kHz 单声道 PCM WAV，不重写录音器。
- 使用 Expo SDK 55 `File` + `expo/fetch`/`FormData` 上传本地 URI，不使用已废弃的 legacy `uploadAsync`。
- API 使用受限 multipart 单文件流。当前 Fastify 2 MB body limit 不足以容纳 2 分钟 PCM WAV，实现时仅对 ASR 路由开放不高于 10 MB 的文件门禁，不放大其他 JSON 路由。
- 后端流式写入受限临时目录，校验 MIME、扩展名、实际大小、时长和用户并发门禁后调用 ASR。
- 临时文件在成功、失败、取消的 `finally` 中删除，并增加超时清理作为异常退出保险；不上传 Supabase Storage。
- 客户端保留本地文件用于回放和重试，重录、离开学习会话或用户主动清理时释放旧文件。

## 6. 客户端交互与状态

- 在现有 `InteractiveStudyText` 的 `onLookup` 和查词 Bottom Sheet 后接真实服务。查词使用“模块 + 句子 + 词/短语 + Prompt/模型版本”作为应用会话缓存键；命中不发新请求、不扣额度。
- `SpeakingPracticePanel` 继续负责录音和本地回放；新的 AI 会话状态负责上传、转写、编辑文本、对比/纠错/润色、重试和保存。
- `rawTranscript` 只读保留；规范化文本进入现有“我的回答”可编辑区，后续能力使用用户当前确认文本。
- 使用每张卡片独立的状态机/状态容器保留中间结果，切题时不串结果，后续步骤失败只重试该步。
- “保存”是单独用户操作，完成后生成 AI 学习记录；没有自动保存，也不增加独立 AI 历史页。

## 7. 数据与同步

### 7.1 AI 使用流水

- 新增 `ai_usage_logs`，请求进入时建立记录，结束时更新为成功、失败、超时、取消或被限制。
- 仅保存 user ID（可空扩展）、能力、状态、provider/model、Prompt/hints 版本、耗时、token/音频秒数、估算成本、错误代码和有限错误摘要。
- 不保存音频、用户全文、模型全文、完整 Prompt、IP 或设备指纹。
- 流水写入失败不得伪装调用成功；但计费/限额所需的原子门禁失败时必须拒绝新调用，不允许绕过。

### 7.2 同意、额度与成本

- `ai_consents` 保存用户对当前同意文本版本的接受/撤回时间，服务端在发送外部 AI 前强制检查。
- PostgreSQL 维护北京日界、每分钟频率、成功额度、单用户单语音任务锁和每日成本；MVP 不为此引入 Redis。
- 调用前预检频率/并发/成本，成功后才扣用户功能额度；失败、超时和取消不扣功能额度，但供应商真实发生的成本仍进入成本统计。
- 价格系数版本化并可配置；供应商返回用量时优先使用，否则按 token/音频时长估算。

### 7.3 个人学习结果

- 不照搬 Web 的自动 `AiTextResult` 写入。用户点击保存时，生成现有 `learning_record` 的 AI 结果变体，复用第二阶段 A 的本地保存、outbox、幂等上传和跨会话恢复。
- AI 结果记录保存源题库/题目 ID、`rawTranscript`、用户确认文本、纠错/润色结果、Prompt/hints 版本和时间，不保存原始音频。
- 学习记录页只扩展现有记录类型的展示，不建新 AI 历史页。

## 8. API 与错误 contract

- 建议路由：`/v1/ai/word-lookup`、`/v1/ai/transcribe`、`/v1/ai/grammar-review`、`/v1/ai/polish`、`/v1/ai/consent`、`/v1/ai/quota`。
- 继续使用已有 `{ requestId, data }` / `{ requestId, error }` envelope，不新建第二套响应格式。
- 错误分为：未同意、未认证、请求无效、音频无效、额度不足、频率/并发受限、成本熔断、供应商超时/失败、返回结构无效和内部错误。
- 文本请求与 ASR 使用独立超时；客户端取消向下传递 signal，服务端尽力中止上游并记录取消状态。

## 9. 不采用的方案

- 不让 RN 直连百炼：会泄漏密钥并绕过同意、额度和成本门禁。
- 不复制 Next.js route/component：当前后端是 NestJS，客户端是 React Native，复制会引入不相容边界。
- 不为 ASR 把用户录音上传私有 Storage 再生成 URL：短录音可直接处理，减少清理与泄漏风险。
- 不使用长文件异步 ASR、Redis 队列、RAG、微调或自建模型：两分钟内录音可在当前请求闭环完成。
- 不迁移 Web 的评测页、样本运行器、模型选择或自动结果保存行为。

## 10. 验证方案

- 文档/资产：稳定 ID、重复 ID、引用、生成物一致性和 `hint-only` 边界检查。
- 合约/纯函数：各输入输出 schema、禁止字段、确定性原文比对、规范化、缓存键和错误映射单元测试。
- 后端：provider 假实现的稳定集成测试 + 真实百炼短样例冒烟；Migration、同意、额度、并发、成本、流水和临时文件清理测试。
- 客户端：查词缓存、可编辑转写、中间结果保留、主动保存和失败恢复组件测试。
- 工程：`pnpm check`、`pnpm doctor`、iOS Development Build。
- 真实验收：通过安全隧道在 iOS 模拟器与受控物理 iPhone 完成查词、900 句、陆空通话、OPI 和故事复诵全链路。最终不允许以 Mock、缺密钥或“功能待接入”状态收口。

## 11. 官方依据

- Expo SDK 55 Audio：https://docs.expo.dev/versions/v55.0.0/sdk/audio/
- Expo SDK 55 FileSystem：https://docs.expo.dev/versions/v55.0.0/sdk/filesystem/
- 阿里云百炼 ASR：https://help.aliyun.com/zh/model-studio/asr-model/
- 阿里云百炼结构化输出：https://help.aliyun.com/zh/model-studio/qwen-structured-output
