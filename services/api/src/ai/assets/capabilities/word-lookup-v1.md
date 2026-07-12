# word-lookup:v1

本文档管理 `word-lookup` 能力的专属内容：目标、输入输出、prompt draft 和引用入口。共性输出质检规则维护在 `../shared/output-quality-rules-v1.md`，样例正文维护在 `../evals/word-lookup-samples.md`。

## 1. 基本信息

- 字段: Prompt ID
  内容: `word-lookup:v1`

- 字段: 能力
  内容: `word-lookup`

- 字段: 输出结构
  内容: `definition`, `contextExplanationZh`

- 字段: 专属规则
  内容: 当前句子里的单词或短语解释

- 字段: 共性规则
  内容: `OQ-001`, `OQ-002`, `OQ-003`, `OQ-006`, `OQ-008`, `WL-OQ-001` - `WL-OQ-004`

- 字段: 当前状态
  内容: 已有 prompt 草稿

## 2. 能力目标

帮助用户理解当前题目里的英文单词或短语，而不是提供普通词典释义。

- 做什么: 结合当前句子解释
  不做什么: 不列大量普通词典释义

- 做什么: 说明航空英语或 ICAO 语境
  不做什么: 不讲词源

- 做什么: 短语优先解释整体含义
  不做什么: 不写成长篇课堂讲解

- 做什么: 中文为主，简短清楚
  不做什么: 不输出无关例句

## 3. 输出结构

- Field: `definition`
  内容要求: 用英文词性缩写开头；先给民航 / 当前语境义，再给通用义；不使用“通用：”“民航：”标签
  Example: `adv. 低于（飞行高度层）；在……下面`
  Related Rules: WL-OQ-001, WL-OQ-002

- Field: `contextExplanationZh`
  内容要求: 结合原句，用中文解释该词或短语在本句中的具体含义
  Related Rules: OQ-008, WL-OQ-003

## 4. Prompt Draft

### System

```text
你是 ICAO / 民航英语学习助手。

你的任务是解释用户查询的英文单词或短语。你的输出应像“普通词典 + 民航词典”的结合，但必须结合当前句子理解。

要求：
- 输出只包含两个部分：definition 和 contextExplanationZh。
- definition 必须使用英文词性缩写，例如 `n.`, `v.`, `adj.`, `adv.`, `phr.`。
- definition 只写两个含义：第一个是民航 / 当前语境相关含义，第二个是通用含义。
- definition 格式为：`英文词性缩写 民航 / 当前语境义；通用义`。
- definition 不使用“通用：”“民航：”这类标签。
- contextExplanationZh 必须结合原句，用中文解释这个词或短语在本句中的具体含义。
- 如果查询的是短语，优先解释短语整体含义，不逐词硬拆。
- 遵守规则：OQ-001, OQ-002, OQ-006, OQ-008, WL-OQ-001, WL-OQ-002, WL-OQ-003, WL-OQ-004。
```

### User

```text
请解释下面输入中的 word：

{{inputJson}}
```

### Return JSON

```json
{
  "definition": "adv. 低于（飞行高度层）；在……下面",
  "contextExplanationZh": "在原句中，……"
}
```

## 5. 引用入口

- 内容类型: 输出质检规则
  用途: JSON、字段、边界和风格规则
  位置: `../shared/output-quality-rules-v1.md`

- 内容类型: few-shot 筛选规则
  用途: 判断哪些样例可进入 prompt examples
  位置: `../shared/few-shot-selection-v1.md`

- 内容类型: 航空术语
  用途: 补充民航语境解释
  位置: `../domain/aviation-terminology.md`

- 内容类型: 常见表达
  用途: 支持短语整体解释
  位置: `../domain/aviation-phrasebook.md`

- 内容类型: 输出样例
  用途: 评估解释是否短、准、贴题
  位置: `../evals/word-lookup-samples.md`

## 6. 技术映射

- 内容: Prompt draft
  后续可能落地位置: `features/ai/capabilities/word-lookup/prompt.ts`
  状态: ready
  审核结论: 可同步进入运行时 prompt，保持现有响应字段不变

- 内容: Few-shot candidates
  后续可能落地位置: `features/ai/capabilities/word-lookup/examples.ts`
  状态: ready
  审核结论: 只选 `../evals/word-lookup-samples.md` 中标为 few-shot 的 ready 样本

- 内容: Output quality rules
  后续可能落地位置: `features/ai/capabilities/word-lookup/schema.ts`
  状态: ready
  审核结论: 可作为 schema / forbidden-field 校验的规则来源
