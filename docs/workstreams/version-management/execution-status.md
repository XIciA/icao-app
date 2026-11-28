# 版本管理实施记录

更新时间：2026-11-28（北京时间）

## 与需求讨论任务的分工

用户最新明确：另一条任务负责需求讨论，可以只读审查代码，但只修改需求文档；本任务负责已确认方案的代码、配置、验证和清理。
本任务不再编辑共享的《icao-app版本管理需求文档.md》。此后的执行状态只写本实施记录。
`requirements.md` 是实施开始时的 V1.5 快照，不与另一任务竞争维护；新的需求以用户确认后的当前需求文档为准。
本任务不把另一任务的文档修改当作源码冲突，也不覆盖其更新。
尝试使用任务列表接口定位另一任务时接口报错；尚未实际发出协调消息，不能声称已经通知对方。

## 已完成的本地工作

- 基于核实的远端 main `7207bb90` 创建独立干净副本；本地 main / develop 同点起步。
- 实施分支 `feature/version-management`，当前提交 `ac9241f360e62874533073625118d1dac57a167a`。
- 分支规则、CI 范围、测试环境选择与正式候选校验已完成本地修改。
- 15 项针对性测试、发布配置检查、TestFlight 合同检查、shell 语法检查和差异格式检查通过。
- 清理 16 项已过时的 APK / IPA / Xcode 归档，合计 2,106,009,305 字节；保留源码补丁、验收材料及正式资源。
- 完整副本、可应用补丁和 Git bundle 已保存；原目录业务代码与 Git 元数据未重置。

## 交付位置

- 源码：`.generated/version-management-20261127/source/`
- 补丁：`.generated/version-management-20261127/version-management.patch`
- Git bundle：`.generated/version-management-20261127/version-management.bundle`
- 基线、校验摘要与提交记录：本目录 `handoff.json`、`production-baseline.json`、`local-cleanup.json`。

源码副本中只有 main、develop、feature/version-management 三条本地分支；没有伪造远端 develop 跟踪引用。
远端权限可用后，先读取真实 main 和其他任务的新修改，再正常整合补丁/分支，不能直接覆盖需求文档或强推。

## 尚未完成

- 服务器 SSH 连接被执行环境拦截：Operation not permitted。
- GitHub 插件无写权限；已通过本机 gh 创建远端 develop。实施分支仍因缺少 workflow scope 未推送。
- 原目录的 Git 元数据为只读；未对原 main 强制重置。
- 尚未部署独立测试 API / Supabase / 数据库，尚未核实或整理服务器备份，尚未清理服务器或原目录历史分支。
- 尚需完成客户端缓存和待同步记录的环境隔离，以及在线验收脚本的环境选择。测试发布暂时停止，不能自动落回正式服务。
- 未上传测试包、未执行全量 CI、未部署正式版本或修改正式数据库。

用户已给予执行授权；以上是当前会话实际访问能力与未完成工程项，不是等待用户重复确认。


## 权限排查与远端进展（2026-11-27，后续）

- 已确认本机 gh 登录 XIciA，仓库权限含 push / admin；原 GitHub 插件 403 不代表账号无写权限。
- 已通过本机 gh 成功创建远端 develop，指向 7207bb90775f9e91d7c0943c6af39af5770cbc6e，与远端 main 同点起步。
- feature/version-management 推送被 GitHub 拒绝：现有 OAuth 登录缺 workflow scope，不能更新 .github/workflows/ci.yml。此次推送未成功，未合并代码。
- 曾启动 gh auth refresh 官方设备授权流程；交接时已取消旧等待进程，最后核实仍缺 workflow scope。新会话需要时重新启动授权，不复用旧验证码。
- SSH 仍报 Operation not permitted；受支持的 require_escalated 请求也被执行器拒绝，明确原因是 sandbox_approval=false、request_permissions=false。
- 只读检查发现用户本机 config.toml 默认已经是 danger-full-access / never，但当前任务的有效执行策略仍是 workspace-write / restricted network；两者不一致。未修改客户端安全配置。
- 已查官方权限文档：桌面客户端的会话权限入口在输入框下方；可用选项取决于当前模式与策略。需要用户在受支持的界面调整当前任务权限，不能通过聊天文本授权或工具绕过当前限制。


## 已完成本地会话交接

用户决定新开本地会话。完整交接见 `LOCAL-SESSION-HANDOFF.md`；实施提交、补丁和 bundle 都已保存并校验，交接副本另存 `handoff-artifacts/`。再次核实远端 main 与 develop 均为 7207bb90，远端 feature/version-management 尚不存在。原会话不继续编辑共享需求文档。

## 本地接续：2026-11-27 19:00 北京时间

