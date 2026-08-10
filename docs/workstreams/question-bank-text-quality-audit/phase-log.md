# 五套题库文本质量阶段日志

## 阶段 0：并行任务交接与 v11 基线冻结

- 状态：完成。
- 陆空通话呼号任务先完成本地 v11：26 个场景统一呼号、删除 2 张重复卡，
  `radiotelephony` 从 3,218 卡变为 3,216 卡。
- 本任务在收到明确 handoff 后独占题库生成与发布路径，重新冻结为：
  release 11、5 库、28 分类、341 话题、6,865 卡、40,564 个用户可见文本值。
- 基线 Git HEAD 为 `5dad439b34dcd215cf8cdb1011c3b5544b09edc5`；资源清单保持
  6,081 个文件、814,518,693 bytes、SHA-256
  `94525c1fd882667345b733d2e26885c2f761e725b0f3b454b4e4c914e3533693`。
- 没有覆盖另一任务的工作；最终 v12 同时包含呼号修复和本次文本修复。

## 阶段 1：统一审查基础设施

- 状态：完成。
- 新增 `tools/question-bank-text-audit.mjs`，提供 `audit`、`apply`、`check` 三种模式。
- `package.json` 新增 `content:text:audit`、`content:text:apply`、
  `content:text:check`，并将文本门禁接入 `content:check` 与
  `content:check:full`。
- 抽取器覆盖 374 个正式源文件、40,564 个用户可见文本值，按 250 值/批生成
  163 个稳定批次。
- 修复应用要求文件、JSON pointer、原文 SHA-256 三者同时匹配；重复执行为零变化。
- 覆盖文件、修复账本、人工审核项都带指纹，后续正文变化会强制重新审核。

## 阶段 2：四轮全量审查与自主修复

- 状态：完成。
- 第 1 轮扫描编码、隐藏字符、异常符号、粘词、OCR、括号、引号、标点、空格、
  重复片段和结构化选项污染。
- 第 2 轮按 163 批逐批覆盖全部中英文文本，不只处理正则候选。
- 第 3 轮复核同卡选项唯一性、选项与参考答案回显、说话人标签、呼号、数字和双语机械一致性。
- 第 4 轮逐项复审后应用 766 个确定性字段修改；第二次应用为零修改，未分类候选为零。
- 最终状态：766 项 `fixed`，14 项 `manual-review`，4 组观察记录为
  `out-of-scope`；其余文本均为 `clean`。

## 阶段 3：v12 构建与派生资产

- 状态：完成。
- 全局题库版本升至 12，`releasedAt=2026-07-30T16:52:28Z`。
- v12 保持 5 库、341 话题、6,865 卡；稳定 ID、题型、顺序、正确答案索引、
  音频路径、图片路径和资源清单无非预期变化。
- 将 766 项修改全部反向还原后，五库 checksum 逐库精确复现 v11，证明账本外正文
  变化为零。
- 静态查词精确词形变为 7,807：保留 7,322、删除 1,445 个不再使用的错词/旧词形，
  新增 485 个修正后词形；dataset、汇总和运行时检查通过。
- ASR 热词候选重新生成 236 条；仓库正式热词与部署热词仍为 0，正式配置 hash 未变，
  没有擅自改动外部模型。

## 阶段 4：本地门禁与页面数据验收

- 状态：完成。
- `content:text:check`、`content:build`、`content:check:full`、静态查词全套检查、
  ASR 文本资产检查、`pnpm check` 均通过。
- App Jest 70 个 suites / 312 个 tests 通过；API Jest 8 个 suites / 235 个 tests 通过。
- Web v12 内容镜像完全物化并验证 6,081 个资源、814,518,693 bytes；本地 Web
  asset/content/network 检查通过。
- 代表卡数据验收覆盖 `listening-main-006`、`listening-main-1090`、
  `sentence900-main-167`、`atc-scenario-0014-card-main-234` 和
  `story-koala-055`。

## 阶段 5：ECS 增量发布

- 状态：完成。
- 只导入 4 个实际变化题库；OPI 未写新版本；增量包资源列表为空，上传资源 0。
- 发布前 PostgreSQL 备份、活动题库快照和事务回滚 SQL 已落盘并校验。
- 线上活动版本为：listening v12、sentences900 v12、radiotelephony v12、
  storytelling v12、OPI 保持 v10；总卡数 6,865。
- 鉴权读取、逐库版本/checksum、ETag、304、未鉴权 401 和代表修复卡全部通过。
- API 容器仍为 `icao-api:phase2a`，未部署、未重启，`restart_count=0` 且 healthy。

## 阶段 6：Web 不可变内容与正式发布

- 状态：进行最终冻结。
- 已生成不可变内容 `app-qb-v12-bf1bbbc35087dfff`，内容 checksum
  `bf1bbbc35087dfff8a7822de0a875977ce7c5e652228de07ae17b39f7e1c0f50`。
- 四个变化库与 OPI 的远端文件 SHA-256 均与本地 v12 一致。
- 复用正式域名现有资源分片前，已验证同源资源 release marker 的 manifest checksum、
  文件数和字节数与本地完全一致；未重新上传 6,081 个资源。
- 最终步骤为：刷新显示版本、重跑门禁、用审定源文件集构建 Preview、按
  360/375/390/430px 验收，并将同一个不可变部署提升到 Production。
- 最终 Production 部署 ID 和正式域名复核结果在仓库冻结后写入本任务交付消息，避免
  为记录动态 ID 再次修改仓库。
