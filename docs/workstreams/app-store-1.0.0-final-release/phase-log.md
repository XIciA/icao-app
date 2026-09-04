# iOS 1.0.0 最终上架阶段记录

## 当前阶段

- 阶段 3：生产 API/数据库已切换，等待微信真值与最终候选 Build 收口。
- 启动日期：2026-08-31。
- 当前主线基线：`origin/main` `a2e99460502079f276ec8448e1727f330929cab7`。

## 已完成

- 负责人确认四份大流程文档并正式授权连续执行至 App Store 提交。
- D2、D4、D7、D9 已更新为：1.0.0 启用微信登录、禁用微信支付。
- 建立非阻塞人工队列、动态 Agent 接管和独立审计门禁。
- 旧 `app-store-1.0.0` 工作流已标记为历史入口。
- 热点正式权限状态、五档会员购买闭环、唯一 Logo/UI 门禁、录音代次修复和登录/微信闭环已分别通过
  PR #87、#86、#88、#89、#90 合入 `origin/main`；登录闭环最终基线为 `8e90bdd`。
- 付费 App 协议有效、工行账户可用，两份美国非居民税务表均为使用中；旧银行/税务待办不再是现行
  阻塞，仅在最终提交前读取 Apple 状态反查。
- 2026-09-04 已从精确主线 `a2e99460502079f276ec8448e1727f330929cab7` 完成生产迁移和 API 原子
  cutover：迁移账本由 `35 applied / 7 pending / 0 drift` 变为 `42 / 0 / 0`，schema contract 为
  `59/59`，五档商品及五个 Apple 映射均存在；公开和 ECS 本机 readiness 均为 HTTP 200，release
  为 `production-migration-a2e994605020`。独立只读验收 P0/P1/P2 均为 0。
- App Store Connect 已反查：付费协议有效、银行可用、两份税务表使用中；1.0.0 仍为
  `PREPARE_FOR_SUBMISSION`，最高 Build 仍为 `3493764`，五档 IAP 的中国区价格和可售范围正确，但因
  最终审核截图缺失仍为 `MISSING_METADATA`。已仅同步最终中文描述与审核备注，未触碰审核账号字段。
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

- App Store Connect 当前最高已上传 Build 为 `3493764`；已把源码和材料候选递增为 `3493765`，真实
  微信配置完成并通过发布门禁后，才允许从干净 `origin/main` 归档上传。
- 真实微信 AppID、Universal Link 与服务端 AppSecret 继续保持 `WAITING_HUMAN`，不得以占位值制作候选；
  等待期间继续推进不依赖这些真值的材料、门禁和平台核对。

## 验证结果

- PR #90 最终候选验证：`pnpm check:ci` 全量通过，根项目 796 项、API 551 项；iOS Release Simulator
  构建成功；独立审计 P0/P1 已关闭。
- Build `3493765` 的 `pnpm check:release` 完整通过：Native 品牌、微信登录、账号绑定、内容访问、
  生产迁移合同、iOS StoreKit 130 项、TestFlight 合同、法律页和 App Store 材料门禁均通过。
- `pnpm check:app-store-materials` 单独复跑通过；`git diff --check` 通过。
- 生产迁移成功证据为
  `/opt/icao/runtime/production-migrations/evidence/apply-a2e994605020-20260904T124948Z-1138168c31b1-succeeded.txt`；
  cutover 前备份 `icao-20260904T123546Z-1010229.dump` 与 drain 后备份
  `icao-20260904T124932Z-1053718.dump` 均为 root `0600` 且 SHA-256 sidecar 复核一致；13 类临时资源
  清理计数均为 0。
- Vercel 未修改、未构建、未部署。

## 剩余风险

- 微信开放平台真实移动应用 AppID、已审核 Universal Link、服务端 AppSecret 和生产 AASA 仍待平台
  核实；仅直接依赖节点保持 `WAITING_HUMAN`。
- Build `3493765` 尚未归档、上传或真机验收；六张产品截图、五张 IAP 审核截图和唯一审核账号仍须
  使用最终候选收口。
- Vercel 正式法律页仍是 v4.1，而仓库和 Native 已为含微信披露的 v4.2；按冻结规则，只有用户明确
  授权 Vercel 修改与部署后才可同步。

## 阶段判断

- 生产迁移和 API 部署已完成。只有真实微信配置完成并通过候选发布门禁后，才能从干净
  `origin/main` 归档上传最终 TestFlight 包；随后完成真实审核账号、真机验收、十一张最终截图与五档
  IAP 关联，方可执行不可逆的 App Store 提交。

## 生产迁移 cutover 候选实现（2026-09-04，历史记录；后续已执行）

- 实现基线：`origin/main` `8b130ad8d26be249d666839dd1d645e5893d7439`；短期分支
  `codex/app-store-1.0.0-migration-cutover`。本记录只说明代码候选，不代表已连接生产、已迁移、已部署或
  已取得生产证据。
