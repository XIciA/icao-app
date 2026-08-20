# AI 学习运行时故障与排障记录

状态：历史记录，不是现行规则

本文保留已经验证过的诊断知识。文中的命令式表述只反映当时的排障方法；新任务应以当前
代码、当前证据和 `docs/rules/` 为准。

适用范围：Native App 的录音转写、语法纠错和表达润色。静态单词解释、900 句本地逐词比对和 Web 的独立实现不属于本文范围。

## 1. 文档职责与唯一来源

1. 本文是上述三项 AI 运行故障、诊断编号、线上验证和发布验收的唯一现行入口。
2. 产品效果案例由 [`docs/resources/ai/README.md`](../../../resources/ai/README.md) 路由；服务端实际 Prompt、Schema 和领域资产以 `services/api/src/ai/assets/` 及代码为准，本文不复制运行时 Prompt。
3. 新事故直接追加到本文；历史调查结束后移入 `docs/records/archive/ai/`，不得再建立平行的现行 AI 事故指南。
4. 修改 AI 能力、授权、API、模型、Prompt、Schema、转写格式或发布门禁前必须先阅读本文。

## 2. 唯一运行链路

```text
有效登录会话
  -> 当前账号 AI 同意幂等同步
  -> capability request
     -> transcribe: 已提交 RecordingAsset -> multipart upload -> Tencent ASR
     -> grammar: learner transcript -> DeepSeek grammar review
     -> polish: learner transcript -> DeepSeek OPI review
  -> 服务端结构校验与民航语义保护
  -> 脱敏 usage/error 记录
  -> 客户端只发布仍属于当前 generation 的结果
```

边界：

- 客户端不得持有腾讯或 DeepSeek 密钥。
- 转写只读取已经提交的 `RecordingAsset`，不得上传 recorder 临时 URI。
- 新请求失败、取消或过期不得删除已提交录音，也不得清除此前成功的 AI 结果。
- 用户切题、取消或 generation 过期属于安静取消，不显示为服务故障。
- 模型输出未通过 Schema 和民航关键实体校验时不得展示。
- 单词解释使用静态发布资产，不接入 AI 同意、模型调用、AI live 门禁或本文错误码。

## 3. 类型化错误与用户动作

客户端统一保留 `capability`、`stage`、稳定错误码、HTTP 状态、服务端 `requestId` 或本地 `A-xxxxx-xx`、是否可重试和建议动作。界面不得再把所有错误折叠为“AI 分析暂时失败”。

| 类别 | 代表错误 | 自动行为 | 用户动作 / 发布结论 |
| --- | --- | --- | --- |
| 登录 | `auth_session_expired`、HTTP 401 | 只刷新会话一次 | 仍失败则重新登录 |
| 同意 | `ai_consent_required` | 幂等同步当前政策一次 | 仍失败则重新确认；不得发送内容 |
| 网络 | offline、连接中断 | 不重复计费请求 | 用户手动重试并保留编号 |
| 限流/临时上游 | `ai_upstream_limited`、5xx | 服务端受控重试，客户端不自动连发 | 稍后手动重试 |
| 超时 | `ai_timeout` | 取消本次请求 | 手动重试；保留 requestId |
| 配置 | `ai_not_configured` | 不重试 | 发布阻断，运维修复 |
| 密钥/余额 | `ai_upstream_auth_failed`、`ai_upstream_balance_insufficient` | 不重试 | 发布阻断，运维修复 |
| 响应校验 | `ai_invalid_response` | 服务端最多一次修复性重试 | 仍失败则发布阻断 |
| 用户取消/过期 | `ai_cancelled`、stale generation | 安静结束 | 不显示服务错误 |

不得把上游原始响应、密钥、Prompt、录音、回答或用户身份写入客户端诊断、日志或反馈。

## 4. 安全诊断与关联

`A-xxxxx-xx` 是客户端同一次操作的关联编号；服务端 `requestId` 是 API 和 usage 记录的关联键。允许的诊断字段：

- App 显示版本、构建号、平台和系统大版本；
- `capability`（`transcribe | grammar | polish`）、阶段、稳定错误码、HTTP 状态和相对耗时；
- 尝试次数、是否可重试；录音侧仅允许受控的格式、字节数和录音器状态字段；
- `requestId` 或本地关联编号。

API版本、模型标识、Prompt版本、尝试次数、受控的上游状态类别和响应 Schema 结果只记录在服务端脱敏 usage/错误观测中，不进入客户端反馈诊断。本地诊断合同以 `FeedbackDiagnosticEvent` 和服务端严格白名单为准；文档不得自行扩展字段。

