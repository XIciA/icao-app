# 2026-10-24 学习、教程与全局交互修复 1.3.6

状态：产品 Web 已上线；TestFlight 和 Android 独立测试渠道可用。代码检查、渠道交付已完成，实际体验由用户验收；按要求未使用模拟器。

## 来源与修复范围

- PR [#237](https://github.com/XIciA/icao-app/pull/237)，源码 `8c6a30f6688cade451ce3fa9eb64a6b302bea2e7`；三端从干净 main 等于 origin/main 的独立发布 clone 构建。版本 1.3.6，iOS build / Android versionCode 3582990。
- 完整逐项清单与验收不变量见[任务记录](../../workstreams/learning-ui-repair-20261024/README.md)，R01—R15 全部交付；用户批准的工程维护要求已加入文档唯一入口。
- 笔记保存和明确完成分离，输入、口述、失焦不误推进教程。AI 沿用原录音、授权、转写、请求与恢复链路，失败/忙碌有明确反馈，可暂不评分继续教学，跳过状态不冒充完成。
- 共享弹层保留关闭动画期间的实例，关闭后停止交互；Web 回调身份改变不再重启可见生命周期。教程目标跟随不反复清空遮罩，知道了有明确按钮。删除备考设置、题库选择教程，指南进入真实 LT 首题，自然进入保留当前题。
- 单词常规保存使用局部反馈，阻止重复保存/切词竞态；收藏不插入改变弹层高度的内容；PDF 生成持续显示忙碌并避免重复提交。
- 全局当前二级页固定标题及返回区域，列表独立滚动；卡片顶边不再被白边覆盖，保留完整轮廓和轻阴影。结束页两项数值字体统一，答题卡统计/图例及教程正文提升至共享 14 号规格。
- 听力和故事复述标题依当前完整顺序自然编号。原有重排保持，稳定 ID、音频、答案和用户关联不变；非编号描述标题保留。没有修改内容数据、数据库、用户记录或同步协议。
- 结束页答题卡展示原完整学习范围；从中进入新题并返回后重新读取累计状态，本次记录仍只含实际访问题。模考、历史只读和检查点退出继续使用原业务流程。

## 代码与发布检查

- 最终 [CI 40064269823](https://github.com/XIciA/icao-app/actions/runs/40064269823)通过；前端 222 组 / 1502 项，API 67 文件 / 682 项，TypeScript 通过，ESLint 0 错误 / 19 个既有警告；内容源身份不变量、合同、数据库 authority 检查和 EdgeOne 导出通过。
- 新增及更新回归覆盖完整答题卡跳题/学习/返回刷新、初始题定位、模考返回、笔记输入/口述失焦与明确完成、弹层关闭途中重开、教程评分失败跳过和真实源题库逐项身份/资源不变量。
- 本机 pnpm check 因既有历史音频源缺失未通过完整媒体扫描；不得将 check:ci 写作完整媒体校验通过。本轮没有修改权威题库、资源清单或任何媒体路径，也没有发布内容、API、数据库。
- iOS 关键能力门禁使用 2026-10-24 10:28（北京时间）真实 AI-live 合同证据，验证器指纹和线上 API 版本相同且在 24 小时内；不是本候选真机录音或 AI 全流程验收。API 仍为 `guide-20261022-41fd90d4`。

## EdgeOne 产品 Web

- [readyoufife.com](https://readyoufife.com)，deployment `dp3w4tprilkb`，181 文件 / 35.9 MiB。
- 公网 JS `/_expo/static/js/web/index-ec71a4b6d6005a1c0340ecbecba6db76.js`，7,596,669 字节，SHA256 `58f0bb2ca17d5985ad7c4db13253734abf296417166090dd4d37a309494cf7b0`，与本地产物完全一致。
- 首页、`/download`、`/info/guide`、`/question-bank/sentences900` 返回 200；仅证明交付和深链可用，不代表浏览器操作体验通过。
- annotated tag `release/web-edgeone/20261024-8c6a30f6`；回滚目标 deployment `dpyl06vt0l2g`，旧候选记录见[1.3.5](20261024-guest-guide-1.3.5.md)。

## iOS TestFlight

- Bundle ID `com.readyoufife.ios`，1.3.6 / 3582990；Apple Build ID `7cd48e1b-9fdd-4fd1-b782-921f25b5428c`。独立查询 Apple `VALID`、未过期，现有内部“测试”组 `IN_BETA_TESTING`。
- 归档、签名、权限/隐私、生产运行时、Apple 校验和上传通过。IPA SHA256 `e255e6607497c075777246cec871e62b6390d313ef7cd333c7ca36d8d69870b6`。
- IPA `.generated/testflight/export-3582990-20261024T050722Z/app.ipa`；tag `release/ios-testflight/v1.3.6-b3582990`。旧 1.3.5 / 3582074 构建保留，可在既有内部组选择旧版本；未提交 App Store 或外部测试审核。
- `ios-testflight` 更新清单已发布并回读；备份 `/opt/icao/backups/app-updates-20261024-learning-ui/updates-before-20261024T052115020442Z.json`。

## Android 测试版

- 独立包 `com.readyoufife.app.test`，1.3.6 / 3582990；Release 正式签名、v2 校验通过，证书与旧测试版相同：`25d4fe5523417289da5fe0bf970593b98fe4ea658883edeb5792906e31456629`。正式包不被覆盖。
- APK 135,589,525 字节；SHA256 `225e404b1b596abed509f161ce91ea7958db2fa176ee14442d89c18c3483c424`，服务器发布前验证与本机独立公网完整下载均一致。
- [测试 APK](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-android-test-1.3.6-b3582990.apk)；[官网下载页](https://readyoufife.com/download)既有测试入口读取 `android-test`，已更新为 1.3.6 / 3582990。
- tag `release/android-test/v1.3.6-b3582990`；旧 1.3.5 APK 和清单备份保留，清单备份 `updates-before-20261024T053114076243Z.json`，目录见下文。Android 系统不支持低 versionCode 直接覆盖降级，不能承诺旧 APK 可直接降级且保留本地数据；有问题时按既有签名递增 build 交付修复。

用户点击操作见 [24 项验收清单](../../workstreams/learning-ui-repair-20261024/acceptance-checklist.md)，每端独立勾选。

## 发布边界、证据与回滚

- 两个测试渠道公开清单独立回读均为 1.3.6 / 3582990；正式 iOS 1.2.1 / 3576434、正式 Android 1.2.1 / 3578875 所有字段与发布前一致。Vercel、宣传站、API 和数据库未部署，用户原目录的无关修改未动。
- 清单更新使用既有单渠道 publisher；前序清单在 `/opt/icao/backups/app-updates-20261024-learning-ui/`。需要回退广告指针时，从备份提取相关测试渠道，核对旧制品仍可用，复用单渠道工具恢复；禁止整份旧清单覆盖他人新渠道。
- 脱敏证据位于 `/Users/zhouyide/.codex/icao-guide-release-20261022/.generated/release-136/`：`web-deploy.json`、`web-verification.json`、`testflight-availability.json`、`android-signature-verification.json`、`channels-verification.json` 和最终 CI 日志。APK、IPA、归档及签名报告在该 clone 的现有 `.generated/releases/`、`.generated/testflight/` 中保留。
- **代码检查通过、候选已交付；用户真机及浏览器体验待验。** 尤其动画流畅度、连续触控、键盘/口述、真实评分失败恢复和历史用户体验不能用构建或 HTTP 200 代替。

发布传输说明：远端 Android publisher 完成并退出后，本机 SSH 输出流未正常关闭。已独立核对公开清单、APK 完整摘要和准确备份文件，仅终止本任务遗留的本机 SSH 进程，没有重建或重复发布。
