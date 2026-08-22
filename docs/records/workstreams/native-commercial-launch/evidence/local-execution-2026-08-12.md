# 内部 TestFlight 本地执行记录（2026-08-12）

## 结论

TF1 已从手机号验证码/密码扩展为方案 B 的本地候选：微信、Apple 和手机号 OTP 首次认证自动注册并
可直接进入；永久 `accountId` 承载学习数据与未来权益；第三方账号可稍后绑定手机号，已占用号码由
服务端验证 OTP 并事务归并，成功后才返回手机号主账号会话。没有建立第二套业务账号体系。

现有 TestFlight 已由负责人确认可收到阿里云真实验证码；当前收件证据是已审核的“云启航科成都”
签名。用户尚无“听你五个”注册商标，且阿里云当前页面只接受企事业单位名或已注册商标来源，因此
该品牌签名延期到商标注册完成或具备平台认可材料后，不得不实提交，也不阻塞当前登录。三网覆盖仍
待真机确认。本次没有执行永久账号生产迁移、社交登录 API
生产部署、Vercel 部署或新 TestFlight 上传，因此微信/Apple 和手机号归并不能描述为已上线。

2026-08-13 外部状态补记：公司 App ID `com.readyoufife.ios` 的 Sign in with Apple capability 已在
Apple Developer 启用；发布描述文件需要重建，Supabase Apple provider 和真机链路尚未验收。微信
开放平台配置尚未完成，且当前自动化浏览器安全策略无法代办该站点，需负责人在官方界面完成平台
登录、认证/协议/费用和受保护凭证输入。

## 已完成的本地证据

| 范围 | 结果 | 边界 |
| --- | --- | --- |
| Web/Vercel 冻结 | 生产 Web 未构建或部署；冻结门禁拒绝当前8个共享输入差异，未擅自重设基线 | 差异包含此前图标/版本/共享登录组件和本次 Native 依赖/原生配置；上线前需单独复审，不得借本任务重设 |
| Native 登录 UI/auth | 已实现微信/Apple/手机号 OTP/密码入口、自动注册、设密/找回、稍后绑定及冲突归并 UI；最终 App 全量为82个 Jest 套件/419项测试通过 | 证明本地合同与交互；Apple/微信仍需外部平台、迁移、部署和双端真机验收 |
| Native 模拟器 | iPhone 模拟器已可视检查验证码登录、密码登录、注册和找回密码四个界面，包含14+与协议勾选 | 只做本地 Development Build 渲染；不是 TestFlight 真机证据 |
| 阿里云短信适配 | Hook 验签、发送映射、摘要幂等、基础限额和失败关闭测试通过；“云启航科成都”已审核，现有 TestFlight 已收到真实验证码 | 三网到达及多实例共享限流仍未验收；“听你五个”因无注册商标而延期 |
| 测试 OTP 覆盖层 | 本地失败关闭检查通过 | 未配置实际测试号码/验证码，未部署 |
| 支付禁用占位 | 2 个测试套件、6 项测试通过 | 未接 SDK、商品、网络、订单、权益或 App 购买入口 |
| 发布配置 | 本地 release 配置与 4 个 Native 法律页检查通过 | 未 Archive、未签名上传、未提交审核 |

并行 AI 线程曾短暂修改共享依赖注入热点，因此冻结期间的早期全量结果没有被当作最终证据。协调
确认热点稳定后，已按 contracts → API → App/full 顺序重新执行，结果如下。

## 共享热点稳定后的最终集成验证

| 检查 | 最终结果 |
| --- | --- |
| Contracts | TypeScript 无输出检查通过 |
| API | 类型、ESLint、构建通过；12 个 Vitest 文件、264 项测试通过 |
| App/full | TypeScript、Expo ESLint 通过；82 个 Jest 套件、419 项测试通过；仅有既有 React 19 overlapping `act()` 控制台警告，无失败 |
| 依赖供应链 | 阿里云 SDK 间接依赖的易受影响 `ini@1.3.5` 已精确覆盖为兼容修复版 `ini@1.3.8`，lockfile 已同步并通过全量安装/构建检查 |
| 发布静态门禁 | Release/TestFlight/录音脚本语法、发布配置和 4 个 Native 法律页通过 |
| Expo 原生配置 | 临时 iOS/Android prebuild 通过，Apple entitlement、微信 Scheme/Universal Link、Android 回调 Activity 均生成；Expo Doctor 17/19，剩余为仓库既有 Expo 补丁版本差异及 React Native Directory 对 `expo-native-wechat` 新架构“未测试”的元数据提示，必须以新原生构建和真机验收收口 |
| UI 与音频边界 | UI acceptance 配置和 audio architecture boundaries 通过 |
| TestFlight Auth 覆盖层 | 非生产、可到期、白名单测试 OTP 失败关闭检查通过 |
| Web/Vercel 冻结 | 线上未触碰；本地严格门禁因8个共享输入差异失败并保持阻断，未重设基线 |
| 工作树格式 | `git diff --check` 通过 |

