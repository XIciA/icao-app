# 历史归档：第二阶段 B 执行记录

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

## 2026-07-12 缺陷修复与运行边界调整

- 修复查词状态确定性 Bug：查词模式不再被随后执行的“关闭划线模式”回调清空，工具状态改为显式设置与显式清除。
- 录音完成后自动提交 ASR；以录音 URI 和时长组成幂等键，每段新录音只自动触发一次，失败后可手动重试。
- AI API 改为可选鉴权，游客无需令牌即可使用；携带非法或过期令牌仍返回 401，其他账号、同步和资源路由继续要求登录。
- 当前阶段关闭产品额度、频率和 ASR 并发限制；使用流水继续记录计量与必要成本，游客流水的 `user_id` 为空，个人学习结果仍与使用流水分离。
- ECS 已先完成数据库与源码备份，再应用 `ai_usage_logs.user_id` 可空迁移并替换 API；容器健康检查通过。
- 真实游客链路通过：查词、缓存复用、真实音频转写、语法检查、OPI 语法与润色；共核对 5 条游客成功流水。
- 额外使用 Expo 模拟器实际生成的 PCM WAV 通过游客转写接口，返回 `Can you tell me the fuel quantity?`，确认 App 录音格式可被真实 ASR 接受。
- 已登录测试账号完整链路继续通过：6 条成功流水，额度表无新增记录；测试账号与临时音频已清理。
- 本地 `pnpm check` 通过：20 个 App 测试套件/44 个测试，API 6 个测试、TypeScript、lint、contracts 和生产构建全部通过。
- iPhone 16e 模拟器 Development Build 通过（0 error、3 条既有警告），页面已渲染“松开结束录音后将自动提交 AI 转写”提示；证据见 `docs/records/evidence/ui-screenshots/2026-07-12/phase2b-fixes/launch.png`。

## 2026-07-12 录音生命周期确定性修复

- 根因证据：模拟器故障文件实际仅 `0.095625` 秒；真机最近三份故障 WAV 均为 4096 字节、0 audio bytes。界面此前只校验录音计时器，没有校验磁盘文件。
- 按 `配置播放/录音模式 -> 等待音频路由稳定 -> prepare -> recording -> stop/finalize -> 恢复播放模式 -> 文件落盘校验 -> 播放器真实时长校验 -> 自动转写` 重构录音闭环。
- 移除 `prepare` 后强制 `setInput` 再立即录音的路由竞态，改为系统稳定输入；松手、切后台和组件卸载均通过 generation/phase 门禁收口。
- 录音停止后等待文件大小稳定；4 KB 文件头、0.09 秒 priming 文件和明显低于计时时长的文件会被拒绝并清理，不进入回放、学习状态或 AI 转写。
- `useAudioPlayer(uri)` 作为唯一播放器装载入口，删除重复 `replace(uri)`；播放器 4 秒未 ready、文件不可读或真实时长不足 400ms 时进入明确错误状态。
- 只有播放器确认真实可播放时长后才调用 `onRecorded`，因此自动转写只消费通过文件与播放双重校验的录音。
- 新增回归覆盖：权限/prepare 生命周期取消、有效文件延迟发布、真实播放器时长覆盖计时器、4 KB 纯文件头拒绝与删除。
- `pnpm check` 通过：20 个 App 测试套件/46 个测试，API 6 个测试、TypeScript、lint、contracts 和生产构建全部通过。
- iPhone 16e 模拟器和 iPhone 17 Pro Max 真机 Development Build 均构建成功（0 error、3 条既有警告）；模拟器已渲染新状态，真机安装成功。
