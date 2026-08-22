# 录音与全局音频生命周期治本重构需求

> 历史工作流：当前架构见 `docs/rules/conditional/audio-lifecycle-and-change-rules.md`，当前排障见 `docs/records/incidents/audio-recording/README.md`。

状态：已冻结并实施

## 目标

解决按住说话在录音后不展开答案、不能回放、没有自动转写以及音频功能频繁回归的问题。目标不是修补单一症状，而是建立单一所有权、可验证状态机和长期发布门禁。

## 必须满足

- 全局音频 session 只有一个协调者，录音时拒绝其它播放。
- 录音生命周期只有一个控制器，UI 只处理手势与渲染。
- 录音文件只有一个 repository 负责提交、删除、替换和会话清理。
- 录音有效性只依据 stop/duration/file existence/size，不依赖 player。
- commit 成功立即写会话、展开答案、切“我的回答”，再独立准备回放和启动转写。
- 回放、答案、转写互相隔离；任一消费者失败不能回滚资产。
- 重录失败保留旧资产，成功后才替换并删除旧资产。
- 所有异步切换串行、有 2 秒边界、generation/lease token 防止过期操作。
- 保留 Track Player 后台/锁屏、现有录音 UI 和现有转写 API；不新增云存储或服务端修改。
- 结构检查、Jest、本地 Maestro、Development Build 和真机矩阵阻止旧模式回归。
- 形成长期指南、阶段记录、证据约定和旧文档勘误。

## 验收

- iPhone 真机连续 30 次录音—展开—回放—转写，覆盖电台后录音、重录、后台和系统中断。
- Android Emulator Maestro、Development Build 和真实录音冒烟通过；物理 Android 留待集中终验。
- `pnpm check`、Expo Doctor、双端 Development Build、Git diff/生成文件、UI 基线全部通过。
- audio-sensitive fingerprint 变化时，无匹配本地证据不得执行平台发布。
- closeout 明确记录共享复用、“无第二生命周期 owner”和未执行项；不把未运行的设备测试写成通过。
