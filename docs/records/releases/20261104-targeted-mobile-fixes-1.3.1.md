# 安卓下载、单词响应与局部显示修复交付

记录日期：2026-11-04（北京时间）。用户已明确授权实施并上线苹果 TestFlight 与安卓测试版；安卓按本轮明确要求采用正式包身份，官网次要入口手动体验，不替换正式渠道。

> 11 月 5 日补充：用户确认苹果已无问题；安卓 3596174 下载仍停在“资源未就绪”。下表保留首轮交付事实，当前安卓体验候选已更新为 3596175，详见文末。

## 已交付

| 平台 | 交付与验证 |
| --- | --- |
| iOS TestFlight | 1.3.1 / 3596174；源码 `2bed7706d5af767cdb71a2c8a861937dca0ecf56`，PR #340。Apple `VALID / IN_BETA_TESTING`，现有内部“测试”组可用；未提交 App Store 审核。 |
| Android 提前体验 | 1.3.1 / 3596174；与 iOS 同一源码。包名 `com.readyoufife.app`，签名证书、微信 App ID、登录与支付回调与当前公网正式包 3578875 逐项一致。公网 APK 摘要已验证，官网右上角“安卓体验”指向新包。 |
| 产品 Web | 最终源码 `df9f35d081ad274806b30091babe542aa077fae0`，PR #341 仅收尾下载入口单行布局；EdgeOne deployment `dpmbjxoo27xb`。在线文件摘要和浏览器入口验证通过，正式主按钮仍指向 3578875。 |

