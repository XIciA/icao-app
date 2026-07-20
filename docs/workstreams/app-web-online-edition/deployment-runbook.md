# Web 在线版 Vercel 发布与回滚

更新时间：2026-07-18

## 正式架构

```text
浏览器 → https://feizhuicao.com（Vercel 静态 SPA）
       → https://api.feizhuicao.com（ECS API）
       → https://cloud.feizhuicao.com（Supabase/Auth/资源）
```

Vercel 不保存题库或服务端用户数据；静态前端继续调用 ECS 和 Supabase。题库内容更新仍走既有服务端发布流程，不要求重新部署 Web。

## 环境要求

- Vercel Production / Preview 均配置 `EXPO_PUBLIC_ICAO_API_URL`、`EXPO_PUBLIC_SUPABASE_URL`、`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。
- 只允许公开 URL 和 publishable key 进入 Web bundle；禁止 secret/service-role/AI server key。
- ECS `CORS_ORIGINS` 精确包含正式 root、www 和当前受控预览来源；不得使用 `*`。
- 正式页面必须 HTTPS，才能稳定申请麦克风权限。
- `.vercelignore` 排除服务端源码、文档和内容生产源文件；Web 构建只上传 Expo 页面源码、生成后的题库索引、应用资源和所需 workspace package，不发布数百 MB 的内容生产目录。

## 发布

1. 更新并验证 `APP_DISPLAY_VERSION`。
2. 执行 `pnpm check:app`、`pnpm check:contracts`、`pnpm check:api`、`pnpm check:web`。
3. 用 Vercel Production 环境远程构建；先生成不切域名的生产部署。
4. 验证根路径、深链、静态资源、安全头、登录、题库、音频、录音和注销。
5. 记录当前 production deployment ID 作为回滚点。
6. 将已验证部署提升为 production，确认 `feizhuicao.com` 和 `www.feizhuicao.com` 的最终跳转策略。
7. 在正式域名重复 Chrome 核心轨迹、API CORS 和缓存刷新检查。

正式域名规范：`feizhuicao.com` 为 canonical 主入口；`www.feizhuicao.com` 使用 308 跳转并保留原路径。

## 回滚

- Web 故障：在 Vercel 将上一条 production deployment 重新 Promote/Rollback；不删除域名和 DNS。
- API 故障：使用对应 ECS `icao-api:rollback-<release>` 镜像和备份 compose/source 回滚，再验证 `/health/ready`。
- 回滚后清浏览器缓存或通过新的入口 HTML 引用旧 hash 资源；`/_expo` hash 资源可长期缓存。
- 回滚不得复制或恢复运行密钥到仓库、日志或聊天。
