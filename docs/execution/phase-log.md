# 第一阶段执行记录

## 阶段 0：独立工程与双端环境

状态：验收通过

### 已完成

- 确认写入目标为 `/Users/zhouyide/Desktop/icao-app`，设计稿仓库只读。
- 在目标目录直接创建独立 Expo + React Native + TypeScript 工程，无嵌套目录。
- 安装 `expo-dev-client`，Development Build 作为正式开发能力边界。
- 建立 TypeScript、ESLint、Jest 和 React Native Testing Library 验证基础。
- 建立项目内 Android JDK / SDK 环境脚本，避免依赖未配置的全局 shell 变量。
- 安装并锁定 OpenJDK 17。React Native Gradle 插件要求 Java 17 toolchain；避免 JDK 21
  触发与 Gradle 9 不兼容的旧版 Foojay 自动下载解析器。
- 创建 `ICAO_API_36` ARM64 AVD，并完成 Android API 36 启动验证。
- iOS Development Build 编译成功，安装并启动于 iPhone 17 Pro / iOS 26.3 模拟器。
- Android Development Build 编译成功，APK 安装并启动于 API 36 模拟器。
- 保存双端启动证据到 `docs/execution/evidence/`。
- 创建 GitHub Private 仓库 `XIciA/icao-app`，配置 `origin` 并推送阶段检查点。

### 方案调整记录

- 工程由 Expo SDK 57 调整为 SDK 55。原因：SDK 57 官方要求 Xcode 26.4+，本机为
  Xcode 26.3；SDK 55 支持当前 Xcode，继续使用稳定 Expo + Development Build +
  CNG 路线。收益是阶段 0 可以完成 iOS 与 Android 本地构建验收；不改变产品或宏观架构。

### 验证结果

- `pnpm check`：通过（TypeScript、ESLint、Jest）。
- `expo export --platform all`：通过，iOS、Android 与 Web 生产 Bundle 均成功生成到临时目录。
- `pnpm doctor`：19/19 通过。
- iOS Debug Development Build：通过，0 error，3 个上游非阻塞 warning。
- Android Debug Development Build：通过，433 个任务完成；上游依赖存在非阻塞 deprecated warning。
- CNG 生成的 `ios/`、`android/` 已由 Git 忽略。
- 审查结论：带条件通过；远程仓库不影响本地工程与下一阶段，可进入阶段 1。

### 后续正式决策

- `com.anonymous.icao-app` 与 `com.anonymous.icaoapp` 仅为本地 Development Build 临时标识，
  不视为生产 Bundle ID / Package Name 决策；正式标识仍按架构决策留待用户确认。

### 明确未做

- 未开始页面批量复刻。
- 未接 Supabase、真实后端、AI、支付或云同步。
- 未修改只读设计稿仓库。

## 阶段 1：设计基础与导航壳

状态：验收通过

### 已完成

- 将设计稿 OKLCH 色彩转换为跨平台 RN sRGB 令牌，保留暖象牙、墨蓝、钴蓝、琥珀与危险红语义。
- 接入 Geist、Noto Serif SC 与 Geist Mono，保持标题、正文和数据字体分工。
- 建立文字、按钮、卡片、标签、输入、顶部栏、Bottom Sheet、页面容器、加载与异常状态组件。
- 将 Web 单体 `AppShell` 关系转换为 Expo Router Root Stack + 题库/发现/我的三个主 Tab。
- 建立全屏子页、居中顶部标题、返回按钮、iOS 手势承载和 Android 系统返回链路。
- 接入安全区、Tab 内容底部避让、键盘避让、根级加载与 Error Boundary。
- 建立页面对照矩阵与阶段归属：`docs/execution/phase1-page-matrix.md`。
- `react-native-svg` 已经双端增量重建并正式链接，Lucide 图标在双端正常渲染。

### 方案调整记录

- Noto Serif SC npm 包含全部字重，pnpm 在 Node 24 对 80MB 压缩包做完整性散列时触发
  `invalid array length`。改为从同一 npm 发布包只提取设计实际使用的 600 字重和字体许可证，
  资产写入 RN 工程；避免引入八个未使用字重，不改变字体设计决策。
