# 听力题库第4版发布报告

## 发布包

- 类型：仅听力题库增量包。
- 听力版本：4。
- 卡片：631。
- 题库 checksum：`9ea06930c0a5c663ebd2aa5a12a4e8a56fd114495a8b55e34b7b6b068f07e803`。
- 本地归档：`.generated/listening-release-v4.tar.gz`。
- 归档 SHA-256：`0f16adb62cc5e639d9cf3641bff7e73781bb241523f1dae73bc8c710d0327a3a`。
- 资源清单：空，上传资源0。

## 备份与回滚

- 数据库备份：`/opt/icao/runtime/backups/pre-listening-v4-20260715T132757Z.dump`。
- 备份 SHA-256：`a049a9c66289e85470fc0d54eefd82aa7ecb834adc8a06aba0ce93adf564d031`。
- 服务器保留既有第3版发布目录：`/opt/icao/runtime/releases/icao-radiotelephony-v3-20260715T073016Z/`。
- 新增发布目录：`/opt/icao/runtime/releases/icao-listening-v4-20260715T132900Z/`。
- 回滚方式：恢复上述数据库备份，或重新导入所需的上一版发布内容。

## ECS导入

- 使用镜像：`icao-api:phase2a`。
- 导入结果：活动题库5套、资源记录3982、上传0、跳过0。
- 未部署或重启API代码。
- API容器重启次数：0。

## 线上验收

- `/health/ready`：API与数据库均为 `ok`。
- 活动题库：听力4（631）、OPI2（1356）、陆空通话3（1851）、900句1（900）、故事1（296）。
- 听力线上 checksum 与发布包一致。
- ETag：`"9ea06930c0a5c663ebd2aa5a12a4e8a56fd114495a8b55e34b7b6b068f07e803"`。
- `If-None-Match`：返回304。
- 四个分类代表卡片均有英文原文、中文翻译、4个选项、有效正确索引及匹配的 `referenceText`。
- `/question-bank-assets/audio/listening/main/001.mp3`：签名解析成功，范围下载返回206。
- 验收临时用户已删除。
