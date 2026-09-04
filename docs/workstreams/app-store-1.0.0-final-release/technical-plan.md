# 听你五个 iOS 1.0.0 最终上架技术方案

状态：已确认，待按路线执行

方案日期：2026-08-31

关联需求：[requirements.md](requirements.md)

## 一、总体原则

- 延续 React Native、Expo 55、React Native 0.83、TypeScript、NestJS、PostgreSQL、Supabase Auth 和
  CNG/Prebuild，不引入 WebView、第二套 Native 技术栈或平行账号/商业模型。
- 每个核心状态只有一个权威所有者：认证会话归 AuthProvider，OTP 挑战归统一 Challenge Store，
  交易和权益归服务端账本，品牌图归唯一母版，内容访问归服务端授权与类型化客户端状态。
- 修复采用“状态机 + 明确合同 + 幂等 + 可恢复 + 自动化测试”，不根据手机号、截图、审核环境或单个
  页面写特例。
- 正式构建、生产部署和 App Store 材料只基于已经进入干净 `origin/main` 的事实。
- 密码、验证码、微信 AppSecret、Apple 密钥和签名材料只进入受保护的系统或平台，不进入仓库、日志、
  测试快照和聊天。

## 二、登录与账号闭环技术方案

### 2.1 单一认证状态机

认证状态统一为：

`booting -> anonymous -> authenticating -> authenticated`

OTP 子状态统一为：

`phone-entry -> code-active -> verifying -> verified | recoverable-error | expired`

- 根级认证门只读取 AuthProvider 已采纳的会话，不由单个页面直接决定跳转。
- AuthProvider 为会话写入增加代次/版本控制：启动恢复只能提交它启动时对应的版本；任何更新的
  OTP、密码、Apple 或微信登录一旦成功，旧恢复任务结果自动失效。
- 登录成功顺序固定为：服务端验证 -> Supabase/业务会话落盘 -> 读取/建立 `accountId` ->
  AuthProvider 原子发布 authenticated -> 根路由切换。中间失败时保持可恢复状态，不发布半会话。
- App 前后台切换、深链返回、第三方授权回调和 SecureStore 恢复均通过同一状态机，不各自实现跳转。

### 2.2 方案 A 登录界面

- 将登录 UI 拆为无业务副作用的展示组件和认证控制器：
  - `AppBrandLogo`；
  - `PhoneOtpForm`；
  - `PhonePasswordForm`；
  - `SocialLoginRow`；
  - `ConsentControl`；
  - `AuthInlineStatus`。
- OTP 和密码在同一页面切换，切换不会清除仍有效 OTP 挑战；只有“更换手机号”、挑战过期或验证成功
  才清理对应挑战。
- 验证码右侧操作使用服务端 `resendAllowedAt`；页面恢复时重新计算倒计时，不重发短信。
- 错误采用类型化代码映射为用户文案，日志只保留无敏感值的诊断 ID。
- 圆形微信/Apple 按钮使用官方品牌图标与可访问性标签；不可用原因可解释，不能留下无响应按钮。

### 2.3 统一 OTP Challenge 服务

- 服务端挑战至少包含：`challengeId`、`purpose`、标准化手机号、`issuedAt`、`expiresAt`、
  `resendAllowedAt`、尝试次数、消费时间和风控审计字段。
- 客户端 SecureStore 只保存 `challengeId`、手机号掩码所需值、用途和时间元数据，不保存验证码。
- 用途至少分为 `login`、`bind_phone`、`password_recovery`、`recent_auth`、`delete_account`；每个用途
  独立验证和消费，不允许互换。
- 服务端以事务或原子更新消费挑战；成功、冲突、过期和次数耗尽均不能重放。
- 60 秒发码冷却与 5 分钟验证窗口由服务端响应决定；第三方短信平台错误映射为稳定内部错误码。
- 不设置产品手机号白名单。自动化测试使用注入的测试传输器/固定时钟，不污染生产风控。

