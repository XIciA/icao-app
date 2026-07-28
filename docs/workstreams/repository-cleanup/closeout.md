# 仓库冗余清理记录

日期：2026-07-28

## 清理范围

- 退役 `content/question-banks/resources/files/audio/radiotelephony/web-v5`，共 677 个文件、54,962,010 bytes。
- 删除无产品入口的 `detail/[slug]`、`state/[slug]` 演示路由及其专用组件。
- 删除未引用的 Expo 模板图片、旧 Tab 图标和 `assets/content` 图片。
- 删除未直接使用的六项根依赖声明；由上游依赖仍需使用的包允许作为间接依赖保留。

## 音频归档证据

删除前的逐文件路径、大小与 SHA-256 位于
`radiotelephony-web-v5-manifest.json`。其聚合 SHA-256 为：

`89bfe81865c0cce95525ce413885d653aa03af6a95f55805dfde7ed4916f3c86`

历史迁移报告和校准工具中的 `web-v5` 路径保留为历史证据，不属于当前运行时引用。

## 边界

- 不重写 Git 历史，因此已有克隆的 `.git` 大小不会因本次清理立即下降。
- 不修改题库业务结构、音频生命周期、邀请码、安全逻辑、API、数据库或 ECS。
- 当前运行时题库和音频资源继续以 `web-v6` 及共享资源清单为唯一来源。
