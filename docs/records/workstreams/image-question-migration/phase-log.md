# 图片题迁移小流程阶段记录

## 阶段 0：来源白名单与本地/线上基线

状态：通过

- 完成 23 组、87 卡、87 个资源的来源结构和文件存在性复核。
- 确认来源无独立单词资源，任务范围保持只做图片题。
- 确认 ECS 当前 active OPI 为 v1、121 话题、1269 卡；数据库与 Storage 均为 3895 个 ready 对象。
- 确认发布使用 OPI v2 与 `v2/` 新对象键，保留 v1 回滚点。
- 新建幂等迁移脚本，先生成 allowlist/checksum 清单，再允许写入正式维护层。

验证：`node docs/records/workstreams/image-question-migration/scripts/migrate-image-questions.mjs audit`

阶段审查：无范围越界；可以进入阶段 1。

## 阶段 1：图片卡与通用资源合同

状态：通过

- 将题库卡片扩展为标准文本卡与 `kind: image` 图片卡的判别联合，图片卡只允许 `image`、`imageAlt` 和任务标识等必要字段。
- topic schema 使用条件规则校验两类卡片；资源 schema 支持 `audio/mpeg`、`image/jpeg` 和 `image/png`。
- 内容工具新增图片引用、MIME、路径和 checksum 校验；API 导入脚本改为通用资源根目录，同时保留旧音频根目录兼容。
- 普通题库历史数据继续通过全量校验，未修改数据库 Schema。

验证：题库 schema/构建测试、API 导入测试、TypeScript 与全量内容检查通过。

阶段审查：合同可表达纯图片卡且不放宽普通卡规则；可以进入阶段 2。

## 阶段 2：原生垂直样例

状态：通过

- 新建原生 `ImageQuestionCard`，通过现有资源签名 hook 获取图片，使用完整适配显示，并提供加载、12 秒超时、失败和重试状态。
- 图片卡保留题号、答题卡、上一题/下一题、结束与进度，隐藏音频、录音、答案、高亮、标签、查词和文字工作台。
- 问题卡继续使用现有 OPI 音频、按住说话、参考答案、标注与笔记能力。
- 实机尺寸验证发现“开发地址先失败、远程签名地址后到达”时错误态未复位的竞态；已让组件在资源 URI 变化时重新进入加载态，并增加回归测试。

验证：`image-question-card-test.tsx` 4 个场景通过，含远程 URL 替换失败开发 URL 后恢复；iOS Development Build 构建、安装和 Metro 实际渲染通过。

阶段审查：垂直链路和错误恢复成立；可以进入阶段 3。

## 阶段 3：23 个话题全量迁移

状态：通过

- 依据 `source-manifest.json` 精确迁移 23 张 JPG 和 64 个 MP3，未执行目录级复制。
- 新增 OPI 第 8 分类、23 个话题、23 张图片卡和 64 张问题卡；OPI 达到 8 分类、144 话题、1356 卡。
- 全题库达到 28 分类、262 话题、5034 卡；资源清单达到 3982 项、592289667 bytes。
- 只补齐两道缺失中文题意：`opi-image-003-q03` 与 `opi-image-018-q03`，未批量改写其它题目。
- 更新内嵌回退快照与远程 release 版本，资源 object key 使用 `v2/`，不覆盖旧对象。

验证：`node docs/records/workstreams/image-question-migration/scripts/migrate-image-questions.mjs audit` 返回 `topics=23 cards=87 resources=87`；`pnpm content:check:full` 通过。

阶段审查：数量、分组、资源引用和 checksum 一致；可以进入阶段 4。

## 阶段 4：本地与 iOS 验收

状态：通过

- `pnpm check` 全量通过：App 32 个测试套件 / 87 个测试、API 3 个测试文件 / 176 个测试，以及类型、lint、构建、内容和词汇检查。
- `pnpm content:check:full` 返回 5 题库、28 分类、262 话题、5034 卡、3742 个音频引用、23 个图片引用、3982 个资源。
- `pnpm exec expo run:ios --no-bundler --device ICAO_375_812` 构建并安装成功；一次 Xcode `swift-frontend` 启动瞬态失败，直接重试后通过，最终 0 error。
- 375×812 与 430 宽度均显示完整图片及 AI 标识，无横向溢出；问题卡保留音频和录音入口。
- 保存了目录、图片成功、问题卡和可重试错误态证据；真实渲染检查促成并验证了阶段 2 所述竞态修复。

证据：`evidence/ios-375-opi-category.png`、`evidence/ios-375-image-success.png`、`evidence/ios-430-image-success.png`、`evidence/ios-375-question-card.png`、`evidence/ios-375-deep-link-check.png`。

阶段审查：iOS 当前验收范围通过；Android 未在本阶段声明为已验证。

## 阶段 5：ECS 发布与远程验收

状态：通过

- 从 ECS 当前稳定源码构建，只覆盖本任务所需通用资源导入脚本，避免携带本地脏工作树中的并行改动。
- 部署镜像 `icao-api:image-question-20260713T154042Z`；保留旧镜像标签、源码备份、数据库备份和 OPI v1 release。
- 导入 OPI v2 与 87 个新资源：`uploaded=87`、`skipped=3895`，Storage 和 `resource_objects` 均达到 3982 项。
- `icao-api` 容器运行正常、restart count 为 0；`/health/ready` 的 service 与 database 均为 `ok`。
- 代表性远程请求验证 OPI v2 为 8/144/1356、ETag/304 正常，JPG 与 MP3 的 MIME、大小、签名读取和 SHA-256 正确；临时验收账号已删除。
- 并行发布的词汇接口完成最小回归，未被本次部署破坏。

验证：`node docs/records/workstreams/image-question-migration/scripts/verify-image-question-live.mjs` 通过，返回 23 图片题话题、23 图片卡、64 问题卡以及图片/音频 checksum `ok`。

阶段审查：远程 release、资源、健康和 App 实际读取均通过；可以进入阶段 6。

## 阶段 6：收口

状态：通过

- 生成 `migration-report.md` 与 `closeout.md`，把需求、数量、渲染、部署和回滚证据逐项闭环。
- 复核最终差异，设计仓库与 `feizhuicu` 未被写入；未迁移独立单词资源、来源代码或来源完整题库。
- Android 真机/模拟器未纳入本次已通过结论，保留为明确边界，不阻塞当前 iOS 图片题发布。

阶段审查：小流程完成，可按 `closeout.md` 验收与接续。
