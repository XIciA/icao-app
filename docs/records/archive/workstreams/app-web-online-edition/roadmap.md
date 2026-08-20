# 历史归档：App 原生双端与 Web 手机形态在线版路线图

状态：小流程已完成

更新时间：2026-07-18

前置文档：`requirements.md`、`technical-plan.md`、`technical-audit.md`

## 1. 路线总览

| 阶段 | 目标 | 核心产出 | 进入下一阶段标准 |
| --- | --- | --- | --- |
| 1. Universal 基线 | Web 可构建并显示固定手机画布 | Web scripts、SPA 输出、AppViewport、平台入口 | Web 生产导出成功，原生基线无回归 |
| 2. 存储、认证与云数据 | 打通登录、题库和用户同步 | storage/session adapters、CORS、callback、Web cache/outbox | Web 登录可用，题库和用户数据跨端恢复 |
| 3. 全页面三端化 | 全部 App 页面可在 Web 使用 | 页面/状态清单、兼容修复、画布与交互证据 | 所有页面可达且无未记录阻塞 |
| 4. 音频、录音与随身听 | 完成 Web 音频核心能力 | Web audio engine、Blob repository、平台例外 | 播放/录音/重录/回放/电台通过矩阵 |
| 5. 全量对照与三端回归 | 收口视觉、流程和数据一致性 | parity matrix、浏览器 E2E、三端同步证据 | 全部高优先级状态通过，无阻塞差异 |
| 6. 正式 Web 发布 | HTTPS 在线版可访问、可回滚 | 静态站点、域名/TLS、发布记录与回滚包 | 线上核心流程、API、认证和资源全部通过 |
| 7. 收口 | 固化后续三端更新规则 | closeout、运行规则、维护清单 | 文档、验证和剩余风险完整 |

全部 App 页面和功能始终属于最终范围；阶段拆分只控制实施顺序，不缩减需求。

## 2. 全阶段硬约束

- 不创建独立 Web 页面/业务工程，不读取或迁移历史 Web 实现代码。
- 不复制题库、词汇、音频映射、字幕、时长、用户数据、同步规则或资源解析。
- 不新增第二个音频 session owner、录音状态机、RecordingRepository、RecordingAsset 或文件删除路径。
- 不把原生 App 改成 WebView，不改变 iOS/Android 原生发布形态。
- 不做桌面版信息架构；手机和电脑浏览器始终使用同一固定手机画布。
- 不在未达到阶段验证标准时部署，不把工作区无关 OPI 改动带入本 workstream。
- `services/api` 改动必须按 ECS 部署规则构建、备份、重启、健康检查和真实接口验证。
- 音频阶段必须完整遵守音频变更指南，并刷新适用的平台证据。

## 3. 阶段 1：Universal 构建基线与固定画布

### 阶段目标

让当前 Expo 工程能够稳定导出 Web，并建立唯一 Web 外壳和平台适配入口。

### 主要工作

- 增加 `web`、`web:export`、`web:serve`、`check:web` scripts。
- 将 Web 输出调整为 SPA `single`，配置生产深链回退。
- 创建 Native 直通/Web 固定画布的 `AppViewport`。
- 把根布局中的 Track Player、recording cleanup 等原生根依赖移到合法平台实现后。
- 建立 storage、session、radio engine、recording asset 的共享接口和 native/web 文件边界。
- 建立 `platform-matrix.md`，记录每个 adapter 的 owner、原生实现、Web 实现和验证状态。

### 允许修改范围

`app.json`、`metro.config.js`、`package.json`、根布局、`src/platform`、必要的 provider 入口、Web 构建脚本与本 workstream 文档。

### 禁止范围

不重写业务页面；不复制数据；不发布 Web；不在本阶段改变账号、题库或音频产品行为。

### 验收与验证

- `pnpm check`。
- `pnpm web:export` 成功，产物不进入 Git。
- 登录、法律页、三大 Tab 和一个深层题库路由可从生产预览直接打开/刷新。
- 375 × 812、360、390、430 视口保持同一画布结构。
- iOS Development Build 完成根导航/启动冒烟；共享代码和音频敏感改动保留工程规则要求的 Android 自动检查或构建门禁，但不做 Android 体验验收。

