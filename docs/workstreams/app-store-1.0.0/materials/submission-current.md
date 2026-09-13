# 听你五个 · 本次 App Store 送审材料唯一来源

更新：2026-09-14。当前候选 **1.0.0（3524033）**，实施与检查中，尚未上传/重新提交。执行证据见[本轮记录](../../../records/workstreams/product-release-readiness/app-review-september14-execution.md)。

本轮微信方案为：已安装微信显示入口，未安装隐藏，返回App重新检测；Apple与手机号/密码登录独立可用。不得沿用此前免安装SDK窗口或Safari授权的描述。CallKit已移除，保留随身听后台播放。用户提供的后台录屏直接使用，不要求额外微信或购买视频。

审核回复草稿：

Thank you for reviewing our app. We have addressed the three issues in a new build:

1. Login (4.2.3(i)): WeChat is optional and its button is displayed only when WeChat is installed. On devices without WeChat, users can sign in within the app using Sign in with Apple or phone/password login; there is no requirement or prompt to install WeChat. Availability is checked again when returning to the app. The review account in App Review Information uses the in-app password login option.
2. CallKit (Guideline 5): We have removed CallKit integration. The app does not provide VoIP calls or a CallKit calling interface. We retain normal audio playback for learning.
3. Background audio (2.5.4): The Radio feature (发现 → 随身听) plays learning audio while the app is in the background. Please see the attached physical-device recording, which shows playback followed by navigation to the Home Screen while audio continues. UIBackgroundModes audio is used for this feature. To reproduce, sign in, open 发现 → 随身听, choose a topic, start playback, and return to the Home Screen.

We also improved purchase confirmation and entitlement synchronization. Thank you for your review.

以上草稿只在最终包、审核账号及视频附件确认后发送；不宣称已完成新包全部真机测试或已获苹果认可。

## 历史提交：2026-09-10

以下 3519587、WAITING_FOR_REVIEW 和“七项回复”是 2026-09-10 的历史事实；2026-09-12 Apple 已对该构建提出三项问题，不代表目前待重新提交版本的状态。商店文案、价格、截图与隐私基础资料可继续引用，但重新送审必须关联本轮确切构建与新视频。

2026-09-10 曾提交 1.0.0（3519587）及 7/31/93 天会员共四项。其平台核对状态如下。

## 1. 当前完成情况与差异

| 项目 | 本轮结果 | 剩余工作 |
| --- | --- | --- |
| 版本 | 用户确认最新版本为 1.0.0（3519587） | 平台已切换并保存3519587，API状态VALID |
| 商店文案 | 已确认，完整正文见第 2 节 | 副标题、宣传文本、介绍与关键词已保存 |
| 五张宣传图 | 已统一导出 1320×2868 PNG，逐文件尺寸检查通过 | 已目视核对主要文字、数字、标注和 AI 例句；待上传。放大导出不等于提高原始细节 |
| 三档内购 | 7/31/93 天，68/158/358 元；代码 active 列表吻合 | Apple当前价格、类型、说明和审核截图已核对并保存，详见第11节 |
| 提交项目 | 目标只关联三档 | 已仅提交7/31/93天；15/62天保留为历史商品 |
| 七项审核回复 | 已整理草稿，见第 5 节 | 视频、外部服务最终核对及内容来源事实待补齐 |
| 隐私标签 | 已读取 ASC 当前 13 类申报，见第 6 节 | 需与 3519587 归档和实际服务数据流核对，不能仅因表格一致而认定通过 |
| 审核账号 | ASC 已填账号及密码 | 未重新实际登录验收；凭据仅保留在 ASC 受保护字段 |

## 2. 商店文案定稿

以下为用户已确认的文字。粘贴时不带 Markdown 标题符号；未完成的功能不得因文案已确认而宣称已上线。

### App 名称

听你五个

### 副标题

ICAO备考与航空英语练习

### 宣传文本

