# 双端独立版本发布

> 适用范围：Apple Development 签名的当前 iPhone，以及通过 `download.feizhuicao.com` 小规模分发的 Android APK。

## 日常发布命令

Android 与 iOS 已完全拆分，任一平台失败不会阻止另一平台发布。

代码修改完成并提交后，发布 Android：

```sh
pnpm release:android
```

命令会完成版本更新、完整检查、必要的 API 部署、Android 正式签名构建、APK 上传和下载入口验证。已有公开 APK 后，工作区不干净会直接停止，防止半成品发布。

连接并解锁 iPhone 后，单独发布 iOS：

```sh
pnpm release:ios
```

如确实希望连续尝试两个平台，可以运行 `pnpm release:dual`。该命令先发布 Android，再尝试 iOS；即使 iPhone 离线导致后半段失败，已经上线的 Android 版本不会回滚。

若服务端 API 指纹没有变化，命令不会重启 ECS API。若检测到数据库 Migration 文件变化，命令会停止并要求先完成数据库备份和迁移审核。

## 下载入口

- 网页：`https://download.feizhuicao.com`
- 固定最新版：`https://download.feizhuicao.com/latest.apk`
- 页面展示版本、更新时间、安装包大小、更新说明和 SHA-256。
- 页面无密码，但同时使用 HTML robots meta 与 `X-Robots-Tag` 禁止搜索引擎收录。
- 首版没有 App 内检查更新；测试者需要重新打开网页下载新包。Android 会把同包名、同签名且更高 `versionCode` 的 APK 识别为覆盖更新。

## 标识与数据边界

- iOS Bundle ID 固定为 `com.anonymous.icao-app`，发布脚本带有自动守卫，防止误改后形成第二个 App。
- Android 包名固定为 `com.feizhuicao.app`。
- Android 首次从 Debug 版切换到正式签名版时需要卸载 Debug 版；正式版之间可以覆盖升级并保留应用本地数据。

## Android 密钥保管

- 主密钥：`~/Library/Application Support/Feizhu ICAO/Signing/android-release.p12`
- 密码：macOS Keychain 中的 `com.feizhuicao.android-signing`
- 加密备份：iCloud Drive 的 `Feizhu ICAO/Signing Backup/android-release.p12`
- 密钥、密码、证书和本机环境文件均不得加入 Git、聊天内容或服务器部署包。

若丢失该密钥或密码，已有 Android 安装无法再由新密钥覆盖升级。迁移电脑前必须同时确认 PKCS#12 备份和 Keychain 密码可以恢复。

## 失败安全

- `pnpm check`、API 验证或 Android 构建任一步失败，公开 `latest.apk` 都不会切换；iOS 状态不参与 Android 发布门禁。
- API 部署先保留回滚镜像和源码备份，健康检查或真实同步验证失败时自动恢复旧镜像。
- 下载网关修改前备份 Caddy 配置；新配置先通过 Compose 与 Caddy 校验。
- 发布后从公网重新读取页面、响应头和 APK，并复核 SHA-256。
- 自动验收使用域名 SNI 直连 ECS 公网 IP，避免本机代理 DNS 的 `198.18.*` 映射把新域名误判为不可用；权威 DNS 记录仍须单独保持正确。
