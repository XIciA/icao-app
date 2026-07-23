# 体系课程宣传内容原生同步阶段日志

状态：已完成

执行日期：2026-07-23

## 来源与数据

- 核验 `https://feizhuicao.com/promo` 与 `public/promo/index.html` 字节一致。
- 来源 SHA-256：`823694bda130d2c067cbf2f65cbda2c54b7a8decb16331bc15a94ffa3b3b9246`。
- 新增强类型原生目录，集中保存来源元数据、Hero、指标、优势、四个分类、九个课程、完整课纲、包过班特殊权限与两个微信号。
- 使用一次性 Node 对账脚本比较宣传站构建 chunk 与原生目录，结果为 4 分类、9 课程及全部课程/课纲字符串一致。
- 未在页面内复制课程数组；`course-promo-catalog.ts` 是 App 课程宣传内容的唯一运行时数据源。

## 页面与交互

- `/content/courses` 改为独立 `CourseCatalogScreen`，发现页路由和其他内容入口不变。
- 复用 `TopBar`、`Screen`、`Card`、`Button`、`Tag`、`BottomSheet`、主题令牌与字体角色。
- 实现 Hero 定位按钮、指标卡、四项优势、默认“暑期小班”的横向分类、课程卡、完整详情、包过班特殊权限、咨询定位与原生可选择微信号。
- 删除旧三课程示例及“课程咨询演示”占位文案。
- 保留工作树中既有的 `ResourceEditorialScreen` 接入，不回退或重写该并行改动。

## 自动化验证

- 课程数据、课程交互、返回导航与发现入口专项测试：3 个 suite、8 个 test 全部通过。
- `pnpm typecheck`：通过。
- 课程范围 ESLint：通过。
- `pnpm check:contracts && pnpm check:api`：通过；API 共 228 个测试通过。
- `pnpm web:acceptance:export`：通过。
- Android：`:app:assembleDebug -PreactNativeArchitectures=arm64-v8a` 通过。
- iOS：使用隔离 DerivedData 的 iPhone 17 Pro Simulator Debug 构建通过。

## 视觉与交互证据

- 验收尺寸：360×812、375×812、390×812、430×812。
- 四个宽度的 `scrollWidth` 均等于 `clientWidth`，没有横向溢出。
- 浏览器控制台与页面运行时错误为零。
- 验证四个分类切换、普通课程详情、包过班长课纲滚动、咨询定位和返回导航。
- 联系方式计算样式为 `user-select: text`，并保留原生 `selectable`。
- 本目录中的 `evidence-*.png` 保存默认页、多分类、详情、包过权限和咨询区渲染证据。

## 全量检查说明

本任务按要求执行了 `pnpm check`，但仓库已有的内容发布门禁在 `release_output_missing_run_content_build` 处停止。没有运行 `content:build`，以免覆盖当前脏工作树中另一条正在进行的内容迁移及其生成产物。

随后执行 `pnpm check:app`：

- release、UI acceptance、audio boundary、TypeScript 均通过；
- ESLint 为 0 error，只有 `src/features/info/InfoScreen.tsx` 两条任务外 `Array<T>` warning；
- 61 个 Jest suite 通过，1 个任务外既有 suite 失败：`base-flows-parity-test.tsx` 仍期望“帮助与反馈”，当前用户改动后的 `InfoScreen` 展示“帮助中心”；
- 本次课程专项 suite 全部通过。

上述两项均不在课程同步范围内，本任务未改动对应文件，也没有为制造全绿结果覆盖用户的并行工作。
