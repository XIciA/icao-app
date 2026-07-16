# OPI 题库文本梳理与重建阶段日志

状态：阶段 0 至阶段 5 文本源候选已完成

执行日期：2026-07-17

执行分支：`codex/opi-text-reconstruction-content`

## 1. 执行边界

本次只处理 OPI 权威维护源、OPI 专用 Node 工具和审计文档。未修改题库 release、App 内嵌题库、资源清单、其他题库、UI、音频、学习状态、API、数据库或 ECS。

## 2. 阶段 0：基线冻结与工具

- 冻结 153 个 OPI 源文件，基线摘要为 `f0c6cf611cfa21d21ddd5d59def82c0a75e40707e58cd3893090b5d365af2964`。
- 基线数量：8 个分类、144 个话题、1356 张卡，其中 1333 张文本卡、23 张纯图片卡。
- 建立 1333 个逐卡工作项、40 张校准卡、28 个常规批次。
- 建立 `audit`、`freeze`、`prepare`、四阶段草拟与锁定、`build-review`、`apply`、`refresh-artifacts`、`verify-formal` 和 `rollback` 命令。
- 工具只使用 Node.js 内置模块。
- 验证冻结、准备和审计结果可重复；回滚可恢复全部 153 个源文件。

## 3. 阶段 1：英文问题与结构动作

- 1333 张原始文本卡全部取得结构决策并锁定英文问题。
- 普通修订采用 `rewrite`；结构不确定项按保守原则保留，没有机械拆分、移动或删除。
- 合并 3 张同话题完全重复卡：
  - `opi-core-047` 合并到 `opi-core-040`。
  - `opi-core-433` 合并到 `opi-core-427`。
  - `opi-core-369` 合并到 `opi-core-146`。
- 处理缺失中文问题、英文问题中中文混排、未决斜杠、多问句边界和标题连续编号。
- 40 张校准卡完成后自动推进，并在 250、500、750、1000、1250、1333 张检查点执行一致性复核。

## 4. 阶段 2：中文问题

- 1333 张原始文本工作项的中文问题全部锁定。
- 最终有效文本卡中文问题覆盖率为 100%。
- 英文问题字段中的中文混排和未决斜杠均为 0。

## 5. 阶段 3：英文参考答案

- 1326 个可完成原始工作项生成并锁定英文答案；扣除 3 个合并退役项后，最终有效英文答案为 1323 张。
- 7 张必须依赖具体图片细节的答案标记为 `deferred-image-answer`，未保留或补写猜测性答案。
- 清理多版本编号、中英混排、占位符、全角英文标点、异常连字符和明显模板答案。
- 个人经历与公司程序问题使用可调整的示范回答。
- 48 个机型、运营人、机场或监管体系相关事项采用通用安全表述并列入事实复核清单。
- 9 张重要事实卡记录 ICAO、EASA、FAA 一手资料，覆盖 CVR、最低燃油/燃油紧急情况、跑道侵入和 VASI。

## 6. 阶段 4：中文参考答案

- 1326 个可完成原始工作项生成并锁定中文答案；扣除 3 个合并退役项后，最终有效中文答案为 1323 张。
- 7 张图片依赖卡的中英文答案同时留空并记录延期原因。
- 最终英文答案中中文字符为 0；中英文答案分别存储。

## 7. 阶段 5：正式写回与审计

- 最终数量：8 个分类、144 个话题、1353 张卡，其中 1330 张文本卡、23 张纯图片卡。
- 动作数量：`rewrite=1330`、`merge=3`、`split=0`、`move=0`、`delete=0`、`deferred-image-answer=7`。
- 保留卡继续使用稳定 card ID；3 个合并退役 ID 未被复用。
- 普通话题沿用原领域标题前缀连续重排 `taskTitle`；图片话题沿用既有图片题命名模式。
- 23 张纯图片卡内容未改变，已有文本题音频路径未丢失。
- 生成正式逐卡决策、目标映射和质量报告。

## 8. 文本阶段验证

已执行：

```text
node --check tools/opi-text-reconstruction.mjs
node tools/opi-text-reconstruction.mjs audit
node tools/opi-text-reconstruction.mjs verify-stage question-en
node tools/opi-text-reconstruction.mjs verify-stage question-zh
node tools/opi-text-reconstruction.mjs verify-stage answer-en
node tools/opi-text-reconstruction.mjs verify-stage answer-zh
node tools/opi-text-reconstruction.mjs build-review
node tools/opi-text-reconstruction.mjs refresh-artifacts
node tools/opi-text-reconstruction.mjs verify-formal
git diff --check
```

最终提交前会在更新显示版本后再次执行上述 OPI 专用验证和 diff 检查。