- `expo-blur` 初次热更新需要重建原生壳。由于模糊只承担装饰效果，改用跨平台半透明表面；
  卡片、导航和弹层的颜色、边框、圆角、轻阴影与层次关系保持不变，减少无必要原生依赖。

### 验证结果

- `pnpm check`：通过（TypeScript、ESLint、Jest）。
- iOS Debug Development Build 增量重建：通过，0 error，3 个上游非阻塞 warning。
- Android Debug Development Build 增量重建：通过，453 个任务，19 秒。
- Android 题库/发现 Tab 切换、全屏子页、顶部返回与系统返回键：通过；返回后保持原 Tab。
- 360、375、390、430 宽度截图：无横向溢出、卡片裁切或底部导航遮挡。
- iOS Development Build 首次引导已完成，安全区、页面渲染和无干扰截图通过。
- 审查结论：通过。

### 明确未做

- 未提前实现完整业务页面或复制 Web DOM/CSS 实现。
- 未改变品牌色、字体分工、导航模式、卡片气质或 Lucide 图标体系。
- 未接真实登录、Supabase、AI、支付、云同步或离线资源系统。
- 未修改只读设计稿仓库。

## 阶段 2：真实学习垂直样例

状态：验收通过，可进入阶段 3

### 已完成

- 以只读设计稿快照接入统一五题库数据，听力题库对账为 4 个题组、631 张卡片。
- 建立可替换的数据仓库、资源解析、网络状态和 SQLite 本地学习存储边界。
- 跑通“题库入口 → 听力目录 → 学习卡 → 真实音频 → 选择作答/笔记 → 结束确认 → 学习报告 → 目录进度”闭环。
- 支持答题卡、上一题/下一题、参考答案、英文原文、中文译文、播放速度和中途退出报告。
- 支持学习进度、答案、笔记与最近 100 条学习记录的设备本地保存。
- 支持加载、无网络、音频加载失败、音频重试和数据加载失败状态。
- 资源仅在开发期从设计稿只读目录流式提供，不将约 560MB 音频写入安装包或 RN 仓库。
- 开发资源服务支持 HTTP HEAD、GET 和字节范围请求，兼容 Android Media3 与 iOS AVPlayer。

### 方案调整记录

- Python `http.server` 能被 Android 整文件播放，但不支持 iOS AVPlayer 所需的 Range 请求。
  改为项目内只读 Node 流式服务，返回 `206 Partial Content` 与 `Accept-Ranges: bytes`；
  iOS 随后正确加载并显示真实音频时长。
- SQLite 同一题组的连续写入增加串行队列，并在读取前等待待完成写入，避免快速笔记输入或
  紧接导航时旧状态覆盖新状态。
- Expo SQLite Web 构建需要把 `wasm` 加入 Metro 资产扩展，同时显式安装 `expo-asset`；
  修复后 iOS、Android、Web 三平台生产导出全部通过。

### 验证结果

- 数据快照 SHA-256：题库 `935e50d2a8aff3417666a6e687acab12f41044b09b23309e52fcc6e20761a4db`；
  音频索引 `63b93e01b660b0917247e6815b4fad6fde8e9511cf86342c7cbfdd572cee8df5`。
- `pnpm check`：通过（TypeScript、ESLint、2 个 Jest 套件 / 3 个测试）。
- `pnpm doctor`：19/19 通过。
- `expo export --platform all`：通过，含 11 条静态路由与 SQLite Web worker/WASM。
- iOS Debug Development Build：通过，ExpoAudio、ExpoNetwork、ExpoSQLite 已原生链接。
- Android Debug Development Build：通过，453 个任务完成。
- Android：真实 19 秒音频完整播放，MediaSession 状态从 PLAYING 到 STOPPED；正确答案、
  1/245 报告、目录进度与保存笔记回看通过；切到后台后播放器自动进入 PAUSED，返回后页面保留。