听过的句子，换个场景能不能说出来？听你五个把题库、录音、标注、查词和AI纠错放在一起，方便你练习，也方便你回头看看，哪里还需要再练一次。

### 关键词

飞行员,听力,口语,陆空通话,OPI,900句,故事复诵,航空词汇,英语题库,语音转写,语法纠错

### 完整介绍

<!-- current-description:start -->
准备航空英语考试，有时最让人着急的，是答案看得懂，轮到自己说，却还是卡住了。

一句话反复听了几遍，一个词查过好几次，一道题觉得已经会了，录下自己的回答再听，又发现还有没说清楚的地方。这些都是练习的一部分。

我们做“听你五个”，是希望把这些练习中常用的东西放到一起。听音频、看题目、标重点、查单词、录下回答，不用来回切换。今天没练好的地方，留着明天再看。

它不能替你开口，也不能承诺一次考试的结果。但我们希望，当你愿意花时间认真练习时，它能帮你少一些整理资料的麻烦，多一些真正听和说的时间。

主要功能

按备考目标，找到对应题库

支持ICAO 4、ICAO 5的初考与复考目标，展示对应的学习内容。听力、900句、陆空通话、OPI和故事复诵，按自己的需要逐步练习。

彩色标注，留下自己的重点

容易忘的词、没听清的表达、想再练一次的句子，都可以标出来。再次打开时，能直接看到自己之前关注的地方。

遇到生词，随点随查

练习中遇到不熟悉的词，可以直接查看释义，结合航空语境理解它的用法。也可以通过单词学习继续复习。

录下回答，再看看哪里能改

有时候，听一遍自己的录音，比默读几遍答案更容易发现问题。你可以把录音转写成文字，再按需使用AI进行语法纠错和表达优化，对照建议重新组织自己的回答。

AI也会出错。它提供的是供你判断和参考的修改建议，不是考试评分。

换一种方式，继续练习

想专心听一会儿，可以打开随身听；想集中练习，可以使用模拟练习。发现页还整理了OPI热点和备考资源，方便按需查阅。

练过的内容，方便回看

学习记录、笔记和标记，帮助你找回之前练过的内容。支持同步的学习数据会在登录后自动同步，方便继续学习。

关于会员

App可免费下载，部分内容与功能免费提供。

会员可解锁会员题库，并获得每周AI学习额度。提供7天、31天和93天三种时长，权益与每周AI额度相同，仅使用期限不同。你可以按自己的备考安排选择，不必为了更多AI用量购买更长时长。

会员采用一次购买、到期不自动续费的方式，支持恢复购买。AI用量以剩余百分比显示，并提供重置时间；具体价格、权益及使用规则请查看App内说明。

最后想说

备考有自己的节奏。有时一天能练很多，有时只是把昨天没听懂的一句话听明白。我们希望“听你五个”能成为一个用起来顺手、愿意一直打开的工具。

如果某个地方不好用，或者你发现内容有误，欢迎通过App内的意见反馈或题目纠错告诉我们。具体的问题，会帮助我们把它做得更好。

听你五个是独立的航空英语学习工具，与国际民用航空组织（ICAO）及考试机构不存在官方隶属或认证关系，不提供官方评分、等级认证或通过承诺。

用户协议
https://yunqihangke.com/apps/readyoufife/terms/

隐私政策
https://yunqihangke.com/apps/readyoufife/privacy/
<!-- current-description:end -->

## 3. 五张宣传图

导出目录：`output/app-store/2026-09-10-upload/`。打包文件：同目录 `app-store-five-images.zip`。全部 PNG，1320×2868，适用于 Apple 6.9 英寸截图规格。保留已确认设计，未重新生成界面；此次使用 sips 统一尺寸。源设计约 851×1848/1849，因此本次是放大导出，不应称为原生高分辨率截图。

