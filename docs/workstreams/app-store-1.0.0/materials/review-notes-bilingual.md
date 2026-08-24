# App 审核备注中英文模板

状态：首轮模板。方括号占位路径和联系方式必须用最终候选 Build 实测后替换；真实凭据不得写入仓库。

## 中文模板

```text
感谢审核“听你五个”1.0.0。本 App 是独立的航空英语练习工具，不代表 ICAO、民航监管机构、考试机构或其他政府组织，也不提供官方评分或认证。1.0.0 不提供或宣传体系课程。

一、审核登录
请在登录页选择“手机号密码登录”。App Store Connect 的主要登录字段提供完整体验账号；下方受保护信息另提供购买与注销账号。两个账号均为正常 Production 账号，不需要接收短信、安装微信或使用审核员个人 Apple ID。

二、两个账号的用途
1. 完整体验账号：用于会员题库、语音转写、语法纠错、表达优化、恢复购买和重复购买入口。
2. 购买与注销账号：用于查看免费边界、五档非自动续期会员、Apple 沙盒购买、恢复购买和账号注销。

三、免费与会员边界
资源模块和900句完整免费；听力、陆空通话、OPI 和故事复诵提供部分免费内容。请从【待最终包确认：首页/练习入口】打开各题库；带锁内容会进入会员页。会员到期后，已产生的个人学习数据不会因此删除。

四、五档 App 内购买
路径：【待最终包确认：我的 → 会员中心】。五档商品分别为7天、15天、31天、62天和93天会员，均为非自动续期订阅，不会自动扣款，也没有免费试用转付费。31天会员默认标记为“推荐”。成功购买会从当前会员最终到期时间继续顺延；价格以 StoreKit 显示为准。

五、购买与恢复购买
请使用购买与注销账号选择任一商品并完成 Apple 沙盒交易。恢复入口位于【待最终包确认：会员中心 → 恢复购买】。客户端收到成功结果后仍由服务端验证交易并更新权益；TestFlight/审核沙盒交易不会产生真实扣款。

六、录音、语音转写和文本 AI
路径：【待最终包确认：练习题 → 口语记录】。首次主动录音时系统才申请麦克风权限。录音默认保留在本机；只有审核员主动点击“转写”并同意 AI 数据处理后才上传。单条 AI 录音最长3分钟。转写、语法纠错和表达优化在操作前显示预计 AI 点数，失败且未交付完整结果时不扣点。AI 结果会标明为 AI 转写或 AI 辅助内容，不是官方 ICAO 评分。

七、微信未安装或取消授权
微信登录不是审核必需路径。设备未安装微信、用户取消或提供方不可用时，App 会关闭该登录尝试并显示可理解的提示，不创建半成品账号。审核员可始终使用上方手机号密码账号。

八、账号注销
请使用购买与注销账号进入【待最终包确认：我的 → 账号与隐私 → 注销账号】。页面会说明注销将放弃账号、学习数据、会员剩余时间和 AI 点数。手机号账号通过短信验证码重新验证后完成注销；如审核环境无法接收该公司控制手机号的验证码，请通过审核消息联系我们，我们会在不改变正式流程的前提下配合重新准备账号。App 内正常用户注销不依赖客服，也没有反悔期。

九、支持
支持 URL：【待确认：公开 HTTPS 支持页 URL】
隐私政策 URL：【待确认：公开 HTTPS 隐私政策 URL】
审核联系人：【待填写姓名】
审核联系电话：【仅在 App Store Connect 填写】
审核联系邮箱：【待填写公司邮箱】

所有功能使用正式账号、服务端、AI 和订单链路；本 App 不包含审核专用模式或绕过支付/注销的后门。
```

## English template

