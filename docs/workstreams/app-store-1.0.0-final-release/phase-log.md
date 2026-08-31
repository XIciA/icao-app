# iOS 1.0.0 最终上架阶段记录

## 当前阶段

- 阶段 0：基线、规则与工作区冻结。
- 启动日期：2026-08-31。
- 主线基线：`origin/main` `88f301b816eab4f8719fff7259ae5ad6888b89b6`。

## 已完成

- 负责人确认四份大流程文档并正式授权连续执行至 App Store 提交。
- D2、D4、D7、D9 已更新为：1.0.0 启用微信登录、禁用微信支付。
- 建立非阻塞人工队列、动态 Agent 接管和独立审计门禁。
- 旧 `app-store-1.0.0` 工作流已标记为历史入口。
- 2026-09-01 在 `origin/main` `47ab262` 上完成 UI/Logo P2 候选：删除 Expo 图标编辑器遗留，品牌
  manifest 与门禁明确 `assets/images/icon.png` 为唯一产品母版，`ios/`、`android/` 仅是被忽略且
  不可跟踪的 CNG 生成树；门禁使用 `git check-ignore` 验证忽略事实，并盘点 `mark`、通用图片名和
  `src` 内候选。三条 iOS Release 路径都在 `prebuild --clean` 后、编译前校验生成的 AppIcon、
  Splash 图片集和 Storyboard；固定 Expo 版本、唯一母版 SHA-256 与生成图片 SHA-256 组成可重放的
  派生绑定。临时全平台 clean prebuild 的 iOS/Android 品牌后验通过。
- 同一候选将沙盒和不支持购买文案改为正式中性口径，并对 Android 直达会员页显示明确的平台状态；
  iOS 仍进入 StoreKit 会员页，Web 使用原有通用实现。`base-flows-parity` 已逐项等待异步事件、显式
  cleanup，并把任何 `console.error` 作为测试失败。
- Web freeze 基线文件及其固定摘要没有重设。门禁使用 Expo CLI Web resolver 关闭普通
  `.native.*` fallback，但不在 resolver 之后排除任何已进入真实 Web graph 的平台后缀依赖；共享
  `assets/images/icon.png` 仍作为旧基线中的精确路径逐项保护，CNG 生成树不在 Web graph 或受保护
  路径内。临时 Git worktree fixture 通过真实 CLI 退出码证明：未被 Web resolver 选中的 Native
  fallback 变化可通过，显式进入 Web graph 的 `.native.*`、冻结 Web 文件或共享 icon 变化都会失败；
  该 fixture 已接入 `pnpm check:ci`。主线相对旧批准基线已存在的 shared/Web 差异仍由门禁诚实报告
  为红；它阻止 Vercel 构建或发布，但不阻塞只使用 `origin/main` clean prebuild 的 Native/App Store
  候选，Vercel 继续冻结。

## 当前工作

- 将确认后的文档和长期规则通过短期分支、PR 合入 `main`。
- 合入后重新读取代码、Apple、微信和生产事实，拆分阶段 1 的三个独立执行闭环。

## 验证结果

- Markdown 相对链接检查通过。
- `git diff --check` 通过。
- 文档未包含审核手机号、密码、验证码、银行账号或平台密钥。

## 剩余风险

- 微信开放平台账号可访问，但移动应用创建、认证、AppID、Universal Link 和登录权限状态待读取。
- App Store Connect 当前最高 Build、五档 IAP 状态及最终材料仍需重新读取。
- 当前阶段尚未修改代码、构建、部署或提交审核。

## 阶段判断

- 文档进入 `origin/main` 且工作区恢复干净后，可进入阶段 1 并行实现与审计。

## 阶段 1：登录闭环与微信登录技术审计（2026-09-01）

- 执行基线：`origin/main` `47ab26200b458d4612d1dc8a361b48e1b7ed476f`；本阶段只在短期分支实现，不执行生产迁移、部署或合并。
- 现有手机号 OTP 由服务端记录 `phone_otp_intents`，但客户端验证仍直接调用 Supabase 且没有显式 `challengeId`；客户端 SecureStore 仅保存倒计时，不保存手机号、签发时间和重发代次。这会让退回、重启、重发旧码和近期认证依赖隐式时间推断。
- 现有登录页把“获取验证码”和“输入验证码”拆成两个不可恢复页面；返回动作会主动清除挑战。它与已冻结的同屏 OTP/密码切换方案不一致。
- `AuthProvider` 已尝试忽略 `INITIAL_SESSION`，但其他迟到的 Supabase 会话事件仍可覆盖刚写入的新会话；恢复、刷新和交互式登录缺少统一 generation/epoch 归属。
- 身份模型、合同和账号摘要只正式暴露手机号/Apple；数据库 `account_identities` 虽能存 `wechat`，终身 100 点约束、近期认证、导出和管理摘要仍拒绝微信。
- 仓库没有微信原生桥、回调或服务端 code 交换；发布门禁仍把任意微信运行时视为失败。需要改为锁定 NoPay OpenSDK 2.0.7 与校验和、禁止客户端 AppSecret 和微信支付的正向门禁。
- 当前没有可安全写入仓库的生产 AppID、AppSecret、Universal Link 真值；它们登记为 `WAITING_HUMAN`，不得阻塞独立代码、测试和材料工作。

