# OPI 题库文本重建技术盘点

状态：已完成；阶段 0 清理尚未执行

更新时间：2026-07-18

## 1. 盘点结论

当前统一题库架构能够承载 OPI 文本重建，正式维护源尚未被两次失败尝试覆盖，可以从权威源重新开始。

当前不能继承此前“英文问题已锁定”“中文问题已完成”或“英文答案生成中”等状态。正式进入小流程前必须先清除同事失败资产和 Ollama/Qwen 失败资产，移除脚本中的旧生产文本生成逻辑，再重新冻结干净基线。

本轮无需修改学习页、音频架构、API 源码或数据库 schema。主要工作是内容生产、稳定 ID、审计映射、统一构建和内容 release 发布。

## 2. 当前 Git 与工作区状态

只读检查时间：2026-07-18，Asia/Shanghai。

- 当前分支：`main`。
- `main` 相对本地记录的 `origin/main` 领先 2 个提交。
- 领先提交：
  - `dca4e47 chore(content): freeze OPI rebuild baseline`
  - `1923fc5 feat(content): lock rebuilt OPI English questions`
- 未提交修改：`tools/opi-rebuild.mjs`。
- 未跟踪文件：`tools/opi-model-batches.mjs`。
- 正式 OPI 维护源、registry 和构建产物相对 `origin/main` 没有差异。
- 当前 `phase-log.md` 错误声明阶段 0、阶段 1 已完成、阶段 2 执行中。

不得使用 `git reset --hard` 清理。应在 main 上形成可审查的新修改，保留历史事实，同时把失败状态明确标记为废弃。

## 3. 权威维护源和当前基线

OPI 权威维护源：

```text
content/question-banks/registry.json
content/question-banks/banks/opi/bank.json
content/question-banks/banks/opi/categories/*.json
content/question-banks/banks/opi/topics/*.json
```

当前 release version 为 6。维护源实际数量：

| 项目 | 数量 |
| --- | ---: |
| 分类 | 8 |
| 话题 | 144 |
| 普通话题 | 121 |
| 图片话题 | 23 |
| 全部卡片 | 1356 |
| 文本问题卡 | 1333 |
| 纯图片卡 | 23 |
| 图片话题内文本卡 | 64 |

bank、category、topic 的声明数量与实际数量一致，1356 个 card ID 唯一。

现有字段缺口：

| 字段 | 缺少数量 |
| --- | ---: |
| `audioText` | 0 |
| `audioTextZh` | 20 |
| `referenceText` | 0 |
| `referenceTextZh` | 1269 |

旧冻结 manifest 包含 153 个源文件，与当前正式维护源逐文件一致；旧摘要为 `81ff4e8d16582b5bfd3a2e6b4cf08f6f6eb89159be2b6b93f4c0e3370aea7d42`。该一致性只证明正式源未被污染，不授权继承旧工作项。阶段 0 仍须在清理后重新冻结。

## 4. 两次失败资产

### 4.1 同事失败资产

两个领先提交包含：

- 基线冻结脚本和旧阶段日志。
- 自动清洗、改写和拆分英文问题的确定性逻辑。
- `QUESTION_OVERRIDES`、强制拆题规则和 `draft-question-en`。
- 将脚本生成的英文问题和结构动作直接标记为 `locked` 的行为。

虽然这些文本没有写回正式 topic JSON，但它们已经形成了失败候选和不可信阶段状态，必须全部舍弃。辅助脚本可以由 Codex 重新设计，但不得继承旧候选文本、拆分结果、合并结果或锁定结论。

### 4.2 Ollama/Qwen 失败资产

只读检查时发现仍在运行：

- `ollama serve`。
- 一个 Qwen Ollama runner。

`.generated/opi-rebuild/` 约 8 MB，包含：

- 旧快照、manifest、audit 和检查点。
- `work-items.before-model.json`。
- `work-items.json`。
- Qwen 英文问题审核和润色状态。
- 1254 条 Qwen 中文问题。
- 610 条 Qwen 英文答案。
- 12 条模型判定的图片答案延期。

当前工作项还记录 `qwen3:8b`、`qwen3:4b` 和 `local-ollama` 的 generation 元数据。未跟踪的 `tools/opi-model-batches.mjs` 是完整的 Ollama 批处理入口；`tools/opi-rebuild.mjs` 的未提交修改包含模型状态、模型候选处理、答案阶段和应用逻辑。

以上内容全部不可作为正式文本或审计证据，阶段 0 应停止进程并删除整个旧生成目录后重新建立基线。

