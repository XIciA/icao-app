# Web Vercel 迁移技术盘点

状态：盘点完成

更新时间：2026-07-28

## 1. 迁移前事实

- Expo Web 已经存在并部署到 Vercel，页面和组件无需重写。
- Web 与 iOS/Android 共用大部分路由、组件、主题、题库结构和业务规则。
- 迁移前 Web 静态站仍通过公开环境变量请求 ECS API、Supabase Auth/Storage 和题库资源。
- Web 已有 IndexedDB storage adapter、浏览器录音 adapter 和共享 AI 交互页面。
- iOS/Android 使用 Native 实现、现有 ECS API 和 Supabase；这些路径必须保持原样。

## 2. 可直接复用

- `src/app`、`src/components`、`src/theme` 和主要 `src/features` 页面。
- 题库 `content/question-banks`、资源 manifest、词汇和文章构建工具。
- 浏览器 IndexedDB 学习数据实现。
- 现有录音生命周期、`RecordingAsset` 和用户点击转写语义。
- AI 请求/响应契约、提示词意图和错误语义。

## 3. 必须替换的 Web 边界

| 边界 | 迁移前 | 迁移后 |
| --- | --- | --- |
| AuthProvider | Supabase + sync | Cookie session，不启动 sync |
| API client | ECS base URL | 同源 `/api/*` |
| 邀请码 | App 账号服务 | Web 独立环境变量 |
| 题库文本 | ECS API/embedded | 静态 release + 本机缓存 + embedded fallback |
| 音频/图片 | ECS/Supabase resolver | 10 个 Vercel 静态资源分片 |
| 词汇/文章 | ECS API | Vercel 静态 JSON release |
| AI | ECS API | Vercel Function → DashScope |
| 录音上传 | multipart 到 ECS | Function 接收 Base64 → Model Studio 48 小时临时文件 |
| 账户页 | 正式账号/云同步 | Web 体验版边界 |

## 4. 风险与门禁

- SPA catch-all 不得覆盖 `/api/*` Functions；由 Preview 实际请求验证。
- Web bundle 扫描不得出现 `api.feizhuicao.com`、`cloud.feizhuicao.com` 或 ECS IP。
- Vercel 请求体上限要求录音源文件不超过 3 MB；超限在浏览器端明确拒绝。
- 内容目录必须不可变；同步失败不得覆盖 `current.json`。
- Cookie 必须在 Preview 和正式域名均能刷新恢复。
- 公开静态资源不是 DRM；本项目邀请码只是体验入口，产品已接受这一边界。
- Vercel Hobby Blob 的月度高级操作额度不足以一次上传完整题库，因此题库使用 10 个小于 95 MB 的静态项目，并以稳定 FNV-1a 哈希分片。
- Fun-ASR 的 `file_urls` 不接受 Base64；Web 改用 Qwen3-ASR，并通过 Model Studio 临时文件解决跨境大请求不稳定。
- Vercel 消除了“未备案大陆 ECS 是 Web 必经链路”的主要问题，但不等于中国大陆全网绝对可达。

## 5. 基线与回滚

- 实现使用从仓库 HEAD 创建的独立干净工作树，避免部署主工作区的大量未提交改动。
- 迁移前 Vercel Production deployment 已记录，作为首次切换回滚点。
- ECS 不做发布、迁移、重启或删除；移动端继续使用它。
