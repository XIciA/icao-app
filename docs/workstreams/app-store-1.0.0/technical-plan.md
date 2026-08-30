# Native App 1.0.0 技术方案

状态：已确认，最终提交收口中

## 现有实现

- 延续 React Native、Expo、TypeScript、NestJS、PostgreSQL 与 CNG/Prebuild，不引入 WebView 或第二套
  Native 技术栈。Vercel 用户 Web 保持冻结。
- 永久 `accountId` 是账号、订单、会员、AI 点数和学习数据的唯一归属；不可变账本、服务端验签、
  幂等通知和可重算汇总承担商业一致性，客户端状态不直接授予永久权益。
- iOS 通过 StoreKit 2 客户端边界和 Apple App Store Server Library 完成五档非自动续期商品、购买、
  恢复、通知与退款；Sandbox/TestFlight 和 Production 分账。
- 免费内容清单随包内置，会员内容通过服务端鉴权和最长72小时离线授权提供。文本 AI 只走 DeepSeek，
  ASR 只走腾讯云；微信运行时、体系课程和学习报告均从1.0.0正式表面排除。
- 支付验签、权益、点数、风控、隐私自助与审计运行在服务端，不依赖可视化 Ops Web。

## 最终提交方案

- Build `3493761` / commit `fca7436d497430db88cf1a29410d61878fd85fc5` 冻结为历史录音候选，不用于最终提审。将首页课程入口移除、AI 生成内容
  持续标识、模型备案口径和注销恢复稳健性修正合入后，从干净 `origin/main` 归档 Build `3493763`，再完成
  身份、签名、权限、PrivacyInfo、SDK、生产 API、无微信和隐藏路由的反向核对。
- App 和五档 IAP 的可用地区都设为中国大陆，`availableInNewTerritories=false`；中国大陆继续作为价格
  基准，App 内只显示 StoreKit 本地化价格。欧盟不在范围，不执行 DSA 交易商流程。
- 只建立一个正常 Production 审核账号并设置密码；使用100点验收非付费 AI，以真实 Sandbox/TestFlight
  购买建立会员权益，同一账号验收购买、恢复和注销，注销最后执行。
- 完成 Paid Apps Agreement、银行和税务后，逐档检查商品元数据与真实沙盒交易，制作六张产品截图和
  五张 IAP 审核截图，补齐审核 Notes、中国大陆备案和通知测试。
- 用户完成 Build 3493763 的最终真机确认后，把1.0.0与五档 IAP放入同一 submission，保持审核通过后
  自动发布；拒审时按原因修正材料，只有代码缺陷才提高 Build。

## 可视化后台边界

- 已有 Ops Web/API、RBAC、TOTP、审计和数据库表保留，但生产域名部署、首个管理员和可视化页面验收
  延后到1.0.0上架后，不是本次提交门禁。
- 未来重设计后台优先保持既有管理 API 合同；不改变用户 App 的登录、商品、权益、点数和隐私接口时，
  通常不需要大规模更新 App。

## Agent 与集成

- 协调 Agent 管理范围、集成、平台操作和用户提示；手续、代码、灵活材料和独立审计 Agent 使用互不
  重叠的任务范围。
- 写入 Agent 使用从最新 `origin/main` 建立的短期分支/worktree；正式平台操作只依据已进入
  `origin/main` 的事实。密码、验证码、银行、税务和密钥只在受保护界面处理，不进仓库或聊天。
