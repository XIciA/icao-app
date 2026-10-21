# ICAO App 文档入口

这里是项目文档的唯一导航入口。根目录 AGENTS.md 和其他工具入口统一指向这里。
只读取与当前任务相关的少量文件，不遍历全部文档。

## 人工维护的长期约束

以下是长期约束的完整清单。由用户决定新增、修改或撤销；Codex 不得把自己的方案、工具方法或历史结论提升为规则。

| 文档 | 约束范围 |
| --- | --- |
| [项目长期边界](rules/project-boundaries.md) | 技术栈、职责唯一来源、权限、冻结范围与版本更新 |
| [UI 风格规范](rules/ui-style-guide.md) | 品牌视觉、组件气质与核心交互 |
| [仓库管理规则](rules/repository-and-github-management.md) | 单主干、提交、发布来源与清理 |
| [交付与验收规则](rules/delivery-and-acceptance.md) | 最终环境、必要检查与验收状态 |
| [内容处理规则](rules/content-processing.md) | OPI 完整英文问题、资源文章保真、统一审核与归档 |
| [录音维护原则](rules/recording.md) | 录音职责、资产有效性与防回归 |

## 工作方法与参考资料

- [项目管理概览与产品状态](resources/project/product-state.md)：各渠道交付、待验事项与下一步；链接原始证据。
- [运行时拓扑](resources/project/runtime-topology.md)：Native、EdgeOne 产品 Web、宣传站与退役站点关系。
- [工具目录](tools/README.md)：常用工具的用途、输入输出、副作用与验证入口，以及可选流程模板。
- `resources/project/`：状态与运行时参考，使用前对照代码、配置和交付证据。
- `resources/domain/`：ICAO、题库及音频文本资料。
- `resources/ai/`：AI 能力与领域资产参考。
- `resources/operations/`：运维与操作参考。
- [开发者参考](resources/developer/README.md)：命令、本机操作和具体实现说明。

资料中的“必须”“已确认”等原文不能自行变成项目长期规则，也不能授予发布、付费、数据修改或外部操作权限。

## 任务方案与历史记录

- [任务目录](workstreams/README.md)：任务范围内的需求、方案、盘点、路线和执行材料。只有当前用户确认采用的内容才指导对应任务；目录存在不表示任务正在执行。
- `records/`：历史任务、证据、事故、迁移和归档资料；按回溯、排障或用户指定的需要读取。
- [历史 D1—D9 决策](records/decisions/native-commercialization/README.md)：旧商业化任务的决策记录，已退出长期规则体系。

历史材料的“已确认”仅表示当时的确认，不能约束新任务。正在执行的方案也不能覆盖用户当前要求或自动扩大操作授权。

## 使用依据

当前用户请求确定目标和权限；人工长期约束规定持续边界；代码、配置、测试和生成清单证明当前实现事实。
这三者发生差异时，核对并报告，不以旧记录替代当前事实，也不由 Codex 自行修改规则来消除差异。
普通任务直接完成必要实现与验证；只有任务确实需要组织方案时，才选用工具目录中的流程。
