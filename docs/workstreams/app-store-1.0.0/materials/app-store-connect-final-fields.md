# App Store Connect 1.0.0 唯一最终字段包

状态：固定字段已定稿；隐私自助能力、生产数据库/API 和五个正式公开页面的上一版已经就绪，
本轮 AI 标识与模型备案 v4.1 源码尚待从最终主线发布；中国大陆合规、Apple 付费商务、审核账号、
IAP 验收和截图等门禁尚未全部通过，不可直接提交；
平台专属事实仍按文中门禁当场补入，不在仓库保存凭据。

适用范围：iOS App Store 1.0.0 简体中文字段包（含中国大陆合规）；App 与五档 IAP 只在中国大陆销售，
并关闭自动在新增地区供应。本文件是平台录入的唯一字段来源；
不存在第二套名称、文案、年龄、隐私或商品草案。

## 1. App 信息与版本设置

| App Store Connect 字段 | 唯一录入值 | 状态/说明 |
| --- | --- | --- |
| 主要语言 | 简体中文 | 固定 |
| App 名称 | 见下方名称字段 | 固定；Apple 上限 30 字符 |
| 副标题 | 见下方副标题字段 | 固定；Apple 上限 30 字符 |
| Apple ID | `6800583111` | App Store Connect 现有 App 记录 |
| Bundle ID | `com.readyoufife.ios` | 与 `app.json` 一致 |
| 用户可见版本 | `1.0.0` | 新候选预留 Build `3493762` |
| App Store iOS 版本记录 | `1.0.0` | 平台草稿已保存为冻结值 `1.0.0` |
| 送审 Build | `3493762` | 须从整合分支合入后的干净 `origin/main` 归档和上传；旧 Build `3493761` 仅作历史录音修复候选保留 |
| 主要分类 | 教育（Education） | 固定 |
| 次要分类 | 工具（Utilities） | 固定；中国大陆 App 备案服务分类仍为工具 |
| App 定价 | 免费 | 会员能力只通过 App 内购买提供 |
| 分发方式 | Public Distribution | 公开 App Store，不使用 Private 或 Unlisted |
| App 可用地区 | Specific Countries or Regions：仅中国大陆 | 关闭自动在新增地区供应；备案服务分类继续保持工具 |
| Apple 芯片 Mac 兼容分发 | 取消选择 `Make this app available` | 1.0.0 未在 Mac 验收 |
| Apple Vision Pro 兼容分发 | 取消选择 `Make this app available on Apple Vision Pro` | 1.0.0 未在 Vision Pro 验收 |
| 中国大陆 ICP/App 备案号 | `蜀ICP备2026045996号-1A` | 已由正式备案材料核对；录入时再与主体、App 名称、Bundle ID 和简中元数据反查 |
| 中国大陆组织合规 | `<ASC_ONLY_CHINA_MAINLAND_COMPLIANCE_VERIFIED>` | 待 Account Holder/Admin 在 Business → Agreements → Compliance → China Mainland 以正式资料核实 D-U-N-S、公司中文名和 USCI 后当场确认；不得用仓库候选值代替 |
| 内容版权（Content Rights） | 是，App 包含或访问第三方内容 | 公司或相关权利人已拥有必要权利；不宣称全部原创 |
| 版权（Copyright） | `2026 云启航科（成都）科技有限公司` | 唯一拟录入值；负责人须先确认该公司是该字段所要求的权利主体 |
| Support URL | `https://yunqihangke.com/apps/readyoufife/support/` | 已上线并提供 App 内反馈路径和产品支持邮箱；提交前验证邮箱可投递、收件和回复 |
| Privacy Policy URL | `https://yunqihangke.com/apps/readyoufife/privacy/` | 当前线上为上一版；包含 AI 标识与模型备案口径的 v4.1 源码须从最终主线发布后，才能与归档和生产数据流复核 |
| Privacy Choices URL | `https://yunqihangke.com/apps/readyoufife/privacy-choices/` | 当前线上为上一版；包含 AI 导出标识与模型备案口径的源码须从最终主线发布；平台字段已保存 |
| Marketing URL | 留空 | 首发不填 |
| 新版本内容（What’s New） | 不适用 | 首个版本不填写 |
| 分阶段发布 | 不启用 | 首发不使用 phased release |
| App Store 版本发布 | Automatically release this version | 当前平台已选择；最终提交前复核仍保持选中且不设置最早发布日期 |
| Made for Kids | 否 | 不进入儿童分类 |

