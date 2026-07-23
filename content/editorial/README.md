# Editorial 内容源

这里是资源文章与 OPI 热点的唯一维护源。原始文档不在此修改；每篇文章通过 `provenance.json` 记录原文件与 checksum。

最小工作流：

```text
extract → editing → fact_checked → approved → build
→ preview → preview_approved → publish → verify-live
```

正文只允许标题、二/三级标题、段落、无序/有序列表和 NOTE/WARNING callout。禁止 HTML、Markdown 图片和内嵌脚本。`dist/editorial-release/` 是确定性构建产物，不手工修改。

常用命令：

```bash
pnpm editorial:extract -- --source "原始资源资料/资源分享/文件.docx"
pnpm editorial:check
pnpm editorial:build
pnpm editorial:preview
pnpm editorial:publish -- --confirm-preview-approved
pnpm editorial:verify-live -- --base-url https://api.example.com --slug article-slug
```

`publish` 仅在审核状态为 `preview_approved` 且显式传入确认参数时运行。生产发布前仍须按运维规则完成数据库备份、Migration 审核和 API 回滚准备。