### 2.4 身份模型与设置联动

- 继续使用 `accountId -> identities[]`：`phone`、`apple`、`wechat` 均有唯一提供方标识和验证时间。
- 绑定操作在数据库事务中锁定当前账号、目标身份和提供方唯一键；唯一冲突返回稳定 `409`，不转移
  任何商业或学习数据。
- 手机号与密码属于同一个身份组：设置密码要求已验证手机号；解绑手机号前删除/禁用密码凭据。
- 账号安全页从服务端身份列表渲染可绑定/可解绑操作，禁止由本地布尔值推断。
- 注销通过最近验证的现有身份完成；同一请求幂等，成功后撤销所有 refresh token、身份映射和内容
  凭证，再进入已注销状态。

### 2.5 微信开放平台接入

- Native 端通过与 Expo 55 / RN 0.83 兼容的微信 OpenSDK 原生模块接入；先验证 SDK 版本、隐私清单、
  iOS 签名与 CNG 配置。若现有封装不可维护，建立最薄的 Expo Config Plugin/Native Module，业务层仍
  只依赖统一 `SocialAuthProvider` 接口。
- 客户端流程：检查安装与支持 -> 发起授权 -> 接收一次性 `code`/state -> 调用自有 API ->
  采纳正式会话。`state` 必须防重放；用户取消不作为错误告警。
- 服务端流程：校验一次性 state -> 使用受保护 AppSecret 换取微信响应 -> 选择稳定身份键
  （优先同主体 UnionID，必要时保存 AppID 范围 OpenID）-> 在事务中查找/创建 identity 和 account ->
  返回正式会话。
- iOS 配置由单一 Config Plugin 生成 URL Scheme、Universal Link、Associated Domains 和必要原生设置；
  AASA 部署后从公网与归档双向验证。
- 微信密钥轮换、接口超时、重复回调和提供方限流有明确错误和监控，不记录完整 token。
- 加入微信后，替换当前 `check-wechat-runtime-freeze` 发布门禁：新门禁验证“仅登录 SDK/路由存在、
  无微信支付、无客户端 AppSecret、隐私材料一致”，而不是继续要求微信完全不存在。

### 2.6 登录测试矩阵

- OTP：首次注册、再次登录、后台/重启恢复、60 秒重发、5 分钟过期、旧码失效、错误码、网络重试、
  双击、并发验证和挑战重放。
- 会话：冷启动恢复与新登录竞态、AppState、SecureStore 写入失败、refresh 失败、退出后旧请求返回。
- 密码：设置、登录、错误密码、未设置密码、找回、未知手机号同形响应、解绑手机号后不可用。
- Apple/微信：首次登录、再次登录、取消、未安装、网络错误、回调重放、身份冲突、可选手机号绑定。
- 账号：至少一种登录方式门禁、冲突不合并、退出、近期认证、注销、注销后100点不重复。

## 三、五档会员购买技术方案

### 3.1 商业合同和目录

- 维持现有 `NativeCommerceProvider` 边界和五个内部 product key；建立一份可机器校验的商品合同，
  同时约束本地映射、服务端目录和 App Store Product ID。
- StoreKit 返回结果只有在五档均匹配 Product ID、天数、非自动续期属性、推荐位、币种和非空本地化
  价格后才进入 ready；不完整时记录每档缺失原因，不把目录不一致误报成用户网络问题。
- App Store Connect 读取结果、付费协议、销售地区和商品状态先审计，再决定是平台元数据、StoreKit
  缓存、Bundle/环境、账号、原生桥接还是服务端目录问题。

### 3.2 商业运行时状态机

统一状态：

`initializing -> loading-catalog -> ready -> purchasing | restoring | reconciling | pending -> ready | error`

- 所有操作单航班化；账号切换或 Provider 更换会取消旧代次，旧回调不能更新新账号页面。
- `loading-catalog`、`restoring` 和 `reconciling` 均设置合理超时与可重试出口；超时不表示交易失败，
  先进入可解释的“结果待核对”状态并后台对账。