- 已通过密钥 SSH 连通 `readyoufife-prod-01`；生产 API / Ops / Supabase 容器健康，未重启。
- 用户完成 GitHub 官方授权，`gh auth status` 已确认 `workflow` scope；已有两个实施提交已推送到 `origin/feature/version-management`。main/develop 仍是 `7207bb90`。
- 备份 timer 最近一次 03:43 成功；另外生成本次迁移快照 `/opt/icao/backups/version-management-20261127/icao-20261127T105039Z-3021373.dump` 及 SHA-256 文件。
- 阿里云已新增 `test-api.readyoufife.com` / `test-cloud.readyoufife.com` A 记录，指向现有 ECS；原生产记录未改。域名配置截图在 `.generated/version-management-20261127/dns-testing.jpg`。
- `/opt/icao/testing` 已创建独立密钥、Compose、内部隔离网络及独立数据库容器；其余服务尚未启动，正在准备完整快照恢复和独立文件复制。
- 在现有 feature 副本完成客户端 SQLite、IndexedDB、Keychain、录音、会员内容文件目录的 testing 命名空间改动（尚未提交）；正式名字保持兼容。初步切换与清理测试、相关存储/认证/录音测试通过；类型检查通过。
- 完整 `pnpm check:ci` 已在独立副本启动，结果待核实。未生成 TestFlight、未发布正式版。

## 本地接续：2026-11-27 19:30 北京时间

- SSH 及 GitHub workflow scope 均已实测恢复；实施提交已推送 `feature/version-management`，草稿 PR #375 指向 `develop`。`main` 仍为 `7207bb90`，正式产品未发布。
- 独立测试栈已从正式快照 `/opt/icao/backups/version-management-20261127/icao-20261127T105039Z-3021373.dump` 恢复，SHA-256 校验通过。快照含 647 个 Auth 用户、18,053 条学习记录、118,379 条卡片状态及 61 条迁移账本。文件独立复制，无正式目录复用或硬链接。
- 测试 API `https://test-api.readyoufife.com`、测试 Auth/Storage `https://test-cloud.readyoufife.com` 均已配置 DNS 和有效 HTTPS。正式网关原内容完整保留，只追加两个测试虚拟主机并平滑 reload。
- 测试容器使用独立内网 `172.30.244.0/24`，固定测试 API `.10:3101`、Kong `.11:8000`；无对外路由。初始化角色密码、角色授权及内网入口已按实机结果修正。
- 真实测试号码登录、账号身份、会员查询、文档/学习记录/卡片状态同步、公开文件读取、测试令牌被正式 API 拒绝、正式库无测试标记、正式四个核心容器 ID 与启动时间不变均通过。证据 `/opt/icao/testing/verification.json`。
- 客户端 SQLite、Web IndexedDB、Keychain、录音、离线内容和更新清单已分环境；切换后的待同步数据不会共用。测试离线签名公私钥独立。
- 测试副作用限制：没有复制正式外部供应商密钥；真实短信、支付、第三方登录、付费 AI 关闭。新增测试数据环境后台任务停用保护，8 个生命周期测试通过。不能把这些关闭的能力写成真实功能验收通过，关键能力发布门禁仍保留。
- 第一轮 GitHub 全量 CI（319e57f2，run 45989011709）成功：本地客户端 289 套件 / 2,054 测试，API 90 个文件 / 837 测试通过。最新实机修正 620bc62d 正在跑 CI；未合并、未执行 develop 精确提交部署。
- 已删除 7 个确认无运行引用的旧 API 镜像，保留当前 API 和最近两个回滚镜像；未删卷、正式数据、正式存储或定期备份。记录 `/opt/icao/testing/obsolete-api-images-cleanup.json`。
- 原项目和旧 linked worktree 仍有历史未提交材料，未 reset/clean；64 个需求文件及附件已做保留清单。另一条任务需求文档未改写。下一步在 CI 成功后合并、部署测试提交，再迁入原项目入口并封存旧工作目录。

### 19:34 补充验证

独立摘要密钥要求同步重建恢复账号的身份映射，已新增仅连接测试容器的 rekey 脚本，重建 543 条身份，未缺失可恢复主体。恢复的已有会员账号通过真实密码登录、同账号 ID 和有效会员权益查询；验证期间只临时调整测试副本密码，随后恢复原测试密码摘要。正式账号未修改。测试文件、学习记录和卡片状态读写均已通过；TestFlight 与真机验收仍未执行。

## 迁移收尾：2026-11-27 19:50 北京时间

以下状态取代本文件前文的“尚未合并 / 尚未部署 / 原入口待迁入”等阶段性待办。

