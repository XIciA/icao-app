# ICAO App 文档入口

本目录按“当前事实、稳定规范、任务记录、人工笔记、历史档案”分层。Codex 不需要遍历全部
Markdown；先从本页选择与任务直接相关的文档。

## 当前事实

- [当前产品状态](current/product-state.md)：产品能力、账号模式与各端定位。
- [运行时拓扑](current/runtime-topology.md)：Native、Web、ECS、Supabase 与 Vercel 的边界。
- [架构决策](../战略/architecture-decisions.md)：仍然有效的长期决策及变更方式。
- [总战略](../战略/总战略文档.md)：当前目标、阶段方向和优先级。

## 按任务读取

- UI、交互、响应式布局：[UI 风格与实现规范](design/ui-style-guide.md)。
- 普通开发任务：[小循环](bigandsmall-workflows/orchestration-loop.md)。
- 跨系统或高风险任务：[文档驱动大流程](bigandsmall-workflows/document-driven-development-workflow.md)。
- 验证范围选择：[验证矩阵](engineering/verification-matrix.md)。
- 音频生命周期变更：[音频生命周期与变更规则](guides/audio-lifecycle-and-change-rules.md)。
- 录音问题维护入口：[录音问题解决与维护](rules/problem-solving-and-maintenance/recording.md)。
- 运行时或部署：[部署与运行时规则](operations/deployment-and-runtime-rules.md)。
- 2026-08-07 Native 生产迁移：
  [迁移记录与回滚边界](operations/native-production-migration-2026-08-07.md)。
- Native 商业上线：[技术、备案与负责人最小清单](operations/native-commercial-launch-readiness.md)。
- App 备案填报：[可验证技术字段与第三方服务清单](operations/native-app-filing-fields.md)。
- Native 商店填报：[App Store/Google Play 文案、隐私问卷与审核材料](operations/native-store-submission-materials.md)。
- 常用命令：[开发命令参考](guides/development-command-reference.md)。
- AI 能力与运行时资产：[AI 文档入口](ai/README.md)。

## 任务与历史

- `docs/workstreams/` 保存专题工作的需求、技术决策和验收记录；只有当前任务明确选中的
  workstream 才具有任务约束力，详见 [工作流目录说明](workstreams/README.md)。
- `docs/common-errors/` 是按症状查询的事故记录，不是每个任务的必读规则。
- `docs/developer-notes/` 是给人工开发者的可选笔记，不是 Codex 的默认上下文或执行要求。
- `docs/archive/` 保存被替代的战略、规则、阶段与设计基线，只用于追溯，不得覆盖当前文档。

## 权威判定

1. 当前用户目标决定本次要改变什么。
2. 代码、配置、测试和生成清单决定“目前实际是什么”。
3. 本页列出的当前事实与稳定规范决定持续边界。
4. 被明确选中的 workstream 决定本任务的局部验收目标。
5. 开发者笔记和历史档案不具有规范性。

发现现行文档与代码冲突时，应核对实现并修正文档或明确升级决策；不要同时保留两套现行说法。
