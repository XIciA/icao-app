# 全题库音频映射修复记录

## 修复范围

- 听力：631 条。
- 900 句：900 条。
- 陆空通话：1851 条。
- 故事复诵：296 条。
- OPI：1269 条，继续使用生成音频，不参与本地文件映射。

四个本地音频题库共 3678 条卡片。修复前 3269 条映射错误或缺少规范资源，修复后 3678 条全部通过稳定卡片 ID、上游 `media.audio` 和文件 SHA-256 三重校验。

## 修复规则

音频路径只由稳定卡片 ID 决定，不再使用题库分类、话题或卡片遍历顺序：

- `listening-main-NNN` 对应 `listening/main/NNN.mp3`。
- `sentence900-main-NNN` 对应 `sentence900/main/NNN.mp3`。
- `atc-...-card-main-NNN` 对应 `radiotelephony/main/NNN.mp3`。
- `story-{group}-NNN` 对应 `storytelling/{group}/NNN.mp3`。

修复工具同时更新正式内容源和 App 内置 fallback，并使用去除 `audio` 字段后的整体摘要保证题目、选项、译文、音频原文、卡片 ID 和顺序没有变化。

## 特殊资源

`listening/main/454.mp3` 曾因删除另一张错误挂载的卡片而被误删。本次从上游恢复为仓库内受控资源补丁：

- 大小：128300 bytes。
- SHA-256：`a0722b82f2d5a22cba9a0fad0f8b7f06d98eab8d596691eedcbde6e74f20067f`。
- Storage object key：`v1/audio/listening/main/454.mp3`。

`listening/main/595.mp3` 当前没有卡片引用，但为保护回滚暂不删除。

## 本地验收

- `content:audio:verify`：四个题库 3678/3678 映射正确。
- 正式内容源与内置 fallback：3678 条逐卡一致。
- 资源索引与 manifest：3895 条，新增项只有 `454.mp3`。
- 非 `audio` 内容摘要：修复前后不变。

## 线上发布验收

- Git 提交：`1fadbbf`，已推送到 `origin/main`。
- 数据库备份：`/opt/icao/backups/postgres/icao-20260713T071407Z.dump`，SHA-256 校验通过。
- 发布包：`/opt/icao/runtime/releases/1fadbbf-content-20260713T071433Z.tar.gz`。
- 发布包 SHA-256：`d7d7a7f1f80eedd4be24cf7aa88f30e45d70e9576add1feb9052c919c3751b2b`。
- 内容导入：5 个题库、3895 个资源对象；上传 1 个、跳过 3894 个。
- 认证接口全量复核：3678 条本地音频卡片全部符合稳定 ID 映射；OPI 1269 条仍无本地音频字段。
- `454.mp3`：签名下载成功，128300 bytes，下载内容 SHA-256 与资源清单一致。
- `595.mp3`：资源对象继续保留，当前题库没有卡片引用。
- `/health/ready`：API `ok`，database `ok`；API 容器保持原镜像运行，无需重启。

线上题库 checksum：

| 题库 | checksum |
| --- | --- |
| listening | `a2fcfd5b0078e60ad6aba2303943c47fa2c21ae0fcdafc3f9f21ed6ae974b1b1` |
| sentences900 | `b5312ac75f8cf3bae53d7d31ebb6531dbfdfa7830ac10da9a7d396349637fa5e` |
| radiotelephony | `04eda170d6a3957008736e1f107bed4d86cc571782985f8680f16578d29f75a8` |
| opi | `f567d98372de7e6200c8c30ab34a22248a6a01f8c96687e8d2f3b04168c61199` |
| storytelling | `5d5eba4ad4798027fc81332fd2ac4586c04339d51936715cd4f28d9e1144e488` |
