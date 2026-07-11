# 阶段 1 页面与导航对照矩阵

> 参考源：`icao设计稿` 的 `app-shell.tsx`、各流程组件、技术盘点与 UI 规范。
> 本文件只记录 RN 承载关系；阶段 1 不提前实现完整业务页。

## 导航层级

| 设计稿关系 | RN 路由承载 | 阶段 1 状态 | 后续阶段 |
| --- | --- | --- | --- |
| 题库主 Tab | `/(tabs)` | 原生 Tab 壳完成 | 阶段 2-3 接真实五题库 |
| 发现主 Tab | `/(tabs)/discover` | 原生 Tab 壳完成 | 阶段 5 复刻功能、资源、课程入口 |
| 我的主 Tab | `/(tabs)/profile` | 原生 Tab 壳完成 | 阶段 5 复刻账户与记录入口 |
| 普通全屏子页 | `/detail/[slug]` | Stack、顶部栏、返回手势完成 | 对应业务阶段替换占位内容 |
| 沉浸式学习/播放器/模考 | Root Stack 全屏页 | 导航承载关系已预留 | 阶段 2、4、5 实现 |
| Bottom Sheet / 确认层 | `BottomSheet` 共享组件 | 跨平台半透明遮罩与安全区完成 | 各业务页面复用 |

## 页面清单与阶段归属

| 模块 | 页面/状态 | 当前承载 | 计划阶段 |
| --- | --- | --- | --- |
| 题库 | 五题库入口、目录、学习卡、学习报告 | Tab + Root Stack | 2-3 |
| 学习能力 | 音频、选择题、跟读/录音、故事复诵 | Root Stack | 2-4 |
| 发现 | 单词、文章、资源、体系课程、随身听、AI 模考、AI 报告、OPI 热点 | Tab + Root Stack | 5 |
| 我的 | 我的标注、学习记录 | Tab + Root Stack | 4-5 |
| 认证 | 启动、登录、注册、手机验证码、忘记密码 | Root Stack | 5 |
| 账户 | 资料、编辑资料、设置、同步、安全、换手机/邮箱/密码、注销、退出确认 | Root Stack + Sheet | 5 |
| 信息 | 协议、隐私、帮助、反馈、关于 | Root Stack | 5 |
| 状态 | 麦克风权限/拒绝、通知权限、无网络、加载失败、维护、全局加载 | `CenteredState` / `GlobalLoadingScreen` | 4-5 |
| Web 专属 | PhoneFrame、iframe、桌面营销页 `/curriculum` | 不迁移 | 明确排除 |

## 共享视觉基础

- `src/theme/tokens.ts`：OKLCH 到 RN sRGB 的固定转换、间距、圆角、阴影、动效语义。
- `src/components/ui/`：文字、按钮、卡片、标签、输入、页面容器、Bottom Sheet。
- `src/components/navigation/`：顶部返回栏与三项悬浮胶囊导航。
- `src/components/states/`：全局加载、空/异常/权限状态容器。
- 字体：Geist 正文、Noto Serif SC 标题、Geist Mono 数据；未引入第四套字体。
- 图标：Lucide React Native + `react-native-svg`，与设计稿图标体系一致。

## 视觉验收方法

1. 以 375×812 为定稿基准，在 Android 模拟器使用相同逻辑尺寸截图。
2. 补查 360、390、430 宽度；验证标题换行、卡片内容、Tab 胶囊、安全区与正文避让。
3. iOS 与 Android 均使用 Development Build；每次新增原生模块后重建，不用 Expo Go 代替。
4. 子页逐项验证顶部返回按钮、iOS 返回手势承载和 Android 系统返回键。
5. 视觉证据写入 `docs/execution/evidence/`，不写入只读设计仓库。

## 阶段 1 证据

- `phase1-width-360.png`
- `phase1-width-375.png`
- `phase1-width-390.png`
- `phase1-width-430.png`
- `phase1-android-navigation-shell.png`
- `phase1-android-discover-tab.png`
- `phase1-android-fullscreen-detail.png`
- `phase1-ios-navigation-shell-onboarding.png`（Development Build 首次引导遮罩仍在，底层页面已渲染）
