# 语法复核

状态：`implemented-v2`。

## 能力定义

| 项目 | 要求 |
| --- | --- |
| 目的 | 对学习者已经说出或输入的英文进行语法复核。 |
| 适用题库 | 陆空通话、故事复诵、OPI。 |
| 用户入口 | “我的回答”中的表达分析操作。 |
| 前置条件 | 录音回答应先完成转写；手动输入可直接复核。 |
| 实现方式 | 服务端直接调用 LLM，并以结构化输出校验结果。 |

## 输入

```json
{
  "transcript": "I has turbulence and request deviation."
}
```

接口可以保留 `module`、`questionId` 和 `questionText` 用于日志、学习记录和页面关联；它们不属于本能力调用 LLM 的必要上下文。

## 结构化输出

```json
{
  "issues": [
    "“I has” → “I have”：主语 I 后应使用 have。",
    "“request” → “request a deviation”：原句缺少正确的谓语结构。"
  ],
  "correctedText": "I have turbulence and request a deviation."
}
```

| 字段 | 要求 |
| --- | --- |
| `issues` | 每项只描述一个明确的语法、拼写或标点问题；包含原表达、修改结果和简短原因。无明确问题时返回空数组。 |
| `correctedText` | 修正后的完整英文文本；只修复语言错误，保留原始信息和意思。 |

技术元数据（如 `promptVersion`）可由服务端在响应封装中附加，但不属于 LLM 的业务输出，也不在学习页展示。

## 必须满足

- 只处理明确的英语语法、拼写或标点问题；有疑义时保留原文。
- `correctedText` 与 `issues` 必须一致，不能包含未列出的实质修改。
- 无明确问题时，`issues` 为空数组，`correctedText` 保持原文。
- 使用固定的简洁 Prompt；不向模型注入民航术语库、短语库、常见错误样本或检索上下文。
- 模型只返回 JSON，服务端必须校验结构后才向客户端返回结果。

## 禁止行为

- 不做表达润色、词汇升级或“更专业”的措辞替换。
- 不扩写或补充用户没有表达的事实、原因、程序或处置。
- 不做口语流利度、发音、ICAO 等级或考试得分判断。
- 不生成标准答案、学习建议、解释性长文或额外字段。

## Prompt 草稿

```text
You are an English grammar checker.

Review the learner's English text.
Return only valid JSON matching the required schema.

Rules:
- Identify only clear grammar, spelling, or punctuation errors.
- Put each issue in a separate Chinese string: “original” → “correction”：brief reason.
- Provide one correctedText that preserves all original meaning and information.
- If there are no clear errors, return an empty issues array and keep correctedText unchanged.
- Do not improve style, replace wording for professionalism, add information, score, grade, or provide learning advice.
```

## 实施影响

- 已删除 `overallFeedbackZh`；前端以 `issues` 展示问题，空数组显示固定提示。
- 共享契约、服务端 Zod schema、运行时 Prompt、学习页展示和测试必须在同一变更中同步更新。
- 运行时使用服务端固定 Prompt，版本为 `grammar-review:v2`；不加载领域检索资产。
