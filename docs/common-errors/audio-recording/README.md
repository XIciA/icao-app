# Audio Recording Guidance and Precautions

状态：长期维护

适用范围：按住说话、麦克风权限、Expo recorder、录音停止与提交、录音回放、音频 session、录音上传及语音转写。

## 1. 文档职责

开始处理录音问题时，按需读取：

1. [`docs/guides/audio-lifecycle-and-change-rules.md`](../../guides/audio-lifecycle-and-change-rules.md)：音频生命周期变更时的唯一架构规范和验收矩阵。
2. 本文：长期排障方法、注意事项和维护要求。
3. 本目录中与现象最接近的历史事故记录。

本目录不得定义第二套音频 owner、播放器、录音资产、文件清理或状态机。需要修改架构不变量时，先修改主指南，再在事故记录中链接变更。
非音频任务、只改无关文案/样式的任务不需要读取本目录。

## 2. 长期解决原则

录音链路必须按以下独立阶段看待：

```text
permission
  -> native recording
  -> stop result
  -> file validation and commit
  -> RecordingAsset publication
  -> playback
  -> upload
  -> account consent and authentication
  -> transcription
```

界面上同时出现“无法回放”和“无法转写”，不代表麦克风损坏。一个已提交的有效录音可以被两个下游消费者分别弄坏。诊断和修复必须保留阶段边界。

长期修复至少满足以下一项，最好同时满足多项：

- 消除重复 owner 或重复 source of truth。
- 把隐式时序改为明确 Engine 状态、operation ID、runtime epoch、lease token 或幂等操作。
- 将平台差异隔离在 adapter，不让 UI 猜测原生单位或状态。
- 将故障转为稳定、可诊断的错误码，不用“网络错误”覆盖所有失败。
- 添加能复现真实状态转换的回归测试，而不只测试最终渲染。
- 添加静态门禁，阻止已经确认的危险调用重新进入。
- 刷新目标 Release/TestFlight、真机和候选指纹证据。

只增加重试、延时、条件判断、吞掉异常或修改报错文案，默认视为补丁，除非事故记录证明它恢复了明确的不变量。

## 3. 不得破坏的边界

- `AudioSessionOrchestrator` 是唯一全局 session 协调者。
- `RecordingEngine` 是唯一录音生命周期 owner；`useSpeakingRecordingController` 只连接 React/UI。
- Expo recorder adapter 只负责原生录音，不发布业务资产。
- `RecordingRepository` 是已提交录音文件的唯一仓库和删除 owner。
- `RecordingAsset` 是录音成功后的唯一业务事实。
- 回放和转写是独立消费者；任一失败都不得撤销或删除已提交录音。
- `useAudioPlayer` 管理播放器释放。组件挂载期间不得手动调用 `player.remove()`。
- 原生时长使用 `RecorderState.durationMillis` 和 adapter 经过时间交叉校验，不使用平台单位不一致的 `AudioRecorder.currentTime` 推导毫秒。
- 本地 AI 同意只可作为界面提示；每次 AI 操作前必须幂等同步当前账号的服务端同意。
- 服务端暂存录音前必须把 iOS/浏览器报告的等价 MIME alias 规范化为存储桶和 ASR 支持的标准类型；不能只改文件扩展名。
- 禁止新增直接 `setAudioModeAsync` 调用、第二 recorder hook、第二录音文件目录或第二清理路径。

## 4. 标准排障顺序

### A. 固定测试环境

记录以下信息：

- App 显示版本、native build number、commit 或明确文件集。
- iOS/Android、系统版本、设备型号。
- TestFlight/Release build number、commit，是否仍意外依赖 Metro。
- 实际 API/Supabase 地址，不能只看 `.env.local`。
- 当前账号类型、登录状态、麦克风权限和网络。

### B. 判断录音是否真实生成

依次确认：

1. recorder 是否进入 recording 和 finalizing。
2. stop 是否返回有效 URI、时长和格式。
3. raw 文件是否存在、大小是否稳定。
4. repository 是否完成 pending → 正式文件的事务式提交和最终容器校验。
5. `RecordingAsset` 是否已发布到学习会话。
6. 真机文件是否包含可识别的 RIFF/WAVE 或目标格式头、合理采样率/声道和实际语音电平。

不要因为回放失败就推断文件无效，也不要因为播放器显示 `0:00` 就删除文件。

### C. 独立检查回放

