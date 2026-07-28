# Editorial 跨 Agent 发布操作约定

本文件让任何获得相应权限的执行器（Codex、Antigravity、CI 或人工）使用同一条 Editorial 流水线。Agent 只是执行适配层；仓库、构建产物和生产发布记录才是唯一事实来源。

## 适用边界

- 渠道：`resource` 与 `opi_hotspot`。
- 内容源：`content/editorial/`；原始资料保持在 `原始资源资料/`，不得改写或移动。
- 发布数据：`dist/editorial-release/`、`editorial_releases`、共享 `resource_objects` 和私有 `editorial-assets` bucket。
- 页面与接口：同一份 React Native/Web 页面、`GET /v1/editorial`、`GET /v1/editorial/:slug` 与共享资源解析接口。

不建设第二套 CMS、解析器、内容索引或 Agent 私有文章库。

## 执行器要求

任何执行器均可参与，但必须具备与任务相称的能力和授权：

| 工作 | 最低能力 | 是否可直接触达生产 |
| --- | --- | --- |
| 提取、清洗、事实核验、封面草案 | 读取仓库、运行本地命令 | 否 |
| 构建、预览、截图、代码审查 | 运行 pnpm、Web/API 本地环境 | 否 |
| 生产发布 | 以上能力，且有 ECS、数据库、Vercel 的受控权限 | 仅在用户明确批准后 |
| 线上验证 | 受控验证 token 或临时测试账号；不得输出密钥 | 是，只读或可自动清理的测试动作 |

Codex 的 `icao-editorial-publisher` Skill 是便捷编排，不是必要依赖。Antigravity 等 Agent 应读取本文件、[README.md](./README.md)、项目 `AGENTS.md` 和运维规则后，直接调用下列仓库命令。不得假设它能读取用户本机的 Codex Skill。

## 唯一状态机

```text
raw → extracted → editing → fact_checked → approved
→ built → preview_approved → published
```

- 每篇文章的状态、审核人事实来源和用户预览批准只写在 `review.json`、`provenance.json` 与 `metadata.json`。
- `dist/editorial-release/` 由构建生成，不得手改。
- `preview_approved` 前，任何 Agent 都不得上传封面、应用 Migration、导入 release、部署 API 或提升 Web production。
- `published` 只能在生产验证成功后写入；已发布 release 的 payload/checksum 不可改写，后续修订使用新版本。

## 通用命令契约

```bash
pnpm editorial:extract -- --source "原始资源资料/资源分享/文件.docx"
pnpm editorial:extract -- --source "原始资源资料/资源分享/文件.pptx"
pnpm editorial:check
pnpm editorial:build
pnpm editorial:preview
pnpm editorial:publish -- --confirm-preview-approved
pnpm editorial:verify-live -- --base-url https://api.example.com --slug article-slug
```

所有 Agent 都应把命令输出、文章 slug、release version、checksum 和验证结果写入任务交接或 `review.json` 历史；不要以对话记录代替仓库记录。

## 标准交接格式

上游 Agent 交给下游 Agent 时，至少给出：

```text
article: <channel>/<slug>
state: <当前状态>
source checksum: <sha256>
release version/checksum: <如已构建>
changed files: <精确文件列表>
facts: <已记录的 ICAO/CAAC 主来源>
approval: <未批准 / 批准时间与范围>
remaining gate: <下一步唯一门禁>
```

下游 Agent 必须重新读取上述仓库文件并运行与下一状态相对应的门禁，不得仅凭上游声明进入生产发布。

## 发布协议

取得用户对“正式稿、封面、真实页面预览”的明确批准后，发布执行器按此顺序完成：

1. 将文章标记为 `preview_approved`，记录批准时间，执行 `editorial:check` 与 `editorial:build`。
2. 审核 Migration；备份数据库并校验备份可读。
3. 从明确的文件集创建干净部署包，保留上一 API 镜像、源码和 Vercel production deployment。
4. 应用 Migration，运行 `editorial:publish -- --confirm-preview-approved`，导入 release 并上传私有封面。
5. 部署 API；确认 `/health/ready`。
6. 验证未登录 401、登录后列表/详情/404、ETag/304、封面签名加载和深链刷新。
7. 部署并验证 Vercel preview，再提升 production。
8. 仅在以上线上验证通过后，将状态改为 `published`。

数据库、ECS 与 Vercel 的具体备份、部署和回滚要求以 [部署与运行规则](../../docs/operations/deployment-and-runtime-rules.md) 为准。

## 安全与禁止项

- 不将 SSH key、环境变量、Supabase service key、验证 token、数据库备份或签名材料写入仓库、构建产物或 Agent 输出。
- 不把未审内容、模型草稿或未授权图片直接当作正式 release。
- 不用当前脏工作区整体部署；只部署复核后的文件集或目标提交。
- 不因切换 Agent 而跳过事实审核、用户批准、数据库备份、迁移审核或线上验收。

## Agent 适配建议

- **Codex**：可用个人 Skill 加速，但最终仍运行仓库命令并更新仓库状态。
- **Antigravity 或其他编码 Agent**：将本文件作为任务入口；若不能访问受控发布权限，则停在 `built` 或 `preview_approved` 并交接给发布执行器。
- **CI**：适合运行 `editorial:check`、`editorial:build`、契约检查和预览构建；生产发布必须有显式审批环境与受控密钥。
- **人工编辑**：可编辑 Markdown、元数据和审核记录，但必须由有技术权限的执行器完成构建、部署和线上验证。
