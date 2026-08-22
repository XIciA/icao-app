# 随身听播放系统收口记录

> 2026-07-16 架构勘误：本文记录的 `AudioSessionCoordinator` 已由
> `src/platform/audio/audio-session-orchestrator.ts` 取代。随身听的 Track Player 后台/锁屏能力保持不变，
> 但音频 session、录音、录音资产和回放的当前规则以
> `docs/rules/conditional/audio-lifecycle-and-change-rules.md` 为唯一有效依据；不得按本文历史阶段重新建立旧 coordinator。

状态：已完成

收口日期：2026-07-16

## 结论

随身听已从页面内播放样例收口为全局原生播放系统。听力、900 句、故事复诵的 2,559 条现有曲目全部进入共享队列，具有真实时长、三种播放模式、三种字幕模式、拖动进度、倍速、搜索/筛选、迷你播放器、后台播放和系统媒体元数据。

2026-07-16 缺陷重开后，原 Expo Audio 锁屏能力边界已由 Track Player 原生队列替换：系统上一首/下一首、锁屏自然续播和原生单曲循环进入正式实现；同时增加当前曲目到精确学习卡片、再直接返回随身听的入口。双端真机锁屏人工复验仍作为发布前验收项保留，不能由构建通过代替。

## 共享所有权

- 题库维护源仍是曲目、字幕、音频和时长关系的唯一维护源。
- 时长由现有资源清单维护，由现有内容构建生成卡片运行时字段。
- 曲目使用现有 repository 的 remote/cache/embedded 链路；线上产物尚未含时长时，按音频路径使用同版 App 的共享 embedded 元数据兼容。
- 签名 URL、本地开发资源和过期刷新继续由原资源服务负责。
- 全屏页、迷你播放器与锁屏只订阅根级 Provider 的唯一 player/state。
- 题卡音频、录音和回放保留各自实例，但全部服从共享音频会话协调。

未引入随身听私有题库、私有音频映射、私有时长索引或第二资源解析器。

## UI 验收

- 复用暖白背景、墨蓝层级、钴蓝主操作与现有 serif/sans/mono 字体角色。
- 375 × 812 真实渲染中，全屏页所有信息和控制完整可见，无溢出或遮挡。
- 队列弹层在 375 宽度展示搜索、筛选、真实时长和虚拟化行，无拉伸与裁切。
- 迷你播放器在 375 宽度展示完整标题、播放/暂停、下一首和关闭，底部留出安全区/导航空间。

## 验证证据

- `pnpm content:build` 与 `pnpm content:check`：通过，5 bank / 7,133 cards / 6,081 resources，radio duration 2,559 / 2,559。
- `pnpm typecheck` 与 `pnpm lint`：通过。
- `pnpm test`：39 个套件、149 项测试通过。
- iOS Development Build：编译、启动、真实音频播放、375 × 812/430 渲染与休眠/唤醒后持续播放通过。
- Android Debug APK：`app:assembleDebug` 通过，APK 生成成功。

阶段 7 增量验证：Android Debug 原生构建通过（531 tasks）；iOS clean prebuild、Pods 自动链接、Simulator App 生成/安装/启动和生产 JS bundle 导出通过；合并后的 iOS/Android 配置均包含后台媒体播放能力。模拟器冷启动发现的 player setup 时序错误已修复并复验不再出现。最终 `pnpm check` 全链路通过，包含 App 39 suites / 149 tests 与 API 176 tests。Expo Doctor 为 17/19，Track Player 的 New Architecture 目录元数据提示作为升级风险保留，未影响当前原生编译。

## 平台边界

- Android 本轮完成原生编译与配置检查，未在 Android 实机上进行媒体通知人工视觉验收。
- iOS 模拟器无密码锁屏唤醒后直接返 App，因此验证了后台持续播放与媒体元数据注册，不将锁屏面板外观记为已人工视觉验收。
- 阶段 7 验收时已配对 iPhone 显示离线，因此新增的系统上一首/下一首、自动续播和单曲循环仍需在 iPhone 真机锁屏状态完成发布前人工复验。
- 本任务没有修改 API 或数据库，不需要 ECS 部署或迁移。

## 2026-07-16 方案 1 与播放间隔补充

- 全屏页已采用无页面标题、无明显分割线、无大封面与无答案卡片的呼吸留白方案；题名是唯一题目信息和精确学习入口。
- 题库目录、我的标注和随身听已收敛到同一个题库切换头部/抽屉组件，不再维护三份近似实现。
- 字幕关闭为轻量波形，字幕开启为无边框滚动文字；主要与次要控件均按现有尺寸体系缩小。
- 播放间隔为本机持久化的 0–30 秒整数。0 秒不改变旧队列；大于 0 秒复用 Track Player 的 30 秒本地静音占位、后台 service 和原生媒体时钟。
- 静音占位只属于 `RadioPlayerProvider` + playback service，不是新的音频 owner；它继续服从现有 `AudioSessionOrchestrator` radio lease。
- 本轮未引入第二播放器、第二题库/字幕/时长来源或第二资源解析链路，也未修改 API、数据库或 ECS。

补充验收以阶段日志第 8 节为准。真机锁屏/控制中心和 Android 媒体通知必须以真实设备结果补记，不能由 Jest、模拟器或构建成功替代。

本轮自动化与构建证据：相关 8 suites / 38 tests 和最终 `pnpm check`（App 43 suites / 201 tests、API 176 tests）通过；30 秒静音文件经 `ffprobe` 与双端生产导出确认；Android Debug 与 iOS Simulator 原生构建通过。由于模拟器没有登录会话，375/390 只能验证 App 安装启动，未完成受保护随身听页的真实状态截图；430 宽同样待补。两条 `audio:e2e` 命令因本机缺少 Maestro 在前置检查停止，未生成平台指纹。上述待验项目保持开放，不影响代码完成结论，也不得在发布验收中被省略。
