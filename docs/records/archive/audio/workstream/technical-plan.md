# 录音与全局音频生命周期技术方案

> 历史工作流：当前架构见 `docs/resources/developer/recording-implementation.md`，当前排障见
> `docs/records/incidents/audio-recording/README.md`。

状态：2026-08-20 已由 Recording Engine 架构更新

## 架构

1. `src/platform/audio/`：串行 `AudioSessionOrchestrator`、递增 token lease、2 秒 timeout、独占 recording、idle release、隐私安全诊断 ring buffer/sink。
2. `recording/recording-engine.ts`：三端唯一生命周期 owner；管理 operation ID、runtime epoch、快速松手、幂等 stop、超时、中断和提交发布。
3. `expo-recorder-adapter.ts` / `.web.ts`：唯一 recorder、permission、preset 和平台运行事件入口；Native 默认 M4A/AAC，Web 使用浏览器实际 MIME。
4. `RecordingRepository`：raw 稳定等待、确定性容器校验、pending → 正式文件事务式提交、session/orphan cleanup。
5. `useSpeakingRecordingController`：只连接 React/UI 与 Engine；keyed RuntimeHost 在污染 Promise settle 后重建 recorder。
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
- Jest 覆盖快速松手、异步 owner、超时与 runtime 重建、stale operation、文件事务、重复 stop、后台/卸载、替换、消费者隔离和 native recorder 时长单位契约。
- Maestro 使用 Dev-only adapter；release config/build 双重禁止 E2E 标志。
- release script 按平台验证 audio-sensitive fingerprint evidence。

## 详细规范

所有权、错误码、排障、设备矩阵和后续变更 checklist 统一见
`docs/resources/developer/recording-implementation.md`。
