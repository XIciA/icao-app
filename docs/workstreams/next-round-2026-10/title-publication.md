# PR277 显示字段增量发布

此文是本轮操作说明，不授权生产写入。生产操作仅由统一发布协调任务执行。

## 输入与保护

使用 `tools/content-orders.mjs sources <live-sources.json>` 获取当前后台真实有效快照（沿用既有受控 `ICAO_OPS_URL` / `ICAO_OPS_TOKEN`，不把凭据写进命令记录）。不可用仓库内嵌v27或旧app-content v31代替实时快照。

离线准备器：

```sh
node tools/prepare-display-title-delta.mjs <live-sources.json> <fresh-output-prefix> [question-order.json]
```

只匹配已确认的 `topic-name-changes.json` 和 `display-field-changes.json`：

- 精确ID定位话题/card；仅允许 `topic.name`、`card.taskTitle`、`card.imageAlt`。
- 线上值等于before才改；等于after跳过；不同或缺ID报告冲突，退出1且不生成草稿。不得把冲突字段按本地值强制覆盖。
- 输出前还原全部拟改字段，要求与输入完整payload深度相等，保证未知字段、运营新增/调整、英文正文、翻译、资源路径、顺序、等级和身份均保留。
- 保存 `.report.json`（线上版本/摘要、变更、已应用、冲突）和 `.draft.json`。输出前缀必须全新，防止误用旧候选。
- 草稿仅带线上bank的baseChecksum，不指定发布版本；不改appContent、热点记录、文章、词库或学习数据。

## 执行顺序（协调任务）

1. 导出实时sources；先无order参数离线准备，检查report。如果全已应用，不创建工单。存在冲突先核对并重新准备，不能继续使用旧草稿。
2. 无冲突且有增量时，使用既有 `content-orders.mjs create <input.json> <order.json>` 创建kind=questions的审核工单；input包含kind、text，描述PR277显示字段更新即可。再读取一次实时sources，以新前缀和order文件重跑准备器（支持create返回的 `{order,...}` 或纯order对象）。
3. `node tools/content-orders.mjs prepare <prefix.draft.json>`。保存返回的 `<prefix.draft.json.prepared.json>`，核对服务端标准化/并发重基后的字段差异仍是批准范围。已有后台 `rebaseBank` 保留无关并发编辑，同字段并发冲突拒绝。
4. 完成审核后，由协调任务调用 `node tools/content-orders.mjs publish <order-id> <prefix.draft.json.prepared.json>`。现有服务在发布锁内重新校验，bank版本从线上该bank历史最大值+1递增；不把本地27当作线上目标版本。
5. `node tools/content-orders.mjs verify <order-id>`；再次导出sources，以新前缀重跑离线准备，确认全部已应用、无剩余变更/冲突；核对API目录、原题、图片/音频引用以及既有热点跳转。

热点标题不另发旧app-content快照：PR277客户端按topicId从当前题库解析标题，旧热点标题不是身份校验条件。若协调任务另外发现需要更新历史显示字段，应按其当前线上快照另做明确增量审核，不从本地旧热点整表覆盖。

## 已完成的本地校验

- `node --test tools/prepare-display-title-delta.test.mjs`：4项通过，覆盖无关运营内容保留、同字段冲突、重复运行、缺ID及非显示字段拒绝。
- 在PR277开发前仓库基线e742f7f0上离线演练：3467个显示字段，3个bank（sentences900/radiotelephony/opi），0冲突；未用此本地基线作生产输入。
- 该完整候选通过当前服务端 `parseDraft` 及三个bank的 `validateBank(candidate, baseline)`。
- 尚未读取或写入本轮生产快照，本地通过不代表当前线上没有运营冲突。
