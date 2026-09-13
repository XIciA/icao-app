# 实施记录
2026-09-13：沿用 apps/ops 和 Nest Ops 服务，实现五页；本机自动服务身份、SSH 数据库与附件通道，不开放公网管理端口。
额度沿用同一批次/预约/账本所有者。30天赠送独立批次；补满通过同周期补充批次实现，保留原消耗流水和周期上限。数据库约束测试验证混合扣除、期限、环境隔离与补满。
验证：API check（687测试）、真实临时PostgreSQL商务约束（65测试）、Ops构建、根TS类型检查通过。无真实用户权益变更。
待完成：main合并后生产迁移/服务切换，本地入口安装和浏览器实测。

## 2026-09-13 正式部署与验收
PR #115 合入 dd52c8a447710d4d0056fe6a851aa1695fa90aa5，完整CI通过（App1038测试、API687测试、数据库65测试及EdgeOne导出）。生产0047恢复演练及迁移通过，ledger48:0:0、65表；API production-migration-dd52c8a44771 健康。App content v3 / privacy v5.2 激活。
演练备份：icao-20260913T061008Z-682838.dump。切换证据：/opt/icao/runtime/production-migrations/evidence/apply-dd52c8a44771-20260913T062644Z-f129f370c2c2-succeeded.txt（包含切换前备份身份）。主任务获知可追加0048，后续API由主任务负责，后台不重复覆盖。
本机LaunchAgent com.icao.local-ops、桌面启动器及使用说明就绪；Safari实际访问成功，Chrome保留原有安全设置。真实数据库事务验收通过且测试数据全部回滚。历史费用未知不补算，点击从新客户端上线后开始统计。