## 4. 阶段 2：本地存储、认证、题库与用户同步

### 阶段目标

让 Web 使用现有账号、云端题库和同步服务，形成真实在线产品数据链路。

### 主要工作

- 抽取项目级 key-value storage；Native 继续委托 SQLite，Web 使用 IndexedDB。
- 迁移题库 cache、学习状态、记录、标注、词汇、电台快照、AI 状态和 sync outbox，保持 key/schema 不分叉。
- session storage 拆为 SecureStore Native 与浏览器实现，保留同一 `AuthService`。
- 验证登录、注册、退出、刷新会话、找回/换绑 callback 和 Protected routes。
- 为 API 增加环境化 CORS allowlist；配置本地 Web 来源和预留正式来源。
- 验证题库/词汇版本更新、资源签名 URL、用户学习数据和同步失败重试。

### 允许修改范围

storage/auth/sync/resource 模块、API CORS/config/tests、contracts（仅确有契约缺口时）、相关文档和部署脚本。

### 禁止范围

不新增登录方式；不改变云端权威规则；不迁移数据库 schema，除非盘点发现现有同步契约无法承载且先回到大流程确认。

### 验收与验证

- `pnpm check`、`pnpm check:web`。
- Web 登录刷新后会话恢复；退出和全部设备退出结果与 App 一致。
- 同一账号在 iOS 与 Web 间双向恢复题库进度、标注、笔记、学习记录和词汇进度；Android 仅保留自动化/本地数据契约检查。
- 发布 API 目标文件集到 ECS，保留回滚镜像；`/health/ready` 和代表性带鉴权/CORS 请求通过。
- 未引入第二套题库、用户数据或同步 owner。

## 5. 阶段 3：全部页面与交互三端化

### 阶段目标

让现有 App 面向用户开放的全部页面、弹层和状态在 Web 固定画布中可达、可操作。

### 主要工作

- 从 Expo Router 与现有 parity 资料生成 `page-state-inventory.md`，不凭记忆删减页面。
- 按页面族修复 SafeArea、键盘、滚动、触控/鼠标、hover/focus、手势、弹层和浏览器返回。
- 固化固定画布在桌面、手机、地址栏变化和软键盘场景的行为。
- 验证发现、我的、账户、信息、状态、题库、词汇、内容和 AI 页面。
- 所有平台差异写入 `platform-exceptions.md`，只接受系统级或浏览器能力差异。

### 允许修改范围

共享页面/组件、Web 外壳、路由平台配置、页面清单、浏览器测试和视觉证据。

### 禁止范围

不为 Web 重设计页面；不修改已确认业务规则；不以“后续再做”为由移除任何 App 页面。

### 验收与验证

- 页面/状态清单 100% 有 Web 路径和结果。
- Web 构建、单元测试、浏览器 E2E 通过。
- 桌面 Chrome 代表性检查无横向溢出、导航遮挡或不可关闭弹层；其余浏览器保留支持目标，不纳入本轮已实测结论。
- 共享页面在 iOS 代表尺寸完成回归截图；Android 体验回归延期。

## 6. 阶段 4：音频、录音和随身听

### 阶段目标

在不破坏现有音频生命周期的前提下完成 Web 等价能力。

### 主要工作

- 先完整读取音频指南和 Expo SDK 55 Audio/FileSystem 文档。
- 为 recorder 增加 Web MIME/format 选择和权限失败状态。
- 在唯一 RecordingRepository 内实现 Blob commit、replace、existence、cleanup 与 object URL 回收。
- 保持 RecordingAsset ID 幂等，完成 Web 回放和转写上传。
- 拆分 Radio engine：Native 继续 Track Player，Web 接入 Expo Audio playlist/前台播放器；共享 Provider 的目录、队列、字幕、倍速、间隔和快照规则。
- 验证浏览器自动播放限制、页面隐藏、设备切换、断网、资源失败和多次重录。

### 允许修改范围

音频指南允许的 orchestrator/adapter/repository/provider/engine 文件、相关 tests、Web 测试和证据。

### 禁止范围

