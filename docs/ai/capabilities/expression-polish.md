# OPI 表达润色

状态：`implemented-v2`。

## 能力定义

| 项目 | 要求 |
| --- | --- |
| 目的 | 在不改变学习者原意的前提下，将英文回答润色为自然、清晰、适合口头表达的英文。 |
| 适用题库 | OPI。 |
| 用户入口 | OPI“分析表达”。 |
| 前置能力 | 优先使用语法复核后的文本；没有复核结果时可直接使用原回答。 |
| 实现方式 | 服务端直接调用 LLM，并以结构化输出校验结果。 |

## 输入

```json
{
  "transcript": "I have turbulence and I tell ATC.",
  "correctedText": "I have turbulence and I tell ATC."
}
```

`correctedText` 可以缺省。存在时，LLM 优先以它为基础；否则使用 `transcript`。接口可以保留 `module`、`questionId` 和 `questionText` 用于日志、学习记录和页面关联，但不属于本能力调用 LLM 的必要上下文。

## 结构化输出

```json
{
  "polishedText": "I encountered turbulence and informed ATC."
}
```

| 字段 | 要求 |
| --- | --- |
| `polishedText` | 润色后的完整英文文本。 |

技术元数据（如 `promptVersion`）可由服务端在响应封装中附加，但不属于 LLM 的业务输出，也不在学习页展示。

## 必须满足

- 保留学习者表达的事实、立场、时序和不确定性。
- 可以修正语法、删去重复、调整句序，让语言更自然、清晰且适合口头表达。
- 输出长度通常与原文接近；原文信息不足时，只优化已有内容，不主动扩写。
- 使用固定的简洁 Prompt；不向模型注入民航术语库、短语库、常见错误样本或检索上下文。
- 模型只返回 JSON，服务端必须校验结构后才向客户端返回结果。

## 禁止行为

- 不补充用户没有说出的原因、处置、数据、人员、机场、航路或结论。
- 不把回答改写为范文、标准答案或完整操作流程。
- 不生成 ICAO 等级、评分、能力评价、学习建议或修改说明。
- 不返回 `issues`、解释文本或其他额外字段。

## Prompt 草稿

```text
You are an English speaking-expression editor.

Rewrite the learner's text into natural, clear spoken English.
Return only valid JSON matching the required schema.

Rules:
- Preserve the learner's original meaning, facts, sequence, and level of certainty.
- Use correctedText as the source when it is provided; otherwise use transcript.
- Improve clarity and naturalness without adding new information.
- Do not turn the response into a model answer.
- Do not provide explanations, scores, grades, advice, or extra fields.
```

## 实施影响

- `polishedText` 是唯一学习页业务输出；现有结构与本草稿一致，无须新增字段。
- 共享契约、服务端 Zod schema、运行时 Prompt、学习页展示和测试必须在同一变更中同步更新。
- 运行时使用服务端固定 Prompt，版本为 `polish:v2`；不加载领域检索资产。
