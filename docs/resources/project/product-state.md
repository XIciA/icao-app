# 项目管理概览与产品状态

核对日期：2026-10-21（北京时间）

本页汇总管理所需的产品状态、交付和待验事项。依据是仓库实现与已保存的发布证据，
本次整理未连接生产环境重新验收；“已发布”均指对应记录中的结果。

## 产品与运行链路

听你五个（Read You 5）面向 ICAO 英语学习与训练，覆盖题库学习、音频训练、录音与转写、
AI 反馈、学习记录、热点与资源浏览。iOS、Android 和产品 Web 使用同仓 React Native、Expo、TypeScript。

| 产品 / 站点 | 定位与实现 |
| --- | --- |
| iOS / Android | 正式包分别为 `com.readyoufife.ios`、`com.readyoufife.app`；账号、学习同步和联网能力连接 ECS API 与 Supabase |
| `readyoufife.com` | EdgeOne 产品 Web，复用正式账号、API、题库与学习同步；浏览器录音原件留在本机 |
| `feizhuicao.com` | 香港 Nginx 静态宣传站，页面来源为 `public/promo/`，不提供旧邀请码题库服务 |
| 旧 Vercel 体验站 | 10 月 20 日迁移记录确认退役；仓库保留 `vercel-legacy` 兼容实现与冻结校验，不代表仍对外服务 |

域名、运行时选择与服务边界统一见[运行时拓扑](runtime-topology.md)，不在本页重复维护部署细节。

## 最近交付与验收

版本按渠道分别记录，不用某一个展示版本推断所有平台的实际安装包或服务版本。

| 渠道 / 服务 | 最近有证据的交付 | 验收边界 / 证据 |
| --- | --- | --- |
| Android 正式版 | 1.2.1 / 3578875，10 月 21 日 APK 与正式更新清单已发布 | 包身份、签名、公开文件摘要及升级条件校验通过；真机下载、权限往返、系统安装和数据保留仍待用户验收。[记录](../../records/releases/20261021-app-updates-1.2.1.md) |
| App Store | 1.2.1 / 3576434，10 月 21 日记录确认已上架，并补齐正式更新清单 | 本轮未重编译 iOS；上架与功能真机验收分别判断。[记录](../../records/releases/20261021-app-updates-1.2.1.md) |
| iOS TestFlight | 1.2.1 / 3576434，10 月 20 日记录为 VALID、内部测试组可用 | 10 月 21 日未改该渠道；1.2.1 当前构建的真机效果不能由旧版结果替代。[记录](../../records/releases/20261020-startup-b-1.2.1.md) |
| EdgeOne 产品 Web | 10 月 20 日启动优化已发布，deployment `dpgp9zsw76jf` | 导出与公网资源校验见[启动发布记录](../../records/releases/20261020-startup-b-1.2.1.md)；10 月 21 日下载入口随公开清单更新，未重新部署网页 |
| 宣传站 | 10 月 20 日迁至香港，旧 Vercel 站退役 | 静态资源摘要、跳转与浏览器交互已核验。[迁移记录](../../records/releases/20261020-feizhuicao-hong-kong-promo.md) |
| API / 内容运营后台 | 10 月 17 日功能更新记录包含正式迁移、API 与后台交付、OPI 审核发布 | 是该任务的已保存证据，不据此推断此后服务器一直未变。[执行记录](../../workstreams/feature-update-2026-10/execution.md) |

## 当前关注与下一步

- **交付待验**：优先补 Android 1.2.1 真机升级闭环，以及当前 1.2.1 构建启动衔接的设备体验；确认结果后回填对应交付记录。
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
