# 第二阶段技术方案：真实产品能力与内部测试

状态：讨论稿，待确认

更新时间：2026-07-11

## 1. 方案结论

在现有 React Native App 后接统一的 TypeScript 业务后端、自托管 Supabase Auth/PostgreSQL/Storage 和外部 AI 服务。客户端保留第一阶段页面与学习交互，通过可替换的认证、API、资源、同步和 AI adapter 将 Mock 能力逐步替换为真实能力。

Web 只提供功能效果、Prompt、schema、领域知识和异常规则参考，不迁移其 UI、浏览器代码或服务端实现。

`战略/第二阶段A-题库云端接入与数据同步/` 已于 2026-07-12 完成。该切片复用本方案的 Supabase、后端、资源和同步边界，只延期微信、手机号、匿名 Auth、AI、权益和公网正式环境，不覆盖完整第二阶段结论。

## 2. 总体结构

```text
React Native App
  -> Supabase SDK：Auth、必要的 Storage 能力
  -> 项目业务 API：题库、学习同步、AI、额度、权益

TypeScript 模块化单体
  -> Drizzle -> Supabase PostgreSQL
  -> Supabase Auth / Storage
  -> AI Gateway -> 外部模型 API
```

- App 不直接读写业务表，也不直连模型供应商。
- 业务后端负责鉴权、业务规则、同步、资源授权、AI 编排、额度和成本记录。
- MVP 继续使用单 ECS、模块化单体且不部署 Redis。
- 后端代码与移动端保持隔离，具体仓库或 workspace 布局在执行阶段确定，不移动现有 RN 源码。

## 3. 后端基础

- 默认采用 NestJS + Fastify Adapter；若流式上传、依赖兼容或维护成本证明不合适，可在不改变 TypeScript、Supabase 和单 ECS 边界的前提下调整。
- 使用 Drizzle 访问业务表，所有数据库变化通过版本化 SQL Migration。
- 建立统一请求 ID、错误码、结构化日志、健康检查、超时、重试和环境配置校验。
- 密钥、服务端 Supabase 凭证、短信/邮件凭证和模型密钥只存在于服务端环境。

## 4. 登录与会话

- 匿名游客、邮箱和手机号由 Supabase Auth 承担；手机号发送通过可替换的短信 provider/hook，邮箱通过受控 SMTP 或邮件 provider。
- 微信登录先做自托管 Supabase Auth 兼容性验证。Supabase 仍是用户与会话权威；若无法在不维护平行账号系统的前提下稳定接入，必须暂停并返回架构决策。
- 客户端通过统一 `AuthService` 使用认证能力，页面不直接散落 Supabase SDK 调用。
- 会话使用 `expo-secure-store` 适配 iOS Keychain/Android Keystore；只保存必要令牌，处理原生容量错误、失效、刷新和退出清理。
- 游客升级由服务端幂等执行：绑定正式身份后迁移或归属原游客数据，重复请求不能复制或丢失记录。
- 第二阶段不实现真实账号注销；现有注销演示入口应隐藏或明确标记为内部测试不可用。

## 5. 数据模型与同步

至少建立以下业务语义：

- 用户资料与账号绑定状态。
- 题库版本、题目稳定 ID 与资源元数据。
- 卡片学习状态：进度、作答、标签、高亮和笔记。
- 学习记录与报告。
- AI 数据同意版本、额度、调用记录和成本。
- 权益定义与用户权益快照。

同步采用在线优先的轻量方案：

- 客户端为本地变更生成稳定 ID、更新时间和待同步状态。
- 学习记录追加写入并按 ID 去重。
- 已学习进度默认单调合并；显式重置必须作为独立操作。
- 作答、笔记、高亮和标签按记录版本处理，旧版本不得覆盖新版本。
- 服务端返回权威版本，客户端确认后清除待同步标记。
- 弱网或失败时保留本地变更并自动重试，不建设复杂的长期离线冲突系统。

现有 SQLite 数据必须通过版本化迁移进入新结构，不直接清空或覆盖。

## 6. 题库与资源

- 以当前 5 套题库、4947 张卡片和规范音频索引为导入基线，原始 JSON 作为可追溯导入源归档。
- 内容工程分为三层：维护层按题库/话题拆分并共用 schema，发布层统一生成版本、checksum、manifest 和变更报告，运行层保持统一 `QuestionBankRepository`、业务 API、资源 adapter 和学习页面；不得演变成五套业务代码。
- 题库结构化数据进入 PostgreSQL；音频、图片等文件进入 Supabase Storage，业务表只保存 object key 和元数据。
- 通过可重复执行的导入与校验流程检查数量、稳定 ID、资源引用、重复项和缺失文件。
- RN 的 `QuestionBankRepository` 扩展为远程实现；迁移期间保留嵌入式实现作为可控回退，不让页面绑定具体数据源。
- `resource-service` 改由业务 API/资源 adapter 获取稳定地址或短期签名地址，并支持版本、缓存、失效和重试。
- 不把完整音频库打入安装包，不提供资源包下载或完整离线学习。

