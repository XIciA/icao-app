# 历史归档：App 原生双端与 Web 手机形态在线版技术方案

状态：已确认，进入小流程

更新时间：2026-07-18

前置文档：`requirements.md`

## 1. 方案结论

采用“**一个 Expo Router 主应用 + 三端共享页面与业务 + 少量平台能力适配 + Web 固定手机画布 + 同一云端数据源**”的方案。

- 保留当前 `src/app`、`src/features`、`src/components`、`src/theme`、`packages/contracts` 和 `services/api`，不创建第二套 Web 页面工程。
- iOS、Android 继续使用 Development Build 与原生能力；Web 使用同一 Expo 工程的浏览器构建。
- Web 根部增加统一的 375 × 812 手机画布，手机和电脑浏览器使用同一布局；可用区域不足时只缩放或收纳画布，不重排页面。
- 题库、词汇、资源、账号和学习同步继续使用现有共享仓库/API；Web 不复制题库或用户数据。
- 原生与浏览器差异统一收敛到会话存储、本地缓存、录音文件、音频播放器和浏览器生命周期适配中。

## 2. 目标结构

```text
src/
├── app/                         三端共用 Expo Router 路由
├── features/                    三端共用页面、业务状态与流程
├── components/                  三端共用 UI
│   └── platform/
│       └── AppViewport.*        Native 直通 / Web 固定手机画布
├── platform/
│   ├── storage/                 统一缓存接口 + native/web 实现
│   ├── session-storage/         SecureStore / 浏览器会话实现
│   ├── audio/                   现有唯一 session orchestrator
│   └── recording-assets/        原生文件 / Web Blob 实现
├── theme/                       三端共用设计令牌
└── config/                      三端共用产品配置

services/api/                    三端共用 API、鉴权与同步
packages/contracts/              三端与 API 共用契约
scripts/                         新增 Web 构建、预览、验证与发布脚本
docs/workstreams/...             平台矩阵、证据与阶段记录
```

目录名可在实现阶段按现有命名调整，但职责边界不得改变。

## 3. Web 应用与固定画布

### 3.1 输出模式

推荐把 `web.output` 从当前 `static` 调整为 `single`，生成单页应用静态产物：

- 当前产品是登录后的应用，不依赖搜索引擎逐路由索引。
- 现有路由包含多个动态参数，单页输出更适合直接打开和浏览器刷新后的统一回退。
- API 继续由 `services/api` 提供，不在 Expo Web 中增加服务端路由。

生产构建使用 `expo export --platform web`，产物写入未跟踪的 `dist/`，由静态站点层发布。

### 3.2 固定手机画布

Web 根布局增加唯一 `AppViewport`：

- 逻辑内容尺寸固定为 375 × 812；内部继续使用现有 RN 页面与滚动容器。
- 电脑和手机浏览器都使用同一画布、同一页面树和同一导航。
- 视口大于画布时居中；视口小于画布时按可用区域整体适配，不改变组件断点和信息层级。
- 画布外背景、品牌和可选手机外壳只由 Web wrapper 渲染，不进入业务页面。
- 键盘、浏览器地址栏和 `visualViewport` 变化只影响画布定位/缩放，不产生第二套页面布局。

Native 端的 `AppViewport` 只透传 children，确保原生页面不受 Web 外壳影响。

## 4. 共享代码与平台适配

### 4.1 必须三端共用

- Expo Router 路由、认证页面和主导航。
- 题库目录、学习页、答题、标注、笔记、报告、学习记录和发现/我的页面。
- 题库、词汇、电台目录与业务状态模型。
- API client、`AuthService` 接口、同步规则、错误码和 `@icao/contracts`。
- 设计令牌、UI 原子件、文案和用户可见状态。
- `AudioSessionOrchestrator`、录音状态机、`RecordingRepository` 职责和 `RecordingAsset` 类型。

### 4.2 允许平台实现不同

| 能力 | iOS / Android | Web | 统一边界 |
| --- | --- | --- | --- |
| 会话持久化 | `expo-secure-store` | 浏览器持久化适配 | `AuthService` storage 接口 |
| 业务缓存/同步队列 | `expo-sqlite/kv-store` | IndexedDB 优先 | 项目共享 key-value 接口 |
| 题卡播放/录音 | `expo-audio` | `expo-audio` Web 能力 | 现有播放器和 recorder adapter |
| 录音资产 | `expo-file-system` 文件 | Blob / object URL | 唯一 `RecordingRepository` |
| 随身听引擎 | Track Player | Expo Audio playlist 或等价 Web 引擎 | 同一 `RadioPlayerProvider` 契约 |
| 系统音频能力 | 原生 session、锁屏、通知 | 浏览器媒体与前台生命周期 | 唯一 orchestrator 和明确例外 |

