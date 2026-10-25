# 2026-10-26 协调集成交付：TestFlight 1.3.15 / 3584952

## 当前范围与授权

用户要求统一交付 TestFlight 3584951 之后的所有本轮改动。最初三项实现已通过 PR #266 进入 main；发现页权益、反馈和题目纠错已通过PR #269进入main；三本词书经PR #271整合，原生Node合同修复经PR #272合入；最终已完成同一候选的构建、上传和测试组开放。

用户于本轮明确授权配套 API 上线，并要求不等待因 GitHub Actions 账单/额度问题无法启动的云端检查。采用本机已通过的完整检查推进，本次例外不修改长期规则、不伪造云端检查通过。后续新增部署范围按最终变更和既有授权核对。

## 最终交付结果

- **发布源码**：干净`main`提交`8458f5eb2c97ad0457639adda1e7c3fc5b58ce03`，构建时HEAD等于origin/main。PR #266、#269、#271、#272覆盖3584951后本轮全部已确认改动；来源PR #263—#265、#267—#268、#270已被统一集成取代并关闭。
- **TestFlight**：1.3.15 / 3584952；Apple build ID `876e8b12-e4d8-4199-aac7-e051a50affb7`，`VALID`、`IN_BETA_TESTING`、未过期，现有1个内部测试组可访问。2026-10-25T20:21:05Z经Apple API独立核对。Tag：`release/ios-testflight/v1.3.15-b3584952`。
- **包校验**：Release Archive、签名、包身份、权限、生产运行时和隐私/SDK审计通过（11份privacy manifest、3个embedded code）；Apple验证/上传均无错误。IPA SHA256 `57dad04ae49b56bd649064add6c24d222bc4a3fef498b51ff4ceb3c866614434`，archive audit SHA256 `dfab0828181347f9c5d01b791e2b487dc230e3961f51e579086f5a6272ef800a`。
- **最终API**：`coordinated-20261026-8458f5eb`；image `sha256:7ef7188cdcf4e3ed3a659ddda98fd46ee1f68b2829e7f7ecfd7ada5b770704b1`。Readiness、认证拒绝探针和真实转写/语法/润色及临时音频清理通过，AI证据绑定该API版本。只读迁移计划55项已应用、pending=0、drift=0，未执行schema迁移，app content v31及原checksum保留。Tag：`release/api-production/20261026-8458f5eb`。
- **线上目录与权限**：旧v1目录360/372/106、旧v2另含409核心词、新v3目录379/744/710均返回200并支持ETag304；新增发音抽样经公网读取且大小/SHA一致。随身听目录听力1502、900句900、陆空5750、故事382、OPI2274，受限题组匿名403；新词书同步header的真实CORS预检204通过。
- **词书与资源**：三本1833词卡；保留1022旧ID、212合并迁移、13拆分旧项清理。新增1320录音（38022432字节）已上传并注册；9773旧资源逐条未变，总11093。原录音与新增交付包均另存，未删除旧资源。
- **后台**：`coord-20261026-8458f5eb`于2026-10-25T20:26:17Z部署；Ops API image `sha256:5c01d33bb4cf7b316655c156482215f2c9cfa068193aba448f55d524494d5383`，web image `sha256:61ec25bbbdaae1a898e2bfb55dbfaa92cc998c91fbaf402f46b9f58c59bf0ec9`。新鲜备份、隔离恢复、只读migration/staff readiness、公网TLS和普通API隔离均通过，无staff provisioning。Tag：`release/ops-production/20261026-8458f5eb`。
- **真实反馈核对**：已删题的历史反馈按v26提交快照显示完整题名，标明反馈时来源；旧附件公网200、662361字节、SHA一致，实际后台图片解码1320×2868。14条已批准回复均已发送（12 resolved、2 processing），没有重复发送。
- **更新提示**：仅`ios-testflight`清单更新为1.3.15/3584952，公网读回与目标一致；App Store、Android正式和Android测试3个条目逐字段保持原样。旧清单备份：`/opt/icao/backups/updates-testflight-20261026-3584952/updates-before-20261025T202910893915Z.json`。

### 证据、回滚与清理

- 本机发布目录为原项目`.generated/testflight-release-20261026/`；其中`.generated/delivery-evidence/`保存完整本地检查、Node22实证、API/后台部署、Apple状态、更新清单前后、公网资源及真实后台UI核对。`.generated/testflight/candidate.json`和对应Archive/IPA保留；关键能力证据由官方工具生成，未手写“通过”结果。
- 反馈完整执行与脱敏UI证据保留在原目录`.generated/feedback-review-20261026/`；录音完整备份`.generated/vocabulary-audio-preserved/`和差量包`outputs/vocabulary-three-books-2026-10-26/`保留。
- API回滚备份`/opt/icao/backups/api-coordinated-20261026-8458f5eb/`，上一健康API为`study-radio-20261026-49ef2bcd`；Ops回滚快照`/opt/icao/runtime/releases/ops-coord-20261026-8458f5eb/attempts/20261025T202439Z-3701195`，新鲜数据库备份`/opt/icao/backups/postgres/icao-20261025T202337Z-3763727.dump`。旧TestFlight3584951仍可作为测试渠道回退参考。
- 已清理本轮失败构建的退出容器/无标签层和后台web的无标签builder阶段，保留正式运行与回滚镜像、数据库备份及正式资产；清理后服务器磁盘可用约4.0GiB。
- 来源任务和已合并协调分支已删除。应用拒绝归档的primary checkout保留为干净检出，不绕过应用保护；随身听和课程的可归档工作区已移除。本记录分支在合入后按同样规则清理。

## 第一阶段历史

