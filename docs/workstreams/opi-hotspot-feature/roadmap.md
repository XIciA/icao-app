# 技术路线图：OPI 热点功能 (OPI Hotspot Feature)

## 阶段总览

| 阶段 | 目标 | 核心产出 | 进入下一阶段标准 |
| --- | --- | --- | --- |
| 阶段 1 | 热点数据层：类型、抽题脚本、索引文件与校验 | `types.ts` / `opi-hotspots.json` / `repository.ts` / 校验脚本 | `pnpm check` 通过，所有 cardId 在 OPI 数据集中存在且无图片题 |
| 阶段 2 | 热点 UI 与学习模式全链路集成 | 列表页 / 全屏详情页 / 练习包组装 / `QuestionBankStudyScreen` 联动 | 列表→详情→开始学习→卡片练习全链路可走通，音频/录音/答题正常 |
| 阶段 3 | 综合验证与收口 | 单元测试 / 版本更新 / closeout 记录 | `pnpm check` 0 errors，版本号已更新 |

---

## 阶段 1：热点数据层

### 阶段目标
建立热点资讯的类型定义、随机抽题脚本、JSON 索引数据文件及引用校验机制。

### 主要工作
1. 建立 `src/features/content/hotspot/types.ts`，定义 `OpiHotspotBrief`、`OpiHotspotTopic` 数据结构。
2. 编写 `scripts/generate-opi-hotspots.ts` 随机抽题脚本：
   - 从 OPI 题库中排除 `opi-category-08`（图片题）分类。
   - 为每条资讯随机抽取约 5 个话题，每个话题抽取约 6 张卡片（数量可配置）。
   - 参考 Word 资料中的日期与考点地点标签。
   - 输出 `content/question-banks/opi-hotspots.json`。
3. 编写 `src/features/content/hotspot/repository.ts`，提供 `loadHotspotBriefs()` 解析接口。
4. 在校验逻辑中确保所有 `cardIds` 存在于 OPI 数据集且不含图片题卡片。

### 阶段产出
- `src/features/content/hotspot/types.ts`
- `scripts/generate-opi-hotspots.ts`
- `content/question-banks/opi-hotspots.json`
- `src/features/content/hotspot/repository.ts`

### 允许修改范围
- `content/question-banks/`
- `src/features/content/`
- `scripts/`

### 禁止范围
- 修改 OPI 原始题库文本及音频。

### 验收标准
1. `loadHotspotBriefs()` 按日期倒序正确解析所有热点资讯。
2. 所有 `cardIds` 均可在 OPI 数据集中找到，且不含 `opi-image-*` 前缀。
3. `pnpm check` 通过。

### 验证命令
- `pnpm check`

---

## 阶段 2：热点 UI 与学习模式全链路集成

### 阶段目标
实现热点列表页、全屏详情页与卡片学习模式的完整链路，形成可验证闭环。

### 主要工作
1. 重构 `HotspotScreen`：从 `opi-hotspots.json` 加载真实数据，展示日期徽章、考点地点标签、话题数量、"查看详情"入口。
2. 实现全屏详情导航页 `HotspotDetailScreen`：
   - 展示当日所有话题及各话题下的题目预览（题目文本摘要）。
   - 底部"开始学习"主按钮。
3. 编写 `build-hotspot-session.ts`：
   - 将 `OpiHotspotBrief` 与 OPI dataset 合成为标准 `QuestionBankDataset / QuestionBankCategory / QuestionBankTopic`。
   - 合成 dataset 继承真实 OPI 的 study config 和 capabilities。
   - 学习记录 `categoryTitle` 嵌入 `[热点]` 前缀以区分来源。
4. 集成 `QuestionBankStudyScreen` 全屏学习流程。

### 阶段产出
- `src/features/content/hotspot/HotspotListScreen.tsx`
- `src/features/content/hotspot/HotspotDetailScreen.tsx`
- `src/features/content/hotspot/build-hotspot-session.ts`
- 更新 `src/features/content/ContentLibraryScreen.tsx`

### 允许修改范围
- `src/features/content/`
- `src/features/question-bank/`（如需暴露通用类型或辅助方法）

### 禁止范围
- 新增独立或平行的卡片学习渲染组件。
- 改变全局 Design Tokens 或发现页整体布局。

### 验收标准
1. 列表页展示正常，考点标签与话题数量准确。
2. 点击"查看详情"push 全屏详情页，话题与题目文本与 OPI 主题库一致。
3. 点击"开始学习"无缝切入卡片练习，翻页、录音、音频、答案展开均正常。
4. 学习记录 `categoryTitle` 包含 `[热点]` 前缀。
5. `pnpm check` 通过。

### 验证命令
- `pnpm check`

---

## 阶段 3：综合验证与收口

### 阶段目标
通过单元测试与代码检查验证全功能，更新版本号并完成交付记录。

### 主要工作
1. 编写单元测试：热点包组装逻辑、图片题过滤、cardId 校验。
2. 运行 `pnpm check` 全项目 TypeScript 检查。
3. 更新 `src/config/app-version.ts` 为最终修改时间（Asia/Shanghai，`vYYYY.MM.DD.HHmm`）。
4. 撰写 `docs/workstreams/opi-hotspot-feature/closeout.md`。

### 阶段产出
- `src/features/content/hotspot/__tests__/hotspot-session-test.ts`
- `src/config/app-version.ts`
- `docs/workstreams/opi-hotspot-feature/closeout.md`

### 验收标准
1. `pnpm check` 0 errors。
2. 版本号格式为 `vYYYY.MM.DD.HHmm`。

### 验证命令
- `pnpm check`
