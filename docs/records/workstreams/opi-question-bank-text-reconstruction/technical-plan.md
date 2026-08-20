# OPI 题库文本重建技术方案

状态：已确认

更新时间：2026-07-18

## 1. 方案结论

采用“清除失败资产—重新冻结权威基线—Codex 分阶段生产—锁值与质量检查—Codex 终审—一次应用—统一构建—双端验收—main 提交推送—生产内容发布”的路线。

正式维护源只在四类文本全部锁定、结构动作全部裁决、终审通过后统一写回。中间内容保存在被 Git 忽略的工作区，正式审计材料提交到 workstream artifacts。

## 2. 模型与执行边界

### 2.1 唯一允许的生产主体

- 主 Codex 负责阶段定位、规则统一、内容生产、结果整合、质量判断和最终发布决策。
- 主 Codex 可以按需要启用 Codex 子 Agent，处理事实核对、结构候选复核或只读审查；本轮生产文本由主 Codex 写入，子 Agent 不代写生产文本。
- 子 Agent 必须获得当前锁定输入、质量标准、禁止范围和输出合同；不得自行改变需求、话题体系、阶段顺序或发布范围。
- 所有子 Agent 结果都属于 Codex 工作流内部产物，必须进入同一工作项、锁值、抽检和审计机制。

### 2.2 明确禁止

- 禁止 Ollama、Qwen 和其他本地模型。
- 禁止外部 API 模型或 Codex 之外的生成、翻译、改写、分类和审核服务。
- 禁止把旧同事资产、旧模型资产、模型检查点或历史锁值当作生产输入。
- 禁止把脚本结构校验、模型状态或批处理完成数描述为内容质量已经通过。

### 2.3 Codex 辅助脚本

Codex 可以编写脚本辅助：

- 读取、抽取、排序和分批。
- 确定性格式清理和候选生成。
- 重复与高相似候选发现。
- 工作项写入、锁值和阶段依赖控制。
- 稳定 ID 分配、映射、应用和回滚。
- 内容构建、统计和审计报告。

脚本不得调用禁止模型。脚本生成或改写的文本必须标记来源并通过对应内容阶段的 Codex 质量检查后才能锁定。

辅助脚本只能生成或整理候选，不能自行把任何文本、结构动作、图片答案延期或阶段状态写为 `locked`。最终锁定权只属于主 Codex 或受其任务边界约束的 Codex 子 Agent，且必须在工作项中留下锁值、理由和检查记录。

## 3. 文件和所有权边界

### 3.1 允许修改

- `docs/records/workstreams/opi-question-bank-text-reconstruction/`
- `tools/opi-rebuild.mjs` 及其 OPI 专用测试或固定样例
- `content/question-banks/banks/opi/bank.json`
- `content/question-banks/banks/opi/categories/*.json`
- `content/question-banks/banks/opi/topics/*.json`
- 最终发布时的 `content/question-banks/registry.json`
- `pnpm content:build` 自动生成的正式产物
- OPI 范围学习数据清理和发布证据
- `src/config/app-version.ts`

### 3.2 禁止修改

- 图片文件、图片资源清单和纯图片卡展示
- OPI 播放、录音、权限、音频会话和转写流程
- 学习页整体 UI、导航和交互；真实渲染发现缺陷时另行评审最小修复
- 其他四套题库内容
- 服务端数据库 schema 和 migration
- 与本路线无关的用户改动

### 3.3 中间产物

新的临时快照、工作项、批次文件和自动报告统一放入：

```text
.generated/opi-rebuild/
```

阶段 0 必须先删除该目录中的全部旧资产，再重新创建。长期审计材料写入：

```text
docs/records/workstreams/opi-question-bank-text-reconstruction/artifacts/
```

## 4. OPI 专用工具

保留单一入口 `tools/opi-rebuild.mjs`。清理后至少支持：

```text
audit              只读扫描正式维护源
freeze             冻结文件、数量和卡片身份
prepare            生成空白逐卡工作项和候选索引
verify-baseline    验证源与快照一致
verify-stage       验证指定内容阶段和锁定依赖
build-review       生成批次/阶段预览和统计
apply              从全部锁定工作项构建并写回正式源
verify-formal      验证正式源、映射和产物
rollback           恢复本次冻结的 OPI 正式源
```

工具要求：