- PR #266：随身听完整目录与指定题优先加载；故事复诵排在OPI前；普通登录进入题库与新账号首次备考设置；高亮短线和连续画笔；体系课程手机版。
- 源码 `49ef2bcda061d9960ca22a5dc272d8bad6a29014`；与本机完整检查通过的集成树一致。前端238套/1659项、API68文件/693项通过；12651个媒体的大小与SHA-256校验通过。
- 第一阶段 API `study-radio-20261026-49ef2bcd` 已完成生产切换、readiness和权限核对。迁移计划55项已应用、pending=0、drift=0；该迁移核对为只读，没有执行迁移。现有内容v31摘要`9b54adce11b8ab626c8e213c82d5972e826f1be55593f063459b4b940b381d36`保留。
- 公网核对五题库目录均有radioEntries：听力1502、900句900、陆空通话5751、故事复诵382、OPI2274；受限题组匿名请求403。真实转写/语法/润色及临时测试数据清理通过，证据绑定该API版本。
- API tag `release/api-production/20261026-49ef2bcd`。服务器原镜像/配置/源码备份位于`/opt/icao/backups/api-study-radio-20261026-49ef2bcd/`。

## 第二阶段历史：组合检查

- 已整合发现页权益PR #267和反馈/题目修订PR #268。组合完整 `pnpm check` 通过：前端240套/1679项、API70文件/704项；StoreKit19套/189项，类型、内容、权限、音频、发布配置及合同检查通过。后台类型与生产构建通过，lint无错误（45项警告）。
- 删题后的题库总卡10899、文字卡10812、图片卡87；陆空5750，原免费首题组17卡，所有公共题共983卡。保留精确数量和权限断言，只按用户确认的一题删除更新预期。
- 同步旧409核心词书的语料hash与频次派生；ASR审计仅roger/Zhengzhou计数各减1，225个热词、权重及900句训练文本不变。修复两个热点用例的公开概览fixture与会员路由，并修正测试重渲染类型参数；不将旧测试假设当成产品新需求。
- 在该阶段新增代码尚未部署；正式内容调整与14条获批回复已由反馈任务在代码进入main后执行并逐条核验：陆空v26→v27，checksum d316416c4ff9bcd49db79c725510809ac7ea50550cd2ace884f1f75062687227；仅一删两字段修订，其他四库与学习表不变，历史快照保留。14条回复全部发送，12条resolved、2条processing，clientReplyId固定以防重复。证据位于原目录.generated/feedback-review-20261026/。当时三本词书仍在执行，因此未上传中间TestFlight；最终结果见上。

## 最终词书与组合检查

- 词书来源提交578b3b05（PR #270）；三本1833条：preview379、icao4 744、icao5 710。保留1022个旧ID，212条重复迁移到目标，13个拆分旧条目清理；客户端与服务端共用迁移，旧v1/v2目录与同步响应保留兼容。
- 新目录three-books-v3；真实累计频次、分档标签、固定轮次乱序、旧记录/收藏/测试引用迁移已覆盖。原9773录音不变，新增1320条、38022432字节，最终清单11093；交付包原目录outputs/vocabulary-three-books-2026-10-26/，完整资源另存.generated/vocabulary-audio-preserved/。manifest SHA256 0b360ee35f8143ed9d0e513314b9b356fc0a63f325b5405bb1675c17a0ebd295，目录SHA256 5dcbb7b33f1e40d34a0be891dec3c9ad4264e4e2a64be716f8949afb8a704d12。
- 最终整合完整pnpm check通过：前端244套/1696项、API71文件/710项；类型、内容、音频、发布配置、合同检查通过，后台生产构建通过。旧Web缓存测试改为当前共用API协议和离线缓存回退，未恢复退役静态加载所有者。
- 资源上传包SHA256 74192b9316d9ea8212a6b19f5542b97994ef08264b517f9599a383a64d6bbfc3；当时资源上传/生产部署/TestFlight待执行；最终实际交付已在上文逐项核对。

## 生产构建前模块路径修复

- 主干d66ca3ff的资源差量已发布：新增1320条、旧9773条逐条保持一致，总11093；服务器核对备份/opt/icao/backups/vocabulary-20261026-d66ca3ff/，发布前资源JSON摘要205dbee71382f3fed6d1a5fac90877fde32182949a5c87b65a63ab37df7a89a0。
- 该提交API镜像在切换前被原生Node运行时检查拦截：共享合同新模块使用无扩展名TS导入，Node ESM无法解析。该次失败未切换生产API，当时线上仍为study-radio-20261026-49ef2bcd；未执行数据库schema迁移。
- 根因修复：共享合同显式.ts导入；合同/API编译将相对导入扩展名改写为.js，前端和后台无输出类型检查允许.ts导入；现有8项plain Node合同运行时检查加入contracts check。
- 修复在生产同版本Node22.23.2的临时目录通过8/8运行时检查，未修改运行中API源码。修复后的完整pnpm check再次通过（前端244套/1696项，API71文件/710项），后台生产构建通过；内容和录音文件不变。随后以修复后主干8458f5eb重新构建，完成API/后台和同一TestFlight候选交付。

## 用户验收与其他渠道

代码检查和候选交付已完成；用户尚未在手机本体确认本候选的实际效果。后续在TestFlight3584952验收随身听、首次备考设置、登录落点、画笔、课程、会员入口、词书学习/迁移/发音及录音/AI流程；不将自动化和后台浏览器核对写成真机验收通过。

本轮按用户指定目标交付TestFlight及必要配套API、资源和后台。未提交App Store审核，未构建Android新包或部署产品Web；其他渠道保留原交付与待验状态。

本文件是本轮唯一协调发布记录，不构成长期规则。
