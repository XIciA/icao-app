# 异常输出场景清单（第一轮，42 项）

日期：2026-10-16。按用户场景合并平台重复实现，不等于逐条提示文案总数。

标记：**保留**＝已审阅触发分支，未发现明确逻辑矛盾，不代表所有设备已验收；**缺陷**＝代码证据或复现确认；**优化**＝归因/恢复表达不足；**待验**＝证据尚不足。平台“共享”指 Native 与正式 Web 共享或映射业务逻辑；平台 adapter 仍需分别验证。

源码路径以仓库根目录为基准，行号以本轮源码为准。扫描原始位置见 `evidence/candidate-scan.json`；重点问题和修复验收见 `report-2026-10-16.md`。

| ID | 场景 / 输出 | 触发依据与恢复方式 | 分类 / 问题 | 主要源码位置 |
| --- | --- | --- | --- | --- |
| S01 | 页面加载失败 / 暂时无法显示 | React 渲染错误；重载，业务边界提供返回 | 保留；不捕获所有异步拒绝 | `src/app/_layout.tsx:160`；`src/components/states/NativeScreenBoundary.native.tsx:18` |
| S02 | 暂时无法确认账号状态 | 恢复本机安全状态或服务器账号确认失败；重试 | 优化 U-004；真实设备待验 | `src/app/_layout.tsx:76`；`src/features/auth/AuthProvider.tsx` |
| S03 | 账号正在注销 | 待处理注销任务；重新检查，限制业务访问 | 保留；未实际注销用户 | `src/app/_layout.tsx:85` |
| S04 | 手机号/密码格式错误 | 本地输入校验；纠正输入 | 保留 | `src/components/auth/login-screen.native.tsx:47,261,305` |
| S05 | 验证码错误、过期、频繁 | OTP 状态及服务错误映射；重输/重发/稍后 | 保留；未发短信 | `src/components/auth/login-screen.native.tsx:47,359` |
| S06 | 微信/Apple 失败、取消、不支持 | 区分取消、配置、平台、网络；更换方式/重试 | 保留；第三方真机待验 | `src/components/auth/login-screen.native.tsx:47` |
| S07 | 协议更新或保存确认失败 | 版本变化/确认提交失败；重新确认、重试 | 保留 | `src/features/app-content/LegalConsentGate.native.tsx:56` |
| S08 | 资料保存/头像读取失败 | 输入与存储/图片失败；保留编辑、重试 | 保留；故障端到端待验 | `src/features/account/AccountProfilePage.native.tsx:66,88` |
| S09 | 换绑、密码验证或退出未完成 | 安全操作拒绝或未完成；重新验证/重试 | 保留；账户变更未执行 | `src/features/account/AccountScreen.tsx:340,521,642`；`LoginMethodSheet.native.tsx:52` |
| S10 | 隐私删除/撤回/清除失败 | 服务失败，不能宣告成功；重试 | 保留；未执行删除 | `src/features/account/AccountScreen.tsx:153–245` |
| S11 | 未确认会员、待购买确认、不支持 | 会员运行时 phase 和平台能力；刷新/恢复购买 | 保留；真实支付及回调待验 | `src/features/native-commercial-testflight/MembershipPage.native.tsx:64–126`；`MembershipRoutePage.browser.tsx` |
| S12 | 题库加载失败 | repository 返回错误；重试 | 保留，但回退提示见 S13 | `src/app/question-bank/[bankId]/index.tsx:17` |
| S13 | 旧目录看起来正常，无回退提示 | 网络失败后 cache/embedded warning 未在目录显示 | 优化 U-002 | `src/features/question-bank/data/repository.native.ts:192`；目录路由 |
| S14 | 原题不可用 | 当前目录缺目标 ID，或加载的正文缺题 | 待验 R-001；完整索引/版本必须一致 | `src/app/question-bank/[bankId]/study/[categoryId]/[topicId].native.tsx:52–102` |
| S15 | 不在当前学习范围 | 当前目标/范围排除；调整范围或返回 | 保留；不等于下架 | 同上 `:59–66` |
| S16 | 会员内容 | membership_required 或目标会员内容未开放；会员入口 | 保留；与 R-001 版本判定联测 | 同上 `:68–91` |
| S17 | 题目正在整理 / 学习内容加载失败 | 主题空或 session hydrate 失败；返回/重载 | 待验；需分清空目录与加载失败 | 同上 `:95–115`；`QuestionBankStudyScreen.native.tsx:687` |
| S18 | 我的标注原题失效、灰色不能点击 | 免费正文静态索引缺题 | 缺陷 A-002 | `src/features/question-bank/annotations/card-index.ts:20,52`；`MyAnnotationsScreen.native.tsx:170` |
| S19 | 标注读取失败 / 颜色无结果 / 尚无标注 | loadError 与 hydrated 分开；重试或清除筛选 | 保留 | `src/features/question-bank/components/MyAnnotationsScreen.native.tsx:154–163,277` |
| S20 | 标签分类保存失败、被其他设备删除 | 管理定义冲突、保存拒绝；保留编辑与重试 | 保留 | `src/features/question-bank/components/AnnotationToolbar.native.tsx:199–214` |
| S21 | 笔记/回答保存失败、离开确认 | 写入失败显式显示，退出时确认 | 保留；相关保存测试通过 | `src/features/question-bank/components/StudyWorkbench.native.tsx:656–690`；`QuestionBankStudyScreen.native.tsx:596` |
| S22 | 学习记录读取、打开、删除失败 | 存储/详情转换/同步失败；按失败动作重试 | 保留；未执行用户数据删除 | `src/features/question-bank/components/LearningRecordsScreen.native.tsx:46–101` |
| S23 | 同步没报错但少记录 | 上传绑定依赖静态索引，缺引用 continue | 缺陷 A-003；实际历史损失待核实 | `src/features/sync/learning-sync.native.ts:227–228,477–480` |
| S24 | 学习进度显示 0/旧值 | 异步读取进度缺 catch，未区分读取失败 | 待验 R-003 | `src/features/question-bank/components/QuestionBankCatalog.native.tsx:58` |
| S25 | 随身听当前范围暂无可播放内容 | 备考目标与 radioEligible 无交集；解释范围、返回 | 保留，用户已确认 A-001 | `src/features/content/RadioPlayerScreen.tsx:163–170` |
| S26 | 随身听加载失败/超时/权限失效 | 播放与资源错误映射；重试/下一首/检查账号 | 保留；后台真机待验 | `src/features/radio-player/operation-coordinator.ts:17–46`；`RadioPlayerScreen.tsx:214` |
| S27 | 题目图片加载失败/超时 | 图片回调或 12 秒超时；重新解析资源 | 保留；图片测试通过 | `src/features/question-bank/components/ImageQuestionCard.tsx:22–92` |
| S28 | 题目音频加载/启动失败 | 解析与播放器状态、超时；重试 | 保留；iOS/Android/Web 媒体行为待验 | `src/features/question-bank/components/StudyAudioPlayer.tsx:543`；`.web.tsx:730` |
| S29 | 麦克风拒绝、录音失败、重录失败 | 录音引擎阶段错误；权限、重试，旧资产保留 | 保留；引擎测试通过，手机麦克风未验收 | `src/features/question-bank/recording/recording-engine.ts:133–156`；`ExamSpeakingPractice.native.tsx:23` |
| S30 | AI 登录/同意/额度/材料/网络错误 | 类型化 failure policy；按原因恢复，取消不当故障 | 保留；未调用付费 AI | `src/features/ai/ai-operation-failure.native.ts:49`；`StudyWorkbench.native.tsx:534` |
| S31 | 模考无法生成试卷 | 组卷、数量、网络、权限错误统一 catch | 优化 U-001 | `src/features/content/MockExamScreen.native.tsx:47`；`mock-exam/build-session.native.ts` |
| S32 | 热点需会员/离线授权过期/网络错误 | 类型化 access result；会员、联网验证、重试 | 保留；已有加载与失效测试通过 | `src/features/content/hotspot/access-loader.native.ts`；`HotspotAccessView.native.tsx:50–108` |
| S33 | 热点不存在 / 暂无热点 | 回退摘要目录找不到 ID 或列表空 | 待验 R-002 / 优化 U-003 | `src/features/content/hotspot/repository.native.ts`；`HotspotListScreen.native.tsx:25–47` |
| S34 | 资源暂无文章 / 文章未找到 | 成功空列表或 HTTP 404 | 保留；网络错误另有分支 | `src/features/editorial/use-editorial.native.ts`；`EditorialArticleScreen.tsx:15–17` |
| S35 | 资源/文章加载失败但网络成功 | 有效响应后 cache setItem reject | 缺陷 A-007 | `src/features/editorial/repository.native.ts:83,107` |
| S36 | 词汇资源不可用但网络成功 | 有效词书后 cache setItem reject | 缺陷 A-007，Native/正式 Web | `src/features/vocabulary/repository.ts:63`；`repository.web.ts:120` |
| S37 | 词汇/收藏一直准备中 | 进度 read reject 未处理，ready 不变 | 缺陷 A-005 | `src/features/vocabulary/progress-store.ts:62–73`；`VocabularyScreen.tsx:77`；`WordFavoritesScreen.tsx:46` |
| S38 | 词汇掌握/测试结果看似完成但未保存 | UI 前进且 void 保存，没有失败状态 | 缺陷 A-006 | `src/features/vocabulary/VocabularyScreen.tsx:100–114,133`；`VocabularyStudyViews.tsx:49` |
| S39 | 单词收藏资源不可用、无收藏、发音失败 | 资源失败可展示查词收藏；无收藏有引导；系统发音失败提示 | 保留正常分支；进度读/写失败归 S37/S38 | `src/features/vocabulary/WordFavoritesScreen.tsx:47–90`；`speech.native.ts:79` |
| S40 | 反馈图片权限/数量/提交失败 | 权限与输入校验，提交失败保留内容，重复操作防护 | 保留；反馈表测试通过 | `src/features/info/InfoScreen.native.tsx:181–279` |
| S41 | 无新版本 / 检查更新失败 / 无法打开 | 明确渠道和版本比较，超时与链接失败；重试 | 保留；更新入口实机待验 | `src/features/app-updates/AppUpdatePrompt.tsx:25–43`；`app-updates.native.ts` |
| S42 | 红色但不是异常；未开放功能页 | 答错、录音中、删除动作属于语义色；研发中页需核对路由是否开放 | 保留语义色；旧/未开放分支不列当前 bug | `ChoiceList.tsx:105`；`AnswerCardSheet.tsx:38`；`ExamSpeakingPractice.native.tsx:27`；`LearningReportScreen.tsx`；`src/app/content/[slug].native.tsx` |

## 本轮实施增补

- S40 反馈图片权限由“保留”调整为恢复引导优化，与头像共用权限分流。
- S43 新增：个人资料更换头像权限被拒绝，A-008，已实现再次授权/打开设置/手动设置说明。
- S39 中发音播放失败按用户要求暂缓；本轮只修其词汇进度及收藏读写。
- S13、S14、S18、S23、S24、S37、S38 及 U-001–U-004 的实现和回归状态见 `completion-2026-10-17.md`；上表保留首次审计分类。

## 覆盖缺口

真实硬件后台音频与录音、实际支付平台回调、第三方登录、双设备并发、浏览器限额/隐私模式、真实旧版本升级、动态题库发布切换均需下一阶段专项验证。扫描命中中未独立展开的底层错误码、旧 Vercel 分支及平台专用边界不计为动态通过。
