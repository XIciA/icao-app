# 版本管理迁移接续

更新于 2026-11-28。原长交接已由本轮实际实施接续；最新事实看 [execution-status.md](execution-status.md) 和 Git / 服务器证据。

- 当前活动项目：`/Users/zhouyide/Desktop/icao-app`，已由独立干净副本迁入；日常使用 develop → feature → PR → develop。
- 原项目未提交代码、Git 元数据及旧 linked worktree 已封存于 `/Users/zhouyide/Desktop/icao-app-pre-migration-20261127`，不作为当前开发基线。另一任务的需求文件及附件保留原件，未覆盖其修改。
- `main` 保持正式基线 `7207bb90775f9e91d7c0943c6af39af5770cbc6e`；各正式组件仍运行原版本。新的正式发布仍由用户明确发令。
- 实施 PR：https://github.com/XIciA/icao-app/pull/375 ，目标 develop。精确合并/测试部署 SHA 见执行记录和 `/opt/icao/testing/deployment.json`。
- 测试 API `https://test-api.readyoufife.com`，测试 Auth/Storage `https://test-cloud.readyoufife.com`。
- 测试运行目录 `/opt/icao/testing`，独立 Compose、数据库 `icao_testing`、Storage、JWT、摘要及离线内容签名。内部数据网络 `172.30.244.0/24`，API/Auth 另有受控公网出口 `172.30.245.0/24`；宿主机主动连接保护由 `icao-testing-host-isolation.service` 持久化。
- 真实快照 `/opt/icao/backups/version-management-20261127/icao-20261127T105039Z-3021373.dump`，已校验恢复并保留；原定期备份 timer 正常。
- 后续测试部署：从干净并同步 origin/develop 的源码运行 `./scripts/deploy-testing.sh`。脚本只迁移并更新测试服务，不修改正式库。
- 本地测试客户端环境文件 `.generated/version-management-20261127/testing-client.env` 为 0600；服务器测试登录号码/验证码位于受保护的 `/opt/icao/testing/credentials.json`。不要将凭据输出或提交。
- 2026-11-28 已完成完整运行时迁移：测试 API `testing-4f186e3036e5`，复用现有 AI、短信、支付及 Apple/微信登录账号配置，完整后台任务已启用。Apple 沙盒及微信支付回调指向测试端；正式通知、服务和数据保持不变。精确结果见 `full-runtime-20261128.json`。
- 用户最新范围仅为现有代码与配置迁移，不再安排真实短信、付费 AI、真实付款、真机或 TestFlight 交付。本轮只核对代码、配置及启动健康，不宣称业务端到端实测通过。
- 初始迁移无版本/构建号提升；完整运行时阶段曾预留 build 3596177，未生成或上传测试包。无 TestFlight/App Store/正式 Web/API 发布。原始恢复、身份、会员、学习同步、存储和隔离已验证；设备上的正式/测试版本切换还需后续测试包真机验收。

后续不要恢复旧单主干规则，也不要重新整合封存目录的历史试验。开放的历史 PR 未在本次擅自删除或合并；不明归属的原始媒体和独有历史提交已保留在封存中。
