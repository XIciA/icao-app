# App 原生双端与 Web 手机形态在线版技术盘点

状态：已完成只读盘点，随技术方案草稿等待确认

盘点日期：2026-07-18

## 1. 盘点范围与方法

只读检查了：

- `package.json`、`app.json`、`metro.config.js`、`tsconfig.json`；
- `src/app`、`src/features`、`src/components`、`src/platform`、`src/theme`；
- `services/api`、`packages/contracts`、现有部署与音频规则；
- 当前锁定依赖的包元数据；
- Expo SDK 55 Web、Audio、SecureStore、SQLite、FileSystem 官方文档；
- 临时目录中的真实 Web 生产导出。

未修改业务代码、依赖或运行环境；Web 导出产物写入 `/tmp`，未写入仓库。

## 2. 当前工程现状

### 2.1 工程与依赖

| 项目 | 当前状态 | 对 Web 的意义 |
| --- | --- | --- |
| Expo | `~55.0.27` | SDK 已提供 Router/Web 工具链 |
| React Native | `0.83.6` | 与 SDK 55 匹配 |
| React Native Web | `~0.21.0` | 已安装，无需新建 React DOM 页面层 |
| Expo Router | `~55.0.16` | 当前 25 个 TSX 路由可作为三端共同入口 |
| Web 配置 | `web.output: static` | 已启用静态输出，但不适合当前动态登录型路由的最终方案 |
| Metro | 已加入 `wasm` asset | 已具备 Expo SQLite Web 的部分前置配置 |
| 平台文件 | 0 个 `.web.*` / `.native.*` | 目前所有依赖都从共享文件直接加载，Web 差异尚未隔离 |

当前约有 108 个 feature TS/TSX 文件、27 个共享 component TS/TSX 文件。页面与业务已经集中在 RN 工程，不存在需要从历史 Web 重新迁移的第二套正式实现。

### 2.2 当前职责结构

```text
src/app                    路由与三大 Tab
src/features               认证、题库、词汇、内容、电台、同步、AI
src/components             通用 UI、导航、状态、认证组件
src/platform               API client、唯一音频 session orchestrator
src/theme                  共享设计令牌
services/api               题库、资源、同步、账号、AI API
packages/contracts         客户端与服务端共享契约
```

该结构适合继续扩展 Web；不需要建立新的 `web-app`。

## 3. 已有共享来源与必须复用的实现

| 能力 | 当前共享来源 | 盘点结论 |
| --- | --- | --- |
| 页面与导航 | `src/app` + Expo Router | 直接作为三端路由基线 |
| UI 与主题 | `src/components`、`src/theme` | 大部分可复用，需 Web 渲染验收 |
| 题库 | `loadQuestionBank` + API + cache + embedded fallback | 已有单一仓库与服务端版本，不得复制 Web 题库 |
| 词汇 | `loadVocabulary` + API/cache | 可直接成为三端内容入口 |
| 音频资源 | 共享题库路径 + resource resolver | Web 继续复用同一解析与签名 URL |
| 电台目录 | 从共享题库派生 | 目录、队列和字幕规则可共用 |
| 用户同步 | `learning-sync` + `/v1/sync` | 已具备同账号跨设备基础，应扩展到 Web |
| 认证 | `AuthService` + Supabase Auth | 接口共用，底层 session storage 需适配 |
| API 契约 | `@icao/contracts` | 三端共用，无需 Web 专属 DTO |
| 音频协调 | `AudioSessionOrchestrator` | 必须保持唯一 owner，不得新增 Web coordinator |
| 录音生命周期 | controller + state machine + repository | 业务状态共用，只替换浏览器底层资产实现 |

结论：题库、音频映射、时长、字幕、用户进度和资源解析均已有共享来源；Web workstream 不需要也不允许创建第二份正式数据。

## 4. 真实 Web 构建证据

执行：

```text
pnpm exec expo export --platform web --output-dir <临时目录>
```

结果：失败。Metro 已进入 Web 与静态渲染编译，处理超过 3000 个模块后，在 `react-native-track-player` Web 实现处停止：

```text
Unable to resolve module shaka-player/dist/shaka-player.ui
```

证据说明：

- 当前工程不是“没有 Web 工具链”，而是已经能进入真实 Web 编译。
- `react-native-track-player@4.1.2` 声明 `shaka-player` peer，但项目没有安装。
- 直接补 peer 只能解除第一个打包阻塞，不能证明现有电台、FileSystem、SecureStore 和浏览器生命周期已经可用。
- 修复该阻塞后必须重复导出和运行时验证，继续发现后续缺口。

## 5. 兼容性盘点

