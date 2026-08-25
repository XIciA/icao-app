# 商店材料证据、负责人最小事实与最终门禁

状态：2026-08-26 核对；隐私自助能力已进入主线，五个正式公开页面已从干净主线发布；生产 API/Ops、
中国大陆合规、Support URL 联系信息、Apple 付费商务、审核账号、最终候选包和截图门禁未全部通过，
不可提交；本文件记录已完成的平台字段写入，但不保存任何凭据、验证码或受保护联系人值，也不把字段
保存等同于审核提交或商店发布。

本文件不定义 App Store 字段值。所有平台录入值只取自
[`app-store-connect-final-fields.md`](app-store-connect-final-fields.md)。

## 五个正式 URL

2026-08-26 已从干净 `origin/main` `6132b9f84b18394442b83cb5d4f74545a65b3290` 正式发布
`official-site`，部署记录 ID 为 `6a8dd41946b978dfeef18fae`；Vercel 未修改、未构建、未部署。随后从
当前工作环境直接请求以下公开 HTTPS 页面，均返回 HTTP 200，且线上响应 SHA256 与仓库对应 HTML
逐一一致：

| 用途 | 正式 URL | 当前页面事实 |
| --- | --- | --- |
| Support URL | `https://yunqihangke.com/apps/readyoufife/support/` | SHA256 `4f903331ba3f1952096a8bd93f115eb463e04133ca11946d6fe82d68bc201aec`；当前页面列出支持邮箱，但仍缺经核实的真实公司注册地址和公开支持电话 |
| Privacy Policy URL | `https://yunqihangke.com/apps/readyoufife/privacy/` | SHA256 `52c65eb8f841a638116f4addc37061195d22a9a967bfddf8c1fd07374579678d`；包含16+、腾讯云语音识别、DeepSeek、非自动续期、无微信和隐私自助权利 |
| Privacy Choices URL | `https://yunqihangke.com/apps/readyoufife/privacy-choices/` | SHA256 `12cee18b3cd9d92ddef693a9f7835f7ecc294cf5086b29ea4804ce78790f646b`；包含自助导出、清除、AI 结果删除和撤回同意路径 |
| 账号删除说明 | `https://yunqihangke.com/apps/readyoufife/account-deletion/` | SHA256 `7614a7db069975b9266ae6db7afb9555a2eb5c2d5eeaf0d51422ba95c3481e87`；真实路径为“我的”—“设置”—“账号安全”—“注销账号” |
| 用户协议 | `https://yunqihangke.com/apps/readyoufife/terms/` | SHA256 `9cc3e322a30efbd73507599f90e1a36c2df4fff96993be753b0b115c7a934e34`；明确只覆盖 iOS、Android 正式 App，包含16+和五档非自动续期口径 |

此次检查只证明当前网络位置可访问且正文与主线源码逐字节一致，不证明 Apple 审核所在网络、邮箱投递
链路或公开支持电话可用，也不证明注册地址真实。下方 Support URL P1 门禁完成前不可提交；最终候选
包形成后仍须反向核对页面、App 和生产数据流。

## 源码与配置反向核对

