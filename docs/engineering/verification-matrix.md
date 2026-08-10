# 变更验证矩阵

目标是让验证与风险匹配。先运行最小的直接检查；共享边界、高风险或发布变更再扩大范围。

| 变更类型 | 最低验证 | 何时扩大 |
| --- | --- | --- |
| 仅 Markdown 文档 | 链接检查、`git diff --check`、人工核对权威与引用 | 文档包含可执行命令时，校验对应脚本存在 |
| TypeScript 纯逻辑 | `pnpm typecheck` + 相关测试 | 共享模块或回归风险较高时运行 `pnpm check:app` |
| React Native UI | typecheck、相关测试、目标平台渲染检查 | 共享组件、导航或跨端布局时检查 iOS、Android、Web 相关端 |
| Web UI / 运行时 | `pnpm check:web` + 浏览器目标路径检查 | 路由、Functions、cookie 或部署边界变化时做预览/线上验收 |
| 内容与题库 | 对应 `*:check` 或 manifest 校验 | 发布内容、全库迁移时运行 full 或发布验证 |
| API / contracts | 对应 workspace check + 代表性请求 | 获得线上部署授权后再做 ECS 健康检查与线上请求 |
| Expo API / 原生配置 | 官方 SDK 文档核对、typecheck、目标平台 Development Build | 权限、插件、依赖或原生配置变化时必须重建 |
| 音频生命周期 | `pnpm check:audio` + 规则中对应测试 | 会话、权限、录音、播放或发布敏感变更按音频规则扩大 |
| 发布脚本 / 签名配置 | `pnpm check:release` + 目标发布 dry-run 或人工核对 | 真正发布必须按发布手册保存证据与回滚点 |

## 选择原则

- 文档或局部实现变化不自动触发全仓 `pnpm check`、双端原生构建或线上部署。
- 改动触及共享生命周期、生成资产、跨平台行为或发布产物时，不以“代码量小”为由缩减验证。
- UI 验收看实际渲染、状态和交互，不以编译成功替代。
- 无法运行某项必要检查时，在交付中写明未验证范围、原因和风险。
