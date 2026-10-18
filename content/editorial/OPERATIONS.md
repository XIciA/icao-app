# Editorial 操作入口

OPI 热点与资源分享的编辑、审核授权和统一归档只有一套标准：
[内容处理规则](../../docs/rules/content-processing.md)。本文件仅说明工具分工，不另设编辑或审批规则。

## 当前工单路径

文件夹、后台和聊天素材按统一规则处理。现有后台工单工具操作见
[内容工单操作](../../docs/workstreams/feature-update-2026-10/content-operations.md)。

- `tools/content-orders.mjs`：拉取、开始、退回和提交草稿。其 CLI 的 publish 仅支持普通题库；OPI／文章通过现有后台发布入口完成，不绕过鉴权。
- `tools/prepare-question-order.py`：依据整理计划准备题库和热点；完整英文问句及来源判断由处理者负责。
- `tools/prepare-article-order.mjs`：将保真整理计划转为文章草稿及品牌封面。
- `services/api/scripts/stage-content-resources.mjs`：校验、上传及登记不可变资源。
- 后台发布服务：事务更新内容快照和工单；发布后继续核对线上内容与资源，并完成统一归档。

## 历史 Editorial 文件工具

`content/editorial/` 保存历史文件式文章源，`dist/editorial-release/` 为确定性生成物，不能手改。
后台工单更新后的有效内容以服务端当前快照为准；本地 registry 不是线上全部文章清单。

`editorial:extract/check/build/preview/publish/verify-live` 仍是现存工具命令，不是另一套编辑政策。
只有实际需要维护文件式来源时才使用；采用前检查与线上最新完整内容及版本是否一致，避免以旧本地集合覆盖工单新增内容。
旧 review.json 的状态字段是这些脚本的技术兼容格式，不要求所有工单重复维护一套状态。所需审批字段只能依据实际审核或本次明确的“处理并上线”授权填写，不能伪造预览验收。

内容更新不固定伴随数据库迁移、API 或 Web 部署。需要这些动作时遵守项目长期边界与仓库管理规则，不执行冻结的 Vercel 链路。

## 交接

交接记录材料编号与来源、工单／内容 ID、当前修订、最终内容位置、待确认项、审核或发布授权范围、发布版本及校验结果、归档位置。下一执行者核对实际状态；不得仅凭上游声称已完成就发布或重复发布。
密钥、数据库备份和签名材料不进入原始材料、归档、仓库或聊天输出。

## 完整发布验收

每次 OPI 发布均执行 [内容处理规则的完整发布链路](../../docs/rules/content-processing.md#完整发布链路2026-10-19-用户确认固化)，包含正式题库、答案、独立音频、上线核验及归档。展示反馈问法与练习朗读文字须明确区分。历史批次先核对 [实现差距](../../docs/workstreams/content-workflow/chain-audit-2026-10-19.md)，不能直接把预览 JSON 当作可发布工单。

历史多考点批次使用同一工单服务的 `hotspotUpdates`，具体字段与审核后执行步骤见 [历史批次发布操作](../../docs/workstreams/content-workflow/historical-publication.md)。不能将本地预览或代码合并当作内容已发布。