### 全部提交门禁

以下各项是并列门禁，不能因固定字段已定稿而标记为可提交：

1. 生产备份、隔离恢复、数据库迁移和 API 发布已从干净 `origin/main` 完成；在最终候选中复核生产
   微信路由消失、Apple Notifications V2 可用、稳定 Device ID 不再发送或保存。可视化 Ops 延后到上架后。
2. D7 冻结的账号/学习数据导出、清除学习数据及删除 AI 结果等用户入口已进入主线并通过聚焦验收，
   当前 `official-site` 上一版五页和对应生产 API 已发布；本轮 v4.1 AI 标识/模型备案源码须从最终主线重新发布，
   且在最终候选完成后反向确认线上公开文本与 App 的主体、平台范围、路径和数据权利一致。
3. 完成下方 Support URL 可达性、中国大陆备案与组织合规门禁；App只在中国大陆销售，本次不做DSA。
4. Paid Apps Agreement、银行和税务有效，五档商品已创建并通过 Sandbox/TestFlight 购买、恢复、重购、
   退款、通知和环境隔离验收。
5. 一个 Production 审核账号、新 Build 3493762、六张产品页截图、五张 IAP 审核截图、最终归档隐私审计和
   负责人 TestFlight 真机验收全部完成。

### Support URL 联系信息与地区门禁

Apple 要求 App 和 Support URL 提供准确、最新且易用的联系方式。当前页面提供 App 内反馈路径和
`support@yunqihangke.com`，无需为了增加字段而编造或在该页面重复公开地址、电话。提交前验证页面可从
目标网络访问，并验证支持邮箱真实可投递、收件和回复。

本次只在中国大陆销售，欧盟不在范围，DSA 交易商验证不适用。以后扩展到欧盟前，必须重新完成地区、
税务、隐私、内容和 DSA 合规审查，不沿用本次结论直接扩区。

### App Store Server Notifications V2

| App Store Connect 字段 | 唯一录入值 |
| --- | --- |
| Production Server URL | `https://api.readyoufife.com/v1/commerce/apple/notifications/v2` |
| Production Notifications Version | Version 2 |
| Sandbox Server URL | `https://api.readyoufife.com/v1/commerce/apple/notifications/v2` |
| Sandbox Notifications Version | Version 2 |

生产与 Sandbox 使用同一 HTTPS 入口，由服务端验证 Apple JWS 中的环境并严格隔离。2026-08-26 已从
干净主线部署生产 API；无效空请求返回 400，证明入口存在且被安全拒绝。仍须在 App Store Connect
2026-08-26 已保存并反查确认两套 Version 2 URL。下一步完成 Apple Production 与 Sandbox 测试通知，
并以 Apple 返回的测试通知状态和服务端幂等审计记录证明成功；TestFlight 使用 Sandbox 环境。

### 名称

<!-- field:app-name -->
```text
听你五个
```

### 副标题

<!-- field:subtitle -->
```text
航空英语练习工具
```

## 2. 简体中文产品页元数据

### 宣传文本

<!-- field:promotional-text -->
```text
围绕航空英语使用场景，提供听、说、记、练和学习记录等实用功能，帮助用户按自己的节奏完成日常练习。
```

### 描述

<!-- field:description -->
```text
听你五个是一款面向航空英语学习场景的实用工具，提供题库练习、音频播放、口语录制、文本转写、学习标记和进度记录等功能。相关内容由团队整理、制作并持续维护。

主要功能：
• 按题库、模块和话题进行日常练习
• 播放配套音频，记录自己的口语表达
• 按需发起语音转写、语法纠错和表达优化
• 收藏、标注、笔记并查看学习记录
• 登录后同步支持跨设备恢复的学习数据

资源模块、900句及部分题库内容可免费使用，更多题库内容需要会员权限。部分智能功能会消耗 AI 点数，操作前会显示预计消耗。文本纠错和表达优化由 DeepSeek-V4-Flash-0731（Deepseek Chat，备案号 Beijing-DeepseekChat-202404280016）提供；生成或改写结果在即时结果区和学习记录中持续显示“AI 辅助生成”，个人数据导出为每条 AI 结果保留该内容标识、模型和备案信息。会员采用一次购买、到期不自动续费的方式，并提供恢复购买入口。

听你五个是独立的航空英语学习工具，不提供官方考试评分、认证或通过承诺。
```