## 7. AI 能力

AI Gateway 按能力重建，不复制 Web 代码：

- AI 查词：词/短语、当前句子和模块上下文。
- 语音转写：录音、ASR hints、航空热词和转写规范化。
- 900句对比原文：客户端或共享纯函数本地执行，不调用模型。
- 语法检查：陆空通话和故事复诵。
- OPI 分析表达：先语法纠错，再表达润色。

实现要求：

- `docs/AI-requirement/` 是规则、领域内容和 eval 的当前项目标准来源。
- 每个能力有版本化输入、输出 schema、Prompt、错误码和 eval 样本。
- 模型 provider 可替换；页面和业务 API 不依赖供应商字段。
- 原始录音通过受控临时流程发送，转写结束后不在项目服务器长期保存。
- 模型失败、超时、限流、额度不足和输出校验失败均返回稳定状态，不以 Mock 结果冒充真实结果。
- AI 模考评分继续明确标记为 Mock；本阶段不新增真实 ICAO 评分或等级判定。

## 8. AI 同意、额度与成本

- 首次 AI 处理前记录同意版本、时间和范围；撤回后 AI Gateway 拒绝新请求，非 AI 学习不受影响。
- 每日额度、分钟频率、并发语音、单用户成本和全局成本均由服务端校验。
- 额度只在有效结果完成后扣除；请求尝试和供应商实际成本仍单独记录，防止失败重试掩盖支出。
- 额度与成本使用 PostgreSQL 事务保证一致性；单 ECS 阶段不为此引入 Redis。
- 管理员测试额度通过受控配置或后台接口调整，不在客户端提供任意修改能力。

## 9. 商业化预留

- 建立权益定义、用户权益快照和 AI 额度映射，使页面只读取统一 entitlement 结果。
- 预留购买恢复、退款和权益失效状态，不接 StoreKit、Google Play Billing、订阅 SDK 或真实支付。
- 所有内部测试权益必须标识为测试数据，不展示可购买文案。

## 10. 客户端改造原则

- 复用现有页面、导航、设计令牌、题库 repository、learning store、resource service 和录音组件。
- 只新增真实能力需要的微信入口、同意弹层、同步状态、AI 结果与额度状态，不重新设计页面。
- API 调用使用统一 client、超时、取消、错误映射和认证头，不在组件中直接拼请求。
- 当前 Mock 文案和演示动作在真实能力接入后必须移除或保留清楚的测试标识。

## 11. 验证方案

- RN：`pnpm check`、Expo Doctor、iOS Development Build、iOS 模拟器与物理 iPhone核心链路。
- 后端：类型检查、单元测试、API 集成测试、Migration 空库/升级测试和权限测试。
- 数据：题库数量、稳定 ID、字段、资源引用、object key 和导入幂等校验。
- 认证：游客、手机号、邮箱、微信、会话恢复、失效、退出和游客升级。
- 同步：重新安装/第二个 iOS 会话恢复、弱网重试、重复提交和版本冲突。
- AI：五类能力的成功、失败、超时、同意、撤回、额度和成本上限；使用标准 eval 样本回归。
- 第二阶段不运行 Android 构建、模拟器或真机验收，最终报告必须明确该限制。

## 12. 不采用的方案

- 不让 RN 直接访问业务表、模型 API 或服务端密钥。
- 不复制 Web 组件、Route Handler 或浏览器媒体实现。
- 不为微信另建独立用户与会话系统。
- 不用完整覆盖同步替代版本控制，不清空现有本地学习数据。
- 不把 560 MB 级音频资源打进安装包。
- 不提前接支付、完整离线、Redis、微服务或真实 AI 评分。

## 13. 进入技术盘点后的结论

本方案可以基于现有 RN adapter 边界实施。微信与自托管 Supabase Auth 的兼容路径、短信/邮件 provider、正式 Bundle ID、ECS/域名/HTTPS、对象存储和 AI 凭证属于执行前置条件，必须在路线图第一阶段先验证。

参考：

- Expo SDK 55：https://docs.expo.dev/versions/v55.0.0/
- Expo SecureStore：https://docs.expo.dev/versions/v55.0.0/sdk/securestore/
- Supabase 自托管 Auth：https://supabase.com/docs/guides/self-hosting/auth/config
- Supabase 自托管 OAuth provider：https://supabase.com/docs/guides/self-hosting/self-hosted-oauth