- 默认只读；只有明确的工作项写入、`apply` 或 `rollback` 修改文件。
- 不包含 Ollama、Qwen、外部 API 模型或其他本地模型入口。
- `freeze` 和 `prepare` 不写入任何旧候选内容或旧锁定状态。
- 正式应用前验证源文件校验和，发现基线外变更立即停止。
- 同一输入重复执行得到相同结构结果。
- 每个错误指出 card ID、topic ID、字段和规则。
- `apply` 先构建临时候选并完整验证，再受控替换维护源。

## 5. 工作项合同

每张原始文本卡生成一个工作项；拆分时追加派生项。核心信息至少包括：

```ts
type OpiReconstructionItem = {
  source: {
    categoryId: string
    topicId: string
    cardId: string
    contentChecksum: string
    originalContent: {
      questionEn: string
      questionZh: string
      answerEn: string
      answerZh: string
    }
  }
  decision: {
    action: 'keep' | 'rewrite' | 'split' | 'merge' | 'move' | 'delete'
    answerDisposition: 'complete' | 'deferred-image-answer'
    targetCategoryId: string
    targetTopicId: string
    canonicalCardId: string
    sourceCardIds: string[]
    reason: string
  }
  content: {
    questionEn: string
    questionZh: string
    answerEn: string | null
    answerZh: string | null
  }
  provenance: {
    producer: 'codex-main' | 'codex-subagent' | 'codex-script'
    batchId: string
  }
  review: {
    questionEn: 'pending' | 'locked'
    questionZh: 'blocked' | 'pending' | 'locked'
    answerEn: 'blocked' | 'pending' | 'locked' | 'deferred-image-answer'
    answerZh: 'blocked' | 'pending' | 'locked' | 'deferred-image-answer'
    imageDependencyReason?: string
    factSources?: Array<{ title: string; url: string }>
    factUncertainty?: string
  }
  locks: {
    questionEn?: string
    questionZh?: string
    answerEn?: string
    answerZh?: string
  }
}
```

旧正式四字段可保存在 `source.originalContent` 中用于理解和审计；新的 `content` 必须从空状态开始。任何失败候选不得进入 `content`。

## 6. 内容生产与锁定

### 6.1 批次策略

- 先处理 30 至 50 张代表性校准批次，覆盖常见语言问题、拆分、重复、移动、图片话题和航空事实题。
- 常规批次以完整话题为边界，建议包含 40 至 60 张原始卡。
- 超大话题可以拆批，但话题完成时必须合并执行去重和顺序复核。
- 每完成约 200 至 300 张，执行一次跨批次抽检和规则漂移检查。
- 抽检发现系统性问题时，记录影响规则和卡片范围，返工全部受影响项目，而不是只修抽中的样本。
- 主 Codex 在生产过程中同步完成必要校对，批次完成后不再增加一次同上下文的全文重读。
- 阶段 1 和阶段 3 由独立 Codex 对完成批次执行一次全量文本复核；普通通过项只紧凑记录卡片 ID 和通过状态，只有返工、高风险或争议项记录详细依据和建议，不得以精简报告替代全量阅读覆盖。
- 阶段 2 和阶段 4 不执行独立全量复核：继续全量生产校对和机器校验，高风险项逐项复核；普通项分别累计分层抽检不少于 200 张中文问题和 250 张中文答案。
- 中文阶段同一批次出现 3 项同类实质错误，或抽检实质错误率达到约 2%，该批升级为独立全量复核；规则性错误按受影响规则和批次整体返工。
- 主 Codex 每批只逐项处理复核争议、机器报警和高风险项，代表性普通样本改为每累计 200 至 300 张的检查点统一抽检，不再逐批抽检，也不对普通通过项进行第三次等量全文复核。主 Codex 的最终锁定权不等同于重复全量审核。
- 每批锁定后生成包含输入校验和、输出锁值、结构动作、生产者、复核者和适用规则版本的不可变 hash 清单。
- 后续发现规则、事实或风格问题时，按受影响规则和批次整体解除锁定并返工，不进行无法追溯的零散手改。

### 6.2 阶段 1：英文问题

Codex完成语法、表达、问题边界、拆分、同话题去重、归属、ID 和排序决策。阶段锁定：

- 最终英文问题。
- `keep/rewrite/split/merge/move/delete` 动作。
- canonical ID、派生 ID 和最终话题。
- 图片话题文本问题。

相似度和规则只能产生候选，合并、移动和删除必须由 Codex 作语义裁决并记录理由。

