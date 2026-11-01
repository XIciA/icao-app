# 1.3.0 三项轻量调整与双端测试交付

日期：2026-11-01（北京时间）。本轮用户授权只修复个人页进度闪烁、交换下载管理 OPI / 故事复诵卡片顺序、规范 OPI 考点名称并保留筛选；上传 TestFlight 1.3.0，不提交 App Store 审核。

## 实现与验证

- 源码基于最新 TestFlight 1.4.4 / 3593082。PR #309 合并后源码为 `8669c3bd81be37e44ee952a242cb027a3a4b8a19`。
- 下载管理只交换 OPI 与故事复诵的位置。
- 考点显示限定为北京、广汉、新津、绵阳、广州、新疆、西南、遂宁、深圳、上海十个“地区＋考点”名称。旧别名统一映射，未识别名称按稳定哈希固定分配至允许名单；无具体考点的综合反馈显示“全部考点”。移除重复综合筛选和历史解释小字。
- 保留原始来源名称、ID、原始问题、题目引用、日期及题目数量；标准名称同时用于详情筛选与进入学习的范围，旧名称链接仍可解析。
- 个人页在同账号、同考试目标、同题库范围刷新期间保留上一份完整进度和分母；新结果就绪后一起替换，读取失败保留有效数字，等价目录不重复更新。账号、环境、目标和范围变化时隔离旧进度。
- 完整 `pnpm check` 通过：前端 267 套 / 1874 项；API 84 文件 / 802 项通过、3 项按配置跳过。GitHub CI 通过（run 41301602053），包含数据库约束、Node 合同运行时与 Web 导出兼容性检查。
- 线上只读核对 28 天、39 份来源、734 条题目引用；全部来源内容与身份不变，十个考点的筛选结果逐一验证通过。

## 验收边界

初次交付 iOS 测试包后，用户追加授权生成 Android 测试版并上线官网测试入口，已完成下述补充交付。没有提交 App Store 审核，没有部署 Web / API 或修改生产热点数据。用户需在新 TestFlight 真机验收卡片顺序、考点筛选及五仪表闪烁修复；自动检查不替代真机验收。

## 已交付候选

- iOS **1.3.0 / 3593083**，Bundle ID `com.readyoufife.ios`；Apple build ID `483c6115-9dcd-4d41-840d-ef1d72e48866`，`VALID`、`IN_BETA_TESTING`、未过期，既有内部“测试”组可访问。回读时间 `2026-11-01T11:49:40.283Z`。
- Annotated tag：`release/ios-testflight/v1.3.0-b3593083`，绑定上述精确源码；标签已推送。
- Release 归档、签名、包身份、生产地址、权限、11份隐私清单 / 3个嵌入代码审计通过；Apple 包校验及上传均无错误。IPA 41330079 字节，SHA-256 `7a8c68bab9442dc4ee04be92ff9f8e0141a5beb33310a8ab92ec6fc4e792f122`；归档审计 SHA-256 `1c6783a71e4568bdf4cb487a155480bc242d360583ced0e0550c423e7167cbcf`。
- 原归档成功后，审计输出因自定义保存目录不满足工具要求而停止；将审计证据写入规定的 `.generated/testflight/` 后，复用同一归档重新完成所有包校验、导出与上传，未改动 App 代码或跳过校验。
- 原项目本地证据：`.generated/lightweight-testflight-130/`；归档及 IPA：`.generated/testflight-130/`。原工作区已有未提交修改保留，未纳入本轮。
- 用户真机验收待完成。未提交 Apple 正式审核，未改动正式渠道；之前的 TestFlight 1.4.4 / 3593082 保留。

## Android 补充交付（2026-11-01）

- 独立测试版 **1.3.0 / 3593082**，包名 `com.readyoufife.app.test`；干净 `main = origin/main` 源码 `68cf3022411d29c051fdbee0065adb67a8149657`，与上述 iOS 标签除文档外完全一致，无追加业务代码修改。复用同源完整 `pnpm check` 结果。
- Annotated tag：`release/android/v1.3.0-b3593082`，已推送。Release 构建、微信运行时、生产地址、版本、包身份和 v2 签名检查通过；签名与原独立测试包一致，build 高于旧版 3593080。
- APK 138350093 字节；SHA-256 `cd31dcc36a9092b53fc8649dc26801d92aee2d05696aca26434b90ff1c54be85`。
- [官网测试入口](https://readyoufife.com/download)中的「Android 测试版」已更新；[不可变 APK](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-android-test-1.3.0-b3593082.apk)。浏览器链接核验和独立公开下载摘要 / 大小验证通过。
- 只更新 `updates.json` 的 `android-test` 渠道；正式 Android 1.2.1 / 3578875、App Store 与 iOS TestFlight 清单项逐项核对保持不变。官网复用既有动态测试入口，无 Web 代码部署。
- 旧测试版显示版本为 1.4.1，本版按用户要求为 1.3.0；构建号递增可覆盖安装，但旧客户端的语义版本比较可能不提示升级，应从官网手动下载安装。未改变升级逻辑。
- 发布前清单备份：服务器 `/opt/icao/backups/app-updates/android-test-130-b3593082/updates-before-20261101T121717809985Z.json`；回滚目标为旧独立测试包 1.4.1 / 3593080，保留其不可变 APK，仅在获授权后回退对应清单项。
- 本地 APK、签名、公开验证、清单前后快照及构建日志保存在 `.generated/android-test-130-delivery/`。用户真机安装、数据保留和三项改动体验仍待验收，未提交苹果审核。

## App Store 审核提交（追加授权）

用户于 2026-11-01 明确要求直接提交已上传的最新 iOS 构建 3593083。北京时间 22:12，已在 App Store Connect 创建 1.3.0 商店版本并提交，当前状态为 **等待审核**。

- 复用原 TestFlight 构建 `1.3.0 (3593083)`，build ID `483c6115-9dcd-4d41-840d-ef1d72e48866`；源码及签名归档沿用前述 tag 和证据，未重新构建或上传。
- 提交 ID `986c5635-0028-498b-a509-9ace50d3ead2`；[审核提交详情](https://appstoreconnect.apple.com/apps/6800583111/distribution/reviewsubmissions/details/986c5635-0028-498b-a509-9ace50d3ead2)。Apple 成功提示“已提交 1 个项目”，详情回读“等待审核”及精确构建号。
- 更新说明：“修复了已知问题。”；沿用现有截图、描述、审核账号与联系资料。沿用“审核通过后自动发布”、立即向所有用户发布更新、保留现有评分的设置。
- 该动作仅提交 iOS 审核；正式更新清单未提前切换，尚不代表 Apple 已批准或新版已可下载。提交前网页显示现有商店版本 1.2.2 可分发，与此前项目表中 1.2.1 的历史记录存在差异，本次不改写正式渠道清单。
- 本地凭据：`.generated/app-store-130-submission/submission.json`、`waiting-for-review.jpg`。此前“未提交审核”的描述为初次测试交付时的状态，以本追加记录为最新状态。
