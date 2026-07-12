# 第二阶段 B 执行记录

状态：已完成

完成日期：2026-07-12

## B0：资产与真实模型门禁

- 从只读标准库原样迁入 `capabilities/`、`domain/`、`shared/` 共 16 份运行资产；未迁入 eval 页面或样本运行器。
- SHA-256 清单锁定全部文件，并校验 229 个稳定 ID 无重复。
- 密钥从已授权的 `feizhuicu/.env.local` 读取并只写入 ECS `600` 权限环境文件；仓库、日志和文档均未保存密钥值。
- `qwen-turbo` JSON mode 与 `qwen3-asr-flash` 真实短音频冒烟通过。

## B1-B2：后端、数据与安全门禁

- 建立共享 AI contract、NestJS AI Module、百炼文本/ASR Provider、结构化 JSON 白名单和版本化 Prompt/hints。
- 新增 `ai_consents`、`ai_usage_logs`、`ai_quota_buckets`、`ai_word_cache`；Migration 已在 ECS 应用，4 表均绑定 `auth.users`、启用 RLS 并撤销客户端直读权限。
- 实现明确同意/撤回、北京日额度、每分钟 10 次限制、单用户 ASR 并发锁、超时和取消向上传递。
- 失败、超时、取消和限制不增加功能额度；成功后才原子增加额度。流水仅记录能力、状态、模型、版本、耗时、额度、token/必要成本字段，不记录音频、Prompt 或用户全文。
- ASR 使用受限 multipart 内存流，单文件上限 8 MiB，不写临时目录、不上传 Storage；请求结束后没有服务端音频文件可残留。

## B3-B6：五项 AI 学习能力

- 五库 `InteractiveStudyText` 已接真实 AI 查词，展示“释义/本句理解”；App 会话缓存与用户级后端缓存同时生效，后端键包含模块、词、句子、Prompt 和模型版本。
- 900 句、陆空通话、OPI、故事复诵录音可主动提交真实转写；只读 `rawTranscript` 与可编辑规范化文本分离。
- 900 句使用本地确定性 token/LCS diff，覆盖一致、缺失、多余、替换和顺序问题，不调用模型、不评分。
- 陆空通话和故事复诵接 grammar-only；OPI 使用 grammar -> polish 分步组合，润色失败后保留语法结果，可仅重试后一步。
- 独立 `/v1/ai/polish` 能力接口已实现但没有独立学习入口；未实现评分、等级、发音/流利度、标准答案或 rewrite-answer。

## B7：主动保存与同步

- 转写、纠错、润色只在用户点击“保存到学习记录”后写入现有 LearningRecord 和 outbox。
- AI 记录包含题库/题目、`rawTranscript`、用户确认文本、语法和润色结果，不包含原始音频。
- 相同卡片和相同结果使用稳定记录 ID，重复保存覆盖同一记录；现有学习记录页直接展示，不新增 AI 历史页。
- AI 使用流水独立存储，不进入用户学习历史。

## B8：真实验收

- ECS 真实测试账号完整通过：查词、缓存不扣额、真实音频转写、语法检查、独立润色、OPI 语法+润色。
- 核对结果：6 条成功使用流水、12 单位额度；重复查词没有新增流水或额度。验证后测试账号级联删除，临时测试音频删除。
- API 容器健康为 `healthy`；Migration 后 AI 表数量 4。
- `pnpm check` 通过：19 个 App 测试套件/41 个测试、API 5 个测试、TypeScript、lint、contracts 和构建全部通过。
- Expo Doctor 19/19；iOS 模拟器和物理 iPhone 17 Pro Max Development Build 均 0 error、3 条既有依赖警告；物理机已安装 `com.anonymous.icao-app`。
- 模拟器通过安全隧道加载最新 bundle，题库/900 句页面渲染正常；未开放公网端口。

## 边界结论

- 第二阶段 B 范围内没有 Mock 成功、缺密钥降级或“AI 功能待接入”入口。
- Android、正式域名/HTTPS、ICP备案、支付、公开运营、ICAO 评分和内部模型评测工具仍不属于本阶段。
