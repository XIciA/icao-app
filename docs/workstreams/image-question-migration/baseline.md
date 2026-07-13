# 图片题迁移阶段 0 基线

记录日期：2026-07-13

## 来源基线

- 数据入口：`feizhuicu/public/data/question-bank/mini-v1/opi/topics.json` 中 `catalog.category = 图片题` 的唯一子集。
- 允许取用：23 组图片—问题关系、23 张最终 JPG、64 道问题所需双语文本与 64 个 MP3。
- 数量：23 话题、23 图片卡、64 问题卡、87 卡、87 个资源文件。
- 来源没有独立单词或词汇字段，本任务不迁移单词资源。
- 两道缺失中文题意按已确认方案只补缺项：
  - `opi-image-003-q03`：`你还知道哪些其他跑道灯光设施？`
  - `opi-image-018-q03`：`如何避免这种情况？`

正式 allowlist、文件大小与 SHA-256 由 `source-manifest.json` 生成并接受 `verify` 复核；不执行目录级复制。

## 本地目标前基线

- OPI：7 分类、121 话题、1269 卡，release version 1。
- 全题库：27 分类、239 话题、4947 卡。
- 本地资源源清单：3895 项。
- 目标：OPI 8 分类、144 话题、1356 卡；全题库 28 分类、262 话题、5034 卡；资源 3982 项。

## ECS 实时基线

2026-07-13 通过只读数据库查询核实：

- active release 共 5 个，均为 version 1。
- active OPI checksum：`f567d98372de7e6200c8c30ab34a22248a6a01f8c96687e8d2f3b04168c61199`。
- active OPI：121 话题、1269 卡。
- `resource_objects` 中 ready 资源：3895 项，合计 579274343 bytes。
- 私有 `question-bank-assets` bucket 对象：3895 项。
- `/health/ready`：service 与 database 均为 `ok`。

因此旧阶段记录中的 3894 不能作为当前部署基线。本次发布必须保留 OPI v1，以新增 version 2 激活；新 object key 使用 `v2/`，不覆盖或删除 v1 对象。

## 并行工作边界

- 当前工作树有独立的单词学习迁移改动；本任务不读取、修改或部署其内容资源。
- 共享文件只做图片题闭环的最小条件分支，部署归档使用显式文件集并复核，不能携带无关未确认改动。