| 顺序 | 文件 | 标语 | 原图核对重点 |
| --- | --- | --- | --- |
| 1 | 01-question-bank.png | ICAO 题库，一站备考 | 4题组/1223题、900句、186场景/3216卡、144话题/1090卡 |
| 2 | 02-highlights.png | 彩色标注，重点可见 | 红绿标注位置与英文原文、Sentence571、51/179 |
| 3 | 03-discover.png | 探索更多学习方式 | 单词学习、随身听、模拟练习、OPI热点、资源分享 |
| 4 | 04-dictionary.png | 遇到生词，随点随查 | clearance、航空释义、原有灰色遮罩和词典弹层 |
| 5 | 05-ai.png | 语音转写，AI 纠错 | 原回答 strikes is、纠错 strikes are、AI辅助生成标识 |

这五张是商店宣传图，不替代三档商品的 IAP 审核截图，也不替代 Apple 要求的真机视频。旧六张商店图应在确认新图后替换。

## 4. 三档内购与提交构建

### 唯一商品口径

| 时长 | 中国大陆目标价格 | Product ID | 商品显示名称 | 简短说明 |
| --- | --- | --- | --- | --- |
| 7 天 | ¥68 | com.readyoufife.ios.membership.7d.v1 | 7天会员 | 7天会员题库访问及每周AI学习额度，不自动续费 |
| 31 天 | ¥158 | com.readyoufife.ios.membership.31d.v1 | 31天会员 | 31天会员题库访问及每周AI学习额度，不自动续费 |
| 93 天 | ¥358 | com.readyoufife.ios.membership.93d.v1 | 93天会员 | 93天会员题库访问及每周AI学习额度，不自动续费 |

- 目标类型：非自动续期订阅（Non-Renewing Subscription）；必须核对 Apple 实際商品类型。
- 权益和每周 AI 额度相同，只区分有效期。用户只看剩余百分比和重置时间，不显示内部点数和逐功能扣点表。
- 默认选中 31 天，不标推荐或最受欢迎。最终购买价以 StoreKit 显示和 Apple 当前价格配置为准。
- 从本次提交移出 15 天及 62 天商品；不删除历史商品，不改变历史订单核验。
- 每档 IAP 审核截图需来自 3519587，显示选中对应时长、实际价格、购买入口；截图待补充/验证。
- 三档分别使用同一审核说明，将 N 替换成 7、31、93：

> This non-renewing subscription provides N days of membership access. All three durations provide the same membership features and the same weekly AI allowance. It does not renew automatically. Open 我的 (Me) > 会员与购买 (Membership and Purchases), select N days and tap the purchase button. Restore Purchases is available on this screen. AI usage is displayed as a remaining percentage with a reset time.

### 已发现的技术差异

`services/api/src/commerce/product-catalog.ts` 的 ACTIVE_MEMBERSHIP_PRODUCTS 只出售 7/31/93 天，标价与本表一致；保留五个历史产品不等于仍出售五档。

旧 `tools/app-store-connect-iap.mjs` 及旧字段校验仍硬编码“恰好五档”，旧字段还含 31 天 ¥168。**本轮不得直接执行旧 sync-products / sync-commercial 写入命令**，否则可能把旧配置同步回平台。此次 commercial-status 为只读查询，超时退出，没有取得最终 Apple 价格结论。

送审版本目标为 **1.0.0（3519587）**。用户已确认该 TestFlight 展示三档会员及 AI 百分比；本次 ASC 版本页读到的关联构建仍为 **3493766**。选择新构建后需重新核对处理状态、出口合规及实际购买恢复结果。

## 5. 平台已保存的七项审核备注

以下为本次提交实际保存的备注。旧审核记录在移出全部项目后关闭回复入口，因此没有另发旧记录回复；新提交携带以下备注和视频附件。内容来源授权未核实，不以本备注作为权利证明。

Review information for 听你五个 1.0.0 (3519587)

