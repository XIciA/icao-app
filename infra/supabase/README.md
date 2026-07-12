# Supabase 自托管部署边界

- 上游固定为 `UPSTREAM_COMMIT` 中的 Supabase 官方仓库提交。
- ECS 运行目录为 `/opt/icao/runtime/supabase`；真实 `.env` 只保存在服务器，权限为 `600`。
- Kong、PostgreSQL session pool 和 transaction pool 仅绑定 `127.0.0.1`，当前只通过 SSH 隧道联调。
- 第二阶段 A 不启动 Realtime、Edge Runtime、Logs/Analytics。
- 邮箱注册开启、邮箱确认关闭；匿名、手机号和第三方登录关闭。
- 正式域名、HTTPS 与公网安全门禁完成前，不开放任何业务端口。

部署时必须从固定提交复制官方 `docker/` 目录，再叠加 `docker-compose.override.yml`；不得把官方示例密钥用于运行环境。
