# Workstreams 使用说明

`docs/workstreams/` 是专题任务的过程与验收记录，不是一个需要全量加载的规则库。

- 当前用户任务、当前分支或明确指定的目录决定本轮 active workstream。
- 同一任务只读取直接相关的 requirements、technical plan、phase log 和 closeout。
- 已完成 workstream 的状态、旧命令和临时限制均视为历史证据，不能覆盖当前架构、代码和稳定规范。
- workstream 中沉淀出的长期规则应提升到 `docs/current/`、`docs/design/`、`docs/guides/`
  或 `docs/operations/`；完成后不要求 Codex 持续读取整个过程记录。
- 新任务不强制创建固定数量的文档。是否创建 workstream 由任务风险、持续时间和协作需要决定。
