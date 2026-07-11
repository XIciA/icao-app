# Web / RN 页面状态对照矩阵

状态：阶段 9 已收口

唯一 Web 标准：`docs/ui-screenshots/2026-07-11/`（74 张，375 × 812）

| 页面族 | Web 标准图 | RN 承载 | 交互/数据策略 | 结论 |
| --- | ---: | --- | --- | --- |
| 认证 | 10 | `AuthScreen` | 表单、协议、禁用态和返回真实；认证提交为阶段 1 演示 | aligned |
| 主 App | 6 | Tabs + `TabPlaceholderScreen` | 课程切换、模块过滤、Tab 与返回真实 | aligned |
| 账户 | 14 | `AccountScreen` | 资料与校验本地；同步/注销不连接真实服务 | aligned |
| 信息 | 8 | `InfoScreen` | FAQ/协议真实展示；反馈结果为稳定演示 | aligned |
| 系统状态 | 8 | `SystemStateScreen` | 麦克风/设置入口真实；通知和服务状态为演示 | aligned |
| 单词 | 6 | `VocabScreen` | 本地词书、筛选、状态与 sticky CTA | aligned |
| OPI 热点 | 2 | `ContentLibraryScreen` | 列表、详情 Sheet、题库跳转 | aligned |
| 体系课程 | 1 | `ContentLibraryScreen` | Hero、指标、课程示例 | aligned |
| AI 模考 | 3 | `MockExamScreen` | 设置联动真实；考试/报告明确 Mock | aligned |
| 随身听 | 3 | `RadioPlayerScreen` | 真实题库音频、倍速、字幕和列表 | aligned |
| 听力题库 | 6 | `QuestionBankCatalog` / `QuestionBankStudyScreen` | 共享会话引擎 + 选择任务策略 | aligned |
| 900 句 | 3 | 同一学习页 + 录音策略 | 我的回答、笔记、本地原文对比 | aligned |
| 陆空通话 | 2 | 同一学习页 + 录音策略 | 我的回答、参考答案、语法反馈预留 | aligned |
| OPI | 2 | 同一学习页 + 录音策略 | 生成语音和表达分析预留 | aligned |
| 故事复诵 | 共享状态 | 同一学习页 + retell 文案策略 | 我的回答、参考答案、语法反馈预留 | aligned |

## 原生例外

系统状态栏、Home Indicator、系统键盘、系统权限弹窗和字体栅格化按 `native-exceptions.md` 验收，不作为页面结构差异。Expo Development Build 的灰色齿轮仅用于开发调试，最终 Release 证据中排除。
