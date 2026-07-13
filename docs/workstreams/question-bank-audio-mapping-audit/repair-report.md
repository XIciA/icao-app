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

线上导入、健康检查、接口全量复核和资源下载结果在发布完成后补充。
