# 历史归档：第二阶段 B 技术盘点——AI 能力迁移与内部验证

状态：已完成

盘点日期：2026-07-12

## 1. 盘点结论

第二阶段 A 已提供可复用的真实账号、业务 API、PostgreSQL、题库/资源和学习记录同步基础。RN 也已具备查词入口、可编辑“我的回答”、WAV 录音和本地回放。

但 `icao-app` 当前没有 AI 共享 contract、AI 后端模块、provider、Prompt 运行层、ASR 上传、AI 数据表、同意/额度/成本门禁或真实 RN 结果接入。所有 AI 页面效果仍需在本阶段实现。

## 2. 工作区与版本

- 分支：`main`，开始盘点时与 `origin/main` 同轨。
- 当前工作区只有第二阶段 B 需求文档改动，未发现与将来 AI 代码写入冲突的并行改动。
- 客户端：Expo `~55.0.27`、React Native `0.83.6`、TypeScript `~5.9.2`、`expo-audio ~55.0.15`、`expo-sqlite ~55.0.17`。
- 后端：NestJS `11.1.28` + Fastify `5.10.0` + Drizzle `0.45.2` + PostgreSQL/Supabase。
- 验证入口已统一为 `pnpm check`、`pnpm doctor` 和 iOS Development Build。

## 3. RN 已有能力

### 3.1 查词入口

- `InteractiveStudyText.tsx` 已能取得选中单词和所在句子。
- `QuestionBankStudyScreen.tsx` 已在五套题库学习卡中打开“AI 查词” Bottom Sheet，但当前明确显示“功能待接入”并不调用 API。
- 当前无 RN 查词缓存、请求状态或结果 schema。

### 3.2 录音与“我的回答”

- `SpeakingPracticePanel.tsx` 已使用 `expo-audio` 完成权限、录音、停止、回放、重录、切后台中断和错误状态。
- iOS 录音为 16 kHz、16-bit、单声道 PCM WAV，与当前百炼 `qwen3-asr-flash` 支持格式一致。
- `StudyWorkbench.tsx` 已有可编辑多行“我的回答”，但当前转写仍是 placeholder；语法检查和 OPI 分析也只返回占位文案。
- 当前 900 句对比只做简单规范化后字符串相等判断，没有缺失/多余/替换/顺序问题结构。

### 3.3 本地与同步

- `learning-store.ts` 已保存本地学习状态与最近 100 条学习记录，并通过 `learning-sync.ts` 上传到已有 `learning_records`。
- `LearningRecord` 目前只表示学习会话报告，没有 AI 结果变体。
- 已有 sync mutation payload 是可扩展 JSON，可以在不新建独立 AI 历史页的前提下复用当前同步链路。

## 4. 后端与数据库现状

- `@icao/contracts` 只包含健康、认证、题库、资源与同步 contract，无 AI 请求/响应、额度或错误定义。
- `AppModule` 目前只注册 Health/Auth/QuestionBank/Resource/Sync，无 AI module。
- API 已有 Supabase token 验证、统一 request ID/错误 envelope、配置门禁、日志、Migration 和测试结构，可直接复用。
- Fastify 当前全局 `bodyLimit` 为 2 MB，无 multipart 依赖；2 分钟 16 kHz 单声道 16-bit PCM 约 3.84 MB，因此 ASR 上传链路必须单独解决。
- 数据库当前有 profiles、question bank release/resource、card state、learning record、sync mutation/document/change 等 8 张 public 业务表，无 AI 使用流水、同意、额度或成本表。
- `.env.example` 无 AI provider/model/key 配置，API config schema 也会忽略 AI 参数。

## 5. Web AI 标准库

- 已验证的五能力目录为 `word-lookup / transcribe / exact-match-check / grammar-review / polish`。
- Web 已有分能力 types、schema、prompt、provider、统一错误和 prompt registry，可作为行为对照。
- `transcribe` 已返回 `rawTranscript` + 保守规范化 `transcript` + `hintsVersion`。
- `exact-match-check` 已是本地纯函数，可报告 missing/extra/replacement/order。
- 查词使用 session cache，键包含模型、模块、句子和查询词。
- Web 路由当前会对登录用户自动保存转写/纠错/润色结果，与第二阶段 B “用户主动保存”不同，不能原样复制。
- Web 存在 AI 评测页、模型选择和未实现的 `opi/rewrite-answer`；这三项已被需求明确排除。

## 6. AI 内容资产

- `docs/ai/` 是能力规范入口；运行时基础资产仅保留查词与 ASR 所需内容。本阶段不开发 eval 运行器或人工抽查功能。
- 民航资产已覆盖术语、热词、数字/字母读法、短语、典型错误与 900 句语料，具备稳定 ID 与 `hint-only` 边界。
- 当前 RN/API 没有资产编译产物、选择器或版本加载器，需在 B1 建立。

## 7. 密钥与外部条件

- 用户已明确授权从 `/Users/zhouyide/Desktop/icao项目/feizhuicu/.env.local` 查询并使用模型密钥。
- 盘点确认该文件存在，但也被 `feizhuicu` Git 跟踪，这是源项目的密钥管理风险。本阶段不修改只读源项目，但不得将该文件或密钥复制进 `icao-app` Git。
- 小流程只能在本机私密环境与 ECS 受限环境写入密钥，工具输出必须避免打印值。
- 最终验收要求真实查词、转写、语法检查和润色可直接使用，密钥缺失/失效不能作为“完成”结论。

## 8. 主要风险与回滚点

| 风险 | 影响 | 控制/回滚 |
| --- | --- | --- |
| 音频文件超过 2 MB | 请求在进入 AI 前失败 | ASR 专用 multipart 门禁，保留旧本地录音流程 |
| 模型可用性/版本变动 | 输出或成本漂移 | B0 真实冒烟后锁定快照，provider 可替换 |
| 转写规范化越界 | 用户错误被“修正” | 保留 `rawTranscript`，规则白名单，`hint-only` 不自动替换 |
| 自动保存泄漏用户内容 | 违背已确认需求 | 只在明确保存动作创建学习记录 |
| 使用流水失控 | 隐私或额度绕过 | 最小字段、原子门禁、无全文/音频 |
| 临时录音残留 | 存储与隐私风险 | `finally` 删除 + 超时清理 + 无 Storage 上传 |
| AI 改动破坏第二阶段 A | 题库/同步回归 | 保留原 repository、学习 store 语义和本地录音回退路径 |

## 9. 实施前必须固定的事项

- 在 B0 中以不打印密钥的方式验证百炼文本与 ASR 真实调用，锁定中国地域、模型快照和计价配置。
- 路线图必须先完成同意、限额、成本和使用流水，再把真实 AI 开放到学习卡。
- 目前无需因公司主体、域名或 ICP 备案暂停内部开发；仍严禁对公网开放。
