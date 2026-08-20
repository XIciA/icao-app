# 历史归档：第二阶段 A 执行记录

## A0：前置条件与边界冻结

状态：已完成

完成日期：2026-07-12

### 完成内容

- 四份大流程文档由用户确认并更新状态。
- 总战略和架构决策补充第二阶段 A 先行切片，未改变完整第二阶段目标。
- 原第二阶段技术方案和路线图增加第二阶段 A 执行入口。
- 确认邮箱关闭验证、iPhone 公网联调延期、异机备份延期、云端权威/本地回退和首次登录确认归属。
- 固定 ECS、端口、凭证、公开配置和延期接口边界。
- 固定 A0 起点：`main` 提交 `6e6a4519eecda00a40eb19dc96d417693623b7be`，启动前工作区干净。

### 关键文件

- `战略/总战略文档.md`
- `战略/architecture-decisions.md`
- `战略/第二阶段A-题库云端接入与数据同步/`
- `infra/phase2a/README.md`
- `.gitignore`

### 明确未做

- 未部署 Supabase、API 或数据库。
- 未导入题库、音频或用户数据。
- 未修改 RN 页面、认证、repository 或 learning store。
- 未开放公网端口或处理延期外部平台。

### 剩余风险

- 当前个人试用 ECS 不满足备案要求，且无受信任 HTTPS。
- 40 GB 磁盘是 Supabase 最低容量，A1 起必须持续检查占用。
- 微信 Auth P0 仍属于完整第二阶段未解决项，不阻塞第二阶段 A。

### 验证结果

- `git diff --check`：通过。
- 第二阶段 A 文档无剩余“待用户确认/待用户审查”状态：通过。
- `.env`、`infra/**/.env`、`services/**/.env` Git 忽略规则：通过。
- 总战略、架构决策、完整第二阶段和第二阶段 A 的入口与延期边界静态检查：通过。

### 阶段判断

A0 范围、环境、凭证门禁和一致性验证均已完成，可以进入 A1。

## 已确认计划变更：A2 内容工程

状态：已确认

- 维护层按题库、话题拆分，便于编辑和审查。
- 发布层统一版本、校验、checksum、manifest 和变更报告。
- 运行层保持统一 Repository、API、缓存和学习页面。
- A2 新增 A2.0 内容工程基线，用户已于 2026-07-12 确认。

## A1：后端与 Supabase 基础

状态：已完成

完成日期：2026-07-12

### 完成内容

- 建立 pnpm workspace、共享 contract、NestJS + Fastify API、Drizzle schema 和测试结构。
- ECS 使用固定 Supabase 官方提交与镜像摘要运行 PostgreSQL、Auth、Storage、Kong、PostgREST 等必要组件；Realtime、Edge Runtime、Logs/Analytics 未启用。
- Supabase、数据库、Pooler 和业务 API 仅绑定 `127.0.0.1`，没有开放公网业务端口。
- 生成并应用首版 Migration；6 张业务表启用 RLS，4 个用户数据外键关联 `auth.users`，匿名/登录角色不能直读业务表。
- 部署 `icao-api`，完成存活、就绪、数据库和未授权错误 envelope 验证。
- 建立 ECS 内每日轮换备份、SHA-256 校验和隔离空库恢复流程。

### 验证结果

- API 类型、lint、测试和构建：通过。
- Migration check、首次应用和重复应用：通过；Drizzle 迁移记录 1 条。
- `/health/live`、`/health/ready`：200；无 token `/v1/me`：401 `missing_bearer_token`。
- Supabase 9 个必要容器与 API：healthy。
- RLS/权限：`anon` 直接查询 `profiles` 被拒绝。
- 备份恢复：checksum 通过，隔离库恢复 6 张 public 表和 23 张 auth 表后自动删除。
- `icao-postgres-backup.timer`：active，每日执行。

### 剩余边界

- API 与 Supabase 仍只允许本机/SSH 隧道访问；无正式域名和 HTTPS 时不做公网 iPhone 联调。
- 备份仍在同一 ECS；异机备份和云快照按已确认计划延期。
- API 镜像仍可在后续优化体积，但不阻塞功能和 A2。

### 阶段判断

A1 验收通过，可以进入 A2.0 内容工程基线。

## A2：真实题库与资源

状态：已完成

完成日期：2026-07-12

### 完成内容

- 建立按题库、分类和话题拆分的维护源、统一 JSON Schema、资源源清单和可重复构建/校验命令。
- 生成统一版本、checksum、manifest 和变更报告；首版与内嵌基线内容差异为 0。
- 将 5 套题库导入 PostgreSQL，将 3894 个音频文件上传至私有 Storage bucket。
- 建立题库列表/版本 API、ETag、短期资源签名、RN 远程 Repository、缓存和内嵌回退。
- 客户端按公开 Supabase 基址规范化签名 URL origin，解决安全隧道中模拟器与宿主机地址不同的问题。