- `restore` 的完成不依赖必须找到交易；无可恢复交易也应在有限时间内回到 ready 并说明结果。
- 用户购买后若 App 被杀或结果不确定，将最小交易引用安全保存；重新进入、App 激活和手动刷新都会
  服务端对账，确认前禁止同一商品重复购买。
- App Store 取消、pending、已拥有/重复、网络失败和服务端验签失败使用不同结果；绝不把未知扣款状态
  文案写成“未扣款”。

### 3.3 服务端验证、通知和账本

- 使用 Apple App Store Server Library 验证 JWS；按 transaction ID、original transaction ID、
  environment 和 product ID 建立唯一约束。
- Notifications V2 先验证签名，再在单一事务写原始通知、交易、订单、权益段、点数批次和审计；
  重复 notification UUID 直接返回成功但不重复结算。
- Sandbox 与 Production 使用环境维度唯一键和账本隔离；TestFlight 交易只能形成沙盒权益视图。
- 权益聚合可从不可变订单/撤销记录重算。客户端每次刷新拿到服务器签发的当前会员、AI 点数和内容
  授权，不信任本地购买布尔值。
- 退款/撤销按 D4 规则重算，通知乱序时以 Apple 签名交易历史和服务器接收时间进行幂等归并。

### 3.4 页面与权限联动

- Membership 页面直接消费商业状态机，显示五档本地化商品、当前会员、AI 点数、沙盒标识和操作状态。
- 购买/恢复成功后统一触发 `refreshEntitlements()`，由同一事件更新题库、热点、离线授权和会员页；
  不在每个页面各写一套刷新逻辑。
- 权益刷新失败时保留已确认交易并提示“正在核对”，后台继续重试；不能要求用户重复付款。

### 3.5 商业验证

- 自动化：商品合同、目录缺失、价格映射、购买状态机、双击、取消、pending、不确定交易、恢复为空、
  恢复超时、通知重放、退款乱序、账号切换和环境隔离。
- StoreKit 本地配置：五档购买、重复购买顺延、恢复、退款和中断恢复。
- TestFlight 真机：真实本地化价格、五档至少逐档读取，代表档购买、重购、恢复、App 被杀后核对、
  退款/撤销和 Sandbox 标识；最终五档商品审核截图来自同一候选 Build。

## 四、唯一 Logo 与全局 UI 技术方案

### 4.1 资源所有权

- 保留 `assets/images/icon.png` 为唯一可编辑母版，不复制新的手工“最终版”。
- 建立品牌资源清单与检查脚本：计算母版 SHA-256，列出 iOS/Android/App 内派生目标，验证派生文件由
  当前母版生成并具有正确尺寸、颜色空间、Alpha 和安全留白。
- `AppBrandLogo` 统一使用 `expo-image`/React Native `Image` 的 `contain` 模式；容器只负责布局，不
  再裁切 Logo 圆角或提取飞机图层。
- `app.json` 的 App Icon、Splash 配置和 Native 加载页全部指向母版或生成派生物；删除 Native 运行时
  对独立残缺 `splash-icon.png` 的依赖。
- `official-site/`、`public/promo/` 和 Vercel 资源先分类为冻结外部表面，不在本次 Native 修复中删除；
  防止把站点 favicon 误当成 Native 竞争性母版。

### 4.2 全局 UI 审计方法

- 由路由清单生成正式表面矩阵：首次启动、登录、发现、题库、逐题学习、录音、AI、热点、会员、账号、
  设置、隐私、注销及所有弹窗/状态页。
- 每个表面验证默认、加载、空、错误、禁用、提交中、成功和返回恢复状态。
- 在最小支持 iPhone 与 6.9 英寸 iPhone 上检查安全区、键盘、动态字体和长中文；对最终 6.9 英寸截图
  尺寸单独验收。
- 建立静态检查：禁止 Native 正式表面直接引用非母版品牌资源、禁止用户界面显示已知内部错误码、
  禁止体系课程/学习报告正式路由和调试文案。
