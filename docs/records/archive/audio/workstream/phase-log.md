# 录音与全局音频生命周期阶段日志

> 历史工作流：当前架构见 `docs/rules/conditional/audio-lifecycle-and-change-rules.md`，当前排障见 `docs/records/incidents/audio-recording/README.md`。

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

## 2026-07-22：iOS 真机有效录音被误判回归

状态：根因修复与工程验证完成，真实麦克风复验待同网连接

- 截图错误码定位为 `recording_file_incomplete`。实际文件已经生成，但 native adapter 把 iOS `AudioRecorder.currentTime` 的毫秒值再次乘以 1000，仓库因此按放大 1000 倍的虚假时长校验文件大小并拒绝有效 WAV。
- adapter 改为在 stop 前交叉使用 `RecorderState.durationMillis` 和自身记录的实际经过时间，不再读取跨平台单位不一致的 `AudioRecorder.currentTime`。
- 新增 adapter contract 测试：mock 的 `currentTime` 一旦被读取就抛错，确保后续 Expo/录音改动不会重新依赖该字段；`check:audio` 同时加入静态禁止规则。
- 复用既有 `AudioSessionOrchestrator`、controller、`RecordingRepository`、`RecordingAsset` 和文件事务，没有新增第二时长来源、录音 owner 或删除路径。
- `pnpm check` 通过：App 55 suites / 241 tests，API 4 files / 208 tests；iOS Development Build 在连接的物理 iPhone 上完成编译与安装（0 errors、3 个既有 warnings）。
- 真机启动时 iPhone 处于 5G，无法访问 Mac 的局域网 Metro 地址 `192.168.1.2:8082`；需连接同一 Wi-Fi 后完成 2–3 秒真实麦克风录音复验。Android 本轮无连接设备，未生成 Android 新证据。

## 2026-07-28：真机回放与转写重复失效

状态：两条确定根因已修复，真实麦克风终验待用户在手机本体执行

- 从连接 iPhone 的 App 数据容器取证：历史 WAV 为 16 kHz、单声道、16-bit PCM，除明确的 header-only 失败样本外，多条文件有正常语音电平；当前安装版本的网络缓存实际访问 `https://api.feizhuicao.com` / `https://cloud.feizhuicao.com`，因此本轮不能再归因为麦克风完全无输入或真机仍使用 loopback API。
- 回放 consumer 在“尚无资产”的首次 effect 中调用 `player.remove()`，提前把仍挂载的 `useAudioPlayer` native shared object 从 Expo Audio registry 移除；录音成功后又把 URI `replace` 到这个已注销实例，导致回放装载/状态更新反复失效。现改为由 `useAudioPlayer` 独占释放，空资产不销毁实例，并新增从空资产 rerender 到已提交资产的回归测试及 `check:audio` 静态禁令。
- AI 同意的本地 key 没有按账号区分，而服务端同意是账号级。换邀请码账号、撤回或恢复本地存储后，本地可能错误跳过服务端登记，转写被 `ai_consent_required` / 会话错误拒绝，界面却统一显示为网络失败。现每次 AI 操作前幂等同步服务端同意，并对无语音、无效文件、同意不同步和登录失效分别显示原因；诊断事件记录错误码但不记录内容、URI、令牌或身份。
- ECS `/health/ready` 已确认 API/database 为 `ok`。既有 `verify-asr-live.mjs` 仍按普通 Supabase 测试账号建号，已被当前邀请码账号 guard 以 `invite_account_required` 拒绝；因此该脚本不能冒充本轮实时 ASR 通过证据，后续需单独迁移 live verifier。
- `pnpm check:audio` 与 5 个相关 Jest suites / 31 tests 已通过。本轮复用既有 orchestrator、adapter、repository、RecordingAsset、playback consumer 和 AI client，没有新增第二 owner、文件类型、删除路径或转写协议。
