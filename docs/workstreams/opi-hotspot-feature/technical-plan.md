# 技术方案：OPI 热点功能 (OPI Hotspot Feature)

## 1. 推荐方案

### 1.1 数据架构：热点资讯索引 JSON

采用**映射索引层架构**。建立 `content/question-banks/opi-hotspots.json`，数据结构仅定义热点资讯元数据与 OPI 题目 ID 的引用映射：

```typescript
type OpiHotspotBrief = {
  id: string;           // 如 'hotspot-2026-07-09'
  date: string;         // '2026-07-09'
  title: string;        // '7月9日 考试资讯'
  centers: string[];    // ['广汉考点', '绵阳考点']（考试地点标签）
  topics: OpiHotspotTopic[];
};

type OpiHotspotTopic = {
  topicId: string;      // 引用 OPI 原生话题 ID，如 'opi-topic-0012'
  topicTitle: string;   // 话题显示名，如 '风切变'
  cardIds: string[];    // 该话题下抽取的部分卡片 ID，如 ['opi-core-020', 'opi-core-021', ...]
};
```

- 一条考试资讯 = 一套题 ≈ 5 个话题 × 6 张卡片 ≈ 30 题（数量按需可调）。
- 每个话题不一定包含原生 OPI topic 下的全部卡片，可抽取部分。
- 题目数据零冗余：音频、参考答案、双语文本完全从 OPI dataset 实时解包挂载。

### 1.2 初始数据生成策略

1. **第一阶段：随机抽题**。编写 `scripts/generate-opi-hotspots.ts` 脚本，从 OPI 题库中（排除 `opi-category-08` 图片题分类）随机选取话题和卡片，生成初始 `opi-hotspots.json`。
2. **后续优化**：参考 `原始资源资料/OPI热点/` 下 4 份 Word 文档的日期、考点及话题内容，人工调整映射数据以提高真实考情贴合度。

### 1.3 组装逻辑与学习组件复用

用户在详情页点击"开始学习"时：
1. 从 `opi-hotspots.json` 提取当日包含的所有 `cardIds`。
2. 调用现有的 `loadQuestionBank('opi')` 加载完整 OPI 数据集。
3. 从 OPI 数据集中提取匹配的 `QuestionBankCard[]`，动态组装为合成对象：
   - 合成 `QuestionBankTopic`：将该资讯的所有抽取卡片合并为一个虚拟 topic。
   - 合成 `QuestionBankCategory`：包裹该虚拟 topic。
   - 合成 `QuestionBankDataset`：**继承真实 OPI dataset 的 study config 和 capabilities**（确保录音模式、双语标签、表达分析等行为正确），仅替换 `categories`。
4. 直接渲染 `QuestionBankStudyScreen`，透传合成的 dataset / category / topic。

```typescript
const syntheticDataset: QuestionBankDataset = {
  ...opiDataset,                    // 继承 study config, capabilities, audioMode 等
  id: 'opi',                        // 保持 bankId 为 'opi' 以复用音频解析逻辑
  categories: [syntheticCategory],
};
```

### 1.4 路由与 UI 结构

- **列表页**：升级 `ContentLibraryScreen.tsx` 中的 `HotspotScreen`，从 JSON 加载真实数据。
- **详情页**：全屏导航页面（push 新页面），展示话题列表与题目预览，底部"开始学习"主按钮。
- **学习页**：在详情页内或通过路由拉起 `QuestionBankStudyScreen` 全屏学习。

### 1.5 学习记录来源区分

在 `LearningRecord` 的 `categoryTitle` 中嵌入 `[热点]` 前缀（如 `[热点] 7月9日 考试资讯`），使热点学习记录与常规 OPI 学习记录可分辨。无需修改 `LearningRecord` 类型定义。

---

## 2. 可选方案与不采用原因

| 方案 | 描述 | 不采用原因 |
| --- | --- | --- |
| 独立维护热点题目文本 | 在热点 JSON 中直接拷贝题目文本、参考答案及音频路径 | 违反硬约束；产生平行数据源 |
| 新建独立练习页 | 编写全新的音频与录音学习页面 | 违反 UI 一致性约束；无法继承划线高亮等组件成果 |
| 扩展 LearningRecord 类型添加 source 字段 | 在类型中新增 `source: 'hotspot' \| 'normal'` | 改动影响面较大，categoryTitle 前缀方案更轻量 |

---

## 3. 关键技术与数据处理

1. **图片卡片过滤**：抽题脚本和运行时组装逻辑均主动排除 `opi-category-08`（图片题）分类及 `kind: 'image'` 卡片。校验脚本拒绝 `opi-image-*` 前缀的 cardId 出现在热点索引中。
2. **题目引用校验**：`scripts/validate-opi-hotspots.ts` 在 `pnpm check` 中检查 `opi-hotspots.json` 所有 `cardIds` 是否存在于 OPI 题库，杜绝悬空引用。
3. **学习状态持久化**：复用 `sqliteLearningStore`，学习进度与常规 OPI 学习共享底层存储。

---

## 4. 关键取舍、风险与可迁移性

- **取舍**：使用本地打包 JSON 索引，换取 100% 离线可用。
- **风险**：OPI 题库重构卡片 ID 时需同步更新 `opi-hotspots.json`，通过自动化校验脚本保障。
- **可迁移性**：索引架构天然兼容未来从 API 动态获取每日热点配置。