[安卓新包](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/readyoufife-android-preview-1.3.1-b3596174.apk) · [官网下载页](https://readyoufife.com/download) · [结构化证据](20261104-targeted-mobile-fixes-1.3.1.json)

安卓 SHA-256：`c3cdbd47aca45db17af8a607f36b1819554cac248bedd76615dfa96b162e7952`；138,452,663 bytes。
iOS IPA SHA-256：`6f0112be9219656fb7bda6fef3e452826bd3d216048eda44cd1b025cee5fb453`。

对应 annotated tags：`release/ios-testflight/v1.3.1-b3596174`、`release/android/v1.3.1-b3596174`、`release/web-edgeone/20261104-df9f35d0`。

## 修复与保护边界

- 安卓题库停在“待验证”的根因是既有凭证验签模块缺失 Android 实现。补齐同接口的 Ed25519 原生验签，保留签名、账号、环境、有效期和内容范围校验；未修改 iOS Swift 验签、下载管理器、调度、缓存或离线读取实现。
- 词汇保存此前等待整轮云同步 HTTP。现在仅在词汇本地读写及词汇云端应用之间串行必要事务，继续原子保存词汇状态、学习位置和 outbox，再沿原同步流程发送。覆盖迟到推送/拉取、新编辑、账号切换及清空代际，不改全局 HTTP、同步频率或非词汇业务队列语义。
- 下一题图标移到现有 Button 横向内容的可选 trailing 槽，与上一题的 leading 布局一致；不改变切题回调。热点开始学习直接移除星星，保留文字、题数和入口逻辑。单词标题取消过紧的固定行高并禁止纵向收缩，按当前字体自然度量布局，不改全局字体或文本组件。
- 安卓直接使用既有 production 构建身份和微信配置。新手动下载记录放在 `manualAndroidPreview`，不是旧独立 `.test` 客户端的自动更新。`ios-app-store`、`android-apk` 和旧 `android-test` 条目与发布前逐项相同；只更新 iOS TestFlight 条目并新增手动体验字段。
- 无生产 API 部署、数据库迁移或业务数据改写；未改播放器、随身听、热点题库关系或题库内容。原工程 HEAD 和未提交状态保持，修复在隔离克隆完成；只更新本任务自行建立的方案记录。

## 验证与未验事项

锁文件未修改。按锁文件重装依赖后，全仓检查通过：客户端 283 套 / 2005 项、发布测试 20 套 / 197 项、API 89 文件 / 823 项通过（3 项既有跳过），类型检查与 lint 无错误。安卓新增原生验签 3 项、发布脚本 3 项及渠道解析 5 项通过；PR #340 和对应 main CI 通过。安卓发布脚本首次因启动环境 umask 077 改变负向权限夹具而失败，恢复标准 umask 022 后原检查全部通过，未改测试或绕过检查。

两端 Release、签名、包身份、生产地址和微信制品门禁通过。Web 最终入口只改一处 JSX；类型、完整导出及浏览器验证通过，使用既有 actionWidth，未修改全局 TopBar。原生 UI 与真实网络耗时尚无本轮真机结果，不能把这些代码和制品检查写成用户验收通过。

待用户在 3596174 验收：

1. 安卓 900 句及其他题库下载完成、断网读取/播放；iOS 同操作继续保持原体验，安卓单词下载正常。
2. 双端连续“认识/下一词”，慢网与断网时不等待云端；退出重进/重启、收藏、学习位置及跨端同步保持正确。
3. 安卓微信登录往返与支付、权益回写；本轮只完成正式配置和制品一致性验证，没有进行真机登录或真实支付。
4. 双端上一题/下一题图文居中，安卓 `g/p/q/y/j` 下沿完整，热点开始学习只留文字；同时回归播放、随身听、热点进入题库和离线使用。

安装新安卓包可以同签名覆盖正式 App，请保留已有安装数据，不先卸载。原 `.test` 独立测试 App 仍保留其本地数据，本轮没有进行跨包本地迁移，也不能把它当作同包升级。

## 回滚与追溯

TestFlight 前一候选为 3596172；正式 Android 主入口仍为 3578875，旧独立测试渠道仍为 3596173。网站上一稳定部署为 `dpy5tn55ph9c`（`c4e8b778`）；本轮首次手动入口部署为 `dpzehyl40qkq`（`2bed7706`），随后以本记录最终部署修正入口换行。

更新清单备份位于服务器 `/opt/icao/backups/app-updates/android-preview-3596174/` 与 `/opt/icao/backups/app-updates/ios-testflight-3596174/`。网站或清单回滚不等同手机降级；已覆盖安装的新安卓包如需修复，应交付更高 build 的同签名候选，不通过卸载或清数据回退。

详细构建日志、制品对照、Apple 回执及公网校验保存在本机 `/Users/zhouyide/.codex/artifacts/icao-repair-3596174-20261104/`；[本轮方案](../../workstreams/experience-optimization-2026-11/android-download-vocabulary-response-plan.md)保存讨论、独立排查及范围。


## 2026-11-05 安卓缓存读取修复与体验包更新

用户将后续范围收窄为安卓题库下载，并明确取消模拟器验收，要求上线后自行真机验证。苹果、单词和其他功能不在本次改动范围。

**根因与改动：** 已保存的题库密文是 Base64 字符串。当前 Expo Crypto 55.0.17 的 Android `AESSealedData.fromCombined` 桥接仅接受 `Uint8Array`，iOS 接受原字符串；此前缓存读取失败被转为未就绪。仅在题库缓存读取处将 Android 的输入解码为字节，iOS 仍传入原字符串。磁盘格式、密钥、AAD、权限凭证、全局 HTTP、同步、下载调度、媒体和学习数据合同均未修改；不清缓存或迁移数据。另更新安卓构建号和针对平台入参的测试夹具；`services/api/scripts/app-content-native.test.mjs` 仅为测试，未改后端运行时代码，也未部署 API 或数据库。

- 候选：Android **1.3.1 / 3596175**；正式包名 `com.readyoufife.app`，原签名与微信配置保持。
- 构建源码：`ca10309ea1c74be77353cae025a29c37babc1fa0`；[PR #343](https://github.com/XIciA/icao-app/pull/343)；annotated tag `release/android/v1.3.1-b3596175`。从干净且与 origin/main 一致的 main 构建。
- [公开 APK](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/readyoufife-android-preview-1.3.1-b3596175.apk)：138,452,767 bytes；SHA-256 `e101016690ddd9c7cac2790993d59e21877bc6b286fa192c6d89a8be3a52eadb`。
- 发布脚本已从公开 URL 读取 APK 全量校验摘要；包名、签名证书、微信 App ID 与登录/支付回调均与当前公网正式包 3578875 一致。
- 官网浏览器已确认右上角“安卓体验”链接指向 3596175，正式下载主链接仍为 3578875。无需重新部署 Web；公网清单对比确认只有 `manualAndroidPreview` 改变，所有 `releases` 条目逐项保持。
- iOS TestFlight 仍为 3596174，本次未构建或上传苹果；安卓正式渠道仍为 3578875，旧独立测试渠道仍为 3596173。

**代码检查：** 聚焦 repository/download 测试 81 项通过；TypeScript 通过。全仓检查的发布测试 20 套 / 197 项、客户端 283 套 / 2007 项及其余前置检查通过，lint 0 错误 / 74 项既有警告。该次完整命令在 API 的 4 项旧 VM 夹具处失败，因为未模拟新增的 `react-native` Platform 导入；修正夹具并加入 Android 字节约束后，相关 13 项与完整 `pnpm check:api`（89 文件 / 823 项通过，3 项既有跳过及构建）通过。没有将第一次失败的完整命令记为直接通过。GitHub CI 在交付时仍排队，未作为成功证据。

**验收状态：** 代码检查通过、签名 Release 包已交付。按用户最后指令未安装新包或执行模拟器下载/断网测试；原模拟器账号和安装数据保留。900 句等题库完整下载、断网冷启动读取与音频播放由用户在 3596175 真机验收，目前待验；不能把制品检查当作这些体验已通过。用户关于苹果已无问题的反馈不扩展为未单独验证的支付等场景通过。

**证据与回滚：** 本机 `/Users/zhouyide/.codex/artifacts/icao-android-cache-3596175-20261105/` 保存检查日志、身份对照、发布日志、发布前后清单及待验标记。服务器备份 `/opt/icao/backups/app-updates/android-preview-3596175/updates-before-20261104T162540710026Z.json` 可恢复原手动入口 3596174；这只是入口回滚，不代表允许手机降级或卸载清数据。原工程既有未提交修改未纳入本次提交。

## 2026-11-05 安卓按压反馈与正式渠道 1.3.1

用户反馈 3596175 基本正常，但所有查词位置缺少按压灰色反馈；本轮明确批准局部视觉修复，并将安卓 1.3.1 切换到官网正式下载、取消测试入口。此前要求不做模拟器验收仍有效。

- 仅为安卓可查词文字增加局部临时按压背景，沿用原生 Text 的 press-in/out、长按与作答回调；无新手势或布局容器。开启高亮模式时禁用灰色反馈，已有彩色标记优先，临时状态不写存储或同步。iOS/Web 返回原 Text 行为，高亮添加/取消及查词长按时长未修改。
- 官网移除右上角“安卓体验”链接；安卓正式卡片及其右上角版本标签直接使用既有 `android-apk` 清单，显示 v1.3.1。旧独立 `.test` 渠道保留，不把独立包推送为正式包。
- 无 API 部署、数据库迁移、下载/播放器/随身听/词汇/全局 HTTP/同步修改。苹果仍为 TestFlight 3596174，未重新构建或发布。
- 来源为干净 main `7d6c456f2b8d10c870a8e5eea1c73b44e20cdeb0`，[PR #345](https://github.com/XIciA/icao-app/pull/345)。Android 1.3.1 / 3596176，正式包名 `com.readyoufife.app`，签名和微信配置与既有正式包一致。
- APK：https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/readyoufife-android-1.3.1-b3596176.apk；138455255 bytes；SHA-256 `0d6aa7d6480d372bca74cd1028e41f70b5cc5da2d46999d8fb0cca17782d78c5`。发布脚本已全量读取公开 APK 并校验摘要，清单回读一致。发布前后仅 `android-apk` 更新，其余渠道及历史手动预览字段保持；新官网不再消费预览字段。
- EdgeOne deployment `dpjewnwhkewx`，正式源码同上；官网 HTML 与全部入口 JS 摘要匹配。浏览器确认测试入口消失、安卓版本 v1.3.1、正式链接指向 3596176，苹果链接保持。
- Annotated tags：`release/android/v1.3.1-b3596176`、`release/web-edgeone/20261105-7d6c456f`。

验证：48 项聚焦检查通过（新增 8 项覆盖按压/取消、正文/参考/选项、彩色高亮优先、模式切换、选项长按不误答与非安卓行为）。完整 `pnpm check` 成功：发布 20 套/197 项、客户端 284 套/2015 项、API 89 文件/823 项通过，3 项既有跳过；类型与构建通过，lint 0 错误/74 项既有警告。GitHub PR #345 CI 成功。Android Release 和 Web 导出通过。

交付与验收分开：正式下载已交付；本次未执行模拟器或真机按压体验验收。实际手感、手机覆盖安装及高亮交互由用户验收。此前另一台从未安装过 App 的手机无法安装 1.2.1，尚缺型号/系统/错误提示，本轮不将这一未定位现象宣称为已修复。更新检测机制未改：1.2.0 等已带更新检测的旧正式包按原规则发现 1.3.1；1.1.1/1.1.2 没有该检测能力，仍需手动下载。

回滚：官网可回到 deployment `dpmbjxoo27xb`；正式清单前一版本 1.2.1 / 3578875，服务器备份目录 `/opt/icao/backups/app-updates/android-formal-3596176/`。清单/页面回滚不等于手机可降级，已升级用户保留安装数据，通过更高构建号修复。证据保存在 `/Users/zhouyide/.codex/artifacts/icao-android-3596176-20261105/`。原工程未提交修改保持不变。

## 2026-11-05 苹果正式更新清单同步

用户确认苹果和安卓均已上线，并要求更新 `ios-app-store`。本次 Apple 实时 API 确认 1.3.1 / 3596174 为 READY_FOR_SALE / READY_FOR_DISTRIBUTION，downloadable=true、构建 VALID；中国区公开查询亦返回 1.3.1，正式发布时间为北京时间 11 月 5 日 05:46:19。旧概览中正式版仍为 1.2.1 的记录已过时，以本次实时核对为准。

- 北京时间 10:08，使用干净 main `d3872a5c` 中现有单渠道 publisher，将正式 `ios-app-store` 从 1.2.1 / 3576434 同步到 **1.3.1 / 3596174**；链接仍为 https://apps.apple.com/cn/app/id6800583111，更新说明“修复了已知问题。”。App 源码沿用 TestFlight 3596174 的精确 release tag，未重新构建或提交审核。
- 公网清单回读一致；用已发布 iOS 1.2.1 tag 的真实解析与版本比较函数验证，可发现新版 1.3.1，当前 1.3.1 / 3596174 不误提示。其余三个渠道及 manualAndroidPreview 逐字段对比不变。
- 自动检查仍遵循登录后首页、24 小时频率及同版提示抑制；关于页手动检查可立即触发。不承诺所有设备立即弹窗；旧版真机弹窗与商店跳转由用户验收。
- 发布前清单备份：服务器 `/opt/icao/backups/app-updates/ios-store-131-b3596174/updates-before-20261105T020815104671Z.json`。需要回退时仅提取 ios-app-store 单渠道，重新核对商店状态后复用 publisher，不能用整份旧清单覆盖其他渠道。
- [Apple、发布及兼容性验证证据](20261105-ios-app-store-manifest-1.3.1.json)。本轮仅同步更新清单和发布记录，无 API 部署、数据库迁移或 App 源码改动。
