# 录音与全局音频生命周期技术方案

状态：已实施

## 架构

1. `src/platform/audio/`：串行 `AudioSessionOrchestrator`、递增 token lease、2 秒 timeout、独占 recording、idle release、隐私安全诊断 ring buffer/sink。
2. `recording/recording-state-machine.ts`：纯 reducer，非法事件无副作用。
3. `expo-recorder-adapter.ts`：唯一 native recorder/permission/preset 入口；Dev-only 确定性 raw WAV adapter 与真实能力同一端口。
4. `RecordingRepository`：raw 稳定校验、pending copy、大小检查、atomic move、session/orphan cleanup。
5. `useSpeakingRecordingController`：手势意图转为状态事件；generation、幂等 stop、AppState/interrupt、commit 后发布。
6. `useRecordingPlayback`：稳定 player、replace-only、独立错误/retry/lease，不写会话资产。
7. `useStudySession` / `StudyWorkbench`：asset commit 后立即 reveal/mine；asset ID 作为自动转写幂等键。

## 发布顺序

```text
native stop -> repository commit -> session RecordingAsset -> reveal/mine
                                                |-> playback prepare
                                                |-> ASR(asset.id)
```

播放和 ASR 没有反向箭头。它们只能更新自己的状态。

## 防回归

- ESLint `no-restricted-imports` 阻止越过 native API 所有权。
- `tools/check-audio-boundaries.mjs` 检查唯一 mode/recorder/type/repository 边界、旧 coordinator 引用，并禁止用单位不一致的 `AudioRecorder.currentTime` 判定 native 录音时长。
- `pnpm check:audio` 接入 `pnpm check:app`。
- Jest 覆盖状态转换、异步 owner、超时、stale lease、文件事务、重复 stop、后台/卸载、替换、消费者隔离和 native recorder 时长单位契约。
- Maestro 使用 Dev-only adapter；release config/build 双重禁止 E2E 标志。
- release script 按平台验证 audio-sensitive fingerprint evidence。

## 详细规范

所有权、错误码、排障、设备矩阵和后续变更 checklist 统一见 `docs/guides/audio-lifecycle-and-change-rules.md`。
