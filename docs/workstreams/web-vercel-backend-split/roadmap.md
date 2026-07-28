# Web 专用 Vercel 后端分离路线图

状态：草稿，等待确认

更新时间：2026-07-28

前置文档：`requirements.md`、`technical-plan.md`、`technical-audit.md`

## 1. 路线总览

| 阶段 | 目标 | 核心产出 | 进入下一阶段标准 |
| --- | --- | --- | --- |
| 0. 基线冻结 | 明确 App/Web 当前行为与网络 | 请求清单、功能矩阵、回滚点 | 三端基线和允许域名完整 |
| 1. Web 能力隔离 | Web 不再自动进入 App 账号与同步链路 | capabilities、Web auth/API adapters | Web 构建通过，Native 行为不变 |
| 2. Vercel 邀请码 | 稳定进入并保持同浏览器会话 | Functions、最小状态、Cookie、限流 | 新浏览器登录/刷新/退出通过 |
| 3. 内容一键镜像 | 完整题库与全部音频脱离 ECS | sync 命令、Blob release、pointer、回滚 | 全量引用闭包和原子提升通过 |
| 4. 本机学习体验 | 核心学习记录只保存在浏览器 | IndexedDB 边界、提示、账户页收口 | 刷新恢复与清理丢失行为正确 |
| 5. AI 与临时录音 | 提供代表性 AI，不长期保存 | AI Functions、direct upload、清理 | 成功/失败/超时/删除全部通过 |
| 6. 全页面与网络收口 | 所有 Web 入口均真实、可解释、零 ECS | parity matrix、E2E、视觉与请求证据 | 无假入口、无 ECS 请求、App 无回归 |
| 7. Preview 与 Production | 可回滚地切换正式 Web | Preview 证据、域名、上线与回滚记录 | 线上新手机与核心流程通过 |
| 8. 维护机制收口 | Web 可持续跟随 App | 跟随清单、runbook、closeout | 一次模拟 App 更新完整走通 |

路线按最小可独立验证闭环执行。每阶段开始前写小流程计划，结束后记录变更、验证、证据、剩余风险和下一阶段进入判断。

## 2. 全阶段硬约束

- 不创建第二套 Web 页面工程。
- 不把 iOS、Android 切到 Vercel。
- 不改变 App 当前 ECS、Supabase、账号、学习同步和发布链路。
- 不复制或手工编辑题库、音频索引、时长、字幕和资源解析真实来源。
- Web Production 运行时不请求当前 ECS，不允许以 Vercel 反向代理 ECS。
- 题库文本和全部对应音频必须属于同一个完整 App 已发布版本。
- 不建设 Web/App 用户数据同步、完整 Web 账号、长期 AI 历史和长期录音库。
- 不为 Web 增加原生依赖、权限、Plugin 或重建要求。
- 涉及共享代码或音频生命周期时，执行仓库规则要求的 App 与音频验证。
- 未满足阶段验收不得进入 Production；不得把无关脏工作区改动带入发布。

## 3. 阶段 0：基线冻结与网络契约

### 目标

在切断任何链路前记录当前可恢复基线，并把“Web 可以请求什么”变成机器可检查的契约。

### 主要工作

- 记录当前 Vercel Production deployment、域名、环境变量名称和回滚方式，不读取或输出秘密值。
- 生成 Web 页面/入口/API/资源请求清单。
- 建立三端 capability matrix 和 Web Demo 范围清单。
- 固化 ECS 禁止域名/IP模式和 Vercel 允许来源列表。
- 建立 App 核心回归清单：启动、登录、题库、音频、录音、同步、我的。
- 记录当前题库正式 App 发布版本和 manifest 获取方式。

### 验收

- `network-boundary.md`、`capability-matrix.md` 和基线证据齐全。
- 当前 Web、iOS、Android 各自运行图可被复述和验证。
- 当前 Vercel 与内容 release 均有明确回滚点。
- 尚未修改生产配置。

## 4. 阶段 1：Web 运行时能力隔离

### 目标

让共享页面在 Web 上不再自动启动 App 的 Supabase Auth、learning-sync 和 ECS API。

### 主要工作

- 建立 Web capability registry。
- 增加 `auth-service.web`、`api-client.web` 或等价平台 transport。
- Web 禁止初始化 Supabase client 和云端学习同步。
- Web 资源 resolver 改为 manifest 驱动接口，先接测试 release。
- 账户与云同步入口按能力隐藏或显示体验版说明。
- 在页面中增加统一“Web 体验版”标识和本机数据说明。
- 加入 Web bundle/env/E2E 请求目标扫描。

### 允许修改

Web 平台文件、能力注册表、必要的共享 Provider 注入点、测试和本 workstream 文档。

### 禁止修改

不创建真实 Vercel 生产状态；不改 App API URL；不改 ECS；不迁移数据库；不发布 Production。

### 验收

