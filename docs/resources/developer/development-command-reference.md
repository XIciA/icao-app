# ICAO App 常用命令

核对日期：2026-10-21。所有命令默认在仓库根目录运行，以 `package.json` 的 scripts 为准。
工具的输入输出、副作用和已知依赖见[常用工具清单](../../tools/README.md)。本页列入口，不授予发布权限。

## 启动与本地开发

| 场景 | 命令 | 作用 |
| --- | --- | --- |
| Development Build 的 Metro | `pnpm start` | 启动 JS 开发服务 |
| iOS 编译、安装与运行 | `pnpm ios` | 写本地原生构建并安装到目标设备 |
| iOS 连接正式云端环境 | `pnpm ios:phase2a` | 使用已有云端开发入口；业务操作可能访问真实服务 |
| iOS 重新编译云端 Development Build | `pnpm ios:phase2a:build` | 重建开发包 |
| Android 模拟器 | `pnpm android:emulator` | 启动本地模拟器 |
| Android 编译、安装与运行 | `pnpm android` | 构建并安装开发包 |
| EdgeOne 产品 Web 本地开发 | `EXPO_PUBLIC_ICAO_WEB_RUNTIME=edgeone-production pnpm web` | 选择正式产品 Web 模式；API 等公开环境需正确配置，登录及业务操作可能访问真实服务 |
| Web 免登录 UI 验收 | `EXPO_PUBLIC_ICAO_WEB_RUNTIME=edgeone-production pnpm web:acceptance` | 只验证本地 UI，不代表认证、同步、AI 已通过 |
| 本地运营后台 | `./scripts/start-local-ops.sh` | 必要时构建并打开本地后台；受保护连接可能读写真实业务 |

只修改页面、样式、TypeScript 或业务逻辑且 Development Build 已安装时，通常只需 Metro。
修改 Expo 插件、权限、原生依赖或原生工程配置后需要重新编译目标平台。

iOS 开发包使用 `com.readyoufife.ios.dev`，正式包使用 `com.readyoufife.ios`；可同时安装。
未设置 `EXPO_PUBLIC_ICAO_WEB_RUNTIME` 时，Web 默认进入 `vercel-legacy`，不能用裸 `pnpm web`
推断正式 EdgeOne 行为。旧模式仍受[冻结边界](../../rules/project-boundaries.md)约束。

## Web 导出与检查

| 场景 | 命令 | 输出 / 边界 |
| --- | --- | --- |
| EdgeOne 正式运行时导出 | `pnpm web:edgeone:export` | 写 `dist/`，不自动部署 |
| EdgeOne 源码与导出检查 | `pnpm check:web:edgeone` | 本地检查并导出，不自动部署 |
| 导出物本地服务 | `pnpm web:serve` | 服务已有导出物 |
| Web 源码检查 | `pnpm check:web:source` | 检查图标导入边界与宣传资源 |

EdgeOne 的公开环境变量与部署配置见[上线参考](../operations/edgeone-three-client-web-rollout.md)。
旧 `web:export`、`web:deploy:export` 和 `check:web` 保留在 scripts 中，不作为当前 EdgeOne 的默认入口。
宣传站使用 `public/promo/` 与独立 Nginx，见[宣传站说明](../../../infra/promo/README.md)。

## 定向检查与内容工具

| 范围 | 命令 |
| --- | --- |
| TypeScript / lint | `pnpm typecheck` / `pnpm lint` |
| 指定 Jest 测试 | `pnpm exec jest --runInBand <测试路径>` |
| App 聚合检查 / 音频边界 | `pnpm check:app` / `pnpm check:audio` |
| API / contracts | `pnpm check:api` / `pnpm check:contracts` |
| 题库 / 热点 / 文章校验 | `pnpm content:check` / `pnpm opi-hotspot:check` / `pnpm editorial:check` |
| 题库 / 热点 / 文章生成 | `pnpm content:build` / `pnpm opi-hotspot:build` / `pnpm editorial:build`，会写生成文件 |
| 文章本地预览 | `pnpm editorial:preview`，生成产物并启动本地服务 |
| 完整本地仓库 / 干净 CI | `pnpm check` / `pnpm check:ci`，媒体输入要求不同 |
| Expo 诊断 | `pnpm doctor`，通过 dlx 获取最新诊断工具，需要网络 |

验证范围按[交付与验收规则](../../rules/delivery-and-acceptance.md)选择；局部或文档改动不默认运行完整仓库检查。

## 构建、上传与生产操作

| 目标 | 入口 | 副作用 |
| --- | --- | --- |
| 本地原生独立包 | `pnpm ios:standalone` / `pnpm android:standalone` | 构建、签名及可能安装；具体步骤以脚本为准 |
| iOS TestFlight | `pnpm release:ios:testflight` | 构建与上传候选包 |
| Android / iOS / 双端发布 | `pnpm release:android` / `pnpm release:ios` / `pnpm release:dual` | 按脚本执行发布，不作为普通构建检查 |
| App Store 提交 | `pnpm release:ios:app-store` | 商店外部操作，与 TestFlight 分开辨认 |
| 内容发布 | `pnpm editorial:publish` 或运营后台审核发布 | 写发布产物或真实业务，先核对当前内容流程与输入 |
| 正式更新清单 | `tools/publish-app-update.py` | 存储主机写 APK 与渠道清单，见[发布记录](../../records/releases/20261021-app-updates-1.2.1.md) |
| API / 数据库 / 后台 | `./scripts/deploy-api-release.sh` / `pnpm release:database:migrate` / `pnpm release:ops` | 各自生产操作，不互相授予权限 |

发布来源、授权与验收分别遵守现有[仓库规则](../../rules/repository-and-github-management.md)、
[项目边界](../../rules/project-boundaries.md)和[交付规则](../../rules/delivery-and-acceptance.md)。
本机签名与设备信息见[开发者参考](README.md)，使用前核对，不复制为项目级规则。
