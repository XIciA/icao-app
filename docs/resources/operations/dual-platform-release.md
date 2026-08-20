# 双端独立版本构建与发布

> 适用范围：Apple Development 签名的当前 iPhone，以及在本机生成并校验的 Android
> Release APK。项目不再维护公开 APK 下载站，也不从 Android 构建命令部署任何 ECS。

## 日常发布命令

Android 与 iOS 已完全拆分。Android 命令只生成本地制品；iOS 命令只处理连接的设备。

代码修改完成并提交后，发布 Android：

```sh
pnpm release:android
```

命令要求 Git 工作区干净，然后完成版本更新、完整检查、Android 正式签名构建与本地 APK
校验。制品保存在 `.generated/releases/android/<版本>/`，同时生成 SHA-256、签名报告和
`android-release.json`。命令不会连接旧 ECS、不会上传 APK，也不会部署或重启公司主生产
ECS；API 发布必须作为单独任务明确授权。

连接并解锁 iPhone 后，单独发布 iOS：

```sh
pnpm release:ios
```

如确实希望连续构建两个平台，可以运行 `pnpm release:dual`。该命令先生成 Android 本地
制品，再尝试 iOS；iPhone 离线导致后半段失败时，已生成的 Android 制品仍会保留。

服务端 API 发布使用独立的生产部署流程。数据库 Migration 仍必须单独完成备份、审核、
执行与验收，不能由移动端构建命令隐式触发。

## Android 制品边界

- 仓库只负责生成和校验正式签名 APK，不提供公开下载 URL 或“最新版”重定向。
- 若需要把 APK 交给测试者，必须使用当次明确批准的受控传输方式，并人工核对
  `android-release.json` 和 SHA-256。
- 同包名、同正式签名且更高 `versionCode` 的 APK 可覆盖升级并保留本地数据；变更签名或
  包名会产生新的安装边界。

## 标识与数据边界

- 听你五个 / Read You 5 的 iOS Bundle ID 固定为 `com.readyoufife.ios`，Android 包名固定为 `com.readyoufife.app`，发布门禁禁止漂移。
- 两个平台的正式标识均与旧内测包不同，因此会作为新 App 安装；登录同一账号后可恢复已同步的云端数据，但旧包内尚未同步的本地数据不会由操作系统自动迁入。
- 各平台后续版本必须保持该平台的正式标识和正式签名，并使用更高构建号，才能覆盖升级并保留本地数据。
- App 备案和商店建档必须使用正式 Release 安装包提取的包名、签名、公钥/证书信息，不能使用旧内测包或 Debug 签名。

## Android 密钥保管

- 密钥、密码、证书和本机环境文件均不得加入 Git、聊天内容或服务器部署包。
- 人工开发者的本机密钥位置、Xcode Team 和迁移检查见
  `docs/resources/developer/local-signing-and-device.md`；该笔记不是自动授权，使用前需人工核对。
- 若丢失 Android 正式签名密钥或密码，已有安装无法再由新密钥覆盖升级。

## 失败安全

- `pnpm check` 或 Android 构建任一步失败，都不会产生可交付的新制品；iOS 状态不参与
  Android 构建门禁。
- Android 命令不修改 DNS、Caddy、Vercel 或任何 ECS 进程，因此构建失败不会改变线上状态。
- 对外传输前从本地元数据复核包名、版本号、正式签名和 SHA-256。
