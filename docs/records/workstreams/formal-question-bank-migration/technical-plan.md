# 正式题库数据迁移技术方案

## 方案概览

本次不采用“复制 `feizhuicu` 全量 JSON 再适配”的方案。

采用：

```text
当前 UI 需要的数据结构
-> 本项目精简题库数据
-> 从 feizhuicu 抽取必要文本填入
-> 仅迁移听力音频并按任务标题重命名
-> 继续使用现有统一目录页和学习页
```

## 总体目标

在不破坏当前 UI 和代码框架的前提下，把真实题库内容填入本项目自己的题库数据结构，让设计稿基于真实内容继续打磨。

## 1. 本项目自有数据结构

作用：
- 固定本项目学习页真正需要的数据字段。
- 避免把 `feizhuicu` 的生产字段、来源字段、manifest 细节和后台属性带进设计稿。

建议核心结构：

```ts
type QuestionBankCard = {
  id: string
  taskTitle: string
  audioText: string
  audioTextZh?: string
  referenceText?: string
  referenceTextZh?: string
  audio?: string
  choices?: string[]
  correctChoiceIndex?: number
}
```

目录层级继续保持：

```text
QuestionBankDataset
  -> categories[]
    -> topics[]
      -> cards[]
```

选择理由：
- 满足当前 UI 的三段式学习页。
- 让五个模块继续统一维护。
- 为 React Native 复刻保留清楚、稳定、干净的数据语义。

## 2. 模块字段映射

### OPI

需要字段：
- `taskTitle`：如 `气象-雷击-1`
- `audioText`：考官问题原文
- `audioTextZh`：中文题意，可选
- `referenceText`：参考答案

控制台：
- 我的回答
- 参考答案
- 笔记

### 听力

需要字段：
- `taskTitle`：如 `10s航空英语-1`
- `audioText`：听力原文
- `audioTextZh`：原文翻译和问题翻译
- `choices`
- `correctChoiceIndex`
- `referenceText`：正确答案说明
- `audio`：迁移后的本项目听力音频路径，文件名与 `taskTitle` 一致

控制台：
- 笔记

### 900句

需要字段：
- `taskTitle`：如 `Sentence1`
- `audioText`：句子原文
- `audioTextZh`：中文翻译

控制台：
- 我的回答
- 笔记

### 陆空通话

需要字段：
- `taskTitle`：如 `ACA 121-1`
- `audioText`：通话原文
- `audioTextZh`：原文翻译
- `referenceText`：标准表达
- `referenceTextZh`：标准表达翻译

控制台：
- 我的回答
- 参考答案
- 笔记

### 故事复诵

需要字段：
- `taskTitle`：如 `飞行ICAO-必做题库-1`
- `audioText`：故事原文
- `audioTextZh`：翻译，可选
- `referenceText`：复述参考或关键提示

控制台：
- 我的回答
- 参考答案
- 笔记

## 3. 数据来源策略

`feizhuicu` 只作为文本来源，不作为结构来源。

允许读取：
- 听力选项、答案、音频原文、翻译。
- 900句原文、翻译和编号。
- 陆空通话原文、翻译、标准表达。
- OPI 题干、参考答案和分类。
- 故事正文、分组和复述提示。

不迁移：
- `schemaVersion`
- `source`
- `rawSourceId`
- 生产 manifest 细节
- 进度、标注、学习记录
- 旧项目页面路由或 feature 目录结构
- 当前 UI 不展示的扩展字段

听力音频例外：
- 从 `feizhuicu/public/question-bank/listening/` 复制。
- 输出到本项目 `public/question-bank/listening/`。
- 文件名使用本项目任务标题，例如 `10s航空英语-1.mp3`。
- JSON 中只保留本项目播放需要的 `audio` 路径，不保留源音频路径。

## 4. UI 与代码边界

允许修改：
- 题库数据类型命名和字段读取方式。
- 学习页三段结构中的标题和 tab 配置。
- 听力去掉额外的 `选择答案` 文案。
- 900句控制台只显示 `我的回答 / 笔记`。

禁止修改：
- 当前整体 UI 风格。
- 当前目录页和学习页的统一组件框架。
- 导航结构。
- 生产功能，如登录、进度、标注、AI、后台管理。

## 5. 不采用的方案

### 不复制 feizhuicu 全量 JSON

原因：
- 字段过多，包含大量本设计稿不用的生产属性。
- 会把旧项目结构带入本项目，削弱当前统一 UI 数据模型。

### 不迁移 feizhuicu 题库页面

原因：
- 会破坏本项目高保真移动端设计稿定位。
- 会导致每个模块重新变成独立实现。

### 不复制完整音频

原因：
- 音频约 639MB，资源策略需要单独确认。
- 本轮只复制已明确纳入范围的听力音频，其它模块音频后续单独确认。

## 总结

本次迁移的技术路线是：先按当前 UI 定义干净的数据框架，再从 `feizhuicu` 中抽取必要文本填入。数据服务设计稿，不让生产项目结构反向主导本项目。