### 6.3 阶段 2：中文问题

只读取锁定英文问题重新翻译。禁止使用旧中文或失败中文候选作为底稿。锁定前验证范围、人称、语气、条件和追问一致。

### 6.4 阶段 3：英文答案

只依据最终问题编写一份英文答案。旧答案只帮助理解原始考查意图，不能直接沿用格式。高风险航空事实优先核对官方资料；体系差异或不确定性写入审计字段。

只有具体答案依赖未处理图片时才延期，且必须记录具体原因。

### 6.5 阶段 4：中文答案

只依据锁定英文答案翻译，保持观点、范围、顺序和段落一致。延期图片答案不生成中文答案。

## 7. 质量控制

### 7.1 全量机器校验

每个阶段对全部工作项验证：

- 字段非空、语言纯度、异常换行和格式。
- 阶段状态、锁值和前置校验和不变。
- ID 唯一、动作合同、源目标映射和数量对账。
- 同话题完全重复。
- 高相似候选均有裁决。
- 图片延期字段和理由一致。
- `taskTitle` 连续和顺序合法。

### 7.2 Codex 内容检查

- 校准批次用于固定语言、答案和结构标准。
- 阶段 1 和阶段 3 执行“生产与同步校对—一次独立全量复核—主 Codex 争议与高风险裁决—全量机器结构校验”。阶段 2 和阶段 4 执行“生产与同步校对—全量机器结构校验—高风险逐项复核与普通项分层抽检—主 Codex 裁决”。
- 独立复核报告对普通通过项使用紧凑记录，对返工、高风险和争议项保留可审计的详细依据与完整替换文本。
- 每 200 至 300 张的检查点抽检覆盖不同分类、生产方式和风险类型。
- 拆分、合并、移动、删除、图片延期、事实不确定项和高相似候选逐项复核。
- 航空高风险题根据事实来源和适用范围重点检查。
- 阶段 5 再进行跨话题归属、同话题去重、风格一致性和代表性内容终审。

机器校验报告和 Codex 内容检查报告分开记录，不能互相替代。

### 7.3 风险分级与风格漂移控制

- 普通语言题使用全量结构校验和每 200 至 300 张检查点抽检。
- 拆分、合并、移动、删除、图片答案延期、个人经历或公司程序题、航空程序题、具体数值/限制题和事实不确定项属于高风险项，必须逐项重点复核并记录依据。
- 每个检查点统计答案句数、段落数、常见开头和结尾、高频句式、同话题相似度、中英文段落对应和异常长度分布。
- 脚本只能报告上述模板化或漂移候选；是否返工、返工范围和最终语言裁决由 Codex 作出。
- 出现重复模板、答案长度漂移、同话题表达趋同或翻译对应偏差时，按对应批次 hash 清单确定受影响范围并重新检查。

## 8. ID、合并和顺序

- 保留卡继续使用原 ID。
- 拆分主问题使用原 ID，派生问题使用确定性全局唯一 ID。
- 合并选择质量和归属最合理的 canonical ID；其他 ID 进入 retired 映射，永不复用。
- 移动保持 card ID，记录旧 category/topic 和新 category/topic。
- 删除只用于无有效语义、无独立价值且不能合理整合的问题。
- 批次 seal 锁定最终文本、结构动作、canonical ID 和目标话题；跨批移动可能影响目标话题内多个批次的数字顺序，因此最终 targetOrder 在阶段 1 全局关闭时统一对账并由阶段 closure 锁定。批次 active 输出允许把 `targetOrder` 留空，`ingest-reviewed-batch` 只为局部结构验证分配确定性临时序号；临时序号不参与 decision lock 或批次 seal。仅调整连续数字且不改变语义位置时，不使既有批次 seal 失效，也不重复执行全文内容复核。
- 一对一合并由被合并工作项上的 `canonicalCardId` 与源卡映射提供权威审计证据，不以早期 canonical 是否冗余反向列出该源 ID 作为重新开封条件。多意图源由多个 canonical 分别承接次级意图，或 canonical 的文本、结构、话题归属发生变化时，仍必须回写受影响 canonical 并按批次 hash 重新封存。
- 普通低风险 `keep` / `rewrite` 的 `reason` 与 `reviewBasis` 只保存规则代码或一句可判定短理由；结构动作、高风险项和争议项保存完整判断依据。主 Codex 的 adjudication 与检查点文件只记录输入计数、修改 ID、裁决代码、报警结论和 seal/hash，不复制独立复核中的整段说明。
- 普通话题内 `taskTitle` 连续；原题相对顺序尽量保留；拆分题紧随主卡；移动题放在目标话题最相关位置。