| 申报口径 | 当前仓库证据 | 结论 |
| --- | --- | --- |
| 1.0.0、名称与包身份 | `app.json` 为“听你五个”、`1.0.0`、`com.readyoufife.ios`；`src/config/app-version.ts` 为 `1.0.0` | 已对齐 |
| 可用地区与价格基准 | D4 要求其他国家或地区由 Apple 按中国大陆基准价自动生成当地价格，D9 未冻结仅大陆发行 | App 与五档 IAP 使用当前全部可用 App Store 国家或地区；中国大陆只作为 Base Country or Region，备案仍为工具 |
| 无微信运行时 | `tools/check-wechat-runtime-freeze.mjs` 检查依赖、插件、登录/账号/API 运行时标记；生产配置无 Associated Domains；iOS 归档脚本另扫 SDK、类名、资源和网络标记 | 当前源码检查通过；最终归档仍须复核 |
| 无体系课程/学习报告宣传 | `src/features/content/native-release-surface.ts` 在正式 App 隐藏 `courses` 与 `ai-report`，`src/app/content/[slug].tsx` 对直接路由重定向 | 正式入口和直接路由被阻断；遗留实现文件保留但不是 1.0.0 可达能力 |
| Vercel 冻结 | Vercel legacy 法律与课程实现继续由运行时边界隔离，本轮只允许更新正式 App 使用的 `official-site` 页面 | 不修改、不构建、不部署 Vercel；最终归档不得引用其课程或旧法律口径 |
| 16+ | `src/features/auth/login-release-surface.ts` 的正式 App 登录勾选为已满16周岁；`src/features/info/legal-release-surface.ts` 使用同一口径 | 已对齐；Vercel legacy 文案是隔离分支，不属于正式 App |
| 腾讯云 ASR + DeepSeek | API 配置把 `AI_TEXT_PROVIDER` 固定为 `deepseek`，生产预检要求 DeepSeek 与腾讯云 ASR；正式法律文案相同 | 已对齐；生产密钥和供应商设置仍由最终配置证明 |
| 五档非自动续期 | Native 商品映射和服务端目录固定 7/15/31/62/93 天；StoreKit provider 拒绝非 `non-renewing-subscription` 类型；会员页明确不会自动续期 | 已对齐；平台商品尚待创建 |
| 不收集 Device ID | PR #38 / `c9bea40` 已移除内容访问链路中的稳定设备 UUID、`did`、`deviceDigest` 和设备级限流；v1 设备绑定缓存与凭据有升级清理和失败重试 | 当前源码与隐私标签“不选择 Device ID”一致；最终归档仍须扫描第三方 SDK 与生产网络数据流 |
| 隐私自助权利 | PR #43 / `8434bae` 已实现导出账号与学习数据、删除单条/全部 AI 结果、清除学习数据和撤回 AI 同意；破坏性操作具备持久幂等与跨设备删除传播 | Native/API 源码和已上线的五个 `official-site` 页面已对齐；生产 API 仍待部署 |
| 注销审核路径 | `ProfileHomeScreen` 的“我的”页进入“设置”，`AccountScreen` 的设置页进入“账号安全”，再进入“注销账号” | 中英文审核备注均使用真实路径“我的→设置→账号安全→注销账号”；不存在审核专用路径 |
| 独立运营后台 | PR #37 / `8861683` 已建立 Ops Web/API；PR #45 / `6132b9f` 增加从干净主线部署、TLS/健康/管理员门禁、可重试回滚和证据链 | 代码与聚焦安全审计已完成；尚未执行生产迁移、初始化实际管理员或部署 `ops.readyoufife.com` |
| 迁移演练 | PR #39—#44 已建立并加固备份、隔离恢复、迁移与清理链；成功证据见下一节 | 演练成功不等于生产迁移已执行；生产 schema/API 仍待部署 |
| 自动发布 | D9 已冻结 `Automatically release this version`；Apple 将其定义为 App Store Connect 的版本级选项 | 2026-08-26 平台只读核验已选中；最终提交前仍须复核没有被改动 |

## Apple 平台当前状态

2026-08-25 已使用 Account Holder 会话写入下表列明的已确认字段，并以页面回显或 API 请求复核；
个人邮箱、电话、地址、API 私钥和其他受保护值不进入本文件：

