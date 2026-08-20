# 录音故障与排障记录

状态：历史记录，不是现行规则

本文保留已经验证过的诊断知识。文中的命令式表述只反映当时的排障方法；新任务应以当前
代码、当前证据和 `docs/rules/` 为准。

适用范围：按住说话、麦克风权限、Expo recorder、录音停止与提交、录音回放、音频 session、录音上传及语音转写。

## 1. 文档职责

开始处理录音问题时，按需读取：

1. [`docs/rules/problem-solving-and-maintenance/recording.md`](../../../rules/problem-solving-and-maintenance/recording.md)：录音生命周期的当前架构规范和验收边界。
2. 本文：唯一现行排障方法、诊断编号、已知根因和真机验收入口。
3. `docs/records/archive/audio/`：只在需要追溯时读取的历史事故和已结束工作流。

不得再创建第二份现行录音事故指南。需要修改架构不变量时，先修改主指南，再更新本文。
非音频任务、只改无关文案/样式的任务不需要读取本目录。

## 2. 长期解决原则

录音链路必须按以下独立阶段看待：

```text
permission
  -> previous audio owner deactivation
  -> recording session acquisition
  -> iOS audio mode activation
  -> native recorder prepare
  -> native recorder start
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
- 把隐式时序改为明确状态机、generation、lease token 或幂等操作。
- 将平台差异隔离在 adapter，不让 UI 猜测原生单位或状态。
- 将故障转为稳定、可诊断的错误码，不用“网络错误”覆盖所有失败。
- 添加能复现真实状态转换的回归测试，而不只测试最终渲染。
- 添加静态门禁，阻止已经确认的危险调用重新进入。
- 刷新 Development Build、真机和平台指纹证据。

只增加重试、延时、条件判断、吞掉异常或修改报错文案，默认视为补丁，除非事故记录证明它恢复了明确的不变量。

## 3. 不得破坏的边界

- `AudioSessionOrchestrator` 是唯一全局 session 协调者。
- `RecordingEngine` 是三端唯一录音生命周期控制器；`useSpeakingRecordingController` 只连接
  React/UI 与 Engine。
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

### 诊断编号与安全字段

每次原生录音从按下开始生成一个 `R-xxxxx-xx` 诊断编号，错误界面会显示该编号。内存诊断只允许包含：

- App 显示版本、构建号、平台、系统大版本、阶段、错误码和相对耗时；
- 当前 audio owner，录音器的 `canRecord`、`isRecording`、`mediaServicesDidReset`，最终时长、文件字节数和格式；
- 是否检测到系统 metering 数值；
- 不允许包含录音内容、录音 URI、账号、回答正文、Token 或设备身份。

诊断编号只用于关联同一次操作，不代表根因。TestFlight 只允许在用户主动提交反馈时附带本次故障最多 30 条脱敏事件；不得自动上传诊断。客户端最多保留 50 条，超过 24 小时必须清除。用户主动提交后，诊断与所属反馈工单采用同一 365 天保留期；到期时先删除附件对象，再删除整个工单及诊断，不能把诊断无限期单独保留。

录音开始前错误按阶段区分，禁止再统一折叠为 `record_prepare_failed`：

| 错误码 | 含义 | 首查 |
| --- | --- | --- |
| `microphone_permission_denied` | 用户未授予麦克风权限 | 系统权限和重新授权入口 |
| `recording_owner_pause_failed` | 上一个音频 owner 未能真实暂停 | owner `deactivate()` 与播放器状态 |
| `recording_owner_pause_timeout` | 等待上一个 owner 暂停超过上限 | 未完成的播放 Promise、session 队列 |
| `recording_audio_mode_failed` | iOS 录音 profile 激活失败 | orchestrator 唯一 mode 调用、lease |
| `recording_audio_mode_timeout` | 录音 profile 切换超时 | 串行队列、系统音频服务状态 |
| `recording_native_prepare_failed` | 原生 recorder 的 prepare 失败 | recorder 状态和原生错误类别 |
| `recording_media_services_reset` | iOS 音频服务在准备或录音中重置 | recorder generation、临时资源清理 |
| `recording_native_start_failed` | prepare 成功但开始录音失败 | `record()` 调用与 recorder 状态 |

底层 prepare/start/stop Promise 超时或系统音频服务重置后，Engine 必须清理本次未提交 raw
文件、释放 recording lease，并以 `operationId` / `runtimeEpoch` 隔离迟到结果。被污染的 runtime
只能在迟到 Promise 完成后重建；未知错误不得盲目重试，整个过程不得删除上一份已提交录音。

Audio owner 的 `deactivate()` 必须可重复调用并等待真实暂停完成。原生 session 切换或 owner 暂停超过上限后，orchestrator 在迟到调用真正结束前会让后续请求立即返回同一稳定超时码，禁止后续操作永久等待或越过迟到调用。迟到调用完成后，下一次显式重试会重新执行幂等暂停和 profile 切换；若底层调用始终不返回，只能由用户重启 App 重新建立原生音频会话，不能在同一进程内盲目解除保护。

原生文件错误按以下优先级区分：

| 错误码 | 含义 | 首查 |
| --- | --- | --- |
| `recording_source_missing` | stop 后始终没有源文件 | recorder stop URL、系统中断 |
| `recording_container_invalid` | 文件存在但并非声明的 M4A/WAV 容器 | preset、扩展名与输出格式 |
| `recording_file_incomplete` | 容器尚未写完或没有媒体数据 | iOS finalization、文件尾部 metadata |
| `recording_too_short` | 实际按住不足 400 ms | 手势 press in/out |
| `recording_commit_failed` | 容器有效但 pending/move 事务失败 | cache 空间、复制与目标校验 |

当前 iOS 唯一正式录音格式是单声道 M4A/AAC；Android 保持既有 M4A，Web 保持浏览器原生压缩格式。静音不是文件损坏：只要容器和媒体数据有效，repository 就必须提交，是否存在可识别语音由转写层决定。

### A. 固定测试环境

记录以下信息：

- App 显示版本、native build number、commit 或明确文件集。
- iOS/Android、系统版本、设备型号。
- Development Build 或 Release，是否依赖 Metro。
- 实际 API/Supabase 地址，不能只看 `.env.local`。
- 当前账号类型、登录状态、麦克风权限和网络。

### B. 判断录音是否真实生成

依次确认：

1. 上一个 audio owner 是否真实暂停，recording lease 和 profile 是否成功激活。
2. recorder 的 prepare 与 start 是否分别成功，不能用同一个 UI 错误代替阶段证据。
3. recorder 是否进入 recording 和 finalizing。
4. stop 是否返回有效 URI、时长和格式。
5. raw 文件是否存在；停止后最多等待约 2 秒，检查 M4A 的 `ftyp`、`moov`、非空 `mdat` 或 WAV 的 `RIFF/WAVE`、`fmt`、非空 `data`。
6. repository 是否完成 pending、原子 move 和最终校验。
7. `RecordingAsset` 是否已发布到学习会话。
8. 真机文件是否具备目标容器、合理采样率/声道和实际语音电平。

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
pnpm test:recording
pnpm typecheck
pnpm check:ios:testflight
git diff --check
```

