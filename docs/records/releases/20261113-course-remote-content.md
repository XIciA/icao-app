# 2026-11-13 体系课程展示与远程内容

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
- 模拟练习录音修改保持暂停，本轮没有修改录音、学习记录或用户数据。
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