```text
Thank you for reviewing Ting Ni Wu Ge (听你五个) version 1.0.0. The app is an independent aviation-English practice tool. It is not affiliated with ICAO, a civil aviation authority, an examination provider, or any other government organization, and it does not provide official ratings or certifications. Version 1.0.0 does not offer or promote courses.

1. Review login
On the sign-in screen, choose “Phone number and password.” The full-access account is provided in the primary sign-in fields in App Store Connect. A separate purchase-and-deletion account is provided in the protected review information. Both are normal Production accounts. The reviewer does not need to receive an SMS, install WeChat, or use a personal Apple ID to sign in.

2. Purpose of the two accounts
• Full-access account: member question banks, speech transcription, grammar correction, expression improvement, Restore Purchases, and the repeat-purchase flow.
• Purchase-and-deletion account: free-access boundaries, all five non-renewing membership products, Apple sandbox purchasing, Restore Purchases, and in-app account deletion.

3. Free and member access
The Resources section and 900 Sentences are fully free. Listening, Air-Ground Communication, OPI, and Story Retelling each include some free content. Open the question banks from [VERIFY IN FINAL BUILD: Home/Practice]. Locked content leads to the membership page. Expiration of membership does not delete the user’s existing learning data.

4. Five in-app purchase products
Path: [VERIFY IN FINAL BUILD: Me > Membership]. The products provide 7, 15, 31, 62, or 93 days of membership. All are non-renewing subscriptions: there is no automatic renewal, automatic charge, or free trial that converts to paid access. The 31-day option is marked “Recommended” by default. A successful repeat purchase extends the existing final expiration date. The app always displays the localized price returned by StoreKit.

5. Purchase and Restore Purchases
Use the purchase-and-deletion account to select any product and complete an Apple sandbox transaction. Restore Purchases is at [VERIFY IN FINAL BUILD: Membership > Restore Purchases]. The server verifies the transaction before updating permanent entitlement. TestFlight and review sandbox transactions do not make real charges.

6. Recording, speech transcription, and text AI
Path: [VERIFY IN FINAL BUILD: Practice item > Speaking record]. Microphone permission is requested only after the reviewer actively starts recording. Recordings remain on the device by default and are uploaded only after the reviewer explicitly taps Transcribe and accepts the AI data notice. One AI recording is limited to three minutes. The app shows the estimated AI point cost before transcription, grammar correction, or expression improvement. No points are charged when a complete result is not delivered. Results are labeled as AI transcription or AI-assisted content and are not official ICAO ratings.

7. WeChat not installed or authorization canceled
WeChat is not required for review. If WeChat is not installed, authorization is canceled, or the provider is unavailable, the attempt closes with a clear message and no partial account is created. The reviewer can always use the phone-number-and-password account above.

8. Account deletion
Use the purchase-and-deletion account and go to [VERIFY IN FINAL BUILD: Me > Account & Privacy > Delete Account]. The confirmation screen explains that deletion gives up the account, learning data, remaining membership time, and AI points. A phone account is reauthenticated by SMS before deletion. If the review environment cannot receive the verification code sent to the company-controlled number, please contact us in App Review messages so we can prepare the account again without changing the Production flow. Normal users can complete deletion in the app without customer support, and there is no grace period.

9. Support
Support URL: [CONFIRM PUBLIC HTTPS SUPPORT URL]
Privacy Policy URL: [CONFIRM PUBLIC HTTPS PRIVACY POLICY URL]
Review contact: [CONTACT NAME]
Review phone: [ENTER ONLY IN APP STORE CONNECT]
Review email: [COMPANY REVIEW EMAIL]

All features use the normal Production account, service, AI, and order flows. There is no review-only mode or bypass for payment verification or account deletion.
```

## 定稿门禁

- [ ] 中英文中的菜单名、顺序和提示与最终候选 Build 完全一致。
- [ ] 账号 B 的注销需要短信重新验证；已提供审核员可独立完成且不依赖固定 OTP、审核后门或人工
  跳过复验的真实 Production 路径。若尚未解决，不得保留模板中“通过审核消息联系我们”的临时表述。
- [ ] 五档商品全部加入同一 1.0.0 审核提交，并处于可审核状态。
- [ ] 支持 URL、隐私 URL 和审核联系方式已替换占位符。
- [ ] 不出现真实审核手机号或密码，不出现 DeepSeek “绝不训练/零留存”等未核实承诺。
