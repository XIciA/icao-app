# 当前产品状态

更新时间：2026-08-07

本文只描述当前产品事实与端侧定位。具体数量、版本和资源清单以代码及生成清单为准。

## 产品定位

听你五个（Read You 5）是面向 ICAO 英语学习与训练的产品。核心闭环包括题库学习、音频训练、录音与转写、
AI 辅助反馈、学习记录和内容资源浏览。视觉与交互延续既定品牌，不因平台拆分而改变产品身份。

## Native（iOS / Android）

- React Native + Expo + TypeScript 是正式移动端实现。
- 正式 iOS Bundle ID 为 `com.readyoufife.ios`，Android 包名为 `com.readyoufife.app`，正式 URL Scheme 为 `readyoufife`。
- 当前账号入口采用邀请码机制；账号、学习记录与需要联网的正式能力连接 ECS API 与 Supabase。
- 正式题库、音频、录音、AI 和真实反馈能力由各自现有共享模块负责，不建立功能内的平行副本。
- Development Build 是能力边界；原生依赖、权限、插件或配置改变时需要重新构建。

## Web

- Web 是同一仓库的 Expo Web 产品体验，但运行时与 Native 解耦。
- Web 通过 Vercel Functions 和同源静态资源提供邀请码校验、内容和题库资源。
- Web 的邀请码会话与浏览器本地数据不接入 ECS、Supabase 或 Native 云同步。
- Web 与 Native 共享品牌、内容语义和核心交互意图，不要求共享后端身份与数据生命周期。

## 当前事实的来源

- 实现与路由：`app/`、`src/`。
- Native API：`services/api/` 与 `packages/contracts/`。
- Web 运行时：`api/`、`vercel.json`、`scripts/materialize-web-*.mjs`。
- 题库、内容与 AI 资产：对应工具生成的 manifest、release 文件和 `services/api/src/ai/assets/`。
- 长期产品和架构边界：`战略/总战略文档.md` 与 `战略/architecture-decisions.md`。

当数字或“进行中/已完成”状态与实现冲突时，先核对生成清单、测试和线上证据，再更新本文；
不要把旧阶段日志当成当前事实。
