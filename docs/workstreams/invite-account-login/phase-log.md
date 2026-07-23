# 邀请码账号登录

状态：本地实现与自动化验证完成；ECS 迁移、数据清理与真机验收待执行。

## 已完成

- 使用 Supabase Auth 的既有 `userId`、会话安全存储、自动刷新、全设备退出和同步归属；没有新建平行账号或同步系统。
- 新增邀请码账户与失败限流表。邀请码为四字显示名加两段四位随机后缀，数据库只保存 HMAC 查询索引与 scrypt 校验哈希。
- 新增邀请码会话交换 API、管理员创建/停用/重置脚本，以及有效邀请码账户的全业务 API 准入检查。
- 登录、启动、资料、安全与注销流程改为邀请码模型；移除邮箱、密码、手机号、注册、找回和邮件回调入口。
- 注销要求重新输入完整邀请码，停用邀请码并撤销所有会话后删除 Supabase 用户；原有用户范围业务数据继续由外键级联删除。

## 已验证

- `pnpm check:app`、`pnpm check:contracts`、`pnpm check:api` 通过。
- React Native Jest：56 个套件、243 个测试通过；API Vitest：6 个文件、217 个测试通过。
- `expo export --platform all --clear` 通过。
- 根 `pnpm check` 在本任务开始前已因缺少生成的题库 release 输出而停止：`release_output_missing_run_content_build`；未运行会改写题库输出的构建命令，以避免覆盖无关工作区改动。

## ECS 执行顺序

1. 在受保护的 `/opt/icao/runtime/api/.env` 新增至少 32 字符的 `INVITE_AUTH_SECRET`；不得写入仓库、部署包、日志或聊天。内测期间必须保持该值稳定；轮换需要先迁移邀请码 HMAC 索引并重新设置内部密码。
2. 执行 `infra/backup/backup-postgres.sh`，校验 SHA-256，并以 `infra/backup/restore-isolated.sh` 完成隔离恢复验证。
3. 记录 `auth.users` 实际数量；先用 `INVITE_BETA_RESET_EXPECTED_USERS=<实际数量> pnpm --filter @icao/api invite:reset-beta` 运行 dry-run，再带 `--apply` 与确认变量清空所有当前测试 Auth 用户及用户范围数据。
4. 审阅并执行 `0007_invite_accounts.sql`；确认 `invite_accounts`、`invite_login_attempts`、RLS 和权限撤销均已生效。
5. 在 Supabase Auth 运行配置启用 `GOTRUE_DISABLE_SIGNUP=true`，保留内部密码会话能力，重启 Auth 并验证公开注册已关闭。
6. 从只包含已审阅邀请码改动的源码构建 API，保留 ECS 回滚镜像和源码备份；重启 `icao-api`，确认 `/health/ready`。
7. 使用 `pnpm --filter @icao/api invite:manage create 起落平安` 生成首个邀请码；设置 `INVITE_VERIFY_CODE` 后运行 `verify:account-live`，确认两次邀请码登录获得相同 `userId` 且可访问受保护业务 API。
8. 通过 iOS/Android Development Build 输入同一邀请码，验证账户名称、首次绑定、双向学习同步、退出当前设备、退出全部设备和注销；把截图与结果写入本目录的 `evidence/`。

## 明确未做

- 未提供忘记邀请码、自助改码、邮箱、手机号、微信或 Apple 登录。
- 未执行 ECS 备份、数据库清理、迁移、重启或部署；这些步骤必须使用已验证的备份和当前实际账户数量。
