# 目录职责与分支生命周期

## 目录职责

```text
icao-app/
├─ src/                 iOS、Android、Web 共用的应用代码
├─ api/                 Web 在 Vercel 上使用的轻量接口
├─ services/api/        App 在 ECS 上使用的后端服务
├─ packages/contracts/  各端与后端共用的数据约定
├─ content/             题库、词汇和文章等正式内容
├─ assets/、public/     App 与 Web 使用的正式资源
├─ docs/                当前规则、方案、验收记录和历史工作流
├─ tools/、scripts/     构建、检查和内容处理工具
├─ infra/               部署与运行环境配置
├─ outputs/             明确需要交付或留存的导出结果
└─ .generated/          可重建的缓存、中间文件和临时验证产物
```

`ios/`、`android/` 由 Expo Prebuild 在本地生成，不作为长期手工维护目录。
`.generated/` 默认不提交新文件；需要长期留存的证据放进对应
`docs/workstreams/.../artifacts/`。现有已跟踪旧产物先冻结，后续通过独立迁移任务处理。

## 分支生命周期

```text
main → codex/任务分支 → 开发与验证 → Pull Request → main → 删除任务分支
```

- `main` 只保留已验证、可继续开发的稳定状态，不直接开发或推送。
- 一个任务使用一条短期分支；合并前同步 `main`、处理冲突并完成必要检查。
- PR 合并后删除本地和远端任务分支；需要回看时使用提交和 PR，不靠长期留分支。
- 含独有提交的旧分支先逐提交审查，再决定合并、重做或归档，不能仅因“有提交”就合并。
- 只有仍在持续交付的工作流可以暂留长期分支，并明确负责人、当前状态和收口条件。
