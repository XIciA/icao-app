# AI 能力迁移执行记录

## 2026-07-08

- 补充最终需求决策：查词输出结构、查词上下文、ASR 内部能力、按钮位置、结果展示位置、听力边界。
- 迁移 `features/ai` 核心能力层和 `app/api/ai` route。
- 迁移 `lib/api`、`lib/storage`、`lib/platform/media` 基础 helper。
- 将生产项目数据库持久化层替换为设计稿 noop 版本。
- 移除运行时不需要的 AI eval 开发台代码，保留文档资产。
- 接入真实 AI 查词、录音转写、语法纠错、OPI 表达分析、900句原文对比。
- `pnpm exec tsc --noEmit` 已通过。
- `pnpm build` 已通过。
- localhost 验证通过：主页 200，查词、语法纠错、ASR、OPI 表达分析接口均返回 `ok:true`。

## 2026-07-09

- 修复 AI 查词偶发不可用：服务端对 DashScope 上游连接失败和可重试状态自动重试。
- 前端查词弹层对相同请求做 in-flight 去重，避免开发模式下同一次点击重复请求并被后一次失败覆盖。
- 查词失败文案区分 `AI_UPSTREAM_ERROR`，便于判断是服务连接问题还是功能入口问题。
- 验证：`pnpm exec tsc --noEmit`、`pnpm build` 通过，Qantas 查词连续 3 次返回 `ok:true`。
- 修复语音转写前端交互：录音按钮改为点击开始、再次点击结束，绕开 Web 原型触摸松手事件不稳定导致的卡录音问题。
- 修复语音转写服务端稳定性：ASR 上游连接失败或可重试状态自动重试。
- 修复语音转写固定返回 `Thank you.`：前端录音改为 PCM WAV 上传，携带录音时长；服务端拦截空音频常见占位识别结果。
- 回归验证：AI 查词、语音转写、检查语法、分析表达接口均返回 `ok:true`；900句对比路径通过类型检查和生产构建。

## 2026-07-12

- 将设计稿与 `feizhuicu` 已验证的保守航空转写归一化器迁入 `services/api` 运行时，替换原先仅处理少量数字空格的简化正则。
- 覆盖 FL、ICAO 数字变体、跑道及方向后缀、航向、QNH/QFE、squawk、频率、高度、航空缩写、固定读法，以及航路点/离场程序中的受限 ICAO 拼读组合。
- 保持 `rawTranscript` 为 ASR 原始文本，仅规范化 `transcript`；保留学习者语法错误，不执行纠错、润色或答案补全。
- 将转写追踪标识统一为 `transcribe-hints:v1`，并同步 API 用量记录、线上验证脚本和 RN mock。
- 新增纯函数与 provider 测试，覆盖允许转换、禁止越界和原始转写保留。
- 本次未向 DashScope provider 注入自定义 hotwords；该能力仍不在当前实现范围。
- 验证通过：`pnpm --filter @icao/api check`（2 个测试文件、42 项测试）和 `pnpm check`（RN 24 个测试套件、55 项测试，contracts/API 检查与构建通过）。