AI 和录音相关测试均通过；没有为通过本工作流而修改它们的实现。以上只证明当前本地工作树稳定，
不代表生产 ECS/Vercel 已部署或 TestFlight 已上传。

## 共享热点差异与合并依据

- `services/api/src/app.module.ts`：本工作流删除 `InviteAuthController`/`InviteAuthService` 的 import、
  controller 和 provider 注册，使 Native phone token 不再依赖邀请码兑换入口；另以最小增量注册
  Supabase SMS Hook controller/service 与阿里云 provider。并行 AI 工作流的 `DeepSeekReviewProviderService`
  import/provider 被完整保留，没有整文件覆盖。
- `packages/contracts/src/index.ts`：本工作流增加认证提供方、永久账号摘要、微信会话、手机号归并和
  `+86` 规范化/校验/脱敏合同，并从注销请求删除 `inviteCode`；并行 AI 工作流的 `review` capability
  和 review 结果合同被完整保留。Contracts 检查和下游全量检查通过。
- `src/config/app-version.ts`：保留本次方案 B 开始前的共享值 `v2026.08.12.0018`；
  `src/config/app-version.ios.ts` 与 `src/config/app-version.android.ts` 仅为 Native 提升到
  `v2026.08.12.0019`。严格 Web manifest 仍是更早的0016基线，因此门禁保持失败，不擅自重设。
- `services/api/src/config.ts`：在保留并行 AI 工作流 DeepSeek 配置的基础上，只增加阿里云短信和
  Supabase SMS Hook 配置，没有整文件覆盖。