## 9. 正式审计产物

至少提交：

```text
artifacts/final-card-decisions.json
artifacts/card-target-mapping.json
artifacts/structural-actions.json
artifacts/deferred-image-answers.json
artifacts/fact-sources.json
artifacts/stage-locks.json
artifacts/quality-checkpoints.json
artifacts/final-quality-report.json
artifacts/rollback-record.json
```

审计材料必须能够从每张原始卡追溯到最终目标或 retired 状态，并区分 Codex 内容检查与机器结构校验。

## 10. 正式应用和构建

四阶段锁定并通过阶段 5 终审后：

1. 从工作项构建完整 OPI 临时候选。
2. 验证数量、ID、声明值、排序、映射和四字段。
3. 运行回滚演练。
4. 一次性 `apply` 到 OPI 维护源。
5. 更新 registry release version 和 `releasedAt`。
6. 运行：

```bash
pnpm content:build
pnpm content:check:full
pnpm check
```

不得手工编辑 `dist/question-bank-release` 或 App 内嵌题库。

## 11. 学习数据处理

- 不开发旧 OPI 学习数据迁移、ID 别名或运行时兼容层。
- 正式发布前查询本地和云端 OPI 学习数据实际范围。
- 清理前备份数据库并保存范围统计。
- 只清理 OPI 范围的进度、完成状态、标签、笔记和高亮；不得影响其他题库或账号数据。
- 清理后验证旧目标不会通过同步重新写回。

## 12. 双端和生产发布

### 12.1 本地验收

- 检查普通短题、复杂多段答案、拆分题、合并题、移动题、图片话题文本题和延期答案题。
- iOS 和 Android 都验证一页一卡、英文—横线—中文、答案双语顺序和延期状态。
- 本轮不改原生依赖、Expo 插件或权限，不要求仅因内容更新重建 Development Build；使用现有 Development Build 和 Metro 验收。

### 12.2 Git

- 全程在 main 工作。
- 每个检查点审查 diff，不提交 `.generated`、密钥、证书或环境文件。
- 最终修改完成后更新 `APP_DISPLAY_VERSION`。
- 最终提交只包含有效工作流、题库、生成产物、审计和验收记录，然后推送 main。

### 12.3 生产内容发布

最新用户要求已经授权阶段 7 在本地验收通过后继续生产上线，无需再次请求发布确认。发布仍必须：

1. 从已验收 main 提交构建确定发布包。
2. 备份 PostgreSQL、当前 release、活动版本和源材料。
3. 校验数据库备份 SHA-256，并使用 `pg_restore -l` 或等价方式验证备份可读。
4. 保存内容级回滚 SQL/步骤和旧发布目录。
5. 使用既有内容导入流程导入新 release，不部署无关 API 源码。
6. 验证 `/health/ready`。
7. 使用登录态请求验证 OPI 版本、最终卡片数量、代表性卡片、checksum、ETag 和 304。
8. 验证 App 内嵌数据和 API active release 一致。
9. 保留发布与回滚证据。

## 13. 回退规则

- 英文问题改变：退回阶段 1，对应中文问题和中英文答案失效。
- 中文问题改变但英文不变：退回阶段 2，并重新检查问答匹配。
- 英文答案改变：退回阶段 3，中文答案失效。
- ID、结构动作或归属改变：退回阶段 1，并重做映射和数量对账。
- 正式源发现内容错误：修改工作项、重新锁定并重新 apply，不手改生成产物。
- 线上发现阻断问题：先恢复旧 active release，再回到对应本地阶段。

## 14. 完成定义

- 两次失败资产完全清除且未进入新工作项。
- 1333 张原始文本卡都有最终决定。
- 四阶段内容按依赖顺序锁定并通过全量结构校验与规定的 Codex 质量检查。
- 所有结构动作、事实来源、检查点和例外有审计证据。
- 正式维护源、生成产物、App 内嵌题库和线上 active release 一致。
- 双端代表性显示、生产健康检查、内容接口、ETag/304 和回滚路径通过验证。
- main 已提交并推送，最终显示版本和 closeout 与真实状态一致。
