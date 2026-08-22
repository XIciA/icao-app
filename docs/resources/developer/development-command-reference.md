# ICAO App 常用命令

所有命令默认在仓库根目录运行。以 `package.json` 的 scripts 为准，本页只列稳定入口。

## 启动

| 场景 | 命令 |
| --- | --- |
| 启动 Development Build 的 Metro | `pnpm start` |
| iOS 编译、安装与运行 | `pnpm ios` |
| iOS 连接正式云端环境 | `pnpm ios:phase2a` |
| iOS 重新编译云端 Development Build | `pnpm ios:phase2a:build` |
| Android 模拟器 | `pnpm android:emulator` |
| Android 编译、安装与运行 | `pnpm android` |
| Web 本地开发 | `pnpm web` |
| Web 免登录 UI 验收 | `pnpm web:acceptance` |

只修改页面、样式、TypeScript 或业务逻辑且 Development Build 已安装时，通常只需 Metro。
修改 Expo 插件、权限、原生依赖、`app.json` 或原生工程配置后需要重新编译目标平台。

iOS Development Build 使用 `com.readyoufife.ios.dev`，显示为“听你五个 Dev”；独立 Release
使用 `com.readyoufife.ios`，显示为“听你五个”。两者可同时安装，日常调试不会再覆盖可独立
启动的真机 Release。`pnpm ios` 和 `pnpm ios:phase2a:build` 会先用开发变体同步 CNG 工程，
`pnpm ios:standalone` 则显式使用生产变体。

## Web 导出与检查

| 场景 | 命令 |
| --- | --- |
| 普通 Web 导出 | `pnpm web:export` |
| 验收 Web 导出 | `pnpm web:acceptance:export` |
| 生成正式同源部署产物 | `pnpm web:deploy:export` |
| 本地服务导出物 | `pnpm web:serve` |
| Web 边界完整检查 | `pnpm check:web` |

免登录验收只用于本地 UI 路径，不代表认证、同步、AI 或正式运行时已经通过。

## 定向检查

| 范围 | 命令 |
| --- | --- |
| TypeScript | `pnpm typecheck` |
| lint | `pnpm lint` |
| Jest | `pnpm test` |
| App 聚合检查 | `pnpm check:app` |
| 音频边界 | `pnpm check:audio` |
| API / contracts | `pnpm check:api` / `pnpm check:contracts` |
| 完整仓库 | `pnpm check` |
| Expo 诊断 | `pnpm doctor` |

验证范围按 `docs/rules/verification-matrix.md` 选择；不要把完整仓库检查当成所有局部或
文档改动的固定成本。

## 发布入口

`pnpm release:android`、`pnpm release:ios` 和 `pnpm release:dual` 只在当前任务明确包含发布时
使用。生产 API、Web 和数据库的权限边界见 `docs/rules/conditional/deployment-and-runtime-rules.md`。

本机 Xcode 签名、设备名、个人 Team、端口清理等可变信息见 `docs/resources/developer/`；使用前
人工核对，不把个人环境写成项目级强制规则。