### 验证结果

- 内容全量校验：5 库、27 分类、239 话题、4947 卡片、3678 个音频引用、3894 个资源、579146043 bytes。
- 二次导入：`uploaded=0`、`skipped=3894`，幂等通过。
- 云端：5 个 active release、3894 个资源元数据、3894 个 Storage object。
- API：题库 ETag/304、资源映射、签名地址和缺失鉴别通过。
- iOS 模拟器通过 SSH 隧道实际请求远程听力题库和资源签名接口；学习页显示 245 题和首条 19 秒音频。

### 阶段判断

A2.0 至 A2.3 全部通过，可以进入 A3。

## A3：邮箱密码账号

状态：已完成

完成日期：2026-07-12

### 完成内容

- 建立 provider-neutral `AuthService`，接入 Supabase 邮箱注册、登录、会话恢复、自动刷新和当前设备退出。
- 会话使用 `expo-secure-store` 分块加密保存；App 原生配置加入 SecureStore。
- 登录/注册页面只显示真实邮箱密码能力；手机号、验证码、找回密码、换绑和注销不再伪装为可用功能。
- 账号安全页显示真实会话邮箱，退出登录清理本机会话。

### 验证结果

- ECS 真实验证：注册立即获得会话、正确密码登录、错误密码拒绝、`/v1/me` 用户归属一致。
- 测试账号由验证脚本清理，线上未留下测试用户。
- SecureStore 大会话分块、缩短后清理旧分块和退出删除测试通过。
- iOS Development Build 中 `ExpoSecureStore` 成功编译和链接。

### 阶段判断

A3 邮箱账号闭环通过，可以进入 A4。

## A4：学习数据同步与收口

状态：已完成

完成日期：2026-07-12

### 完成内容

- 数据库增加 `sync_changes` 和 `user_documents`；共 8 张 public 业务表、3 条 Drizzle Migration，用户数据均关联 `auth.users` 并启用权限门禁。
- 客户端增加 v3 账号归属、绑定前快照、稳定 mutation、版本、outbox、重试、server cursor 和同步状态页。
- 首次发现未归属本机数据时必须由用户确认；拒绝后保留本地数据且不自动跨账号合并。
- 同步覆盖卡片进度/作答、学习记录/报告，以及完整标注、高亮、标签和笔记文档。
- 服务端实现幂等 push、分页 pull、追加式记录去重、文档/作答版本冲突和进度单调合并。
- 推送或拉取失败保留本地数据与 outbox；回到前台和后续写入会继续尝试。

### 验证结果

- 真实双会话：第二会话恢复卡片状态、学习记录和标注文档 3 类变更；其新版本被第一会话增量恢复。
- 重复提交返回 `duplicate`；旧版本返回 `conflict`，不能覆盖较新笔记。
- 弱网单元测试确认 outbox 和本地状态保留。
- 含用户数据的 ECS 备份在隔离库恢复：卡片状态 1、学习记录 1、标注文档 1、同步变更 4；恢复库含 8 张 public 表和 23 张 auth 表，测试后自动删除。
- `icao-postgres-backup.timer` active；服务器清理构建缓存后系统盘占用 37%。
- `pnpm check`：18 个 Jest 套件、37 个测试，以及客户端/contract/API 类型、lint、API 5 个测试和构建全部通过。
- 全量内容校验通过；Expo Doctor 19/19；iOS Development Build 0 error 并成功安装运行。
- Android 未执行，符合本阶段边界。

### 阶段判断

第二阶段 A 的 A0 至 A4 已全部完成。未完成项均属于完整第二阶段或商业化后续，不构成本切片缺口。

## 收口后修复：iOS 云端启动与音频超时

状态：已完成

完成日期：2026-07-12

- 新增 `pnpm ios:phase2a`：自动检测 Mac 局域网地址、建立 API/Storage SSH 隧道、从 ECS 读取 publishable key、注入公开客户端配置并启动已安装的 iOS Development Build。
- 新增 `pnpm ios:phase2a:build`：在相同环境下重新构建并启动 Development Build。
- 脚本退出时自动关闭自己建立的隧道；端口冲突、密钥缺失或 API 未就绪时明确失败，不静默降级。
- 学习页和随身听增加 12 秒音频加载超时；超时后停止缓冲、显示失败状态并允许重试。
- 重试会绕过签名 URL 缓存重新解析资源；缓存 URL 会按当前 Supabase 公开 origin 重写，避免 IP 或隧道变化后继续使用旧地址。
- 真实启动验证命中远程题库与资源 API，音频解析为 19 秒；脚本退出后 3101、8000、8081 端口全部释放。
- `pnpm check` 通过：18 个 Jest 套件、39 个客户端测试、API 5 个测试及全部类型/lint/构建门禁通过。
