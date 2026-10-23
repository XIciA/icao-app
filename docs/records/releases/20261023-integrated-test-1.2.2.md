# 2026-10-23 整合测试版 1.2.2

状态：iOS TestFlight、Android 测试渠道和 EdgeOne 网页均已发布；模拟器及网页实际操作验收完成，覆盖范围和未执行项见下文。用户真机验收待进行。

## 来源与范围

- 源码：`7b133eacd4c41951e1f3ce5e06a68df78bd7260f`，PR #230 已 squash 合入 main；与实际验收提交 `22a1dc6438dd64b5ce7280aeb272becb997a866e` 源码树完全一致。#233 已包含并关闭。
- 移动端展示版本统一 `1.2.2`、构建号 `3580413`；Android 使用独立测试包 `com.readyoufife.app.test`，iOS 正式 Bundle ID `com.readyoufife.ios`。
- 包含六项任务整合；按用户最新要求回退本轮共享、页面和航空公司图标，保留业务与七页布局改动。
- 修复账号重试复用旧会话、跨标签引导遮挡、随身听间隔引导遮挡、模拟考试选择标识遮挡，以及 iOS 边缘返回与本地保存守卫衔接。
- 未部署 API、未执行数据库迁移；API 仍 `guide-20261022-41fd90d4`，内容版本 31。未提交 App Store 正式审核，未替换 Android 正式下载。

## 检查与真实操作

- 主干 CI 39876409766 通过。带完整媒体源的正式 Android 发布 `pnpm check`：前端 212 组/1419 项、API 67 组/682 项通过，内容、Contracts 与 TypeScript 检查通过；iOS 正式发布检查、StoreKit 19 组/187 项与关键能力证据门禁通过。
- iOS 正确签名 Release 包覆盖安装、冷启动保留登录及数据；学习、答题卡、记录、收藏、标签、高亮、笔记、词书、随身听、热点、资源、会员与引导执行真实点击/长按/滑动。
- 最终 iOS 边缘返回重验：页面中央横划不退出，短边缘滑动取消，完整边缘滑动返回正确上级；题目退出保存、重新进入恢复第二题，原 flight 高亮保留。多指取消仅单元验证，未冒称真实多指验收。
- 最终 iOS 完成 30 题词汇评估（故意全选不认识），显示 0/30、30 个待学词；滚动到底并返回词书/发现正常。模拟考试仅选 900 句生成 12 题，音频实际播放、提前结束显示 0/12，答题卡显示 2 已学/10 未学，返回保留配置。
- Android 真实验证独立测试包覆盖安装保留数据、登录/退出/重新登录、学习记录与 iOS 笔记高亮同步、五个发现入口、个人资料取消、安全与法律页面、反馈放弃、900 句 PDF 58 页生成及系统分享取消；四项模拟模块可选、全取消按钮禁用，标识不再遮挡。
- Android 人民币 7/31/93 天现价 ¥12/¥38/¥98、划线原价 ¥68/¥158/¥358，逐项点选购买按钮同步。iOS 美元 StoreKit 实价 $1.99/$4.99/$14.99，无编造划线原价，购买须知开关与返回正常。
- 本轮没有执行真实付款、短信发送、密码修改或反馈发送。麦克风权限尚未得到回复，因此未进行需要新授权的真实录音。模拟器结果不等同真机全功能无 Bug。

## 渠道交付

### EdgeOne 产品网页

- 2026-10-23 08:29（北京时间）部署成功，deployment `dplyqwfahu2y`，公开地址 https://readyoufife.com/。
- 标签 `release/web-edgeone/20261023-7b133eac` 绑定本轮精确源码。导出检查 181 文件/35.9 MiB 通过。
- 公网 HTML 引用 `index-57863dc7299f52177baa1afc88a0f80a.js`，下载摘要与本地一致：`7902f551e691be35d28b085707215fd4a8bfdcd36adda035d72a5536b6039a61`。
- 上线后真实刷新保留登录；个人页显示 4 已学/3 已完成，会员权益同步完成，返回个人页；打开同步记录、QFA 详情并返回，刷新 `/learning-records` 后记录保留；浏览器后退到个人页、前进到记录页正常。326px 窄屏卡片无重叠；任意无效地址显示默认未匹配页，Go back 可恢复首页。
- 回滚目标：上一部署 `dp447qbag0n7`。

