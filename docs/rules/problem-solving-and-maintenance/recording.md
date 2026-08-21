# 录音问题的解决与维护

状态：长期开发规则  
范围：iOS、Android、Web 的录音生成与提交；回放和转写只作为下游边界，不在本文设计范围内。

## 目标

三端都能稳定完成一次录音，并且后续修改不再让已经可用的平台反复失效。修复必须消除根因、
恢复清晰边界并留下验证门禁；不能为了当前报错持续叠加延时、重试、单位换算和平台判断。

## 问题的本质

录音故障通常不是“麦克风坏了”，也不只是音频格式问题。根因主要来自：

- 生命周期不完整：开始、快速松手、停止、中断或卸载没有形成闭环。
- 所有权重复：多个组件同时控制录音器、音频模式、文件或旧录音删除。
- 异步竞态：上一操作的迟到结果覆盖当前操作。
- 平台差异泄漏：UI 或业务层猜测原生单位、格式和浏览器行为。
- 成功标准混乱：用回放、转写、文件大小或界面状态代替录音文件本身的有效性。
- 构建证据不一致：旧包和新包的源码、原生配置或运行环境不同，却被当成同一版本比较。

因此，换 WAV、增加一次重试或乘除 `1000` 都不能单独构成长久修复。

## 录音骨干

```text
权限
→ 取得音频会话
→ 准备录音器
→ 开始采集
→ 停止并完成容器
→ 校验与提交文件
→ 发布 RecordingAsset
```

骨干只保留五个职责：

1. **Recording Engine**：唯一状态机，管理一次操作的开始、停止、中断和过期结果。
2. **AudioSessionOrchestrator**：唯一音频会话协调者，处理录音与播放之间的占用关系。
3. **Recorder Adapter**：隔离 iOS、Android、Web 的平台 API，只产出原始录音。
4. **RecordingRepository**：唯一文件提交和删除者，验证容器后生成正式资产。
5. **RecordingAsset**：录音成功后的唯一业务事实；回放和转写只能消费它。

最低状态骨架：

```text
idle → starting → recording → stopping/finalizing → ready
                  ↘ interruption/error → cleanup → idle/error
```

每次操作必须有独立 `operationId` 和 `runtimeEpoch`。快速松手必须等待启动链清理；重复停止必须
幂等；录音器自行结束必须能进入状态机；超时和迟到结果只能清理自己的资源，不能发布到新的
录音。底层 Promise 超时后将该 runtime 标记为污染，等待迟到结果完成清理，再通过 keyed
RuntimeHost 重建 recorder；不能在同一个不确定 runtime 上继续尝试。

Native `prepareToRecordAsync()` 成功就是录音器准备合同，不再用一次 `canRecord` 快照二次否决；
`record()` 后仍必须等待明确的 `isRecording` 才发布 recording 状态。prepare 拒绝只保留
`audio-session-configuration | native-recorder-prepare | unknown-native-prepare` 三类脱敏原因，
不得记录原生错误原文、URI 或录音内容。

## 三端技术边界

| 平台 | 平台层 | 正式输出原则 |
| --- | --- | --- |
| iOS | Expo Audio adapter | 直接使用 Expo SDK 55 `RecordingPresets.HIGH_QUALITY` 的 M4A/AAC；等待原生停止完成，再由 repository 校验容器 |
| Android | Expo Audio adapter | 优先统一 M4A/AAC；没有真机证据前不增加厂商分支 |
| Web | MediaRecorder adapter | 使用浏览器实际支持的压缩格式；等待最终数据事件并释放全部音轨 |

三端共享 Engine、状态合同、资产模型和提交规则，但不强行共享平台 API。WAV 只可用于受控诊断，
不得把它当成生命周期问题的默认解法。iOS 生命周期修复不得同时覆写采样率、声道、码率或
编码器；更换 preset 必须作为独立变更取得同一候选的真机证据。

## 长期维护原则

1. 先确定故障位于哪个阶段，再改代码；没有阶段证据不得猜根因。
2. 一个职责只有一个 owner 和一个 source of truth，不新增平行控制器或清理路径。
3. 平台差异留在 adapter，UI 不处理原生录音器、文件、MIME 或时长换算。
4. 时长在业务层统一使用毫秒；跨 API 的单位转换只能存在于明确的边界函数。
5. 录音成功以有效资产提交为准，不以播放器、转写结果或静音与否为准。
6. 重录时先提交并发布新资产，再尽力删除旧资产；新录音失败必须保留旧资产。
7. 每次修复至少增加一种防复发证据：状态测试、静态门禁、类型化诊断或真机验证。
8. 共享骨干变化必须验证三端；平台隔离变化至少验证目标端，并确认共享合同未回归。
9. 构建成功、模拟器成功和历史版本成功不能代替当前构建的手机本体麦克风闭环。
10. 局部补丁如果不能恢复明确不变量，只能作为临时措施，并必须记录退出条件。

## 修改与验收入口

开始修改前，先确认现有 owner、adapter、repository 和资产类型能够复用。实现完成后至少检查：

- 快速松手、重复停止、连续录音、中断、后台切换和重录失败。
- 权限拒绝后恢复，以及旧异步结果不会覆盖新操作。
- Native 容器完成后才提交；Web 最终数据到达后才提交并关闭音轨。
- 新录音发布前旧录音仍然可用。
- 自动化、安装成功和真实麦克风验收分别记录，不互相替代。

## 代码与历史路径

- 录音实现：`src/features/question-bank/recording/`
- 全局音频会话：`src/platform/audio/audio-session-orchestrator.ts`
- 学习会话中的录音替换：`src/features/question-bank/hooks/useStudySession.ts`
- 音频边界门禁：`tools/check-audio-boundaries.mjs`
- 聚焦录音验证：`pnpm test:recording`、`pnpm check:ios:testflight`
- 录音故障、根因和修复记录：`docs/records/incidents/audio-recording/README.md`
- 更早的事故和已结束方案：`docs/records/archive/audio/`

历史索引：2026-07-22 的时长单位重复换算、2026-08-12 的 WAV/文件完成判断问题，以及
2026-08-14 尚需真机分阶段确认的 TestFlight 准备失败，统一从上述录音故障记录进入。历史记录
只提供证据，不覆盖当前代码和本文原则。

新的录音事故只在记录目录追加日期、构建、平台、症状、阶段证据、根因、修复、门禁和真机
结果；本文只维护长期骨干，不堆叠事故过程。
