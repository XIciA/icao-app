# 项目管理概览与产品状态

核对日期：2026-10-25（北京时间）

本页汇总管理所需的产品状态、交付和待验事项。依据是仓库实现与已保存的发布证据，
移动端与网站条目沿用已有发布证据，后台与监控条目基于 10 月 22 日的生产检查，API 与 TestFlight 已按 10 月 25 日实测更新；
“已发布”均指对应记录中的结果。

## 产品与运行链路

听你五个（Read You 5）面向 ICAO 英语学习与训练，覆盖题库学习、音频训练、录音与转写、
AI 反馈、学习记录、热点与资源浏览。iOS、Android 和产品 Web 使用同仓 React Native、Expo、TypeScript。

| 产品 / 站点 | 定位与实现 |
| --- | --- |
| iOS / Android | 正式包分别为 `com.readyoufife.ios`、`com.readyoufife.app`；账号、学习同步和联网能力连接 ECS API 与 Supabase |
| `readyoufife.com` | EdgeOne 产品 Web，复用正式账号、API、题库与学习同步；浏览器录音原件留在本机 |
| `feizhuicao.com` | 香港 Nginx 静态宣传站，页面来源为 `public/promo/`，不提供旧邀请码题库服务 |
| 旧 Vercel 体验站 | 10 月 20 日迁移记录确认退役；10 月 24 日已撤销冻结规则与门禁，残留兼容源码不构成交付端 |

域名、运行时选择与服务边界统一见[运行时拓扑](runtime-topology.md)，不在本页重复维护部署细节。

## 最近交付与验收

版本按渠道分别记录，不用某一个展示版本推断所有平台的实际安装包或服务版本。

| 渠道 / 服务 | 最近有证据的交付 | 验收边界 / 证据 |
| --- | --- | --- |
| Android 正式版 | 1.2.1 / 3578875，10 月 21 日 APK 与正式更新清单已发布 | 包身份、签名、公开文件摘要及升级条件校验通过；真机下载、权限往返、系统安装和数据保留仍待用户验收。[记录](../../records/releases/20261021-app-updates-1.2.1.md) |
| App Store | 1.2.1 / 3576434，10 月 21 日记录确认已上架，并补齐正式更新清单 | 本轮未提交正式审核或更新正式清单；上架与功能真机验收分别判断。[记录](../../records/releases/20261021-app-updates-1.2.1.md) |
| Android 测试版 | 1.3.11 / 3583788，10 月 25 日独立测试包及官网测试入口已更新 | 新增 409 条全题库核心词书；签名、包身份及公网完整下载摘要通过，实际体验待用户验收。[记录](../../records/releases/20261025-question-bank-core-vocabulary-1.3.11.md) |
| iOS TestFlight | 1.3.12 / 3584843，10 月 25 日 Apple VALID，内部“测试”组 IN_BETA_TESTING | 综合修复与词书紧凑UI统一交付；签名、生产运行时、上传及测试组访问通过，实际体验待验，未提交正式审核。[记录](../../records/releases/20261025-combined-repair-vocabulary-ui-1.3.12.md) |
| EdgeOne 产品 Web | readyoufife.com 已上线，源码 `63d2103e`，deployment `dp28f0mity9r` | 综合修复和词书UI同步交付；根路由、下载页和公网脚本摘要核对通过，实际体验待验。[记录](../../records/releases/20261025-combined-repair-vocabulary-ui-1.3.12.md) |
| 宣传站 | 10 月 20 日迁至香港，旧 Vercel 站退役 | 静态资源摘要、跳转与浏览器交互已核验。[迁移记录](../../records/releases/20261020-feizhuicao-hong-kong-promo.md) |
| ECS API | 10 月 25 日 `vocabulary-20261025-83f6fb8f`，新增词书目录与 506 份发音资源已发布 | 用户单独明确授权；新目录、原三本保留、发音资源及真实 AI 检查通过，无结构迁移或题库重发。[记录](../../records/releases/20261025-question-bank-core-vocabulary-1.3.11.md) |
| 基础监控 | 10 月 22 日部署 `74d1d5d4`，五分钟采集 CPU、内存、磁盘及服务状态，余额缓存读取正常 | 自动定时运行验证通过，告警仅留服务器；部署后磁盘可用约 14 GiB，未删除回滚与备份。[记录](../../records/20261022-stability-dashboard.md) |
| 内容运营后台 | 10 月 22 日部署 `ops-stability-20261022-b83fef3a`，新增四类稳定性图表 | 真实登录、数据、权限隔离和桌面/手机布局验证通过；备份与隔离恢复通过，用户效果待验。[发布记录](../../records/20261022-stability-dashboard.md)；既有内容运营交付见[执行记录](../../workstreams/feature-update-2026-10/execution.md) |

## 当前关注与下一步