- 正式迁移计划改为“生产只读 ledger 起点 + 当前提交 migration journal 终点”的双向绑定，不再默认
  `34:1:0 -> 35:0:0`。代码与测试覆盖 `0034 -> 0041` 的 `35:7:0 -> 42:0:0`，以及部分应用后从
  实际剩余 suffix 继续 forward-fix。
- 候选镜像以即将安装的完整 runtime env 在所有写库前执行不可跳过的 `config-preflight`；现有生产配置
  规则会拒绝公开或与 API 同源的 `SUPABASE_URL`。
- 正式脚本把共享发布锁、旧 API 优雅 drain、drain 后即时备份/checksum、迁移、schema 验证和新 API
  readiness/live verifier/release header 收敛为一个 cutover。迁移前恢复会先完成一次 60 秒幂等停止，
  记录 exit/OOM，再单次启动并复核原镜像、Running、readiness 与原 release header；迁移开始后失败保持 API 关闭，并明确
  `roll-forward-only`，不自动恢复数据库。
- 新增/加强的聚焦测试覆盖：journal 动态终点、0041 minimum schema 绑定、共享锁竞争、候选临时环境清理、
  候选预检顺序、live 配置同目录原子替换、第二终止信号、旧在途请求先于备份完成、备份时间点、备份失败、
  快时钟完整 grace window 后才 settle 的旧 API 恢复、原镜像/release 不一致拒绝、迁移后 fail-closed、cutover 提交后
  source housekeeping 失败语义和部分迁移后的 forward-fix 计划。本地隔离聚焦测试于 2026-09-04
  通过；这不代表生产迁移或部署已经执行。
- 正式执行继续受 [仓库与 GitHub 管理规则](../../rules/repository-and-github-management.md)、
  [交付与验收规则](../../rules/problem-solving-and-maintenance/delivery-and-acceptance.md) 约束：只能从已进入
  干净 `origin/main` 的提交执行，并仍需生产迁移/部署的明确授权。Vercel 不在本候选范围内。

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
- OTP 供应商调用已移出数据库事务：短事务只负责手机号级持久 reservation/lease，发送使用 15 秒硬超时；超时后按完整验证码有效期隔离该手机号，成功后的五分钟有效期从供应商完成时间起算。客户端 challenge 的写入、清除和卸载共用 generation/tombstone 串行协议，迟到响应不能复活已清理状态。
- 微信登录继续使用官方 OpenSDK `SendAuth`，业务代码、JS 桥、回调和配置均不暴露微信支付入口、商户资料或支付请求。门禁定义为“无应用可达支付能力”，不把官方 SDK 内部为兼容性保留的未调用类型误报为产品支付能力；iOS 归档检查应用侧未引用支付 API，Android 正式 APK/AAB 门禁必须读取 R8/DEX 后验结果。
- iOS 已完成 clean prebuild、Pod 安装和 Release `iphonesimulator` 全量构建，`xcodebuild` 结果为 `BUILD SUCCEEDED`。Android 已完成 clean prebuild；当前宿主未安装 Android SDK，因此本轮没有声称 Android 原生编译或正式 APK/AAB 后验通过，正式 Android 构建链仍强制执行支付能力反证门禁。
- `pnpm check:ci` 完整通过：根项目 132 个测试套件、796 个测试，API 33 个测试文件、551 个测试；迁移日志精确校验 42 项并覆盖至 0041，StoreKit 130/130、生产迁移门禁 22/22 全部通过。根项目、contracts 和 API 的 typecheck、lint 与 build 均通过。
- Vercel 未修改、未构建、未部署。共享 `InfoScreen.tsx`、`legal-release-surface.ts` 相对 `origin/main` 为零差异；contracts 入口存在仅类型契约增量，但 TypeScript 编译后的 Web 运行时 JavaScript 为零差异。严格增量门禁确认当前 Web resolver 选中的受保护文件与本分支差异交集精确为 Native 插件/依赖所需的 `app.config.js`、`package.json`、`packages/contracts/src/index.ts`、`pnpm-lock.yaml`，并固定逐文件摘要、校验 Expo 配置去除 Native 插件后的等价性、Web package surface 等价性和 contracts 零运行时输出差异。旧批准 manifest 在 `origin/main` 自身已有历史红项，本阶段未重建或放宽该基线。
- 生产 AppID、服务端 AppSecret、微信平台移动应用配置、Universal Link/AASA 线上可达性仍为 `WAITING_HUMAN`；非密钥批准真值由受版本控制的 `config/release/wechat-login.json` 单一维护，正式候选把该来源与构建 AppID/Universal Link、生产 challenge、API origin、AASA Team+Bundle+path 四向核对。当前缺真值的负向自测按预期失败，不会假绿，也不阻塞其余已完成代码和测试进入审查。
