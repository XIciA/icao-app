# Web 三类题库迁移阶段日志

状态：已完成

执行日期：2026-07-15

## 阶段 0：冻结基线与清点输入

- 状态：已完成并复验。
- 已完成大流程与总战略、架构决策、三类文本规则、通用小流程和部署规则的一致性复核。
- 已锁定输入为 `/Users/zhouyide/Desktop/web题库/` 当前已完成批次，候选总数为 2288。
- 已锁定“不使用 ASR、不做试审、每 225 条自动检查点、先候选后写入、三库分别验证后统一发布、ECS 前备份和可回滚”的执行协议。
- 已冻结 2815 个文件，共 485,203,072 字节；只读快照位于 `.generated/web-question-bank-content-migration/source-snapshot/`。
- Web 冻结根 checksum：`526c3b6aeabfe33fd588e8d19914f440ed1073446960774a1c529bb610646e2c`。
- App 基线根 checksum：`05df5fe4787c49d5989dbe0587f1d834fe08eab8e3b929a7d4fbd51ea5162932`。
- 已验证听力 777、陆空通话 1367、故事复诵 144，共 2288 条；2288 个源音频均存在且 checksum 与单元清单一致。
- 已建立 2288 条完整映射骨架，后续阶段只读取冻结快照。

## 阶段 1：全量去重与候选报告

- 状态：已完成并复验。
- 已按 225 条保存 11 个候选检查点，并在全部检查点完成后执行跨批次、跨目录及 App 全局去重。
- 最终规则版本：`web-question-bank-audit-v1.8.0`；决定 checksum：`92976e577a61501c020e6f8577df470fd1c6997a1da654c4d1c6fef3312674ff`。
- 2288 条最终决定：`migrate-unique` 753、`borderline-kept` 765、`exclude-exact` 414、`exclude-high-confidence` 349、`exclude-invalid` 7。
- 听力：777 条中迁移 609、排除 168；陆空通话：1367 条中迁移 768、排除 599；故事复诵：144 条中迁移 141、排除 3；准备候选共 1518 条。
- 所有高相似自动排除均要求关键事实一致；578 条陆空通话、140 条听力和 1 条故事因关键事实差异受到保护，保守进入 `borderline-kept`。
- 7 条听力因没有可识别的问题文本而排除，未依据选项猜写新问题。

## 阶段 2–3：候选冻结与净新增内容准备

- 状态：已完成并复验。
- 准备规则版本：`web-question-bank-prepare-v1.7.0`（PREPARE v1.7）；1518 条候选按 225 条形成 7 个可恢复检查点。
- 55/55 个翻译批次、1518/1518 条均已完成并通过结构、呼号、数字、跑道、代码和说话人标签保护；全程未使用 ASR 或外部 API。
- 翻译 checksum：`6fdd3ce74bd3f69c465ffc995b3bcb221d71864c8508ee90947ea30344826982`；翻译后准备候选 checksum：`4050a3aecdf07c520938a579b815c3a07af833f3932de8efc763eaed521a1427`。

## 阶段 3 末：最终跨批次、跨目录全局去重

- 状态：已完成并复验。
- 最终去重规则版本：`web-question-bank-final-dedupe-v1.1.0`；记录 checksum：`8d1cb0bfcad14904961fbb257e504c8b9528f4febd83d6c04786e8406f1d3f67`。
- 在 1518 条准备候选中新增排除 109 条，最终保留 1409 条：听力 592、陆空通话 677、故事复诵 140。
- 最终状态为 `migrate-unique` 747、`borderline-kept` 662；排除 108 条确定性完全重复和 1 条重复拼接故事。
- 7 条数字分组差异以 `number-grouping-equivalent` 记录确定性事实等价证据；故事 `pepec-story-0088` 以 `repeated-content-multiplicity-only` 记录重复正文倍增证据。
- 最终映射已绑定去重规则与 checksum；109 条最终排除项不再占用正式 App ID、目录或音频路径，1409 条保留项映射完整。
- 37 条原隔离题均带 `source-section-incomplete` 追溯标记，其中最终保留 30 条。

## 阶段 4–5：正式写入与本地验证

- 状态：已完成并复验。
- 正式候选 checksum：`3bb93c42839f942a9f935893ec3bef947856ec9e321309661b6ddb33a268152c`；题库 `releaseVersion` 已升至 5。
- 正式新增 1409 条：听力 592、陆空通话 677、故事复诵 140；正式候选验证和写入后验证均成功。
- 写入后三库总量为：听力 1223、陆空通话 2528、故事复诵 436。
- 已生成去重后的人工审核清单，共 815 条不重复记录：`borderline-kept` 662、时长边界 100、分类边界 49、原隔离区 30、人工内容疑点 37；清单记录 checksum：`38f92b2ee56da5fff369f4acb2eea9f219402b5346616c83f0b8da36a8edb8e9`。