### 关键词

<!-- field:keywords -->
```text
飞行员,ICAO,OPI,900句,陆空通话,航空词汇,听力训练,口语表达,飞行英语
```

录入规则：使用英文逗号且不加空格；不重复 App 名称或公司名称，不加入竞品、课程销售、官方认证、
真实考题、内部题库、通过率或保过词语。

## 3. 年龄分级

当前 Apple 问卷按 In-App Controls、Capabilities、Mature Themes、Medical or Wellness、Sexuality or
Nudity、Violence 和 Chance-Based Activities 分组。按下表逐项录入；若平台中文翻译变化，使用同一
英文语义。内容频率以最终候选包全部可访问题库、音频、图片、资讯及 AI 功能为准。

| Apple 问卷项 | 唯一回答 | 依据 |
| --- | --- | --- |
| Parental Controls | No | 无家长控制 |
| Age Assurance | Yes | 登录前主动勾选已满 16 周岁 |
| Unrestricted Web Access | No | 只能打开产品预设链接 |
| User-Generated Content | No | 用户内容不面向其他用户广泛分发 |
| Social Media | No | 无社交信息流 |
| Social Media Disabled for Users Under 13 | No | 不提供社交媒体能力 |
| Messaging and Chat | No | 无用户间聊天或私信 |
| Advertising | No | 无付费广告位或第三方广告 |
| Profanity or Crude Humor | None | 当前首发基线 |
| Horror or Fear Themes | None | 当前首发基线 |
| Alcohol, Tobacco, or Drug Use or References | Infrequent | 航空事件语境偶尔提及 |
| Medical or Treatment Information | Infrequent | 航空运行和应急语境偶尔涉及 |
| Health or Wellness Topics | None | 不提供健康生活方式建议 |
| Mature or Suggestive Themes | Infrequent | 事故、伤亡、劫机等敏感现实主题 |
| Sexual Content or Nudity | None | 无相关内容 |
| Graphic Sexual Content and Nudity | None | 无相关内容 |
| Cartoon or Fantasy Violence | None | 无相关内容 |
| Realistic Violence | Infrequent | 航空事件可能偶尔引用 |
| Prolonged Graphic or Sadistic Realistic Violence | None | 无相关内容 |
| Guns or Other Weapons | Infrequent | 航空安保语境偶尔提及 |
| Gambling | No | 无真实赌博 |
| Simulated Gambling | None | 无模拟赌博 |
| Contests | None | 无排名、奖励或竞赛机制 |
| Loot Boxes | No | 无随机付费道具 |

年龄类别与覆盖设置：

- Made for Kids：不选择。
- Age Categories and Override：选择 `Override to Higher Age Rating`，目标选择 `16+`。
- 理由：App 的注册和服务条款要求用户已满 16 周岁；即使问卷计算值较低，也按统一产品口径覆盖为
  16+。若最终候选包出现频率更高或新的内容类别，只能提高回答，不能为维持 16+ 而低报。

## 4. App 隐私标签

### 顶层答案

| 字段 | 唯一回答 |
| --- | --- |
| App 或第三方合作方是否收集数据 | 是 |
| 下列数据是否与用户关联 | 全部是 |
| 下列数据是否用于跟踪 | 全部否 |
| 是否展示第三方广告 | 否 |
| 是否出售个人信息或做跨公司广告画像/归因 | 否 |
| 是否申请 ATT | 否 |

### 需要选择的数据类型与用途