- 视觉修复优先落在共享 Token、图标封装、状态组件和布局组件；页面级例外必须说明原因并有快照/交互
  测试。

## 五、OPI 热点权限技术方案

### 5.1 类型化内容访问结果

内容加载层返回判别联合，而不是向 UI 抛原始字符串：

- `ready`：具有完整热点题目与有效授权；
- `membership-required`：基本 brief 可见，完整题目锁定；
- `offline-authorization-expired`：离线授权过期，需要联网刷新；
- `not-found`：热点不存在或已下线；
- `network-error`：可重试网络失败；
- `content-unavailable`：签名、数据或服务异常。

- API 客户端将服务端稳定错误码映射为上述状态；UI 不读取 `Error.message` 决定业务页面。
- 基本 brief 与完整题目分开加载，未授权客户端不接收完整会员题目文本，避免只靠 UI 隐藏。

### 5.2 用户体验和权益刷新

- `membership-required` 使用中性会员锁定卡片：保留日期、考点和数量摘要，说明完整练习需会员，提供
  “查看会员”和“刷新权益”。
- 从会员页返回或商业运行时发出 entitlement-changed 后，热点 repository 失效当前账号缓存并重新
  获取，不要求关闭 App。
- 网络错误只提供重试；not-found 不提供无意义会员入口；内容损坏显示支持路径和诊断编号。
- 缓存键包含 `accountId + environment + contentVersion`，账号切换、退款和环境切换立即失效。
- 72 小时离线凭证继续由服务端签发并在客户端验证；过期后锁定内容但保留学习记录。

### 5.3 热点测试

- 免费可见摘要、会员完整内容、无权限不泄露、购买后即时解锁、恢复后解锁、退款后重新锁定。
- 网络断开、授权过期、内容下线、数据签名错误、账号切换、Sandbox/Production 切换和返回恢复。
- 用户界面断言不出现 `membership_required`、堆栈、内部 URL 或未翻译错误。

## 六、App Store 与发布技术方案

### 6.0 生产数据库与 API 原子切换

- 正式迁移确认不再包含写死的历史计划。操作人先从候选提交对生产 ledger 的只读计划取得
  `applied:pending:drift`；脚本用同一提交内的 Drizzle journal 推导唯一终点，并拒绝不等于
  `journal.entries.length:0:0` 的计划。当前 `0034 -> 0041` 的完整候选应为
  `35:7:0 -> 42:0:0`，但该示例不能代替执行时重新读取 ledger。
- 候选镜像在任何正式写库前，必须使用即将安装的完整候选环境执行 `config-preflight`。生产
  `SUPABASE_URL` 必须是 API 所在私网可达的 HTTP origin；公网或与公开 API origin 相同的地址直接阻断。
  候选环境只允许存在于 root-only 的 `/run/icao-production-migrations` 临时文件，不能进入 staged source、
  runtime source 或 tar，并由成功/失败清理路径删除；drain 前还必须执行候选 compose 的只读 `config` 预检。
  即将生效的 live env 与 compose 先写入其各自目标目录内的 `0600` 临时文件，通过预检后才以同文件系统
  原子重命名替换；`runtime_source.next` 复制前删除所有本轮生成物，成功和失败路径都必须清理残留。
- 同一 `icao-production-release-change.lock` 覆盖候选预检、旧 API 停止接流量与优雅 drain、drain 后即时
  二次 PostgreSQL 备份和 checksum、迁移、schema 合同验证、新 API 启动与 readiness。第二份备份的
  mtime 必须不早于 drain 完成时间；演练前备份只用于隔离演练，不作为 cutover 的权威恢复点。drain 前
  必须复核运行中旧 API 的镜像 ID、健康状态、readiness 与 release header 一致。
