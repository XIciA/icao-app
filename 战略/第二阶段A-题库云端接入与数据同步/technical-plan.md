# 第二阶段 A 技术方案：题库云端接入与数据同步

状态：已完成

更新时间：2026-07-12

## 1. 方案结论

沿用总架构：React Native 通过 Supabase SDK 处理最小邮箱 Auth，通过统一 TypeScript 业务 API 读取题库、资源授权和同步学习数据。服务端使用 NestJS + Fastify、Drizzle、Supabase PostgreSQL/Storage，全部部署在当前单台 ECS。

第二阶段 A 只缩小交付顺序，不更换认证、数据库、存储或客户端技术方向。

## 2. 工程边界

- RN 工程保持根目录不移动；后端放在独立 workspace，客户端与服务端共享版本化 API contract，不共享页面代码。
- Supabase 使用官方 Docker Compose 配置并固定经过验证的版本组合；不开启非必需的 Logs/Analytics、Realtime 和 Edge Runtime。
- Migration 是数据库结构唯一变更入口；不依赖 Studio 手工改表，不将生产密钥写入 Git。
- ECS 上的运行配置和持久化目录与仓库代码分离，部署文件可审查，密钥只存在于服务器受限环境文件。

## 3. 后端基础

- 建立健康检查、请求 ID、统一错误 envelope、配置校验、结构化日志、超时和测试结构。
- App 只持有 Supabase 公开 URL、publishable key 和业务 API 地址；后端持有数据库连接与服务端密钥。
- 业务 API 校验 Supabase access token，并以 token 中的用户 ID 作为数据归属依据。
- Postgres、Storage、Studio 和内部服务端口不直接暴露公网；无正式 HTTPS 时通过 SSH 隧道验证。

## 4. 邮箱账号

- 客户端通过统一 `AuthService` 调用 Supabase Auth，不让页面直接依赖 SDK。
- 会话令牌使用 `expo-secure-store` 保存，处理恢复、刷新、失效和退出清理。
- 第二阶段 A 内测环境关闭邮箱确认：用户注册后直接进入账号，避免把 SMTP 引入本子阶段；该账号不证明邮箱归属，只允许受控内测。
- 启用正式 SMTP 前不提供验证邮件、找回密码和换绑邮箱；公开测试前必须重新开启邮箱确认。
- 手机号、微信、Apple 和匿名 Auth adapter 保留接口，不写临时替代账号系统。

## 5. 题库与资源

- 将每套题库作为带版本、checksum 和发布时间的结构化发布记录存入 PostgreSQL，payload 保持现有数据形状，便于 RN repository 无损替换。
- 建立资源清单表，保存 object key、模块、来源路径、大小、MIME、checksum 和状态；文件进入私有 Storage bucket。
- 导入脚本必须可重复执行：相同 checksum 不重复写入，内容变化产生新版本，不覆盖原始导入源。
- 业务 API 提供题库版本、dataset 和短期资源地址；RN 使用 ETag/版本缓存，失败时回退内嵌 repository。
- 不把完整音频库打入 App，也不把带域名的永久 URL 写入业务表。

### 5.1 三层内容工程

统一管理不等于把全部内容长期堆在一个大 JSON，也不等于为五个题库建立五套代码。

```text
维护层：按题库、话题拆分源文件
  -> 发布层：统一校验、版本、checksum、manifest、变更报告
    -> 运行层：统一 Repository、API、缓存和学习页面
```

建议维护目录：

```text
content/question-banks/
├── registry.json
├── schema/
├── banks/<bankId>/
│   ├── bank.json
│   └── topics/*.json
├── resources/manifest.source.json
└── scripts/
```

统一生成的发布产物：

```text
dist/question-bank-release/
├── manifest.json
└── banks/<bankId>.json
```

- 现有 `question-bank.json` 和 `audio-index.json` 作为首版可追溯输入与内嵌回退基线，不直接删除或覆盖。
- 维护源使用统一 schema；发布脚本验证 ID 唯一性、声明数量、字段、资源引用、选项答案、checksum 和兼容性。
- 发布 manifest 记录 schema version、release version、bank version、发布时间、checksum、数量和资源版本。
- 资源运行清单只保留稳定 object key、bank/module、MIME、大小、checksum 和状态；本机绝对来源路径只允许存在于导入审计记录。
- 题库差异使用 `capabilities`/学习配置表达，逐步移除按 `bankId` 写死的复习、生成音频、广播和模考判断。
- 稳定 ID 一经发布不得重编号、复用或因目录调整而变化；删除使用停用/撤回状态，不把旧 ID 分配给新内容。
- RN 只消费发布 contract；维护目录拆分不能改变现有三卡学习页、路由或学习数据定位方式。

