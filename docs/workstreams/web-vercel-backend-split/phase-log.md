# Web Vercel 后端分离阶段记录

## 2026-07-28：App v10 跟随同步

- App 基准提交包含题库 v10、16 条 OPI 热点、听力中文选项和已验收的录音生命周期修复。
- Web 保留独立邀请码、本机学习数据、Vercel Functions 和零 ECS 网络边界。
- Web 通过平台能力文件隐藏转写按钮；Native 转写入口和行为不变。
- 资源 manifest 共 6081 项、814518693 bytes；v8 与 v10 完整 manifest SHA-256 均为 `94525c1fd882667345b733d2e26885c2f761e725b0f3b454b4e4c914e3533693`。
- v10 候选 release 为 `app-qb-v10-817646d597e77a8c`；复用 v8 十个不可变资源分片。
- OPI 热点校验：16 条、100 个话题引用、504 个题目引用。
- 听力中文选项校验：1223 张卡片、4892 条译文。
- v10 metadata 已发布到 `feizhuicao-v10-817646d5-content.vercel.app`，公开指针使用 `max-age=0`，版本目录和复用资源分片保持不可变缓存。
- Preview deployment `dpl_EvP3Rwgu8i2TSE8mDjZPpcUYh8cV` 运行正常，`/api/health` 明确返回 `app-qb-v10-817646d597e77a8c`。
- Preview 真实浏览器验收通过：邀请码登录、听力中文选项、16 条热点、真实题目详情、学习结束返回、热点深链刷新、手机和桌面宽度，以及 Web 转写入口隐藏。
- Production 切换前回滚点为 `dpl_FitcmUPfPgmXFoEZQX7bmGiCQr4J` 和 v8 release `app-qb-v8-7cf2feb27846afb2`。
- Production deployment `dpl_DNdkCPpPuCLkFq6cVwLZmVJk6z6Y` 已完成首次正式切换和验收；`feizhuicao.com/api/health` 返回 v10 release。
- 正式域名复验通过：1223 道听力题及中文选项、16 条热点、热点真实学习页、Web 转写入口隐藏，浏览器无运行错误。
- 回滚资源继续保留，不删除 v8 内容项目、旧 Production deployment 或 v10 内容项目。