- iOS：真实音频正确显示 20 秒/30 秒时长；终止并重启 App 后从第 3 张未学卡恢复，证明
  SQLite 访问记录跨重启保留。
- 证据位于 `docs/execution/evidence/stage2/`。

### 明确未做

- 未接离线下载、真实账号、云同步、真实 AI、会员或支付。
- 未把音频批量复制进 RN 工程或安装包。
- 未修改、补写或重构题库内容。
- 未修改只读设计稿仓库。

## 阶段 3：五套题库完整复刻

状态：本地核心验收通过，iOS 录音交互洁净截图待最终人工确认

### 已完成

- 将题库主入口扩展为听力、900 句、陆空通话、OPI 与故事复诵五套可练习题库。
- 统一目录、分类、题组、学习卡、答题卡、导航、报告与本地存储架构，没有按题库复制五套页面。
- 支持 choices、speaking、retell 三类交互；听力保留四选一与正确答案，其他题库接入本地口语/复述录音。
- 接入麦克风权限、允许/拒绝、录制、停止、临时本地回放、重新录音与保存失败状态；不上传录音。
- 接入题目标签、逐词三色高亮、笔记、上下文查词入口及无真实 AI 的明确占位承载。
- 接入“我的标注”，汇总五题库标签、高亮和笔记，并可跳回原题。
- 接入“学习记录”，展示最近 100 条本地报告、进度、时长和结束原因。
- OPI 保持生成语音方向，明确显示生成语音预留，不伪造或捆绑本地问题音频。
- Android 系统返回键和 iOS 返回手势统一进入结束学习确认，不会绕过报告与保存链路。

### 数据对账

- 五题库卡片数依次为 631、900、1851、1269、296，总计 4947。
- 3678 张带音频路径的卡片全部能在规范音频索引中找到，缺失为 0；索引共 3894 个资源条目。
- OPI 1269 卡按设计无捆绑问题音频，其余规范资源继续由只读 Range 服务提供。

### 验证结果

- `pnpm check`：通过（TypeScript、ESLint、2 个 Jest 套件 / 4 个测试）。
- `pnpm doctor`：19/19 通过；`expo export --platform all`：通过，包含 13 条静态路由。
- Android：五题库入口、三类学习卡、真实音频、录音权限/录制/停止/回放/重录通过。
- Android：900 句首卡保存 14 秒录音状态、“好题”标签与 `Maintaining` 逐词高亮后，SQLite 重读一致。
- Android：“我的标注”正确汇总听力笔记与 900 句标签/高亮；学习记录正确展示听力和 900 句报告。
- Android：学习页系统返回键进入结束确认，继续学习与结束报告路径均可用。
- iOS：五题库入口与 900 句 speaking 学习页已渲染，5 秒真实音频加载成功；麦克风权限已通过模拟器隐私命令授权。
- 阶段证据位于 `docs/execution/evidence/stage3/`。

### 待最终人工确认

- iOS 模拟器首次通过自定义 `feizhuicao` scheme 深链时出现系统“在飞猪 ICAO 中打开？”确认；
  代码、页面和音频已在弹层下方正常渲染。最终验收时点击一次“打开”，再完成录音按钮交互和洁净截图。

### 明确未做

- 未接真实 AI 查词、口语转写或纠错；当前仅复刻入口、状态和可替换承载。
- 未接云端标注、学习记录或录音同步。
- 未补写题库文本，未复制旧音频目录，未把音频打入安装包。
- 未修改只读设计稿仓库。

## 阶段 4：主应用与内容页面

状态：本地核心验收通过，可进入阶段 5

### 已完成

