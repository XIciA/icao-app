# 历史 OPI 批次发布操作

这是工具说明，不增加授权。编辑、审核、音频与归档标准仍以 [内容处理规则](../../rules/content-processing.md) 为准。

## 候选字段与版本要求

历史批次使用 questions 工单，draft 与 plan 添加 `hotspotUpdates:{baseChecksum,briefs}`。baseChecksum 是读取时有效 App 内容快照的 checksum；briefs 只包含要替换的已有热点，保留 ID、日期、标题、考点。后台校验所有最终热点引用与题库目录、题目状态一致，并与 banks 在一个事务中发布。不得用新 OPI 工单伪造历史日期/单考点 ID。

Ops 服务必须先运行包含本次兼容代码的 main 提交；不需要数据库迁移。客户端继续读取相同热点/题库合同。旧 Ops 不认识该字段，CLI prepare 会检测返回草稿字段是否被丢弃并报错，不能继续发布。代码进入 main 不会更新生产 Ops，也不会发布内容。

## 准备、审核与发布

以下从干净 main 运行。`CANDIDATE` 为候选目录绝对路径；现有安全环境提供 Ops 登录及资源服务凭据，不在命令或文档中写入密钥。候选最初使用离线占位工单 ID，不可直接提交。

1. 阅读 `changes.json`、`validation.json` 和 `预览.html`，逐条试听新增音频，记录试听结果；按现有授权落实审核。
2. 重新读来源并校验，版本不符时重新整理候选，不能仅更改 checksum 绕过冲突：

```sh
node tools/content-orders.mjs sources "$CANDIDATE/latest-sources.json"
pnpm --dir services/api exec tsx scripts/validate-history-candidate.mjs "$CANDIDATE/latest-sources.json" "$CANDIDATE/draft.json" "$CANDIDATE/resources.json" "$CANDIDATE/files"
```

3. 校验资源；获得本次发布授权并确认候选后，在既有安全资源环境上传及验证字节：

```sh
RESOURCE_MANIFEST="$CANDIDATE/resources.json" RESOURCE_ROOT="$CANDIDATE/files" node services/api/scripts/stage-content-resources.mjs --validate
RESOURCE_MANIFEST="$CANDIDATE/resources.json" RESOURCE_ROOT="$CANDIDATE/files" node services/api/scripts/stage-content-resources.mjs --verify-existing
```

第二条会写入存储及资源登记；它不发布题库。上传失败保留旧正式内容，不覆盖旧音频。

4. 第一次创建工单，记录返回 ID。重试时复用已有工单，不能反复 create：

```sh
node tools/content-orders.mjs create "$CANDIDATE/create-order.json" "$CANDIDATE/server-order.json"
node tools/content-orders.mjs bind "$CANDIDATE/draft.json" "$CANDIDATE/server-order.json"
node tools/content-orders.mjs prepare "$CANDIDATE/draft.json.bound.json"
```

prepare 保存 `.prepared.json`，包含后台实际校验/合并后的完整草稿和修订号。若后台合并了其他题库修改，检查实际草稿再发布；绑定不会重新合成音频或修改已经审核的候选正文。

5. 将返回的真实 ID 设为 `ORDER_ID`，核对后台预览与授权后发布并校验：

```sh
node tools/content-orders.mjs publish "$ORDER_ID" "$CANDIDATE/draft.json.bound.json.prepared.json"
node tools/content-orders.mjs verify "$ORDER_ID" > "$CANDIDATE/verification.json"
node tools/content-orders.mjs sources "$CANDIDATE/published-sources.json"
```

CLI 会核对审核文件与当前工单 ID、修订、草稿一致；版本或内容发生变化时停止。发布重复请求由服务端幂等处理。后台验证报告不是客户端播放验收。

6. 核对正式版本、21 期热点引用、题目及答案、停用状态，以及新音频线上字节和实际学习入口播放。记录三端使用最新内容的结果；旧学习会话允许保留旧快照，重新进入时检查。
7. 全部本批发布项验证通过后，将原始试处理批次移入统一已处理目录，保留原件字节和原路径，附上工单、授权、版本、资源清单、验证证据。更新总索引和待复核清单。5 道反馈仍标记暂缓，不能计作已上线；其中 4 道旧题临时停用，opi-core-034 仅排除错配反馈、保留正常旧题；2 道修正项在验证成功后才标记完成。发布成功但归档失败时仅补归档，不重发。

## 本轮交付位置与限制

候选在项目 `原始资源资料/资源分享与opi热点/未处理/OPI热点/2026-10-19_已发布热点全量试处理/发布候选/`，交接索引为 `.generated/content-processing-handoff.json`。候选包括原始线上快照、计划、结构化草稿、答案、两个不可变 MP3、变更说明与离线校验。大体积素材不作为代码提交。

本次没有执行资源上传、工单创建、正式发布、生产部署、版本提升或迁移。音频解码校验不能代替试听；现有未改题的答案与音频复用，不声称所有历史材料均重新完成专业事实审查。