- `pnpm check` 与 `pnpm check:web` 通过。
- 无 Vercel backend 时 Web 进入明确“服务未配置”状态，不回退 ECS。
- Native 仍使用原 AuthService、API client 和 learning-sync。
- iOS、Android 与共享改动相匹配的构建/冒烟通过。

## 5. 阶段 2：独立邀请码与同浏览器会话

### 目标

建立不依赖 App 账号的稳定 Web 入口。

### 主要工作

- 创建 Web 专用 Vercel Functions。
- 接入 Redis 兼容最小状态服务。
- 实现邀请码 HMAC 摘要、启停、过期、失败次数和速率限制。
- 实现不透明 session、HttpOnly Cookie、恢复、退出和撤销。
- 配置 Local、Preview、Production 数据隔离。
- 增加健康检查、request ID 和最小安全日志。

### 验收

- 有效、无效、停用、过期和连续错误邀请码结果明确。
- 同一浏览器关闭再打开仍可进入。
- 退出后 session 失效；篡改 localStorage 不能绕过。
- Cookie、Origin/CSRF、安全头与秘密扫描通过。
- App 登录、全部设备退出和账号数据没有变化。

## 6. 阶段 3：完整题库与全部音频一键镜像

### 目标

让 Web 的完整题库文本和全部对应音频由 Vercel 独立提供，同时保持 App 内容唯一来源。

### 主要工作

- 扩展现有内容工具，生成适合 Web 的 versioned release。
- 实现 `web:content:sync`、dry-run、promote 和 rollback。
- 同步前校验 App 已确认发布版本，禁止直接把未审查工作区推为 Production。
- 使用 checksum 增量上传题库 JSON、资源 manifest、全部音频和必要图片。
- 实现不可变 release path 与小型 `current.json` 指针。
- 在 Preview 验证全量引用闭包、数量、大小、checksum、MIME 和音频 Range。
- Web resolver 读取 Vercel manifest，不请求 ECS；保留可识别版本的本地缓存/内嵌回退。

### 验收

- 一条标准命令可完成检查、增量上传、Preview 验证和经确认的提升。
- Web 所见题库与音频属于同一个 App release-id。
- 任意上传或验证失败都不改变线上 current 指针。
- ECS 不可达时完整题库入口和全部已映射音频仍能加载。
- 上一 release 可恢复，且无需重新发布 App。
- 未产生第二个可编辑内容源。

## 7. 阶段 4：浏览器本机学习数据与页面收口

### 目标

让 Web 核心学习体验稳定保存于当前浏览器，同时彻底移除正式账号和云同步错觉。

### 主要工作

- 审计并复用现有 `storage.web.ts`。
- 确认题库进度、收藏、标注、笔记、记录和词汇进度 key/schema。
- 补 schema 升级、写入失败、memory fallback 和多标签页规则。
- 关闭 sync outbox、用户绑定和云端恢复。
- 设计退出邀请码会话与清除本机数据的独立行为。
- 隐藏无意义账户入口；保留源码与 Native 页面。
- 在登录、我的和清理操作前显示数据边界。

### 验收

- 学习后刷新、关闭并重新打开同一浏览器，记录可恢复。
- 清理浏览器数据后记录允许丢失，页面说明与行为一致。
- Web 不发出 `/v1/sync`、账户注销或 Supabase 请求。
- 所有账户入口有真实结果，不出现假保存或假同步。
- Native 云同步和账户页保持当前效果。

## 8. 阶段 5：代表性 AI 与临时录音

### 目标

在不建设长期用户数据系统的前提下提供能代表产品价值的 AI 功能。

### 主要工作

- 确认首版 AI 清单：查词、语法、润色、转写中的具体组合。
- Vercel Functions 接入外部 AI，复用现有领域资产和用户可见语义。
- 设置请求大小、并发、频率、上游超时和错误映射；不建设用户额度。
- 录音使用 private Blob 客户端直传。
- 校验 MIME、大小、session 归属和短期有效性。
- 转写成功/失败后删除对象，并增加过期对象兜底清理。
- AI 结果只按页面需要保存在浏览器，不保存长期服务端历史。

### 特殊规则

该阶段涉及录音或音频生命周期代码前，必须完整读取 `docs/guides/audio-lifecycle-and-change-rules.md`，复用现有 `AudioSessionOrchestrator`、recorder adapter、`RecordingRepository` 和 `RecordingAsset`。

### 验收

- 文本 AI 成功、失败、超时和上游不可用结果明确。
- 代表性录音长度不经过 Function body，转写成功。
- 成功、失败、取消和超时路径均能删除临时录音。
- 兜底任务能清理模拟遗留对象。
- 日志和存储不包含长期录音、完整历史或服务密钥。
- Native 音频门禁与要求的平台证据通过。

## 9. 阶段 6：全页面、网络与三端回归收口

### 目标

把“核心链路可用”收口为所有 Web 可见入口均真实、可理解，且 App 无回归。