- 将发现 Tab 从占位壳替换为功能、资源、课程三组真实入口，保持当前 App 信息架构。
- 完成单词学习的词书、词表、学习卡、掌握标记、随堂测试与完成页演示流程。
- 完成随身听的听力/900 句/故事复诵题库切换、真实音频、字幕模式、上一首/下一首和播放列表。
- 完成优质文章与资源分享的真实卡片、图片、分类信息和 Bottom Sheet 详情阅读。
- 完成 OPI 热点每日资讯、考点详情和跳转 OPI 题库学习的闭环。
- 完成 App 内体系课程、课程优势与训练内容展示；未迁移独立桌面营销页。
- 完成 AI 模考的类型/板块设置、三题演示流程与固定 Mock 学习报告。
- 将“我的”Tab 替换为资料卡、本地学习统计、学习记录、我的标注、设置与联系入口。
- 新增内容路由 `/content/[slug]`，全部子页使用 Root Stack 返回关系，没有复用 Web DOM、CSS 或浏览器 API。
- 从只读设计稿生成 800×500 的压缩内容图副本写入 RN 资产目录，原始设计资产保持不变。

### 验证结果

- `pnpm check`：通过（TypeScript、ESLint、3 个 Jest 套件 / 5 个测试）。
- `pnpm doctor`：19/19 通过；`expo export --platform all`：通过，包含 14 条静态路由。
- Android：发现主页与 vocab、radio、articles、resources、courses、hotspot、mock-exam、ai-report 八条路由逐项无 Render Error。
- Android：单词学习可进入词表与 `maintain` 学习卡；文章详情 Bottom Sheet 可打开并关闭。
- Android：随身听加载真实 19 秒听力音频和中英文字幕；播放列表与三题库切换可用。
- Android：Mock 模考从设置进入三题流程并生成固定报告；报告明确标记为演示数据。
- Android：“我的”统计读取真实本地学习记录，学习记录和我的标注入口返回路径正确。
- iOS：优质文章图片/列表与随身听真实音频、三题库切换和双语字幕完成无弹层渲染。
- 证据位于 `docs/execution/evidence/stage4/`。

### 明确未做

- 未接真实 AI 模考、评分或个性化建议。
- 未接会员、课程购买、咨询提交或支付。
- 未迁移桌面 `/curriculum` 营销页。
- 未修改只读设计稿仓库。

## 阶段 5：认证、账户、信息与系统状态

状态：本地核心验收通过，可进入阶段 6

### 已完成

- 完成启动欢迎、邮箱登录、注册、手机验证码登录和忘记密码页面；表单校验、协议入口与完成反馈可操作。
- 所有认证动作均明确标注为演示，不发送验证码、不创建账户、不伪装真实服务结果。
- 完成个人资料、编辑资料、设置、学习同步、账户安全、更换手机/邮箱/密码、注销与退出确认。
- 学习同步、资料保存、凭证变更、注销和退出均提供完整交互，但明确保持本机演示边界。
- 完成帮助问答、意见反馈、关于、用户协议和隐私政策；反馈不会发送到服务器。
- 完成麦克风权限真实读取/请求与系统设置入口；iOS、Android 均显示当前已授权状态。
- 完成通知能力未接入说明及系统设置入口，没有引入或伪造通知发送。
- 完成无网络、加载失败/重试恢复、系统维护和全局加载状态。
- 新增 `/auth/[slug]`、`/account/[slug]`、`/info/[slug]`、`/state/[slug]` 四组动态 Root Stack 路由，并从“我的”页接通资料、设置和帮助入口。

### 验证结果

- `pnpm check`：通过（TypeScript、ESLint、4 个 Jest 套件 / 6 个测试）。
- `pnpm doctor`：19/19 通过。
- `expo export --platform all`：通过，Android、iOS、Web 均成功，包含 18 条静态路由。
- Android：26 条阶段 5 路由通过深链逐项巡检，全部可进入且无 Render Error。
- Android：设置、认证登录与麦克风真实授权状态完成视觉检查；应用内按钮可打开系统设置并返回 App。
- iOS：设置、认证登录与麦克风真实授权状态完成无弹层渲染和视觉检查；系统设置 App 可启动并返回 Development Build。
- 证据位于 `docs/execution/evidence/stage5/`。

### 明确未做

- 未接真实手机号、邮箱、微信或 Apple 登录，未发送真实验证码或重置邮件。
- 未接 Supabase Auth、云同步、云端资料保存、真实账户注销或反馈提交。
- 未接通知模块或发送通知；当前仅保留未来系统权限入口。
- 未修改只读设计稿仓库。

