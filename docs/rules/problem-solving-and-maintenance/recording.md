# 录音问题解决与维护

状态：已通过 iPhone TestFlight 真机验收的长期基线

目标：iOS、Android、Web 稳定完成“录音、停止、保存、回放”，后续修改不得破坏已经验证的主链路。

## 已验证基线

| 项目 | 已验证事实 |
| --- | --- |
| 验收日期 | 2026-08-21 |
| iOS 候选 | Marketing Version `1.0.0`，TestFlight build `3470181` |
| App 显示版本 | `v2026.08.20.0016` |
| 源码 commit | `a0ca177c452a25786827f5c92126b9803a563148` |
| 真机结论 | 用户已确认苹果真机可以正常录音、停止、保存和回放 |
| iOS 格式 | Expo SDK 55 官方 `RecordingPresets.HIGH_QUALITY`，M4A/AAC |

该候选是当前录音方案的已知正确证据，不代表以后永远停留在该 commit。后续改动只有经过同等自动检查和目标端真机验收，才能更新本节。

## 当前技术骨干

```text
SpeakingPracticePanel（手势与显示）
  → RecordingEngine（唯一生命周期、竞态、超时）
      → AudioSessionOrchestrator（唯一音频会话 owner）
      → Recorder Adapter（Native / Web 平台事实）
      → RecordingRepository（媒体校验、提交、删除）
  → RecordingAsset（唯一成功事实）
      → 学习会话
      → 回放（独立消费者）
      → 转写（独立消费者）
```

标准流程：权限 → 获取音频会话 → prepare → 确认底层 start → recording → stop → 容器/音轨/平台解码校验 → 提交 → 发布资产 → 释放资源。

当前可靠性来自以下合同，而不是来自某一种格式：

- Native 启动只以底层 `recorder.isRecording` 确认，不信任包装层乐观状态。
- 操作时长、Recorder 时长、媒体时长互相独立；禁止乘除 `1000` 或互相覆盖。
- M4A 必须包含 `ftyp`、`moov`、非空 `mdat`、有效 `soun` 音轨和媒体时长，并通过系统解码器的非播放探针。
- `RecordingAsset.durationMillis` 只采用已经验证的媒体时长。
- 回放使用稳定播放器和 `replace(uri)`；旧 source 的完成事件不能结束新播放。
- 回放或转写失败不得删除、回滚已经提交的录音。
- 快速松手、后台、中断、重复 stop、超时和迟到结果都由同一个 Engine 清理。

## 不得破坏的原则

- 三端共用一个 `RecordingEngine`；平台差异只留在 adapter 和 repository 平台文件。
- `AudioSessionOrchestrator`、`RecordingRepository` 和 `RecordingAsset` 都只能有一个 owner/定义。
- 重录顺序固定为：提交新资产 → 发布到学习会话 → 删除旧资产。新录音失败时旧资产不变。
- iOS 保持官方 M4A/AAC preset。WAV 不是默认解法；只有明确的真机编码或容器证据才能独立评估格式变更。
- 不用 UI 延时、盲目重试、码率推算、播放器业务状态或任意单位换算替代底层事实。
- 不因历史曾经使用 WAV、自定义采样率或某个旧工作流，就恢复已经被当前基线取代的实现。

## 修改与验收规则

任何录音生命周期、权限、格式、文件或回放改动，必须：

1. 先判断故障位于权限、session、recorder、stop、文件提交还是回放。
2. 复用现有 Engine、orchestrator、adapter、repository 和 asset，不建立平行实现。
3. 说明改动恢复哪一条合同，并增加对应测试或静态门禁。
4. 至少运行 `pnpm check:audio`、`pnpm test:recording`、`pnpm typecheck` 和 `git diff --check`；iOS 发布还运行 `pnpm check:ios:testflight`。
5. iOS 用户可见改动以同一 commit 的 TestFlight 真机结果为最终结论；模拟器、Development Build 和构建成功不能替代。

文档整理、注释和不改变运行行为的测试维护不更新 App 显示版本，也不重新要求真机验收。

## 唯一入口

- 详细合同：[`docs/guides/audio-lifecycle-and-change-rules.md`](../../guides/audio-lifecycle-and-change-rules.md)
- 历史问题总表：[`docs/common-errors/audio-recording/README.md`](../../common-errors/audio-recording/README.md)
- 当前源码：`src/features/question-bank/recording/`、`src/platform/audio/`
- 源码演变：`git log -- src/features/question-bank/recording src/platform/audio`

除非当前代码和真机证据推翻本基线，否则不要从旧 workstream、旧事故长文或归档文件恢复方案。
