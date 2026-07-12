# ECS 内数据库备份

- 每日由 systemd timer 运行 `backup-postgres.sh`。
- 默认保留 7 天，备份和 SHA-256 位于 `/opt/icao/backups/postgres`。
- `restore-isolated.sh` 在同一 PostgreSQL 实例中新建临时空库，完整恢复并校验 public/auth 表后删除临时库。
- 第二阶段 A 仅验证 ECS 内副本；异机备份和云快照按已确认边界延期。
