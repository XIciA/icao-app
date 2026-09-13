# 2026-09-14 再次送审执行记录

状态：交付完成，App Store 等待审核。用户明确授权完成修改、协调后台、上传 TestFlight、回复审核并提交 App Store，不再逐步确认。正式来源只允许已进入 origin/main 的提交。

## 范围和验收依据

- 微信：仅安装设备显示入口，首次/前台/点击复查；未安装可用 Apple、手机号和密码。取消、失败、超时和回调安全不退化；不再使用免安装授权窗口。按新规则如实回复，不声称 Safari 方案。
- 随身听：现有系统播放器补本地品牌封面；保留真实后台音频，复查已交付队列与恢复能力。
- 购买：修复 UUID 大小写造成回调不匹配；精确交易服务端验证及 acknowledgement 后即展示到账，原生 finish 保留物理 drain；不以额外 GET 成败覆盖已验证成功。必要等待可继续使用，有自动核对和手动检查入口。
- 回归：无 CallKit/VoIP 残留、启动圆角图标、重复注册不可重复领取体验的合理提示、后台权益与用户端一致。
- Vercel 保持冻结，价格/商品/时长不变。

## 代码证据

锁定 OpenIAP 的 StoreKitTypesBridge.swift 使用 transaction.appAccountToken?.uuidString；Swift 实测 UUID 输出大写。旧 provider 精确字符串比较导致同一 UUID 不匹配，事件虽入 inbox，购买仍等90秒；runtime60秒进入pending而gate仍等待，因此自动核对被延迟。本轮规范 UUID 大小写，保留商品/时间/账号关联与服务器验单。

consumer 原本已在服务器成功后发布权益，但 purchase 仍等待 finish 与再次 GET。本轮从协调器已确认的精确交易通知结束用户等待，底层操作仍串行排空，既不重复发起交易，也不把到账说成仍未确认。

## 并行协调

后台任务“听你五个｜并行决策分身”在 codex/admin-global-controls / icao-admin-global 处理全局额度规则、全员重置和用户详情。其负责0049迁移/API发布并提供验证；本任务不改其文件，统一 App 版本号与最终送审。

## 审核材料

用户指定直接使用 `/Users/zhouyide/Downloads/持续音频的功能.mp4`，本轮不再检查或要求重录。仅后台音频为苹果回信明确要求的视频；不增加微信/购买录屏要求。视频证明用户提供的实际后台使用，不伪造为新构建已逐项真机测试。

最终检查：重点对应审核信4.2.3(i)、5、2.5.4；同时核对登录/恢复购买/删除账号/隐私与AI同意/生产后端与审核账号可访问性、无开发制品与不实文案。

官方依据：https://developer.apple.com/app-store/review/guidelines/ 。隐藏微信入口是否获接受由Apple决定，不以其他App案例或本地测试保证审核结果。

## 进度

- 初步聚焦：微信133项；radio+audio78项；commerce153项通过。
- 全量 `pnpm check` 通过：App 161 suites / 1099 tests，API 51 files / 691 tests，类型、构建与发布静态门禁通过。
- 预审补齐 iOS 首次 AI 同意中的腾讯云音频和 DeepSeek 文本双服务商披露；16 项聚焦测试及 TypeScript 通过，同意前及拒绝时均不发送。
- 微信客户端取消若缺少 state 会等待超时，但尚无真实客户端返回该形态的证据；保留 SDK 要求的 state 白名单检查，不为推测放宽。新构建未完成用户真机逐项验收。
- 最终合并主干 CI：161 suites / 1100 App tests、52 API files / 698 tests 通过；最终类型检查通过。

## 最终交付（北京时间 2026-09-14 03:01）

- PR #119（App）与 #120（后台）已合入，正式源码 `f8cee39f7bbcc1c23ff88033eec5bbd47627a5e1`。
- TestFlight **1.0.0（3524033）** 已上传，Apple **VALID**，现有内部组可用；build/delivery ID `88941714-2a4c-40d5-88ff-042acf5bb723`。
- App 与7/31/93天三项会员均已重新提交，页面四项均“等待审核”，API `WAITING_FOR_REVIEW`。提交 ID `68b11d91-e1af-48e3-bc04-1162e1bd8e69`；保留既有 `AFTER_APPROVAL` 自动发布设置，未宣称 Apple 已批准。
- 三项审核回复已发送，备注已替换旧构建和两分钟购买等待说明。
- 视频 `持续音频的功能.mp4` 附件处理 **COMPLETE**，附件 ID `88527f70-b3b2-4283-b080-dc1ff0685921`。
- 专用审核账号登录、权益接口 HTTP 200；首次未观测 StoreKit 交易可能按 production 判断，因此通过既有后台预览/确认/审计补足31天生产会员。复查正式及沙盒会员均 active；未改凭据或学习数据。
- 公开隐私及支持页 HTTP 200，腾讯云音频与 DeepSeek 文本披露与本次 AI 提示一致。

## 安装包与生产证据

生产 API `production-migration-f8cee39f7bbc`、0049迁移及恢复演练成功。真实 AI 验证覆盖转写、语法、润色、航空实体保护和临时音频清理。后台实际 UI 验收见[后台实施记录](../../../workstreams/local-admin-console/phase-log.md)。

Archive、Export、Apple validate、upload 均成功。归档隐私审计包含11份manifest；4个可执行文件没有 CallKit 链接，主程序无 CXCallObserver/CXProvider/CXCallController 未解析符号；`UIBackgroundModes`仅`audio`。品牌PNG真实内嵌于 `assets/assets/images/icon-native.png`，SHA256 `2e9401acce52ec48e675ca2d8df1e1659266cd0ad95698033880c5542967577b`。

原生依赖安装曾因 GitHub HTTPS 握手失败中断，随后通过既有 GitHub SSH 通道安装同一锁定版本。恢复构建保留同一生产CNG树，未改变源码/依赖版本，全部 TestFlight 发布检查仍执行。

标签 `release/ios-testflight/v1.0.0-b3524033`、`release/ios-app-store/v1.0.0-b3524033`、`release/api-production/2026-09-14-f8cee39f7bbc` 均绑定正式源码。回滚基线为上一已验证 App 3524032 / API `production-migration-6bea9f3203c5`，数据库切换备份见后台记录。

本轮按用户指示直接使用其物理设备视频，不要求额外录制，不生成未观察过的新构建逐项真机“通过”记录。代码测试、真实生产调用、安装包审查、Apple处理和提交状态分别记录，不将其中任何一项写成整套新包真机验收。

本机归档、IPA、审计及 AI 实证已保存在 `/Users/zhouyide/Desktop/icao-app/.generated/review-delivery-3524033/`，随后移除本轮发布 worktree；既有无关工作目录与输出保留。