| 平台项 | 当前真实状态 | 收口要求 |
| --- | --- | --- |
| App 记录 | Apple ID `6800583111`；Bundle ID `com.readyoufife.ios` | 保持现有记录，不新建重复 App |
| 商店版本 | iOS `1.0.0`，状态“准备提交” | 已与冻结版本一致 |
| TestFlight | 最新已验证 Build `3493759`，短版本 `1.0.0`，最低 iOS 15.1，2026-08-23 上传 | 该 Build 早于后续主线收口且版本页未选择；必须从最终 `origin/main` 上传更高 Build |
| 版本页内容 | 宣传文本、描述、关键词、Support URL、Copyright 和受保护审核联系人已保存；截图 0/10，审核账号、Notes 和 Build 仍为空 | 用最终候选生成 6 张产品页截图和 5 张 IAP 审核截图，再录入两个生产审核账号与最终 Notes |
| 发布方式 | `Automatically release this version` 已选 | 最终提交前复核仍选中且没有最早发布日期 |
| App 信息 | 副标题、教育主分类、工具次分类、Content Rights 和 16+ 覆盖分级已保存；ICP 尚未录入 | 只从正式备案材料录入准确备案号 |
| 价格与供应 | App 免费，中国大陆为基础地区，175 个国家或地区发布时供应；Mac、Vision Pro 与校园批量购买已关闭 | 最终提交前复核；五档 IAP 另按同一地区范围配置 |
| Server Notifications | Production 与 Sandbox URL 均未设置 | 生产 API 部署并通过 V2 测试通知后录入同一正式 HTTPS 入口 |
| App 内购买 | 0 项，只显示创建入口 | Paid Apps Agreement 生效后创建五档非自动续期订阅并与 1.0.0 首次同审 |
| App 隐私 | Privacy Policy、Privacy Choices 和 D7 的13类数据申报已发布；全部与用户关联、均不跟踪 | 最终归档与生产数据流审计后反向复核，出现新数据流先修正再提交 |
| 商务协议 | Free Apps Agreement 有效；Paid Apps Agreement 状态为“新”，平台提示签署前须更新法律实体 | 由 Account Holder 完成真实法律实体、付费协议、银行和税务；不得猜测或代填事实 |
| DSA | 已选择交易商并预填 Apple 现有地址、电话和邮箱；尚未触发或完成电话/邮箱验证码 | 本人在浏览器直接完成两项验证码后继续，不把验证码发送到仓库、日志或聊天 |
| 开发者账号 | 组织账号有效，当前具 Account Holder 权限；Developer Program 续订日 2027-08-12 | 保持账号有效并在提交期间可完成双重认证 |
| Developer Program 协议 | 最新 Apple Developer Program License Agreement 已于 2026-08-24 接受 | 与尚未签署的 Paid Apps Agreement 严格区分 |
| 团队 API Key | 已创建 App Manager 职能团队密钥，真实 App Store Connect API 鉴权请求成功 | 私钥位于仓库外 `0600` 受保护目录；不记录私钥或在仓库复制 |
| App ID 能力 | 正式 Bundle ID 已启用 Sign in with Apple 与 In-App Purchase | 最终归档和签名描述文件继续反向复核 |

## 生产迁移演练证据

隔离演练已在 2026-08-26 成功完成，且未修改生产数据库：

| 证据项 | 值 |
| --- | --- |
| 源码提交 | `d082c0a`（PR #44；当前主线随后仅加入 PR #45 Ops 交付链） |
| 同轮新备份 | `icao-20260825T165825Z-1151356.dump` |
| 迁移前账本 | `pre=15:18:0`（已应用 15、待应用 18、drift 0） |
| 隔离迁移后账本 | `post=33:0:0`（已应用 33、待应用 0、drift 0） |
| 业务行 / 认证用户 | `business_rows=1744` / `auth_users=84` |
| 指纹覆盖 | `tables=54`，`mismatch=0` |
| 清理 | `cleanup_verified=1` |

该证据证明当时完整待执行迁移可在生产备份副本上无漂移完成，且演练数据库、镜像、临时文件和凭据
环境已清理；它不授权也不证明生产迁移、API 或 Ops 已部署。

## 当前生产与代码阻断

- 只读生产核验仍显示迁移账本 15 条、Ops 表 0 张，证明 18 项待执行迁移尚未应用；成功演练结束后
  rehearsal 数据库、工作目录、上传包、临时运行环境和候选镜像计数均为 0，没有残留演练资源。
- 2026-08-25 实测生产 `POST /v1/commerce/apple/notifications/v2` 返回 404，说明包含 Notifications V2
  的当前主线尚未部署；部署并通过 Apple Production/Sandbox 测试通知前，不能录入为已完成。
- 生产旧 API 仍注册 `/v1/auth/wechat/session`，与 1.0.0 无微信生产路由冻结不一致；必须由当前主线
  部署消除，不能用“未配置微信密钥”替代路由移除。
- PR #38 已消除当前源码的稳定设备标识，但生产数据库迁移、API、最终 iOS Build、升级清理和生产
  网络请求尚未形成闭环证据；完成前不能把“不选择 Device ID”标记为最终生产事实。
