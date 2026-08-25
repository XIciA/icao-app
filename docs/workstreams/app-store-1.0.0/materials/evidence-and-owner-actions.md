# 商店材料证据、负责人最小事实与最终门禁

状态：2026-08-25 只读核对；生产、隐私自助权利、中国大陆合规、Support URL、Apple 付费商务、
审核账号、最终候选包和截图门禁未全部通过，不可提交；不包含平台登录、提交、发布或凭据。

本文件不定义 App Store 字段值。所有平台录入值只取自
[`app-store-connect-final-fields.md`](app-store-connect-final-fields.md)。

## 五个正式 URL

2026-08-25 从当前工作环境直接请求以下公开 HTTPS 页面，均返回 HTTP 200，canonical 与页面用途一致：

| 用途 | 正式 URL | 当前页面事实 |
| --- | --- | --- |
| Support URL | `https://yunqihangke.com/apps/readyoufife/support/` | 页面可访问并列出 `support@yunqihangke.com`，但尚未发布经核实的真实公司注册地址和公开支持电话 |
| Privacy Policy URL | `https://yunqihangke.com/apps/readyoufife/privacy/` | 16+、腾讯云语音识别、DeepSeek、非自动续期及无微信首发口径 |
| Privacy Choices URL | `https://yunqihangke.com/apps/readyoufife/privacy-choices/` | 查阅、导出、更正、删除、撤回 AI 同意、注销和无法登录路径 |
| 账号删除说明 | `https://yunqihangke.com/apps/readyoufife/account-deletion/` | App 内注销路径和无法登录时的隐私邮箱路径 |
| 用户协议 | `https://yunqihangke.com/apps/readyoufife/terms/` | 16+、五档非自动续期、独立工具定位 |

此次检查只证明当前网络位置可访问，不证明 Apple 审核所在网络、邮箱投递链路或公开支持电话可用，
也不证明注册地址真实。下方 Support URL P1 门禁完成前不可提交。

## 源码与配置反向核对

| 申报口径 | 当前仓库证据 | 结论 |
| --- | --- | --- |
| 1.0.0、名称与包身份 | `app.json` 为“听你五个”、`1.0.0`、`com.readyoufife.ios`；`src/config/app-version.ts` 为 `1.0.0` | 已对齐 |
| 无微信运行时 | `tools/check-wechat-runtime-freeze.mjs` 检查依赖、插件、登录/账号/API 运行时标记；生产配置无 Associated Domains；iOS 归档脚本另扫 SDK、类名、资源和网络标记 | 当前源码检查通过；最终归档仍须复核 |
| 无体系课程/学习报告宣传 | `src/features/content/native-release-surface.ts` 在正式 App 隐藏 `courses` 与 `ai-report`，`src/app/content/[slug].tsx` 对直接路由重定向 | 正式入口和直接路由被阻断；遗留实现文件保留但不是 1.0.0 可达能力 |
| 16+ | `src/features/auth/login-release-surface.ts` 的正式 App 登录勾选为已满16周岁；`src/features/info/legal-release-surface.ts` 使用同一口径 | 已对齐；Vercel legacy 文案是隔离分支，不属于正式 App |
| 腾讯云 ASR + DeepSeek | API 配置把 `AI_TEXT_PROVIDER` 固定为 `deepseek`，生产预检要求 DeepSeek 与腾讯云 ASR；正式法律文案相同 | 已对齐；生产密钥和供应商设置仍由最终配置证明 |
| 五档非自动续期 | Native 商品映射和服务端目录固定 7/15/31/62/93 天；StoreKit provider 拒绝非 `non-renewing-subscription` 类型；会员页明确不会自动续期 | 已对齐；平台商品尚待创建 |
| 不收集 Device ID | PR #38 / `c9bea40` 已移除内容访问链路中的稳定设备 UUID、`did`、`deviceDigest` 和设备级限流；v1 设备绑定缓存与凭据有升级清理和失败重试 | 当前源码与隐私标签“不选择 Device ID”一致；最终归档仍须扫描第三方 SDK 与生产网络数据流 |
| 独立运营后台 | PR #37 / `8861683` 已建立独立 Ops Web/API、邮箱密码与 TOTP、管理员/客服 RBAC、脱敏、可撤销会话和追加式审计 | 代码与聚焦安全审计已完成；尚未执行生产迁移、管理员初始化或 `ops.readyoufife.com` 部署 |
| 自动发布 | D9 已冻结 `Automatically release this version`；Apple 将其定义为 App Store Connect 的版本级选项 | 仓库无法证明平台开关；TestFlight 验收后必须在平台选中并保存 |

## 当前生产与代码阻断

- 2026-08-25 实测生产 `POST /v1/commerce/apple/notifications/v2` 返回 404，说明包含 Notifications V2
  的当前主线尚未部署；部署并通过 Apple Production/Sandbox 测试通知前，不能录入为已完成。
- 生产旧 API 仍注册 `/v1/auth/wechat/session`，与 1.0.0 无微信生产路由冻结不一致；必须由当前主线
  部署消除，不能用“未配置微信密钥”替代路由移除。
- PR #38 已消除当前源码的稳定设备标识，但生产数据库迁移、API、最终 iOS Build、升级清理和生产
  网络请求尚未形成闭环证据；完成前不能把“不选择 Device ID”标记为最终生产事实。
