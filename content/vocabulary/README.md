# 单词资源

现行客户端使用 `three-books/dataset.json`：三本人工词书为分级标杆，经全题库筛选、去重与格式规范后共1833张学习卡（379 / 744 / 710）。Native与产品Web通过同一API目录 `catalog=three-books-v3` 加载，并复用既有缓存、学习状态与音频机制。

## 当前编辑与生成

- `three-books/*.tsv`：明确的词目规范、同卡覆盖、补充词、缩写和例句编辑表。
- `three-books/inventory.json`：固定正式题库引用链的全量词形盘点，包含来源哈希；`pool-decisions.json`记录每个盘点词目的收录或不独立设卡归属。
- `three-books/source.json`：人工838条、已审核409条与编辑表的汇总产物，不手改；编辑表哈希防止漏生成。
- `pnpm vocabulary:three-books:build`：确定性生成当前三本目录与共享记录迁移表。
- `pnpm vocabulary:check`：同时检查现行目录和旧协议兼容目录。
- 更新编辑表后按任务文档运行 `prepare-vocabulary-inventory.py`（语料变化时）、`assemble-three-book-source.py`、`three-book-vocabulary.mjs build`及`vocabulary-pool-decisions.py`。缺少例句时不覆盖上一份有效来源；生成被中断可安全重跑。
- 发音由既有 `tools/generate-pronunciations.py` 补齐、`--check`校验，沿用不可变MP3资源发布机制；不在运行时调用TTS生成新录音。

## 旧协议基准

根目录 `dataset.json` 保留原三本838条，既作为人工分级基准，也供旧客户端v1协议使用。`question-bank-core`保留已审核409条来源与旧v2协议；现行客户端不显示第四本词书。两套旧响应及ETag继续兼容，不能把新词混入固定数量的旧响应。

- 来源参考：`/Users/zhouyide/Desktop/icao项目/feizhuicu/public/data/vocab`
- 生成：`pnpm vocabulary:extract`
- 校验：`pnpm vocabulary:check`
- 旧协议数量：360 + 372 + 106 = 838

不得手工混入 `*_例句替换.json`、题库内容、空音标或空音频字段。需要更新时先修改已确认来源，再重新生成并检查差异。
