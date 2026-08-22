# 全题库音频映射异常原因审计

## 审计范围

- 当前题库：4947 条。
- 有本地音频的题目：3678 条。
- 错配或缺失：3269 条，占 88.88%。
- OPI：1269 条，按设计使用生成音频，不参与本地文件错配判断。
- 上游基线：feizhuicu mini-v1 中稳定卡片 ID → media.audio 的原始映射；37 条已从 mini-v1 去重、但 App 仍保留的故事卡按稳定故事 ID 对应原音频路径补充核验。
- 校验方式：当前卡片 ID、当前 audio、上游 media.audio、源音频和规范音频 SHA-256。
- 未听音频、未运行 ASR、未调用外部 API，也未修改题库和音频。

## 各模块结果

| 模块 | 卡片 | 内容正确 | 内容错配 | 规范音频缺失 | 路径直接对齐 | 生成音频 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| listening | 631 | 2 | 628 | 1 | 2 | 0 |
| sentences900 | 900 | 17 | 883 | 0 | 17 | 0 |
| radiotelephony | 1851 | 241 | 1610 | 0 | 241 | 0 |
| storytelling | 296 | 149 | 147 | 0 | 149 | 0 |
| opi | 1269 | 0 | 0 | 0 | 0 | 1269 |

## 根因

音频文件复制和卡片挂载使用了两个不同的顺序基准：

1. 规范音频目录保留了上游 feizhuicu 的原始模块、分组和文件编号。
2. 题库数据在进入设计稿时，被重新按听力分类、900句等级、陆空通话航司/场景、故事复诵子库分组。
3. 音频迁移随后按“重排后的当前卡片遍历顺序”依次赋予 001、002、003……路径，而没有使用稳定卡片 ID 对应的上游 media.audio。
4. 因此只要重排后顺序与上游资源顺序不同，audio 就会指向另一张卡的文件；文件本身没有损坏，错误发生在卡片到资源的关联层。
5. 后续删除 listening-main-595 时，又按照错误关联删除了 main/454.mp3，进一步造成一个仍在使用的规范音频缺失。

设计仓库的 audio-assets-migration 报告明确记录了“按当前卡片顺序挂载”，而 audio-index 同时记录规范文件是从上游原编号文件复制；这两个顺序在数据分组重排后不再等价。audioText 仍跟随稳定卡片 ID，只有 audio 被按位置重新挂载，所以产品中表现为“音频与音频原文完全对不上”。

## 前 60 条异常样本