## 阶段 6：双端完整验收

状态：自动化、双端模拟器与等价设备通过；物理 iPhone / Android 终验待人工完成

### 已完成

- 建立 `stage6-acceptance-matrix.md`，覆盖全部页面族、核心流程、状态、设备、构建和战略边界。
- Android 对 6 条代表路由完成 360、375、390、430 四种逻辑宽度巡检，无 Render Error。
- 四种宽度的设置页均无标题、卡片、开关、按钮裁切或横向溢出。
- Android 登录页键盘开启后，输入、主按钮、恢复入口和协议仍可见；退出确认 Bottom Sheet 安全区与操作完整。
- Android 真实音频进入 PLAYING 并播放至 19 秒结束后 STOPPED；返回 App 页面状态正常。
- 重新执行并安装 Android / iOS Debug Development Build，双端听力目录均在新构建上正常渲染。
- 源码扫描确认没有 DOM、localStorage、iframe 或 WebView 依赖。
- 对照总战略与 ADR 复查：RN/Expo/TypeScript、本地轻量持久化、未来 Supabase/对象存储边界保持一致。

### 验证结果

- `pnpm check`：4 个 Jest 套件 / 6 个测试及 TypeScript、ESLint 全部通过。
- `pnpm doctor`：19/19 通过；三平台导出成功，18 条静态路由。
- Android Debug：`BUILD SUCCESSFUL`，664 个任务；新 APK 安装后通过冒烟验证。
- iOS Debug Simulator：`BUILD SUCCEEDED`；新 App 安装后通过冒烟验证。
- 完整结果与剩余终验位于 `docs/execution/stage6-acceptance-matrix.md`，证据位于 `docs/execution/evidence/stage6/`。

### 剩余终验

- 当前未检测到物理 iPhone 或 Android 手机。路线图要求的双物理真机核心链路、真实音频焦点、中断恢复和手势终验必须由用户连接设备后完成。
- 该限制不影响当前代码、自动化、模拟器或原生构建结论，但在真机完成前阶段 6 不能标记为无条件完成。

## 阶段 7：收口

状态：工程收口完成；等待阶段 6 双物理真机终验后更新为无条件完成

### 已完成

- 生成 `docs/execution/closeout.md`，记录仓库、版本、构建、页面、数据、设备与验证结果。
- 汇总阶段 0–6 实际完成项、明确未做、剩余风险与人工终验步骤。
- 记录第二阶段 Auth、数据、资源、同步、AI 与商业化的接入边界。
- 复查 Git 提交链、远程 Private 仓库、设计稿只读边界与高层战略一致性。

### 收口结论

- 当前工程可以继续进行第二阶段技术接入，不需要推翻第一阶段页面、学习流程或数据访问边界。
- 第一阶段唯一未关闭项是路线图要求的物理 iPhone / Android 双端终验；完成后只需补充证据并更新状态。

### 后续平台验收策略

- 经确认，后续产品开发和真机验收优先聚焦 iOS；物理 Android 终验暂停，待核心产品稳定后集中执行。
- 此期间 Android 仍保留构建和基础启动门禁；涉及录音、权限、推送、支付、文件或后台任务等原生能力的重大改动，必须补跑 Android 冒烟检查。
- 该策略不改变 React Native 单代码库与 Android 发布范围，仅调整验收节奏。

## 第二阶段：邀请码账号登录

状态：本地实现与自动化验证完成；ECS 数据备份、迁移、邀请码首发与双端真机验收待执行。

- 认证入口从邮箱密码切换为专属邀请码；同一邀请码继续映射同一 Supabase `userId`，学习同步、AI 与会话安全边界复用既有实现。
- 已移除公开注册、邮箱、密码、手机号、邮件回调和找回入口；账户名称来自邀请码前四个汉字。
- 详细变更、验证结果、备份/清理/部署顺序与待补证据见 `docs/workstreams/invite-account-login/phase-log.md`。