不得为了 Web 新建第二个题库仓库、同步服务、录音状态机、录音资产类型、音频 owner registry 或资源 resolver。

## 5. 数据、题库与三端同步

### 5.1 题库和词汇

- 继续复用 `loadQuestionBank`、`loadVocabulary`、资源 resolver 和服务端版本/checksum。
- 云端题库、词汇和资源元数据是三端权威来源；一次内容发布后，三端按同一版本规则获取。
- 原生内嵌数据继续作为安装包回退；Web 不建立独立内容副本，浏览器缓存只保存最近成功版本。
- Web 发布与题库发布解耦：普通题库文本、分类、音频映射更新不要求重新发布 Web 静态代码。

### 5.2 用户数据

- 继续复用现有邮箱账号、API 鉴权、`learning-sync` 和服务端 `/v1/sync`。
- 学习进度、作答、标注、笔记、记录和词汇进度使用同一用户 ID 与云端数据模型。
- 浏览器本地数据只承担缓存、未完成写入和短时失败保护；登录后的云端数据仍为权威。
- Web 在登录恢复、写入完成、重新联网和页面重新可见时触发既有同步机制；冲突规则不得单独为 Web 重写。

## 6. 认证与网络

- `AuthService` 保持共用；只拆分底层 session storage。
- Native 继续使用 SecureStore；Web 使用浏览器持久化实现，并通过 CSP、依赖控制和最小公开配置降低 XSS 风险。
- 登录、会话恢复和退出继续使用现有账号能力；正式 SMTP 暂不配置，邮箱换绑、找回密码等依赖邮件投递的入口在 Web 首版明确显示未开放或不可用，不执行假发送。
- 仍为现有 PKCE callback 保留 Web 来源路由与 Supabase 允许回调配置，供后续启用正式邮件时直接接续。
- API 增加明确来源白名单的 CORS 配置，开发地址与正式 Web 地址分开配置，不允许通配生产来源。
- 正式 Web 只通过 HTTPS 访问 API、Supabase、音频和图片；浏览器包不得包含任何服务端密钥。

## 7. 音频、录音与文件

### 7.1 不变量

Web 扩展必须完整遵守 `docs/guides/audio-lifecycle-and-change-rules.md`：

- `AudioSessionOrchestrator` 仍是唯一协调者。
- `useSpeakingRecordingController` 仍是唯一录音生命周期 owner。
- `RecordingRepository` 仍是录音提交、替换和删除的唯一 owner。
- Web 只增加同一职责的底层实现，不增加平行状态或删除路径。

### 7.2 题卡音频和录音

- 优先复用 Expo Audio 的 Web 播放、录音和权限 API。
- recorder 增加 Web 录音选项与 MIME 探测，接受浏览器实际生成的 WebM/MP4，不假定原生 WAV/M4A。
- Web 录音资产通过 Blob 保存并由 repository 管理 object URL；转写上传使用同一 asset ID 幂等规则。
- 浏览器录音必须运行在受信任 HTTPS 或 localhost；权限拒绝、格式不支持和录音元数据异常进入现有显式失败状态。

### 7.3 随身听

- 保留 `RadioPlayerProvider` 暴露的业务状态、目录、队列、字幕、倍速、间隔和快照契约。
- Native 保留 Track Player、锁屏控制和后台能力。
- Web 默认使用 Expo Audio playlist/播放器实现同一前台体验；只有验证证明其无法满足需求时，才评估补齐 Track Player 的 Shaka peer 路线。
- Web 不承诺原生锁屏通知和系统后台生命周期完全一致，但前台播放、暂停、进度、跳转、倍速、字幕和间隔必须等价。

## 8. 构建、测试与发布

新增标准命令，具体名称在实现阶段按现有 scripts 落地：

```text
pnpm web               Web 开发
pnpm web:export        生产导出
pnpm web:serve         本地预览生产产物
pnpm check:web         Web 构建 + 浏览器测试
```

验证矩阵：

