# EdgeOne 三端同步 Web 上线方案

状态：执行中
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
- SPA fallback、安全响应头和静态缓存：`edgeone.json`
- 必需公开环境变量：
  - `EXPO_PUBLIC_ICAO_API_URL=https://api.readyoufife.com`
  - `EXPO_PUBLIC_SUPABASE_URL=https://cloud.readyoufife.com`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（从受控 ECS 环境复制，不写入仓库）

EdgeOne 的构建、环境变量和 SPA fallback 规则以官方文档为准：
[构建指南](https://pages.edgeone.ai/document/build-guide)、
[edgeone.json](https://pages.edgeone.ai/document/edgeone-json)。

## 外部变更顺序

1. 推送独立分支并创建 EdgeOne Preview。
2. 验证 Preview 构建、路由刷新、登录 UI 和请求目标。
3. 在 ECS API 的 `CORS_ORIGINS` 增加 `https://readyoufife.com` 与
   `https://www.readyoufife.com`，重建 API 容器并验证健康状态。
4. EdgeOne 绑定已备案域名并按控制台要求添加阿里云 DNS 记录。
5. HTTPS 生效后，用真实验证码完成登录、题库、音频和同步验收。

## 回滚

- 前端异常：EdgeOne 恢复上一条 deployment，或临时撤回新域名记录。
- API 异常：恢复 API 上一镜像及原 `CORS_ORIGINS`；CORS 增量不涉及数据库迁移。
- 旧 Vercel 链路始终保留，不作为新站的数据回滚来源。