- PR #43 已补齐 D7 隐私自助用户入口并统一正式 App 协议范围；五个 `official-site` 页面已从干净主线
  发布，且线上响应与对应源码逐字节一致。当前生产 API 仍未部署这些接口；页面已对齐不能替代生产
  能力和最终候选反向核验。
- PR #45 已完成 Ops 生产交付与回滚代码链，但尚未执行生产迁移、初始化实际管理员或部署
  `ops.readyoufife.com`；后台仍不是生产就绪状态。
- `ops.readyoufife.com` 当前无 A 记录，权威 DNS 仍在阿里云；ECS 上 Ops API/Gateway 正式环境文件
  尚未建立，Ops 容器计数为 0。DNS、受保护环境、首个活动管理员、TLS 和容器健康全部通过后才能
  切换公开流量。
- 生产短信、腾讯云语音识别和 DeepSeek 所需配置已存在，但内容凭证签名、体验点防重复摘要、Apple
  登录和 Apple IAP 服务端配置仍不完整。当前没有可用且与客户端内置公钥匹配的生产 Ed25519 私钥；
  正式发布前必须安全轮换签名密钥对、同步客户端公钥，并通过受保护环境向生产 API 注入私钥。这里
  只记录配置组是否齐备，不记录任何密钥或值；缺项必须由生产预检验证。

“无体系课程宣传”指已冻结的体系课程销售/咨询页面和 `courses` 路由不可见、不可达。题库首页仍使用
“备考课程”表示本地题库组合计划，不包含价格、咨询、通过率、包过或站外购买；商店字段不宣传该
用语。“学习记录”是已经存在的个人记录功能，不等于已隐藏的“学习报告”。

## 仍需负责人提供的最小事实

### 现在需要

1. 备案已由负责人确认成功；仍须从正式备案材料准确抄录 App 备案号，并确认 Apple 中国大陆供应
   信息、MIIT 主体、App 名称、Bundle ID、简中元数据和备案工具类口径一致。
2. 用营业执照核实真实公司注册地址；当前已知注册地址只是仓库候选，不得未经核实写成正式事实。
3. Apple 的字段说明要求 Support URL 指向实际联系信息（如法定地址、邮箱和电话），并说明具体展示
   受适用法律影响；审核指南 1.5 另要求联系信息准确、最新且易用。本项目采用更保守的提交门禁：提供
   并核实真实公开支持电话，将核实后的注册地址和电话发布到 Support URL，验证页面在目标网络可访问
   且电话可接通。不得编造；App Store Connect 受保护审核联系人电话不能替代该公开电话。
4. 确认 `2026 云启航科（成都）科技有限公司` 是 Apple Copyright 字段要求的权利主体。
5. 对 `support@yunqihangke.com`、`privacy@yunqihangke.com`、`legal@yunqihangke.com` 分别完成真实
   投递、收件、回复和值守确认。线上出现邮箱不等于邮箱可达。
6. 在 Apple Business 合规页核实 D-U-N-S、公司中文名和 USCI；平台状态只能以 Account Holder/Admin
   登录后的真实页面为准。
7. 完成 App Store DSA 交易商合规；法律主体、地址、公开电话和邮箱只能使用正式材料中的真实值，
   并按 Apple 页面要求完成验证。不得把仓库候选地址或受保护审核联系人直接当作 DSA 事实。

### 最终候选包和提交阶段需要

1. 提供审核联系人姓、名、公司可接听电话和审核期值守邮箱；只填 App Store Connect，不写仓库。
2. 准备两个公司长期控制的 Production 手机号密码账号：账号 A 保持有效会员和足够 AI 点数；账号 B
   为可购买、可恢复、可用当前密码注销的账号。凭据只进公司凭据管理和 App Store Connect。
3. 记录最终 Build、Git commit、最低 iOS 版本和设备范围，并完成最终归档 SDK、PrivacyInfo、所需原因
   API、权限、网络请求及无微信审计。
4. 用同一候选 Build 拍摄 6 张简中产品页截图和 5 张 IAP 审核截图，复核 Notes 中菜单名、路径、
   StoreKit 价格、购买、恢复、AI 和注销都能由审核账号复现。
