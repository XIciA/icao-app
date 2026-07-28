# 技术盘点：OPI 热点功能 (OPI Hotspot Feature)

## 1. 真实项目现状

### 1.1 OPI 题库数据规模与结构

- **数据路径**：`content/question-banks/banks/opi/`（构建后嵌入 `src/features/question-bank/data/question-bank.json`）
- **8 个分类**：气象 / 特情故障 / 运行机场 / 人身客舱 / 空域管制导航 / 鸟击外来物 / 油量备降 / 图片题
- **144 个话题**：121 个文本话题（`opi-topic-0001` ~ `opi-topic-0149`）+ 23 个图片话题（`opi-image-topic-001` ~ `opi-image-topic-023`）
- **1090 张卡片**
- **卡片 ID 格式**：
  - 文本题：`opi-core-XXX`（如 `opi-core-001`、`opi-core-014`）
  - 图片题（本次排除）：`opi-image-XXX-image`（图片卡）、`opi-image-XXX-qYY`（图片问题卡）
- **学习配置**：`interaction: 'speaking'`、`audioMode: 'generated'`、`reviewMode: 'expression-analysis'`
- **分类单位**：`categoryUnit: '分类'`、`topicUnit: '话题'`、`cardUnit: '卡'`

### 1.2 相关源码路径

| 模块 | 路径 |
| --- | --- |
| 题库类型 | `src/features/question-bank/types.ts` |
| 题库加载 | `src/features/question-bank/data/repository.ts` |
| 卡片学习组件 | `src/features/question-bank/components/QuestionBankStudyScreen.tsx` |
| 学习会话 hook | `src/features/question-bank/hooks/useStudySession.ts` |
| 发现页入口 | `src/features/content/DiscoverHomeScreen.tsx` |
| 热点占位组件 | `src/features/content/ContentLibraryScreen.tsx` |
| 学习路由 | `src/app/question-bank/[bankId]/study/[categoryId]/[topicId].tsx` |

### 1.3 Word 参考资料

位于 `原始资源资料/OPI热点/`：
- `6月热点话题.docx`
- `热点1.docx`
- `热点2.docx`（16 MB，含图片）
- `考点话题收集.docx`

仅作为日期、考点地点、话题内容的参考，不要求一一映射。

---

## 2. 已有能力与可复用部分

1. **题库加载**：`loadQuestionBank('opi')` 支持离线嵌入 / 远程缓存 / 实时拉取三级降级。
2. **学习全套设施**：`QuestionBankStudyScreen` 集成音频播放（`StudyAudioPlayer`）、录音与表达分析（`StudyTaskRenderer`）、生词高亮查词（`InteractiveStudyText`）、翻页手势、学习报告（`StudyReport`）。
3. **解耦数据契约**：`useStudySession` 接受任何符合 `QuestionBankDataset / QuestionBankCategory / QuestionBankTopic` 契约的数据包，不绑定特定 bankId 路由。
4. **学习记录**：`sqliteLearningStore` 按 topic ID 存储卡片状态，`categoryTitle` 字段可区分来源。

---

## 3. 缺口分析

| 领域 | 现状 | 缺口 |
| --- | --- | --- |
| 热点数据源 | `ContentLibraryScreen.tsx` 硬编码 2 条假 briefs | 缺少 `opi-hotspots.json` 及抽题脚本 |
| 详情页 | BottomSheet 仅展示话题名和假描述 | 需要全屏导航页，展示话题与真实题目列表 |
| 练习包组装 | 无 | 需要 `buildHotspotSession()` 从 OPI dataset 动态切片合成 |
| 学习模式挂载 | 无法开始学习 | 需要拉起 `QuestionBankStudyScreen` 全屏学习 |
| 图片题过滤 | 无 | 抽题和校验逻辑需排除 `opi-category-08` |
| 学习记录区分 | 热点与常规 OPI 记录无法分辨 | categoryTitle 需嵌入 `[热点]` 前缀 |

---

## 4. 不能破坏的旧行为与回滚点

- 绝不能破坏现存 OPI 基础题库（`question-bank.json` 及 `/question-bank/opi/study/...`）的学习流转与进度存储。
- 回滚点：保留 `ContentLibraryScreen.tsx` 的路由接入，仅重构内部视图；热点包组装失败时平滑降级。