| Apple 类别 | 数据类型 | 与用户关联 | 用于跟踪 | 用途 |
| --- | --- | --- | --- | --- |
| Contact Info | Name | Yes | No | App Functionality |
| Contact Info | Email Address | Yes | No | App Functionality |
| Contact Info | Phone Number | Yes | No | App Functionality |
| Contact Info | Other User Contact Info | Yes | No | App Functionality |
| Identifiers | User ID | Yes | No | App Functionality |
| Purchases | Purchase History | Yes | No | App Functionality |
| User Content | Other User Content | Yes | No | App Functionality |
| User Content | Audio Data | Yes | No | App Functionality |
| User Content | Photos or Videos | Yes | No | App Functionality |
| User Content | Customer Support | Yes | No | App Functionality |
| Usage Data | Product Interaction | Yes | No | App Functionality; Analytics |
| Diagnostics | Performance Data | Yes | No | App Functionality; Analytics |
| Diagnostics | Other Diagnostic Data | Yes | No | App Functionality; Analytics |

### 不选择

- Location（Precise、Coarse）、Contacts、Health & Fitness、Sensitive Info；
- Emails or Text Messages、Browsing History、Search History；
- Device ID、Advertising Data、Payment Info、Crash Data；
- Product Personalization、Developer’s Advertising or Marketing、Third-Party Advertising、Other Purposes；
- Tracking。

解释边界：Apple 处理且本产品及合作方不可访问的支付账户凭据不作为 Payment Info 申报；商品、订单、
交易标识、退款和权益仍作为 Purchase History 申报。用户主动选择并提交反馈图片仍作为 Photos or
Videos 申报，即使不申请完整相册权限。原始语音只在用户主动转写时上传且短期处理，仍主动申报
Audio Data。

## 5. App Review Information

### 联系与登录字段

这些值只能在 App Store Connect 当场填写，不得回填本文件：

| 字段 | 平台填写规则 |
| --- | --- |
| Contact First Name | `<ASC_ONLY_REVIEW_CONTACT_FIRST_NAME>` |
| Contact Last Name | `<ASC_ONLY_REVIEW_CONTACT_LAST_NAME>` |
| Contact Phone | `<ASC_ONLY_REVIEW_CONTACT_PHONE>` |
| Contact Email | `<ASC_ONLY_REVIEW_CONTACT_EMAIL>` |
| Sign-in required | Yes |
| Username | `<ASC_ONLY_REVIEW_ACCOUNT_PHONE>` |
| Password | `<ASC_ONLY_REVIEW_ACCOUNT_PASSWORD>` |

只使用一个正常 Production 审核账号：以新账号100点完成非付费 AI 验收，通过真实 Sandbox/TestFlight
购买获得会员权益，并覆盖购买、恢复和注销；注销最后执行。仓库永远不保存真实手机号或密码。

### 审核备注（Notes，中英双语）

