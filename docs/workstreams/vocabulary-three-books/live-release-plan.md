# 本轮词库联动的发布与回滚

当前状态：代码与候选已准备；生产迁移、部署、资源登记、内容切换尚未执行，尚未获得这些动作的本轮明确授权。TestFlight授权不代替后端和数据库授权。统一发布聊天“协调功能开发并发布 TestFlight”负责集成和唯一构建，本任务不另发移动端候选。

## 可审核的候选

- `content/vocabulary/live/release.json`：live目录初始版本4，1652词，预习389、四级810、五级453；词条与累计policy一个快照。旧v1/v2/v3内容不改。
- 本分支未整合 #277 的题库名称元数据。与 #275/#277 集成后须按最新题库运行 `node tools/build-vocabulary-live.mjs build`，仅更新必要语料摘要/版本，并重做候选校验及录音receipt中的catalog摘要；不能让较早派生词书覆盖这份人工复审结果。
- 当前canonical摘要：`8149b563a5933b28ed4c46673c7ea6d6a4c68374a3d9768699fcfe11d37347a0`。pretty JSON文件SHA-256为 `9e1eb5c1e8f9f125871307ab3513b2c476b5f3f10fb6df4510e8e49d9b7efa87`，两者用途不同；集成重建后以实际重新计算结果为准。
- 完整532个退役ID累计映射在release的`policy.retiredIds`，旧拼写收藏关系在`retiredFavoriteKeys`，每个目标必须为活跃ID或null，不允许环、悬空目标或ID复用。原始人工审核数据不覆盖。445项编辑决定和11组归书调整见curation-report。
- 新增126个MP3，2270952字节；原11093项逐行不变。全部11208个当前所需文本音频校验通过，总manifest11219项，允许保留历史未引用录音。交接目录：`/Users/zhouyide/Desktop/icao-app/outputs/vocabulary-live-20261027`，包含files/、manifest.delta.json、receipt.json。
- 新录音manifest摘要：`6585f6b00649963baac7082ef75e8b8baf1ef1490456c163fc99b67dbb2807b7`。每个对象的字节数、SHA-256及publicPath由交接清单固定，不能只合并清单而漏传二进制。
- 2026-10-27 01:18仅只读查询生产资源登记：3233个当前所需路径中3150个已ready且摘要/字节数与本地一致；缺83个全部包含在126项增量内，无额外缺口。这不替代上传后的对象可读和发布前再次检查。

## 获得授权后的顺序

1. 先整合 #275/#277/本轮词库到main，消解loader、sync及0055依赖冲突。正式来源必须是干净的`HEAD = origin/main`；统一更新App版本和构建号，完成本轮来源上的检查。任何内容摘要变化都重新生成receipt和计划，不能沿用本文旧摘要。
2. 使用现有生产备份、隔离恢复及迁移演练/正式应用流程，核验0055、0056的精确journal/hash。0055为已确认反馈来源约束；0056只新增vocabulary_releases表、唯一活跃版本/摘要约束、RLS与客户端撤权。启动所需版本为56，不改旧迁移SQL，不做用户学习表批量清空。
3. 通过现有 `stage-content-resources.mjs` 对126项不可变文件上传、逐字节验证并登记；保留原对象与原行。`--validate`只做本地验证，不能当成上传成功。所有3233所需路径ready后才能切词库。
4. 在经验证的新发布产物中使用 `import-vocabulary-live.mjs --validate`，再`--plan`读取数据库。初始目标为“vocabulary_releases无历史→版本4”；已有版本时必须验证累计policy并递增，不能静默覆盖。
5. 初始`--publish`要求精确candidate摘要、`VOCABULARY_EXPECTED_BASE=empty`、操作原因；生产中同时绑定当前`API_RELEASE_ID`。事务中锁定发布、再查音频、写唯一active快照和审计。重复同一版本与摘要幂等，不产生第二次审计。脚本不删除旧学习记录，不绕过生产迁移授权。
6. 按既有主干发布脚本部署API和Ops。Ops归档/镜像包含词库基线。词库录音上传需要服务器私有的`OPS_VOCABULARY_STORAGE_WRITE_TOKEN`，并使用既有storage URL/read token试听；只读token不会被自动升格为写token。配置、创建或授权上传凭据属于本轮具体生产准备，须纳入统一授权。
7. 验证新live目录、旧目录和同步兼容、后台读取/预览、音频可播放、权限拒绝及审计。确认后才交付依赖live协议的iOS/Android测试版及受影响产品Web，不能先发App再补接口。

