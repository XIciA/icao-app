# 图片题迁移报告

报告日期：2026-07-13

## 1. 最终数量

| 项目 | 迁移前 | 迁移后 | 增量 |
| --- | ---: | ---: | ---: |
| OPI 分类 | 7 | 8 | 1 |
| OPI 话题 | 121 | 144 | 23 |
| OPI 卡片 | 1269 | 1356 | 87 |
| 全题库分类 | 27 | 28 | 1 |
| 全题库话题 | 239 | 262 | 23 |
| 全题库卡片 | 4947 | 5034 | 87 |
| 资源清单 | 3895 | 3982 | 87 |

图片题增量严格由 23 张图片卡和 64 张问题卡组成；资源严格由 23 张 JPG（11,140,677 bytes）和 64 个 MP3（1,874,647 bytes）组成。

## 2. 来源与转换

- 来源仅为 `feizhuicu` 正式图片题子集，逐文件 allowlist 和 SHA-256 记录在 `source-manifest.json`。
- `icao-app` 重新建立自己的分类、话题、卡片和资源结构，没有复制来源 Web 代码、路由、schema、完整题库 JSON 或脚本。
- 图片与问题分组保持一一对应；每个话题第一张是图片卡，随后是 2—3 张问题卡。
- 来源没有独立单词字段或单词素材，本迁移未生成或取用单词资源。

## 3. 内容补缺

只补齐以下两道原本缺失的中文题意：

| 卡片 ID | 英文问题 | 补充中文题意 |
| --- | --- | --- |
| `opi-image-003-q03` | What other runway lighting facilities do you know? | 你还知道哪些其他跑道灯光设施？ |
| `opi-image-018-q03` | How to avoid that situation? | 如何避免这种情况？ |

其余问题、译文与参考内容只按当前卡片字段拆分，没有批量润色或改写。

## 4. 资源与发布

- 图片公共路径：`/question-bank-assets/images/opi/image-questions/*.jpg`。
- 音频公共路径：`/question-bank-assets/audio/opi/image-questions/*.mp3`。
- 新资源使用 v2 object key，旧 v1 对象不覆盖、不删除。
- 本地资源清单最终为 3982 项、592,289,667 bytes；远程数据库与私有 Storage 对象数均为 3982。
- ECS OPI v2 已激活，OPI v1 保留为可回滚的非激活 release。

## 5. 校验结果

```text
image_question_audit_ok topics=23 cards=87 resources=87
banks=5 categories=28 topics=262 cards=5034
referencedAudio=3742 referencedImages=23 resources=3982
```

远程代表性验证结果：OPI v2 数量与 ETag 正常；JPG、MP3 的 MIME、大小、签名下载与 checksum 正常；23 个话题均满足“1 图片卡 + 对应问题卡”的结构。
