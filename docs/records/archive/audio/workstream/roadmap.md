# 录音与全局音频生命周期路线图

> 历史工作流：当前架构见 `docs/rules/conditional/audio-lifecycle-and-change-rules.md`，当前排障见 `docs/records/incidents/audio-recording/README.md`。

| 阶段 | 内容 | 状态 | 退出条件 |
| --- | --- | --- | --- |
| 0 | 基线与根因审计 | 完成 | 共享源、旧 owner、竞态和边界记录清楚 |
| 1 | orchestrator / diagnostics / state machine / repository | 完成 | 单一 owner、事务文件、纯 reducer 单测通过 |
| 2 | controller / playback / session / ASR 迁移 | 完成 | commit 后立即发布，消费者隔离 |
| 3 | radio / study player 迁移与旧 coordinator 删除 | 完成 | 无旧引用、无双轨 |
| 4 | 静态边界、Maestro、fingerprint release gate | 实现完成 | 脚本静态验证；双端运行证据待设备执行 |
| 5 | 长期指南、AGENTS、旧文档勘误 | 完成 | 后续入口只有一套规范 |
| 6 | 全量 check、Doctor、双端 native/device、UI、closeout | 自动检查与双端编译完成，设备终验待执行 | 所有真实执行结果写入 closeout |

阶段 6 不以代码完成代替设备验收。缺少 Maestro 或未连接真机时，closeout 必须保持“待终验”。
