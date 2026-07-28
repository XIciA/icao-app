# Web 专用 Vercel 后端分离技术盘点

状态：已完成只读盘点，随技术方案草稿等待确认

盘点日期：2026-07-28

## 1. 盘点范围与方法

本轮只读检查了：

- `package.json`、`app.json`、`vercel.json`、`.vercelignore`；
- `src/app`、`src/features`、`src/components`、`src/platform`；
- 认证、API client、学习同步、浏览器存储、录音上传和资源解析；
- `content/question-banks`、`tools/question-bank-content.mjs` 和现有发布产物；
- `services/api` 的认证、账号、同步、资源、题库和 AI controllers；
- 现有 `app-web-online-edition` 文档和部署运行规则；
- Vercel Functions、Blob、client upload 与 private storage 官方文档。

未修改业务实现、云端资源、ECS、数据库或 Vercel Production。工作区存在大量与本 workstream 无关的用户改动，本盘点只记录现状，不清理、不回退。

## 2. 当前工程结构结论

### 2.1 Web 与 App 的共享程度

当前 `src` 下有 232 个 TypeScript/TSX 文件，其中只有 14 个 `.web.*` 平台文件；`src/app` 有 23 个 TSX 路由，没有 Web 专用路由覆盖。

结论：

- 当前 Web 不是独立工程。
- 页面、导航、视觉、内容展示和大部分业务状态已经与 iOS、Android 共用。
- 新建 Web V2 会人为复制当前已经共享的实现。
- 正确拆分点是 transport、认证、同步、资源与平台能力，不是页面层。

现有 Web 平台边界已经覆盖固定画布、Modal、runtime、浏览器存储、session storage、录音 repository、录音上传和随身听 Provider，说明项目已具备继续扩展 `.web.*` adapter 的基础。

### 2.2 构建与部署

| 项目 | 当前状态 | 结论 |
| --- | --- | --- |
| Expo | `~55.0.27` | 继续使用锁定 SDK 55 |
| React Native | `0.83.6` | 三端共享 |
| Expo Router | `~55.0.16` | 三端共享路由 |
| Web output | `single` | 已按 SPA 导出 |
| Web build | `pnpm web:export` | 当前只导出静态 `dist` |
| Vercel | framework null + SPA rewrite | 当前没有 Web Functions |
| `check:web` | 仅执行 Web export | 缺少浏览器和网络边界验收 |

`vercel.json` 当前把全部未知路径重写到 `index.html`。加入 `/api/*` 后必须保证 Function 路由优先，不被 SPA fallback 吞掉。

`.vercelignore` 当前排除了 `content/`、`services/`、`tools/` 和 `docs/`。这能避免把权威内容源和内部文档打入静态站点，但新增 Vercel runtime 和同步产物的目录必须重新校验，避免所需 Function 被误排除。

## 3. 当前网络依赖

### 3.1 浏览器主 API

`src/platform/api-client.ts` 从 `EXPO_PUBLIC_ICAO_API_URL` 读取唯一 base URL，并为请求附加 App access token。下列模块直接或间接调用它：

- AI client；
- AuthProvider；
- editorial repository；
- feedback client；
- question-bank repository；
- resource service；
- learning sync；
- vocabulary repository。

只修改 Vercel 域名不会改变这些运行时依赖。若 Web 环境变量仍指向 ECS，登录、题库刷新、资源、同步、AI 和反馈仍会跨境/跨来源访问 ECS。

### 3.2 认证耦合

`src/features/auth/auth-service.ts` 当前：

1. 调用 ECS `/v1/auth/invite/session`；
2. 获取 Supabase access/refresh token；
3. 用浏览器 Supabase client 建立正式 App session。

`AuthProvider.tsx` 在 session 恢复后继续绑定 `learning-sync`，并包含云端数据绑定、全部设备退出和账号注销流程。

结论：只换 API base URL 不够。Web 必须有独立 `auth-service.web` 和 Web Provider/capability 路径，主动停止 Supabase 与学习同步，而 Native 保留当前实现。

### 3.3 API 功能面

当前 ECS API controllers 包括：

- account；
- AI；
- invite auth 与 me；
- editorial；
- feedback；
- health；
- question-bank；
- resource；
- sync；
- vocabulary。

Web Demo 不需要整体复制：