- **远端整合已完成：** PR [#375](https://github.com/XIciA/icao-app/pull/375) 经最终 [CI 45992015150](https://github.com/XIciA/icao-app/actions/runs/45992015150) 成功后合入 develop，提交 `3e7a64e6f86b7b82100eb6b4595908851cf654fe`；实施 feature 分支已删除。main 仍为 `7207bb90775f9e91d7c0943c6af39af5770cbc6e`。
- **测试部署已完成：** 从干净 origin/develop 归档，SHA-256 `6ad202ed07e59fa0869fa22db6909986c5e942da00a4af5e448f80d335959f4e`；镜像 `sha256:2fb0fa75422b92287acc2893f17168fb4ff2aa00fb7a8bfcb2ccf84df4fd99cb`。测试库候选迁移前后均为 `applied=61 pending=0 drift=0`，迁移命令成功，没有新增结构变更。
- **部署后验证已完成：** 新测试号码登录、恢复会员的账号/权益、学习记录/卡片/文档同步、公开文件、私有文件上传/签名读取/清理、正式库无测试标记、测试 token 不可用于正式 API、禁止外联和宿主机主动连接均通过。新测试 API 没有启动后台任务。服务 HTTPS 响应标识 `testing-3e7a64e6f86b`。
- **客户端构建已验证：** 测试配置的 Expo Web 导出成功，产物包含测试域名及测试存储命名空间。全量 CI 和环境单测不代替原生真机切换验收。
- **本地入口已迁入：** 当前 `/Users/zhouyide/Desktop/icao-app` 为原独立副本。64 个需求文件及附件原件迁回当前路径，摘要逐一核对未变；原代码、index/refs/reflog、旧 linked worktree 和独有历史材料封存于 `/Users/zhouyide/Desktop/icao-app-pre-migration-20261127`。未将旧实验整批提交，也未覆盖另一任务的需求。
- **清理已完成：** 活动工作树只保留当前项目；移除两个旧依赖目录（各约 1.1 GiB，可按锁文件重装），原始音频和资源保留。原先 16 项旧安装包约 2.11 GB 的删除记录继续保留。服务器删除 7 个已确认无运行引用的旧 API 镜像和本轮临时测试构建镜像/上下文；保留当前正式镜像、回滚目标、全部正式卷和备份。
- **正式服务复查正常：** 正式 API、网站、公开文件均 HTTP 200；生产 API、DB、Auth、Storage 容器 ID 和启动时间与本轮基线一致；原库 61 条迁移记录不变，647 个 Auth 用户保持。正式网关仅追加测试虚拟主机并平滑 reload。
- **后续限制明确：** 没有提升版本/build，没有 TestFlight 上传、App Store 审核或新正式产品发布。测试付费 AI、真实短信、支付与第三方登录仍关闭，缺少真实关键能力证据时构建交付门禁仍生效。后续正式发布仍由用户明确发令。

机器可读结果见 [verification-20261127.json](verification-20261127.json)。测试环境凭据仍只在服务器 `/opt/icao/testing` 和本地 0600 环境文件；不得提交。
当前项目保留另一任务的两份已跟踪需求修改，以及三组未跟踪需求资料，这些是有意保留的文档工作，不作为本次代码遗漏。历史开放 PR 和归属未确认的远端旧分支没有擅自删除；其本地历史已封存。


## 完整测试环境迁移收尾：2026-11-28

用户收敛本轮范围：复用现有完整代码及账号配置，保持功能一致及正式数据隔离；不再安排真实短信、付费 AI、真实付款、真机联调或 TestFlight 构建上传。以下状态取代前文“测试外部能力关闭”的阶段结论。

- PR [#377](https://github.com/XIciA/icao-app/pull/377) 已合入 develop，测试部署精确提交 `4f186e3036e583791a6d39c36dbd8fa4d4fb6d0a`，API 标识 `testing-4f186e3036e5`。本地 `pnpm check:ci` 和 [GitHub CI](https://github.com/XIciA/icao-app/actions/runs/45999846822) 通过；客户端 2054 项、API 848 项测试通过（API 原有 3 项跳过）。测试库迁移检查 `applied=61 pending=0 drift=0`。
- 测试 API 使用 `NODE_ENV=production` 运行完整业务与后台任务，`ICAO_DATA_ENVIRONMENT=testing` 标记独立数据。AI、阿里云短信、Apple/微信登录、Apple 内购及微信支付复用现有账号配置，已逐项对比配置值一致；不重写业务实现。
- 数据库、存储、会话 JWT、内容签名及 Apple 凭据加密保持独立。为保留 155 个已恢复微信账号的身份映射，复用身份摘要配置并重建测试账号摘要。先备份并清除测试快照中的可重放支付尝试、通知队列及旧认证流程数据，避免历史操作重放；正式数据未写入。
- 短信移除固定验证码，启用真实短信 hook；内部 hook 只指向测试 API。微信支付使用测试通知地址。Apple 沙盒通知改为 `https://test-api.readyoufife.com/v1/commerce/apple/notifications/v2`，正式通知地址及版本核对未变。
- API/Auth 拥有受控公网出口；测试数据网络仍独立。宿主机隔离脚本保留启动时持久化，并兼容在 Docker 启动前创建其用户防火墙链。
- 已核对全部测试服务运行、完整配置解析通过、测试公网健康正常、正式服务健康正常；生产 API、DB、Auth、Storage 等原容器 ID 和启动时间均与迁移基线一致。正式 main 及正式产品未发布，另一任务需求文档未覆盖。
- 按最新指令未执行真实短信、付费 AI、付款、真机登录或测试包上传，不将“配置迁移完成”记作这些业务已经实测通过。前一阶段已预留 build `3596177`，本轮未生成或上传对应包。

精确制品及核对结果见 [full-runtime-20261128.json](full-runtime-20261128.json)。服务器保留 `/opt/icao/testing/full-runtime.json`、`full-runtime-verification.json` 和启用前的受保护备份。后续正常开发使用同一套业务代码；正式发布仍由用户明确发令，并保留正式环境持续产生的数据。
