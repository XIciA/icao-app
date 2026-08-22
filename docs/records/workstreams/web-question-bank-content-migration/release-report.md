# Web 三类题库 v5 发布报告

## v6 陆空通话场景最小单元修正

- 修正原因：v5 陆空通话曾把 677 张 Web 卡片中的 612 张追加进 69 个既有场景；这不符合“陆空通话以完整场景为最小迁移单元”的规则。
- 修正规则：先恢复迁移前 107 个旧场景，再把涉及的 79 个 Web 原始场景完整迁入；一个 Web 场景只能全加或全不加，不拆卡塞入既有场景。
- 修正结果：陆空通话升至 v6，正式总数为 186 场景 / 3218 卡；听力保持 v5/1223，故事复诵保持 v5/436，OPI 保持 v2/1356，900句保持 v1/900。
- 本地修正包：`.generated/web-question-bank-content-migration/radiotelephony-release-v6-scene-unit-20260716T1454.tar.gz`。
- 归档 SHA-256：`c3a7e3f69177dc2739e5c14240c3527ae80d622e557522dd19dfabf8a2da9aa9`。
- ECS 发布目录：`/opt/icao/runtime/releases/icao-radiotelephony-v6-scene-unit-20260716T1454/`。
- 数据库备份：`/opt/icao/backups/postgres/icao-20260716T065855Z.dump`；SHA-256 校验通过，容器内 `pg_restore -l` 返回 604 条目录记录。
- 导入结果：使用现有 `icao-api:phase2a` 镜像导入内容，未部署或重启 API 代码；陆空通话 v6 checksum 为 `bde49b9b44e2c3b5bc562d816748888e467cd54490114f3780807cab513f2547`。
- 线上验收：`/health/ready` 为 API/database `ok`；五套活动题库总数 7133；陆空通话代表卡 `atc-scenario-0108-card-main-1852`、代表音频 `v6/audio/radiotelephony/web-v6/pepec-radiotelephony-001-afr113-q01.mp3` 通过字段、ETag/304、完整下载和 Range 206 验证。

## 发布结果

- 听力新增 592 题，正式总数 1223，版本 v5。
- 陆空通话新增 677 题，正式总数 2528，版本 v5。
- 故事复诵新增 140 题，正式总数 436，版本 v5。
- 三库共新增 1409 题和 1409 个音频；五套活动题库总数为 6443，资源总数为 5391。
- OPI 保持 v2/1356，900句保持 v1/900，内容与 checksum 未变化。

## 发布包与备份

- 本地发布包：`.generated/web-question-bank-content-migration/web-question-bank-release-v5.tar.gz`。
- 归档 SHA-256：`fb4db2ab195d5c6a837056ad831b69a2dc9a93dc0ea33aec3b5c3dd815e61b4f`。
- ECS 发布目录：`/opt/icao/runtime/releases/icao-web-question-bank-v5-20260715T180014Z/`。
- 数据库备份：`/opt/icao/backups/postgres/icao-20260715T181056Z.dump`；checksum 和恢复目录可读性均已验证。
- 使用现有 `icao-api:phase2a` 镜像导入内容，未部署或重启 API 代码。

## 线上验收

- `/health/ready`：API 与数据库均为 `ok`，API 容器重启次数为 0。
- 听力 checksum：`6dcce1792d23286fd2943ada8015c4592776ae67474227f1e974f75e46b1d609`。
- 陆空通话 checksum：`8e428fd5bc5a66de81e914616eb48c28df28cbff53d73821be5ec620e21e0adf`。
- 故事复诵 checksum：`8a8b1989c7a81c593da3629b46d6172827f51151d4fd623cc21d6fbe339d7349`。
- 五套题库均通过 ETag 与 304 验证；三类代表题及代表音频通过字段、路径、大小、SHA-256、完整下载和 Range 206 验证。
- 验收临时用户已删除。

## 人工审核入口

- Markdown 清单：`reports/migrate-review.md`。
- 完整 JSON：`reports/migrate-review.json`。
- 清单覆盖 815 条待人工集中查看记录，其中最终 `borderline-kept` 662 条；这些题已按用户授权保守保留并上线，不阻断本轮迁移。

## 回滚

- 首选恢复上述 PostgreSQL 备份。
- 内容级回滚必须删除目标三库 v5 行，再分别激活听力 v4、陆空通话 v3、故事复诵 v1；不能只把 v5 标记为 inactive。
- 上一版题库发布目录仍保留在 ECS，v5 发布目录和数据库备份均未删除。
