# Supabase 自托管部署边界

- 上游固定为 `UPSTREAM_COMMIT` 中的 Supabase 官方仓库提交。
- ECS 运行目录为 `/opt/icao/runtime/supabase`；真实 `.env` 只保存在服务器，权限为 `600`。
- Kong、PostgreSQL session pool 和 transaction pool 仅绑定 `127.0.0.1`，当前只通过 SSH 隧道联调。
- 第二阶段 A 不启动 Realtime、Edge Runtime、Logs/Analytics。
- 基础 compose 仍是历史邀请码内测基线：公开注册、手机号和第三方登录默认关闭。Native 覆盖层按环境
  单独开启手机号注册/短信 Hook；Apple/微信及永久账号迁移只有在配置和迁移获批后启用。内部邀请码
  邮箱不向 Native 用户展示，也不发送公网邮件。
- Mailpit `v1.30.4` 使用官方 GHCR 镜像，作为无持久化、无认证测试 SMTP；SMTP 只在容器网络内可用，Web UI 只绑定 ECS `127.0.0.1:8025`。
- 换绑邮箱和找回密码邮件只进入 Mailpit，不向公网邮箱投递；通过 SSH 隧道查看。
- 正式域名、HTTPS 与公网安全门禁完成前，不开放任何业务端口。

部署时必须从固定提交复制官方 `docker/` 目录，再叠加 `docker-compose.override.yml`；不得把官方示例密钥用于运行环境。

阶段 C 的服务器 `.env` 使用 `SMTP_HOST=mailpit`、`SMTP_PORT=1025`、空的 `SMTP_USER`/`SMTP_PASS`、测试发件地址，并把 `readyoufife://auth/callback*` 加入 Auth redirect allow list，以允许带流程参数的 PKCE 回调。真实值仍只保存在服务器。

## Native 正式短信覆盖层

- `docker-compose.aliyun-sms.yml` 是真实阿里云短信的生产式配置预留，不得与固定测试验证码覆盖层同时启用。
- 资质主体为“云启航科（成都）科技有限公司”；推荐送审签名为“云启航科成都”，最终必须以阿里云与运营商的审核结果为准。
- Supabase Send SMS Hook 不包含可靠的注册/登录/找回用途，因此当前三种流程共用一条通用身份验证码模板。
- 启用前必须在外部 Secret 中提供私有 Hook URL 与同一份 `v1,whsec_...` Standard Webhooks Secret，并在 API 侧配置已审核的阿里云签名、模板及最小权限 RAM 凭证。
- 当前发送频控、预算和幂等只在单 API 进程内存中生效；生产重启或多实例部署前必须迁移到 Redis/数据库，并补齐设备/IP 维度风控。
- 当前仓库文件只描述配置合同；现有 TestFlight 已由负责人确认可收到真实阿里云验证码。任何后续
  ECS/Supabase 变更仍必须按部署流程单独授权，且不得影响冻结的 Vercel/Web。

## Apple Native ID Token 覆盖层

- `docker-compose.apple-native.yml` 只用于 iOS Native `signInWithIdToken` 流程，可与真实短信或
  隔离的固定验证码覆盖层独立组合，不得用它开启 Web/Vercel 登录。
- 当前正式 App ID 与 token audience 固定为 `com.readyoufife.ios`。Native-only 方案不配置
  `GOTRUE_EXTERNAL_APPLE_SECRET`、`GOTRUE_EXTERNAL_APPLE_REDIRECT_URI`、Services ID 或 `.p8`
  密钥，也不得跳过 nonce 校验。若未来扩展浏览器 OAuth，必须作为新的架构与
  密钥管理变更单独审批。
- iOS Release/TestFlight 在构建前请求 `/auth/v1/settings`，并要求
  `external.apple === true`；这个门禁只证明 provider 已启用，最终仍需使用真实 Apple 凭证在
  真机验收首次登录和再次登录。