## 阶段 1：登录闭环与微信登录实现进展（2026-09-01）

- 手机号 OTP 已改为显式、可恢复的 challenge 状态机；客户端在 SecureStore 保存 challenge 身份与服务端时间窗，重发会产生新 challenge，成功登录后原子清除。OTP/密码同屏切换、未勾选条款、圆形 Apple/微信快捷入口与唯一 AppBrandLogo 已进入方案 A 页面。
- `AuthProvider` 以 session generation/epoch 隔离初始化、前后台恢复、刷新和交互式登录；迟到的 `INITIAL_SESSION` 或 AppState 异步结果不再能清除新会话或造成跨账号污染。
- 服务端新增微信一次性 state/code 交换、不可逆摘要去重、持久化限流、UnionID 优先/OpenID+AppID 回退、事务化身份/账号/会话建立和近期认证；100点按微信身份终身防重复，不使用内存重放表或客户端秘密。
- iOS 锁定 NoPay OpenSDK 2.0.7 源地址与 SHA256，并通过 Expo prebuild/Pod 集成；Android 提供同一业务接口的 NoPay 原生桥、回调 Activity 和可编译配置。发布门禁已从“微信必须不存在”改为检查精确 NoPay SDK、服务端 AppSecret、无微信支付和隐私材料一致。
- 正式 API 源码新增 `/.well-known/apple-app-site-association`，只在完整微信配置下返回窄路径 JSON；最终生产门禁必须验证 HTTPS、无重定向、正确 Content-Type、AppID/path 与微信平台一致。
- Native 隐私政策与非 Vercel 正式页面源码升级为 v4.2，披露微信开放平台登录、账号标识处理和无微信支付；Vercel 冻结范围未修改、未构建、未部署。
- 聚焦客户端认证测试、API身份/OTP/AASA测试、根与API typecheck、正向微信发布门禁均通过。使用锁定的 NoPay 2.0.7 归档完成 Expo iOS prebuild、Pod 安装及 arm64 iOS Simulator 全量 `xcodebuild`，结果为 `BUILD SUCCEEDED`；构建过程中发现并修复 SDK 头重复导入、XCFramework 外层名称与内层链接名不一致以及新版 Swift SDK API 兼容问题。全量 `check:ci` 结果将在整合最新主线后补入。
- `WAITING_HUMAN`：真实微信 AppID、服务端 AppSecret、已审核 Universal Link、iOS/Android平台签名资料及线上 AASA 可达性仍待平台核实；这些只阻塞微信生产真机验收和最终候选，不阻塞其余代码与材料。

## 阶段 1：登录闭环与微信登录最终候选验证（2026-09-01）

- OTP 挑战按启动代次保持唯一有效状态，退回、杀进程和重启可恢复；重发、旧码、过期、错误、限流和迟到请求均有聚焦测试。会话提交在 generation 所有权确认后才写入持久存储，迟到的 Supabase 初始化、刷新或监听事件不能覆盖较新的交互式登录。
- 微信登录继续使用官方 OpenSDK `SendAuth`，业务代码、JS 桥、回调和配置均不暴露微信支付入口、商户资料或支付请求。门禁定义为“无应用可达支付能力”，不把官方 SDK 内部为兼容性保留的未调用类型误报为产品支付能力；iOS 归档检查应用侧未引用支付 API，Android 正式 APK/AAB 门禁必须读取 R8/DEX 后验结果。
- iOS 已完成 clean prebuild、Pod 安装和 Release `iphonesimulator` 全量构建，`xcodebuild` 结果为 `BUILD SUCCEEDED`。Android 已完成 clean prebuild；当前宿主未安装 Android SDK，因此本轮没有声称 Android 原生编译或正式 APK/AAB 后验通过，正式 Android 构建链仍强制执行支付能力反证门禁。
- `pnpm check:ci` 完整通过：根项目 132 个测试套件、786 个测试，API 31 个测试文件、513 个测试；另有登录聚焦客户端 46/46、API 21/21、StoreKit 130/130、生产迁移门禁 22/22 全部通过。根项目、contracts 和 API 的 typecheck、lint 与 build 均通过。
- Vercel 未修改、未构建、未部署。共享 `InfoScreen.tsx`、`legal-release-surface.ts` 和 contracts Web 入口相对 `origin/main` 为零差异；当前 Web resolver 选中的受保护文件与本分支差异交集仅为 Native 插件和依赖所必需的 `app.config.js`、`package.json`、`pnpm-lock.yaml`。旧批准 manifest 在 `origin/main` 自身已有历史红项，本阶段未重建或放宽该基线。
- 生产 AppID、服务端 AppSecret、微信平台移动应用配置、Universal Link/AASA 线上可达性仍为 `WAITING_HUMAN`；候选门禁会在正式值缺失时失败，不会假绿，也不阻塞其余已完成代码和测试进入审查。
