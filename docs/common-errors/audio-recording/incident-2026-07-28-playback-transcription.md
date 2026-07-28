# Audio Recording Incident: Playback and Transcription Regression

状态：录音与回放真机通过；转写 MIME 根因已修复并部署，手机界面重试待确认

日期：2026-07-28

## User-visible symptoms

- 真机按住说话后提示没有生成有效录音文件。
- 后续录音即使生成，回放仍可能不可用或状态停在 `0:00`。
- 点击转写后失败，界面曾统一提示网络错误。
- 问题随录音功能修改反复出现，单点补丁不能稳定消除。

## Environment

- Device: physical iPhone `OOMG`
- OS: iOS 26.5.2
- Bundle ID: `com.anonymous.icao-app`
- Native build number: `3449008`
- Runtime: standalone Release with embedded JavaScript
- API: `https://api.feizhuicao.com`
- Supabase: `https://cloud.feizhuicao.com`

## Evidence

### Recording files

从真机容器取得的历史 Expo Audio WAV 样本大多数满足：

- RIFF/WAVE、PCM signed 16-bit
- 16 kHz、mono
- 约 256 kbps
- 文件大小与时长相符
- 存在正常语音电平

少量约 4 KB 的 header-only 文件属于实际无效样本，但不能代表全部录音。证据排除了“真机麦克风始终没有录到声音”这一总括判断。

### Runtime and backend

- 真机网络缓存显示当前安装运行时访问公共 HTTPS API，不是 loopback 或局域网 Metro 地址。
- API readiness 检查通过，数据库状态正常。
- 历史同链路请求产生过有效转写，证明音频格式和 ASR 服务不是整体不可用。

### Native lifecycle

Expo Audio 的 managed player 会由 `useAudioPlayer` 负责注册和释放。录音回放 Hook 在初始无资产渲染时调用了 `player.remove()`，随后又在相同组件实例上调用 `replace(asset.uri)`。

这使仍挂载的 JS player 引用对应的原生对象已经从 registry 注销，破坏了后续装载、播放和状态更新的生命周期。

### Consent lifecycle

本地 AI 同意使用全局存储键，服务端同意按邀请账号保存。换号、撤回服务端授权或恢复本地存储后，会出现：

```text
local acknowledgement = accepted
server consent for current account = missing
```

旧逻辑因本地值为真而跳过服务端登记，转写接口随后返回账号同意或会话错误；界面又把它降级为通用网络错误。

### Physical-device transcription request

手机本体确认录音和回放正常后，ECS 访问日志记录了同一客户端连续执行：

```text
POST /v1/ai/consent    -> 201
POST /v1/ai/transcribe -> 503
```

这排除了录音、登录和账号同意阶段。修复邀请账号 guard 后的线上 verifier 使用真实 MP3 能完成暂存、ASR、结果读取和清理，证明供应商、密钥、模型和公共存储链路可用。

对同一个 16 kHz mono PCM WAV 做线上对照：

```text
multipart MIME audio/wav   -> success
multipart MIME audio/x-wav -> 503 asr_audio_upload_failed
```

API 只把 `audio/wav` 映射为 `.wav`，iOS 报告的等价 `audio/x-wav` 被暂存为未知 `.audio` 且保留非标准 content type，随后被存储桶拒绝。

## Root causes

### 1. Recording duration unit regression

较早的实现读取平台含义不一致的 `AudioRecorder.currentTime` 并再次换算，导致有效录音被 `recording_file_incomplete` 错误拒绝。

恢复的不变量：只使用 `RecorderState.durationMillis` 与 adapter 自己记录的经过时间交叉校验。

### 2. Premature managed-player removal

初始无录音资产不是组件生命周期结束，不得释放 managed player。

恢复的不变量：stable player 从 Hook 创建到组件卸载始终由 `useAudioPlayer` 管理；资产变化只使用 `replace(uri)`。

### 3. Local and account-scoped consent drift

本地提示状态被误当成当前服务端账号已经登记的证据。

恢复的不变量：每次 AI 操作前幂等同步当前账号同意；本地值只影响界面提示。

### 4. Error flattening hid the failing stage

录音格式、无语音、授权、登录和网络错误被压成同一个提示，使每次排障都容易从错误层级开始。

恢复的不变量：类型化错误必须保留失败阶段，诊断不得包含录音内容、URI、令牌或身份信息。

### 5. Equivalent iOS MIME aliases were not canonicalized

