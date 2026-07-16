# 随身听播放系统阶段日志

> 2026-07-16 架构勘误：阶段 3/7 中的 `AudioSessionCoordinator` 是历史实现，现已删除并迁移到
> `AudioSessionOrchestrator`。历史验收结论保留，后续音频变更必须遵循
> `docs/guides/audio-lifecycle-and-change-rules.md`。

状态：已完成

更新时间：2026-07-16

## 阶段 0：冻结基线

状态：已完成

- 大流程四文档已确认，题库内容迁移已收口。
- 随身听范围冻结为听力 1,223、900 句 900、故事复诵 436，共 2,559 条。
- 旧时长索引可对账 1,827 条，需从正式音频补齐 732 条。
- 只读设计仓库未修改，用户现有 dirty worktree 未回退或覆盖。

复用审查：题库维护源、repository、资源 resolver、`AudioTimeline`、主题令牌和 KV 存储继续作为共享基础。

## 阶段 1：共享时长与曲目 contract

状态：已完成

- 在现有资源清单条目增加 `durationSeconds`，资源清单版本更新为 5。
- 旧索引 1,827 条作为一次性导入，其余 732 条使用 `ffprobe` 从正式音频读取。
- 内容构建生成卡片级 `audioDurationSeconds`；`content:check` 阻止 radioEligible 曲目缺时长。
- 2,559 / 2,559 条曲目具有正数时长。

复用审查：只扩展现有 `question-bank-content.mjs` 和 schema，未建立随身听私有索引或第二内容工具。

## 阶段 2：队列、全局 Provider 与持久化

状态：已完成

- 从共享题库 repository 派生全量 `RadioCatalog`，删除 50 条截断和手写曲目范围。
- 可测试队列支持顺序循环、单曲循环、随机避免连续重复与随机历史返回。
- App 根布局挂载唯一 `RadioPlayerProvider`，全屏页、迷你播放器和系统媒体信息共享同一 player/state。
- 保存 bank、track、位置、模式、字幕、倍速和各 bank 最后曲目；冷启动不自动出声。

复用审查：复用 `loadQuestionBank`、现有本地/签名 URL resolver、force-refresh 和 `expo-sqlite/kv-store`。

## 阶段 3：共享音频会话

状态：已完成

- 建立 `AudioSessionCoordinator`，统一 radio、study、recording、recordingPlayback profile。
- 新 owner 启动前暂停旧 owner；录音结束不自动恢复随身听。
- `StudyAudioPlayer` 和 `SpeakingPracticePanel` 不再独立写入全局音频模式。

复用审查：各功能保留各自适合的 player/recorder，只共享全局焦点所有权。

## 阶段 4：全屏 UI 与虚拟化队列

状态：已完成

- 按暖白、墨蓝、钴蓝令牌重构页面，删除负 margin、静态进度条和厚重堆叠。
- 三模块、三播放模式、三字幕模式、4 档倍速、上/下一首、播放/暂停和拖动进度全部接入真实状态。
- 字幕可独立滚动；队列使用 `FlatList`，支持中英文/标题搜索、题组筛选、真实时长和当前态。
- 375 × 812 和 430 宽度完成真实渲染，并修复筛选器拉伸、时间重叠和小屏底部裁切。

复用审查：复用 `TopBar`、`BottomSheet`、`TextField`、`AudioTimeline`、`AppText` 和现有主题令牌。

## 阶段 5：迷你播放器、后台与锁屏

状态：已完成

- 迷你播放器提供回全屏、播放/暂停、下一首和关闭，学习页自动隐藏。
- `expo-audio` 显式开启后台播放、关闭后台录音；iOS audio background mode 与 Android media playback service/permission 已生效。
- 播放时注册唯一锁屏 active player，同步标题、飞猪 ICAO、模块/题组元数据与系统快进/快退。
- iOS 模拟器验证屏幕休眠/唤醒过程中播放进度继续推进；Android Debug APK 编译通过。

限制记录：Expo SDK 55 的 lock-screen options 只暴露 seek forward/back 开关，不提供独立上/下一首配置；App 内上/下一首已完整实现。

## 阶段 6：验证与收口

状态：已完成

- `content:build`、`content:check`、TypeScript、ESLint 与全量 Jest 通过；Jest 为 36 个套件、130 项测试。
- iOS Development Build 编译、启动、真实音频播放与模拟器渲染通过。
- Android `app:assembleDebug` 通过。
- 未修改 `services/api` 或数据库，无 ECS 部署或迁移项。

## 阶段 7：锁屏控制修复与学习入口

状态：实现完成，等待双端真机锁屏人工复验

- 将随身听唯一播放引擎从 Expo Audio 单 source 迁移到 `react-native-track-player@4.1.2`，使用“当前 + 下一首”的原生短队列和原生单曲循环。
- iOS/Android 系统媒体上一首、下一首、播放、暂停和进度事件均路由到与页面按钮相同的 Provider 命令。
- 手动下一首在单曲循环模式下仍前进；上一首在播放过程中立即切换，不再先 seek 到本题开头。
- 新增“学习本题”，携带 bank/category/topic/card 精确进入学习页；进入前暂停，学习页顶部和系统返回均保存后直接回随身听。
- 队列弹层打开时自动定位当前曲目。
- 根 Provider 先等待原生 player setup 完成再挂载 Track Player hooks，修复 Development Build 冷启动时的 `player is not initialized` 未处理 Promise。
- 继续复用共享题库 repository、时长、资源 resolver、KV 快照和 AudioSessionCoordinator；没有新增内容、字幕、时长或 URL 的第二来源。

