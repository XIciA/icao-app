# 音频生命周期证据目录

> 历史工作流证据：不得视为当前版本真机验收。

本目录只保存可审查、非敏感的自动化/设备结果；不得复制录音内容、录音 URI、转写原文、访问令牌或运行时 secret。

## 预期证据

- `automated/`：`pnpm check`、Expo Doctor、双端 native build 摘要。
- `ios-device/`：30 次矩阵计数、系统中断/后台/电台后录音结果和必要截图。
- `android/`：Emulator Maestro、Development Build 和真实麦克风冒烟摘要。
- `.generated/audio-e2e/{ios,android}.json`：本地发布门禁证据，因包含工作机时间戳且可再生，按仓库规则不提交。

只有实际执行后才新增结果文件。当前没有设备通过证据。

Maestro flow 需要目标 Development Build 已安装、已连接脚本启动的 Metro，并保留一个可进入学习页的本地登录会话；脚本不会创建账号、写入凭据或绕过生产鉴权。
