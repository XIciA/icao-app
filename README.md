# 听你五个 / Read You 5

听你五个是使用 React Native、Expo SDK 55 和 TypeScript 构建的 ICAO 英语学习产品，
覆盖 iOS、Android 与 Expo Web。

## 当前平台边界

- Native 使用正式账号、ECS API、Supabase、题库/音频、学习记录、录音、AI 与反馈链路。
- Web 使用 Vercel 同源 Functions、静态内容/题库资源与浏览器本地数据，不调用 ECS/Supabase。
- 品牌与核心学习语义跨平台一致，身份、存储、音频和部署生命周期按平台隔离。

最新事实见 [`docs/current/product-state.md`](docs/current/product-state.md) 与
[`docs/current/runtime-topology.md`](docs/current/runtime-topology.md)。

## 常用入口

```bash
pnpm install
pnpm start
pnpm ios
pnpm android
pnpm web
pnpm typecheck
```

完整命令与验证选择见：

- [`docs/guides/development-command-reference.md`](docs/guides/development-command-reference.md)
- [`docs/engineering/verification-matrix.md`](docs/engineering/verification-matrix.md)

原生插件、权限、依赖或配置变化需要重新构建 Development Build；普通 JavaScript/TypeScript
变更通常通过 Metro 加载。生产 API、Web 和数据库操作需遵守各自授权与部署规则。

## 文档

所有当前规范、workstream、开发者笔记和历史档案从 [`docs/README.md`](docs/README.md) 进入。
只读设计仓库和 `docs/ui-screenshots/` 保留视觉历史；当前实现路径和设计令牌以本仓库为准。