- **1.3.12 综合修复与单词UI（10 月 25 日）**：登录回我的、会员状态同步、统一图标/加载、教学遮罩与PDF、随身听状态及紧凑词书UI已统一进入main（63d2103e，PR #253—#255）。前端1609项、API688项及最终CI通过；iOS TestFlight和Web已交付，Android测试交付继续处理中。单词与指南联动134项通过，真机流畅度、微信登录往返、购买后刷新及OPI按钮状态待验。[统一记录](../../records/releases/20261025-combined-repair-vocabulary-ui-1.3.12.md)

- **409 条全题库核心词书已交付（10 月 25 日）**：含航空释义、例句、译文、固定发音及大致频率区间，复用现有学习流程，原三本 838 条及原有发音保持不变。用户明确授权后，API、音频、Web 及 iOS / Android 1.3.11 / 3583788 测试渠道均已交付，无数据库结构迁移；新词书学习及发音体验待用户验收。[交付记录](../../records/releases/20261025-question-bank-core-vocabulary-1.3.11.md)

- **上一轮 1.3.10 TestFlight 整合交付（10 月 25 日）**：指南与测试重置、我的页分项进度及备考设置、分类图标、五题库随身听，以及新登录/游客免费学习和会员引导已统一进入 `main`（`34f0c4ed`，PR #248）。1,586 项前端、688 项 API 及最终 CI 通过；12,651 份媒体的大小和 SHA-256 已校验。1.3.10 / 3583787 已完成 Apple VALID，并向内部“测试”组开放；所需生产 API 经用户单独明确授权后已部署，免费题目/音频、权限隔离及真实 AI 检查通过，无数据库迁移或题库重发。只更新 iOS 测试渠道，真机体验待用户验收。[整合与发布记录](../../records/releases/20261025-testflight-integration.md)

- **上一轮统一交付**：学习/指南修复、记错反馈、听力编号及目录、单按钮PDF加载、范围菜单和全局动画生命周期修复统一随 1.3.7 / 3583088 交付两个移动测试渠道及 readyoufife.com。当时的代码检查与交付已完成，完整媒体缺失保留为历史例外；本轮已从现有备份恢复并校验媒体。三端实际体验待用户验收。[发布记录](../../records/releases/20261024-learning-followup-1.3.7.md)

- **服务器稳定性**：线上后台已提供体验、容量、费用、事件与恢复图表；基础监控只在服务器保留告警。真实并发、完整客户端耗时、服务器到期日及套餐余量仍未接入，容量上限尚未经压测确认。继续观察同步历史队列恢复。[本轮证据](../../records/20261022-stability-dashboard.md)
- **交付待验**：用户在最新 iOS 1.3.12 / Android 测试候选及当前 readyoufife.com 验收学习/收藏、教程切换与失败恢复、笔记、答题卡往返、显示编号、固定导航及录音/AI完整流程；本轮代码检查不等同实际体验通过。还需验收新词书选书、频率标签及词条 / 例句发音；iOS 还需验收新版游客学习、登录交接、会员引导与五题库随身听。正式 1.2.1 历史未验项保留在原记录。
- **缺陷排查**：非音频修复与本地回归已完成，不再标为“修复待启动”；剩余跨端 / 真机风险以[任务首页](../../workstreams/app-bug-audit/README.md)和[完成记录](../../workstreams/app-bug-audit/completion-2026-10-17.md)为准。该任务本身没有发布候选包。
- **内容运营**：10 月功能更新的四张 OPI 样例工单已完成批准后的发布，未决三项按当时用户确认排除；不再把首轮“待审核”当作最终状态。[最终结果](../../workstreams/feature-update-2026-10/execution.md)
- **旧任务收口**：1.0.0 任务仍保存旧材料与未填写的收口文件，不再用于描述当前上架版本；保留路径以兼容发布材料校验。[任务索引](../../workstreams/README.md)

以上是待核对事项，不代表新任务已经启动或获得外部操作授权。

## 实现事实与日常维护入口

- App 展示版本：[app-version.ts](../../../src/config/app-version.ts)；安装包版本、构建号和渠道以对应发布证据为准。
- 页面与业务：`app/`、`src/`；API 与合同：`services/api/`、`packages/contracts/`。
- Web 模式：[web-runtime.ts](../../../src/config/web-runtime.ts)；站点关系见[运行时拓扑](runtime-topology.md)。
- 商业能力：仓库已有 [iOS StoreKit 客户端](../../../src/features/native-commercial-testflight/react-native-iap-storekit-client.native.ts)与服务端合同，旧“未接 StoreKit、只有占位接口”描述已失效；源码存在不等于真实支付或全部渠道已验收，具体启用状态需按构建、运行配置和交付证据核对。
- 任务与进度：[任务索引](../../workstreams/README.md)；常用能力与副作用：[工具清单](../../tools/README.md)；具体命令：[命令参考](../developer/development-command-reference.md)。
- 长期约束仍只从[项目文档入口](../../README.md)进入，本页不新增规则。

维护时可直接更新受影响的一行并链接证据：任务结束核对状态，交付后核对渠道与待验项；
历史过程留在原记录，避免在概览中累积流水日志。
