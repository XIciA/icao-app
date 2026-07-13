# 听力题库音频映射全量审计

## 范围与方法

- 审计题目：631 条。
- 当前规范音频：631 个。
- 旧命名参考音频：632 个。
- 删除前历史基线：设计仓库 2275d8c^，共 632 条。
- 依据：稳定卡片 ID、删除前 taskTitle、当前 audio 路径以及两套音频的 SHA-256。
- 未重新听音频，未运行 ASR，未调用外部 API，未修改题库或音频。

## 结论

- 映射正确：2 条。
- 明确错配：628 条。
- 正确音频在规范目录中缺失：1 条。
- 当前路径缺失：0 条。
- 参考音频缺失：0 条。
- 当前音频路径唯一：631/631。
- 原始卡片编号与规范音频文件名经哈希确认：630/631。
- 规范目录中不属于任何现存卡片的音频内容：1 个。
- 删除后标题被重排：1 条；删除的历史卡片：listening-main-595。

系统性原因：规范音频文件名仍对应稳定卡片 ID，但题库按四类重新分组后，audio 路径按新的分组顺序重新顺次挂载，造成内容与题目错位。删除 listening-main-595 时删除的是它当时错误挂载的顺序文件 main/454.mp3，导致现存卡片 listening-main-454 的正确规范音频缺失；被删除题目的音频 main/595.mp3 仍然保留。删除后 listening-main-623 的展示标题从 20s航空英语-96 重排成 -95，但其正确音频仍是 main/623.mp3，审计已按稳定 ID 和删除前标题处理该边界。

## 分题组统计

| 题组 | 卡片 | 正确 | 错配 | 缺少正确规范音频 |
| --- | ---: | ---: | ---: | ---: |
| listening-topic-01 | 245 | 2 | 242 | 1 |
| listening-topic-02 | 114 | 0 | 114 | 0 |
| listening-topic-03 | 95 | 0 | 95 | 0 |
| listening-topic-04 | 177 | 0 | 177 | 0 |

## 需要从旧资源恢复

| 卡片 | 标题 | 建议规范路径 | 只读参考源 |
| --- | --- | --- | --- |
| listening-main-454 | 10s航空英语-163 | /question-bank-assets/audio/listening/main/454.mp3 | /Users/zhouyide/Desktop/icao设计稿/public/question-bank/listening/10s航空英语-163.mp3 |

## 前 40 条问题样本

