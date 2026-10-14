# 实施记录
2026-09-13：沿用 apps/ops 和 Nest Ops 服务，实现五页；本机自动服务身份、SSH 数据库与附件通道，不开放公网管理端口。
额度沿用同一批次/预约/账本所有者。30天赠送独立批次；补满通过同周期补充批次实现，保留原消耗流水和周期上限。数据库约束测试验证混合扣除、期限、环境隔离与补满。
验证：API check（687测试）、真实临时PostgreSQL商务约束（65测试）、Ops构建、根TS类型检查通过。无真实用户权益变更。
待完成：main合并后生产迁移/服务切换，本地入口安装和浏览器实测。

## 2026-09-13 正式部署与验收
PR #115 合入 dd52c8a447710d4d0056fe6a851aa1695fa90aa5，完整CI通过（App1038测试、API687测试、数据库65测试及EdgeOne导出）。生产0047恢复演练及迁移通过，ledger48:0:0、65表；API production-migration-dd52c8a44771 健康。App content v3 / privacy v5.2 激活。
演练备份：icao-20260913T061008Z-682838.dump。切换证据：/opt/icao/runtime/production-migrations/evidence/apply-dd52c8a44771-20260913T062644Z-f129f370c2c2-succeeded.txt（包含切换前备份身份）。主任务获知可追加0048，后续API由主任务负责，后台不重复覆盖。
本机LaunchAgent com.icao.local-ops、桌面启动器及使用说明就绪；Safari实际访问成功，Chrome保留原有安全设置。真实数据库事务验收通过且测试数据全部回滚。历史费用未知不补算，点击从新客户端上线后开始统计。

## 2026-09-14 全局额度与用户详情交付
PR #120 合入 `f8cee39f7bbcc1c23ff88033eec5bbd47627a5e1`。最终主干 CI 通过（App 1100 项、API 698 项及 EdgeOne 导出），Commerce 隔离数据库 65 项、迁移工具 43 项、聚焦 UI 与 Ops 构建通过。

0049 恢复演练及正式迁移完成，ledger `49:1:0 → 50:0:0`，API `production-migration-f8cee39f7bbc` readiness/database 正常；部署后真实转写、语法纠错、表达润色及临时音频清理验证通过。标签 `release/api-production/2026-09-14-f8cee39f7bbc`，备份 `icao-20260913T182433Z-2645281.dump`，生产证据 `/opt/icao/runtime/production-migrations/evidence/apply-f8cee39f7bbc-20260913T184055Z-74384b9cc646-succeeded.txt`。

安装克隆从同一 main 编译并重启既有 LaunchAgent。真实页面读取 19 个账户，详情权益/订单/AI/反馈/审计正常；全员重置预览 10 个有效账户后取消，未执行实际全员重置。为本次 App Review 专用账号通过既有预览、确认、审计流程赠送 31 天生产会员，至 2026-10-14T18:44:54.615Z；未改密码、学习数据或 AI 赠送余额。送审主任务只读确认正式与沙盒会员均 active，登录和权益接口均 HTTP 200。

临时后台分支与 worktree 已删除。未修改 Vercel；未增加公网后台端口。
