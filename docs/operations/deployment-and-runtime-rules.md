# 部署与运行时规则

状态：当前运维基线
更新时间：2026-08-20

仓库是实现来源，但本地、预览和生产是不同运行状态。代码修改本身不授权生产部署。

## 1. 运行时地图

### Native

`iOS / Android → ECS API → Supabase / PostgreSQL / 受保护服务`

- ECS 运行 API 容器，运行时密钥只存在受保护环境中。
- 公司主生产 ECS 为 `47.108.90.19`，Native 正式域名为
  `api.readyoufife.com` 与 `cloud.readyoufife.com`。
- 旧 `feizhuicao.com` API/Cloud 域名和旧 ECS 已退出 Native 运行时；正式包只允许
  使用 `readyoufife.com` 新域名，不接受后续兼容发布。
- SSH 隧道只转发请求，不同步本地代码。

### Web

Web 有两条显式隔离的发布链路：

- `vercel-legacy`：`Browser → Vercel 同源 Functions / 静态内容 / 题库资源`，不参与
  Native 云同步。
- `edgeone-production`：`Browser → EdgeOne Pages → ECS API → Supabase`，与 Native
  共用正式账号、题库和学习同步。
- 两条链路共用 Expo Web 源码，但由构建时运行模式隔离；不得把服务端 secret 放入任一
  客户端包。

详细边界见 `docs/current/runtime-topology.md`。

## 2. 何时需要部署

| 修改类型 | 本地完成标准 | 生产动作 |
| --- | --- | --- |
| 文档、测试、离线工具 | 对应检查 | 默认不部署 |
| React Native 页面与普通 TS | Metro/测试/目标端行为 | 默认不部署 |
| 原生依赖、权限、插件、配置 | 目标平台 Development Build | 不等于生产 API 部署 |
| `services/api` / contracts | workspace 检查和代表性本地请求 | 当前任务明确包含线上时部署 ECS |
| `api/`、Web 路由或部署配置 | `pnpm check:web` 和预览检查 | 当前任务明确包含线上时发布 Vercel |
| EdgeOne Web 运行时或部署配置 | `pnpm check:web:edgeone` 和宽/窄屏预览 | 当前任务明确包含线上时发布 EdgeOne |
| 数据库 schema/migration | 迁移检查和计划 | 独立备份、审批、执行与验证 |

## 3. ECS API 部署门槛

获得当前任务的生产授权后：

1. 确认目标提交或明确文件集，不携带无关工作区改动。
2. 运行 API/contracts 直接检查，并按风险扩大到相关 App 检查。
3. 保留当前镜像和源码回滚点。
4. 构建新镜像，成功后再切换容器。
5. 验证 `/health/ready` 中 API 和数据库状态。
6. 用与改动直接相关的代表性线上请求验证。
7. 验证失败时恢复旧镜像/源码并再次检查健康状态。

生产路径、镜像标签和密钥位置属于受控运行环境信息，不应作为 Codex 的日常必读内容；
部署时以现有脚本和人工确认的目标环境为准，且不得输出环境文件。

## 4. Vercel Web 发布门槛

获得当前任务的生产授权后：

1. 运行 `pnpm web:deploy:export`，物化同源内容和题库资源。
2. 运行 `pnpm check:web:assets`、`pnpm check:web:content` 与
   `pnpm check:web:network`。
3. 使用预览部署验证邀请码、关键路由、刷新、内容、题库资源、窄屏与宽屏。
4. 确认客户端网络边界没有 ECS/Supabase 依赖，服务端 secret 未进入导出物。
5. 保留上一条可回滚 production deployment，再提升已验证版本。
6. 从正式域名复核关键路径、响应头和静态资源；失败时 rollback/promote 上一版本。

内容同步与回滚步骤见 `docs/operations/web-content-sync.md`。

## 5. 部署证据

至少记录：

- 目标提交或已复核文件范围；
- 与变更直接相关的检查结果；
- 部署目标和产物标识；
- 健康检查或预览/正式域名结果；
- 代表性业务请求或关键路径结果；
- 可用的回滚点及实际回滚结果（若发生）。

## 6. EdgeOne 三端同步站发布门槛

1. 在 EdgeOne 环境配置三个公开构建变量：正式 API URL、Supabase URL 和 publishable key。
2. 运行 `pnpm check:web:edgeone`；构建必须保持轻量，不物化私有题库音频。
3. 先验证 EdgeOne Preview 的登录页、刷新、窄屏/宽屏、HTTPS 和安全响应头。
4. Preview 通过后，才把 `readyoufife.com` 加入 API CORS 白名单并绑定正式域名。
5. 用真实手机号验证登录、题库、签名音频和学习同步；旧 Vercel 域名保持不变。
6. 回滚优先恢复上一条 EdgeOne deployment；DNS 变更保留原记录快照。

## 7. 不随普通部署继承的权限

- 数据库迁移、数据删除和不可逆修复；
- 域名、DNS、证书、支付或账号治理变更；
- 将本地密钥、签名材料或环境文件上传到任何部署包；
- 携带与当前任务无关的未提交修改；
- 因为“API 文件已改”而自动推断生产部署授权。