不允许包含录音、转写正文、回答、URI、题目、账号、Token、设备标识、Prompt正文或上游原始错误正文。

只有用户点击“提交诊断”后，才可把当前故障最多 30 条脱敏事件附加到反馈；客户端最多保存 50 条并在 24 小时后清除。提交成功后清除对应故障事件。服务端将用户主动提交的诊断与所属反馈工单统一保留 365 天，到期删除附件对象和整个工单，不能把诊断无限期单独保留。

## 5. 标准排障顺序

1. 固定 App版本、构建号、平台、API版本、账号登录状态和 AI 政策版本。
2. 用 `A-xxxxx-xx` / `requestId`确认失败能力和阶段；不能先改文案或增加重试。
3. 检查账号会话和当前服务端 AI 同意，排除换号或本地同意假阳性。
4. 转写先确认 `RecordingAsset`、MIME规范化、暂存对象、腾讯任务和临时对象清理。
5. 语法/润色先确认 mode、Schema、Prompt版本、模型、结构校验和航空关键实体保护。
6. 检查脱敏 usage/error 记录；数据库健康和环境变量存在只说明基础服务可用，不能证明真实上游调用通过。
7. 使用固定无个人信息样本运行真实线上验证；不得用 mock、历史成功记录或只读 readiness 代替。
8. 修复必须落入类型化错误、共享客户端映射、服务端边界、测试或发布门禁，不能只修改提示语。

## 6. 真实线上验证合同

发布前的 AI live verifier 必须使用临时测试账号和当前 AI 政策，完成后删除测试账号、同意、暂存录音及其它临时数据。输出的脱敏 JSON 至少满足：

```json
{
  "schemaVersion": 1,
  "kind": "ai-live",
  "status": "passed",
  "apiOrigin": "https://api.readyoufife.com",
  "apiVersion": "不可为空的生产 API 版本或镜像标识",
  "verifierFingerprint": "当前验证器与固定样本的SHA-256指纹",
  "verifiedAt": "ISO-8601",
  "checks": {
    "transcribe": true,
    "grammar": true,
    "polish": true,
    "aviationTerms": true,
    "temporaryAudioRemoved": true
  }
}
```

- `transcribe`：固定无个人信息 M4A航空英语样本产生非空转写。
- `grammar`：真实语法纠错通过公共 Schema。
- `polish`：真实表达润色通过公共 Schema。
- `aviationTerms`：呼号、跑道、航向、高度和不确定性没有被擅自改写。
- `temporaryAudioRemoved`：转写暂存对象已清理。
- 转写暂存对象必须使用本次 API `requestId` 前缀；请求 `finally` 立即精确删除，服务启动及每小时还会清理超过 24 小时的异常残留。验证器只允许删除并复查本次 `requestId` 前缀，禁止以全桶差异或清空存储桶伪造通过。
- 模型名称只能来自发布当日实际配置和官方资料，不在本文写死长期有效模型。

任一检查失败、证据超过 24 小时、API版本为空或临时数据未清理，都必须阻止 TestFlight/App Store/Android Release。
发布门禁还会在放行时重新读取生产健康接口的 `x-icao-api-version`；若线上版本与这份真实验证证据不一致，旧证据立即失效。

## 7. 自动测试与真机矩阵

自动测试至少覆盖：

- 登录刷新成功/失败、同意缺失和幂等同步；
- 401、余额不足、429、5xx、超时、断网、取消和过期 generation；
- M4A MIME规范化、上传失败和临时文件清理；
- 无效 JSON、缺字段、超长返回、Prompt版本不匹配；
- 语法和润色 Schema、呼号/跑道/高度/数字保护；
- 新请求失败时保留已有录音和已有 AI 结果；
- 本轮发布门禁只覆盖 Native 的转写、语法修正和表达润色。仓库中仍保留历史动态单词查询接口与缓存；它不是本轮三项关键能力的验收对象，不能把它的健康状态当作三项 AI 通过，也不得在本轮顺手删除或改写。

Development Build 与 TestFlight 真机分别验证：

- 同一录音可回放并真实转写；
- 代表性陆空通话/故事复诵完成语法纠错；
- 代表性 OPI 完成语法纠错和表达润色；
- 蜂窝网络、冷启动、退出重登和手动重试；
- 故障时显示可关联编号和明确动作，不泄露内部信息。