| 当前 ECS 能力 | Web 处理 |
| --- | --- |
| invite auth | Vercel 独立轻量实现 |
| me/account | 不复制正式账号能力 |
| sync | 完全关闭，使用浏览器本机数据 |
| question-bank/resource | Vercel Blob 静态镜像 |
| AI | 选择性 Vercel Functions |
| editorial/vocabulary | 优先构建期/Blob 派生内容，必要时补轻量接口 |
| feedback | 可延后或改为明确说明 |
| health | 新增 Web runtime 独立健康检查 |

## 4. 题库与音频现状

### 4.1 唯一内容源已经存在

`tools/question-bank-content.mjs` 已经定义：

- 可编辑源：`content/question-banks`；
- 内嵌运行时数据：`src/features/question-bank/data/question-bank.json`；
- 内嵌音频索引：`audio-index.json`；
- 可复现发布目录：`dist/question-bank-release`；
- release manifest、每题库 JSON、资源 manifest、checksum 和 change report；
- `content:build`、`content:check`、`content:check:full`。

因此不需要为 Web 重新发明题库格式。新增工作是把现有发布产物及其资源可靠镜像到 Vercel，并补 App 发布版本核验、增量上传、原子指针和回滚。

### 4.2 当前体积快照

本轮工作区快照：

- 合并题库 JSON 约 6.2 MB；
- `audio-index.json` 约 1.4 MB；
- `content/question-banks` 约 238 MB；
- 其中扫描到约 2164 个 MP3。

工作区同时存在与本 workstream 无关的内容改动，因此这些数字只能用于体积判断，不能作为当前线上 App 发布版本的权威数量。正式同步必须读取已确认 App release manifest，而不能以未审查工作区扫描结果为准。

### 4.3 当前 Web 文本与音频路径不同

`src/features/question-bank/data/repository.ts` 的 Web 路径会：

- 先尝试浏览器缓存；
- 使用内嵌题库作为进入回退；
- 后台仍可能通过 `EXPO_PUBLIC_ICAO_API_URL` 刷新远程题库。

所以题库文本已有 Web 静态可用基础，但仍保留 ECS 刷新依赖。

音频和其他题库资源继续通过 resource service / signed URL 路径解析，尚未形成 Vercel 镜像。因此“静态页面在 Vercel”并不等于“Web 不依赖 ECS”。

## 5. 浏览器本地数据现状

`src/platform/storage.web.ts` 已实现 IndexedDB key-value store，并提供 memory fallback，接口覆盖：

- get/set/remove/clear；
- getAllKeys；
- multiGet/multiSet/multiRemove。

这满足 Web 本机学习数据的基础要求，无需新增数据库。需要补足：

- Web 关闭 `learning-sync`；
- 本地 schema/version 升级策略；
- IndexedDB 不可用或写入失败时的用户提示；
- 清除本机数据边界；
- 多标签页与退出登录后的数据归属规则。

## 6. 录音与 AI 现状

### 6.1 浏览器录音

现有 Web 已有：

- `expo-recorder-adapter.web.ts`；
- `recording-repository.web.ts`；
- `audio-upload.web.ts`。

当前 `audio-upload.web.ts` 会把 Blob 封装为 `FormData`，再发送到现有 API。ECS API 当前接受约 8 MB 文件，并在 Supabase Storage 暂存，再调用 DashScope 转写。

### 6.2 Vercel 限制

Vercel Functions 请求与响应体上限为 4.5 MB。浏览器录音如果继续作为 multipart 先发给 Function，达到几分钟时可能直接失败。

因此 Web 新链路需要 direct-to-Blob client upload，而不是照搬现有 ECS upload controller。现有 `RecordingRepository` 和 Web recorder 仍应复用，替换的只是提交 transport 和临时对象 owner。

### 6.3 AI 可复用与不可复用部分

可复用：

- 客户端业务类型和用户可见结果；
- 已有航空领域提示词、词库和静态资产；
- 错误语义、超时和重试原则。

不可直接复用：

- ECS 路由地址；
- Supabase Storage 临时录音路径；
- NestJS/Fastify 进程模型；
- 与正式 App 用户/配额绑定的数据模型。

Web Function 应直接调用外部 AI 供应商，不经过 ECS。首版不做 AI 额度和长期历史，但仍需基础限流与超时。

## 7. Vercel 能力适配结论

