# 当前产品状态

更新时间：2026-08-13

本文只描述当前产品事实与端侧定位。具体数量、版本和资源清单以代码及生成清单为准。

## 产品定位

听你五个（Read You 5）是面向 ICAO 英语学习与训练的产品。核心闭环包括题库学习、音频训练、录音与转写、
AI 辅助反馈、学习记录和内容资源浏览。视觉与交互延续既定品牌，不因平台拆分而改变产品身份。

## Native（iOS / Android）

- React Native + Expo + TypeScript 是正式移动端实现。
- 正式 iOS Bundle ID 为 `com.readyoufife.ios`，Android 包名为 `com.readyoufife.app`，正式 URL Scheme 为 `readyoufife`。
- 当前已发布的 TestFlight 账号入口使用中国大陆 `+86` 手机号，验证码/密码复用同一 Supabase phone
  identity；邀请码已退出 Native 登录。仓库中的下一版 Native 候选已扩展为微信、Apple（iOS）、
  手机号验证码和手机号密码四种入口：第三方首次认证自动创建内部账号并先进入，手机号可稍后绑定；
  手机号是最高可信的找回与归并锚点，学习数据与未来权益归永久 `accountId`，不直接归手机号或
  `auth.users.id`。社交登录、账号归并和新构建尚未完成外部配置、生产迁移及 TestFlight 真机验收。
- 真实短信供应商为阿里云；资质主体“云启航科（成都）科技有限公司”、短信签名“云启航科成都”和
  通用验证码模板已经审核并完成真实发送、代表号码收件。用户当前没有“听你五个”注册商标，而阿里云
  当前页面只允许企事业单位名或已注册商标来源，因此不得以不实来源提交“听你五个”；该品牌签名延期到
  商标注册完成或具备平台认可材料后。三网到达和多实例共享风控仍待完成。
- Send SMS Hook 不提供可靠的注册/登录/找回用途，因此三种流程共用一条通用验证码模板。当前短信限流、
  预算与幂等只在单 API 进程内存中生效；生产重启/多实例前必须持久化，并补齐设备/IP 风控。
- 内部 TestFlight 的非生产 Auth 配置只允许可到期、白名单式测试 OTP；正式包必须关闭所有测试 OTP，
  且不得将测试覆盖层与阿里云真实短信覆盖层同时启用。
- 账号、学习记录与需要联网的正式能力连接 App ECS API 与 Supabase。当前线上链路仍以已验证 `+86`
  手机号为入口；下一版本地候选的 API 将合法 Supabase 身份解析为活跃 `accountId`，普通业务访问不把
  手机号或 OTP 登录方式写死为前置条件。
- TestFlight 商业能力默认关闭：只存在无法触发真实渠道的支付接口占位和内部 AI 点数测试策略，
  未接 StoreKit、支付宝或微信支付 SDK，也不产生真实订单或权益。
- 正式题库、音频、录音、AI 和真实反馈能力由各自现有共享模块负责，不建立功能内的平行副本。
- Development Build 是能力边界；原生依赖、权限、插件或配置改变时需要重新构建。

## Web

- Web 是同一仓库的 Expo Web 产品体验，但运行时与 Native 解耦。
- Web 通过 Vercel Functions 和同源静态资源提供邀请码校验、内容和题库资源。
- Web 的邀请码会话与浏览器本地数据不接入 ECS、Supabase 或 Native 云同步。
- Web 与 Native 共享品牌、内容语义和核心交互意图，不要求共享后端身份与数据生命周期。

## 当前事实的来源

- 实现与路由：`app/`、`src/`。
- Native API：`services/api/` 与 `packages/contracts/`。
- Web 运行时：`api/`、`vercel.json`、`scripts/materialize-web-*.mjs`。
- 题库、内容与 AI 资产：对应工具生成的 manifest、release 文件和 `services/api/src/ai/assets/`。
- 长期产品和架构边界：`docs/rules/总战略文档.md` 与
  `docs/rules/architecture-decisions.md`。

当数字或“进行中/已完成”状态与实现冲突时，先核对生成清单、测试和线上证据，再更新本文；
不要把旧阶段日志当成当前事实。
