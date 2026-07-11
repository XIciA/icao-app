# 第一阶段执行记录

## 阶段 0：独立工程与双端环境

状态：本地验收通过，GitHub 远程待补

### 已完成

- 确认写入目标为 `/Users/zhouyide/Desktop/icao-app`，设计稿仓库只读。
- 在目标目录直接创建独立 Expo + React Native + TypeScript 工程，无嵌套目录。
- 安装 `expo-dev-client`，Development Build 作为正式开发能力边界。
- 建立 TypeScript、ESLint、Jest 和 React Native Testing Library 验证基础。
- 建立项目内 Android JDK / SDK 环境脚本，避免依赖未配置的全局 shell 变量。
- 安装并锁定 OpenJDK 17。React Native Gradle 插件要求 Java 17 toolchain；避免 JDK 21
  触发与 Gradle 9 不兼容的旧版 Foojay 自动下载解析器。
- 创建 `ICAO_API_36` ARM64 AVD，并完成 Android API 36 启动验证。
- iOS Development Build 编译成功，安装并启动于 iPhone 17 Pro / iOS 26.3 模拟器。
- Android Development Build 编译成功，APK 安装并启动于 API 36 模拟器。
- 保存双端启动证据到 `docs/execution/evidence/`。

### 方案调整记录

- 工程由 Expo SDK 57 调整为 SDK 55。原因：SDK 57 官方要求 Xcode 26.4+，本机为
  Xcode 26.3；SDK 55 支持当前 Xcode，继续使用稳定 Expo + Development Build +
  CNG 路线。收益是阶段 0 可以完成 iOS 与 Android 本地构建验收；不改变产品或宏观架构。

### 验证结果

- `pnpm check`：通过（TypeScript、ESLint、Jest）。
- `pnpm doctor`：19/19 通过。
- iOS Debug Development Build：通过，0 error，3 个上游非阻塞 warning。
- Android Debug Development Build：通过，433 个任务完成；上游依赖存在非阻塞 deprecated warning。
- CNG 生成的 `ios/`、`android/` 已由 Git 忽略。
- 审查结论：带条件通过；远程仓库不影响本地工程与下一阶段，可进入阶段 1。

### 待人工补齐

- 当前 Chrome 未安装/启用 ChatGPT Chrome Extension，Codex 无法控制已登录的 GitHub
  会话。恢复插件后创建 Private 仓库 `icao-app`、配置远程并推送本地阶段检查点。
- `com.anonymous.icao-app` 与 `com.anonymous.icaoapp` 仅为本地 Development Build 临时标识，
  不视为生产 Bundle ID / Package Name 决策；正式标识仍按架构决策留待用户确认。

### 明确未做

- 未开始页面批量复刻。
- 未接 Supabase、真实后端、AI、支付或云同步。
- 未修改只读设计稿仓库。
