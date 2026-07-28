# Web 专用 Vercel 后端分离技术方案

状态：草稿，等待确认

更新时间：2026-07-28

前置文档：`requirements.md`

## 1. 方案结论

采用“**一个 Expo 主应用 + 原生双端保持现状 + Web 专用能力边界 + Vercel 独立运行时 + App 内容发布版本只读镜像**”的方案。

- 不新建 Web V2，不重写页面；继续使用当前 Expo Router、共享组件、主题和业务规则。
- iOS、Android 继续使用当前阿里云 ECS、Supabase、资源服务和发布流程。
- Web 前端仍由 Vercel 托管，Web 专用 API 使用 Vercel Functions，题库文本和全部对应音频使用 Vercel Blob/CDN。
- Web 使用独立邀请码和轻量会话，不接入 App 正式账号，不接入云端学习同步。
- Web 学习进度、收藏、标注、笔记和历史只保存在 IndexedDB 等浏览器本地存储。
- App 内容发布链路是题库文本与音频的唯一真实来源；Web 通过一键命令镜像一个完整、已确认的 App 发布版本。
- Web 浏览器运行时不得请求当前阿里云 ECS；开发者执行内容同步时可以读取或核验 App 已发布版本。
- 录音只为当次转写临时上传，完成后删除；AI 不保存长期历史，首版不建设用量配额。

这不是“把整个 App 后端搬到 Vercel”，而是为 Web Demo 提供它实际需要的最小后端。

## 2. 三个产品的目标关系

```text
                         仓库共享源码
          页面 / 组件 / 主题 / 纯业务规则 / 内容源
                    ┌─────────┴─────────┐
                    │                   │
          iOS + Android 正式 App       Web 体验版
                    │                   │
        阿里云 ECS + Supabase      Vercel Functions
        正式账号 + 云端学习数据     独立邀请码 + 轻量会话
        正式资源与 AI 链路          Blob 题库镜像 + 外部 AI
                    │                   │
                    └────内容发布───────┘
                       App 先发布
                       Web 后镜像
```

关系中的关键不变量：

1. App 是正式学习产品，决定功能、内容、视觉和业务规则的主线。
2. Web 是独立环境的体验产品，只跟随共享产品能力，不与 App 共享账号或个人数据。
3. Web 的内容可以晚于 App，但不能自行编辑，也不能形成另一套题库。
4. Web 后端失败不得影响 App；App 的 ECS 发布也不得自动改动 Web Production。

## 3. 目标工程边界

推荐按现有工程实际命名调整，职责结构如下：

