# 录音问题解决与维护

状态：长期规则

目标：iOS、Android、Web 都能稳定完成“录音、停止、保存、回放”，且同类问题不再靠堆补丁反复修复。

## 核心原则

- 先定位故障属于权限、音频会话、录音器、停止、文件提交还是回放；不要用下游现象猜上游原因。
- 修复必须恢复明确合同，并增加测试、静态门禁或类型化诊断；只加延时、重试、单位换算或条件分支不算治本。
- 三端共用一个 `RecordingEngine`。平台差异只留在 Native/Web adapter，UI 只负责手势和显示。
- `AudioSessionOrchestrator` 是唯一音频会话协调者；`RecordingRepository` 是唯一文件提交和物理删除者。
- 只有 Repository 校验并提交后的 `RecordingAsset` 才是成功录音。回放或转写失败不得撤销它。
- 重录顺序固定为：提交新资产 → 发布到学习会话 → 删除旧资产。新录音失败时旧资产不变。
- 时长统一使用毫秒。单调时钟负责操作时长，Native `durationMillis` 只做交叉检查；禁止再乘除 `1000` 或按码率猜文件有效性。
- iOS/Android 默认 M4A/AAC，Web 使用浏览器实际 MIME。格式选择服务于稳定性，不因单次故障盲目改 WAV。

## 技术骨干

```text
SpeakingPracticePanel
  → RecordingEngine（状态、竞态、超时、operationId、runtimeEpoch）
      → AudioSessionOrchestrator（唯一 session owner）
      → Recorder Adapter（Native / Web 平台事实）
      → RecordingRepository（容器校验、提交、删除）
  → RecordingAsset
      → 学习会话
      → 回放（独立消费者）
      → 转写（独立消费者）
```

标准流程：权限 → 获取音频会话 → prepare → start → recording → stop → 容器校验与提交 → 发布资产 → 释放资源。

快速松手、后台、中断和超时都必须沿同一流程清理；迟到结果只能被丢弃，不能覆盖下一次录音。

## 验收与历史入口

- 自动门禁：`pnpm check:audio`、`pnpm test:recording`、`pnpm typecheck`、`pnpm check:ios:testflight`、`git diff --check`。
- iOS 用户可见修复以同一 commit 的 TestFlight 真机闭环为最终结论；模拟器、Development Build、构建成功和历史成功都不能替代。
- 详细合同：`docs/guides/audio-lifecycle-and-change-rules.md`。
- 故障与修复记录：`docs/common-errors/audio-recording/`。
- 历史阶段记录：`docs/workstreams/audio-lifecycle-hardening/phase-log.md`。
- 源码演变：`git log -- src/features/question-bank/recording src/platform/audio`。

除非出现新的可复现根因，不新增重复文档；修正现有规则或在故障目录补一份记录即可。