| 模块/依赖 | 当前用法 | Web 状态 | 处理方向 |
| --- | --- | --- | --- |
| React Native 基础 UI | 页面、卡片、文本、列表、表单 | React Native Web 支持 | 共用并做视觉/键盘/滚动验收 |
| Expo Router | 动态路由、Protected、callback | 支持 Web | 改为 SPA 输出并验证深链刷新 |
| Gesture Handler / Reanimated | 学习手势、时间轴、卡片 | 有 Web 实现 | 共用，逐交互验证鼠标与触控 |
| Expo Image / SVG / Font | 图片、光晕、字体 | 有 Web 支持 | 共用，检查字体加载和图片跨域 |
| Expo Network | 在线状态监听 | 官方支持 Web，网络类型信息较少 | 共用现有 connectivity 抽象 |
| Expo Speech | 单词朗读 | 官方支持 Web | 共用，检查浏览器 voice 差异 |
| Expo Audio | 题卡播放、录音、回放、audio mode | 官方支持 Web | 共用 API，补 Web MIME/权限/生命周期验证 |
| Track Player | 随身听、队列、系统媒体控制 | 当前构建因缺 peer 失败 | 保留 Native；Web 使用同契约的前台引擎 |
| Expo FileSystem | raw 录音、commit、清理 | SDK 55 文档仅列 Native | Web 用 Blob/object URL repository 实现 |
| Expo SecureStore | Supabase session | SDK 55 仅支持 Android/iOS/tvOS | Web 增加浏览器 storage adapter |
| Expo SQLite kv-store | 题库缓存、同步队列、记录、标注、电台快照 | Web 支持为 alpha，需 WASM 与 COOP/COEP | 共享 storage 接口，Web 首版用 IndexedDB adapter |

## 6. 代码级缺口

### 6.1 根布局

`src/app/_layout.tsx` 当前直接初始化：

- `RadioPlayerProvider` 与 Track Player；
- `recordingRepository.cleanupExpired()` 与 FileSystem；
- 原生 StatusBar/SafeArea/手势根。

因此即使用户只打开登录页，Web bundle 也会加载电台和录音文件依赖。需要先建立平台边界，再增加固定手机画布。

### 6.2 本地存储

生产代码中多处直接 import `expo-sqlite/kv-store`，覆盖：

- 题库 cache、学习状态、学习记录和标注；
- 词汇数据与进度；
- 电台快照；
- AI 本地状态和同步 outbox。

缺少项目级统一 storage 入口。若直接在每个模块写 Web 条件，会形成多个浏览器存储 owner；应先抽取共享接口再迁移调用点。

### 6.3 音频与录音

- `StudyAudioPlayer` 和录音回放使用 Expo Audio，具备直接复用基础。
- recorder 当前只区分 `ios` 与“其它”，Web 会错误落入 M4A 假设；需显式 Web MIME/format。
- `RecordingRepository` 和 E2E raw 文件直接依赖 Expo FileSystem，浏览器不能直接运行。
- 电台 Provider 和 runtime 直接依赖 Track Player 原生/现有 Web 实现，尚无稳定平台 engine 接口。

### 6.4 认证与 API

- `AuthService` 接口和 Supabase client 可复用。
- `secure-session-storage.ts` 直接使用 SecureStore，Web 无实现。
- callback 使用 `Linking.createURL`，需要验证正式 Web origin 与 Supabase redirect allowlist。
- `services/api/create-app.ts` 当前没有启用 CORS；Web 与 API 不同来源时浏览器请求会被阻止。

### 6.5 发布与运行

- 现有脚本只有 iOS/Android 与 API 发布，没有 Web build、preview、browser test 或 rollback。
- 当前 ECS 规则没有 Web 静态站点、域名、TLS、CORS、缓存头和深链回退说明。
- 正式麦克风访问要求 HTTPS；当前战略中的正式域名/HTTPS仍未完成。

## 7. 风险分级

### P0：进入页面前即阻塞

- Track Player 缺失 peer 导致 Web 生产导出失败。
- SecureStore/FileSystem 从根依赖链进入 Web，缺少平台实现。
- API 缺少 Web 来源策略。

### P1：核心体验风险

- Safari/Chrome 录音格式、时长 metadata 和权限差异。
- 固定 375 × 812 画布在 360 宽、软键盘和浏览器地址栏变化时的缩放/滚动。
- 登录 callback、刷新深层动态路由和会话恢复。
- IndexedDB 写入、同步 outbox 和多标签页并发。
- 电台间隔、倍速、进度和切题的 Web 等价行为。

### P2：上线与运营风险

- 域名、备案、受信任证书和 Supabase redirect 配置。
- Web 静态产物回滚、缓存失效和版本显示。
- 大题库内嵌 fallback 对首包体积和浏览器内存的影响。
- 浏览器 session 的 XSS 风险和 CSP 配置。

## 8. 验证基线与缺口

当前已有：

- `pnpm check` 全量门禁；
- 43 个 App Jest suites / 201 tests；
- API Vitest 与 contracts 检查；
- iOS/Android Development Build、音频指纹和现有截图证据；
- 题库、词汇、资源和同步 API。

当前缺少：

- 成功的 Web 生产导出；
- Web 平台 adapter 单元测试；
- 浏览器路由、认证、题库、同步和音频 E2E；
- 手机/电脑浏览器固定画布截图矩阵；
- iOS、Android、Web 同账号数据交叉同步证据；
- Web 静态部署与回滚规则。

## 9. 盘点结论

目标可在当前仓库内实现，且大部分页面、题库、业务逻辑、接口和用户同步可以直接复用。工作量主要集中在少数根依赖和浏览器运行边界，而不是重新开发全部页面。

推荐先完成可导出的 Universal 基线和平台接口，再逐项接通存储、认证、内容、音频和完整页面验收；不得通过复制页面或数据绕开平台问题。
