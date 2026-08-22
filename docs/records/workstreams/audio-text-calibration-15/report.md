# 15 条音频原文校准批次

## 范围

- 听力、陆空通话、故事复诵按当前题库顺序各取前 5 条。
- 本批次只使用本机 Whisper，不调用外部 ASR API。
- 当前题库原文不被覆盖。

## 人工判断结论

- 当前原文更合理：7 条。
- 内容等价：2 条。
- 内容等价但存在口语/规范格式差异：3 条。
- 卡片与音频链接错配：3 条，全部出现在听力样本。
- Whisper 可以直接替代为最终原文：0 条。

最重要的发现不是文字错误，而是听力资源映射错误：

| 卡片 | 当前音频 | 当前音频实际内容 | 应对应音频 |
| --- | --- | --- | --- |
| listening-main-005 | main/003.mp3 | 20s陆空通话-1 | main/005.mp3 |
| listening-main-021 | main/004.mp3 | 20s航空英语-1 | main/021.mp3 |
| listening-main-022 | main/005.mp3 | 10s航空英语-3 | main/022.mp3 |

上述对应关系使用旧听力资源与规范资源 SHA-256 校验值交叉确认，不只是根据 Whisper 文本猜测。

陆空通话和故事复诵的主要差异来自两种合理表示：音频会读出 `four three two`、`Air Canada 702`、`runway zero two left`，当前题库则写成 `432`、`ACA702`、`02L`。对于 App 展示，当前规范写法通常更合理；如果字段必须是严格逐字稿，则应另存口语形式，而不应直接用 Whisper 覆盖当前字段。

另外发现未播出的展示元数据混在 `audioText` 中：陆空通话的 `B:` / `C:`、故事复诵末尾的独立呼号和 `(113 words)` / `(112 words)`。后续应决定保留为展示标签还是迁移到独立字段。

逐条判断与理由见 `review.json`，完整当前原文和 Whisper 输出见 `comparison.json`。

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
