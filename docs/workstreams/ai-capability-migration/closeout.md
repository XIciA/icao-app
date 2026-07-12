# AI 能力迁移收尾

## 完成范围

- 已迁移 `feizhuicu` 的 AI prompt、schema、domain、ASR hints、normalization、provider、response envelope 和 API route。
- 已接入查词、语音转写、语法纠错、OPI 表达分析、900句原文对比。
- 查词 UI 已对齐 `AI 查词 / 释义 / 本句理解`。
- 模块按钮文案已对齐：900句 `对比原文`、陆空通话 `检查语法`、OPI `分析表达`、故事复诵 `检查语法`。
- AI 结果展示在控制台 `我的回答` 区域。
- 听力模块本轮只保留查词。

## 验证结果

- `pnpm exec tsc --noEmit` 通过。
- `pnpm build` 通过。
- `http://localhost:3000/` 返回 200。
- `/api/ai/word-lookup` 返回 `ok:true`。
- `/api/ai/grammar-review` 返回 `ok:true`。
- `/api/ai/opi/transcribe` 返回 `ok:true`。
- `/api/ai/opi/grammar-review` 返回 `ok:true`，包含 `promptVersion` 和 `polishPromptVersion`。

## 本地运行

当前已有 Next dev server 运行在：

```text
http://localhost:3000
```

当前项目已迁入 `.env.local`，AI key 内容不写入文档。

## 2026-07-12 ASR 运行时补充收口

- 已补齐此前只存在于内容资产和上游参考代码中的航空转写归一化运行时逻辑。
- `rawTranscript` 保持供应商原文，`transcript` 使用 `transcribe-hints:v1` 的保守航空规则处理。
- 已覆盖 FL、ICAO 数字、跑道、航向、气压、应答机、频率、高度、航空缩写和受限 ICAO 拼读组合。
- 普通单词、无明确上下文的数字和学习者语法错误保持不变。
- DashScope 自定义 hotwords 仍未接入，不能把内容资产中的 hotwords 列表标记为 provider 已启用。
- `pnpm --filter @icao/api check` 与 `pnpm check` 均通过。
