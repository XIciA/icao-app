# 静态查词内容

本目录是学习页静态查词的唯一内容源。

- `word-list.json` 由 `tools/static-word-lookup.mjs extract` 从当前题库确定性生成。
- 听力只纳入音频原文和四个选项，明确排除遗留答案键 `referenceText`。
- `batches/*.json` 是当前 Codex 直接生成的可审查词条批次；每个词包含一个美式 IPA、航空释义和常用释义。
- `dataset.json` 仅由 `tools/static-word-lookup.mjs assemble-dataset` 汇总批次生成，供应用运行时只读使用，不能手工编辑。
- 生成和校验不得调用外部 API、本机其他本地模型或第三方词典数据。

## 运行时交付（2026-11-03）

同一份 `dataset.json` 同时进入客户端内嵌数据和 API/内容发布服务产物。新客户端进入学习、回顾或单词收藏时，通过 `/v1/app-content/word-lookup` 按校验和更新，保存有效词表供断网使用；网络失败保留内嵌或上次缓存的词义。旧客户端仍使用其已有内嵌词表，需要安装支持此接口的版本后才能自动获取后续词表更新。

内容工单对照上一份正式题库检查新增词汇：既定文本范围内的新词没有词条时阻止发布，并返回缺词列表。先按本目录原有批次流程补齐、汇总和校验词条，再部署配套 API/内容发布服务，验证客户端可获取，最后发布题目；部署权限继续按项目规则执行。范围和分词规则由 `packages/contracts/src/word-lookup.ts` 统一提供给提取器、客户端与发布检查。

旧题库已有的缺词不因无关题目修改而自动成为新词；本轮核对的历史覆盖差异见 `docs/workstreams/app-self-check/evidence/dictionary-coverage-20261103.json`。不得把远端更新机制已实现写成历史词条全部补齐。每次题目更新的统一长期检查标准见 `docs/rules/project-boundaries.md`，此处只说明现有实现和工具操作。
