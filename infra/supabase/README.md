# Supabase 自托管部署边界

- 上游固定为 `UPSTREAM_COMMIT` 中的 Supabase 官方仓库提交。
- ECS 运行目录为 `/opt/icao/runtime/supabase`；真实 `.env` 只保存在服务器，权限为 `600`。
- Kong、PostgreSQL session pool 和 transaction pool 仅绑定 `127.0.0.1`，当前只通过 SSH 隧道联调。
- 第二阶段 A 不启动 Realtime、Edge Runtime、Logs/Analytics。
- 公开注册关闭；邀请码账户仍使用内部邮箱密码会话，匿名、手机号和第三方登录关闭。内部邮箱不向用户展示，也不发送公网邮件。
- Mailpit `v1.30.4` 使用官方 GHCR 镜像，作为无持久化、无认证测试 SMTP；SMTP 只在容器网络内可用，Web UI 只绑定 ECS `127.0.0.1:8025`。
- 换绑邮箱和找回密码邮件只进入 Mailpit，不向公网邮箱投递；通过 SSH 隧道查看。
- 正式域名、HTTPS 与公网安全门禁完成前，不开放任何业务端口。

部署时必须从固定提交复制官方 `docker/` 目录，再叠加 `docker-compose.override.yml`；不得把官方示例密钥用于运行环境。

阶段 C 的服务器 `.env` 使用 `SMTP_HOST=mailpit`、`SMTP_PORT=1025`、空的 `SMTP_USER`/`SMTP_PASS`、测试发件地址，并把 `feizhuicao://auth/callback*` 加入 Auth redirect allow list，以允许带流程参数的 PKCE 回调。真实值仍只保存在服务器。