- 录音 URI 只通过稳定 player 的 `replace(uri)` 装载。
- 确认 player 没有被提前 `remove()` 或被第二生命周期 owner 接管。
- 播放前后检查 `recordingPlayback` lease 的获取与释放。
- 检查文件仍存在；播放器错误不能触发 repository 删除。
- 检查加载错误、播放错误和 session 抢占错误是否分别记录。

### D. 独立检查转写

- 确认上传的是已提交资产，而不是 recorder 临时 URI。
- 确认运行包实际访问公网或预期测试端点。
- 先幂等同步当前账号 AI 同意，再检查 bearer token、邀请账号约束和接口错误码。
- 对照检查 multipart MIME、规范化后的 content type、暂存对象扩展名和存储桶允许类型；`audio/x-wav` 等价于 `audio/wav`，不能以未知 `.audio` 对象暂存。
- 区分 `no_speech_detected`、`invalid_audio`、`ai_consent_required`、会话失效和网络错误。
- 服务健康只说明后端可用，不能证明当前账号、文件和请求链路通过。

### E. 排除环境假象

- iPhone Mirroring 不能代替手机本体麦克风验收。
- 模拟器、静音确定性 E2E、历史成功请求和构建成功都不能代替本轮真机录音。
- Development Build 能通过 Metro 运行，不代表独立 Release 已内嵌正确运行时地址。
- `.env.local` 的值不等于已安装包实际使用的值，应以 bundle 或真机网络证据为准。

## 5. 修复设计审查

提交实现前逐项回答：

- 根因位于哪个阶段，证据是什么？
- 哪些相邻阶段已经被证据排除？
- 修复恢复了哪条既有不变量？
- 是否新增第二 owner、第二状态事实或第二文件清理路径？
- 失败是否仍会错误地回滚有效录音？
- 是否覆盖“初始无资产，随后录音成功”的真实渲染转换？
- 换号、权限变化、后台切换、重复松手、快速重录和组件卸载是否安全？
- 是否能用静态门禁或测试阻止同类代码再次出现？
- 若只能局部处理，限制和后续架构工作是否明确记录？

## 6. 风险匹配验证

音频生命周期或行为变化的最低自动化：

```text
pnpm check:audio
git diff --check
```

- 运行与改动直接相关的 recorder、repository、orchestrator、playback 或 workbench 测试。
- iOS 用户可见录音修复通过聚焦门禁后直接生成同一 commit 的 Release/TestFlight 候选；不把模拟器或 Development Build 设为固定前置阶梯。
- Android/Web 本轮未发布时只做共享 Engine 与 adapter 合同测试；对应发布任务再扩大到目标端真机。
- 真实麦克风、后台/前台、拒绝权限、快速松手、连续录音和切题检查按受影响链路选择。

验收记录必须区分“自动化通过”“构建安装通过”和“真实麦克风闭环通过”。

## 7. 事故维护流程

新的可复现故障、可复用根因或旧结论被推翻时：

1. 从 [`incident-template.md`](./incident-template.md) 复制新事故文件。
2. 调查开始时先填环境、现象和假设，避免结论倒推证据。
3. 调查完成后填根因、排除项、代码所有权和长期门禁。
4. 把本次新增的不变量同步到主音频指南。
5. 把测试命令、真机设备、平台指纹和未完成项写清。
6. 若历史事故的结论被推翻，直接修正文档并说明新证据，不能并列保留两个互相冲突的结论。

## 8. 已记录事故

- [`incident-2026-07-28-playback-transcription.md`](./incident-2026-07-28-playback-transcription.md)：有效真机录音无法稳定回放，账号同意漂移导致转写不可用。
- [`incident-2026-07-28-web-study-audio-first-frame.md`](./incident-2026-07-28-web-study-audio-first-frame.md)：Web 首次自动播放、用户手势和首帧看门狗的前两轮修复；真实 iPhone 后续证据已转入下一记录。
- [`incident-2026-07-28-web-study-audio-mobile-safari.md`](./incident-2026-07-28-web-study-audio-mobile-safari.md)：移动 Safari 因 `loadeddata/isLoaded` 播放门槛无法启动题卡参考音频。
- [`incident-2026-07-28-web-study-audio-mainland-delivery.md`](./incident-2026-07-28-web-study-audio-mainland-delivery.md)：中国大陆网络直连十个 `*.vercel.app` 分片导致题卡音频缓慢，迁移为 Git 构建生成的主站同域静态资源。