- `pnpm check`：现有类型、Lint、Jest、内容、contracts、API 全量检查。
- Web 生产导出：所有路由可构建，直接刷新深层 URL 可恢复。
- 浏览器自动化：桌面 Chrome 与 375 × 812、360、390、430 视口。
- 真实浏览器：本轮专项验收使用 macOS Chrome；iPhone Safari 等其余支持目标不写成已实测通过。
- 视觉：同状态 App/Web 截图并列，固定画布、弹层、键盘、滚动和底部导航通过。
- 音频：Web 播放、录音、重录、回放、上传、转写失败回退；Native 按音频指南刷新必要证据。
- 数据同步：同账号在 iOS 与 Web 修改并恢复题库进度、标注、笔记和词汇进度；Android 共享契约继续通过自动检查，本轮不做 Android 体验验收。

Web 正式发布沿用现有可回滚原则：从明确提交/文件集构建、保留上一版静态产物、验证 URL 与核心流程后切换。API/CORS 修改仍需按 ECS API 部署规则单独发布与验证。

### 8.1 已确认的正式域名与切换边界

- 正式 Web 域名为 `feizhuicao.com`，正式版本允许公众直接访问；首版复用当前 Vercel 项目，不迁移到 ECS 静态站点。
- 该域名当前已有其他内容；正式切换目标是完全替换旧站，而不是与旧页面并存。
- 替换属于路线图第 6 阶段的生产操作。在新 Web 完成全量验收、HTTPS、认证 callback、API CORS 和回滚验证前，不提前删除或覆盖旧站。
- 切换前必须盘点现有托管位置和站点文件，生成旧站备份并验证可恢复；新静态产物也必须保留上一版本回滚包。
- 画布外使用纯色背景并展示手机外壳；画布内部仍为唯一的 375 × 812 App 内容树。

### 8.2 浏览器与会话产品边界

- 本 workstream 按用户后续决定只使用电脑 Chrome 完成浏览器专项验收；iPhone Safari、Android Chrome、电脑 Safari 和 Edge 保留兼容目标，但不进入本轮已通过结论。
- Web 会话默认长期保持，并保留明确退出入口；底层仍使用浏览器持久化 adapter 和现有 `AuthService` 契约。
- 公开发布前执行隐私与合规检查；当前暂不修改隐私政策正文，但不得据此跳过上线前检查。

## 9. 推荐方案与不采用方案

### 推荐

同一 Expo 工程、共享 UI/业务、平台 adapter、SPA 静态输出、现有 ECS/API/云端数据源。

### 不采用

- **独立 Next.js/React Web 工程**：会复制页面、状态、题库接入和验收，长期形成第二套产品。
- **WebView/PWA 替代原生 App**：违反原生双端边界，不能满足现有设备能力。
- **把所有原生依赖强行原样运行在 Web**：当前导出已经被 Track Player peer 阻塞，且 FileSystem/SecureStore 无 Web 实现。
- **直接依赖 Expo SQLite Web 作为首版唯一缓存**：SDK 55 的 Web 支持仍为 alpha，并需要 WASM 与 COOP/COEP；首版使用独立浏览器存储 adapter 更容易控制风险。
- **为 Web 复制题库或用户数据**：会破坏服务端权威来源和三端同步。

## 10. 风险与成本

- 浏览器录音格式、时长元数据和权限行为在 Chrome/Safari 间不同，需要真实设备验证。
- Web 会话无法获得 Keychain/Keystore 同等级保护，必须依靠 HTTPS、CSP、最小依赖和服务端会话治理。
- 当前 Track Player Web peer 缺失只是首个构建阻塞；修复后仍需继续发现其它运行时差异。
- API 当前未启用 CORS，跨来源 Web 调用需要服务端改动与 ECS 部署。
- 正式录音依赖域名与 HTTPS；在域名、备案和证书未就绪前，只能完成 localhost/受控环境验收。
- 固定画布在小屏与软键盘场景需要专门验证，否则可能出现整体缩放、焦点和滚动冲突。
- `feizhuicao.com` 的现有站点位置、文件范围、服务器配置和可恢复方式尚未只读盘点；未完成盘点与备份前不得执行替换。
- Chrome 版本以验收设备实际版本记录；其余浏览器只保留兼容方向，不进入本轮实测承诺。

## 11. 依据

- Expo SDK 55 Web 发布：<https://docs.expo.dev/guides/publishing-websites/>
- Expo Router Web 输出：<https://docs.expo.dev/router/web/static-rendering/>
- Expo Audio SDK 55：<https://docs.expo.dev/versions/v55.0.0/sdk/audio/>
- Expo SecureStore SDK 55：<https://docs.expo.dev/versions/v55.0.0/sdk/securestore/>
- Expo SQLite SDK 55：<https://docs.expo.dev/versions/v55.0.0/sdk/sqlite/>
- Expo FileSystem SDK 55：<https://docs.expo.dev/versions/v55.0.0/sdk/filesystem/>
