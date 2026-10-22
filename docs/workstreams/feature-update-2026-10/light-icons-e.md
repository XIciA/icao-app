# 全局图标 E「轻线浅面」

2026-10-22，用户在三轮图标对比后明确选择 E。本文件仅记录本次已选择的设计与实施范围。

## 已选视觉与实现

- [获选方案：全局图标与四页面示意](samples/light-icons-e-approved-20261022.png)。这是设计示意，不是 App 运行截图。
- [实际组件的 SVG 渲染检查](samples/light-icons-e-components-20261022.png)。由 `light-icons.tsx` 输出，包含 20 / 24px 小尺寸；不代表模拟器或真机验收。
- `src/components/ui/light-icons.tsx` 提供 22 枚功能与导航图标：26 单位画布、1.5 单位圆润线条、12% 局部填充。继承调用方颜色、尺寸和 SVG 属性。
- Native 通过 `icons.native.ts` 使用 E 图标；通用播放、返回、搜索、收藏等操作继续使用 Lucide。`lucide-icons.ts` 保留原导出表的逐字节内容，Vercel 仍由 `icons.ts` 导出原通用图标。
- 正式 EdgeOne 通过 `tools/edgeone-shared-modules.cjs` 把 `icons.ts` 映射到 `icons.native.ts`；发现、我的、题库首页、题库目录原有映射继续沿用。
- 入口圆底使用新增令牌 `colors.primary045`；会员、标注、单词收藏、使用指南、反馈分别使用独立的语义图形。
- 题库首页、发现、我的、浮动导航、题库目录以及会员权益图标同步。已同步导航 PR #229，保留其账号返回兜底与导航防重入。会员权益中的单词、随身听、模拟练习、热点、资源图标与发现页对应。
- 航司继续使用原 `AirlineMark.tsx` 路径，目录显示尺寸由 26px 调整到 20px，40px 圆底减淡；未重画、空心化或更改航司主体。

## Vercel 边界审阅

未修改 Vercel 页面、数据、导出或发布链路。原 Lucide 导出表复制到共享基础模块并保持逐字节一致；账号行沿用最新主干的 Native 文件并加入正式 EdgeOne 映射，Vercel 原账号行文件不变；浮动导航保留旧站原线宽。仅 Native / 正式 EdgeOne 采用新样式。

冻结检查对共享入口重导出、新依赖模块、令牌增量、导航平台条件样式、Native 目录与 EdgeOne 映射逐文件增加精确摘要，不重置冻结清单、不添加通配豁免。

## 检查与交付

- TypeScript 检查通过。
- 题库、发现、我的、会员入口、目录访问与导航回归：6 套件、22 用例通过。
- 新增平台导出隔离与 22 枚图标在两种尺寸的渲染检查：2 用例通过。
- 会员页面与会员路由既有测试：16 用例通过。
- 变更文件 ESLint 与 `git diff --check` 通过。
- Vercel 冻结检查通过；EdgeOne 模块映射与冻结门禁测试另随 PR 记录结果。

版本号、统一构建、iOS TestFlight / Android 测试包 / EdgeOne 上线以及模拟器真实验收由统筹批次完成，本任务不独立执行，不把设计图或组件 SVG 检查写成 App 已验收。

跨任务合并关注 `tools/edgeone-shared-modules.cjs`、`tools/check-web-freeze.mjs` 的逐文件摘要、`docs/rules/ui-style-guide.md` 与 `src/theme/tokens.ts`。其余任务新增导航或引导内容应保留，避免把较旧版本文件整体覆盖回主干。
