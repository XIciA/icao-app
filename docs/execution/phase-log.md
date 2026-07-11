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
- `expo export --platform all`：通过，iOS、Android 与 Web 生产 Bundle 均成功生成到临时目录。
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

## 阶段 1：设计基础与导航壳

状态：本地带条件通过，可进入阶段 2；iOS 首次引导点击留作最终人工项

### 已完成

- 将设计稿 OKLCH 色彩转换为跨平台 RN sRGB 令牌，保留暖象牙、墨蓝、钴蓝、琥珀与危险红语义。
- 接入 Geist、Noto Serif SC 与 Geist Mono，保持标题、正文和数据字体分工。
- 建立文字、按钮、卡片、标签、输入、顶部栏、Bottom Sheet、页面容器、加载与异常状态组件。
- 将 Web 单体 `AppShell` 关系转换为 Expo Router Root Stack + 题库/发现/我的三个主 Tab。
- 建立全屏子页、居中顶部标题、返回按钮、iOS 手势承载和 Android 系统返回链路。
- 接入安全区、Tab 内容底部避让、键盘避让、根级加载与 Error Boundary。
- 建立页面对照矩阵与阶段归属：`docs/execution/phase1-page-matrix.md`。
- `react-native-svg` 已经双端增量重建并正式链接，Lucide 图标在双端正常渲染。

### 方案调整记录

- Noto Serif SC npm 包含全部字重，pnpm 在 Node 24 对 80MB 压缩包做完整性散列时触发
  `invalid array length`。改为从同一 npm 发布包只提取设计实际使用的 600 字重和字体许可证，
  资产写入 RN 工程；避免引入八个未使用字重，不改变字体设计决策。
- `expo-blur` 初次热更新需要重建原生壳。由于模糊只承担装饰效果，改用跨平台半透明表面；
  卡片、导航和弹层的颜色、边框、圆角、轻阴影与层次关系保持不变，减少无必要原生依赖。

### 验证结果

- `pnpm check`：通过（TypeScript、ESLint、Jest）。
- iOS Debug Development Build 增量重建：通过，0 error，3 个上游非阻塞 warning。
- Android Debug Development Build 增量重建：通过，453 个任务，19 秒。
- Android 题库/发现 Tab 切换、全屏子页、顶部返回与系统返回键：通过；返回后保持原 Tab。
- 360、375、390、430 宽度截图：无横向溢出、卡片裁切或底部导航遮挡。
- iOS 安全区和底层页面渲染正常；Development Build 首次引导遮罩需要点击后才能完成无干扰交互截图。
- 审查结论：带条件通过。剩余项只影响 iOS 截图洁净度，不影响代码、构建或阶段 2 本地开发。

### 明确未做

- 未提前实现完整业务页面或复制 Web DOM/CSS 实现。
- 未改变品牌色、字体分工、导航模式、卡片气质或 Lucide 图标体系。
- 未接真实登录、Supabase、AI、支付、云同步或离线资源系统。
- 未修改只读设计稿仓库。
