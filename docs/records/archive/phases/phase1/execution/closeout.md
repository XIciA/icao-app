# 历史归档：第一阶段收口报告

状态：工程、页面、自动化、双端模拟器与原生构建已收口；双物理真机终验待完成。

收口日期：2026-07-11  
代码仓库：`/Users/zhouyide/Desktop/icao-app`  
远程仓库：`XIciA/icao-app`（Private）  
自动验收基线：`c8df231`（`test: complete automated dual-platform acceptance`）

## 1. 阶段成果

- 建立独立 React Native + Expo + TypeScript 工程，使用 Development Build 支持 iOS / Android。
- 原生复刻题库、发现、我的三项主导航，以及需求范围内的页面、流程、弹层与状态。
- 完成听力、900 句、陆空通话、OPI、故事复诵五套题库，共 4947 张学习卡。
- 完成真实音频、选择答题、口语/复述录音、逐词标注、笔记、报告、学习记录和 SQLite 本地恢复。
- 完成单词、随身听、文章、资源、课程、OPI 热点和明确标注为 Mock 的 AI 模考流程。
- 完成认证、账户、帮助、反馈、协议、隐私、权限、离线、失败、维护和加载状态的可操作演示。
- 保留 repository、resource resolver、learning store 等可替换边界，后续可以接入 Supabase Auth、业务 API、Storage 和 AI，而不推翻页面流程。

## 2. 页面与数据覆盖

- 18 条 Expo 静态路由，另由 4 组动态路由承载认证、账户、信息与状态页面族。
- 阶段 5 的 26 条动态页面深链全部可进入，无 Render Error。
- 题库卡片：631 + 900 + 1851 + 1269 + 296 = 4947。
- 声明音频的 3678 张卡全部命中规范索引，缺失为 0；索引共 3894 条资源。
- 学习进度、答案、标签、高亮、笔记和最近 100 条记录通过 SQLite 保存在本机。

完整页面对照见 `phase1-page-matrix.md`，最终验收矩阵见 `stage6-acceptance-matrix.md`。

## 3. 验证结果

| 验证项 | 结果 |
| --- | --- |
| TypeScript / ESLint | 通过 |
| Jest | 4 套 / 6 个测试通过 |
| Expo Doctor | 19/19 通过 |
| Android / iOS / Web 导出 | 通过，18 条静态路由 |
| Android Debug 构建 | `BUILD SUCCESSFUL`，664 个任务 |
| iOS Debug Simulator 构建 | `BUILD SUCCEEDED` |
| Android API 36 模拟器 | 页面、音频、录音、权限、返回、键盘、Sheet、后台与恢复通过 |
| iPhone 17 Pro / iOS 26.3 模拟器 | 页面、安全区、音频、权限、SQLite 恢复与新构建冒烟通过 |
| 360 / 375 / 390 / 430 宽度 | 代表路由与设置页通过，无横向溢出或裁切 |

证据按阶段保存在 `docs/records/evidence/execution/evidence/stage2/` 至 `stage6/`。

## 4. 明确未做

- 未接真实手机号、邮箱、微信、Apple 或匿名游客登录；未接 Supabase Auth。
- 未接云端业务表、跨设备同步、冲突解决、Supabase Storage 或正式资源 CDN。
- 未接真实 AI 查词、口语转写/纠错、模考评分或个性化建议。
- 未接会员、课程购买、支付、咨询提交、推送或商业化能力。
- 未建设题库/音频包下载、完整离线学习或复杂双向离线同步。
- 未迁移 Web DOM、CSS、浏览器 API、WebView 或独立桌面营销页 `/curriculum`。
- 未把约 560 MB 音频复制到安装包或 RN 仓库；开发期仍依赖只读 Range 资源服务。
- 未确定生产 Bundle ID / Package Name、证书、上线主体和商店资料。

## 5. 剩余风险与人工终验

当前未检测到物理移动设备。路线图要求的一台 iPhone 与一台 Android 手机终验仍是第一阶段唯一未关闭的验收项：

1. 安装 Development Build，完成题库 → 学习卡 → 音频 → 录音 → 报告核心链路。
2. 验证真实麦克风、听筒/扬声器/蓝牙音频焦点、锁屏/切后台和恢复。
3. 验证 iOS 边缘返回、Android 系统返回、真实安全区、键盘、Sheet 和底部导航。
4. 每端保留至少一组核心链路与权限截图；若有设备差异，回到阶段 6 修复后重跑门禁。

模拟器验证、原生构建和当前代码均已完成；上述步骤不要求先做新的业务开发。

### 平台验收节奏

经产品负责人确认，后续先集中 iOS 真机的产品开发、交互与视觉验收；物理 Android 终验暂停至核心产品稳定后集中执行。Android 仍保留构建和基础启动门禁；每次涉及录音、权限、推送、支付、文件访问或后台任务等原生能力的重大变更，必须补跑 Android 冒烟检查。该调整不改变 React Native + Expo 单代码库或 Android 发布范围。

## 6. 第二阶段接入边界

- 认证：在现有 auth/account 页面后接 Supabase Auth adapter，页面不得直接依赖 SDK。
- 数据：替换或扩展 repository / learning store，保留当前题库、进度、标注、报告语义。
- 资源：将开发期路径解析替换为对象存储 object key / 签名访问，不在业务表固化域名 URL。
- 同步：以服务端权威数据和显式冲突策略扩展本地轻量持久化，不把现有 SQLite 误当完整离线系统。
- AI：经产品 API / AI Gateway 接入，保留当前加载、失败、重试和“未接能力”状态，不在页面直连模型供应商。
- 商业化：会员、支付、推送和商店能力必须另行选型并补充原生、合规与真机验收。

## 7. 收口结论

第一阶段代码与文档已经具备可审查、可继续开发和可接入第二阶段的结构。当前结论为“工程收口完成、真机终验待完成”；双物理设备验收通过后，可将阶段 6 与本报告状态更新为无条件完成。