- 在任何迁移写入前失败，可且只能恢复旧 API：先用完整 60 秒窗口幂等停止并记录 exit/OOM 状态，再仅
  启动一次，独立等待 readiness，最后验证原镜像 ID、`Running` 与原 release header；不能把守护进程仍在
  异步完成的旧 stop 误判为可直接启动。一旦迁移命令开始，0041 协议升级进入
  roll-forward-only，旧 API 保持关闭，禁止自动或无声恢复旧备份。后续只允许从新的 `origin/main`
  提交执行经过复核的 forward-fix；数据库恢复仍需单独授权并先完成隔离恢复验证。
- 发布证据分别记录演练备份与 post-drain 备份、drain 时间、旧/新 API 身份、迁移前后计划、失败阶段、
  `roll_forward_only`、失败语义和 cutover 提交状态。cutover 已提交后的清理失败必须明确保留新 API，不能
  误报为迁移失败关闭；新 API 只有 readiness、live verifier 与 release header 三者均通过后才立即提交
  cutover 状态，随后 runtime source 整理失败也不得停止这个健康实例。失败清理入口会屏蔽后续终止信号，
  保留原始失败阶段，并保证恢复策略、清理和失败证据不中途再次中断。
  仓库测试或文档不得把尚未实际执行的迁移写成生产证据。

### 6.1 候选包

- 2026-09-05 已确认 App Store Connect 当前最高已上传 Build 为 `3493765`；生产账号验收发现手机号会话
  规范化缺陷，本轮正式产物候选固定递增为 `3493766`，先通过短期分支与 PR 进入 `origin/main`，不得
  覆盖或复用旧 Build。
- 四个关键问题、微信原生配置、隐私清单和发布门禁合入主线后，执行聚焦测试、`pnpm check`、生产预检
  和归档反查，再从干净 `origin/main` 归档上传。
- 归档反查 Bundle ID、1.0.0、Build、Git SHA、签名、Entitlements、URL Scheme、Associated Domains、
  PrivacyInfo、第三方 SDK、生产 API、无微信支付、课程/学习报告不可达和唯一 Logo 派生链。

### 6.2 审核账号与截图

- 使用一个真实 Production 账号，首次 OTP 注册后设置密码；凭据只保存到系统钥匙串/公司凭据库和
  App Store Connect Review Information。
- 不使用虚假手机号、固定万能验证码或审核环境后门。Apple 审核员全程以手机号和密码登录。
- 使用最终候选 Build 生成 6 张 `1320 x 2868` 简体中文竖屏产品截图；不得复用旧 Build、旧 UI 或
  人工伪造功能状态。
- 五档 IAP 各自上传真实商品页面截图，截图必须显示该档商品和 StoreKit 实际价格。

### 6.3 平台反查和提交

- 反查 Paid Apps Agreement、银行、税务持续有效；App 与 IAP 仅 CHN 且自动新增地区关闭。
- 完成备案、年龄分级、隐私标签、审核 Notes、支持/隐私 URL、商品状态、服务器通知和 Build 关联。
- TestFlight 真机矩阵通过后，把 App 1.0.0 与五档首次 IAP 放入同一审核提交并保持自动发布。
- 拒审按原因分类：材料问题只改材料；运行时问题修复并上传更高 Build；法律/权利证明才请求负责人。

## 七、Agent 与代码集成方法

- 当前任务或后续新协调任务是唯一协调入口，负责冻结范围、拆分阶段、复查证据、合并和平台提交。
- 协调 Agent 根据真实依赖动态拆分或轮换子 Agent，不机械维持固定人数。每个子任务启动前必须写明：
  输入基线、文件/系统范围、禁止改动项、接口所有者、验收用例、预期证据和回滚方式；没有清晰合同的
  任务不得为了并行而派发。
- 专职执行角色按阶段启用：
  - 登录与微信 Agent：认证状态机、UI、账号安全、微信端到端；
  - 商业 Agent：StoreKit、服务端验证、权益、App Store 商品；
  - UI/内容 Agent：唯一 Logo、全局 UI、热点权限；
  - 独立审计 Agent：只读复核代码、归档、线上能力和商店材料，不修复自己的审计结果。
