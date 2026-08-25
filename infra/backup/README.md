# 生产 ECS 内数据库备份

- 每日由 systemd timer 运行 `backup-postgres.sh`。
- 生产 systemd 服务只从 `/opt/icao/runtime/backup-tools/current` 读取受审备份工具。该路径由
  `scripts/install-production-backup-tools.sh` 按 `origin/main` 提交原子切换，不依赖会被 API 发布替换的
  `/opt/icao/runtime/source`。
- 默认保留 7 天，备份和 SHA-256 位于 `/opt/icao/backups/postgres`，目录和文件仅 root 可读。
- 手工、安装预检和 systemd timer 共用 `/run/lock/icao-postgres-backup.lock`，并发备份会安全失败，
  不会竞争同一临时文件或校验和。
- 备份先写入临时文件，并通过 `pg_restore --list` 校验后才原子发布，失败不会留下可被误用的半成品。
- `restore-isolated.sh` 以独占锁在同一 PostgreSQL 实例中新建唯一临时空库，完整恢复并校验 public/auth、
  代表性业务表总量、用户和迁移账本后，只删除本次成功创建的临时库；数据库密码不进入命令参数。
- 当前只启用 ECS 本机 PostgreSQL 7 天循环备份；不启用异机数据库或 Storage 副本。
- `replicate-postgres.sh` 与 `replicate-storage.sh` 仅作为可选工具保留。没有显式配置
  `BACKUP_REPLICA_TARGET` 或 `STORAGE_REPLICA_TARGET` 时会安全跳过，绝不回退到旧 ECS。
- 文件型 Supabase Storage 迁移必须同时保留 `user.supabase.cache-control` 和
  `user.supabase.content-type` 扩展属性。若迁移工具只复制文件内容，可从 `storage.objects`
  生成逐行 JSON 清单，并在 Storage 容器中运行 `repair-storage-xattrs.cjs apply`；完成后必须
  再以 `check` 模式全量验证，并对代表性音频执行 Range 请求。
- 本机备份与生产数据位于同一实例，不能抵御系统盘损坏、实例误释放或账号不可用；这是当前明确接受的风险。

## 正式生产迁移

- 正式迁移只使用已经合入且完全等于干净 `origin/main` 的源码。先运行
  `./scripts/apply-production-migrations.sh --print-confirmation` 获取与完整提交 SHA、迁移前计划和
  迁移后计划绑定的一次性确认文本；确认文本必须原样放入受控的
  `ICAO_PRODUCTION_MIGRATION_CONFIRM` 环境变量后才允许正式执行。
- `./scripts/apply-production-migrations.sh` 在接触生产迁移前会自动重新执行同一提交的完整隔离演练：
  新建生产备份、校验 SHA-256、恢复到唯一隔离数据库、应用候选迁移、比对既有表指纹并清理隔离资源。
  备份或演练证据超过30分钟、预期计划不一致、来源改变、目录或文件所有者/权限异常、符号链接、并发
  备份/演练/发布，以及任何证据不完整都会失败关闭。
- 当前锁定的默认计划是 `15:18:0` 到 `33:0:0`。若生产状态发生变化，必须先只读核验并重新审计
  计划，再通过环境变量显式更新预期值；不得跳过提交与计划绑定确认。
- 成功或失败证据以 root-only 的原子文件写入
  `/opt/icao/runtime/production-migrations/evidence`。成功必须同时满足迁移账本已是当前版本、隐私和商业
  schema 合约通过、代表性业务行数和认证用户数保持不变，以及本轮临时文件和镜像清理完成。
- 正式迁移开始后的失败绝不自动把备份覆盖回生产。先按失败证据给出的 `restore-isolated.sh` 命令再次
  验证备份可恢复，再由单独授权选择向前修复或正式恢复；正式恢复必须另行制定、审计和确认目标，不能
  把隔离恢复命令改成生产数据库目标。
- 确认文本不是密码，但生产数据库密码、签名密钥、证书和环境文件仍只保存在受保护环境中，不进入命令
  参数、仓库、日志、证据或聊天。
