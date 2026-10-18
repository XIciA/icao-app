# Editorial 内容工具

统一编辑、审核与归档标准见 [内容处理规则](../../docs/rules/content-processing.md)，工具分工见 [OPERATIONS.md](./OPERATIONS.md)。本目录保存历史文件式文章来源；后台工单发布后的当前有效文章由服务端快照提供，不能把本地 registry 当成线上全量清单。

现有文件式工具：

```bash
pnpm editorial:extract -- --source "原始文件.docx"
pnpm editorial:extract -- --source "原始文件.pptx"
pnpm editorial:check
pnpm editorial:build
pnpm editorial:preview
pnpm editorial:publish -- --confirm-preview-approved
pnpm editorial:verify-live -- --base-url <api-url> --slug <slug>
```

提取支持 DOCX 与 PPTX；仍须核对图像及图表包含的信息。原始文件不改写，来源与 checksum 可追溯；用户要求的归档移动需保留原路径记录并更新来源定位。

正文受现有结构限制，只支持标题、二／三级标题、段落、列表和 NOTE/WARNING callout；不支持任意 HTML、Markdown 图片或脚本。增加正文图片前核实合同和客户端支持。`dist/editorial-release/` 为确定性产物，不手工修改。

使用历史发布脚本前必须核对完整线上快照和版本，避免覆盖后台工单已发布内容。技术确认参数不替代实际授权，也不增加另一轮人工审批。日常新内容优先复用当前工单处理和发布机制。
