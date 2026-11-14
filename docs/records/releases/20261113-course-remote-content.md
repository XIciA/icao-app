# 2026-11-13 体系课程与模拟录音回顾

## 已发布 Web 展示

- PR：[#354](https://github.com/XIciA/icao-app/pull/354)。
- 提交：`a3d0582b6f63e16720201a51a62197e3fa3188cc`。
- 平台：EdgeOne Production，readyoufife.com。
- Deployment：`dpn0in0xj50l`。
- 结果：课程列表和详情以较大课时信息替代价格，原详情蓝色课时小标移除；课程内容、导航和其他页面保持。
- 验证：课程聚焦测试、类型检查、EdgeOne 构建、PR CI 通过；线上浏览器核验列表与详情未显示金额。

## App 远程内容候选与交付

- 用户确认网页版效果后授权实施原生页面加远程内容，交付 iOS TestFlight；不使用 WebView。
- 版本：1.3.2 / 3596175；源码 `2964376be310ff488b7107e7580e5ef313de1d70`，PR [#355](https://github.com/XIciA/icao-app/pull/355)。
- 课程数据采用版本化 JSON，包含内置兜底、本地缓存、摘要／结构校验及旧版本保护。
- 3596175 未包含此前讨论的模拟练习录音修复；随后按用户要求补齐，见本页后续交付。
- TestFlight 已交付，实际状态和验证证据见下文；用户真机体验待验收。

实施与后续内容更新方法见[任务说明](../../workstreams/course-remote-content/implementation.md)。

## 远程内容 Web 发布完成

- 时间：2026-11-13 14:50（北京时间）。
- 来源：干净 main / origin/main `2964376be310ff488b7107e7580e5ef313de1d70`。
- EdgeOne Production deployment：`dp6dgxxz3ryp`。
- 标签：`release/web-edgeone/20261113-2964376b`；此前仅 Web 展示标签 `release/web-edgeone/20261113-a3d0582b`。
- 公开数据：`https://readyoufife.com/course-content.json`，版本 1，SHA-256 `6efa0e1bb3c7411552a7759fba10c22420ebcdc7e131e255d0c0c7c55730edfc`，与发布源完全一致。
- Cache-Control：`public, max-age=0, must-revalidate`。
- 已验证线上页面与详情保留原布局、大纲，课时显示、金额隐藏。截图保存在本机 `/Users/zhouyide/.codex/visualizations/2026/11/12/01a1ce04-a239-7fa3-8fa1-14056545a641/course-details-1.3.2.jpg`。
- 代码检查：26 项课程测试、本地 check:ci（App 2026 项、API 826 项）、类型、版本一致性、EdgeOne 导出通过；GitHub [CI](https://github.com/XIciA/icao-app/actions/runs/43379973083) 通过。
- 真实 AI live verifier 的 5 项检查通过，验证器及固定样本与当前源码逐文件摘要一致；临时账号及资源由验证器清理。
- 未修改 API／数据库、正式渠道清单或其他业务功能；未发布 Android 或提交 App Store 审核。
- Web 回滚目标：`release/web-edgeone/20261113-a3d0582b`；如以后仅回滚课程文案，需要将旧内容作为更高版本的新课程发布物发布，避免被已安装 App 的旧版本保护拒绝。

## iOS TestFlight 已可用

- 2026-11-13 15:13:58（北京时间）通过 App Store Connect API 确认：版本 `1.3.2`、构建 `3596175`，`VALID`、`IN_BETA_TESTING`、未过期，内部“测试”组可用。
- 标签：`release/ios-testflight/v1.3.2-b3596175`；提交 `2964376be310ff488b7107e7580e5ef313de1d70`。
- Bundle ID：`com.readyoufife.ios`；Release 归档、导出、Apple 验证、上传均成功。
- IPA SHA-256：`d87bad8e7d55c2219ce92dc05dbbf85556b971ccd7152f3eef112f7827384725`。
- 包身份、版本、签名、隐私清单、麦克风权限、生产 API/Supabase 地址、微信原生配置及无开发启动资源检查通过；实际原生 JS bundle 包含 `https://readyoufife.com/course-content.json`。
- 发布入口的 196 项录音回归、音频边界、类型、TestFlight 合同及关键能力检查通过；本轮录音代码未改，测试结果不代表模拟练习回听问题已修复。
- 初次原生依赖下载因官方仓库 TLS 网络中断停止；使用同版本官方资源重试后成功。React Native Core Release 资源校验匹配官方 SHA-256 `cf26f030432f5841fd7b56eee33526e19eb1fcb8d6c1c36374cafa5132f13b3e`，未改动依赖版本或产品代码。
- 本机归档与 IPA：`/private/tmp/icao-course-web-release/.generated/testflight/ICAO-3596175-20261113T065719Z.xcarchive`、`/private/tmp/icao-course-web-release/.generated/testflight/export-3596175-20261113T065719Z/app.ipa`。该目录下 `candidate.json` 和 `archive-audit-3596175-20261113T065719Z.json` 保存制品证据；`../course-delivery/testflight-status.json` 保存 Apple 状态核验结果。
- iOS 回滚参考：`release/ios-testflight/v1.3.1-b3596174`；正式 App Store 仍为原有版本，未提交 1.3.2 正式审核，也未修改正式更新提示。
- 用户验收：尚未完成。请在此 TestFlight 构建中检查课程列表／详情无金额、课时清晰、分类／关闭／返回逻辑、微信号复制和断网进入；未来内容发布后联网重新进入可读取新内容。


## 模拟录音回顾已交付（3596176）

- 用户明确要求执行并上传新的 TestFlight，版本保持 1.3.2，构建递增为 3596176。
- 修复完成模拟练习后录音未关联学习记录、退出清理导致回顾不能播放的问题；沿用现有题卡回放与重录按钮。
- 保留课程已交付效果；不改原生录音参数、题库内容、会员、账号业务或正式更新渠道。音频留在本机，云同步数据格式保持。
- 来源：PR [#357](https://github.com/XIciA/icao-app/pull/357)，干净 main / origin/main `ce6092ecca8a0f37bf95e648d5620881c5a5052d`。
- 2026-11-13 16:33:43（北京时间）通过 App Store Connect API 确认：1.3.2 / 3596176、`VALID`、`IN_BETA_TESTING`、未过期，内部“测试”组可用。标签：`release/ios-testflight/v1.3.2-b3596176`。
- IPA SHA-256：`990e4f1f97006de1fbf25de7bb59677d0bab099fb3dbd60db002cee686e49a17`。
- 本地 `pnpm check:ci` 通过：App 287 套／2036 项，API 826 项；发布入口的 206 项录音回归、类型、音频边界、TestFlight 合同、关键能力、包身份／签名／隐私／生产地址检查通过。GitHub [CI](https://github.com/XIciA/icao-app/actions/runs/43390482845) 通过；依赖使用原入库 lockfile，未升级。
- 归档中的实际原生 bundle 包含新增的录音持久引用及原有课程远程地址。Apple 校验、上传、处理和测试组分配均已完成；未提交 App Store 审核，未发布 Android 或修改正式更新清单。
- 发布过程中 Apple 因新版 Developer Program License Agreement 未接受返回 HTTP 403。账户持有人自行接受后，网页显示 2026-11-13 接受，发布 API 恢复；重新通过构建号与权限检查，复用同一干净主干归档完成导出上传。
- 同源产品 Web 已发布：deployment `dp6705sjj41e`，标签 `release/web-edgeone/20261113-ce6092ec`。16:30:32 公网检查首页／课程 JSON 均为 HTTP 200，首页脚本与本次导出一致，课程数据与发布源完全相同；网页录音存储行为保持。
- 本机归档：`/private/tmp/icao-course-web-release/.generated/testflight/ICAO-3596176-preagreement.xcarchive`；IPA：同目录 `export-3596176-20261113T082550Z/app.ipa`；证据：`candidate-3596176.json`、`archive-audit-3596176-20261113T082550Z.json`，以及 `../mock-recording-delivery/testflight-status.json`／`web-status.json`。
- 回滚参考：iOS `release/ios-testflight/v1.3.2-b3596175`；Web `release/web-edgeone/20261113-2964376b`。无需数据库迁移，原有用户数据不做批量改写。
- 用户真机验收待完成：新版完成一场含口语题的模拟练习 → 本次记录／答题卡 → 对应题目 → 右侧回放；退出重进／重启后回听，成功重录覆盖、失败保留旧录音，不同场次互不串音。旧版本已清理的音频不能恢复，本机音频不跨设备同步。

## Android 1.3.2 正式发布准备

- 用户于 2026-11-13 明确授权：对齐 iOS 1.3.2（3596176），打包后替换官网正式下载。
- 对齐基准：`ce6092ecca8a0f37bf95e648d5620881c5a5052d`；其后至本轮开始的 main 没有 App 功能变化，仅文档和服务端 AI 改动，本轮不部署后端。
- Android 版本 1.3.2，构建 3596177（上一正式 Android 构建 3596176）。正式包名与签名延续；iOS 配置保持。
- 课程和模拟录音共用已交付 iOS 实现；仅正式 Android 更新入口改为 `https://readyoufife.com/download?android=auto`。官网从受校验的正式清单读取 APK，尝试自动下载，保留手动按钮和清单失败重试。普通访问不触发自动下载。
- 测试包仍沿用原有独立更新安装流程，iOS 更新入口、检查频率和忽略版本规则不变。正式清单继续保存 APK 直链、大小和摘要，兼容老版本应用内下载。
- 聚焦更新／模拟录音回顾测试 32 项、下载页 4 项通过。完整 `pnpm check` 因未纳入 Git 的历史音频 `audio/listening/main/001.mp3` 缺失停止；使用仓库支持的干净环境 `pnpm check:ci` 检查源码合同，不能将其写成媒体二进制全量验证通过。
- 本段仅记录准备；正式制品、部署、公开下载与最终检查结果在交付后补充。未进行 Android 真机体验验收。


## Android 1.3.2 正式下载已上线

- 时间：2026-11-13 20:18（北京时间）；[PR #360](https://github.com/XIciA/icao-app/pull/360)，干净 main / origin/main `89d46fd2d81be07a309143480bab1d379976bcd5`。
- Android：1.3.2 / 3596177，正式包名 `com.readyoufife.app`；标签 `release/android/v1.3.2-b3596177`。
- [正式 APK](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/readyoufife-android-1.3.2-b3596177.apk)：138474271 bytes；SHA-256 `09844a6f6ee40ae0c66b4fc75408c66675f969b21ddd7ec91107edf8d3dd72d6`。
- 发布包 v2 签名、版本／包名、生产服务地址和微信原生合同通过；与旧正式 3596176 签名证书 SHA-256 完全一致（`25d4fe5523417289da5fe0bf970593b98fe4ea658883edeb5792906e31456629`），构建号递增。实际签名 bundle 包含课程远程 JSON 与官网下载自动触发入口。
- 本地 `pnpm check:ci` 通过：App 288 套／2042 项、API 837 项；[GitHub CI](https://github.com/XIciA/icao-app/actions/runs/43420752549) 通过；正式 Gradle 构建成功。历史媒体全量检查缺口保留前述说明，不写成全量媒体验证通过。
- 官网 EdgeOne Production deployment `dpq5dl5b2k7g`，标签 `release/web-edgeone/20261113-89d46fd2`；公网下载页脚本与此次生产导出一致。
- 既有单渠道 publisher 先验证公开 APK 完整摘要，再更新 `android-apk`；公开清单回读为 1.3.2 / 3596177。其余三个渠道及 `manualAndroidPreview` 与发布前逐项一致，未修改 iOS 正式／测试清单。
- 在用户 Chrome 验证 `https://readyoufife.com/download?android=auto`：页面显示 v1.3.2、正确正式 APK 链接和手动下载提示，浏览器实际自动下载完成。下载文件再次校验 SHA-256／大小与签名制品一致；浏览器阻止下载与网络失败重试由聚焦测试覆盖，不冒充 Android 浏览器真机实测。
- 本机制品及签名报告：`/private/tmp/icao-course-web-release/.generated/releases/android/1.3.2/`；Chrome 下载文件：`/Users/zhouyide/Downloads/readyoufife-android-1.3.2-b3596177.apk`。
- 服务器发布记录和旧清单备份：`/opt/icao/releases/android-1.3.2-b3596177/`，备份 `backups/updates-before-20261113T121753055400Z.json`。如需撤回下载，恢复上一正式 APK 清单即可；已经安装 3596177 的设备不能直接降级，修正需更高构建号。
- 回滚来源：Android `release/android/v1.3.1-b3596176`；Web `release/web-edgeone/20261113-ce6092ec`。不部署 API、不执行数据库迁移、不修改学习数据或题库内容。
- 用户真机验收仍待完成：覆盖安装保留数据、课程列表／详情无价格且课时清晰、模拟录音在本次记录／答题卡中回放和重录覆盖，以及 Android 浏览器下载／系统安装。没有连接 Android 设备，本轮不宣称真机体验已验收。


## 11 月 14 日两端正式更新提示

- 用户确认 App Store 审核通过并明确要求苹果、安卓都更新正式通知清单。
- 13:46（北京时间）中国区 Apple 公开查询已返回 1.3.2；正式 iOS 构建沿用已提交的 3596176，未重新构建。苹果上架来源标签 `release/ios-testflight/v1.3.2-b3596176` / `ce6092ecca8a0f37bf95e648d5620881c5a5052d`。
- 使用干净主干 `6fe4d793213e596b3bca327d4d2efc81e93646fd` 的单渠道 publisher，将 `ios-app-store` 从 1.3.1 / 3596174 更新为 1.3.2 / 3596176，链接保持 `https://apps.apple.com/cn/app/id6800583111`。
- 安卓 `android-apk` 已是 1.3.2 / 3596177；再次核对公开 APK HTTP 200、文件大小一致，无需重复发布。公开清单回读确认两端正式版本正确，除 iOS 正式条目外全部字段保持原样。
- 旧清单备份：`/opt/icao/releases/ios-formal-1.3.2-b3596176/backups/updates-before-20261114T054636823309Z.json`。仅更新发布清单，无 API 部署、数据库迁移或用户数据修改。
- 旧版本按现有检测及忽略规则获取更新，不保证所有设备同时弹窗。安装旧安卓仍使用既有安装流程；1.3.2 后续更新打开官网。测试渠道不变，真机弹窗与跳转待用户验收。