5. 从 Apple 审核可能所在网络复查五个 URL；复核版本页已保存 `Automatically release this version`，
   不设置最早发布日期。
6. App Manager 团队 API Key、Apple 登录能力和当前 `1.0.0` 版本记录已完成；仍须确认最终正式签名
   和 App Store Server Notifications V2。私钥、密码和验证码不进仓库、日志或聊天。
7. 为 Ops 首个实际管理员提供公司控制邮箱并完成 TOTP 绑定；密码、TOTP 秘钥和恢复码只进入受保护
   凭据存储，不进入本材料。

### 公司银行账户可用于 Apple 后需要

1. 当前 Developer Program 协议已由 Account Holder 接受；仍须先按平台提示用正式材料更新法律实体，
   再接受状态为“新”的 Paid Apps Agreement，并完成银行和税务信息，使付费商务状态有效。当前
   Free Apps Agreement 有效不能替代付费协议；真实银行、税务数据不进入仓库或聊天。
2. 创建五个 Non-Renewing Subscription，录入唯一字段包中的 Product ID 和本地化；以中国大陆为
   Base Country or Region，按已批准回退规则选定五个实际官方价格点并保存证据。
3. 确认五项商品可用地区、税务分类、截图、Notes 和状态完整，完成 Sandbox/TestFlight 购买、恢复、
   重购、退款和环境隔离验收；首次与 App 1.0.0 加入同一 submission。

## 剩余风险与提交阻断条件

- **P1 Support URL 阻断：** 当前页面缺少经负责人核实并发布的真实公司注册地址和公开支持电话。
  当前已知注册地址只是仓库候选，必须与营业执照核实；公开电话不得编造。两项发布后还须验证页面
  可访问、电话可接通。App Store Connect 受保护审核联系人电话不能替代公开支持电话；此门禁通过前
  不得提交。这是本项目基于 Apple 所列联系信息与适用法律要求采取的保守门禁，不表示所有地区必须
  采用完全相同的公开展示格式。
- 三个公开邮箱的真实投递、收件、回复和值守尚未由本任务核验；完成运营验收前不应提交。
- D7 隐私标签是批准基线，不是最终归档事实的替代。最终 SDK、权限、网络请求、生产配置或第三方处理
  新增任何数据类型时，必须同步修正公开政策和 App Store Connect 后再提交。
- PR #38 已消除自建内容访问链路的稳定设备标识；仍必须以最终归档和生产网络审计确认第三方 SDK
  没有新增可被 Apple 归为 Device ID 的设备级标识。
- 当前 `privacy-choices` 已发布自助导出、删除和撤回 AI 同意口径并与主线源码一致；生产 API 和最终
  候选未完成前，仍不能把隐私申报标记为最终生产事实或提交审核。
- DeepSeek 的专项“不用于训练”证明仍缺失。当前公开文本没有作零留存、绝不训练或绝不出境承诺；
  若合同、控制台或正式技术文件显示不同处理范围，须先修正政策和隐私答案。
- 源码仍保留隔离的课程、学习报告及 Vercel legacy 实现。最终归档和正式路由检查必须继续证明这些
  内容不可见、不可达且不产生微信运行时或商店宣传。
- 自动发布是平台版本开关，不存在可由仓库证明的配置文件；当前只读核验已选中，最终提交前仍须在
  App Store Connect 复核并保存，不能仅依赖本次历史快照。
- DSA 已选择交易商且联系方式已预填，但电话与邮箱验证码尚未完成；在全部国家或地区分发方案下，
  必须验证完成后再提交。
- Apple 芯片 Mac、Apple Vision Pro 和校园批量购买已取消并保存；最终提交前继续复核没有被改回。

## 材料冲突修正记录

- 旧草案曾自行写入“App 与 IAP 仅中国大陆可用”，但 D4 已确认其他国家或地区价格由 Apple 按中国
  大陆基准价自动生成，D9 也未批准仅大陆发行。当前唯一字段包已删除该未经批准的地区限制，统一为
  App 与五档 IAP 使用当前全部可用 App Store 国家或地区；中国大陆继续作为价格基准地区，备案服务
  分类继续保持工具。