<!-- field:review-notes -->
```text
感谢审核“听你五个”1.0.0。本 App 是独立的航空英语练习工具，不代表 ICAO、监管或考试机构，不提供官方评分、认证或通过承诺。

【登录】请在登录页勾选已满16周岁并同意协议，然后选择“密码登录”，使用主要登录字段中的唯一审核账号。该账号为正常 Production 账号，不需要审核员接收短信或使用个人 Apple ID。

【题库与会员】“题库”页含听力、900句、陆空通话、OPI 和故事复诵。资源模块和900句免费；其他题库含免费内容，锁定内容会引导至会员页。

【五档内购】路径：“我的”→“会员与购买”。7、15、31、62、93天均为非自动续期订阅；31天标记“推荐”。价格由 StoreKit 返回，重复购买顺延，服务端验证交易。“恢复购买”位于同页。请用当前账号完成沙盒购买，不会真实扣款。

【录音与 AI】路径：“题库”→任一可用口语练习题。首次主动录音时才申请麦克风权限；录音仅在审核员点击“转写”并同意 AI 数据处理后上传。语音转写使用腾讯云语音识别；文本纠错和表达优化使用 DeepSeek-V4-Flash-0731（Deepseek Chat，备案号 Beijing-DeepseekChat-202404280016）。转写和“分析表达”会在操作前显示 AI 点数。生成或改写结果在即时结果区及“学习记录”持续显示“AI 辅助生成”；“我的”→“设置”→“账号与隐私”的个人数据导出为每条 AI 结果保留 contentLabel“AI辅助生成”、模型和备案信息。

【注销】请在完成其他功能检查后，最后进入“我的”→“设置”→“账号安全”→“注销账号”。确认页说明将放弃账号、学习数据、剩余会员和 AI 点数。该账号已设置密码，可输入当前密码完成重新验证，无需短信或客服协助。

Support: https://yunqihangke.com/apps/readyoufife/support/
Privacy Policy: https://yunqihangke.com/apps/readyoufife/privacy/
Privacy Choices: https://yunqihangke.com/apps/readyoufife/privacy-choices/

Thank you for reviewing Ting Ni Wu Ge (听你五个) 1.0.0. It is independent, not affiliated with ICAO or an authority/exam provider, and offers no official score, certification, or pass guarantee.

[Sign-in] Accept the 16+ declaration and policies, then choose Password Login with the single account in the primary sign-in fields. It is a normal Production account; no SMS or reviewer Apple ID is required.

[Membership and IAP] Go to Me > Membership & Purchases. The 7, 15, 31, 62, and 93-day products are non-renewing; 31 days is Recommended. StoreKit supplies prices, repeat purchases extend expiry, and the server verifies transactions. Restore Purchases is on this page. Use the current account for a sandbox purchase with no real charge.

[Recording and AI] Open Question Banks > a speaking item. Microphone access starts only on recording; audio uploads only after Transcribe and AI consent. Tencent Cloud ASR transcribes. Text correction and improvement use DeepSeek-V4-Flash-0731 (Deepseek Chat, filing No. Beijing-DeepseekChat-202404280016). Costs appear before use. Generated or rewritten results continuously show “AI 辅助生成” in the immediate result and Learning Records; the personal-data export under Me > Settings > Account & Privacy retains contentLabel “AI辅助生成”, model, and filing information for every AI result.

[Account deletion] After all other checks, go to Me > Settings > Account Security > Delete Account last. The screen explains the lost account, learning data, membership, and AI points. Enter the current password to reauthenticate and delete without SMS or customer-support intervention.
```

唯一审核账号凭据只填专用 Username/Password 字段，不在 Notes 重复，也不回填本文件。

## 6. 五档非自动续期订阅

### 五项共同设置

- 平台状态：五项商品、简体中文本地化和中国大陆基准价格已创建；当前仍覆盖175个地区且自动包含
  新增地区，必须收缩为仅中国大陆并关闭自动新增地区；`MISSING_METADATA` 还缺五张审核截图。
- 创建位置：Subscriptions → Non-Renewing Subscriptions。
- 类型：Non-Renewing Subscription；不创建自动续期订阅组。
- Availability：Specific Countries or Regions，仅中国大陆；关闭自动在新增地区供应。
- Base Country or Region：中国大陆。
- Tax Category：Match to parent app；如财税专业意见要求不同分类，先由负责人确认再改，不自行猜测。
- Promotional In-App Purchase：不启用；不上传促销图，不在 App Store 产品页单独推广。
- 无免费试用、自动续费、自动扣款、年度套餐或独立 AI 加量包。
- 首次送审：五项全部与 App 1.0.0 加入同一个 submission。
- 价格：优先选择等于目标价的 Apple 官方价格点；不存在时选择最接近且不高于目标价的价格点，等距
  仍选较低价。App 内只显示 StoreKit 实际本地化价格。

<!-- iap-products:start -->
| 天数 | Reference Name | Product ID | 简中 Display Name | 简中 Description | 中国大陆目标价 | 服务端权益键 | App Review Screenshot |
| ---: | --- | --- | --- | --- | ---: | --- | --- |
| 7 | `Membership 7 Days v1` | `com.readyoufife.ios.membership.7d.v1` | 7天会员 | 解锁会员内容7天 | ¥68 | `membership_7d_v1` | `iap-review-membership-7d.png` |
| 15 | `Membership 15 Days v1` | `com.readyoufife.ios.membership.15d.v1` | 15天会员 | 解锁会员内容15天 | ¥108 | `membership_15d_v1` | `iap-review-membership-15d.png` |
| 31 | `Membership 31 Days v1` | `com.readyoufife.ios.membership.31d.v1` | 31天会员 | 解锁会员内容31天 | ¥168 | `membership_31d_v1` | `iap-review-membership-31d.png` |
| 62 | `Membership 62 Days v1` | `com.readyoufife.ios.membership.62d.v1` | 62天会员 | 解锁会员内容62天 | ¥298 | `membership_62d_v1` | `iap-review-membership-62d.png` |
| 93 | `Membership 93 Days v1` | `com.readyoufife.ios.membership.93d.v1` | 93天会员 | 解锁会员内容93天 | ¥398 | `membership_93d_v1` | `iap-review-membership-93d.png` |
<!-- iap-products:end -->