## 阶段 6：增量发布与回滚准备

- 状态：已完成并复验。
- 已生成只包含三套目标题库和 1409 个新音频的 v5 增量发布包；归档 checksum 为 `fb4db2ab195d5c6a837056ad831b69a2dc9a93dc0ea33aec3b5c3dd815e61b4f`，大小 166,270,563 字节。
- 发布工具已显式排除 macOS 扩展属性和 AppleDouble 文件；ECS 解包后 `._*` 文件为 0，归档、发布清单、资源清单及三个题库文件 checksum 全部通过。
- ECS 发布目录：`/opt/icao/runtime/releases/icao-web-question-bank-v5-20260715T180014Z/`。
- 导入前数据库备份：`/opt/icao/backups/postgres/icao-20260715T181056Z.dump`；备份 checksum 已通过，`pg_restore -l` 返回 604 条可读目录记录。
- 导入前确认三库 v5 行、v5 资源数据库记录和 v5 Storage 对象均为 0；保留线上原活动版本听力 v4、陆空通话 v3、故事复诵 v1 作为回滚基线。
- 使用现有 `icao-api:phase2a` 镜像完成内容导入：活动题库 5、资源 5391、上传 1409、跳过 0；未部署或重启 API 代码。

## 阶段 7：线上验收

- 状态：已完成并复验。
- `/health/ready` 返回 API 与数据库均为 `ok`；API 容器保持 healthy，重启次数仍为 0。
- 活动题库严格为 5 套：听力 v5/1223、陆空通话 v5/2528、故事复诵 v5/436、OPI v2/1356、900句 v1/900，总计 6443 题；两个非目标题库版本、数量和 checksum 未变化。
- 五套题库 checksum 与预期一致；五套接口 ETag 均等于对应 checksum，携带 `If-None-Match` 均返回 304 和空响应体。
- 听力、陆空通话、故事复诵各 1 道代表题的 ID、标题、完整文本字段和 v5 音频路径均通过；听力答案索引与 `referenceText` 联动正确。
- 三类 v5 代表音频及历史听力 `454.mp3` 均完成资源解析、全量下载大小与 SHA-256 复核，Range 请求均返回 206。
- 验收临时用户已删除；最终人工审核清单保持在 `reports/migrate-review.md` 和 `reports/migrate-review.json`，共 815 条。

## 阶段 8：陆空通话完整场景修正

- 状态：已完成并复验。
- 用户确认陆空通话以完整场景为最小迁移单元，不能把 Web 场景拆卡追加到既有 App 场景。
- 已用迁移前备份恢复陆空通话旧 107 个场景 / 1851 卡，再把此前涉及的 79 个 Web 原始场景完整迁入；新增场景为 `atc-scenario-0108` 至 `atc-scenario-0186`，共 1367 张 Web 卡。
- 修正后本地陆空通话为 v6 / 186 场景 / 3218 卡；五套本地题库合计 7133 卡，资源清单 6081 项。
- 已生成修正报告：`reports/radiotelephony-scene-unit-correction.md` 和 `reports/radiotelephony-scene-unit-correction.json`。
- 本地包：`.generated/web-question-bank-content-migration/radiotelephony-release-v6-scene-unit-20260716T1454.tar.gz`；SHA-256 为 `c3a7e3f69177dc2739e5c14240c3527ae80d622e557522dd19dfabf8a2da9aa9`。
- ECS 发布目录：`/opt/icao/runtime/releases/icao-radiotelephony-v6-scene-unit-20260716T1454/`；导入前备份 `/opt/icao/backups/postgres/icao-20260716T065855Z.dump` 已通过 SHA-256 和容器内 `pg_restore -l` 604 条目录记录校验。
- 首次全量 v6 manifest 因非目标题库 checksum 未变触发数据库唯一约束，事务回滚且未切换活动题库；随后改为陆空通话专用 v6 增量包导入。
- Storage 中 1367 个 v6 音频对象已存在，使用存储感知的一次性导入脚本补写资源表并激活陆空通话 v6；未部署或重启 API 代码。
- 线上验收通过：听力 v5/1223、陆空通话 v6/3218、故事复诵 v5/436、OPI v2/1356、900句 v1/900，总计 7133 题；陆空通话 checksum 为 `bde49b9b44e2c3b5bc562d816748888e467cd54490114f3780807cab513f2547`。
- 线上代表卡 `atc-scenario-0108-card-main-1852` 与代表音频 `v6/audio/radiotelephony/web-v6/pepec-radiotelephony-001-afr113-q01.mp3` 通过字段、ETag/304、完整下载和 Range 206 验证。