- 并发以文件和接口无冲突为前提；同时最多保持三个写入席位。某个执行 Agent 完成或等待外部平台后，
  释放席位给审计或灵活任务，避免长期任务因上下文膨胀、重复修改或无效等待而失稳。
- 同时写入的 Agent 必须使用从最新 `origin/main` 建立的独立短期分支/worktree和互不重叠文件范围；
  协调 Agent 通过 PR 合入 `main` 后立即删除临时分支。
- 每一阶段执行小流程：实现 -> 聚焦测试 -> 独立审查 -> 修复 -> 复验 -> 合并 -> 更新阶段记录。
- 用户临时提出的界面细节进入 UI/内容席位，不打断登录或商业主线；出现跨域冲突时由协调 Agent 统一
  决定接口，不允许两个 Agent 建立平行实现。

### 7.1 长任务稳定性与接管

- 每个 Agent 在阶段记录中持续维护当前提交、已完成项、剩余项、测试结果、已知风险和下一步；不得只在
  对话上下文中保存关键状态。达到可独立验收的里程碑即提交小而完整的变更，避免超大、不可审查提交。
- 协调 Agent 定期读取分支差异、测试和阶段记录。Agent 超出范围、连续失败、长时间无可复核产出或与
  主线漂移时，立即停止其写入，保存现有证据并由新 Agent 从明确检查点接管；接管不从头猜测或重复实现。
- 不把 Agent 的“已完成”当作事实。协调 Agent 必须复查 diff、测试输出、迁移、生成文件、原生配置和
  运行时证据；无法复现的结论退回执行队列。
- 共享合同、schema、认证根状态、商业账本和品牌母版由协调 Agent 指定唯一所有者；其他 Agent 只能通过
  已批准接口消费，禁止私自建立兼容层、复制状态或临时旁路。

### 7.2 独立审计门禁

- 审计 Agent 必须与被审计代码的作者分离，在干净集成提交上只读工作；不得边审计边修复，也不得审计
  自己刚完成的改动。发现项按 P0/P1/P2/P3 分类，给出文件位置、复现步骤、影响、证据和建议验证方式。
- P0/P1 未关闭时禁止合入或进入下一发布阶段；P2 必须在提交前修复或由协调 Agent 写明不影响1.0.0的
  证据与后续归属；P3 可进入收口记录，但不得掩盖真实用户缺陷。
- 修复由原执行 Agent或新的修复 Agent完成；审计 Agent随后在新提交上复验并明确关闭，不接受仅凭说明
  关闭问题。若修复改变共享接口，重新执行相关域与跨域审计。
- 审计至少覆盖：需求一致性、竞态/幂等、错误恢复、安全与隐私、数据库迁移/回滚、原生配置、依赖许可
  与隐私清单、性能和资源泄漏、可访问性、真实设备边界、StoreKit/微信外部状态、审核材料与归档一致性。
- 阶段审计之外，最终 TestFlight Build 和 App Store 提交前各做一次独立发布审计；最终审计以归档包、
  生产服务和 App Store Connect 反查为证据，不能只审查源码或单元测试。

## 八、生产、回滚与安全

- 数据库迁移先在副本演练并验证回滚；生产写入前留存备份证据。新增微信身份必须向后兼容现有账号，
  回滚代码时不删除已创建身份数据。
- 微信登录可通过服务端能力开关紧急隐藏入口，但最终 App Store 提交前必须按本需求真机验证为可用；
  若微信平台外部审核未完成，只能继续其他工作，不能用未审核配置冒充完成。
- 商业故障时禁止外部支付或人工伪造订单；可临时隐藏购买按钮并保持恢复/权益读取，修复后用更高 Build
  或服务端兼容修复恢复。
- 任何回滚不得破坏已确认订单、点数、学习数据、登录身份或账号删除请求；不可变账本和幂等迁移是
  回滚底线。
