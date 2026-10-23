# 项目管理概览与产品状态

核对日期：2026-10-23（北京时间）

本页汇总管理所需的产品状态、交付和待验事项。依据是仓库实现与已保存的发布证据，
移动端与网站条目沿用已有发布证据，后台与监控条目基于 10 月 22 日的生产检查；
“已发布”均指对应记录中的结果。

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
| App Store | 1.2.1 / 3576434，10 月 21 日记录确认已上架，并补齐正式更新清单 | 本轮未提交正式审核或更新正式清单；上架与功能真机验收分别判断。[记录](../../records/releases/20261021-app-updates-1.2.1.md) |
| Android 测试版 | 1.2.2 / 3580413，10 月 23 日独立测试包与官网测试入口已发布 | 正式签名、四架构、公开摘要及最终模拟器覆盖保留数据验收通过；人民币现价/划线原价正常。真机及真实支付待用户验收。[记录](../../records/releases/20261023-integrated-test-1.2.2.md) |
| iOS TestFlight | 1.2.2 / 3580413，10 月 23 日 Apple VALID，现有内部“测试”组 IN_BETA_TESTING | 正确签名 Release 模拟器操作、边缘返回保存及美元实价展示已验；未提交正式审核，真机及真实支付待用户验收。[记录](../../records/releases/20261023-integrated-test-1.2.2.md) |
| EdgeOne 产品 Web | 10 月 23 日整合发布，源码 `7b133eac`，deployment `dplyqwfahu2y` | 公网脚本摘要、登录保留、记录跨端同步、深链接刷新、浏览器前后退和窄屏布局实际验证通过；用户效果待验。[记录](../../records/releases/20261023-integrated-test-1.2.2.md) |
| 宣传站 | 10 月 20 日迁至香港，旧 Vercel 站退役 | 静态资源摘要、跳转与浏览器交互已核验。[迁移记录](../../records/releases/20261020-feizhuicao-hong-kong-promo.md) |
| ECS API | 10 月 22 日 `guide-20261022-41fd90d4`，账号接口提供业务注册时间 | 健康、临时账号及真实 AI 验证通过，无迁移，内容版本保持 31。[记录](../../records/releases/20261022-unified-guide-1.2.4.md)。同步观察见[稳定性记录](../../records/20261021-server-stability.md) |
| 基础监控 | 10 月 22 日部署 `74d1d5d4`，五分钟采集 CPU、内存、磁盘及服务状态，余额缓存读取正常 | 自动定时运行验证通过，告警仅留服务器；部署后磁盘可用约 14 GiB，未删除回滚与备份。[记录](../../records/20261022-stability-dashboard.md) |
| 内容运营后台 | 10 月 22 日部署 `ops-stability-20261022-b83fef3a`，新增四类稳定性图表 | 真实登录、数据、权限隔离和桌面/手机布局验证通过；备份与隔离恢复通过，用户效果待验。[发布记录](../../records/20261022-stability-dashboard.md)；既有内容运营交付见[执行记录](../../workstreams/feature-update-2026-10/execution.md) |

## 当前关注与下一步

- **本轮统一交付**：完整批次已以 1.2.2 / 3580413 交付 TestFlight 和安卓测试渠道，EdgeOne 网页同步上线。图标回退、账号重试、引导、边缘返回及视觉修复已整合；人民币原价/现价和美元实价已实际验证。下一步由用户在最终真机验收，真实付款和需新授权的录音未计为通过。[发布与验收记录](../../records/releases/20261023-integrated-test-1.2.2.md)

- **服务器稳定性**：线上后台已提供体验、容量、费用、事件与恢复图表；基础监控只在服务器保留告警。真实并发、完整客户端耗时、服务器到期日及套餐余量仍未接入，容量上限尚未经压测确认。继续观察同步历史队列恢复。[本轮证据](../../records/20261022-stability-dashboard.md)
- **交付待验**：优先在 iOS/Android 1.2.2 测试候选上确认真机启动、升级保留数据、权限往返与真实支付；模拟器结果不能替代这些能力。正式 1.2.1 历史未验项保留在原记录。
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