| 模块 | 卡片 | 当前路径 | 当前实际对应上游卡片 | 正确规范路径 | 状态 |
| --- | --- | --- | --- | --- | --- |
| listening | listening-main-005 | /question-bank-assets/audio/listening/main/003.mp3 | listening-main-003 | /question-bank-assets/audio/listening/main/005.mp3 | mismatch |
| listening | listening-main-021 | /question-bank-assets/audio/listening/main/004.mp3 | listening-main-004 | /question-bank-assets/audio/listening/main/021.mp3 | mismatch |
| listening | listening-main-022 | /question-bank-assets/audio/listening/main/005.mp3 | listening-main-005 | /question-bank-assets/audio/listening/main/022.mp3 | mismatch |
| listening | listening-main-024 | /question-bank-assets/audio/listening/main/006.mp3 | listening-main-006 | /question-bank-assets/audio/listening/main/024.mp3 | mismatch |
| listening | listening-main-025 | /question-bank-assets/audio/listening/main/007.mp3 | listening-main-007 | /question-bank-assets/audio/listening/main/025.mp3 | mismatch |
| listening | listening-main-029 | /question-bank-assets/audio/listening/main/008.mp3 | listening-main-008 | /question-bank-assets/audio/listening/main/029.mp3 | mismatch |
| listening | listening-main-041 | /question-bank-assets/audio/listening/main/009.mp3 | listening-main-009 | /question-bank-assets/audio/listening/main/041.mp3 | mismatch |
| listening | listening-main-042 | /question-bank-assets/audio/listening/main/010.mp3 | listening-main-010 | /question-bank-assets/audio/listening/main/042.mp3 | mismatch |
| listening | listening-main-043 | /question-bank-assets/audio/listening/main/011.mp3 | listening-main-011 | /question-bank-assets/audio/listening/main/043.mp3 | mismatch |
| listening | listening-main-044 | /question-bank-assets/audio/listening/main/012.mp3 | listening-main-012 | /question-bank-assets/audio/listening/main/044.mp3 | mismatch |
| listening | listening-main-045 | /question-bank-assets/audio/listening/main/013.mp3 | listening-main-013 | /question-bank-assets/audio/listening/main/045.mp3 | mismatch |
| listening | listening-main-061 | /question-bank-assets/audio/listening/main/014.mp3 | listening-main-014 | /question-bank-assets/audio/listening/main/061.mp3 | mismatch |
| listening | listening-main-062 | /question-bank-assets/audio/listening/main/015.mp3 | listening-main-015 | /question-bank-assets/audio/listening/main/062.mp3 | mismatch |
| listening | listening-main-063 | /question-bank-assets/audio/listening/main/016.mp3 | listening-main-016 | /question-bank-assets/audio/listening/main/063.mp3 | mismatch |
| listening | listening-main-064 | /question-bank-assets/audio/listening/main/017.mp3 | listening-main-017 | /question-bank-assets/audio/listening/main/064.mp3 | mismatch |
| listening | listening-main-065 | /question-bank-assets/audio/listening/main/018.mp3 | listening-main-018 | /question-bank-assets/audio/listening/main/065.mp3 | mismatch |
| listening | listening-main-075 | /question-bank-assets/audio/listening/main/019.mp3 | listening-main-019 | /question-bank-assets/audio/listening/main/075.mp3 | mismatch |
| listening | listening-main-078 | /question-bank-assets/audio/listening/main/020.mp3 | listening-main-020 | /question-bank-assets/audio/listening/main/078.mp3 | mismatch |
| listening | listening-main-081 | /question-bank-assets/audio/listening/main/021.mp3 | listening-main-021 | /question-bank-assets/audio/listening/main/081.mp3 | mismatch |
| listening | listening-main-082 | /question-bank-assets/audio/listening/main/022.mp3 | listening-main-022 | /question-bank-assets/audio/listening/main/082.mp3 | mismatch |
| listening | listening-main-083 | /question-bank-assets/audio/listening/main/023.mp3 | listening-main-023 | /question-bank-assets/audio/listening/main/083.mp3 | mismatch |
| listening | listening-main-084 | /question-bank-assets/audio/listening/main/024.mp3 | listening-main-024 | /question-bank-assets/audio/listening/main/084.mp3 | mismatch |
| listening | listening-main-085 | /question-bank-assets/audio/listening/main/025.mp3 | listening-main-025 | /question-bank-assets/audio/listening/main/085.mp3 | mismatch |
| listening | listening-main-101 | /question-bank-assets/audio/listening/main/026.mp3 | listening-main-026 | /question-bank-assets/audio/listening/main/101.mp3 | mismatch |
| listening | listening-main-102 | /question-bank-assets/audio/listening/main/027.mp3 | listening-main-027 | /question-bank-assets/audio/listening/main/102.mp3 | mismatch |
| listening | listening-main-103 | /question-bank-assets/audio/listening/main/028.mp3 | listening-main-028 | /question-bank-assets/audio/listening/main/103.mp3 | mismatch |
| listening | listening-main-104 | /question-bank-assets/audio/listening/main/029.mp3 | listening-main-029 | /question-bank-assets/audio/listening/main/104.mp3 | mismatch |
| listening | listening-main-105 | /question-bank-assets/audio/listening/main/030.mp3 | listening-main-030 | /question-bank-assets/audio/listening/main/105.mp3 | mismatch |
| listening | listening-main-113 | /question-bank-assets/audio/listening/main/031.mp3 | listening-main-031 | /question-bank-assets/audio/listening/main/113.mp3 | mismatch |
| listening | listening-main-114 | /question-bank-assets/audio/listening/main/032.mp3 | listening-main-032 | /question-bank-assets/audio/listening/main/114.mp3 | mismatch |
| listening | listening-main-115 | /question-bank-assets/audio/listening/main/033.mp3 | listening-main-033 | /question-bank-assets/audio/listening/main/115.mp3 | mismatch |
| listening | listening-main-121 | /question-bank-assets/audio/listening/main/034.mp3 | listening-main-034 | /question-bank-assets/audio/listening/main/121.mp3 | mismatch |
| listening | listening-main-122 | /question-bank-assets/audio/listening/main/035.mp3 | listening-main-035 | /question-bank-assets/audio/listening/main/122.mp3 | mismatch |
| listening | listening-main-123 | /question-bank-assets/audio/listening/main/036.mp3 | listening-main-036 | /question-bank-assets/audio/listening/main/123.mp3 | mismatch |
| listening | listening-main-124 | /question-bank-assets/audio/listening/main/037.mp3 | listening-main-037 | /question-bank-assets/audio/listening/main/124.mp3 | mismatch |
| listening | listening-main-125 | /question-bank-assets/audio/listening/main/038.mp3 | listening-main-038 | /question-bank-assets/audio/listening/main/125.mp3 | mismatch |
| listening | listening-main-129 | /question-bank-assets/audio/listening/main/039.mp3 | listening-main-039 | /question-bank-assets/audio/listening/main/129.mp3 | mismatch |
| listening | listening-main-141 | /question-bank-assets/audio/listening/main/040.mp3 | listening-main-040 | /question-bank-assets/audio/listening/main/141.mp3 | mismatch |
| listening | listening-main-142 | /question-bank-assets/audio/listening/main/041.mp3 | listening-main-041 | /question-bank-assets/audio/listening/main/142.mp3 | mismatch |
| listening | listening-main-143 | /question-bank-assets/audio/listening/main/042.mp3 | listening-main-042 | /question-bank-assets/audio/listening/main/143.mp3 | mismatch |
| listening | listening-main-144 | /question-bank-assets/audio/listening/main/043.mp3 | listening-main-043 | /question-bank-assets/audio/listening/main/144.mp3 | mismatch |
| listening | listening-main-145 | /question-bank-assets/audio/listening/main/044.mp3 | listening-main-044 | /question-bank-assets/audio/listening/main/145.mp3 | mismatch |
| listening | listening-main-147 | /question-bank-assets/audio/listening/main/045.mp3 | listening-main-045 | /question-bank-assets/audio/listening/main/147.mp3 | mismatch |
| listening | listening-main-154 | /question-bank-assets/audio/listening/main/046.mp3 | listening-main-046 | /question-bank-assets/audio/listening/main/154.mp3 | mismatch |
| listening | listening-main-161 | /question-bank-assets/audio/listening/main/047.mp3 | listening-main-047 | /question-bank-assets/audio/listening/main/161.mp3 | mismatch |
| listening | listening-main-162 | /question-bank-assets/audio/listening/main/048.mp3 | listening-main-048 | /question-bank-assets/audio/listening/main/162.mp3 | mismatch |
| listening | listening-main-163 | /question-bank-assets/audio/listening/main/049.mp3 | listening-main-049 | /question-bank-assets/audio/listening/main/163.mp3 | mismatch |
| listening | listening-main-164 | /question-bank-assets/audio/listening/main/050.mp3 | listening-main-050 | /question-bank-assets/audio/listening/main/164.mp3 | mismatch |
| listening | listening-main-165 | /question-bank-assets/audio/listening/main/051.mp3 | listening-main-051 | /question-bank-assets/audio/listening/main/165.mp3 | mismatch |
| listening | listening-main-166 | /question-bank-assets/audio/listening/main/052.mp3 | listening-main-052 | /question-bank-assets/audio/listening/main/166.mp3 | mismatch |
| listening | listening-main-168 | /question-bank-assets/audio/listening/main/053.mp3 | listening-main-053 | /question-bank-assets/audio/listening/main/168.mp3 | mismatch |
| listening | listening-main-170 | /question-bank-assets/audio/listening/main/054.mp3 | listening-main-054 | /question-bank-assets/audio/listening/main/170.mp3 | mismatch |
| listening | listening-main-181 | /question-bank-assets/audio/listening/main/055.mp3 | listening-main-055 | /question-bank-assets/audio/listening/main/181.mp3 | mismatch |
| listening | listening-main-182 | /question-bank-assets/audio/listening/main/056.mp3 | listening-main-056 | /question-bank-assets/audio/listening/main/182.mp3 | mismatch |
| listening | listening-main-183 | /question-bank-assets/audio/listening/main/057.mp3 | listening-main-057 | /question-bank-assets/audio/listening/main/183.mp3 | mismatch |
| listening | listening-main-184 | /question-bank-assets/audio/listening/main/058.mp3 | listening-main-058 | /question-bank-assets/audio/listening/main/184.mp3 | mismatch |
| listening | listening-main-185 | /question-bank-assets/audio/listening/main/059.mp3 | listening-main-059 | /question-bank-assets/audio/listening/main/185.mp3 | mismatch |
| listening | listening-main-188 | /question-bank-assets/audio/listening/main/060.mp3 | listening-main-060 | /question-bank-assets/audio/listening/main/188.mp3 | mismatch |
| listening | listening-main-193 | /question-bank-assets/audio/listening/main/061.mp3 | listening-main-061 | /question-bank-assets/audio/listening/main/193.mp3 | mismatch |
| listening | listening-main-201 | /question-bank-assets/audio/listening/main/062.mp3 | listening-main-062 | /question-bank-assets/audio/listening/main/201.mp3 | mismatch |

全部逐条证据见 full-audit.json，全部异常映射见 problems.csv。
