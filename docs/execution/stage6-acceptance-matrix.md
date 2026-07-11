# 阶段 6 双端验收矩阵

状态：自动化、模拟器与等价设备验收通过；最终物理 iPhone / Android 各一台待人工执行。

## 页面与流程覆盖

| 范围 | RN 承载 | 主要验证 | 结果 |
| --- | --- | --- | --- |
| 主导航 | `/(tabs)`、`discover`、`profile` | 三 Tab、底部安全区、返回后状态 | 通过 |
| 五套题库 | `/question-bank/[bankId]` | listening、900、ATC、OPI、story 目录与进度 | 通过 |
| 学习流程 | `/question-bank/[bankId]/study/*` | choices、speaking、retell、答题卡、报告、退出确认 | 通过 |
| 本地学习能力 | `/annotations`、`/learning-records` | 标签、高亮、笔记、SQLite 重读、原题回跳 | 通过 |
| 内容功能 | `/content/[slug]` | vocab、radio、articles、resources、courses、hotspot、mock-exam、ai-report | 通过 |
| 认证演示 | `/auth/[slug]` | 启动、登录、注册、验证码、忘记密码、协议入口 | 通过 |
| 账户演示 | `/account/[slug]` | 资料、设置、同步、安全、凭证变更、注销、退出 Sheet | 通过 |
| 信息页 | `/info/[slug]` | 帮助、反馈、关于、协议、隐私 | 通过 |
| 系统状态 | `/state/[slug]` | 麦克风、通知入口、离线、失败恢复、维护、加载 | 通过 |
| 排除项 | Web 营销页、WebView | 源码扫描无 DOM、浏览器存储、iframe 或 WebView | 符合范围 |

## 设备与布局矩阵

| 项目 | Android API 36 模拟器 | iPhone 17 Pro / iOS 26.3 模拟器 | 结果 |
| --- | --- | --- | --- |
| Development Build 安装 | Debug APK 安装并重启运行 | Debug App 安装并重启运行 | 通过 |
| 宽度 | 360、375、390、430 逐项覆盖 | 402 逻辑宽度与安全区 | Android 四宽通过；iOS 通过 |
| 安全区 / 顶部栏 | 状态栏、返回栏、底部手势区 | Dynamic Island、顶部/底部安全区 | 通过 |
| 键盘 | 登录输入、按钮及协议仍可见 | `KeyboardAvoidingView` 原生承载 | Android 实测通过；iOS 页面渲染通过 |
| 滚动 / Bottom Sheet | 长列表、退出确认 Sheet | 长列表与内容 Sheet | 通过 |
| 返回 | 顶部返回、系统返回、学习退出确认 | 顶部返回、Root Stack 手势承载 | 通过；物理手势待终验 |
| 麦克风 | 权限已授权、录制/停止/回放 | 权限已授权、录音原生模块加载 | 通过；物理录音待终验 |
| 音频 | 真实资源播放到 19 秒结束，MediaSession PLAYING→STOPPED | 真实时长、播放与字幕已验证 | 通过；物理焦点待终验 |
| 切后台恢复 | 页面状态与本地记录保留 | SQLite 跨重启恢复 | 通过；物理中断待终验 |

## 自动化与构建门禁

| 门禁 | 结果 |
| --- | --- |
| `pnpm check` | 通过：TypeScript、ESLint、4 套 Jest / 6 个测试 |
| `pnpm doctor` | 19/19 通过 |
| `expo export --platform all` | 通过：Android、iOS、Web，18 条静态路由 |
| Android Debug 原生构建 | 通过：664 个任务，`BUILD SUCCESSFUL` |
| iOS Debug Simulator 原生构建 | 通过：`BUILD SUCCEEDED`；仅上游依赖 warning |
| Android 阶段 5 全路由深链 | 26 条全部可进入，无 Render Error |
| 360–430 代表路由巡检 | 6 条代表路由 × 4 宽度，无 Render Error |
| 题库资源对账 | 4947 卡；3678 个声明音频全部命中索引，缺失 0 |

## 高层战略一致性

- 保持 React Native + Expo + TypeScript 单一双端代码库，没有引入 WebView 或 Web UI 依赖。
- 学习页面通过 repository、resource resolver、learning store 等边界访问数据和平台能力。
- 本地 SQLite 只承担必要轻量持久化，不承诺完整离线学习或双向同步。
- 真实账号、Supabase、云同步、AI、支付、会员和通知发送均未越界实现。
- 设计稿目录仅作为只读参考；实现、证据与执行文档均写入 `icao-app`。

## 剩余终验

路线图明确要求使用一台物理 iPhone 和一台物理 Android 手机完成最终检查。当前系统没有检测到移动真机，因此下列项目不能用模拟器冒充完成：

1. 双端安装 Development Build，走一遍题库 → 目录 → 学习卡 → 音频 → 录音 → 报告。
2. 双端验证真实麦克风权限、听筒/扬声器或蓝牙音频焦点、锁屏/切后台与恢复。
3. iPhone 验证边缘返回手势；Android 验证实体/系统返回键。
4. 对物理屏幕安全区、键盘、Bottom Sheet 和底部导航各留一张终验证据。

上述终验不要求继续开发；若发现设备差异，再回到阶段 6 修复并重跑门禁。
