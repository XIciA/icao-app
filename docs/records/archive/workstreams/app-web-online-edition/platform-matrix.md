# 历史归档：Web 在线版平台实现矩阵

状态：实现完成，等待正式域名验收收口

更新时间：2026-07-18

| 能力 | 共享 owner / 契约 | iOS / Android | Web | 结论 |
| --- | --- | --- | --- | --- |
| 路由和页面 | `src/app`、`src/features` | Expo Router 原生导航 | 同一路由树，SPA fallback | 共用 |
| 设计系统 | `src/components`、`src/theme` | RN 组件 | React Native Web | 共用 |
| 固定显示区域 | `AppViewport` | 直通真机尺寸 | 375 × 812 画布、10 px 手机外壳、纯色背景 | 平台适配 |
| 弹层坐标系 | `AppModal`、`ModalHost` | RN `Modal` | Portal 到手机画布内 | 平台适配 |
| 题库和词汇 | 现有 repository / checksum | SQLite 缓存 + ECS/Supabase | IndexedDB 缓存 + 同一 ECS/Supabase | 共用数据源 |
| 学习状态和同步 | `learning-sync`、`/v1/sync` | SQLite outbox | IndexedDB outbox | 共用规则 |
| 登录和账号 | `AuthService`、Supabase Auth | SecureStore | 浏览器持久会话存储 | 共用服务，底层适配 |
| API client | `src/platform/api-client` | 原生 HTTPS | HTTPS + 严格 CORS | 共用 |
| 前台题卡音频 | Expo Audio + orchestrator | 原生音频会话 | 浏览器媒体能力 | 共用控制，系统行为例外 |
| 录音 controller | `useSpeakingRecordingController` | Expo recorder | Expo recorder / MediaRecorder | 共用 owner |
| 录音资产 | `RecordingRepository` / `RecordingAsset` | FileSystem 文件 | Blob / object URL | 同一职责的平台实现 |
| 转写上传 | `audio-upload`、`ai-client` | Expo File/fetch | Blob/FormData | 平台适配 |
| 电台目录和状态 | `RadioPlayerProvider` 契约、共享 catalog/queue/snapshot | Track Player | Expo Audio 前台播放器 | 共用业务、不同引擎 |
| 后台与锁屏控制 | 原生系统 | 支持 | 不承诺与原生一致 | 已声明例外 |
| 邮件找回/换绑 | `EMAIL_DELIVERY_AVAILABLE` | 既有测试边界 | 明确显示暂未开放 | 已确认范围外 |

## 复用审查

- 没有复制题库 JSON、音频映射、时长、字幕、词汇、同步契约或资源解析。
- 没有新增第二个音频 session owner、录音 controller、录音资产类型或删除路径。
- Web 专属文件只承载浏览器运行边界；页面、业务状态、文案和数据规则仍由主工程共享。
