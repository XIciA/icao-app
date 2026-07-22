# 静态查词内容

本目录是学习页静态查词的唯一内容源。

- `word-list.json` 由 `tools/static-word-lookup.mjs extract` 从当前题库确定性生成。
- 听力只纳入音频原文和四个选项，明确排除遗留答案键 `referenceText`。
- `batches/*.json` 是当前 Codex 直接生成的可审查词条批次；每个词包含一个美式 IPA、航空释义和常用释义。
- `dataset.json` 仅由 `tools/static-word-lookup.mjs assemble-dataset` 汇总批次生成，供应用运行时只读使用，不能手工编辑。
- 生成和校验不得调用外部 API、本机其他本地模型或第三方词典数据。