```text
src/
├── app/                              三端共享路由
├── components/                       三端共享 UI
├── features/                         三端共享页面与纯业务规则
│   ├── auth/
│   │   ├── auth-service.ts           Native 现有实现
│   │   └── auth-service.web.ts       Web 邀请码与会话实现
│   ├── question-bank/
│   │   └── platform/                 Web 内容 manifest / Blob resolver
│   └── sync/                         Native 云同步；Web 不进入该运行路径
├── platform/
│   ├── api-client.ts                 Native 现有 ECS client
│   ├── api-client.web.ts             同源 `/api/*` Vercel client
│   ├── storage.web.ts                IndexedDB，本机学习数据
│   ├── capabilities.*                三端能力声明
│   └── recording / upload adapters   浏览器临时录音路径
└── config/                            公共版本与非秘密配置

api/ 或 services/web-runtime/          仅 Web 使用的 Vercel Functions
├── auth/                              邀请码、会话、退出
├── ai/                                查词、语法、润色、转写
├── uploads/                           临时录音上传令牌与清理
└── health/                            Web 运行时健康检查

tools/ 或 scripts/
└── sync-web-content.mjs               一键内容镜像、验证、提升和回滚

content/question-banks/                现有唯一可编辑内容源
dist/question-bank-release/            现有可复现发布产物
Vercel Blob                            只读版本化 Web 镜像
```

Vercel Function 的物理目录需在实现第一个小流程中通过 Preview 部署验证后确定。无论使用根 `api/` 还是独立 workspace，都不得复用或改造 `services/api` 到影响移动端的程度。

## 4. Web 请求拓扑

### 4.1 浏览器允许请求

Web Production 只允许请求：

- 当前 Vercel 站点自身的静态文件与同源 `/api/*`；
- 当前项目受控的 Vercel Blob/CDN 题库与音频地址；
- 经评审确认的字体、图片等公共静态来源。

外部 AI 供应商只能由 Vercel Function 调用，浏览器不得直连并持有模型密钥。

### 4.2 浏览器禁止请求

生产构建和运行时必须禁止：

- `api.feizhuicao.com`；
- `cloud.feizhuicao.com`；
- 当前 ECS IP、非标准端口和资源域名；
- App 自托管 Supabase Auth、Storage 或数据库；
- 通过 Vercel Function 反向代理回 ECS。

通过两层门禁保证：

1. 构建时扫描 Web bundle、source map 和公开环境变量，发现 ECS 域名/IP 即失败。
2. 浏览器 E2E 拦截所有请求，发现不在允许列表内的网络目标即失败。

## 5. Web 邀请码与轻量会话

### 5.1 推荐实现

使用 Vercel Functions 加一个 Redis 兼容的受控状态服务，例如 Vercel Marketplace 中的 Upstash Redis：

- 邀请码只保存带服务端 pepper 的 HMAC 摘要，不保存可直接使用的明文。
- 邀请码记录只包含状态、过期时间、可选备注和失败控制信息。
- 登录成功后生成随机不透明 session token；浏览器只收到 `Secure`、`HttpOnly`、`SameSite=Lax` Cookie。
- 状态服务只保存 session 摘要、过期时间和撤销状态。
- 同一浏览器关闭再打开仍能恢复会话；退出时服务端撤销 session 并清 Cookie。
- 邀请码错误按 IP、邀请码摘要和时间窗口组合限流，避免只靠浏览器本地状态。

Web 的邀请码只是访问门，不代表 App 用户、正式身份、权益或学习档案。首版不做注册、短信/邮箱验证码、密码、找回、跨设备会话管理和完整个人资料。

### 5.2 页面处理

- 保留共享账户页面源码，不为 Web 删除 App 页面。
- 使用平台能力注册表控制 Web 可见入口。
- “云端同步、换绑邮箱、修改密码、全部设备退出、注销正式账号”等入口在 Web 隐藏。
- 若共享导航必须保留某入口，则显示“Web 体验版暂不提供”，不得发起 ECS 请求或假成功。
- “我的”或等价位置持续显示“Web 体验版”及本机数据提示。

## 6. Web 本机学习数据

继续复用现有 `src/platform/storage.web.ts` 的 IndexedDB adapter，避免再引入一个本地数据 owner。

- 题库进度、收藏、标注、笔记、学习记录、词汇进度和播放器快照继续通过共享 storage 接口保存。
- Web 会话与学习数据分离：退出邀请码会话不默认删除本机学习数据；提供明确的“清除本机数据”操作时再删除。
- 所有 key/schema 变更必须提供向前兼容升级或安全重建策略。
- IndexedDB 不可用时允许内存回退以保证页面可进入，但必须提示刷新后可能丢失，不能显示“已保存”。
- 不运行 `learning-sync` outbox，不调用 `/v1/sync`，不执行 App 用户绑定或旧云端数据恢复。

清理站点数据、使用隐私模式、更换浏览器或设备会导致记录丢失，这是明确接受的产品边界。

## 7. 题库文本与音频的一键镜像

### 7.1 唯一真实来源

内容所有权按以下顺序固定：

```text
仓库 content/question-banks
        ↓ 现有 content:check / content:build
App / ECS 已确认发布版本
        ↓ pnpm web:content:sync
Vercel 版本化只读镜像
        ↓ 原子提升 current.json
Web Production
```

- `content/question-banks` 及现有内容工具是可编辑源。
- App/ECS 已确认发布版本是 Web 可同步的发布基线。
- `dist/question-bank-release`、Web 分片 JSON、Blob 对象和 `current.json` 都是可重新生成的派生产物。
- 不允许在 Vercel 控制台直接改题、替换音频或手写 manifest。

### 7.2 存储布局

推荐使用不可变、版本化路径：

```text
question-bank-releases/
├── releases/<release-id>/manifest.json
├── releases/<release-id>/banks/<bank-id>.json
├── releases/<release-id>/resources/manifest.json
├── releases/<release-id>/audio/<checksum>.mp3
└── pointers/current.json
```

- `release-id` 同时包含 App 内容版本和总 manifest checksum。
- 文本按题库或更小单元拆分，避免把现有约 6.2 MB 合并 JSON 通过 Function 返回。
- 音频以 checksum 或不可变 object key 去重；同内容不重复上传。
- `current.json` 很小，只指向一个完整 release。
- 客户端先读取 `current.json`，再按 manifest 加载；本机缓存按 release-id 隔离。
- 旧 release 至少保留到下一个版本验证稳定，供秒级回滚。

题库和音频推荐放在公开 Blob/CDN，以获得最简单、稳定的直出链路。代价是拿到资源 URL 的人可能绕过邀请码直接访问资源；邀请码在本方案中是产品入口控制，不是音频 DRM。若后续确认资源必须强鉴权，需改用 private Blob 和短期签名 URL，并重新评估请求量、延迟、费用和大陆访问效果。

### 7.3 一键命令

新增唯一标准入口，例如：

```text
pnpm web:content:sync --from app-release:<release-id> --preview
pnpm web:content:promote <release-id>
pnpm web:content:rollback <release-id>
```

日常推荐把检查、上传、Preview 验证和提升包装成一个交互式命令；内部必须保留可单独重试的阶段：

1. 读取 App 已确认发布版本及其 manifest，不接受未发布或未确认的工作区内容。
2. 运行现有 `content:check:full` 和 `content:build`，校验文本、映射、时长、文件大小与 checksum。
3. 比对目标 release，按 checksum 只上传新增或变化的 JSON、音频和图片。
4. 上传 versioned manifest，但不修改 `current.json`。
5. 验证对象数量、总大小、checksum、MIME、代表性音频 Range 请求和全部引用闭包。
6. 生成 Vercel Preview，运行 Web 内容与核心流程检查。
7. 验证通过后，以条件写或等价并发保护原子更新 `current.json`。
8. 记录旧指针、发布者、时间、App 源版本和验证证据。

任一步失败都不得改变 Production 当前指针。同步命令必须支持 dry-run；删除旧对象不属于普通同步，另设有保留策略和人工确认的清理流程。

### 7.4 内容一致性门禁

上线至少验证：

- manifest 的 releaseVersion、releasedAt 与 App 源版本一致；
- 每个题库 checksum 与生成产物一致；
- 每个资源都有唯一 object key、大小、MIME 和 SHA-256；
- 所有题卡引用均能在资源 manifest 中找到；
- 全部应发布音频已上传，抽样与自动 Range 请求均可播放；
- Web 页面显示当前内容版本；
- ECS 断开时仍能加载完整题库清单和音频；
- 上一版本指针可恢复。

## 8. AI 与临时录音

### 8.1 文本 AI

Vercel Function 复用现有领域提示词、词库和响应语义，直接调用已经确认的外部 AI 供应商：

- API 密钥只存在 Vercel 服务端环境变量。
- 首版可保留代表性的查词、语法检查和表达润色。
- 不保存完整对话和长期结果；用户需要的结果可按现有页面逻辑保存在浏览器本机。
- 暂不建设用量额度、套餐或计费；仍设置单请求大小、并发、频率、超时和上游异常保护。

共享 App AI client 可以保留统一的业务类型，但 Web transport 必须指向同源 Vercel API。不得为了复用代码让 Web 回退到 ECS。

### 8.2 录音转写

Vercel Functions 的请求/响应体存在 4.5 MB 限制，因此录音不得先完整穿过 Function：

1. 浏览器向同源 Function 请求一次性、短时上传授权。
2. 浏览器把录音直接上传到 private Vercel Blob 的 `temporary-recordings/<session>/<id>`。
3. Function 验证对象归属、MIME、大小和过期时间后调用转写供应商。
4. 转写成功或失败都在 `finally` 路径删除临时对象。
5. 定时兜底清理超过短保留期的异常遗留对象。

记录最少的操作日志即可，不记录录音内容、完整转写历史或长期 AI 历史。若转写供应商需要通过 URL 拉取，使用短期可访问 URL，并在供应商完成后立即失效或删除对象。

## 9. Web 能力分叉原则

建立一个共享的 capability registry，而不是在页面中散落 `Platform.OS === 'web'`：

| 能力 | Native | Web |
| --- | --- | --- |
| 正式账号 | 开启 | 关闭 |
| 云端学习同步 | 开启 | 关闭 |
| 本机学习记录 | 开启 | 开启 |
| 完整题库文本/音频 | 开启 | 开启，Vercel 镜像 |
| 邀请码进入 | App 账号链路 | Web 独立链路 |
| AI 代表性能力 | 当前 ECS 链路 | Vercel Function |
| 录音转写 | 当前正式链路 | 临时 Blob |
| 账户管理 | 当前 App 能力 | 隐藏或说明 |
| 后台/锁屏能力 | 原生支持 | 明确降级 |

页面只根据能力决定显示、禁用和说明；平台 transport/adapter 决定实际调用目标。共享页面和业务规则仍只有一份。

## 10. iOS 与 Android 零影响策略

### 10.1 代码隔离

- 优先新增 `.web.ts`、`.web.tsx` 或 Web runtime workspace。
- Native 当前文件、API 地址、Supabase 配置、数据库 schema 和资源 resolver 不改。
- 不增加原生依赖、权限、Expo Plugin 或原生配置。
- 共享契约若需扩展，使用向后兼容字段；不得改变当前移动端接口语义。
- `services/api` 不因本 workstream 部署；只有明确发现 App 侧必要缺陷时另开工作项。

### 10.2 每阶段回归门

- Web 专用文件不得进入 Native bundle 的运行路径。
- `pnpm check` 必须通过。
- 共享 TypeScript/React Native 文件发生变化时，执行 iOS 和 Android 与风险相匹配的构建或冒烟。
- 音频生命周期相关改动必须先读取音频指南，并执行 `pnpm check:audio` 和要求的平台证据。
- 任一 App 功能、视觉、构建或网络链路变化都视为阻塞，不允许以“Web 可用”替代。

## 11. 安全、隐私与运行日志

- Vercel Production 只使用 HTTPS。
- 服务端环境变量保存 AI、Blob、状态服务和 session 密钥；公开环境变量不得含秘密。
- CSP 的 `connect-src` 使用明确允许列表，不包含 ECS。
- Cookie 使用 Secure、HttpOnly、SameSite；写操作执行 Origin/CSRF 检查。
- 邀请码、session、上传令牌和 AI 接口均有服务端限流。
- 日志不记录邀请码明文、Cookie、AI 密钥、完整录音、完整转写或学习内容。
- 运行日志保留 request ID、错误类型、耗时、供应商状态和内容 release-id，满足故障排查即可。
- 页面明确说明本机数据、录音临时处理和 Web 体验版边界。

## 12. 构建、环境与发布

至少区分：

| 环境 | 用途 | 内容指针 | 数据 |
| --- | --- | --- | --- |
| Local | 开发与单测 | 固定测试 release | 本地/测试状态 |
| Preview | PR/阶段验收 | 候选 release | 独立测试邀请码 |
| Production | 正式体验版 | 已提升 release | 生产邀请码与 session |

发布顺序：

1. 从明确提交构建 Web 和 Vercel Functions。
2. 部署 Preview，验证静态页面、邀请码、内容、音频、AI 和录音。
3. 执行网络允许列表测试，证明没有 ECS 请求。
4. 记录当前 Production 部署与 `current.json` 指针。
5. 提升已验证部署为 Production。
6. 用新浏览器、同一浏览器恢复会话和代表性网络完成线上验收。

代码回滚使用上一 Vercel Deployment；内容回滚只切回上一 `current.json`。二者分别记录，避免把应用代码与题库版本绑死。

## 13. 验证矩阵

### 自动门禁

- `pnpm check`
- Web 生产导出和 Vercel Preview 构建
- Web 专用单元测试：邀请码、Cookie、capability、local storage、manifest、资源 resolver
- 内容全量检查、checksum 和引用闭包
- 浏览器 E2E：登录、刷新恢复、本机学习记录、完整题库入口、音频、AI、录音失败/成功
- bundle/env/网络请求 ECS 禁止扫描

### 人工验收

- 新手机首次打开能加载站点并通过邀请码进入。
- 同一浏览器重新打开仍处于登录状态。
- 清理浏览器数据后的丢失提示符合预期。
- 页面持续显示“Web 体验版”。
- 所有不提供的账户与原生功能均隐藏或有清楚说明。
- 断开 ECS 后 Web 核心体验继续运行。
- App 真机核心流程和视觉没有变化。

## 14. 当前推荐与待确认决策

### 已给出推荐

1. 状态服务：Redis 兼容受控服务，不建设关系型用户数据库。
2. 会话：服务端不透明 session + HttpOnly Cookie。
3. 内容：Vercel Blob/CDN 的不可变版本化镜像。
4. 题库资源：首版公开 Blob，邀请码只控制产品入口，不承担 DRM。
5. 录音：private Blob 直接上传、当次转写、立即删除与超时兜底。
6. AI：Vercel Function 直连外部供应商，不做额度系统和长期历史。
7. Web/App 差异：capability registry + `.web.*` adapter，不复制页面。

### 实现前仍需确认

1. 题库音频是否接受“获得 URL 后可直接访问”的公开 Blob 模式；若不接受，改为 private Blob 并重新评估成本和延迟。
2. Production 域名及 DNS 切换时间。
3. Web 首版具体保留哪几项 AI 能力。
4. 邀请码默认有效期、并发会话数和管理方式。

这些选择不改变“Web 零 ECS、App 不变、内容单一来源”的主架构。

## 15. 不采用的方案

- **新建 Web V2 页面工程**：会复制页面、状态和维护工作。
- **Web 继续跨域请求 ECS**：无法消除当前备案/线路问题，也不符合运行时零 ECS。
- **把完整 NestJS/Postgres/Supabase 原样迁到 Vercel**：对 Demo 过重，并扩大数据与运维责任。
- **把完整题库 JSON 通过 Function 返回**：现有合并文本约 6.2 MB，超过 Function 4.5 MB 请求/响应体限制。
- **把全部音频打进 Web 静态构建**：构建和部署过重，无法高效增量同步。
- **Vercel 控制台手工维护题库**：会形成第二真实来源且不可审计。
- **把邀请码存在前端或只用 localStorage 校验**：可被直接绕过。
- **通过 Vercel 代理 ECS**：只是隐藏地址，没有消除 ECS 可达性依赖。

## 16. 技术依据

- Vercel Functions 限制：<https://vercel.com/docs/functions/limitations>
- Vercel Blob：<https://vercel.com/docs/vercel-blob>
- Vercel Blob 客户端上传：<https://vercel.com/docs/vercel-blob/client-upload>
- Vercel Blob 私有存储：<https://vercel.com/docs/vercel-blob/private-storage>
- Expo SDK 55 文档：<https://docs.expo.dev/versions/v55.0.0/>

本技术方案确认前不授权代码实现、Vercel 资源创建、Production 发布或域名切换。