自动化、Development Build、AI live、TestFlight 四类证据必须分别记录，不能互相替代。

## 8. 当前 TestFlight 故障（2026-08-14）

- 现象：学习页面显示“AI 分析暂时失败，请稍后重试”。
- 已知事实：当前已安装的旧 TestFlight 客户端 catch 丢弃了服务端错误码和 `requestId`，该文案可能覆盖登录、同意、限流、余额、配置、超时或响应校验失败。
- 已排除项：API readiness 成功不能排除真实腾讯/DeepSeek调用故障。
- 当前代码候选：客户端类型化错误、精确诊断关联、服务端脱敏 usage 观测、真实三能力验证器和发布门禁已经实现并通过自动检查；尚未执行生产迁移/部署或上传新 TestFlight。
- 根因状态：未定；必须先对候选 API 进行迁移审查与真实线上三能力验证，再用同一代码候选的新 TestFlight 复现，不得根据旧统一文案猜测模型或网络根因。
- 发布状态：未通过。转写、语法和润色的 live证据与同一 TestFlight 构建真机证据齐全前，不得扩大测试或提交商店。

## 9. 发布前必读确认

每次 TestFlight、App Store或Android Release前必须：

1. 阅读本文和 [`docs/records/incidents/audio-recording/README.md`](../audio-recording/README.md)。
2. 用当前两份文档 SHA-256 生成阅读确认；任一文档变化后旧确认失效。
3. 运行真实 AI live verifier并保存上述合同证据。
4. 完成目标平台要求的真机矩阵。
5. 由关键能力发布证据工具绑定当前源代码/原生配置指纹、App版本/构建号、API版本和证据时间。

正式发布入口不得提供跳过这些检查的参数。

### 证据生成命令

以下命令只记录已经由人工或线上验证器真实完成的结果；禁止在未完成检查时执行：

```bash
# 1. 两份文档阅读确认（目标端分别确认）
pnpm release:critical acknowledge ios --operator '<操作人>' --confirm '我已阅读录音与AI两份关键能力文档'
pnpm release:critical acknowledge android --operator '<操作人>' --confirm '我已阅读录音与AI两份关键能力文档'

# 2. 查看必须逐项完成的真机检查名
pnpm release:critical list-device-checks

# 3. 每观察完成一项就单独记录；失败项必须写 failed，不能汇总成一句“全部通过”
pnpm release:critical record-device-check dev ios '<检查名>' --result passed --operator '<操作人>' --os-major '<iOS主版本>' --confirm '我已在真实设备完成并观察此项结果'
pnpm release:critical record-device-check dev android '<检查名>' --result passed --operator '<操作人>' --os-major '<Android主版本>' --confirm '我已在真实设备完成并观察此项结果'

# 4. 所有逐项记录均为 passed 后才可封存本轮 Development Build 证据
pnpm release:critical finalize-device dev ios --operator '<操作人>' --confirm '我确认逐项真机结果真实有效'
pnpm release:critical finalize-device dev android --operator '<操作人>' --confirm '我确认逐项真机结果真实有效'

# 5. 直接运行真实生产验证器并生成证据；不接受手写 JSON 或人工导入“通过结果”
API_BASE='https://api.readyoufife.com' pnpm release:critical run-ai-live

# 6. TestFlight 确切构建也按同一检查名逐项记录，然后封存
pnpm release:critical record-device-check testflight ios '<检查名>' --result passed --operator '<操作人>' --os-major '<iOS主版本>' --build '<app.json中的构建号>' --confirm '我已在真实设备完成并观察此项结果'
pnpm release:critical finalize-device testflight ios --operator '<操作人>' --build '<app.json中的构建号>' --confirm '我确认逐项真机结果真实有效'
```

发布入口自动执行验证，不需要手工运行：

- 首次 TestFlight：要求 iOS阅读确认、同一关键代码指纹的Development Build真机证据和24小时内AI live证据。
- App Store：在上述基础上，必须有与当前iOS构建号、应用标识和关键代码指纹完全一致的TestFlight真机证据。
- Android Release：要求Android阅读确认、同一关键代码指纹的Development Build真机证据和24小时内AI live证据。
- App Store提交：先执行 `pnpm release:ios:app-store`；它只验证当前源码、确切TestFlight构建和关键能力证据，不新建构建、不上传，也不代替App Store Connect中的人工提交。

证据保存在被Git忽略的 `.generated/critical-capabilities/`，不得提交包含操作人或设备系统信息的本地证据到仓库。
