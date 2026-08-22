# GitHub 单主干整理记录

状态：完成
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

- 整合代码基线：`520757f`；本记录之后只有收口文档提交和 GitHub 普通 merge commit。
  最终 `main` SHA 以 GitHub `main` 历史为准，避免在产生该 SHA 的提交内写入循环引用。
- 发布历史关系已验证：`a0ca177`、`04778bc`、`75edb96`、`629a8ce` 均为整合分支祖先；
  历史发布 tag 已推送到远端。
- 本地验证通过：`pnpm check:release`、`pnpm test:recording`、`pnpm typecheck`、
  `pnpm check`、`pnpm check:ci`、`pnpm check:web:edgeone`、`git diff --check`。
- 本次历史整合使用普通 merge PR 合入 `main` 并通过仓库 CI，以保留发布提交父关系；收口后
  GitHub 设置为 PR 合入后自动删除临时分支，日常只保留 squash merge，关闭 rebase 和普通
  merge，保持后续 `main` 历史简洁。
- 整理前的 6 条远端 `codex/*` 分支及本次临时整合分支已删除；本地旧功能分支、
  旧 OPI 分支和 4 个附加 worktree 已删除。仍需追溯的历史由 `main`、保全 tag 和本记录承担。
- 最终审计标准：远端与本地都只保留 `main` 分支；开放 PR 为 0；`main` 工作树干净且
  与 `origin/main` 一致。

上述仓库收口不代表重新部署：本次没有发布生产 API、Vercel/EdgeOne、数据库或新的
TestFlight build。
