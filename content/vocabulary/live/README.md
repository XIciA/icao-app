# 人工复审后的动态词库

固定输入为`../reviewed-20261026/decisions.json`（1826个原始决定）及`../three-books/source.json`（1833词旧版基线）。旧v3目录不改写，供已安装的旧App兼容。当前动态候选1659词：预习390、四级811、五级458。

`editorial.tsv`保存新增词和例句/译文修订，`meanings.tsv`保存中文精简/纠错，`decompositions.tsv`保存明确拆解的低价值组合。`source.json`是这些输入的汇总产物；`release.json`是语料统计后可整体校验的发布候选；`curation-report.json`留存拆词、删除、合并、空选补齐及等级一致性判断。不手改生成JSON。

```sh
python3 tools/curate-vocabulary-live.py
node tools/build-vocabulary-live.mjs build
node --test tools/vocabulary-live-content.test.mjs
python3 tools/generate-pronunciations.py
python3 tools/generate-pronunciations.py --check
```

缺少释义/双语例句时只写`.generated/vocabulary-live/draft-source.json`，失败不覆盖有效source。构建校验审核输入、编辑表摘要、当前五题库文本、词条/迁移引用，并在执行中源文件变化时拒绝写入。

本轮中文标签/标点/格式及同义表达已按用户口述处理。可独立学习的相关表达存`relatedExpressions`，由App有意分行展示；同义表达在英文区使用` / `连接。保留专业固定概念，普通组合按用户规则去重，必须新增的独立词/表达配齐例句和两种朗读。

同类等级检查对6组进行了调整，详细原等级/目标及理由见curation-report。原始人工决定不覆盖，所有编辑调整另留痕。原先例句只出现反义否定词形（如non-conductive、de-escalate、un-inflated）的情况已换成对应本词的独立例句。

语义复核的主要参考：

- [FAA Pilot/Controller Glossary — M](https://www.faa.gov/Air_Traffic/publications/atpubs/pcg_html/glossary-m.html)：MSA的Minimum Safe Altitude与ICAO Minimum Sector Altitude语境。候选合为一个缩写词条，在中文中保留两种语境，不把两者无条件等同。
- [FAA Pilot/Controller Glossary — C](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-c.html)：CAT对应Clear Air Turbulence。
- [FAA Engine Fire Handle解释](https://www.faa.gov/media/11571)：纠正engine fire handle原“发电机灭火器手柄”为“发动机灭火手柄”。
- [FAA AC 91-74A](https://www.faa.gov/sites/faa.gov/files/2022-11/AC_91-74A.pdf)：皮托管加热/结冰语境，纠正pitot de-icer的原全静压管泛化译法。

这些是词义及语境参考，不向用户新增具体机型的操作程序。

配套录音仍由现有Mac Samantha流程生成并通过同一不可变资源登记机制交付。当前总清单11207项，原11093项不变，新增114项（2122776字节）；可恢复交接包在`/Users/zhouyide/Desktop/icao-app/outputs/vocabulary-live-20261027`。尚未上传/登记新增音频，候选未正式发布。
