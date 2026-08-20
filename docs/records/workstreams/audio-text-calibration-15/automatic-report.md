# 15 条音频原文校准批次

## 范围

- 听力、陆空通话、故事复诵按当前题库顺序各取前 5 条。
- 本批次只使用本机 Whisper，不调用外部 ASR API。
- 当前题库原文不被覆盖。

## 自动差异概览

| 模块 | 内容一致 | 轻微差异 | 需要复核 | 平均 WER |
| --- | ---: | ---: | ---: | ---: |
| listening | 1 | 1 | 3 | 87.16% |
| radiotelephony | 0 | 0 | 5 | 32.66% |
| storytelling | 0 | 2 | 3 | 11.21% |

## 全部样本

| 模块 | 序号 | 卡片 | WER | 自动分类 |
| --- | ---: | --- | ---: | --- |
| listening | 1 | listening-main-001 | 2.5% | minor-difference |
| listening | 2 | listening-main-002 | 0.0% | same-content |
| listening | 3 | listening-main-005 | 153.8% | review |
| listening | 4 | listening-main-021 | 143.8% | review |
| listening | 5 | listening-main-022 | 135.7% | review |
| radiotelephony | 1 | atc-scenario-0001-card-main-001 | 23.1% | review |
| radiotelephony | 2 | atc-scenario-0001-card-main-002 | 33.3% | review |
| radiotelephony | 3 | atc-scenario-0001-card-main-003 | 53.3% | review |
| radiotelephony | 4 | atc-scenario-0001-card-main-004 | 9.1% | review |
| radiotelephony | 5 | atc-scenario-0001-card-main-005 | 44.4% | review |
| storytelling | 1 | story-wing-001 | 8.3% | review |
| storytelling | 2 | story-wing-002 | 25.2% | review |
| storytelling | 3 | story-wing-003 | 17.3% | review |
| storytelling | 4 | story-wing-004 | 3.5% | minor-difference |
| storytelling | 5 | story-wing-005 | 1.8% | minor-difference |
