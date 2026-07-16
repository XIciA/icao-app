# 录音与全局音频生命周期阶段日志

更新时间：2026-07-16

## 阶段 0：基线审计

状态：完成

- 确认故障不是单一 UI bug，而是录音、session、文件、回放和发布耦合。
- 冻结 Track Player、现有录音 UI、AI API 和客户端-only 边界。
- 记录用户已有 `app.json` build number 与展示版本改动，未覆盖或回退。

## 阶段 1：共享内核

状态：完成

- 新增唯一 `AudioSessionOrchestrator`、安全诊断、纯状态机、`RecordingAsset` 和事务 repository。
- 删除旧 coordinator，不保留兼容层。
- 状态机、orchestrator、repository 单测覆盖 happy path、非法转换、超时、pause/mode 失败、stale lease、header-only、partial copy 和 orphan cleanup。

复用审查：仅扩展共享平台层和学习 session；没有第二 profile/type/repository。

## 阶段 2：录音工作流迁移

状态：完成

- `SpeakingPracticePanel` 只保留手势与渲染。
- controller 处理权限、prepare、record、idempotent stop、generation、后台/卸载/中断。
- commit 后立即写学习 session、展开答案和切“我的回答”；转写 key 改为 asset ID。
- 回放改为独立 stable player/replace-only consumer，失败不清资产。

复用审查：继续使用现有 `AudioTimeline`、StudyWorkbench、AI client 和转写 API。

## 阶段 3：其它音频 owner 迁移

状态：完成

- Radio Track Player 和 StudyAudioPlayer 均注册 async deactivate 并持有 token lease。
- 暂停、结束、错误、后台、source 切换和卸载释放 lease。
- recording 独占时其它播放请求失败关闭；release 不自动恢复之前音频。

## 阶段 4：工程门禁

状态：实现完成，设备运行待执行

- `pnpm check:audio`、ESLint restricted imports、Dev-only deterministic recorder/transcriber、Maestro flow 和平台 fingerprint gate 已落地。
- Release config、iOS/Android standalone build 均显式拒绝 E2E flag。
- 当前工作机未安装 Maestro，因此没有生成 `.generated/audio-e2e` 通过证据。

## 阶段 5：文档治理

状态：完成

- 新增长期指南，固定所有权、依赖方向、不变量、错误码、排障和设备矩阵。
- AGENTS 要求音频变更先读指南并复用 shared owner/repository。
- 随身听 closeout/phase-log/technical-plan 标注旧 coordinator 已被取代。

## 阶段 6：最终验证

状态：自动检查与双端编译完成，设备终验待执行

- 最终 `pnpm check` 通过：App 41 suites / 177 tests、API 176 tests，并包含内容、词汇、contracts、TypeScript、ESLint、release config 和 architecture check。
- Expo Doctor 17/19；保留既有 Track Player New Architecture 元数据提示和仓库锁定 Expo patch 版本提示，本工作流未跨范围升级依赖。
- iOS Debug Development Build 在 iPhone 16e Simulator 编译、安装和启动通过；Android `assembleDebug` 531 tasks 通过。
- Android Emulator 已存在不同签名的同包名 App，Debug APK 安装被 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 拒绝；未擅自卸载和清空现有数据。
- iOS Simulator 实际渲染了 900 句学习录音页。检查期间发现并修复了“无资产也调用 `replace(null)` 导致误报回放失败”和 Fast Refresh 后访问已释放 native shared object 两个问题；空资产复验不再显示回放错误，最终 App shell 重启无红屏，相关卸载/播放生命周期测试通过。正式登录路由随后由并行开发恢复，因此没有再用临时入口伪造最终截图；这仍不替代真机录音验收。
- 本机没有 Maestro，确定性 E2E 未运行；iPhone 30 次与真实麦克风冒烟仍待设备终验。
