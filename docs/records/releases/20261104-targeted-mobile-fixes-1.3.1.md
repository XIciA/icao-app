# 安卓下载、单词响应与局部显示修复交付

记录日期：2026-11-04（北京时间）。用户已明确授权实施并上线苹果 TestFlight 与安卓测试版；安卓按本轮明确要求采用正式包身份，官网次要入口手动体验，不替换正式渠道。

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
