# 题库学习页数据结构

当前五个题库模块统一走同一套目录页和学习页组件：

- 目录页：`QuestionBankView` -> `CatalogView` -> `LayoutAccordion`
- 学习页：`QuestionBankView` -> `CardStudyView`
- 数据源：`questionBankDatasets`

## 统一结构

每个题库模块都是一个 `QuestionBankDataset`：

```ts
{
  id,
  title,
  categoryUnit,
  topicUnit,
  cardUnit,
  study,
  categories,
}
```

目录数据统一为：

```ts
categories[] -> topics[] -> cards[]
```

学习页统一为三段：

```ts
学习页 =
  音频模块
  原文模块
  控制台模块
```


## 差异配置

| 模块 | 音频标题规则 | 原文标题 | 控制台页 |
| --- | --- | --- | --- |
| OPI | `category-topic-index`，如 `气象-雷击-1` | 音频原文 | 我的回答 / 参考答案 / 笔记 |
| 听力 | `category-index`，如 `10s航空英语-1` | 音频原文 | 笔记 |
| 900 句 | `sentence-number`，如 `Sentence1` | 音频原文 | 我的回答 / 笔记 |
| 陆空通话 | `callsign-index`，如 `ACA 121-1` | 音频原文 | 我的回答 / 参考答案 / 笔记 |
| 故事复诵 | `category-topic-index`，如 `飞行ICAO-必做题库-1` | 音频原文 | 我的回答 / 参考答案 / 笔记 |


模块显示规则固定为：
OPI
音频/任务模块：气象-雷击-1
原文/理解模块：音频原文
控制台：我的回答 / 参考答案 / 笔记

听力
音频/任务模块：10s航空英语-1
原文/理解模块：音频原文
控制台：笔记
删除当前“选择答案”标题文字。

900句
音频/任务模块：Sentence1
原文/理解模块：音频原文
控制台：我的回答 / 笔记

陆空通话
音频/任务模块：ACA 121-1
原文/理解模块：音频原文
控制台：我的回答 / 参考答案 / 笔记

故事复诵
音频/任务模块：飞行ICAO-必做题库-1
原文/理解模块：音频原文
控制台：我的回答 / 参考答案 / 笔记

