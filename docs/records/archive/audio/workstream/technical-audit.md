# 录音与全局音频生命周期技术审计

> 历史工作流：当前架构见 `docs/rules/conditional/audio-lifecycle-and-change-rules.md`，当前排障见 `docs/records/incidents/audio-recording/README.md`。

状态：审计完成

## 根因结论

旧实现把本应独立的五个生命周期压在组件 effect 中：原生录音、全局 session、临时文件、回放加载、业务发布/转写。任何 effect 重跑、player load 超时、AppState 切换或 source 替换都可能把“录音已完成”误判为失败，并执行清空或删除。症状看似随机，实质是多 owner、无事务边界和异步结果无版本。

## 审计发现

| 缺陷 | 后果 | 治本边界 |
| --- | --- | --- |
| 多处可写 `setAudioModeAsync`，旧 coordinator 不等待异步 pause | 电台/题卡/录音竞争，profile 交错 | 单一串行 orchestrator + 2 秒 fail-closed |
| UI 直接持有 recorder、player 和文件清理 | 重渲染/卸载会误删、状态难测 | controller / adapter / repository 分层 |
| 录音发布等待 player load | 回放失败导致答案不展开、ASR 不启动 | commit 是唯一发布边界，三消费者隔离 |
| player 初始 source 与 `replace` 双驱动 | load 状态、超时和 source 生命周期互相覆盖 | stable player + `replace(uri)` 单路径 |
| URI/时长作为隐式身份 | 重录和重复 effect 无法可靠幂等 | `RecordingAsset.id` |
| 新旧录音替换先清旧值 | 新录音失败后无回滚资产 | 先 commit 新资产，再 swap，再删旧资产 |
| stop/permission/prepare 没有 generation | 快速松手、后台、卸载后发布过期结果 | generation token + idempotent stop |
| 文件复制没有 pending/size 事务 | 半文件/header-only 被当作成功 | pending 校验 + 原子 move + final 校验 |
| 旧文档继续描述已删除 coordinator | 后续开发可能复制历史模式 | 指南成为规范源，旧文档写明 superseded |

## 共享模块复用

- 保留 `react-native-track-player` 作为随身听后台/锁屏唯一引擎。
- 保留 Expo Audio 作为题卡、录音器和录音回放能力，但 profile 写入口收口。
- 保留现有题库 repository、资源 resolver、`AudioTimeline`、学习 session 和 AI `/v1/ai/transcribe` 协议。
- 不增加第二题库内容、音频映射、时长索引、subtitle、API client 或服务端实现。

## 迁移边界

- 删除旧 `src/platform/audio-session-coordinator.ts`，不保留兼容导出。
- 客户端-only；`services/api`、数据库、ECS 均不修改。
- 录音资产只活到学习 session 结束，不新增跨重启录音库、云同步或离线资产产品能力。
