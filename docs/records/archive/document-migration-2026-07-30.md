# 2026-07-30 文档治理迁移表

本轮目标是减少过时规则对 Codex 的误导，同时保全设计资产、关键流程与历史证据。

| 原位置/类别 | 处理 | 当前入口 |
| --- | --- | --- |
| 旧 `AGENTS.md` | 原文归档 | `AGENTS.md` |
| 旧 `docs/README.md` | 原文归档 | `docs/README.md` |
| 旧根 README 与交接文档 | 原文归档 | `README.md`、`docs/README.md` |
| 旧战略、架构决策、阶段总则 | 原文归档后重写当前版本 | `战略/` 对应文件 |
| 旧 Web/Tailwind UI 指南 | 原文归档后改为代码原生规范 | `docs/rules/ui-style-guide.md` |
| 旧大小流程与强制启动模板 | 流程原文归档并精简；模板移到开发者笔记 | `docs/rules/bigandsmall-workflows/` |
| Git、本机签名等人工提示 | 移入非规范开发者笔记 | `docs/resources/developer/` |
| 第一阶段、过时阶段 0、邮箱强制登录阶段 | 移入阶段档案 | `docs/records/archive/phases/` |
| `docs/AI-requirement(out)` 迁出快照 | 原文移入 AI 档案 | `docs/records/archive/ai/AI-requirement-out/` |
| 已被 Vercel 后端拆分取代的 Web 在线版 workstream | 原文移入 workstream 档案 | `docs/resources/project/runtime-topology.md` 与 Web 运维手册 |
| 已完成 workstream | 暂保留在 `docs/records/workstreams/` 作为过程证据，不再默认加载 | `docs/records/workstreams/README.md` |

本轮不删除核心设计截图、题库/AI 评测样例、大小流程历史版本或带独有决策的阶段材料。
所有从原路径移出的已跟踪 Markdown 均有档案副本；没有直接销毁含独有信息的文档。