验证记录：

- 全量 Jest 独立运行通过：39 个套件、149 项测试；新增队列、系统远程事件、学习入口和直接返回覆盖。
- Android `app:assembleDebug` 通过（531 tasks），合并 manifest 已确认媒体播放前台服务和权限。
- iOS `expo prebuild --clean --no-install`、`pod install`、原生 Simulator App 生成/安装/启动和生产 JS bundle 导出通过；原生 Track Player/SwiftAudioEx 已完成自动链接。
- 模拟器首次运行发现并修复 player setup 时序问题；热重载后不再出现初始化错误。模拟器当前无登录会话，受保护的随身听页视觉增量由组件测试覆盖，未将登录页截图冒充功能页验收。
- 最终 `pnpm check` 在无原生编译并发时完整通过：内容/词汇/发布配置、TypeScript、ESLint、39 个 App Jest 套件（149 tests）、contracts 及 API 176 tests 全部通过。
- Expo Doctor 17/19：其目录元数据仍将 Track Player 标记为未声明支持 New Architecture；当前双端原生编译使用兼容层通过，但保留为后续升级观察项。另有仓库现存 Expo patch 版本提示，本轮不跨范围升级。

真机锁屏/控制中心属于发布前人工验收项，不以模拟器或编译结果冒充。当前已配对 iPhone 显示离线，无法在本轮完成真实锁屏面板验收。

## 阶段 8：方案 1 UI 与原生播放间隔

状态：实现完成；自动化、资源打包与双端原生构建通过，真机媒体面板和受保护页面视觉人工验收待补

- 抽取 `QuestionBankSwitcherHeader`，题库目录、我的标注和随身听复用同一头部、选中态、图标尺寸、底部抽屉与无障碍交互。
- 随身听改为“呼吸留白”方案：移除标题分割线、大封面、重复元信息、常驻答案卡片和文字式学习按钮；题名成为唯一题目信息与精确学习入口。
- 字幕关闭显示轻量波形，播放时克制呼吸、暂停/等待静止并遵循系统减少动态；英文/中英字幕使用无边框滚动文本。
- 控件统一为 40/20 顶部操作、56/24 主播放、44/22 切题与 18 二级图标；新增 0–30 秒整数间隔抽屉和快捷值。
- 新增经 `ffprobe` 验证为 30.000 秒的本地静音 WAV。0 秒保持旧原生队列，间隔大于 0 时由 Track Player service seek 静音轨道并用原生媒体时钟等待。
- Provider 新增 `intervalSeconds`、`intervalRemaining`、`waitingForNext` 与 `setIntervalSeconds`，快照升级 schema 2 且兼容 schema 1。
- 等待中暂停/继续、手动跳过、三模式后续替换、间隔重置、内容倍速恢复和静音异常跳过均在唯一 Provider/service 中处理。

复用审查：继续复用 `RadioPlayerProvider`、Track Player、`AudioSessionOrchestrator`、共享题库 repository、资源 resolver、`AudioTimeline`、主题令牌和 `BottomSheet`；未新增 player、session owner、题库副本、字幕副本、时长副本或 URL resolver。

验证记录：

- 相关回归为 8 个 Jest 套件、38 项测试；覆盖旧 0 秒路径、1/5/30 秒 seek、三种模式队列策略、远程上一首/下一首、倍速恢复、旧快照迁移、无边框字幕/波形、间隔快捷值、共享题库切换与精确学习入口。
- 最终 `pnpm check` 全链路通过：内容 5 bank / 7,133 cards / 6,081 resources，词汇 3 books / 838 words，发布配置、`check:audio`、TypeScript、ESLint、App 43 suites / 201 tests、contracts、API 3 files / 176 tests 与 API build 全部通过。
- `ffprobe` 确认 `radio-interval-silence-30s.wav` 为 30.000000 秒、480,078 bytes；iOS/Android `expo export` 均把该文件收集为生产资源。
- Android `./scripts/with-android-env.sh ./android/gradlew -p android :app:assembleDebug` 成功（531 tasks）；iOS 对指定 Simulator 的 clean DerivedData `xcodebuild` 成功并生成 `ICAO.app`。
- iOS App 已安装并启动于 375 和 390 宽模拟器，但两台均无登录会话，只能到受保护路由前的登录页；没有把登录页截图冒充随身听视觉验收。430 宽、各播放状态和弹层仍需有可用登录会话后补做真实渲染对比。
- `pnpm audio:e2e:ios` 与 `pnpm audio:e2e:android` 已真实执行，但本机缺少 Maestro，均在测试前置条件停止，因此没有生成虚假指纹。当前无 Android 设备；iPhone 虽显示已配对可用，锁屏/控制中心仍需要登录、播放和人工观察，未记为通过。
- 本阶段未修改 `services/api`、数据库或 ECS；无部署与迁移项。