本地候选导入检查（不连接数据库）：

```sh
node services/api/scripts/import-vocabulary-live.mjs --validate
RESOURCE_MANIFEST=/Users/zhouyide/Desktop/icao-app/outputs/vocabulary-live-20261027/manifest.delta.json RESOURCE_ROOT=/Users/zhouyide/Desktop/icao-app/outputs/vocabulary-live-20261027/files node services/api/scripts/stage-content-resources.mjs --validate
```

`--plan`、`--publish`在正式部署容器/受控发布环境中提供数据库和私有环境，不在聊天或Git中填写凭据。发布前从实际校验结果取得摘要；`VOCABULARY_PUBLISH_CONFIRM`是精确制品栅栏，不是另一个人工审批入口。

## 切换成功的证据

- live GET返回catalogId vocabulary-live-v1、version4、精确canonical checksum；内容和policy版本一致；带ETag重复读取为304。错误目录/摘要、降版和缺policy不安装。
- 旧v1/v2/v3目录保持可解析；旧客户端同步响应投影至其实际目录，不能塞入其未知词条ID。旧App不具备本轮动态目录能力，须完成本次App升级；之后日常词库变化只需后台发布。
- 后台可按三本词书查看，改级不改ID，修改释义/例句可预览；新词/修改朗读文本缺录音不能发布。合并编辑保留目标，拆分可沿用已有组件，实际发布不需要App构建。
- 保留词的掌握状态/收藏不变；合并保守折叠记录，较新的目标显式编辑优先；删除/拆分移除对应ID及收藏、失效测试快照，不显示“题库丢失”。旧离线设备再push也不能复活退役词。已有独立查词收藏按既定映射保留。
- 同一账号重新进入/重启后累计已学40词仍显示40，续学按词条ID，乱序队列不重排；清空/换书/换排序/删除当前词都有实际可续位置。切账号期间旧写入被现有workspace上下文保护拒绝。
- 新词、单词录音、例句及例句录音实际可用；媒体对象与登记摘要一致。新增上传预览的CSP仅放行media self/blob，不扩展脚本权限。
- 产物、main SHA、API/后台镜像、迁移演练、内容摘要、资源回执及测试渠道可访问状态分别记入统一发布记录。测试通过与用户真机验收分开记录。

## 回滚约束

- 新增表、历史release、累计退役映射和不可变录音保留；不能靠删表、删迁移或清空用户学习数据回滚。
- live尚未对客户端开放且没有新客户端/新policy写入时，可按既有不可变镜像回退部署。已经有live客户端/新policy写入后，后端必须保留识别动态policy的能力，不能退回会忽略墓碑的旧同步实现，也不能让live接口退回v1/v3响应。
- 内容修正使用更高版本前滚，保留所有历史墓碑和目标链。不能把active直接切回版本3或减少版本号，客户端会拒绝降版。删除词确需重新加入时使用新ID，遵守用户已同意的删除/拆分记录清理语义，不暗中复活旧记录。
- 原子发布失败保留原active行；缺音频、错误摘要、并发版本变化、迁移引用不合法均拒绝切换。发布后的故障优先停后台写入、保留最后有效live服务，再以受验证的兼容镜像/更高内容版本修复。
- 若提出恢复生产数据库备份，需另外核对恢复范围和期间用户新数据，不能从本轮内容发布授权推导整库覆盖权限。

本轮规则依据为[项目长期边界](../../rules/project-boundaries.md)、[产品更新与发布流程](../../rules/product-update-workflow.md)及[仓库管理规则](../../rules/repository-and-github-management.md)。当前没有生产执行证据，不得把此计划写为已上线。
