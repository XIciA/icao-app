# ICAO API 部署

- 镜像从仓库根目录构建，使用固定 Node/pnpm 版本。
- ECS 环境文件位于 `/opt/icao/runtime/api/.env`，不进入 Git。
- 容器加入 `supabase_default` 内部网络访问数据库和 Kong，API 只映射到宿主机 `127.0.0.1:3101`。
- 数据库 Migration 必须在 API 启动前执行；不得通过 Studio 手工建表。
