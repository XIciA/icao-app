# RN 与 Web 手机端 1:1 对照复刻技术盘点

状态：已完成只读盘点，等待随方案与路线图确认  
盘点日期：2026-07-11

## 1. 盘点范围

本盘点只读检查：

- Web 设计稿：`/Users/zhouyide/Desktop/icao设计稿`
- RN 工程：`/Users/zhouyide/Desktop/icao-app`
- 现有执行文档、页面路由、共享组件、主要流程组件、截图证据与本机模拟器状态

未启动 Web 浏览器批量采集，未运行 RN 页面改造，未修改设计稿仓库。

## 2. 基线状态

### 2.1 Web 设计稿

- 分支：`main`
- 当前提交：`e976cec9f90aa0d71a568a57923b7ec14ab6ba16`
- 盘点时工作树：干净
- 技术：Next.js 16.2.6、React 19、Tailwind CSS、Lucide、Framer Motion
- 预览方式：顶层页面使用 `PhoneFrame`，内部 iframe 为 375 × 812，并通过 `?embed=1` 渲染实际手机内容
- 顶层页面：`/`、`/auth`、`/account`、`/info`、`/state`、`/curriculum`
- 其中 `/curriculum` 为明确排除的桌面营销页
- `components/` 下有 82 个 TSX 文件，页面与交互大量由本地状态机承载

### 2.2 RN 工程

- 分支：`main`
- HEAD：`65e3ec35aeb558b1c1e5575e78acfd84a2e79613`
- 与远程：`main` 在已提交基线上与 `origin/main` 同步
- 技术：Expo SDK 55、React Native 0.83.6、React 19.2、Expo Router、TypeScript、expo-audio、expo-sqlite
- RN 页面路由文件：15 个（不含测试）
- `src/components` 与 `src/features` 下有 34 个 TSX 文件
- 小流程启动时，已提交基线与 `origin/main` 同步；工作树仅有一个无关的未跟踪战略目录 `战略/第二阶段-真实资源账号同步AI与商业化/`，后续执行必须保持不修改

## 3. Web 真实页面模型

Web 不是传统“一条 URL 对应一个页面”的结构，而是“预览路由 + Flow 状态机 + AppShell 覆盖层”：

- `AppShell` 负责认证状态、三个主 Tab、详情页、题库、学习记录、我的标注、账户/信息覆盖层、随身听和模考；
- `AuthFlow` 明确包含 splash、login、register、phone、forgot、agreement、privacy 七个状态；
- `AccountFlow` 包含 profile、edit、settings、sync、security、phone、email、password、delete 九个状态，并有 logout dialog；
- `InfoFlow` 包含 hub、agreement、privacy、help、feedback、about 六个状态；
- `StateFlow` 包含 hub、mic、micDenied、notification、noNetwork、loadFailed、maintenance、loading 八个状态；
- 题库学习页还包含工具选择、查词、标签、答题卡、退出确认、音频/录音和 AI 示例的多阶段状态。

因此仅按六个顶层 URL 或 RN 路由数量验收，会系统性漏掉大量真实用户可见状态。

## 4. RN 已有能力

### 4.1 工程和平台能力

- Expo Development Build 已在 iOS / Android 构建和运行；
- Expo Router 已建立三个主 Tab 和全屏子页关系；
- 已接入安全区、字体、状态栏、原生返回、音频、录音、权限和 SQLite；
- `pnpm check` 已有 TypeScript、ESLint 和 Jest 门禁；
- 现有题库数据共 4947 张卡，声明音频已完成索引对账；
- iPhone 真机已验证题库、音频、录音与回放修复；物理 Android 集中终验仍暂缓。

这些能力应保留，视觉复刻不能退回 Web mock 或牺牲原生可靠性。

### 4.2 页面承载

RN 已有：

- 题库、发现、我的三个 Tab；
- 五题库目录、学习卡、音频、录音、答题、报告、标注、学习记录；
- 单词、随身听、文章、资源、课程、热点、模考和报告；
- 认证、账户、信息和系统状态动态路由；
- TopBar、FloatingTabBar、Card、Button、Tag、TextField、BottomSheet 等共享组件。

现有功能承载覆盖较广，主要问题不是“没有 RN 页面”，而是“一个 RN Screen 合并承担多个 Web 页面/状态，且没有逐状态视觉金标准”。

## 5. 已确认差距

### 5.1 验收体系差距

- 现有 `phase1-page-matrix.md` 记录的是导航承载和阶段归属，不是全量状态清单；
- 现有 66 个证据文件主要证明构建、路由、功能和代表画面，缺少同状态 Web 截图、叠加差异图和逐项关闭结论；
- 阶段 6 的宽度验证只覆盖代表路由，不等价于全部页面状态视觉一致；
- 当前没有 `stateId`、操作轨迹、基线提交和 RN 对应状态组成的机器可读 manifest。

### 5.2 主导航与题库首页

Web `HomeView` 包含：

- 左上用户入口；
- 课程目标选择器及展开列表；
- 课程选择后动态筛选题库模块；
- 渐变背景和两组环境光；
- 四或五个模块的状态标签、描述与统计。

