# 本机签名与设备笔记

本文件保存当前开发机器上的人工提示。它不是项目级规范，账号、Team、设备名、路径或 Keychain
条目都可能变化，操作前必须在 Xcode、Keychain 和脚本中核对。

## iOS

- Xcode 工作区：`ios/ICAO.xcworkspace`。
- 当前独立真机构建默认使用的 Team ID 为 `4DPKHJKP5V`；如本机账号或证书变化，使用
  `ICAO_IOS_TEAM_ID` 覆盖并在 Xcode 中重新核对。
- 在 Xcode 的 ICAO target → Signing & Capabilities 中核对 Automatically manage signing
  和 Team；保持设备解锁后再执行真机/standalone 构建。
- Development Build 已安装且仅改 JavaScript/TypeScript 时，日常只需 `pnpm start`。

## Android 正式签名

- 当前机器曾使用的主密钥：
  `~/Library/Application Support/Feizhu ICAO/Signing/android-release.p12`
- 密码曾保存在 macOS Keychain 条目 `com.feizhuicao.android-signing`。
- 加密备份曾位于 iCloud Drive 的 `Feizhu ICAO/Signing Backup/android-release.p12`。

迁移电脑或发布前，应人工确认密钥与密码可以恢复。密钥、密码、证书和环境文件不得加入 Git、
聊天或部署包。丢失正式密钥会阻止对已有 Android 安装进行同签名覆盖升级。

## 端口与设备

遇到 Metro 端口占用时，先检查具体进程：

```bash
lsof -nP -iTCP:8081 -sTCP:LISTEN
```

确认 PID 与影响后再由人工终止，不使用会在无匹配或匹配过宽时误杀的管道命令。
