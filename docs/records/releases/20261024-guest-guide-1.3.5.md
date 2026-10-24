# 2026-10-24 游客入口、个人卡片与指南 1.3.5

状态：TestFlight、Android 测试渠道和 Web 均已发布；用户自行完成三端功能体验验收。

## 来源与改动

- 源码 `54bb61e2b32ba0bb8b8c576efb039fada10c420b`，PR #235；干净 main 等于 origin/main 后构建。
- 版本 1.3.5，iOS build / Android versionCode 3582074，高于既有 1.3.4 展示版本。
- 先展示公开题库目录，进入学习与个人数据时登录；取消回来源，登录成功继续原目标。
- 个人卡片主体进入资料，VIP 与剩余天数为独立按钮；备考等级和考试类型以标签展示。
- 指南统一弹层作用域、业务可用状态与账号隔离，修复首次恢复、返回、跳过重入、导出步骤和学习结束回顾。
- 按用户要求撤销旧 Vercel 冻结规则、门禁和专用发布入口；移除仅为冻结而复制的实现。普通 Web 默认使用 EdgeOne 产品运行时。
- 只交付 TestFlight、Android 独立测试 APK 和 readyoufife.com；不提交 App Store 正式审核、不替换 Android 正式下载、不部署 API 或数据库。

## 检查与验收边界

- 锁定依赖完整 `pnpm check` 通过；前端 218 组 / 1491 项，API 67 文件 / 682 项，TypeScript 通过，ESLint 0 错误 / 19 警告。
- CI 40054668308 全部通过，包括数据库约束和 EdgeOne 导出；Metro 默认解析回归 5 项通过。
- 真实 AI 合同验证：转写、语法、润色、航空术语保护及临时数据清理通过；API 版本 `guide-20261022-41fd90d4`，未部署服务端。
- 本轮实际体验验收由用户完成。旧的网页与模拟器局部证据保留，不等同本候选全功能或真机验收通过。

## EdgeOne 产品网页

- 正式域名 https://readyoufife.com，deployment `dpyl06vt0l2g`，181 文件 / 35.9 MiB。
- 公网 HTML 引用新 bundle，SHA256 与本地一致：`d0f8c79a5c85c111d4a0174507f5b4fc7b2f0f043de383850710f8cde94402fc`。
- 首页、下载页和两个深链返回 200；这是部署可用性检查，不替代浏览器功能验收。
- 标签 `release/web-edgeone/20261024-54bb61e2`；回滚 deployment `dplyqwfahu2y`。

## 移动端测试交付

### Android

- 独立测试包 `com.readyoufife.app.test`，1.3.5 / 3582074，四架构正式签名，v2 校验通过；证书与旧测试版相同。
- APK 135,585,277 字节，SHA256 `05f3c9a4073ebd62865b88b9211d2b33fe61d065bcde33d014a03c198c75be50`；服务器与本机独立公网下载核验一致。
- [测试下载](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-android-test-1.3.5-b3582074.apk)，官网 `/download` 的测试入口读取 `android-test` 清单。
- 标签 `release/android-test/v1.3.5-b3582074`；清单备份 `/opt/icao/backups/app-updates-20261024-guide/updates-before-20261024T030535653663Z.json`。旧测试制品 1.2.2 / 3580413 保留用于追溯。

### iOS

- 2026-10-24 11:12（北京时间）独立查询确认 1.3.5 / 3582074，Apple `VALID`、未过期，内部“测试”组 `IN_BETA_TESTING`。
- Build / Delivery ID `823b6159-927a-4c12-90ce-5450f055ce92`；标签 `release/ios-testflight/v1.3.5-b3582074`。
- 归档隐私与 SDK 校验通过（11 manifests、3 embedded code）；Apple 验证及上传没有错误。
- IPA SHA256 `b5cf5e8a7ea7c783100bc322e74374a24b7d4be1012a7c0c9d91b0e07fabf039`，文件 `.generated/testflight/export-3582074-20261024T024616Z/app.ipa`。
- `ios-testflight` 清单已发布并回读；备份 `updates-before-20261024T031225313479Z.json`，与安卓备份同目录。旧 1.2.2 / 3580413 构建保留。
- 外部状态 `READY_FOR_BETA_SUBMISSION`；没有提交外部测试审核或 App Store 正式审核。

最终公开清单独立回读：两个测试渠道均为 1.3.5 / 3582074；正式 iOS 1.2.1 / 3576434、正式 Android 1.2.1 / 3578875 与发布前逐字段一致。

## 证据

正式构建与脱敏证据保存在 `/Users/zhouyide/.codex/icao-guide-release-20261022/.generated/release-135/`，APK / IPA 保存在同一 clone 的 `.generated/releases/` 与 `.generated/testflight/`。专用临时验收账号已精确清理、残留校验通过，用户账号未改动。