RN 当前题库 Tab 使用通用 `TabPlaceholderScreen` 和固定五题库数组。它覆盖题库入口，但没有等价的课程选择器、筛选状态与完全相同的页面结构。这是用户截图中最直观的差距之一。

### 5.3 随身听

Web `RadioPlayerView` 包含题库下拉、真实进度、播放/暂停、上一首/下一首、播放模式、速度、字幕模式和底部播放列表抽屉等状态。

RN `RadioPlayerScreen` 已有真实音频、题库切换、上一/下一、字幕与列表，但当前视觉结构使用顶部平铺题库 Tab 和页面内列表，未形成与 Web 相同的播放器布局、下拉与底部抽屉状态。

### 5.4 单词流程

Web `VocabTestView` 由多个独立子页面构成：词书选择、词书详情、词表、学习、测试和完成状态。

RN `VocabScreen` 已承载对应学习流程，但集中在单个 Screen 内以本地状态切换，尚无逐状态截图证明其页面结构、动效、控件与返回关系与 Web 一致。

### 5.5 题库学习页

Web `card-study-view.tsx` 是高状态密度页面，包含：

- 工具选择 Popover；
- 查词 UI；
- 标签面板；
- 答题卡 Sheet；
- 退出确认 Dialog；
- 音频、录音、翻卡/答案、AI 示例及多种失败/重试状态。

RN 学习页现由 `QuestionBankStudyScreen` 和 `useStudySession` 统一承载五大题库；选择、录音、复诵、工作台和反馈差异通过集中策略配置。后续验收仍需逐状态对照 Web，不能只按“学习链路可完成”判定。

### 5.6 认证、账户、信息与状态

Web 四组独立 Flow 明确列出至少 30 个基础页面/状态，另含表单校验与 Dialog。RN 使用 `AuthScreen`、`AccountScreen`、`InfoScreen`、`SystemStateScreen` 四个合并式组件按 slug 渲染。

RN 的路由覆盖已通过，但现有证据只抽查登录、设置和麦克风等代表页面，不能证明全部 Web Flow 状态和返回路径已经 1:1。

## 6. 视觉基础盘点

### 已有

- Web UI 规范和 RN token 均采用暖白背景、墨蓝前景、钴蓝主色、琥珀强调和危险红；
- RN 已接入 Geist、Geist Mono、Noto Serif SC 600；
- RN 已定义间距、圆角、阴影、字体角色与基础动效；
- 两端均使用 Lucide 图标体系。

### 缺口

- token 对应关系没有自动对账或逐组件视觉标定；
- Web 使用透明卡片、ring、backdrop blur、渐变/环境光等组合，RN 当前组件多为简化的实体背景与原生阴影；
- 字体大小、行高、换行、卡片最小高度、固定底栏和弹层高度缺少逐状态几何对照；
- 当前 RN 截图分辨率来自 402 宽 iOS 模拟器或 Android 1080 × 2400，尚未建立与 Web 375 × 812 内容画布统一裁切和缩放的规则。

## 7. 截图与设备条件

- Web 已具备稳定 `PhoneFrame` iframe，适合从 iframe 内容层自动截图；
- 当前 iOS 26.3 原有设备主要为 iPhone 17 系列和 iPhone 16e；小流程阶段 0 已创建并启动 iPhone 11 Pro `ICAO_375_812` 对照模拟器；
- 用户已明确本 workstream 不执行任何 Android 模拟器测试；
- 阶段 0 已建立基于隔离 Chrome/CDP 的 Web 状态采集脚本，可从 PhoneFrame iframe 生成 375 × 812 PNG；RN 同状态采集与差异图仍待后续阶段完成。

## 8. 风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Web 状态依赖 localStorage 或临时内存 | 截图不可重复 | 为每个状态记录前置条件和重放步骤；必要时增加只读采集 fixture |
| 原生数据已比 Web mock 更真实 | 视觉状态可能不一致 | 保留真实能力，使用确定 fixture 复现相同可见结果 |
| 浏览器和 RN 字体/阴影不同 | 原始像素差大量误报 | 使用结构、令牌、叠加和人工视觉门，不依赖单一像素百分比 |
| 页面状态数量显著高于路由数 | 工作量被低估 | 先完成全量状态清单，再冻结路线图阶段范围 |
| 当前 RN 工作树不干净 | 容易覆盖用户改动 | 执行前记录初始 diff，只修改当前阶段目标文件，逐阶段审查 |
| Web 基线继续变化 | 金标准失效 | 每张图绑定 Web 提交；基线变化需显式重采集受影响状态 |
| 真实权限/音频/录音难以固定到任意帧 | 自动截图不稳定 | 分开验收 App 自有 UI 与系统弹窗；动态能力保留真机操作证据 |

## 9. 盘点结论

当前 RN 具备继续复刻所需的原生工程、数据和设备能力，不需要重建项目。主要缺口集中在：

1. 没有全量页面状态基线；
2. 没有 Web/RN 同状态截图和差异关闭机制；
3. RN 合并式 Screen 与 Web 多状态 Flow 在视觉结构和交互细节上存在实际差距；
4. 现有阶段“工程收口”不能替代本 workstream 的“视觉与交互 1:1 收口”。

技术方案可行，建议进入路线图确认；执行时应先做基线与工具，不应直接开始批量改页面。