1. Physical-device video
The attachment 提交视频.mp4 was recorded on an iPhone 17 Pro Max running iOS 26.6.1. It shows Apple sign-in, the three membership options, purchase processing, membership activation and learning activities. Account deletion is available at 我的 > 设置 > 账号安全 > 注销账号; please test deletion last, after the other features.

2. Purpose and audience
This is an independent aviation-English study tool for individual learners, including pilots and student pilots preparing for ICAO English assessments. It combines question banks, listening, personal recording, highlighting, dictionary lookup and AI-assisted language feedback. It does not provide official examination scores or certification.

3. Access and main features
Use the account and password in the protected sign-in fields. Accept the displayed terms and choose 密码登录 (Password Login); the reviewer does not need to receive an SMS or use a personal Apple ID.
题库 (Question Banks): choose a category and an item to listen, read, highlight text and record an answer. 转写 transcribes audio; 分析表达 provides grammar and expression feedback.
发现 (Discover): vocabulary learning, listening practice, simulated practice, OPI topics and study resources.
我的 (Me): membership, weekly AI remaining percentage and reset time. 会员与购买 opens purchasing and restoration.
Delete Account: 我的 > 设置 > 账号安全 > 注销账号. Follow the displayed confirmation and reauthentication steps.
There are no public user uploads, public comments or user-to-user private messages. Personal recordings, answers and notes are for the user's own learning. Resource articles are published by the team.

4. External services
Apple In-App Purchase processes iOS membership purchases. Apple and WeChat provide optional sign-in; WeChat is used for sign-in, not iOS payments. Tencent Cloud speech recognition provides transcription; DeepSeek provides text grammar correction and expression improvement. The backend provides account, learning-data synchronization and membership services, using Alibaba Cloud infrastructure; Tencent EdgeOne delivers public content. AI processing is initiated by the user with the displayed data-processing consent.

5. Regions
This release and its three membership products are offered only in mainland China.

6. Nature of the content
The app provides aviation-English questions, reference answers, audio and study resources for personal learning. It is an independent learning tool, not affiliated with ICAO or an official examination body, and does not provide official certification, operational flight instructions or a pass guarantee.

7. In-App Purchase
The products provide 7 days (CNY 68), 31 days (CNY 158) or 93 days (CNY 358). They are non-renewing subscriptions: the membership features and weekly AI allowance are the same; only duration differs. AI usage is displayed as a remaining percentage, not points. Open 我的 > 会员与购买, select a duration and tap the purchase button. 恢复购买 (Restore Purchases) is on the same page. The former 15-day and 62-day options are not offered in this build.
In the recorded TestFlight test, synchronization took approximately two minutes after purchase confirmation before membership updated. Please allow synchronization to complete and avoid a duplicate purchase while it is pending.

Support: https://yunqihangke.com/apps/readyoufife/support/
Privacy: https://yunqihangke.com/apps/readyoufife/privacy/

## 6. 隐私与基础资料核对

### ASC 当前已读取的隐私标签

平台显示以下 13 类，均关联用户身份：

| 数据类型 | ASC 当前用途 |
| --- | --- |
| 姓名、电子邮件地址、电话号码、其他用户联系信息 | App 功能 |
| 用户 ID、购买历史记录 | App 功能 |
| 照片或视频、音频数据、客户支持、其他用户内容 | App 功能 |
| 产品交互、性能数据、其他诊断数据 | App 功能、分析 |

这是平台现状记录，**不等于最终包隐私审计已完成**。逐项核对实际采集、传输、保存、第三方处理和关联方式。没有公开 UGC 不代表没有“用户内容”数据；个人录音、答案和反馈仍可能需要披露。还需检查跟踪用途、麦克风权限、AI 处理同意、删除和保留规则。不得复用其他 App 的“完全本地、不收集数据”文案。

### 基础字段

