# 正式题库数据迁移路线图

## 文档定位

本路线图承接 `requirements.md`、`technical-plan.md` 和 `technical-audit.md`，用于按小流程执行本次任务。

## 总体推进原则

- 先定义本项目需要的数据结构，再抽取真实文本。
- 只迁当前 UI 会读取的字段。
- 保持五个模块统一目录页和统一学习页。
- 只复制听力音频，不迁其它模块完整音频，不迁生产功能。
- 每阶段完成后做类型、构建或数据校验。

## 阶段总览

| 阶段 | 目标 | 核心产出 | 进入下一阶段标准 |
| --- | --- | --- | --- |
| 1 | 数据结构收口 | `QuestionBankCard` 精简字段、学习页读取新字段 | 类型检查通过 |
| 2 | 数据抽取脚本与听力资源 | 从 `feizhuicu` 抽取必要文本、生成本项目 JSON、复制听力音频 | JSON 可解析、字段精简、听力音频可对账 |
| 3 | registry 接入 | 五个模块使用重构后的真实数据 | 数量和分类可对账 |
| 4 | UI 规则确认 | 五个模块学习页标题和控制台页符合需求 | 移动端结构不变 |
| 5 | 验证收口 | 类型检查、构建、阶段记录 | 验证通过，风险清楚 |

## 第一阶段：数据结构收口

### 阶段目标

把卡片字段从旧的 `question/answer` 语义改成服务当前 UI 的精简字段。

### 允许修改范围

- `lib/question-bank-data.ts`
- `lib/question-banks/*`
- `components/question-bank/card-study-view.tsx`

### 禁止范围

- 不改变学习页整体布局。
- 不新增模块专属页面。

### 验收标准

- 学习页仍按三段结构工作。
- TypeScript 能识别新字段。

## 第二阶段：数据抽取脚本与听力资源

### 阶段目标

生成本项目自有精简 JSON，只包含 UI 使用字段；迁移听力音频并按任务标题重命名。

### 允许修改范围

- `scripts/`
- `lib/question-banks/data/`
- `public/question-bank/listening/`
- `docs/records/workstreams/formal-question-bank-migration/`

### 禁止范围

- 不复制 `feizhuicu` 完整 JSON。
- 不复制除听力外的音频目录。

### 验收标准

- 生成 JSON 不包含 `schemaVersion`、`source`、`rawSourceId`、生产 manifest 等无关字段。
- 五个模块都有真实文本数据。
- 听力音频数量与听力题数量一致，文件名与 `taskTitle` 一致。

## 第三阶段：registry 接入

### 阶段目标

让本项目题库 registry 使用生成后的精简真实数据。

### 允许修改范围

- `lib/question-banks/`
- 必要的导入导出文件。

### 验收标准

- 首页、目录页、学习页都读取同一份 registry。
- 五个模块数量可对账。

## 第四阶段：UI 规则确认

### 阶段目标

确认五个模块展示规则符合需求。

### 允许修改范围

- `components/question-bank/card-study-view.tsx`
- 数据配置中的 `study` 字段。

### 验收标准

- OPI、听力、900句、陆空通话、故事复诵的任务标题和控制台页符合需求。
- 听力不显示额外的 `选择答案` 标题。

## 第五阶段：验证收口

### 阶段目标

完成数据对账、类型检查、构建和阶段记录。

### 验收标准

- `pnpm exec tsc --noEmit` 通过。
- `pnpm run build` 通过，或失败原因清楚且与本任务无关。
- `phase-log.md` 记录完成内容、验证结果和未做事项。