| 需求 | Vercel 适配 | 关键约束 |
| --- | --- | --- |
| Expo Web 静态站 | 已适配 | 当前已有 Production 配置 |
| 独立邀请码 | 可实现 | 需要最小状态服务与 HttpOnly Cookie |
| 本机登录保持 | 可实现 | Cookie TTL、撤销和跨 Preview 隔离 |
| 本机学习数据 | 已有基础 | IndexedDB，不提供云恢复 |
| 完整题库文本 | 可实现 | Blob/CDN 直出，按题库分片 |
| 全部音频 | 可实现 | versioned Blob、checksum、Range 与缓存 |
| 文本 AI | 可实现 | Function 直连供应商 |
| 录音转写 | 可实现 | direct upload，不能经过 4.5 MB Function body |
| 长期用户数据库 | 不需要 | 明确排除 |
| Web/App 数据同步 | 不需要 | 明确排除 |

## 8. 主要风险

### P0：架构边界

- 共享 `AuthProvider` 自动启动 Supabase session 与学习同步。
- 通用 API client 仍读取 ECS base URL。
- 资源 resolver 仍生成 ECS/Supabase URL。
- SPA catch-all 可能覆盖新增 `/api/*`。
- Web runtime 配置遗漏时可能静默回退 ECS。

### P1：内容完整性

- 全量音频上传中断造成文本与音频版本不一致。
- 未确认的本地题库状态被误同步为 Production。
- 大资源重复上传导致发布时间和费用不可控。
- CDN 缓存导致 current 指针或 manifest 新旧混用。
- 直接使用可变文件名会让回滚失效。

### P1：认证与录音

- 邀请码如果只存前端可被绕过。
- session Cookie 配置错误导致首次可进、刷新后掉登录。
- Function body 限制导致长录音随机失败。
- 转写失败路径未删除临时对象。
- 浏览器 MIME、麦克风权限和移动端 Safari 行为存在差异。

### P2：产品认知

- 共享账户页面仍展示云同步或账号管理承诺。
- 用户误认为 Web 与 App 数据互通。
- 清理浏览器后数据丢失但此前没有提示。
- Web 晚于 App 时没有显示内容/应用版本，难以排查。

### P2：中国大陆访问

- Vercel 能消除当前未备案 ECS 作为 Web 必经链路的问题，但无法承诺所有大陆地区、运营商和时间段 100% 可达。
- 外部 AI 供应商若线路不稳定，会影响单项 AI，但不应阻断邀请码、题库和音频静态体验。
- 自定义域名的 DNS、HTTPS、污染或运营商线路仍需上线前实测。

## 9. 必须建立的验证证据

当前缺少：

- Vercel Function 与 Expo SPA 共存的 Preview 证据；
- Web 独立邀请码和 Cookie 恢复测试；
- ECS 请求零命中自动门禁；
- App 发布版本到 Blob 的一键全量/增量同步；
- versioned manifest 原子提升与回滚演练；
- 全量题库引用闭包和音频 Range 验证；
- direct-to-Blob 录音转写及成功/失败删除证据；
- Web capability 矩阵和账户页面隐藏清单；
- 新手机、同浏览器恢复、清数据和弱网体验证据；
- 共享改动后的 iOS/Android 零回归证据。

## 10. 与既有架构的冲突

既有 `app-web-online-edition` workstream 把 Web 定义为与 App 共用 ECS、账号和云端学习数据的正式在线版。本轮用户确认把 Web 改为：

- Vercel 独立运行；
- 独立邀请码；
- 浏览器本机数据；
- 不做 App/Web 用户数据同步；
- App 正式产品、Web 体验产品。

因此旧 workstream 只能作为当前页面、平台 adapter 和验收基线参考，不能继续作为 Web 运行时架构依据。设计仓库为只读，本轮不直接修改其战略和 ADR；需要在本 workstream 文档、运行图和最终 closeout 中明确记录项目级例外。

## 11. 盘点结论

方案可行，且不需要重写 Web：

- 页面和组件共享基础已经存在；
- 浏览器本机存储、录音和播放器平台 adapter 已有基础；
- 内容发布工具已经具备 manifest、checksum 和分题库产物；
- 主要工程工作集中在 Web 认证、API transport、内容镜像、资源 resolver、AI/录音 Function 和发布门禁。

真正的高风险不是页面开发量，而是防止 Web 继续隐式请求 ECS、保证全量题库与音频版本一致，以及在修改共享 Provider 时维持 iOS、Android 零回归。
