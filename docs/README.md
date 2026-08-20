# ICAO App 文档入口

文档只分为三类：人工维护规则、信息资源和过程记录。Codex 应从本页选择与当前任务直接相关
的少量文档，不得遍历整个文档目录。

## 1. 人工维护规则：`docs/rules/`

这是唯一对 Codex 有持续约束力的文档区域。规则由用户明确制定；Codex 不得自行创建、扩写或
提升长期规则。

- [UI 风格与实现规范](rules/ui-style-guide.md)
- [Native 商业化 D1—D9 决策](rules/decisions/)
- [录音问题的解决与维护](rules/problem-solving-and-maintenance/recording.md)
- [交付与验收最简规则](rules/problem-solving-and-maintenance/delivery-and-acceptance.md)
- [普通任务小流程](rules/bigandsmall-workflows/orchestration-loop.md)
- [复杂任务大流程](rules/bigandsmall-workflows/document-driven-development-workflow.md)
- [大流程 / 小流程启动模板](rules/bigandsmall-workflows/workflow-start-prompt-template.md)

只读取与任务匹配的规则。商业化决策只在任务涉及对应产品范围时读取相关文件，不默认加载
D1—D9 全部内容。

## 2. 信息资源：`docs/resources/`

这里保存产品事实、ICAO 与航空领域资料、AI 能力说明、内容规范、运维参考和开发者参考。
它们帮助理解任务，但不会自行授予部署、发布、数据修改或规则变更权限。

- `resources/project/`：当前产品状态与运行时拓扑。
- `resources/domain/`：ICAO 考试、题库结构和音频文本等领域资料。
- `resources/ai/`：AI 能力说明和领域资产入口；运行时事实仍以代码及 manifest 为准。
- `resources/operations/`：发布、备案、账号与内容同步等按需操作参考。
- `resources/developer/`：命令、本机操作、签名和人工清单。

## 3. 过程记录：`docs/records/`

这里保存 AI 和开发过程中的任务资料、日志、报告、截图、事故、迁移记录和旧文档，只用于
回溯、审计、排障或回滚，不得约束新的开发任务。

- `records/workstreams/`：专题任务的需求、计划、阶段日志和收口材料。
- `records/evidence/`：历史截图、构建和验收证据。
- `records/incidents/`：历史故障与排障记录。
- `records/migrations/`：迁移、发布与回滚记录。
- `records/archive/`：已经被替代的规则、战略、设计和阶段材料。

未被用户明确指定的记录不读取。记录中的旧命令、状态、限制和结论不能覆盖当前代码、当前
用户目标或 `docs/rules/`。

## 权威顺序

1. 当前用户请求决定本次目标与权限。
2. 代码、配置、测试和生成清单决定当前实现事实。
3. 与任务直接相关的 `docs/rules/` 决定长期边界。
4. `docs/resources/` 提供按需参考。
5. `docs/records/` 只提供历史证据。

普通任务不要求创建 workstream、phase log、technical plan 或 closeout。发现资料与实现冲突
时，先核对事实并报告差异；未经用户明确要求，不把过程结论提升为新规则。
