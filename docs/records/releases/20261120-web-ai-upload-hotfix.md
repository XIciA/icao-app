# 2026-11-20 网页 AI 录音上传最小修复

## 第一轮交付（15:39；用户随后反馈仍失败）

- 用户授权：仅修复网页 AI 评分故障并上线，保持其他功能；会员与学习记录问题不在本次范围。
- 源码：[PR #369](https://github.com/XIciA/icao-app/pull/369)，干净 `main / origin/main` 提交 `e63998d2c027204fe060436e5c4cbd430239eebc`。
- 平台：EdgeOne Production / `readyoufife.com`；deployment `dpdm3apqhtfg`。
- 版本保持 1.3.2；annotated tag：`release/web-edgeone/20261120-e63998d2`。
- 2026-11-20 15:39（北京时间）公网核验通过；真实用户设备上的录音评分仍待用户验收。
- 回滚目标：上一 deployment `dpq5dl5b2k7g`，标签 `release/web-edgeone/20261113-89d46fd2`。

## 最小变更

1. Web 音频适配器按共享合同接收所选 ASR 模型，并在音频之前写入 multipart `model` 字段；保留音频内容、文件命名和传输方式。
2. 将 `invalid_asr_model` 映射为配置异常与提交诊断提示，避免误导用户反复检查网络。
3. AI 诊断入口携带题库、分类、话题、原始题目和版本摘要；没有题目来源时使用通用反馈入口，保留诊断编号和来源页面。

没有修改或部署 API、数据库、会员、学习记录持久化、录音引擎、纯文字评分接口、依赖、iOS 或 Android 安装包。新增的两处共享 AI 展示逻辑本次仅随 Web 发布。

## 验证证据与边界

- 冻结仓库依赖后 `pnpm check` 完整通过；媒体检查使用本机已验证媒体缓存。客户端 288 套 / 2,049 项测试通过；API 837 项通过、3 项既有跳过。新增的录音上传、异常提示与诊断入口回归已包含其中。
- [GitHub CI](https://github.com/XIciA/icao-app/actions/runs/44695352044) 的数据库约束、完整源码检查、contracts 和 EdgeOne 导出通过。
- 导出 190 文件 / 39.6 MiB；候选与主干正式重建的入口脚本一致。与原线上包相比，两者均含 1,941 个模块，仅上传适配器、AI 错误提示和学习工作台三个模块不同。
- 用实际导出适配器生成 multipart 请求，经线上容器中独立实例的 Fastify 解析器与已部署 controller 验证：WebM / Ogg / MP4 / WAV × 转写 / ATC / story / OPI 共 16 项通过；使用 provider stub，无真实 AI 调用或业务数据写入。
- 已部署反馈 schema 拒绝旧缺题目信息的学习诊断；修复后的题目诊断和无题目来源的通用诊断均通过校验。
- 公网 `/`、`/download`、`/auth` 返回 200 且引用新脚本；脚本与正式产物逐字节一致，SHA-256 `0dd09000e75c67fba9aacb504d7acc16bbc4c3cd7022b9929ad9f87aad2453c3`。Chrome 实际打开首页并确认加载新脚本。
- 课程 JSON 发布前后摘要一致；API 版本仍为 `ai-output-20261113-bd9b8988`，API / 数据库健康正常，AI 跨域预检 204。
- 以上证明已确认的上传漏参与诊断合同缺陷已修复，不代替用户麦克风录音到真实 AI 返回的完整验收；未将截图那次缺少关联请求的失败断言为唯一根因。

本机详细检查、模块比对、生产产物与发布结果保存在 `/Users/zhouyide/.codex/artifacts/web-ai-hotfix-20261120/`；私有发布日志不入库。

## 第二轮交付（18:19；当前线上版本）

- 用户提供 Safari 仍失败的截图（`A-0KX5M-8A`），在冻结后的只读排查完成后明确要求“执行修复”。范围仍仅限网页 AI 评分。
- 源码：[PR #371](https://github.com/XIciA/icao-app/pull/371)，干净 `main / origin/main` 提交 `00cf207cb9bd82d3ce619e2e338c757ccc0e0604`。
- EdgeOne Production deployment：`dpyaf9gtpk7d`；annotated tag：`release/web-edgeone/20261120-00cf207c`；版本保持 1.3.2。
- 2026-11-20 18:19（北京时间）公网核验通过；回滚目标为第一轮 deployment `dpdm3apqhtfg` / tag `release/web-edgeone/20261120-e63998d2`。

### 原因与最小改动

网页上传适配器将浏览器原生 `fetch` 直接作为对象属性返回，共享客户端随后调用 `upload.fetch(...)`，使调用对象变成上传描述对象。浏览器对原生方法的调用对象有约束，此路径会在请求发出前产生 `Illegal invocation`。Node 的 fetch 不具有相同约束，第一轮 multipart/服务端 stub 验证未覆盖这个浏览器调用问题。

本轮只将 Web 适配器中的 `return { fetch, form }` 改为 `return { fetch: fetch.bind(globalThis), form }`，并增加转写、转写并评分两条路径的回归测试。保留 multipart 模型字段、录音数据、请求头、取消信号及返回结果；没有改动原生上传适配器、录音引擎、会员、学习记录或后端。

只读生产日志在排查时间窗口内能看到 AI consent / operations 请求，但未见 AI 上传 POST；另一份已提交诊断也无 HTTP 状态和服务端 requestId。这些证据支持“请求未到达 API”的阶段判断，但该诊断编号不同于截图，不能冒充截图那一次请求的逐条关联证据。

### 验证与边界

- 按浏览器调用对象约束模拟的回归在旧代码下两条路径均失败，修复后通过。36 项聚焦测试和类型检查通过。这是确定性合同测试，不是真实浏览器麦克风验收。
- 冻结依赖后的完整本地 `pnpm check` 通过，使用完整已验证媒体源；客户端 288 套 / 2,051 项通过，API 837 项通过、3 项既有跳过。
- [GitHub CI](https://github.com/XIciA/icao-app/actions/runs/44716446483) 的数据库约束、仓库检查、contracts 和 EdgeOne 导出全部通过。
- 候选和干净主干重建均导出 190 文件 / 39.6 MiB，入口脚本一致；与第一轮线上包相比，1,941 个模块中仅 Web 上传适配器一个模块变化。
- EdgeOne 刚返回成功时仍短暂读到旧页面；继续核验后 `/`、`/download`、`/auth` 均返回 200 并引用新入口 `index-bb4b3c45782f79a0e85eab106a3ecf18.js`。公网脚本与正式产物逐字节一致，SHA-256 `51d0dd9218561b8ef392ba5c406532da4dcf60868050b28ff4b83c4416d668e1`。
- Chrome 新标签页实际渲染首页、恢复已有登录并加载新脚本；保留原失败页及录音，没有刷新或处理用户录音。
- 课程 JSON 摘要仍为 `d84b2df1396cb3b57bd9ee428fec1e96b42bcb95b4debdb90cfd360daa3ab706`；API 仍为 `ai-output-20261113-bd9b8988`，API 和数据库健康正常。本轮仅部署 Web，无 App 构建、API 部署或数据库迁移。
- **用户实际录音到真实 AI 返回的完整验收仍待完成。** 已请用户在新标签页重新录音评分；旧页面仍运行旧脚本，不能直接用旧页重试判断新版结果。

本机本轮证据、正式产物与私有发布日志保存在 `/Users/zhouyide/.codex/artifacts/web-fetch-fix-20261120/`。原工作区的既有修改未纳入修复；代码通过临时隔离副本完成验证与发布。
