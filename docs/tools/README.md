# 常用工具与工作方法

从 [项目文档入口](../README.md) 按需进入。本目录保存可选工作方法，不是项目长期规则。
只有当前任务采用相应方法后，文档中的步骤才适用于该任务；既有授权不因模板而失效。

- [大流程：组织需求、方案与路线](workflows/document-driven-development-workflow.md)
- [小流程：执行已确认方案](workflows/orchestration-loop.md)
- [启动模板](workflows/workflow-start-prompt-template.md)

小修改不要求创建任务文档。方法与用户当前要求或长期约束冲突时，以用户要求及长期约束为准。

## 常用工具清单

核对日期：2026-10-24。下表按现有源码和 `package.json` 核对入口，不表示本次重新运行全部工具。
输入输出为主要范围；具体参数和环境要求以实现及对应参考为准。项目专用工具保留在仓库中，
这里提供导航，不复制一份实现。所有命令默认在仓库根目录执行。

| 用途 / 入口 | 主要输入 → 输出 | 副作用与使用边界 | 验证 / 参考 |
| --- | --- | --- | --- |
| 类型与代码质量：`pnpm typecheck`、`pnpm lint` | TS/TSX 与配置 → 诊断结果 | 本地检查，不部署 | [命令参考](../resources/developer/development-command-reference.md) |
| 聚焦回归：`pnpm exec jest --runInBand <测试路径>`、`pnpm check:audio` | 指定测试 / 音频边界源码 → 测试与诊断 | 本地验证，按受影响模块选择 | [交付规则](../rules/delivery-and-acceptance.md) |
| API / 合同：`pnpm check:api`、`pnpm check:contracts` | API、共享合同与测试 → 检查结果及构建输出 | API 聚合检查含合同构建；部分数据库测试需要隔离 PostgreSQL，不指向生产 | [API package](../../services/api/package.json)、[contracts package](../../packages/contracts/package.json) |
| 题库：`pnpm content:check`、`pnpm content:build` | 题库源、清单和本地媒体 → 检查结果 / 内嵌题库与资源清单 | `build` 写生成文件，不等于正式内容发布；缺媒体时先核对输入 | [题库工具](../../tools/question-bank-content.mjs) |
| OPI 热点：`pnpm opi-hotspot:check`、`pnpm opi-hotspot:build` | 热点源数据 → 校验 / 生成的热点文件 | `build` 修改生成文件；真实工单审核与发布使用运营后台 | [校验器](../../scripts/validate-opi-hotspots.mjs)、[内容工单](../workstreams/feature-update-2026-10/content-operations.md) |
| 资源文章：`pnpm editorial:check`、`pnpm editorial:build`、`pnpm editorial:preview` | `content/editorial/` → 校验、`dist/editorial-release/`、本地预览服务 | build / preview 生成本地产物；`editorial:publish` 是单独的发布操作 | [工具实现](../../tools/editorial-content.mjs)、[内容规则](../rules/content-processing.md) |
| 运营后台：`./scripts/start-local-ops.sh` | 本机受保护配置、后台源码 / 构建 → 本地后台与浏览器 | 可构建本地文件；本地后台会通过受保护连接访问真实业务，审核 / 发布按钮有实际数据副作用 | [启动脚本](../../scripts/start-local-ops.sh)、[内容工单](../workstreams/feature-update-2026-10/content-operations.md) |
| EdgeOne：`pnpm web:edgeone:export`、`pnpm check:web:edgeone` | 前端与公开运行环境 → `dist/` 和导出校验 | 本地构建，不自动上线；正式部署需现有授权 | [Web 参考](../resources/operations/edgeone-three-client-web-rollout.md) |
| 宣传站运维 | `public/promo/`、Nginx 配置 → 独立宣传站产物 | 上传、切换目录、证书及服务器操作均有外部副作用；不使用旧 Vercel 部署入口 | [操作说明](../../infra/promo/README.md)、[迁移证据](../records/releases/20261020-feizhuicao-hong-kong-promo.md) |
| 原生构建与发布：`pnpm ios:standalone`、`pnpm android:standalone`；`pnpm release:ios:testflight`、`pnpm release:android` | 源码、签名与运行环境 → 安装包 / 渠道上传 | 构建与上传分开辨认；release 脚本有外部副作用，按目标渠道和既有授权使用 | [命令参考](../resources/developer/development-command-reference.md)、[双端发布参考](../resources/operations/dual-platform-release.md) |
| 正式更新清单：`tools/publish-app-update.py` | 已审核的渠道 JSON、可选 APK 与主机受保护配置 → 不可变 APK、清单备份与渠道指针 | 在存储主机执行，会写线上存储；不在文档中复制凭据或直接套用历史发布参数 | [最近发布及验证](../records/releases/20261021-app-updates-1.2.1.md) |
| API / 数据库发布：`pnpm release:database:migrate`、`./scripts/deploy-api-release.sh` | 已合并源码、受控环境与备份 → 迁移 / 服务产物及证据 | 生产变更；数据库迁移与服务部署分别核对授权，不能作为日常诊断命令 | [迁移脚本](../../scripts/apply-production-migrations.sh)、[API 说明](../../infra/api/README.md) |

`pnpm check` 是完整本地校验，`pnpm check:ci` 是干净 runner 的入口；二者的媒体输入要求不同，
不互相代替。文档改动通常只需格式、引用和命令入口检查，具体范围见既有交付规则。

## 维护状态与已知依赖

- 上表是常用入口清单，未覆盖仓库全部脚本；实现变化时就地修正相关行即可。
- `check:app-store-materials`、App Store 发布脚本和 IAP 工具仍读取
  `docs/workstreams/app-store-1.0.0/materials/`。该目录含可执行校验器和发布输入，暂不能当作纯历史文档移动。
- 部分题库整理、文本审计与 OPI 重建工具读取 `docs/records/workstreams/` 中的快照。
  归档目录存在可执行依赖，不表示里面的旧操作方案仍适合重跑。
- 用户于 2026-10-24 撤销 Vercel 冻结约束；旧冻结脚本、CI 门禁、`vercel.json` 和专用
  `web:deploy:export`、`web:content:sync` 发布入口已移除。历史快照不再限制当前三端改动；当前产品 Web 使用 EdgeOne 入口。
  `web:export`、`check:web` 等遗留本地命令仍存在，不作为产品 Web 发布入口。
- 上述工具和输入仍在原路径；确需迁移时同步调用方并做对应验证。
