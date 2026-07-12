# 题库内容维护

本目录是题库维护层。五套题库共用 schema 和构建工具，但按题库、分类、话题拆分，避免长期手改单个大 JSON。

- `registry.json`：发布版本、题库顺序和资源模块兼容映射。
- `banks/<bankId>/bank.json`：题库元数据、能力和分类顺序。
- `banks/<bankId>/categories/*.json`：分类元数据和话题顺序。
- `banks/<bankId>/topics/*.json`：话题及卡片内容。
- `resources/manifest.source.json`：不含本机绝对路径的资源源清单。
- `schema/`：维护源 contract。

工作规则：

1. 已发布的 bank/category/topic/card ID 不得重编号或复用。
2. 只修改维护源，不手工修改 `dist/question-bank-release`。
3. 修改后执行 `pnpm content:build && pnpm content:check:full`。
4. App 和 API 只消费统一发布 contract，不按题库复制业务实现。
