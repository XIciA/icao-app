# 当前运行时拓扑

更新时间：2026-08-09

## Native 正式链路

`iOS / Android App → ECS API → Supabase / 受保护的运行时服务`

- App 使用仓库内 contracts 与 API 交互。
- 主生产 ECS 为公司账号下的 `47.108.90.19`；正式入口为
  `https://api.readyoufife.com` 与 `https://cloud.readyoufife.com`。
- 新版 Native App 不再兼容 `api.feizhuicao.com`、`cloud.feizhuicao.com` 或旧 ECS
  `47.109.132.161`；两条旧域名 A 记录和新机 Caddy 旧别名均已删除，旧安装包停止服务不
  影响正式 iOS 包 `com.readyoufife.ios` 或 Android 包 `com.readyoufife.app`。
- 账号、云端学习记录、正式 AI 与真实反馈属于这条链路。
- 本地 API 修改不等于线上已更新；线上验收需要明确的部署授权与部署证据。

## Web 正式链路

`Browser → Vercel 同源 Functions / 静态内容 / 静态题库资源`

- `vercel.json`、`api/` 和 Web 导出物定义正式 Web 边界。
- Web 邀请码会话使用独立 cookie 机制。
- Web 学习状态保存在浏览器本地，不调用 ECS API 或 Supabase，不参与 Native 云同步。
- Web 发布前需生成并校验同源内容与题库资源。

## 不应跨越的边界

- 不因复用 UI 或内容而让 Web 隐式恢复 ECS/Supabase 依赖。
- 不因 Web 的本地存储策略削弱 Native 的账号与云端能力。
- 不在客户端、文档、部署包或日志中写入运行时密钥。
- 数据库迁移与普通 API 发布分开审批、备份和验收。
- 内测 APK 下载站的 DNS 记录已于 2026-08-09 删除，仓库中的页面和上传脚本也已移除；
  任何 Native 构建或部署脚本都不得恢复对它或旧 ECS 的依赖。旧 ECS 当前欠费停机，因
  无法启动而未删除磁盘内的历史文件；这一残留不属于运行链路，也不得以启动或释放整机的
  方式在未单独授权时处理。

部署步骤与证据要求见 `docs/rules/conditional/deployment-and-runtime-rules.md`。