| 字段 | 本轮值/核对事项 | 状态 |
| --- | --- | --- |
| App 名称 | 听你五个 | 已确认 |
| App ID / Bundle ID | 6800583111 / com.readyoufife.ios | 与现有项目/平台记录对应 |
| 版本 | 1.0.0（3519587） | ASC已提交3519587，等待审核 |
| 地区 | 仅中国大陆 | 用户确认，平台销售范围待反查 |
| 分类 | 历史为教育 / 工具 | 当前 App 信息页待核对 |
| 年龄分级 | 按最终内容问卷如实填写；历史16+ | 待反查；“已满16岁”勾选不能未经检查直接等同 Apple 年龄验证机制 |
| 公开发布能力 | 无用户公开上传、评论、私信；文章由团队发布 | 用户确认 |
| 内容版权声明 | 按实际权利情况填写 | 来源事实待补，不能直接沿用旧“已拥有必要权利”结论 |
| 版权字段 | 2026 云启航科（成都）科技有限公司 | 当前版本页存在此值，权利主体需与实际相符 |
| App 备案 | 历史资料为蜀ICP备2026045996号-1A | 本次尚未对照正式证件及 ASC，不标已核实 |
| 支持网址 | https://yunqihangke.com/apps/readyoufife/support/ | 已读到 ASC 此值；线上可达性及联系方式待终检 |
| 隐私网址 | https://yunqihangke.com/apps/readyoufife/privacy/ | 已读到 ASC 此值；正文与最新数据流待终检 |
| 隐私选择网址 | https://yunqihangke.com/apps/readyoufife/privacy-choices/ | 已读到 ASC 此值；能力与路径待终检 |
| 用户协议 | https://yunqihangke.com/apps/readyoufife/terms/ | 正文与三档、不自动续费口径待终检 |
| 营销网址 | 留空 | 当前版本页为空 |
| 发布方式 | 审核通过后自动发布 | 本次版本页已读取；未修改 |
| 审核账号与联系人 | 只保存在 ASC 受保护字段 | 字段已填；登录有效性需验证，不复制凭据入本文件 |
| 付费协议、银行、税务 | 历史记录有效 | 本次商务页面尚未反查 |

## 7. 提交前待办（只在真正完成后勾选）

- [x] 统一最新目标版本 1.0.0（3519587）。
- [x] 商店文案集中落盘；正文采用三档会员、AI 百分比和到期不自动续费。
- [x] 五张图导出标准 1320×2868 PNG，逐文件核对尺寸。
- [x] 读取 ASC 当前隐私标签并记录 13 类数据。
- [x] 五张宣传图目视核对主要文字、数字、标注和 AI 例句；排版经过艺术加工，不声明像素级一致。
- [x] 上传五张宣传图，替换旧六张；API均为COMPLETE，顺序已设为01–05。
- [x] 保存副标题、宣传文本、完整介绍、关键词。
- [x] 已选择3519587，API处理状态VALID，平台提交检查已通过。
- [ ] 核对三档 IAP 类型、当前人民币价格、说明、对应审核截图与最终包购买恢复。
- [x] 从本次提交移除15/62天，只关联7/31/93天。
- [ ] 实际登录审核账号，验证付费功能可访问；保留独立账号演示删除。
- [ ] 外部服务、内容来源、隐私问卷、年龄分级、备案及网址终检。
- [ ] 用户提供真机录屏，补齐第 1 项视频信息和其余事实占位符。
- [ ] 将最终七项回复同步到审核消息及审核备注，再提交审核并读取提交状态。

完成文件准备或点击保存，不等于提交审核。最终以 ASC 提交成功及等待审核等状态为证据。

## 8. Apple 官方参考

- 截图规格：https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- 版本字段：https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- 隐私说明：https://developer.apple.com/app-store/app-privacy-details/
- 审核指南：https://developer.apple.com/app-store/review/guidelines/

本轮没有更改应用代码、生产服务或长期规则；平台已重新送审。

## 9. 已收到的审核视频（2026-09-10）

