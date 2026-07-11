# 正式题库数据迁移阶段记录

## 阶段 1：数据结构收口

完成内容：
- 将题库卡片字段收口为当前 UI 需要的 `taskTitle`、`audioText`、`audioTextZh`、`referenceText`、`referenceTextZh`、`audio`、`choices`、`correctChoiceIndex`。
- 学习页继续保持音频/任务模块、原文/理解模块、控制台模块三段结构。
- 控制台页签继续由 `consoleTabs` 配置控制。

验证结果：
- `pnpm exec tsc --noEmit` 通过。

## 阶段 2：数据抽取脚本与听力资源

完成内容：
- 新增 `scripts/build-question-bank-data.mjs`。
- 从 `../feizhuicu` 抽取 UI 需要的真实题库文本。
- 生成本项目自有精简 JSON：`lib/question-banks/data/question-bank.json`。
- 复制听力音频到 `public/question-bank/listening/`。
- 听力音频按任务标题重命名，例如 `10s航空英语-1.mp3`。

验证结果：
- 生成数据未包含 `schemaVersion`、`source`、`rawSourceId`、`media`、`catalog` 等源项目生产字段。
- 听力数据 632 条，听力音频 632 个。
- 听力音频文件名与 `taskTitle` 一致。

## 阶段 3：registry 接入

完成内容：
- 新增 `lib/question-banks/formal-data.ts`。
- 将 `lib/question-banks/registry.ts` 切换到精简真实数据。
- 首页、目录页、学习页继续共用同一 registry。

数据对账：
- 听力：4 分类 / 4 题组 / 632 题。
- 900句：3 等级 / 3 题组 / 900 句。
- 陆空通话：11 航司 / 107 场景 / 1851 卡。
- OPI：7 分类 / 121 话题 / 1269 卡。
- 故事复诵：2 方向 / 4 子库 / 296 卡。

## 阶段 4：UI 规则确认

完成内容：
- 学习页任务标题优先使用数据中的 `taskTitle`。
- 听力不显示额外的 `选择答案` 标题。
- 900句控制台为 `我的回答 / 笔记`。
- 听力控制台为 `笔记`。
- OPI、陆空通话、故事复诵控制台为 `我的回答 / 参考答案 / 笔记`。

## 阶段 5：验证收口

验证结果：
- 数据校验通过。
- `pnpm exec tsc --noEmit` 通过。
- `pnpm run build` 首次因受限网络无法下载 Google Fonts 失败；授权联网后通过。

明确未做：
- 未迁移 `feizhuicu` 完整 JSON。
- 未迁移除听力外的其它模块音频。
- 未迁移登录、进度、标注、错题、AI、后台管理等生产功能。
- 未重做当前 UI 风格和导航结构。

剩余风险：
- 真实长文本可能在部分手机尺寸下暴露拥挤问题，后续需要以移动端截图继续微调。
