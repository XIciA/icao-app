# 五套题库文本质量技术盘点

## 执行前真实基线

- Git HEAD：`5dad439b34dcd215cf8cdb1011c3b5544b09edc5`
- 题库 `releaseVersion`：11
- 维护源：`content/question-banks`
- 题库：5；分类：28；话题：341；卡片：6,865
- 用户可见文本值：40,564
- 该基线在陆空通话 v11 handoff 后重新计算；详细五库 checksum、结构投影和资源摘要见
  `artifacts/baseline-v11.json`。

最初 v10 题库维护路径没有未提交修改。陆空通话任务随后独占写入并完成 v11，本任务在收到
明确 handoff 后才接管共享路径。工作区存在与本任务无关的文档整理改动及已有显示版本变化，
本任务不覆盖或发布这些无关文件。

## 已有共享能力

- `tools/question-bank-content.mjs` 负责维护源校验、构建 App 内嵌数据与 release。
- `QuestionBankRepository` 是 Native/Web 统一消费入口。
- `content/word-lookup` 从内嵌题库派生静态查词数据。
- `tools/asr-hotwords.mjs` 从正式题库字段派生 ASR 候选与库存。
- ECS 使用现有内容导入脚本写入版本化题库 release，不需要修改或重启 API。
- Web 使用不可变内容镜像和资源分片，纯文本版本可以复用现有资源。

## 现有缺口

现有 `content:check` 能验证 schema、数量、ID、资源和生成一致性，但不会发现乱码、OCR、
拼写、粘词和低级语法问题。历史故事复诵报告还明确保留了 `familv`、`livina`、
`performingfligInt` 等候选；静态词典中共有 132 个词形被标为疑似拼写或粘连，可作为本次
复核的第二证据，但不能替代逐题上下文判断。

## 实施结论

在正式维护源之上增加只读审查、指纹修复账本和覆盖门禁，不改变运行时 contract。所有正式
修复仍只进入 `content/question-banks`，内嵌题库、远程 release、查词和 ASR 库存继续由现有
共享链路生成，不建立第二来源。