- 原文件：`/Users/zhouyide/Downloads/ScreenRecording_09-10-2026 18-28-19_1.MP4`。
- 时长：251.873 秒（约 4 分 12 秒）；1320×2868；HEVC 视频、AAC 音频；约86 MB。
- 已成功解码并抽查开头、全程间隔帧及结尾；未做逐帧/音频完整验收。
- 已观察到 Apple 登录、三档购买、购买后等待及会员更新、题库练习、录音、发现/资源和 AI 剩余百分比。
- 开头已处于 App 登录界面，未展示从主屏幕点击图标启动；抽查未见注销流程，不能在回复中声称视频已演示注销。建议补一段从主屏幕启动 App 至账号注销完成的录像，使用独立演示账号。
- 用户提供“关于本机”截图确认：iPhone 17 Pro Max，iOS 26.6.1。仅记录型号与系统版本，不记录序列号或网络硬件地址；尚未独立核实该系统是否为当前最新正式版本。
- 原片仅用于审核附件，不作为公开商店预览；不把登录画面中的账号信息写入材料或公开截图。
- 上传视频及补录后，替换第5节第1项占位符，并按实际覆盖内容调整说明。

## 10. Chrome 平台执行记录

- 用户明确授权使用现有视频直接推进送审，不再补录；设备 iPhone 17 Pro Max / iOS 26.6.1。审核回复不宣称视频演示了未观察到的流程。
- 15 天和 62 天商品已从原提交移除，平台逐项显示“已移除”。原列表可能仍显示6条历史行，不代表6条仍有效。
- 宣传文本、完整介绍、关键词已填写并保存，采用第2节定稿。副标题待另页更新。
- 旧App提交关联已解除，版本页已保存3519587，尚未完成最终提交。

### 最新执行补充

- 新视频：`/Users/zhouyide/Downloads/提交视频.MP4`，262.458秒，1320×2868，约65.7MB，已替换旧视频并保存到审核附件。抽样观察到登录、购买等待、会员更新及练习；不宣称展示了未观察到的注销流程。
- 三档Apple当前中国大陆价格已API核对：7天68元、31天158元、93天358元；类型均NON_RENEWING_SUBSCRIPTION，三档均仅CHN销售，不自动新增地区。
- App销售页确认唯一地区为中国大陆。
- 三档本地化说明暂被旧审核关联锁定，API返回DESCRIPTION不可修改；正在解除关联后重试。
- 审核备注已替换为当前七项英文说明，未填写未经核实的原创或授权声明。内容权利事实仍未核实，不标为已核实。

## 11. 最终提交结果

- 提交时间：2026-09-10，20:18（北京时间，ASC页面确认）。
- App版本状态：WAITING_FOR_REVIEW。
- 已提交4项：1.0.0（3519587）及7/31/93天会员；15/62天保留历史商品但不在本次提交内。
- Membership 15 Days v1：READY_TO_SUBMIT
- Membership 31 Days v1：WAITING_FOR_REVIEW
- Membership 62 Days v1：READY_TO_SUBMIT
- Membership 7 Days v1：WAITING_FOR_REVIEW
- Membership 93 Days v1：WAITING_FOR_REVIEW
- 三档说明与审核备注已更新；审核截图均换成新视频121秒处的真实会员页，三档均显示，31天处于选中状态；不是伪造另外两档选中截图。三个新截图资产均COMPLETE。
- 未另行完成审核账号实际登录、完整隐私审计或内容授权核查；这些不标记为已通过。
- 未修改应用代码、生产部署、密钥或长期规则。

- 最终提交ID：`68b11d91-e1af-48e3-bc04-1162e1bd8e69`。
- 审核页面：https://appstoreconnect.apple.com/apps/6800583111/distribution/reviewsubmissions/details/68b11d91-e1af-48e3-bc04-1162e1bd8e69
- 页面逐项确认App及三档商品全部“等待审核”。
