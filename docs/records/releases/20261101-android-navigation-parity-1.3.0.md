# Android 1.3.0 导航对齐 iOS

日期：2026-11-01（北京时间）。用户要求以稳定 iOS 1.3.0 为基准，检查 Android 功能页面与切换体验，修复后交付官网独立测试包；不改 iOS，不提交苹果审核。此前偶发保存红字的问题按用户要求暂停，本轮不修改存储与同步。

## 根因与修复

普通刷题返回调用 `session.finish('abort')` 保存记录，该函数设置 `session.report`，共享学习页随即渲染报告，外层再设置离开状态并返回。Android 的退出过渡会显示被替换后的报告内容。按钮返回、系统返回、内嵌学习三个回归用例在修复前全部失败，均捕获一次不应发生的报告组件挂载。

Android 普通返回现在保留题目组件直至退出；仍执行原有保存与单次导航。失败时撤销返回展示状态，保留重试；用户主动“结束”、最后一题完成及模考原有报告流程保留。iOS 返回条件与展示行为保持原样，只对 Android 返回意图启用展示保护。

## 对齐检查范围

- 梳理原生路由、iOS / Android 文件覆盖与 53 处平台判断；两端题库、热点、学习记录、标注、单词收藏、词汇、随身听、模考、课程 / 资源、个人页、账号与反馈复用同一套原生业务组件。
- 核对公共导航门禁、局部返回、底部弹层系统返回、深链无历史回退、内嵌学习回源；五个题库均覆盖直接返回测试。
- 保留必要系统差异：iOS 边缘返回与 Android 系统返回、Apple 登录 / StoreKit 与 Android 微信支付 / APK 更新、录音格式 / 权限、键盘 / OTP、系统阴影与启动图适配。未以平台差异为由增加业务流程，也未改动正常页面设计。
- 不把源码检查等同所有设备的逐屏体验验收；尚需用户在新 Android 包验证实际过渡动画、厂商系统返回与日常使用。

## 验证与候选

- Android 专用解析及运行环境回归：16 组、111 项通过。覆盖公共导航、题库学习与报告、历史记录、词汇、热点、随身听、反馈及题库路由。
- 测试工具的 Android preset 初次运行缺少 Expo 默认 Babel 配置而未启动用例；复用锁定版本默认 Babel 配置后运行通过，没有改动产品依赖。
- 完整媒体校验通过：复用既有恢复音频库与当前本地 revisions 校验输入，未发布 / 修改内容资源。隔离工作区首次缺少这些输入及内容生成目录，补齐后通过。
- 候选显示版本 1.3.0；仅 Android versionCode 从 3593082 递增到 3593084。iOS 1.3.0 / 3593083 配置与现有 TestFlight 保持不变。
- 前端完整检查：267 组 / 1885 项通过；Android 专项已单独通过。`content:check` 完整媒体检查与 `check:ci` 其余检查组合执行，不把纯源码检查冒充媒体校验。API 84 文件 / 802 项通过、3 项按配置跳过；类型检查与构建通过。GitHub 仓库与 EdgeOne 检查通过（run 41313340276）。

## Android 交付

- PR #312；精确源码 `64e6e7c4bd448852efe3828fe917ac28a3eccd0b`，干净 `main = origin/main` 构建。Annotated tag `release/android/v1.3.0-b3593084` 已推送。
- 独立测试包 `com.readyoufife.app.test`，1.3.0 / 3593084；Release 构建成功，版本、包身份、v2 签名、微信运行时及生产地址检查通过。签名与既有 1.3.0 / 3593082 一致，可覆盖升级。
- APK 138350237 字节；SHA-256 `a1022328a5d198c8f716830e466d074cd5d3dae391f9b9b27172a946281a9810`。
- 官网 [Android 测试入口](https://readyoufife.com/download) 已更新至[本次不可变 APK](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-android-test-1.3.0-b3593084.apk)；仅更新 `android-test` 清单，其他三渠道保持不变。没有部署 Web、API 或内容，没有生成 iOS 新包。
- 发布前清单备份：`/opt/icao/backups/app-updates/android-test-130-b3593084/updates-before-20261101T140725379026Z.json`。回滚目标为原 1.3.0 / 3593082 独立测试 APK，已保留原文件。
- 本地证据与 APK：`.generated/android-navigation-parity-delivery/`。用户真机验收仍待完成；不宣称所有安卓机型的逐屏体验已经验收。