录音文件本身有效，但 API 把平台 MIME 字符串直接当作存储 content type，并只为少数精确字符串分配扩展名。等价的 WAV MIME 因此走向不同结果。

恢复的不变量：平台 MIME alias 必须在服务端边界规范化；content type 和扩展名必须作为同一格式事实一起产生。

## Rejected hypotheses

| Hypothesis | Evidence that rejected it |
| --- | --- |
| iPhone microphone never produced valid audio | Multiple physical-device WAV files had valid headers, duration, size and speech levels |
| Current app still used a LAN API address | Installed runtime network evidence showed the two public HTTPS endpoints |
| ASR service was completely unavailable | Readiness passed and representative historical requests produced transcripts |
| Current account consent still failed | The physical-device consent requests returned 201 immediately before each 503 transcription |
| The PCM WAV encoding was unsupported | The same generated 16 kHz mono PCM WAV succeeded as `audio/wav` and failed only as `audio/x-wav` |
| Playback failure meant the committed file should be deleted | Valid files existed independently of the deregistered playback consumer |

## Long-term fix

- Reused the existing `AudioSessionOrchestrator`, recorder adapter, `RecordingRepository`, `RecordingAsset` and playback Hook; no second owner or asset type was introduced.
- Removed mounted-player disposal from `useRecordingPlayback`.
- Made account-level consent synchronization idempotent before transcription and review.
- Added distinct user-facing and diagnostic handling for no-speech, invalid-audio, consent, session and network failures.
- Added a regression test for the real transition from “no recording asset” to “committed asset”.
- Added a regression test for local acknowledgement combined with missing current-account consent.
- Added an audio architecture gate that rejects `player.remove()` in the recording playback consumer.
- Added the managed-player and account-consent invariants to the canonical audio lifecycle guide.
- Canonicalized iOS WAV and M4A MIME aliases before storage upload, including both content type and object extension.
- Migrated the live ASR verifier to create and clean up an authorized temporary invite account so it exercises the production auth guard.
- Migrated the base deployment verifier from disabled public signup to administrator-provisioned temporary invite accounts.
- Added MIME alias regression coverage and a live `audio/x-wav` verification case.

## Verification

- [x] Recorder, repository, orchestrator, playback and AI workbench targeted tests: 5 suites / 31 tests
- [x] `pnpm check:audio`
- [x] Full repository `pnpm check`: App 285 tests; API 235 tests
- [x] Physical iPhone Debug native build
- [x] Standalone iOS Release build, embedded runtime validation, signing, installation and launch
- [x] Release bundle uses public API/Supabase endpoints and rejects loopback/LAN runtime
- [x] Phone-in-hand real microphone recording and playback
- [x] Production invite-account verifier with MP3
- [x] Production WAV control: `audio/wav` succeeds and pre-fix `audio/x-wav` fails with `asr_audio_upload_failed`
- [x] Post-deployment production `audio/x-wav` succeeds through `https://api.feizhuicao.com`
- [x] ECS container and database readiness healthy after deployment
- [x] Temporary verification account and staged audio cleanup
- [ ] Phone-in-hand real microphone → playback → transcription closeout
- [ ] Fresh platform audio-sensitive fingerprint after the real-device interaction

### Deployment evidence

- Release: `api-20260728-1424-asr-mime`
- Candidate image: `sha256:afbe22902c32c3a93e26163b1b3dcb4e418748840e741036c39554409773242a`
- Container health after public verification: `healthy`
- Rollback image and pre-deployment source/compose backup retained under the release-specific ECS backup path.
- Deployment source was copied from the current ECS runtime and only the reviewed ASR format resolver, its test, and the two live verifier scripts were replaced; unrelated dirty-worktree package files were not deployed.

## Remaining risks

- iPhone Mirroring explicitly prevents using the phone microphone from the Mac, so it cannot complete the final speech interaction.
- The repaired public verifier proves the same MIME and HTTPS route, but the already-installed phone UI still needs one user-triggered retry to close the exact interaction.
- iOS evidence does not replace Android Development Build and physical-device evidence when Android-sensitive code changes.

## Completion condition

On the installed Release build, use the phone itself to:

1. Hold to speak for at least 2–3 seconds.
2. Release and confirm the committed recording remains available.
3. Replay and hear the new recording.
4. Trigger transcription and receive either a transcript or an accurate typed failure.
5. Re-record once and confirm the new asset replaces the old asset without stale playback.
6. Record the result and refresh the applicable platform fingerprint.
