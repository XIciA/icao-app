# 生产 ECS 内数据库备份

- 每日由 systemd timer 运行 `backup-postgres.sh`。
- 默认保留 7 天，备份和 SHA-256 位于 `/opt/icao/backups/postgres`，目录和文件仅 root 可读。
- 备份先写入临时文件，并通过 `pg_restore --list` 校验后才原子发布，失败不会留下可被误用的半成品。
- `restore-isolated.sh` 在同一 PostgreSQL 实例中新建临时空库，完整恢复并校验 public/auth 表后删除临时库。
- 当前只启用 ECS 本机 PostgreSQL 7 天循环备份；不启用异机数据库或 Storage 副本。
- `replicate-postgres.sh` 与 `replicate-storage.sh` 仅作为可选工具保留。没有显式配置
  `BACKUP_REPLICA_TARGET` 或 `STORAGE_REPLICA_TARGET` 时会安全跳过，绝不回退到旧 ECS。
- 文件型 Supabase Storage 迁移必须同时保留 `user.supabase.cache-control` 和
  `user.supabase.content-type` 扩展属性。若迁移工具只复制文件内容，可从 `storage.objects`
  生成逐行 JSON 清单，并在 Storage 容器中运行 `repair-storage-xattrs.cjs apply`；完成后必须
  再以 `check` 模式全量验证，并对代表性音频执行 Range 请求。
- 本机备份与生产数据位于同一实例，不能抵御系统盘损坏、实例误释放或账号不可用；这是当前明确接受的风险。