### 主要工作

- 建立 `web-demo-parity-matrix.md`，逐页记录：共享、Web 适配、隐藏、降级。
- 检查全部路由、Modal、错误、空、加载和离线状态。
- 对照 App 截图检查共享页面视觉和固定手机画布。
- 运行浏览器网络审计，所有请求必须命中允许列表。
- 验证新浏览器、同浏览器 session 恢复、清数据、弱网和 ECS 断开。
- 验证 Web 内容版本显示和 App/Web 功能差异说明。
- 完成 iOS、Android 核心回归。

### 验收

- Web 明确显示“Web 体验版”。
- 未提供入口全部隐藏或说明，无无响应、假成功和 ECS 回退。
- 正常用户路径零 ECS/Supabase 请求。
- 完整题库与音频、代表性 AI 和本机学习记录通过。
- App 功能、视觉、构建、网络、音频和数据链路没有变化。

## 10. 阶段 7：Preview 验收与 Production 切换

### 进入条件

- 前六阶段全部通过。
- Production 域名、DNS、HTTPS 和 Vercel 环境变量已确认。
- 当前 Vercel Production deployment、内容 current 指针和域名配置均有回滚记录。
- 已明确公开 Blob 或 private Blob 决策。
- Production 邀请码管理责任人和应急停用方式已确认。

### 主要工作

- 从明确提交和明确内容 release 构建 Preview。
- 在至少一台新手机和一台电脑浏览器完成端到端验收。
- 执行 ECS 断开或网络阻断测试。
- 提升 Vercel deployment 与内容 release。
- 验证正式域名、HTTPS、安全头、Cookie、题库、音频、AI 和录音。
- 演练代码 deployment 回滚与内容 pointer 回滚。

### 验收

- 新手机能打开、输入邀请码并进入。
- 同一浏览器可以保持登录和本机学习记录。
- Web Production 运行时零 ECS。
- 代表性静态与动态功能通过。
- 回滚在约定时间内完成且不影响 App。

大陆网络仍可能存在地区和运营商差异；验收应记录实际网络、地区、设备、时间和结果，不写成“所有网络 100% 可达”的承诺。

## 11. 阶段 8：维护流程与收口

### 目标

确保以后 App 更新时 Web 有清晰、低成本的跟随方式。

### 主要工作

- 写 `content-sync-runbook.md`：App 内容发布后的一键 Web 镜像、验证、提升和回滚。
- 写 `web-runtime-runbook.md`：Vercel Functions、状态服务、Blob、日志、密钥轮换和故障处理。
- 固化 App 变更后的 Web 跟随分类：
  - 共享即可继承；
  - 需要 Web adapter；
  - 需要 Vercel Function；
  - Web Demo 不提供。
- 使用一次模拟 App 题库更新完整走通 Web 增量同步。
- 写 `closeout.md`，记录完成范围、证据、平台例外和剩余风险。
- 更新项目运行图和旧 `app-web-online-edition` 的适用边界。

### 验收

- 开发者不手工复制内容即可让 Web 跟随最新 App release。
- Web 可以晚于 App 发布，不阻塞 App 主线。
- 用户数据始终隔离。
- 文档、脚本、回滚、监控和责任边界完整。

## 12. App 更新后的 Web 跟随流程

每次 App 更新使用以下判断：

1. 变更是否只涉及原生能力；若是，Web 记录“不提供”或等价降级。
2. 变更是否涉及共享页面、组件、文案或纯业务规则；若是，Web Preview 验证继承结果。
3. 变更是否新增 ECS 接口；若是，判断 Web Demo 是否需要 Vercel 等价能力，禁止直接调用 ECS。
4. 变更是否涉及题库文本或音频；若是，App 先发布，再执行 `web:content:sync`。
5. 变更是否影响浏览器本机 schema；若是，增加兼容升级。
6. 更新 parity matrix，完成 Preview，Web 再独立发布。

App 发布成功不自动触发未经验证的 Web Production；自动化可以创建候选 Preview，但 Production 提升必须满足 Web 门禁。

## 13. 阶段文档与建议产物

```text
docs/workstreams/web-vercel-backend-split/
├── requirements.md
├── technical-plan.md
├── technical-audit.md
├── roadmap.md
├── network-boundary.md
├── capability-matrix.md
├── web-demo-parity-matrix.md
├── content-sync-runbook.md
├── web-runtime-runbook.md
├── phase-log.md
└── closeout.md
```

前四份属于大流程；其余文件在小流程逐阶段创建，不在本次文档任务中提前假写完成结果。

## 14. 路线确认门

用户已确认需求方向，但技术方案、公开/私有音频资源选择、首版 AI 清单和 Production 域名切换仍需确认。

本路线图确认后才进入阶段 0 小流程。确认路线不等于授权 Production 发布、域名切换、状态服务创建或任何 ECS 变更。
