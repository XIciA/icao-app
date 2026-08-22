# 听你五个 / Read You 5

听你五个是使用 React Native、Expo SDK 55 和 TypeScript 构建的 ICAO 英语学习产品，
覆盖 iOS、Android 与 Expo Web。

## 当前平台边界

- Native 使用正式账号、ECS API、Supabase、题库/音频、学习记录、录音、AI 与反馈链路。
- Web 使用 Vercel 同源 Functions、静态内容/题库资源与浏览器本地数据，不调用 ECS/Supabase。
- 品牌与核心学习语义跨平台一致，身份、存储、音频和部署生命周期按平台隔离。

最新事实见 [`docs/resources/project/product-state.md`](docs/resources/project/product-state.md) 与
[`docs/resources/project/runtime-topology.md`](docs/resources/project/runtime-topology.md)。

## 常用入口

```bash
pnpm install
pnpm start
pnpm ios
pnpm android
pnpm web
pnpm typecheck
```

完整命令见：

- [`docs/resources/developer/development-command-reference.md`](docs/resources/developer/development-command-reference.md)

原生插件、权限、依赖或配置变化需要重新构建 Development Build；普通 JavaScript/TypeScript
变更通常通过 Metro 加载。生产 API、Web 和数据库操作需遵守各自授权与部署规则。

## 文档

人工维护规则、信息资源和过程记录统一从 [`docs/README.md`](docs/README.md) 进入。只有
`docs/rules/` 对 Codex 有持续约束力；`docs/resources/` 和 `docs/records/` 均按需读取。
只读设计仓库和 `docs/records/evidence/ui-screenshots/` 保留视觉历史；当前实现路径和设计令牌
以本仓库为准。