## 6. 学习数据与同步

服务端至少建立：

- `profiles`：业务用户资料和创建状态。
- `user_card_states`：题库、话题、卡片、学习状态、版本和更新时间。
- `learning_records`：追加式学习记录，以客户端稳定 ID 去重。
- `sync_mutations`：记录幂等请求和处理结果。

同步规则：

- 客户端把现有学习存储升级为版本化结构，并增加稳定记录 ID、账号归属、更新时间和 outbox。
- 首次登录前先保留快照，再由用户确认把未归属本地数据合并到当前账号；同一批次重复执行不得重复写入。
- 进度采用单调合并；学习记录按稳定 ID 去重；笔记、高亮、标签和作答按版本比较，旧版本不得覆盖新版本。
- 推送成功后再清除 outbox；拉取使用服务端 cursor，失败或部分成功不删除本地数据。
- 不实现复杂的长期离线编辑、跨账号自动合并或后台常驻同步。

## 7. 后续能力预留

- `AuthService` 以 provider-neutral session/user contract 工作，后续新增匿名、手机号、微信或 Apple 时不改学习数据主键。
- `QuestionBankRepository`、`ObjectStorage` 和资源 manifest 不绑定域名或 Supabase 私有字段，后续可迁移 OSS/CDN。
- 同步 API 使用版本化 contract、稳定 mutation ID 和 server cursor，页面不读取表结构。
- 后端按模块化单体保留 AI Gateway、entitlement 和运营模块位置，但本子阶段不生成空壳业务或无用表。

## 8. 备份与恢复

- 题库和资源可由清单重新导入；用户学习数据必须进行数据库备份与恢复演练。
- ECS 内建立轮换备份和校验；异机/云快照副本延期到正式云资源方案，不阻塞本子阶段，但必须作为剩余数据耐久性风险记录。
- 恢复测试使用隔离空库，不以覆盖当前数据库证明恢复能力。

## 9. 验证

- RN：`pnpm check`、Expo Doctor、iOS Development Build 和 iOS 模拟器关键链路。
- 后端：类型、lint、单元测试、API 集成测试、配置缺失测试。
- 数据库：Migration 空库、重复升级、权限与恢复测试。
- 数据：5 库、27 分类、239 话题、4947 卡片、3678 张音频卡片和 3894 个文件对账。
- 内容工程：源文件 schema、全局稳定 ID、命名一致性、发布 manifest、变更报告和生成产物不可手改检查。
- 同步：首次归属、重复提交、旧版本、弱网、退出重登和第二会话恢复。
- Android 不在本子阶段验证。

## 10. 不采用的方案

- 不改用托管 Supabase、Firebase、自建 Auth、MySQL、Redis 或微服务。
- 不让 RN 直接读写业务表、持有 service key 或连接 PostgreSQL。
- 不以覆盖式上传替代版本、幂等和冲突处理。
- 不因微信门禁未解决而仿造微信用户或发放自定义平行会话。
- 不通过公网 HTTP 传输邮箱密码或真实用户 token。
- 不为本子阶段新增域名、备案、SMTP、短信、微信、AI、OSS/CDN 或商店依赖。

## 11. 已确认的方案边界

1. 邮箱注册关闭确认，仅作为受控测试用户归属。
2. 物理 iPhone 公网联调延期到正式域名和 HTTPS 就绪后。
3. 异机/云快照、SMTP、微信等外部依赖均延期，不阻塞题库和同步主线。
4. 云端为权威数据源，App 内嵌题库和本地存储继续作为缓存与受控回退。
5. 首次登录由用户确认是否把本机未归属数据合并到当前账号，不自动跨账号合并。

官方参考：

- Supabase Self-Hosting with Docker：https://supabase.com/docs/guides/self-hosting/docker
- Supabase Password-based Auth：https://supabase.com/docs/guides/auth/passwords
- Expo SecureStore：https://docs.expo.dev/versions/v55.0.0/sdk/securestore/