### 移动端

Android 正式签名包已完成最终覆盖验收并发布：

- APK：`.generated/releases/android-test/1.2.2/feizhu-icao-android-test-1.2.2.apk`（正式构建目录）。
- 135,570,505 字节，SHA256 `5a06ea20f8354a26a3b2434a9c52c204a55c26ae6241c58fdb331f31ab9696b8`。
- v2 签名通过，证书 SHA256 `25d4fe5523417289da5fe0bf970593b98fe4ea658883edeb5792906e31456629`；含 arm64-v8a、armeabi-v7a、x86、x86_64。
- 回滚目标为既有 Android 测试 1.2.4 / 3580360 的不可变 APK，正式 Android 1.2.1 不变。

- 公网下载：[Android 测试版](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-android-test-1.2.2-b3580413.apk)，官网 `/download` 右上角测试入口已实际指向此包，正式主按钮仍为 1.2.1。
- 标签 `release/android-test/v1.2.2-b3580413`；公网文件摘要及发布清单读回验证通过。切换前备份 `/opt/icao/backups/app-updates-20261023-integrated/updates-before-20261023T003837677986Z.json`，正式两个渠道内容逐字段一致。
- 最终覆盖安装保留 firstInstallTime `2026-10-22 18:00:26`、登录、900句/QFA 记录和 flight 收藏；最终包三套餐现价/划线原价、按钮切换、须知返回、ICAO4/5 模考布局与返回均真实通过。当前进程错误级日志为 0，不据此声明所有条件下无错误。
- 旧测试版 1.2.4 的语义版本过滤可能不弹出 1.2.2 更新提示，使用官网测试入口手动下载；更高内部构建号的同签名覆盖已验证。

iOS 已发布 TestFlight：

- 2026-10-23 08:45（北京时间）独立查询确认 `1.2.2 / 3580413`、`processingState=VALID`、未过期，内部“测试”组关联；`internalBuildState=IN_BETA_TESTING`。外部状态 `READY_FOR_BETA_SUBMISSION`，未提交外部审核或 App Store 正式审核。
- Build/Delivery ID `1c14d7a5-8b12-49a2-abbe-1be9108d5012`；标签 `release/ios-testflight/v1.2.2-b3580413`。
- IPA SHA256 `fca5c5abf26c971b36969bac5221c33e5624f011502676abf5228f12148d15d2`，路径 `.generated/testflight/export-3580413-20261023T002002Z/app.ipa`；归档隐私/SDK 审计通过（11 manifests、3 embedded code），Apple 验证/上传无错误。
- `ios-testflight` 公网清单已更新并读回核验，备份 `updates-before-20261023T004540281584Z.json`；最终两个测试渠道均为 1.2.2 / 3580413，两个正式渠道与发布前逐字段一致。
- 现有测试用户在 TestFlight 中选择此构建；回滚参考为既有 `1.2.4 / 3576435` 内部候选。App Store 正式渠道仍 `1.2.1 / 3576434`。

## 证据与清理

工作过程、失败候选及修复重验见[整合任务](../../workstreams/integrated-test-release-2026-10/README.md)。证据已归档至 `/Users/zhouyide/.codex/icao-integration-evidence-20261023/`，含实际操作截图、Maestro 日志、最终模拟器 App 和 Android 最终覆盖验收；文本中的临时账号凭据已脱敏。正式 APK/IPA 保存在 `/Users/zhouyide/.codex/icao-guide-release-20261022/.generated/`。

专用临时账号及业务数据清理已验证，远端与本机凭据文件已移除；没有清空用户真实账号或真机数据。
