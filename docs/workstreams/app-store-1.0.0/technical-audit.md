# Native App 1.0.0 技术现状审计

审计日期：2026-08-24
基线：`origin/main` `bc1620b5fef2ad9fae74e9b7dbffaa4699c1c8fa`

## 已有能力

- Expo 55 / React Native 0.83 / TypeScript Native 工程、NestJS API、PostgreSQL/Drizzle迁移和正式
  `accountId` 身份映射已经存在。
- Apple Distribution签名、App Store Connect App记录、TestFlight构建上传脚本和多个有效Build存在；
  当前版本记录为1.0.0，最新已知Build为3493759。
- Production API、Supabase、手机号OTP、腾讯云ASR和DeepSeek配置可用；生产迁移0000—0014已应用，
  相对当前部署代码无待应用迁移。
- 题库/资源API、同步、AI同意/用量/配额、反馈与保留清理已有基础实现。

## 必须补齐

- 客户端商业接口当前是失败关闭占位，没有StoreKit依赖、订单、会员、权益或点数账本。
- 数据库没有商业化、工作人员、TOTP或管理审计表；部分近期认证、微信防重放和短信安全状态仍使用
  进程内Map，重启后丢失。
- Native仍存在14+、日期型展示版本、体系课程/包过/通过率入口以及DashScope动态文本AI路径。
- 完整题库仍随包内置，尚未按免费清单和会员鉴权拆分；运营后台不存在。
- App内和公开支持、协议、隐私及注销页面仍含邀请码、旧年龄、课程、通义千问或旧数据口径。
- 微信生产AppID/AppSecret和平台移动应用配置缺失；两个审核账号尚未建立。
- 当前App Store Connect密钥可读写构建，但不足以证明可管理版本、内购和提交；需App Manager级团队
  密钥。五档内购、付费协议、银行和税务状态尚未就绪。

## 风险与回滚点

- 商业迁移先在副本验证数量、约束、幂等和回滚，再备份生产并应用；任何正式迁移失败立即停止部署。
- Sandbox/TestFlight与Production必须分账；客户端成功不得直接永久授权。
- 题库拆分必须保持稳定ID和学习数据兼容；回滚可恢复上一版内嵌数据和只读内容服务，但不能回退已
  验证订单或破坏账本。
- 银行开户只阻塞真实Apple内购闭环和最终提交，不阻塞代码、材料、后台及本地测试。
- DeepSeek训练/改进证据缺口和题库权利默认前提均已由负责人接受并记录；不得改写成绝对保证。