- 运行与改动直接相关的 recorder、repository、orchestrator、playback 或 workbench 测试。
- 用户以 TestFlight 为最终验收环境时，聚焦检查通过后直接构建并上传同一提交的候选包；只有直接
  路径被阻塞或必须回答底层诊断问题时，才增加 Development Build。
- 发布敏感变化用 `pnpm audio:e2e:ios` 或 `pnpm audio:e2e:android` 刷新对应平台指纹。
- 真实麦克风、后台/前台、拒绝权限、快速松手、连续录音和切题检查按受影响链路选择。

验收记录必须区分“自动化通过”“构建安装通过”和“真实麦克风闭环通过”。

## 7. 当前 iPhone 故障结论（2026-08-12）

- 症状：TestFlight 录音松开后显示“没有生成有效录音文件”。
- 已排除：7 月 22 日曾发生的 `AudioRecorder.currentTime` 重复换算问题；当前 adapter 不读取该字段，静态门禁也禁止重新使用。
- 本轮实现根因：iOS 使用自定义 WAV/PCM，但 repository 依赖时长字节率并在两个稳定小尺寸读取后提前结束等待；该判断既不能证明 WAV 容器完成，也不适用于压缩音频。
- 长期修复：iOS 采用 M4A/AAC；repository 最长等待约 2 秒并验证真实容器；提交事务完成前保留旧资产；安全诊断贯穿同一次录音。
- 自动门禁：容器、延迟 finalization、文件缺失、错误容器、header-only、partial copy 和 native 时长契约均有测试；TestFlight 不允许绕过音频指纹。
- 待完成：`com.readyoufife.ios.dev` 真机矩阵与随后新的 TestFlight 真机矩阵。构建或自动化通过不得写成真机通过。

## 8. TestFlight 准备阶段故障与收口（2026-08-14—2026-08-20）

- 环境：iPhone TestFlight 正式测试包，学习题卡按住说话。
- 现象：界面显示“录音准备失败，请稍后重试。（诊断编号：`R-MVIOF-07`）”。
- 已知事实：该编号对应当次操作在 native start 之前失败；现有笼统错误可能来自上一个 owner 暂停、session/profile 切换或 recorder prepare。
- 未知项：当前证据不能证明是哪个子阶段，也不能证明 M4A 文件机制再次失效。不得沿用 2026-08-12 的文件 finalization 根因解释本次错误。
- 收口实现：三端生命周期统一迁入 `RecordingEngine`；adapter、repository 和
  `RecordingAsset` 保持单一所有权，以 operation/runtime 隔离快速松手、重复停止、中断、超时和
  迟到结果；Native M4A 容器在提交前做确定性校验。
- 发布结果：`1.0.0 (3470179)` 已上传 App Store Connect，处理状态为 `VALID`，并加入既有内部
  TestFlight 分组；显示版本为 `v2026.08.20.0014`。
- 验收状态：自动化、Archive、签名、IPA、正式运行时地址和麦克风权限检查已通过；手机本体的
  真实麦克风、回放和转写闭环仍需测试者安装该构建后完成，未确认前不得写成真机通过。

### 本次必须完成的真机矩阵

- 冷启动后分别录制 1 秒、3 秒和 10 秒并回放。
- 连续录音 10 次；播放题目音频后立即录音。
- 重录且新录音成功前旧录音仍可用；切题、退出并重新进入后再次录音。
- 录音中切换后台再返回；权限关闭后重新开启。
- 分别使用扬声器、有线耳机和蓝牙路线（设备具备时）。
- 每项分别记录“自动化、安装、真实麦克风、回放、转写”，不得用其中一项代替另一项。

## 9. 唯一文档维护规则

- 新故障直接在本文追加“日期、环境、证据、根因、修复、门禁、真机状态”，不再新增现行 incident 文件。
- 架构不变量只写在主音频指南；本文只保留排障、诊断和事故结论。
- 旧事故和已结束 workstream 均在 `docs/records/archive/audio/`，不得作为当前实现依据。
- TestFlight、App Store和Android Release前的双文档阅读确认、真机证据、AI live证据及命令以 [`AI 学习运行时唯一排障文档`](../ai-learning-runtime/README.md#9-发布前必读确认) 为唯一操作入口；本文不维护第二套发布命令。
