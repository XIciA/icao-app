# OPI 热点技术盘点

状态：已复核

## 复用的共享实现

- 题库源：`content/question-banks/banks/opi/`
- 客户端题库仓库：`src/features/question-bank/data/repository.ts`
- 学习页：`QuestionBankStudyScreen`
- 学习状态与记录：现有 learning store 与 `[热点]` 分类标题
- 导航：Expo Router 文件路由

本功能没有创建第二套问题、答案、音频或学习生命周期实现。

## 替换前问题

- `ContentLibraryScreen.tsx` 内含两条硬编码资讯和 BottomSheet 旧详情。
- 新草稿虽已显示八条资讯，但详情只显示题数。
- 草稿把学习页直接嵌入同一路由，退出后会返回普通 OPI 目录。
- 缺少接入 `pnpm check` 的热点引用校验。
- 工作区混有与 OPI 无关的账户、文章和素材改动，不能整体发布。

## 发布边界

当前热点数据随 Web bundle 发布；不修改 `services/api`、数据库或 ECS 运行环境。本次线上动作仅为 Vercel SPA 发布。
