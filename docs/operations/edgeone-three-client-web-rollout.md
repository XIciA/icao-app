# EdgeOne 三端同步 Web 上线方案

状态：生产上线完成（真实短信验证码登录待人工验收）
日期：2026-08-20

## 目标结构

```text
iOS ─┐
Android ─┼─→ ECS API ─→ Supabase/PostgreSQL + 私有题库音频
EdgeOne Web ─┘

旧 feizhuicao.com Web ─→ Vercel 独立体验链路（冻结保留）
```

## 已定边界

- `readyoufife.com` 直接打开产品，`www` 最终跳转到根域名。
- Web 复用现有 Expo/React Native Web 页面与 contracts，不新增第二套应用。
- 首发使用与 TestFlight 一致的手机号验证码自动注册/登录；不扩展密码登录，不迁移旧账号表。
- 学习进度、标注、笔记和词汇状态进入现有同步接口；录音文件仍是设备本地数据。
- 题库与音频不复制到 EdgeOne。EdgeOne 只托管约几十 MiB 的前端，音频流量继续由
  `cloud.readyoufife.com` 所在 ECS/Supabase Storage 承担。
- 旧 Vercel 网站、域名和本地进度不迁移、不改动。

## 发布配置

- EdgeOne 项目构建：`pnpm web:edgeone:export`
- 输出目录：`dist`
- Node：`.nvmrc` 锁定仓库支持版本；pnpm 使用仓库锁定的 `11.7.0`
- SPA fallback、安全响应头和静态缓存：`edgeone.json`。本地导出会自动生成仅含运行时规则的
  `dist/edgeone.json`，避免直接上传环境误执行 Git 安装/构建命令。
- 必需公开环境变量：
  - `EXPO_PUBLIC_ICAO_API_URL=https://api.readyoufife.com`
  - `EXPO_PUBLIC_SUPABASE_URL=https://cloud.readyoufife.com`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（从受控 ECS 环境复制，不写入仓库）

EdgeOne 的构建、环境变量和 SPA fallback 规则以官方文档为准：
[构建指南](https://pages.edgeone.ai/document/build-guide)、
[edgeone.json](https://pages.edgeone.ai/document/edgeone-json)。

## 生产结果

- Makers 项目：`tingniwuge-web`（`makers-4khvzoj9ywnq`）。
- 当前生产部署：`dpw5cihk42zw`；项目临时域名为
  `tingniwuge-web-hxnvmxob.edgeone.cool`。
- `readyoufife.com` 与 `www.readyoufife.com` 已绑定并接入 EdgeOne：
  - 根域名 CNAME：`readyoufife.com.pages.dnsoe6.com`
  - `www` CNAME：`www.readyoufife.com.pages.dnsoe4.com`
- 两个域名均使用 EdgeOne 自动更新的免费 HTTPS 证书，并启用 HTTP 到 HTTPS 的 301；
  `www` 再由版本化 `edgeone.json` 规则 301 到根域名并保留路径。
- ECS API CORS 已保留旧 Vercel 来源，并增加 EdgeOne 临时域名、根域名和 `www`；
  API 与数据库健康检查正常，不涉及数据库迁移。
- 生产验收：根域名与深链接返回 200，安全响应头生效；1248px 桌面视口内容宽度为
  1098px（88%），390px 手机视口无横向溢出。
- 唯一待人工验收项是真实手机号短信验证码登录，以及登录后的题库、音频和同步抽查。

## 外部变更顺序

1. 已推送独立分支，并用直接上传方式完成 EdgeOne Production 部署。
2. 已验证构建、路由刷新、登录 UI 和请求目标。
3. 已在 ECS API 的 `CORS_ORIGINS` 增加 `https://readyoufife.com` 与
   `https://www.readyoufife.com`，重建 API 容器并验证健康状态。
4. 已绑定备案域名、添加阿里云 DNS 记录并完成免费 HTTPS 证书部署。
5. 待用户接管真实短信验证码后，完成登录、题库、音频和同步抽查。

## 回滚

- 前端异常：EdgeOne 恢复上一条 deployment，或临时撤回新域名记录。
- API 异常：恢复 API 上一镜像及原 `CORS_ORIGINS`；CORS 增量不涉及数据库迁移。
- 旧 Vercel 链路始终保留，不作为新站的数据回滚来源。
