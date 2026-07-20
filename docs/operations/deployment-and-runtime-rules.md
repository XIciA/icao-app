# 部署与运行规则

> 归类：运行与运维。总导航见 `docs/README.md`。

## 核心原则

项目只有一套源代码，但本地与 ECS 是两个运行实例。代码在本地通过，不代表真机或模拟器正在使用该版本。

```text
真机 / 模拟器
→ Mac 局域网地址:3101
→ SSH 隧道
→ ECS 127.0.0.1:3101
→ icao-api
→ Supabase / PostgreSQL
```

SSH 隧道只转发请求，不同步代码。

## 修改类型与完成标准

| 修改类型 | 完成标准 |
| --- | --- |
| React Native 页面、样式、普通 TS 逻辑 | Metro 加载并完成界面或行为验证 |
| `services/api` | 本地检查、干净范围部署 ECS、重启、健康检查、真实接口验证 |
| Expo 插件、权限、原生依赖或原生配置 | Prebuild/原生编译并安装 Development Build |
| 数据库 Schema 或 Migration | 备份、迁移审核、执行、数据与接口验证 |
| 文档、离线评测脚本 | 不部署，除非它们属于服务器运行时 |

## API 部署门槛

1. 确认部署范围，不携带无关未提交改动。
2. 运行 `pnpm check`。
3. 从目标提交或已复核文件集生成部署包。
4. 保留当前 ECS 镜像和源码备份。
5. 构建新镜像，构建成功后再切换容器。
6. 验证 `/health/ready` 中 API 和数据库均为 `ok`。
7. 用本次修改对应的真实接口请求验证结果，不能只看容器启动成功。
8. 验证失败时回滚旧镜像和源码。

## ECS 运行位置

| 内容 | 位置 |
| --- | --- |
| API 运行环境变量 | `/opt/icao/runtime/api/.env` |
| 当前部署源码 | `/opt/icao/runtime/source` |
| 部署包 | `/opt/icao/runtime/releases` |
| 回滚备份 | `/opt/icao/backups` |
| API 容器 | `icao-api` |
| API 镜像 | `icao-api:phase2a` |

不得覆盖、输出或提交 ECS 环境变量和密钥。

## 验收证据

每次 API 部署至少记录：

- 本地目标提交或明确文件范围；
- 本地检查结果；
- ECS 镜像和容器健康状态；
- `/health/ready` 结果；
- 与修改直接相关的线上接口结果；
- 回滚镜像或源码备份是否存在。

## 边界

- 普通前端修改不触发 ECS 部署。
- 未完成、未复核或与当前任务无关的工作区改动不得进入部署。
- API 部署不得顺带执行数据库 Migration。
- 正式生产发布、域名、证书、支付和不可逆数据操作仍需单独授权。

## Web 在线版

```text
浏览器 → feizhuicao.com（Vercel SPA）
       → api.feizhuicao.com（ECS API）
       → cloud.feizhuicao.com（Supabase/Auth/资源）
```

- 仓库仍是 Web、iOS、Android 的唯一代码源；Vercel 只托管导出的静态前端，不保存题库或服务端用户数据。
- Web 生产环境只允许公开 API/Supabase URL 与 publishable key；服务端 secret、service-role key、AI key 不得进入 Vercel client bundle。
- API CORS 使用精确来源白名单。新增或移除正式/预览来源属于 API 运行配置变更，需备份环境、重启容器并验证 `/health/ready` 和代表性预检/条件请求。
- Web 发布前保留上一条 Vercel production deployment；发布失败使用 Vercel Rollback/Promote 恢复，不删除域名或 DNS。
- `vercel.json` 负责 SPA fallback、安全头和 hash 静态资源缓存；入口 HTML 不得被长期 immutable 缓存。
- 具体命令、验证和回滚顺序见 `docs/workstreams/app-web-online-edition/deployment-runbook.md`。
