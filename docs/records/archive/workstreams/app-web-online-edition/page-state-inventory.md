# 历史归档：Web 页面与状态清单

状态：全部路由已纳入 Web

更新时间：2026-07-18

## 路由族

| 页面族 | 路径 / 变体 | 核心状态 | Web 结果 |
| --- | --- | --- | --- |
| 入口与认证 | `/`、`/auth/login`、`register`、`forgot-password`、`callback`、`recovery` | 未登录、登录中、失败、长期会话、刷新恢复 | 通过；邮件能力明确未开放 |
| 主导航 | `/(tabs)`、`discover`、`profile` | 默认、切换、滚动、返回、题库选择 | 通过 |
| 题库目录 | `/question-bank/[bankId]`，5 个现有题库 | 加载、缓存、分类、主题、资源失败 | 通过，同一 ECS 题库 |
| 学习流程 | `/question-bank/[bankId]/study/[categoryId]/[topicId]` | 播放、答题、查词、划线、标签、录音、转写失败保留、上一/下一题、结束报告 | 通过代表性完整轨迹 |
| 标注和记录 | `/annotations`、`/learning-records` | 列表、筛选、空状态、返回题目 | 通过 |
| 词汇 | `/content/vocab` | 学习、测试、进度与持久化 | 通过 |
| 电台 | `/content/radio` | 目录、播放/暂停、进度、上下首、倍速、字幕、间隔、队列、快照恢复 | 通过；弹层限制在画布内 |
| 内容 | `/content/articles`、`resources`、`courses`、`hotspot` | 列表、筛选、播放、详情弹层 | 通过 |
| AI 模考 | `/content/mock-exam`、`ai-report` | 配置、考试、报告 | 通过现有产品范围 |
| 账号 | `/account/profile`、`edit-profile`、`settings`、`sync`、`security`、`change-email`、`change-password`、`delete-account` | 查看、编辑、同步、退出、注销 | 通过；换绑邮件未开放 |
| 信息与法律 | `/info/hub`、`help`、`feedback`、`about`、`agreement`、`privacy`，`/legal/agreement`、`privacy` | 正文、表单、版本 | 通过 |
| 系统状态 | `/state/gallery`、`microphone`、`mic-denied`、`notifications`、`offline`、`load-failed`、`maintenance`、`loading` | 权限、离线、失败、维护、加载 | 通过；系统弹窗外观不要求一致 |
| 基础详情壳 | `/detail/listening`、`vocabulary`、`profile-detail` | 页面壳和返回 | 通过，内容范围与 App 相同 |

## 页面验收口径

- 共检查 44 个实际路径，全部可直接到达并在 SPA 深链刷新后恢复。
- 所有业务弹层使用手机画布坐标系，电脑浏览器不会出现全窗口弹层。
- 页面滚动发生在 375 × 812 内容画布内；宽屏不触发桌面多栏重排。
- 需要登录的路径在无会话时回到登录页；登录恢复后继续使用同一 Web 路径。
