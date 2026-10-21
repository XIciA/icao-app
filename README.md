# 听你五个 / Read You 5

听你五个是使用 React Native、Expo SDK 55 和 TypeScript 构建的 ICAO 英语学习产品，
覆盖 iOS、Android 与 Expo Web。

## 当前平台边界

- Native 使用正式账号、ECS API、Supabase、题库/音频、学习记录、录音、AI 与反馈链路。
- 产品 Web `readyoufife.com` 由 EdgeOne 托管，与 Native 共用 ECS API、Supabase 身份与学习同步；浏览器录音原件保留在本机。
- `feizhuicao.com` 是香港静态宣传站；旧 Vercel 邀请码体验站已退役，仓库保留兼容实现与冻结校验。

项目管理概览、各渠道交付与待验事项见 [`docs/resources/project/product-state.md`](docs/resources/project/product-state.md) 与
[`docs/resources/project/runtime-topology.md`](docs/resources/project/runtime-topology.md)。

## 常用入口

```bash
pnpm install
pnpm start
pnpm ios
pnpm android
EXPO_PUBLIC_ICAO_WEB_RUNTIME=edgeone-production pnpm web
pnpm typecheck
```

完整命令见：

- [`docs/resources/developer/development-command-reference.md`](docs/resources/developer/development-command-reference.md)

原生插件、权限、依赖或配置变化需要重新构建 Development Build；普通 JavaScript/TypeScript
变更通常通过 Metro 加载。生产 API、Web 和数据库操作需遵守各自授权与部署规则。

## 文档

项目文档统一从 [`docs/README.md`](docs/README.md) 进入。该入口列出人工维护的长期约束，
并区分工作工具、参考资料、任务方案和历史记录；历史决策不会自动约束新任务。
只读设计仓库和 `docs/records/evidence/ui-screenshots/` 保留视觉历史；当前实现路径和设计令牌
以本仓库为准。
