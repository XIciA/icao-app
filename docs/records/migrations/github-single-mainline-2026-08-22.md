# GitHub 单主干整理记录

状态：执行中
日期：2026-08-22

## 目标

将私有仓库收敛为唯一长期分支 `main`，保全已发布版本，纳入最新 TestFlight 与三端同步代码，
删除旧分支和重复 Git 规则，并建立持续门禁。本次不包含生产部署、数据库迁移或新客户端上传。

## 整理前事实

- `main`：`629a8ce`。
- 远端：`main` 加 6 条 `codex/*` 分支；本地 10 条分支、5 个 worktree；无开放 PR。
- 完整集成基线：`75edb96`，领先旧 `main` 17 个提交。
- TestFlight build `3470181`：commit `a0ca177`，整理前不在任何远端分支。
- EdgeOne 正式来源：`04778bc`。
- OPI 旧分支的 2026-07-17 重建已被后续正式双语 OPI 发布和 `opi-rebuild.mjs` 替代，不重新合入。
- Vercel 最新生产部署来自 dirty CLI 构建再叠加 web-only promotion，不能精确映射单一 Git commit。
- 当前 ECS API 镜像 `sha256:f2a7a558...` 来自旧运行时局部热修，没有完整 Git release label，
  不能精确映射单一仓库提交。

## 保全标签

- `release/ios-testflight/v1.0.0-b3470181` → `a0ca177`
- `release/web-edgeone/2026-08-20` → `04778bc`
- `archive/pre-single-mainline/main-2026-08-22` → `629a8ce`
- `archive/pre-single-mainline/integration-2026-08-21` → `75edb96`

Vercel 与当前 API 的历史运行时只记录真实例外，不创建误导性 tag。下一次从干净 `main` 发布
时必须恢复 commit、tag 与产物的一一对应。

## 整合取舍

- 以 `75edb96` 为代码和新文档结构基线。
- 纳入 TestFlight build `3470181` 的录音准备、媒体时长和回放修复，同时保留集成基线的正式
  图标、账号、EdgeOne、腾讯 ASR 与 DeepSeek 实现。
- TestFlight 历史通过一次明确的合并父关系保留；重复旧文档不带回现行规则区。
- 明显过时、重复或允许长期平行分支的旧规则删除，不保留第二现行来源。

## 完成证据

完成后补充最终 `main` SHA、验证命令、GitHub 设置、删除的分支/worktree 和最终远端审计。
