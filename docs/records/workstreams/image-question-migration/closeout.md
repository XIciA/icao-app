# 图片题迁移关单记录

状态：完成

关单日期：2026-07-14

## 1. 交付结论

图片题已按大流程确认后的阶段 0—6 小流程完成：迁移功能、23 张图片、64 道问题与 64 个问题音频已经进入 `icao-app` 自有内容、原生学习、远程发布和资源签名链路。`feizhuicu` 仅被用作所需资源和内容关系参考，没有照搬代码或完整题库；独立单词资源不在本次交付中。

## 2. 需求闭环

| 需求 | 结果 | 证据 |
| --- | --- | --- |
| OPI 新增图片题分类 | 通过 | OPI v2 为 8 分类、144 话题、1356 卡 |
| 23 图 + 64 问题 + 64 音频 | 通过 | `source-manifest.json`、`migration-report.md`、迁移审计 |
| 图片完整显示且 AI 标识可见 | 通过 | 375×812 与 430 宽度成功截图 |
| 加载、失败、超时、重试 | 通过 | 组件测试与真实失败态截图；签名 URL 竞态已修复 |
| 图片卡隐藏无意义工具 | 通过 | 图片成功截图与组件测试 |
| 问题卡复用 OPI 能力 | 通过 | 问题卡截图显示文件音频和按住说话；既有学习测试通过 |
| 进度、答题卡、结束、同步兼容 | 通过 | 稳定卡片 ID、现有 session/store/sync 路径及全量测试 |
| 内容、类型、API 与 iOS 构建 | 通过 | `pnpm check`、`pnpm content:check:full`、Development Build |
| ECS 正式 release 与资源读取 | 通过 | OPI v2、3982 对象、健康检查与远程验证脚本 |
| 不迁移单词或来源代码 | 通过 | allowlist 与最终差异复核 |

## 3. 视觉证据

- `evidence/ios-375-opi-category.png`：OPI 目录中的图片题分类，23 话题 / 87 卡。
- `evidence/ios-375-image-success.png`：375×812 图片卡成功态。
- `evidence/ios-430-image-success.png`：430 宽度图片卡成功态。
- `evidence/ios-375-question-card.png`：后续问题卡的音频与录音能力。
- `evidence/ios-375-deep-link-check.png`：首次真实远程链路暴露的失败/重试状态；该路径随后经 URI 变化恢复修复并由成功态截图复验。

图片均使用完整适配，不对航空场景做填满裁切；代表性两种宽度中 AI 标识可见，无横向溢出。

## 4. ECS 运行与回滚

- 当前镜像：`icao-api:image-question-20260713T154042Z`。
- 发布目录：`/opt/icao/runtime/releases/icao-image-question-20260713T154042Z`。
- OPI v2 payload checksum：`454409b93572878093c8f18974e9e1315a427a204d4560bdfceb6af3b1c3119e`。
- v2 资源 manifest checksum：`3479d2e82c8645ff942f70d990cceb5005926984445970ba2c41cdd47bdc90bb`。
- 回滚镜像：`icao-api:rollback-image-question-20260713T154042Z`。
- 备份目录：`/opt/icao/backups/image-question-20260713T154042Z`，包含发布前源码、题库 release/资源元数据 SQL 与旧镜像 ID。
- OPI v1 仍保留；必要时可恢复旧镜像并重新激活 v1，不需要删除 v2 数据或资源。

发布后 `icao-api` 为 running、restart count 0，`/health/ready` 的 service 与 database 均为 `ok`。远程验证使用的临时账号已删除。
发布目录复核时发现并清除了 macOS 归档附带的无效 `._*` 元数据文件；题库、资源、镜像和数据库内容未受影响，清理后健康检查再次通过。

## 5. 明确未做与剩余边界

- 未修改只读设计仓库或 `feizhuicu`。
- 未迁移独立单词功能、词书或词汇素材。
- 未修改数据库 Schema，未新增原生依赖，未要求重新制作 Development Build 之外的正式商店包。
- Android 未在本次验收中运行，因此不能表述为 Android 已验证；当前已完成结论基于 iOS Development Build、内容/API 全量自动化与 ECS 远程链路。
- `pnpm check` 中仅保留一个与本任务无关的既有 lint warning（`learning-sync-test.ts` 的数组类型风格），不影响通过结论。
