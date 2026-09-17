# 三端交付记录 — 2026-09-18

本轮已完成代码检查、Android 签名制品公开下载、正式网页和支付后端部署。iOS 沿用已经上架的版本，本轮没有重新提交 iOS。Android 交付渠道是官网 APK，未申请或发布到 Android 应用商店。

## 使用入口与产品边界

- 正式网页：<https://readyoufife.com>，手机号登录，提供学习及同账号会员权益，不提供网页购买。
- APP 下载页：<https://readyoufife.com/download>。
- Android APK：<https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-1.0.0-b3530529.apk>。
- iOS：<https://apps.apple.com/cn/app/id6800583111>，继续使用原 App Store 版本。
- 原宣传站：<https://feizhuicao.com/content/app-download>，本轮仅启用 Android 下载；APP、OPI 热点、资源分享和课程内容保留。
- Android 无 Apple 登录；微信按已安装及 SDK 支持状态展示并在回到前台重新检测，手机登录作为可用入口。
- Android 人民币售价：7 天 68 元、31 天 158 元、93 天 358 元。网页不下单，同账号读取服务端会员及 AI 权益。

## 发布来源

所有源码均已通过 PR 进入 origin/main；生产操作在干净 main 上执行。不可变制品保留实际构建时的来源，不将之后的校验工具或记录提交冒充其源码。

| 平台 | 实际源码 | 发布标识 |
| --- | --- | --- |
| ECS API | `06e5db96a8dd8337780246d60e38a566c9d1ba46` | `three-platform-06e5db9` |
| Android APK | `8aac3d72a0153d5b110dbd5bd49587a34886ec7e` | 1.0.0 / 3530529 |
| EdgeOne 正式网页 | `06e5db96a8dd8337780246d60e38a566c9d1ba46` | `dpptyh1e8e8i`，项目 `makers-4khvzoj9ywnq` |
| Vercel 旧宣传站 | `8eaa84f857050dc394283f145e5965260f530cce` | `dpl_oWQ3niiuLfhR8XuJAqXUAgoa96VG` |

已推送 annotated tags：

- `release/api-production/20260918-06e5db9`
- `release/android/v1.0.0-b3530529`
- `release/web-edgeone/20260918-06e5db9`
- `release/web-vercel-legacy/20260918-8eaa84f`

实现与构建修复：PR #123–#127；APK 编译后 manifest 枚举校验：PR #128。PR #128 只修改校验工具，APK 仍对应 main `8aac3d7`，未重新签名或换包。

## Android 制品

- 包名：`com.readyoufife.app`
- 大小：132899861 字节，126.7 MiB
- SHA-256：`fd4595b0a9fb21b2c0a8e107c5381a25c2a57fe2db456d5d89c2a84bb5021b9a`
- 签名证书 SHA-256：`25d4fe5523417289da5fe0bf970593b98fe4ea658883edeb5792906e31456629`
- APK Signature Scheme v2 验签通过，非 Debug 证书。
- 微信回调包名、AppID、导出属性和 singleTop 校验通过；内嵌 JS 使用正式 API/Supabase 地址，没有退休服务地址或开发内网地址。
- ZIP 16KB 对齐通过，26 个 arm64 动态库的 ELF LOAD 对齐均满足 16KB。
- 正式构建完成后，使用校验工具修正验证同一 APK；没有为了校验工具的变化重复 Prebuild/原生编译。

本地交付文件与校验日志存放于主工作区 `.generated/releases/android/1.0.0/` 和 `.generated/three-platform-launch-20260918/`，不进入 Git。

## 后端及存储

- API 生产健康检查通过，数据库 50 项迁移已应用、无待执行迁移及漂移。
- 微信生产商户签名和响应验签通过真实只读查单验证，返回 `ORDER_NOT_EXIST`；没有伪造交易、创建真实订单或扣费。
- 生产价格只读查询确认 6800/15800/35800 分。
- `app-releases` 是独立公开下载 bucket，仅 APK MIME，上限 512 MiB；不新增匿名写入策略，版本文件不覆盖。
- Storage 全局上限通过已入主干的 `infra/supabase/docker-compose.app-releases.yml` 调整；生产实际覆盖文件位于 `/opt/icao/releases/android-3530529/icao-storage-release-overlay.yml`。后续运维重建 Storage 时应保留该覆盖文件，避免退回 50 MiB。此项为本次生产配置事实，不是新增长期规则。
- 既有 question-bank-assets / ai-transcription-inputs / feedback-screenshots / editorial-assets 仍为私有，分别保持 50/8/5/10 MiB 上限。
- 仅重建 Storage，API 和其他 Supabase 服务没有因该上限调整而重建。

## 验证与验收边界

- 完整 `pnpm check` 通过；APP 163 套、1117 项，API 52 套、704 项，类型、构建、题库媒体和合同检查通过。52 项既有 lint 警告、0 错误。
- 四 ABI 原生编译、应用 Kotlin 和 Release lint、最终签名组装均通过。
- 正式网页线上资源匹配构建，手机 390px / 桌面 1440px 登录和下载流程通过，无横向溢出、无浏览器错误；Vercel 三个资源入口保留。
- Vercel 云构建的冻结门禁通过，349 个受保护文件与基线一致。
- **尚未进行真实 Android 安装、微信授权、实付/退款、锁屏连续播放、录音权限和三端真实账号往返同步验收。** 当前没有连接的 Android 真机；微信开放平台登记签名本轮没有直接核验，不能由编译或商户查单成功推断其已实测。
- 已将这些项目写入 APK 旁的 `acceptance-pending.json`，没有生成“验收通过”的虚构证据。浏览器没有发送验证码、创建用户或消费生产 AI 额度。

建议最终真机验收只使用本次正式 APK：手机号登录 → 如已安装微信再验证授权 → 同账号在网页/iOS 查看学习记录 → 支付一个既定套餐并确认权益 → 锁屏切换音频及录音。退款及网络恢复按真实观察记录；不要以这里的自动检查代替。

## 回滚目标

- API 前版本：`production-migration-f8cee39f7bbc`；本轮备份 `/opt/icao/backups/api-three-platform-06e5db9`，启用支付前环境备份 `/opt/icao/backups/wechat-enable-06e5db9/runtime-env-before`。凭据不写入 Git。
- EdgeOne 前部署：`dpmbct7ivcoy`；可在同项目控制台选择该历史部署回退。当前制品来源有对应 release tag。
- Vercel 前部署：`dpl_66WNLXc8zcQwrjhAZt364KQnnRiY`。回退时同时移除本轮新增的公开 APK URL 配置，避免下次构建再次激活入口。
- APK 使用不可变版本路径。若需撤回分发，先停用两个网站下载入口；已经安装的客户端不会被远程自动卸载。
- Storage 原容器配置快照 `/opt/icao/releases/android-3530529/storage-before.json`。全局上限回退使用原 Compose 与原 override，仅重建 Storage；保留其他私有 bucket 权限与数据。

没有变更 Vercel 的购买规则、课程价格或其他宣传内容，没有代替用户提交新的 Android 应用商店申请。