## 5. 统一题库和展示能力

五套题库共用 `content/question-banks` 维护源、统一构建工具、App 内嵌题库和 API release contract。本轮应继续复用该唯一来源，不能创建 OPI 专属运行时题库副本。

当前学习页分别读取：

```text
audioText
audioTextZh
referenceText
referenceTextZh
```

问题和答案的中文字段都通过顶部 hairline 与英文分隔，现有实现已经支持“英文—横线—中文”。图片答案延期时，现有页面可显示问题并以“暂无参考内容”处理缺少答案的状态。只有真实双端渲染发现缺陷时，才评审最小 UI 修复。

OPI `audioMode` 为 `generated`，修改英文问题不需要捆绑本地 OPI 问题音频，也不涉及 `AudioSessionOrchestrator`、录音器或音频生命周期。

## 6. 构建和发布链路

维护源通过 `pnpm content:build` 生成：

- `dist/question-bank-release`
- `src/features/question-bank/data/question-bank.json`

`pnpm content:check:full` 对账维护源、生成产物和资源。上述生成产物不得手工修改。

服务端使用 `services/api/scripts/import-content.mjs` 导入 `question_bank_releases`。新版本导入会停用同题库旧版本，但保留旧 release 行；正式发布仍需保存数据库 dump、旧发布目录、旧激活版本和内容级回滚步骤。

纯内容更新不要求部署或重启无关 API 源码。导入内容后仍应验证 `/health/ready` 和真实 OPI 接口。

## 7. 当前验证缺口

- `tools/question-bank-live-verify.mjs` 仍硬编码 OPI 1269 张和旧线上版本预期，不能直接用于新 release 的最终验收。
- OPI 专用工具尚未形成符合新边界的干净版本；当前版本同时混有可靠基础能力和两次失败生产逻辑。
- 当前 phase-log 与真实状态不一致。
- 正式审计 artifacts 和 closeout 尚不存在。
- 尚未验证当前生产凭证、双端设备连接和数据库备份恢复操作；这些不是文本阶段的当前阻塞，但必须在阶段 7 前验证。

## 8. 可复用能力

可以保留或重新实现的确定性能力：

- 读取 OPI bank、category、topic 和 card。
- 统计数量、字段覆盖和异常格式。
- 生成文件级与卡片级校验和。
- 冻结和验证正式基线。
- 承载 Codex 生产的逐卡工作项。
- 生成完全重复与高相似候选，供 Codex 裁决。
- 分配和验证稳定派生 ID。
- 校验四阶段锁值、字段纯度、动作映射和数量。
- 从全部锁定工作项构建候选、apply、verify-formal 和 rollback。
- 生成最终审计材料。

不能保留：

- 旧候选文本和结构裁决。
- 旧锁定状态和阶段完成状态。
- Ollama/Qwen 请求、Prompt、endpoint、模型状态或检查点。
- 仅为了旧候选存在的硬编码合并、重写和润色结果。

## 9. 风险

### P0：正式内容阶段前必须解决

- 两次失败资产没有完全清除。
- 脚本仍可调用 Codex 之外的模型。
- 旧候选文本、结构动作或锁定状态被带入新工作项。
- phase-log 继续错误声明阶段已经完成。
- 正式源基线没有在清理后重新冻结。

### P1：正式应用前必须解决

- 1333 张原始文本卡没有完整决定和源目标映射。
- 拆分、合并、移动、删除和图片延期没有逐项理由。
- 后阶段反向修改前阶段锁定内容。
- 相似度脚本自动决定删除。
- 航空高风险内容没有官方依据或保守范围说明。
- 抽检发现系统性问题但受影响批次没有返工。

### P1：生产发布前必须解决

- 新 release 与 App 内嵌题库或线上 active release 不一致。
- 旧 OPI 学习数据清理没有范围确认、备份和验证。
- 数据库备份没有完成校验和与恢复目录可读性验证。
- 线上验证仍使用 1269 张的陈旧预期。
- 未验证 ETag、304、代表性卡片和回滚路径。

## 10. 结论

大流程技术路线成立，不需要改变 React Native、Expo、统一题库、API 或数据库架构。正确起点是：先稳定四份大流程文档，再在阶段 0 彻底清除两次失败资产、恢复真实阶段状态、重建干净工具和基线，然后由 Codex 按四类文本锁定顺序继续执行。

当前没有需要用户再次决定的产品或架构阻塞。
