# Web Vercel 后端分离阶段记录

## 2026-07-28：新浏览器题卡音频首帧恢复

- 代表性音频文件、跨域、Range 和不可变缓存检查正常；故障集中在 Web 新会话自动播放受限后，Expo Web 仍报告播放请求但时间停在 0 秒。
- Web 第一段音频改为等待用户点击；首帧真实前进后才允许本次学习会话后续切题自动播放。iOS、Android 原有自动播放路径不变。
- 每个 Web 播放请求增加 6 秒首帧期限；超时会暂停、释放既有 `study` lease，并显示可重试状态，不再无限转圈。
- 继续复用 `StudyAudioPlayer`、`AudioSessionOrchestrator`、题库资源 resolver 和唯一 Expo player；没有增加第二个音频 owner、播放器、资源映射或时长来源。
- 回归测试覆盖 Web 首次手势、首帧解锁、后续切题自动播放、首帧超时，以及 iOS/Android 自动播放行为。

## 2026-07-28：不改变海外部署的 Web 性能优化

- Web 根布局不再等待约 14 MB 的 Noto Serif SC 字体文件；Geist UI 字体后台加载，中文标题使用系统衬线回退。Native 继续加载原有五套字体，显示路径不变。
- Web 题库 release 与 App 内置 releaseVersion 一致时直接复用已构建数据；版本不一致时仍读取 Vercel 不可变镜像。模块内增加内存缓存、同题库在途请求去重和校验后的 IndexedDB 快速路径。
- 题库目录的学习进度改为 Web 单事务批量读取，避免 OPI、陆空通话目录并发创建数百个 IndexedDB 事务；Native 继续使用原有逐题组读取路径。
- Web 题目资源改为同步解析不可变 Vercel URL，学习页预加载后两题音频；没有新增音频 owner、播放器或 session 生命周期。
- Web 随身听只在用户打开随身听后加载目录和准备音频，不再在登录完成后与题库页面争抢网络、解析和存储资源。
- Expo 字体导入收敛到实际使用的四个字重，导出资源从 55 项降至 23 项；Noto Serif SC 不再进入 Web 导出。Web 首包 Brotli 由线上约 2.45 MB 降至本地产物约 1.70 MB。
- `pnpm check` 全量通过：65 个 App Jest suites / 286 tests、8 个 API suites / 235 tests、题库/热点/内容/词汇/ASR、TypeScript、Lint、contracts 和 API build 均通过；`check:audio` 确认音频架构边界未变化。

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
