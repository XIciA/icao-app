# 阶段日志

## 2026-07-23

- 已读阶段、架构、UI、编排、音频生命周期和 Expo SDK 55 ImagePicker/Device/Constants 文档。
- 已确认复用题库活动发布、鉴权、结构化响应、学习播放器 pause request 和共享展示版本。
- 已实现共享反馈契约、PostgreSQL 表、私有 Bucket 迁移、真实 multipart API、幂等、限流、题目校验、上传补偿、365 天与账号注销清理。
- 已实现“我的”入口、学习页纠错入口、真实表单、最多三图、失败保留和成功编号。
- 已移除帮助页模拟提交、假客服电话/邮箱和失败预览入口。
- App 完整检查通过：62 个测试套件、271 个测试；API 完整检查通过：8 个测试文件、230 个测试；共享契约和 Drizzle Migration 静态检查通过。
- Web 生产导出通过；iOS 与 Android Development Build 均构建成功，双端原生工程确认接入 `expo-image-picker 55.0.22`。iOS 模拟器完成普通表单和题目关联表单截图验收，并根据复用页面发现的问题补充入口上下文重置。
- PostgreSQL 迁移前备份为 `/opt/icao/backups/postgres/icao-20260723T060245Z.dump`，SHA-256 校验和隔离恢复通过；反馈迁移先在恢复库演练，再在生产事务中执行并确认两张表、索引、RLS 与私有 Bucket。
- API 使用明确文件集部署至 ECS；发布目录 `/opt/icao/runtime/releases/api-feedback-20260723T0608Z`，回滚镜像 `icao-api:rollback-api-feedback-20260723T0608Z`。重启后 `/health/ready` 与既有登录、同步流程通过。
- 线上真实请求通过：无图、三图、同用户幂等、题目版本校验、第四张拒绝、伪造图片拒绝、每小时 10 条后限流；临时账号删除后反馈行和私有对象均清除。
- 仓库级 `pnpm check` 被工作区中与本任务无关、尚未生成 release output 的题库内容改动阻断；本任务所覆盖的 App、Contracts、API、Migration 和 Web 导出均单独通过。
