# 正式题库数据迁移技术盘点

## 盘点目的

确认本项目在不破坏当前 UI 和统一代码框架的前提下，能否按精简数据结构接入 `feizhuicu` 的真实题库文本。

## 总体判断

可以执行。当前项目已经具备统一题库入口、统一目录页和统一学习页，适合只替换数据模型和数据来源；不需要迁移 `feizhuicu` 的生产页面、路由或完整 JSON。

## 当前项目现状

- 题库入口集中在 `lib/question-banks/registry.ts`。
- 题库数据目前来自 `lib/question-bank-data.ts`。
- 目录页统一链路为 `QuestionBankView -> CatalogView -> LayoutAccordion`。
- 学习页统一链路为 `QuestionBankView -> CardStudyView`。
- 学习页已按三段结构组织：音频/任务模块、原文/理解模块、控制台模块。
- 当前代码已有 `consoleTabs`、`audioTitlePattern`、`showChoicePrompt` 等差异配置基础。

## 源数据现状

`feizhuicu` 的真实题库数据位于：

- `../feizhuicu/public/data/question-bank/mini-v1/listening/questions.json`
- `../feizhuicu/public/data/question-bank/mini-v1/sentence900/questions.json`
- `../feizhuicu/public/data/question-bank/mini-v1/story/questions.json`
- `../feizhuicu/public/data/question-bank/mini-v1/opi/topics.json`
- `../feizhuicu/public/data/question-bank/mini-v1/atc/scenarios.json`

可用内容包括题干、原文、翻译、选项、正确答案、参考答案和目录分类。源 JSON 中也有大量本项目不需要的生产字段，本轮不迁移。

## 已具备基础

- 本项目已经完成题库模块统一维护方向。
- 数据结构文档 `docs/resources/domain/question-bank-study-structure.md` 已明确学习页显示规则。
- 源项目已有真实题库文本，可用脚本抽取。

## 主要缺口

- `QuestionBankCard` 仍使用 `question/answer` 这种旧语义，不够贴合当前 UI。
- 缺少本项目自有的精简题库 JSON。
- 缺少从 `feizhuicu` 抽取必要文本并重构为本项目数据的脚本。
- 缺少数据对账报告。

## 风险分级

- P0：不能破坏当前 UI 结构和统一组件框架。
- P0：不能完整迁移 `feizhuicu` JSON 或生产字段。
- P1：真实数据量较大，长文本可能暴露移动端拥挤问题。
- P1：不复制音频时，音频播放只能依赖文本朗读或后续资源接入。
- P2：陆空通话呼号标题需从场景标题中保守解析。

## 第一阶段建议

先完成精简数据结构、抽取脚本、生成本项目 JSON、接入 registry 和基础验证；视觉细节只做满足需求的文案/字段适配，不做重设计。