每张审核截图必须来自最终候选 Build，选中对应档位并显示 StoreKit 实际价格和购买按钮；31 天截图
同时显示“推荐”。不得出现真实手机号、订单号、密码、硬编码价格、倒计时、虚构原价或折扣。

### 7 天商品 Review Notes

<!-- field:iap-review-notes-7 -->
```text
路径：“我的”→“会员与购买”。选择“7天会员”并点击 StoreKit 显示的价格按钮。该非自动续期订阅一次购买提供7天会员内容访问，到期不自动续费。重复购买从当前最终到期时间顺延；交易经服务端验证；“恢复购买”位于同一页面。
```

### 15 天商品 Review Notes

<!-- field:iap-review-notes-15 -->
```text
路径：“我的”→“会员与购买”。选择“15天会员”并点击 StoreKit 显示的价格按钮。该非自动续期订阅一次购买提供15天会员内容访问，到期不自动续费。重复购买从当前最终到期时间顺延；交易经服务端验证；“恢复购买”位于同一页面。
```

### 31 天商品 Review Notes

<!-- field:iap-review-notes-31 -->
```text
路径：“我的”→“会员与购买”。选择默认标记“推荐”的“31天会员”并点击 StoreKit 显示的价格按钮。该非自动续期订阅一次购买提供31天会员内容访问，到期不自动续费。重复购买从当前最终到期时间顺延；交易经服务端验证；“恢复购买”位于同一页面。
```

### 62 天商品 Review Notes

<!-- field:iap-review-notes-62 -->
```text
路径：“我的”→“会员与购买”。选择“62天会员”并点击 StoreKit 显示的价格按钮。该非自动续期订阅一次购买提供62天会员内容访问，到期不自动续费。重复购买从当前最终到期时间顺延；交易经服务端验证；“恢复购买”位于同一页面。
```

### 93 天商品 Review Notes

<!-- field:iap-review-notes-93 -->
```text
路径：“我的”→“会员与购买”。选择“93天会员”并点击 StoreKit 显示的价格按钮。该非自动续期订阅一次购买提供93天会员内容访问，到期不自动续费。重复购买从当前最终到期时间顺延；交易经服务端验证；“恢复购买”位于同一页面。
```

## 7. 当前 Apple 字段限制依据

- App 名称 2—30 字符、副标题不超过 30 字符：
  <https://developer.apple.com/help/app-store-connect/reference/app-information/app-information>
- 宣传文本 170 字符、描述 4,000 字符、关键词 100 字节且单个关键词超过 2 字符：
  <https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information>
- Support URL 的实际联系信息、适用法律说明及审核指南 1.5 的联系方式要求：
  <https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information>；
  <https://developer.apple.com/app-store/review/guidelines/>
- IAP Reference Name 64 字符、Product ID 100 字符、Display Name 2—30 字符、Description 45 字符、
  Review Notes 4,000 字符：
  <https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information/>
- 当前年龄问卷与 16+ 覆盖规则：
  <https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions>
- 自动发布选项：
  <https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/select-an-app-store-version-release-option>
- App Store Server Notifications Production/Sandbox URL 与 Version 2：
  <https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/enter-server-urls-for-app-store-server-notifications>
- 中国大陆 ICP 备案和组织 D-U-N-S/USCI 信息：
  <https://developer.apple.com/help/app-store-connect/reference/app-information/app-information>
  <https://developer.apple.com/help/app-store-connect/manage-compliance-information/view-mainland-china-compliance-information/>
- Apple 芯片 Mac 与 Apple Vision Pro 兼容分发默认值和取消方式：
  <https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-macs-with-apple-silicon>
  <https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-apple-vision-pro>
