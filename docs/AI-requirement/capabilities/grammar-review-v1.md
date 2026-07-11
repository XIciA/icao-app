# grammar-review:v1

本文档管理 `grammar-review` 能力的专属内容：目标、输入输出、prompt draft 和引用入口。共性输出质检规则维护在 `../shared/output-quality-rules-v1.md`，样例正文维护在 `../evals/grammar-review-samples.md`。

## 1. 基本信息

- 字段: Prompt ID
  内容: `grammar-review:v1`

- 字段: 能力
  内容: `grammar-review`

- 字段: 输出结构
  内容: `overallFeedbackZh`, `issues`, `correctedText`

- 字段: 专属规则
  内容: 明确硬语法错误检查和保守纠错

- 字段: 共性规则
  内容: `OQ-001` - `OQ-008`, `GR-OQ-001` - `GR-OQ-004`

- 字段: 当前状态
  内容: 已有 prompt 草稿

## 2. 能力目标

- 做什么: 逐条指出明确语法错误
  不做什么: 不做表达润色

- 做什么: 给出修正后的完整原句
  不做什么: 不生成标准答案

- 做什么: 保留用户原意和句子结构
  不做什么: 不根据题目补充新信息

- 做什么: 用中文解释错误
  不做什么: 不打分、不评价发音或流利度

## 3. 输出结构

- Field: `overallFeedbackZh`
  内容要求: 一句中文整体反馈，不打分
  Related Rules: OQ-003, OQ-008, GR-OQ-001

- Field: `issues`
  内容要求: 明确硬语法错误列表；无明显错误时为空数组
  Related Rules: GR-OQ-002, GR-OQ-004

- Field: `correctedText`
  内容要求: 纠错后的完整原句，只保守纠错，不润色、不扩写
  Related Rules: OQ-005, OQ-007, GR-OQ-003

## 4. Prompt Draft

### System

```text
你是英语语法纠错助手。

你的任务是检查学习者输入的英文，只指出明确的通用英语硬语法错误。

要求：
- 只检查通用英语硬语法错误，例如主谓一致、时态、冠词、介词、单复数、基本句子结构等。
- 暂时不要纠结航空词汇是否特别精准、专业或高级。
- 不做表达润色。
- 不改写成更高级表达。
- 不生成标准答案。
- 不根据题目补充用户没有表达的新内容。
- 输出要像简洁笔记。
- 每条错误尽量使用格式：“I is” → “I am”：主语 I 后应使用 am。
- 最后给出纠错后的完整原句。
- correctedText 只纠错，不润色，不扩写。
- 如果没有明显硬语法错误，issues 返回空数组，correctedText 尽量保持原文。
- 遵守规则：OQ-001, OQ-002, OQ-003, OQ-004, OQ-005, OQ-007, OQ-008, GR-OQ-001, GR-OQ-002, GR-OQ-003, GR-OQ-004。
```

### User

```text
请检查下面这段学习者英文：

{{inputJson}}
```

### Return JSON

```json
{
  "overallFeedbackZh": "一句中文整体反馈，不打分。",
  "issues": [
    "1. “I is” → “I am”：主语 I 后应使用 am。"
  ],
  "correctedText": "纠错后的完整原句。"
}
```

## 5. 引用入口

- 内容类型: 输出质检规则
  用途: JSON、字段、边界和风格规则
  位置: `../shared/output-quality-rules-v1.md`

- 内容类型: few-shot 筛选规则
  用途: 判断哪些样例可进入 prompt examples
  位置: `../shared/few-shot-selection-v1.md`

- 内容类型: 常见错误
  用途: 提供语法错误和边界样本
  位置: `../domain/aviation-common-errors.md`

- 内容类型: 输出样例
  用途: 验证是否只做语法纠错
  位置: `../evals/grammar-review-samples.md`

## 6. 技术映射

- 内容: Prompt draft
  后续可能落地位置: `features/ai/capabilities/grammar-review/prompt.ts`
  状态: ready
  审核结论: 可同步进入运行时 prompt，继续限制为硬语法纠错

- 内容: Few-shot candidates
  后续可能落地位置: `features/ai/capabilities/grammar-review/examples.ts`
  状态: ready
  审核结论: 只选 `../evals/grammar-review-samples.md` 中标为 few-shot 的 ready 样本

- 内容: Output quality rules
  后续可能落地位置: `features/ai/capabilities/grammar-review/schema.ts`
  状态: ready
  审核结论: 可作为 schema / forbidden-field 校验的规则来源
