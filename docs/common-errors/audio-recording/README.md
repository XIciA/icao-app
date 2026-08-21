# 录音与相邻音频问题历史台账

状态：关闭问题的唯一摘要入口；不定义现行架构

现行录音方案以 [`录音问题解决与维护`](../../rules/problem-solving-and-maintenance/recording.md) 和 [`音频生命周期与变更规则`](../../guides/audio-lifecycle-and-change-rules.md) 为准。本页只回答“以前哪里错过、为什么错、现在用什么合同防止复发”。

## 当前结论

- 已验证正确基线：iOS TestFlight build `3470181`，显示版本 `v2026.08.20.0016`，commit `a0ca177c452a25786827f5c92126b9803a563148`。
- 2026-08-21 用户已确认苹果真机录音、停止、保存和回放正常。
- 当前 iOS 使用官方 M4A/AAC preset；正确性由生命周期、真实启动状态和媒体校验共同保证，不依赖切换为 WAV。

## 历史问题总表

| 时间 | 表现 | 本质原因 | 已固定的长期合同 |
| --- | --- | --- | --- |
| 2026-07-16 | 录音、播放和文件清理相互影响，问题反复出现 | 生命周期、音频 session、文件和消费者所有权不清 | 唯一 `RecordingEngine`、`AudioSessionOrchestrator`、`RecordingRepository` 和 `RecordingAsset` |
| 2026-07-22 | 真机已经生成有效录音，却提示文件不完整 | 读取平台含义不一致的 `AudioRecorder.currentTime`，又乘 `1000`，把时长放大 | 禁止读取该字段推导毫秒；操作、Recorder、媒体时长分离 |
| 2026-07-28 | 首次没有录音，录完后回放仍停在 `0:00` | 空资产阶段调用 `player.remove()`，注销了仍挂载的原生播放器 | `useAudioPlayer` 独占释放；资产变化只用 `replace(uri)`；静态门禁禁止提前 remove |
| 2026-07-28 | 有效录音能回放但转写失败 | 本地同意与账号级同意漂移；等价 WAV/M4A MIME 未在服务端规范化 | 转写是独立消费者；账号同意幂等同步；MIME 与扩展名一起规范化，不回滚录音 |
| 2026-07-28 | Web 题卡音频首次播放不可用或加载缓慢 | 浏览器用户手势、`loadeddata` 门槛和跨域静态分片交付混在共享播放路径 | Web 题卡使用平台专用持久 `HTMLAudioElement`；点击同步 `play()`；资源走已验证同域交付。这不是录音器故障 |
| 2026-08-20 | TestFlight 在原生 prepare 阶段失败 | 自定义 iOS 参数扩大了变量，且原始错误曾被压平，无法证明具体失败层 | iOS 回到 Expo SDK 55 官方 HIGH_QUALITY preset；prepare 错误保留脱敏阶段分类 |
| 2026-08-21 | 可以录音，但点击回放立即结束 | 包装层过早报告 recording；Engine 用操作时长掩盖短音轨；Repository 只检查顶层 M4A；回放可能接收旧完成事件 | 底层 `recorder.isRecording`；三类时长独立；容器+音轨+系统解码探针；回放 source/attempt 隔离 |

## 已排除的错误方向

- 录音异常就盲目切 WAV，或同时维护 M4A/WAV 自动回退。
- 用固定延时、重复重试、文件字节/码率或任意 `×1000`、`÷1000` 猜测成功。
- 因回放或转写失败删除已经提交的录音。
- 在 UI/Hook 中新增第二套状态机、Recorder、文件目录或 Audio Session owner。
- 把模拟器、Development Build、成功 Archive 或历史正常版本当作本次 TestFlight 真机验收。
- 从已关闭 workstream 或事故记录复制旧实现覆盖当前基线。

## 维护方式

- 出现新症状时先在本表查同类根因，再按当前指南和代码取证；不要遍历旧 workstream。
- 调查中的复杂故障可以临时使用 [`incident-template.md`](./incident-template.md)，但关闭后必须把结论合并进本表，并删除临时事故文档。
- 只有新的可复现根因、现有结论被证据推翻，或已验证基线更新时才修改本表。
- 详细历史证据通过 Git 查询，不再维护多份长期事故正文：

```text
git log -- docs/common-errors/audio-recording
git log -p -- src/features/question-bank/recording src/platform/audio
```

历史证据不能覆盖当前代码、测试和最新真机结论。
