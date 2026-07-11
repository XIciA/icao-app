# 阶段 6 双端验收矩阵

状态：自动化、模拟器与物理 iPhone 核心链路验收通过；物理 Android 终验待执行。

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
| 返回 | 顶部返回、系统返回、学习退出确认 | 顶部返回、Root Stack 手势承载 | 通过；物理 iPhone 深链进入题库后顶部返回已验证 |
| 麦克风 | 权限已授权、录制/停止/回放 | 权限已授权、录音原生模块加载 | 通过；物理 iPhone 已完成录制、停止与本地回放 |
| 音频 | 真实资源播放到 19 秒结束，MediaSession PLAYING→STOPPED | 真实时长、播放与字幕已验证 | 通过；物理焦点待终验 |
| 切后台恢复 | 页面状态与本地记录保留 | SQLite 跨重启恢复 | 通过；物理中断待终验 |

## 物理 iPhone 终验（2026-07-11）

设备：OOMG（iPhone 17 Pro Max，iOS 26.5.1），Development Build，`com.anonymous.icao-app`。

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 安装与连接 | 通过 | Personal Team 签名、信任开发者证书、开发者模式与本地网络权限均已完成；可连接 Metro。 |
| 900 句学习链路 | 通过 | 从听力题库进入 900 句；题目、真实题目音频、下一题等其余学习功能正常。 |
| 顶部返回 | 通过 | 修复深链直接进入学习页时根导航没有历史记录而触发 `GO_BACK` 红屏的问题；无历史时回到主 Tab。 |
| 麦克风权限 | 通过 | 系统授权后可开始、停止、重新录制。 |
| 录音文件与回放 | 通过 | 修复后录制约 3 秒，本地回放可听见声音。 |

### 真机录音问题与修复

- 初始 AAC `.m4a` 录制文件虽然约 56 KB，但实机导出的音频轨只有约 0.091 秒与数十字节有效音频，故播放按钮会瞬时从暂停态回到播放态。
- `SpeakingPracticePanel` 改用 iOS 单声道 PCM/WAV（16 kHz、16-bit），并优先选择内置麦克风；实机复测已能够正常播放。
- 该调整仅影响本地练习录音的 iOS 编码，未引入上传、AI、云同步或新的后端能力。

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

路线图明确要求使用一台物理 iPhone 和一台物理 Android 手机完成最终检查。物理 iPhone 已完成上述核心链路；物理 Android 仍需完成下列终验，不能由模拟器冒充：

1. Android 安装 Development Build，走一遍题库 → 目录 → 学习卡 → 音频 → 录音 → 报告。
2. Android 验证真实麦克风权限、扬声器或蓝牙音频焦点、锁屏/切后台与恢复。
3. Android 验证实体/系统返回键；iPhone 边缘返回手势及两端实际屏幕安全区、键盘、Bottom Sheet、底部导航仍可补充留证。
4. 每端保留至少一组核心链路与权限截图。

上述终验不要求继续开发；若发现设备差异，再回到阶段 6 修复并重跑门禁。

## 后续平台验收策略

经产品负责人确认，后续优先以 iOS 作为第一阶段产品开发、交互调优和真机验收平台；物理 Android 终验暂停至核心产品稳定后集中执行。该调整不改变 React Native + Expo 单代码库决策，也不将 Android 从发布范围移除。

- 日常迭代：以 iOS 真机为准完成产品、视觉与核心链路验收。
- Android 最低门禁：每次引入或显著调整录音、权限、推送、支付、文件访问、后台任务等原生能力时，必须完成 Android 构建和基础启动/冒烟检查。
- 集中回归：核心产品稳定后，恢复物理 Android 全链路验收并集中修复平台兼容与布局小问题；通过后再关闭阶段 6 的 Android 终验项。