- D7 冻结的 App 内账号/学习数据导出、清除学习数据、删除单条或全部 AI 结果尚未形成用户入口；
  App 内用户协议的平台范围还包含冻结的 Web，而公开协议只覆盖 iOS/Android。必须改代码并统一
  公开文本，或由负责人另行修改长期决策；仅改商店材料不能解除阻断。

“无体系课程宣传”指已冻结的体系课程销售/咨询页面和 `courses` 路由不可见、不可达。题库首页仍使用
“备考课程”表示本地题库组合计划，不包含价格、咨询、通过率、包过或站外购买；商店字段不宣传该
用语。“学习记录”是已经存在的个人记录功能，不等于已隐藏的“学习报告”。

## 仍需负责人提供的最小事实

### 现在需要

1. 从正式备案材料提供准确 App 备案号，并确认中国大陆供应信息、主体、Bundle ID 和工具类口径一致。
2. 用营业执照核实真实公司注册地址；当前已知注册地址只是仓库候选，不得未经核实写成正式事实。
3. 提供并核实真实的公开支持电话，不得编造；将核实后的注册地址和电话发布到 Support URL，验证
   页面在目标网络可访问且电话可接通。App Store Connect 受保护审核联系人电话不能替代该公开电话。
4. 确认 `2026 云启航科（成都）科技有限公司` 是 Apple Copyright 字段要求的权利主体。
5. 对 `support@yunqihangke.com`、`privacy@yunqihangke.com`、`legal@yunqihangke.com` 分别完成真实
   投递、收件、回复和值守确认。线上出现邮箱不等于邮箱可达。
6. 从正式备案材料提供准确 ICP/App 备案号，并确认 MIIT 记录中的主体、App 名称、Bundle ID、简中
   元数据和工具类口径；在 Apple Business 合规页核实 D-U-N-S、公司中文名和 USCI。

### TestFlight 候选包通过后需要

1. 提供审核联系人姓、名、公司可接听电话和审核期值守邮箱；只填 App Store Connect，不写仓库。
2. 准备两个公司长期控制的 Production 手机号密码账号：账号 A 保持有效会员和足够 AI 点数；账号 B
   为可购买、可恢复、可用当前密码注销的账号。凭据只进公司凭据管理和 App Store Connect。
3. 记录最终 Build、Git commit、最低 iOS 版本和设备范围，并完成最终归档 SDK、PrivacyInfo、所需原因
   API、权限、网络请求及无微信审计。
4. 用同一候选 Build 拍摄 6 张简中产品页截图和 5 张 IAP 审核截图，复核 Notes 中菜单名、路径、
   StoreKit 价格、购买、恢复、AI 和注销都能由审核账号复现。
5. 从 Apple 审核可能所在网络复查五个 URL；在版本页选择并保存 `Automatically release this version`，
   不设置最早发布日期。

### 公司银行账户可用于 Apple 后需要

1. 由 Account Holder 接受当前 Apple Developer 与 Paid Apps Agreement，完成银行和税务信息，使付费
   商务状态有效；真实银行、税务数据不进入仓库或聊天。
2. 创建五个 Non-Renewing Subscription，录入唯一字段包中的 Product ID 和本地化；以中国大陆为
   Base Country or Region，按已批准回退规则选定五个实际官方价格点并保存证据。
3. 确认五项商品可用地区、税务分类、截图、Notes 和状态完整，完成 Sandbox/TestFlight 购买、恢复、
   重购、退款和环境隔离验收；首次与 App 1.0.0 加入同一 submission。

## 剩余风险与提交阻断条件

- **P1 Support URL 阻断：** 当前页面缺少经负责人核实并发布的真实公司注册地址和公开支持电话。
  当前已知注册地址只是仓库候选，必须与营业执照核实；公开电话不得编造。两项发布后还须验证页面
  可访问、电话可接通。App Store Connect 受保护审核联系人电话不能替代公开支持电话；此门禁通过前
  不得提交。
- 三个公开邮箱的真实投递、收件、回复和值守尚未由本任务核验；完成运营验收前不应提交。
- D7 隐私标签是批准基线，不是最终归档事实的替代。最终 SDK、权限、网络请求、生产配置或第三方处理
  新增任何数据类型时，必须同步修正公开政策和 App Store Connect 后再提交。
- PR #38 已消除自建内容访问链路的稳定设备标识；仍必须以最终归档和生产网络审计确认第三方 SDK
  没有新增可被 Apple 归为 Device ID 的设备级标识。
- DeepSeek 的专项“不用于训练”证明仍缺失。当前公开文本没有作零留存、绝不训练或绝不出境承诺；
  若合同、控制台或正式技术文件显示不同处理范围，须先修正政策和隐私答案。
- 源码仍保留隔离的课程、学习报告及 Vercel legacy 实现。最终归档和正式路由检查必须继续证明这些
  内容不可见、不可达且不产生微信运行时或商店宣传。
- 自动发布是平台版本开关，不存在可由当前仓库证明的配置文件。未在 App Store Connect 选中并保存
  `Automatically release this version` 时，不能把它标记为已完成。
- iPhone/iPad App 默认可能在 Apple 芯片 Mac 与 Apple Vision Pro 分发；1.0.0 未覆盖这两类设备，
  必须在 Pricing and Availability 中分别取消兼容分发并保存。
