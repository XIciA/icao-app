# 语法复核

## 能力定义

| 项目 | 要求 |
| --- | --- |
| 目的 | 对学习者已经说出或输入的英文回答进行保守语法复核。 |
| 适用题库 | 陆空通话、故事复诵、OPI。 |
| 用户入口 | “我的回答”中的表达分析操作。 |
| 最小上下文 | 题库模块、题目 ID、题目文本、学习者回答文本。 |
| 前置条件 | 录音回答应先完成转写；手动输入可直接复核。 |

## 输入

```json
{
  "module": "atc | story | opi",
  "questionId": "string",
  "questionText": "string",
  "transcript": "string"
}
```

## 结构化输出

```json
{
  "overallFeedbackZh": "string",
  "correctedText": "string",
  "issues": ["string"],
  "promptVersion": "string"
}
```

| 字段 | 要求 |
| --- | --- |
| `overallFeedbackZh` | 用简洁中文总结是否存在明确语法问题。 |
| `correctedText` | 只修正明确语法错误，保留原意、信息量和表达风格。 |
| `issues` | 每项只描述一个可定位的语法问题；无明确问题时返回空数组。 |
| `promptVersion` | 标记本次语法规则版本。 |

## 必须满足

- 只处理可明确判断的语法问题；有疑义时保留原文。
- `correctedText` 与 `issues` 必须一致，不能出现未说明的大幅改写。
- 航空标准表达可以用于判断明显搭配问题，但不能替代学习者原意。
- 无错误时明确说明，并返回与原回答等价的 `correctedText`。

## 禁止行为

- 不做口语流利度、发音、ICAO 等级或考试得分判断。
- 不扩写事实、程序、风险处置或题目未提供的信息。
- 不把语法复核变成表达润色或标准答案生成。