- `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`scripts/archive-ios-testflight.sh`、`scripts/run-audio-e2e.sh`、
  `tools/verify-release-config.mjs`、`tools/audio-sensitive-fingerprint.mjs` 中现有的 `expo-audio ~55.0.16`
  升级和录音发布门禁未被本工作流整文件覆盖。API 依赖增量只用于阿里云官方 SDK、
  Standard Webhooks 验签与已审核的安装脚本拒绝项。阿里云当前 SDK 间接引入的 `ini@1.3.5`
  受 `GHSA-qqgx-2p2h-9c37` 影响，因此 `pnpm-workspace.yaml` 使用精确 override 将其收敛到兼容修复版
  `ini@1.3.8`，lockfile 已同步更新。Web 冻结基线只因复审通过的 lock/workspace 两个共享输入刷新，
  326 项冻结检查仍通过；最终 API 安装/构建与 Release/TestFlight/录音发布门禁也均通过。

## 本工作流可归因文件清单

下列是本工作流新建或实际修改的精确范围，不包含开始前及并行线程已有的图标、AI、录音、音频文档、
发布脚本、依赖或其他决策文件差异：

- 文档与证据：
  `docs/resources/project/product-state.md`、
  `docs/records/workstreams/native-commercial-launch/requirements.md`、
  `docs/records/workstreams/native-commercial-launch/decisions/d2-login-methods.md`、
  `docs/records/workstreams/native-commercial-launch/technical-audit.md`、
  `docs/records/workstreams/native-commercial-launch/technical-plan.md`、
  `docs/records/workstreams/native-commercial-launch/roadmap.md`、
  `docs/records/workstreams/native-commercial-launch/manual-actions.md`、
  `docs/records/workstreams/native-commercial-launch/evidence/local-execution-2026-08-12.md`、
  `docs/records/workstreams/native-commercial-launch/evidence/web-freeze.md`、
  `docs/records/workstreams/native-commercial-launch/evidence/web-freeze-manifest.json`；
- Native 登录、账号和测试：
  `.maestro/phone-login-flow.yaml`、
  `src/components/auth/login-screen.tsx`、
  `src/components/auth/splash-screen.tsx`、
  `src/features/auth/auth-service.ts`、
  `src/features/auth/AuthProvider.tsx`、
  `src/features/auth/__tests__/auth-service-test.ts`、
  `src/features/auth/__tests__/auth-rules-test.ts`、
  `src/features/account/AccountScreen.tsx`、
  `src/app/__tests__/auth-screen-test.tsx`、
  `src/app/__tests__/base-flows-parity-test.tsx`、
  `src/config/app-version.ios.ts`、
  `src/config/app-version.android.ts`；
- Contracts 与 App API：
  `packages/contracts/src/index.ts`、
  `services/api/src/app.module.ts`、
  `services/api/src/config.ts`、
  `services/api/src/create-app.ts`、
  `services/api/src/auth/require-auth.guard.ts`、
  `services/api/src/auth/supabase-auth.verifier.ts`、
  `services/api/src/auth/wechat-auth.controller.ts`、
  `services/api/src/auth/wechat-auth.schemas.ts`、
  `services/api/src/auth/wechat-auth.service.ts`、
  `services/api/src/auth/sms/aliyun-sms.provider.ts`、
  `services/api/src/auth/sms/supabase-sms-hook.controller.ts`、
  `services/api/src/auth/sms/supabase-sms-hook.service.ts`、
  `services/api/src/account/account.controller.ts`、
  `services/api/src/account/account-identity.service.ts`、
  `services/api/src/account/account.schemas.ts`、
  `services/api/src/account/account.service.ts`、
  `services/api/src/database/schema.ts`、
  `services/api/drizzle/0010_common_virginia_dare.sql`、
  `services/api/drizzle/meta/0010_snapshot.json`、
  `services/api/drizzle/meta/_journal.json`、
  `services/api/test/app.e2e.spec.ts`、
  `services/api/test/sms-hook.service.spec.ts`、
  `services/api/.env.example`、
  `services/api/package.json`、
  `pnpm-lock.yaml`、
  `pnpm-workspace.yaml`；
- 非生产占位与门禁：
  `infra/supabase/docker-compose.testflight.yml`、
  `infra/supabase/docker-compose.aliyun-sms.yml`、
  `infra/supabase/README.md`、
  `tools/verify-testflight-auth-overlay.mjs`、
  `tools/check-web-freeze.mjs`、
  `src/features/native-commercial-testflight/commerce-provider.native.ts`、
  `src/features/native-commercial-testflight/disabled-commerce-provider.native.ts`、
  `src/features/native-commercial-testflight/ai-points-policy.native.ts`、
  `src/features/native-commercial-testflight/__tests__/disabled-commerce-provider.native-test.ts`、
  `src/features/native-commercial-testflight/__tests__/ai-points-policy.native-test.ts`。

AI 点数占位文件在“禁止继续修改 AI 文件”的协调指令到达前已完成；指令到达后没有再修改该目录。

Maestro 手机号 UI 流程因本机缺少 Java Runtime 未执行；定向 Auth/UI Jest 检查已覆盖对应交互，但这不
替代最终 TestFlight 真机 OTP 验收。

## 当前协调冻结

- 禁止生产 ECS 部署；
- 禁止修改、构建或部署冻结的用户 Web/Vercel；
- 禁止上传 TestFlight；
- 禁止修改 AI、转写、润色、语法复核、录音/audio 文件或音频文档；
- 共享热点已确认稳定，依赖 `services/api/src/ai/*`、`services/api/src/app.module.ts`、
  `services/api/src/config.ts` 或 `packages/contracts` 的最终 API/full checks 已重跑通过；若这些文件
  此后再次变化，必须重新验证。

## 解除冻结后的安全顺序

1. 确认共享热点稳定并重新读取差异，不覆盖并行线程内容；
2. 重跑合同、API、全仓类型、Lint 和单测；
3. 评审 `accounts/account_identities/account_merges` 迁移，先做本机备份并在隔离数据库执行、回滚和不变量检查；
4. 保留 Apple Developer 已启用的 Sign in with Apple capability，重建发布描述文件并配置 Supabase；
   在微信开放平台完成企业移动应用、AppID、Universal Link、Android 包名/签名和服务端 AppSecret；
5. 在隔离环境部署账号映射与微信会话 API，验证旧手机号账号懒迁移、社交首次登录、直接绑定、冲突
   归并、源会话撤销和跨设备同一 `accountId`；
6. 阿里云继续使用“云启航科成都”完成三网到达；公开放量或多实例前把短信限流/幂等迁移到共享存储；
   “听你五个”仅在商标注册完成或具备平台认可材料后另行申请；
7. 仅在检查全部通过后准备本地 iOS/Android 构建；取得明确上传授权后再进入 Apple 2FA 和内部
   TestFlight 上传；
8. 真机完成微信/Apple/OTP/密码、手机号绑定/归并、会话恢复、弱网和支付禁用状态验收。
