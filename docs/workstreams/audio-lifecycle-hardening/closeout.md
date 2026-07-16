# 录音与全局音频生命周期收口

状态：代码与文档实现完成，设备终验待完成

日期：2026-07-16

## 已完成

- 全局 session、录音 controller、录音 repository 和 `RecordingAsset` 均只有一个实现。
- 录音 commit 已从 playback/ASR 解耦，答案发布、回放和转写成为三个隔离消费者。
- 重录、后台、卸载、原生中断、重复 stop、partial file 和 stale lease 有显式处理与测试。
- Radio 保留 Track Player 后台/锁屏能力；Study/Radio/Recording/Playback 统一租约协调。
- 静态架构检查、Dev-only Maestro adapter、Release flag guard 和平台 fingerprint gate 已落地。
- 长期指南、AGENTS 规则和旧随身听文档勘误已补齐。

## 共享复用与单一来源审查

- 复用共享题库 repository、资源 resolver、时长/字幕数据、`AudioTimeline`、学习 session 和 AI API。
- 没有新增题库、音频映射、时长、字幕、URL、转写协议或服务端第二来源。
- 已删除旧 `audio-session-coordinator`；结构检查禁止重新引用。
- 审查结论：代码结构中无第二音频 session owner、录音 lifecycle owner、RecordingAsset 定义或 committed-file 删除 owner。

## 验证状态

- `pnpm check`：通过。App 41 suites / 177 tests；API 176 tests；内容、词汇、contracts、TypeScript、ESLint、release config 和 audio architecture boundary 全部通过。
- Expo Doctor：17/19。失败项为既有 Track Player 未声明 New Architecture 支持，以及仓库锁定的 16 个 Expo patch 版本比当前推荐各低一个 patch；本轮未修改锁定依赖。
- iOS Development Build：iPhone 16e Simulator Debug 编译、安装、启动通过（0 errors、3 个既有 build warning）。
- Android Development Build：`assembleDebug` 531 tasks 通过。现有 Emulator 的同包名 App 使用不同签名，安装新 Debug APK 被系统拒绝；未删除模拟器现有数据。
- Release guards：显式 E2E flag 会被 release config 拒绝；缺失 `.generated/audio-e2e/ios.json` 时 fingerprint verify 会拒绝发布，均已负向验证。
- UI：iOS Simulator 已实际渲染 900 句学习录音页，并据此修复空资产误报回放失败及 Fast Refresh 访问已释放播放器的问题；复验空资产状态无误报，最终 App shell 启动无红屏，组件交互/布局/卸载测试通过。正式登录路由恢复后未再通过临时入口生成截图，也未把登录页或单测冒充录音页面视觉基线。

未完成且必须在发布前执行：本机未安装 Maestro，因此双端确定性 flow 没有生成证据；iPhone 真机 30 次矩阵、双端真实麦克风冒烟、正式验收截图、Android Emulator 安装/运行和物理 Android 集中终验均未完成。

## 部署

本工作流只修改客户端、测试、脚本和文档；未修改 `services/api`、数据库或运行时环境，因此不部署 ECS。最终发布仍需重新生成 iOS/Android 安装包，并先通过对应平台 audio fingerprint gate。
