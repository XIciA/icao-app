# ICAO App 项目指令

项目文档的唯一入口是 [docs/README.md](docs/README.md)。每次从入口选择与当前任务直接相关的少量文档。

- 当前用户请求决定本次目标和授权范围。
- 长期约束只来自入口列出的 `docs/rules/`；未经用户明确要求，不得创建、扩写或提升长期规则。
- 先读取 [项目长期边界](docs/rules/project-boundaries.md)，其余规则按任务读取。
- 代码、配置、测试和生成清单决定当前实现事实；发现与约束不一致时报告差异，不把实现自动视为变更授权。
- `docs/tools/` 是按需选用的工作方法；`docs/resources/` 是参考资料；二者不自行增加审批流程或操作权限。
- `docs/workstreams/` 中经用户确认的方案只约束对应任务，不自动适用于其他任务。
- `docs/records/` 保存历史记录。旧“已确认”决定、方案和执行结论不具长期规则效力，也不授权新任务。

Git、提交、PR、发布或清理操作开始前，读取 [仓库管理规则](docs/rules/repository-and-github-management.md)。
UI 任务读取 [UI 风格规范](docs/rules/ui-style-guide.md)；验证与交付读取 [交付与验收规则](docs/rules/delivery-and-acceptance.md)。