| 卡片 | 标题 | 状态 | 当前路径 | 当前实际内容对应标题 | 建议路径 |
| --- | --- | --- | --- | --- | --- |
| listening-main-005 | 10s航空英语-3 | mismatch | /question-bank-assets/audio/listening/main/003.mp3 | 20s陆空通话-1 | /question-bank-assets/audio/listening/main/005.mp3 |
| listening-main-021 | 10s航空英语-4 | mismatch | /question-bank-assets/audio/listening/main/004.mp3 | 20s航空英语-1 | /question-bank-assets/audio/listening/main/021.mp3 |
| listening-main-022 | 10s航空英语-5 | mismatch | /question-bank-assets/audio/listening/main/005.mp3 | 10s航空英语-3 | /question-bank-assets/audio/listening/main/022.mp3 |
| listening-main-024 | 10s航空英语-6 | mismatch | /question-bank-assets/audio/listening/main/006.mp3 | 10s陆空通话-1 | /question-bank-assets/audio/listening/main/024.mp3 |
| listening-main-025 | 10s航空英语-7 | mismatch | /question-bank-assets/audio/listening/main/007.mp3 | 10s陆空通话-2 | /question-bank-assets/audio/listening/main/025.mp3 |
| listening-main-029 | 10s航空英语-8 | mismatch | /question-bank-assets/audio/listening/main/008.mp3 | 20s陆空通话-2 | /question-bank-assets/audio/listening/main/029.mp3 |
| listening-main-041 | 10s航空英语-9 | mismatch | /question-bank-assets/audio/listening/main/009.mp3 | 20s陆空通话-3 | /question-bank-assets/audio/listening/main/041.mp3 |
| listening-main-042 | 10s航空英语-10 | mismatch | /question-bank-assets/audio/listening/main/010.mp3 | 10s陆空通话-3 | /question-bank-assets/audio/listening/main/042.mp3 |
| listening-main-043 | 10s航空英语-11 | mismatch | /question-bank-assets/audio/listening/main/011.mp3 | 20s陆空通话-4 | /question-bank-assets/audio/listening/main/043.mp3 |
| listening-main-044 | 10s航空英语-12 | mismatch | /question-bank-assets/audio/listening/main/012.mp3 | 20s陆空通话-5 | /question-bank-assets/audio/listening/main/044.mp3 |
| listening-main-045 | 10s航空英语-13 | mismatch | /question-bank-assets/audio/listening/main/013.mp3 | 20s陆空通话-6 | /question-bank-assets/audio/listening/main/045.mp3 |
| listening-main-061 | 10s航空英语-14 | mismatch | /question-bank-assets/audio/listening/main/014.mp3 | 10s陆空通话-4 | /question-bank-assets/audio/listening/main/061.mp3 |
| listening-main-062 | 10s航空英语-15 | mismatch | /question-bank-assets/audio/listening/main/015.mp3 | 10s陆空通话-5 | /question-bank-assets/audio/listening/main/062.mp3 |
| listening-main-063 | 10s航空英语-16 | mismatch | /question-bank-assets/audio/listening/main/016.mp3 | 10s陆空通话-6 | /question-bank-assets/audio/listening/main/063.mp3 |
| listening-main-064 | 10s航空英语-17 | mismatch | /question-bank-assets/audio/listening/main/017.mp3 | 10s陆空通话-7 | /question-bank-assets/audio/listening/main/064.mp3 |
| listening-main-065 | 10s航空英语-18 | mismatch | /question-bank-assets/audio/listening/main/018.mp3 | 20s陆空通话-7 | /question-bank-assets/audio/listening/main/065.mp3 |
| listening-main-075 | 10s航空英语-19 | mismatch | /question-bank-assets/audio/listening/main/019.mp3 | 10s陆空通话-8 | /question-bank-assets/audio/listening/main/075.mp3 |
| listening-main-078 | 10s航空英语-20 | mismatch | /question-bank-assets/audio/listening/main/020.mp3 | 10s陆空通话-9 | /question-bank-assets/audio/listening/main/078.mp3 |
| listening-main-081 | 10s航空英语-21 | mismatch | /question-bank-assets/audio/listening/main/021.mp3 | 10s航空英语-4 | /question-bank-assets/audio/listening/main/081.mp3 |
| listening-main-082 | 10s航空英语-22 | mismatch | /question-bank-assets/audio/listening/main/022.mp3 | 10s航空英语-5 | /question-bank-assets/audio/listening/main/082.mp3 |
| listening-main-083 | 10s航空英语-23 | mismatch | /question-bank-assets/audio/listening/main/023.mp3 | 10s陆空通话-10 | /question-bank-assets/audio/listening/main/083.mp3 |
| listening-main-084 | 10s航空英语-24 | mismatch | /question-bank-assets/audio/listening/main/024.mp3 | 10s航空英语-6 | /question-bank-assets/audio/listening/main/084.mp3 |
| listening-main-085 | 10s航空英语-25 | mismatch | /question-bank-assets/audio/listening/main/025.mp3 | 10s航空英语-7 | /question-bank-assets/audio/listening/main/085.mp3 |
| listening-main-101 | 10s航空英语-26 | mismatch | /question-bank-assets/audio/listening/main/026.mp3 | 10s陆空通话-11 | /question-bank-assets/audio/listening/main/101.mp3 |
| listening-main-102 | 10s航空英语-27 | mismatch | /question-bank-assets/audio/listening/main/027.mp3 | 10s陆空通话-12 | /question-bank-assets/audio/listening/main/102.mp3 |
| listening-main-103 | 10s航空英语-28 | mismatch | /question-bank-assets/audio/listening/main/028.mp3 | 10s陆空通话-13 | /question-bank-assets/audio/listening/main/103.mp3 |
| listening-main-104 | 10s航空英语-29 | mismatch | /question-bank-assets/audio/listening/main/029.mp3 | 10s航空英语-8 | /question-bank-assets/audio/listening/main/104.mp3 |
| listening-main-105 | 10s航空英语-30 | mismatch | /question-bank-assets/audio/listening/main/030.mp3 | 10s陆空通话-14 | /question-bank-assets/audio/listening/main/105.mp3 |
| listening-main-113 | 10s航空英语-31 | mismatch | /question-bank-assets/audio/listening/main/031.mp3 | 20s陆空通话-8 | /question-bank-assets/audio/listening/main/113.mp3 |
| listening-main-114 | 10s航空英语-32 | mismatch | /question-bank-assets/audio/listening/main/032.mp3 | 20s陆空通话-9 | /question-bank-assets/audio/listening/main/114.mp3 |
| listening-main-115 | 10s航空英语-33 | mismatch | /question-bank-assets/audio/listening/main/033.mp3 | 20s陆空通话-10 | /question-bank-assets/audio/listening/main/115.mp3 |
| listening-main-121 | 10s航空英语-34 | mismatch | /question-bank-assets/audio/listening/main/034.mp3 | 10s陆空通话-15 | /question-bank-assets/audio/listening/main/121.mp3 |
| listening-main-122 | 10s航空英语-35 | mismatch | /question-bank-assets/audio/listening/main/035.mp3 | 20s陆空通话-11 | /question-bank-assets/audio/listening/main/122.mp3 |
| listening-main-123 | 10s航空英语-36 | mismatch | /question-bank-assets/audio/listening/main/036.mp3 | 20s陆空通话-12 | /question-bank-assets/audio/listening/main/123.mp3 |
| listening-main-124 | 10s航空英语-37 | mismatch | /question-bank-assets/audio/listening/main/037.mp3 | 20s陆空通话-13 | /question-bank-assets/audio/listening/main/124.mp3 |
| listening-main-125 | 10s航空英语-38 | mismatch | /question-bank-assets/audio/listening/main/038.mp3 | 20s陆空通话-14 | /question-bank-assets/audio/listening/main/125.mp3 |
| listening-main-129 | 10s航空英语-39 | mismatch | /question-bank-assets/audio/listening/main/039.mp3 | 20s陆空通话-15 | /question-bank-assets/audio/listening/main/129.mp3 |
| listening-main-141 | 10s航空英语-40 | mismatch | /question-bank-assets/audio/listening/main/040.mp3 | 10s陆空通话-16 | /question-bank-assets/audio/listening/main/141.mp3 |
| listening-main-142 | 10s航空英语-41 | mismatch | /question-bank-assets/audio/listening/main/041.mp3 | 10s航空英语-9 | /question-bank-assets/audio/listening/main/142.mp3 |
| listening-main-143 | 10s航空英语-42 | mismatch | /question-bank-assets/audio/listening/main/042.mp3 | 10s航空英语-10 | /question-bank-assets/audio/listening/main/143.mp3 |

完整逐条结果见 full-audit.json；全部问题映射见 problems.csv。