不新增音频 owner；不让 UI 管理 recorder/Blob；不让回放或转写决定录音是否提交成功；不删除旧资产以掩盖 Web 错误。

### 验收与验证

- `pnpm check:audio`、相关 Jest、`pnpm check`、`pnpm check:web`。
- Chrome 完成题卡播放、权限、按住录音、停止、重录、回放、转写成功/失败；iPhone Safari专项检查按用户后续决定不在本轮执行。
- 随身听完成播放、暂停、进度、切题、倍速、字幕、间隔和恢复快照。
- iOS Development Build 与物理设备音频检查完成；Android 不做体验测试，但共享音频敏感改动仍执行工程规则要求的静态检查和必要构建门禁。

## 7. 阶段 5：全量对照与三端回归

### 阶段目标

把“可运行”收口为全部页面、核心流程、内容和用户数据的一致产品体验。

### 主要工作

- 建立 `parity-matrix.md`，按“页面状态 + 前置数据 + 操作轨迹”逐项关闭。
- 采集 App 与 Web 同状态截图；检查字体、间距、画布、滚动、弹层、键盘和动效。
- 验证题库发布一次后三端获取同一 checksum/内容。
- 用同一账号在 iOS、Web 交叉修改并恢复用户数据；Android 体验验证延期。
- 执行错误、弱网、登录失效、资源失败、权限拒绝和浏览器刷新恢复。

### 验收与验证

- 所有 App 页面和用户可见状态进入 parity matrix；不存在未记录差异。
- 高优先级操作轨迹三端结果一致。
- `pnpm check`、Web/iOS 构建、Chrome E2E、视觉检查和本轮音频矩阵全部通过；Android 延期项明确记录。
- 审查确认复用了既有题库、资源、音频、同步和 UI owner，没有第二来源。

## 8. 阶段 6：正式 Web 发布

### 进入条件

- 正式 Web 域名已确认为 `feizhuicao.com`；备案状态、DNS、证书/HTTPS方案和当前托管位置已完成只读盘点。
- 已明确正式 Web 来源、Supabase callback allowlist、API CORS allowlist 和发布时间。
- 路线图确认授权本阶段的 Web 静态发布与必要 API 配置部署；数据库 migration 不在授权内。
- `feizhuicao.com` 现有站点内容已完成可恢复备份，且回滚恢复方式已经验证。

### 主要工作

- 在当前 Vercel 项目发布 Web 产物，不迁移主站到 ECS。
- 完整替换 `feizhuicao.com` 当前旧站内容，不保留旧页面入口；仅在新站全部进入条件满足后执行切换。
- 配置 HTTPS、安全头、缓存策略、SPA fallback、资源 MIME 和版本标识。
- 配置 API CORS 与 Supabase redirect；不输出任何运行密钥。
- 保留上一版静态产物和配置备份，执行切换与回滚演练。

### 验收与验证

- 正式 URL 在手机和电脑浏览器均显示同一固定手机画布。
- 麦克风权限、录音、API、认证 callback、题库、资源和用户同步通过代表性请求。
- API `/health/ready` 通过，Web 静态产物与 API 回滚点均存在。
- 浏览器缓存刷新后版本一致，不出现旧代码配新接口的阻塞组合。
- 公开访问不需要封闭白名单；手机和电脑用户可直接打开正式域名进入产品。

备案、受信任 HTTPS、旧站备份或回滚验证未就绪时，本阶段必须暂停；不以 IP/不受信证书冒充正式验收，也不得提前清空现有站点。

## 9. 阶段 7：收口

- 写 `closeout.md`：完成范围、验证、平台例外、未做事项和剩余风险。
- 更新部署运行规则，写清 Web 构建、发布、回滚、CORS、callback 和缓存失效。
- 固化后续功能、题库和用户数据三端更新检查表。
- 确认 `APP_DISPLAY_VERSION`、Web 页面与“我的/关于”显示一致。

## 10. 路线确认门

用户已于 2026-07-18 明确确认进入小流程。七个阶段已完成；发布和平台例外证据见 `phase-log.md`、`parity-matrix.md`、`platform-exceptions.md` 与 `closeout.md`。
