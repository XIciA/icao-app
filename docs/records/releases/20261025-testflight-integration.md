# 2026-10-25 多任务整合与 TestFlight 交付

状态：1.3.10 / 3583787 已上传 TestFlight，Apple VALID，内部“测试”组 IN_BETA_TESTING；生产 API 已按本轮明确授权部署，线上权限与真实 AI 检查通过；用户真机体验待验。

## 已核对的基线

- 用户要求协调截图中的任务，将已实现的新改动整合并上传最新 TestFlight。本轮最终交付目标为 iOS 测试版，不提交 App Store 正式审核。
- Apple 查询确认上一可用候选为 1.3.7 / 3583088，Build ID `fdb062b1-be32-4c9e-aacb-76a7192c3463`，状态 VALID、未过期。
- 源码基线 `39c51b13927a0652c5049779b318ee62bad6a965`，来自 `origin/main`。原始工作目录停在旧任务分支且有其他修改，整合使用独立工作区，不挪用或清理其他任务文件。
- 整合 [PR #248](https://github.com/XIciA/icao-app/pull/248) 已合入 `origin/main`，候选源码 `34f0c4ed699fc35ea5ea5b33d3a405434d33c77e`。发布 clone 为干净 `main == origin/main`；与已通过检查的整合头 `e450a9816ea203832a467cabeb8983f44d9c2384` 完整代码树一致。

## 改动清单与交叉核对

| 对应任务 | 已进入主干的实现 | 集成关注点 |
| --- | --- | --- |
| 修复学习页面与教程问题 | #240 学习反馈、听力显示、共享弹层退场；已随 1.3.7 交付 | 保留既有修复、稳定题目 ID 与学习记录 |
| 梳理使用指南交互方案 | #243 指南生命周期与步骤统一；#244 测试环境引导重置 | 真实页面锚点、弹层切换、账号隔离与正式环境隐藏测试入口 |
| 解释已学与已完成卡片区别 | #245 我的页备考设置及分题库进度；#247 分类语义图标 | 过滤范围下的进度、会员目录身份、航空公司标志 |
| 规划全部题库接入随身听 | #246 五题库播放、参考答案与翻译、OPI 图片、时长索引 | 账号/会员/范围切换、延迟加载、图片权限及原题跳转 |
| 调研高级登录页面参考 | #249，提交 `df1d44e0` 与 `38dd2b18`，由本轮整合 PR #248 统一合入 | 游客记录与录音归属、登录/购买目标恢复、发现页会员门禁、服务端兼容 |

- 发现一个跨任务遗漏：随身听已支持五个题库，教学仍枚举旧三个题库。本轮改为“在这里切换要收听的题库。”，并同步唯一指南步骤说明。
- 本轮未修改权威题库、音频/图片路径、学习数据 ID 或数据库迁移。登录任务调整的是免费清单派生、客户端公共目录和服务端权限；题库源不变。
- 登录任务审查识别并修复三项风险：保留签名凭据 `content-access-v2`，将免费选择规则与目录缓存独立升级；以账号归属的待认领快照支持游客合并中断后幂等重试；登录期间通过现有 RecordingRepository 保留实际录音资产，并一次性交接原题、作答与会话。已有真实 WAV 文件、浏览器录音 URL 保留/清理及学习会话恢复测试；这不代表手机麦克风已验收。
- 交叉导航修复：目的地使用本路由参数，会员门禁仅在页面聚焦时跳转，并防止重复进入登录页；回归覆盖后台页面不抢占导航。
- 最后修复了游客触发 AI 登录前保存失败的路径：捕获本机交接失败并显示重试提示，保留当前页面、录音与作答；保存成功后再跳转。`38dd2b18` 的 34 项相关测试和类型检查通过。
- 原计划使用普通 merge 保留父提交关系，但 GitHub 仓库仅允许 squash，平台拒绝了普通合并。因此 PR #248 改为 squash 合入，并完整记录原任务提交 SHA；合入后核对整合头与主干完整代码树一致，原任务 #249 按已被整合收口。没有修改仓库合并设置，也没有重写已发布提交。
- 只读核对生产 API 为 `guide-20261022-41fd90d4`。数据库五题库 active release 均为 v26；将本地正式内容通过现有 `prepareNativeContentRelease` 规范化为原生资源路径后，五份摘要与生产完全一致。游客免费清单可以直接从既有 active release 派生，不需要重新发布题库或数据库迁移；新路由及权限已在用户明确授权后随本轮 API 部署。

## 验证证据

- 已恢复本机现有备份中的缺失媒体，未从旧实现拼装发布源码。`question-bank-content.mjs check --full` 通过：5 题库、30 分类、568 话题、10,900 卡片；12,651 个媒体资源的大小和 SHA-256 均与清单一致，总字节数 1,705,099,521。
- 初步 `pnpm check:ci` 通过：前端 230 套件 / 1,573 项、API 67 文件 / 682 项；类型检查通过，ESLint 0 错误 / 19 个既有警告。此项不替代正式发布所需的 `pnpm check`。
- 初次执行发现 pnpm 在 CI 与非 CI 环境间切换会改变 `enableGlobalVirtualStore` 并自动刷新依赖。已撤回自动产生的锁文件改动，用 `CI=true`、冻结锁安装和 `pnpm_config_verify_deps_before_run=error` 统一后续检查/发布环境；不将依赖升级混入本轮。
- 冻结锁环境下完整 `pnpm check` 通过（北京时间 2026-10-25 02:46）：前端 230 套件 / 1,573 项、API 67 文件 / 682 项；内容、类型、静态和发布配置检查通过。其后已完成登录合入后的完整检查与最终发布门禁，见下。
- 最终整合的完整 `pnpm check` 通过：前端 231 套件 / 1,586 项、API 68 文件 / 688 项，类型、内容、音频及发布配置检查通过；Lint 0 错误 / 34 项测试文件警告。权威题库和媒体清单相对已完成 SHA-256 校验的基线没有变化。
- [CI 40125978506](https://github.com/XIciA/icao-app/actions/runs/40125978506) 全部通过，包括数据库约束、仓库检查、无 TS 加载器合同及 EdgeOne 导出；TestFlight 构建前聚焦录音 15 套件 / 191 项通过。
- 脱敏本机证据保存在 `/Users/zhouyide/.codex/icao-guide-release-20261022/.generated/release-integration/`。归档准备时，旧 AI-live 证据在 24 小时内，验证器指纹与当时旧 API 版本相同，用于本地归档准备；不是新 API 部署后的真实能力验收。部署后已生成新 API 的真实 AI-live 并通过实际发布门禁，见下。
- 候选正式 Bundle ID、版本、签名及生产运行时校验通过；归档隐私与 SDK 审计通过（11 份隐私清单、3 份内嵌代码）。Apple altool 于北京时间 2026-10-25 04:02:38 返回 `VERIFY SUCCEEDED with no errors`。

## 交付与回滚

本轮 iOS 测试版已实际可供内部测试，只有 `ios-testflight` 渠道清单更新；没有提交 App Store 正式审核。测试交付完成与用户真机验收分别判断。

### 已交付的 iOS 制品

- 源码 `34f0c4ed699fc35ea5ea5b33d3a405434d33c77e`；Bundle ID `com.readyoufife.ios`；1.3.10 / 3583787。
- Release 归档：`/Users/zhouyide/.codex/icao-guide-release-20261022/.generated/testflight/ICAO-3583787-prepared.xcarchive`；导出 IPA：同目录下 `export-3583787-prepared/app.ipa`。
- IPA 为 40,900,400 字节；SHA-256：`06facfee43298a7bf75402cd4f2222dabaacc5ceac24d00809e4be8e238cba75`。候选源码与录音关键代码指纹保存在 `.generated/testflight/candidate.json`，归档审计在 `archive-audit-3583787-prepared.json`。
- 归档本体明确返回 `ARCHIVE SUCCEEDED`，标准归档验证完成。首次启动器在子进程运行期间被编辑，返回后因读取偏移出现末尾命令错误（外层返回 127）；这不是 Xcode 编译失败。随后独立完成了身份/签名检查、归档审计、`EXPORT SUCCEEDED` 与 Apple 完整校验，没有重建或修改已归档源码。
- Apple 上传于北京时间 2026-10-25 13:06:56 返回 `UPLOAD SUCCEEDED with no errors`，随后 API 查询确认 Build ID `f01521d9-a627-47b5-9f93-99b894e9ad96`、版本 1.3.10 / 3583787、processingState=VALID、expired=false、internalBuildState=IN_BETA_TESTING。既有内部“测试”组（hasAccessToAllBuilds=true）已有权限，分组工具确认无需新增关联。
- annotated tag `release/ios-testflight/v1.3.10-b3583787` 指向上述精确源码并已推送。只更新 `ios-testflight` 清单，公开读取确认 1.3.10 / 3583787 与审核的渠道 JSON 完全一致；其余 `ios-app-store`、`android-apk`、`android-test` 三项与发布前逐项一致。服务器清单备份 `/opt/icao/backups/updates-testflight-3583787/updates-before-20261025T050927611459Z.json`。
- 回滚/旧测试目标仍为已有 TestFlight 1.3.7 / 3583088；当前 iOS/Android 正式渠道与 Android 测试渠道未修改。发布前后清单和 Apple 可用性证据保存在 `.generated/release-integration/evidence/`。

### 已部署的生产 API

- 用户在本轮明确答复“授权部署 API 并继续 TestFlight（推荐）”；授权问题已说明共享 API 对旧客户端的免费内容与发现页会员规则影响。
- 使用既有 `scripts/deploy-api-release.sh` 从干净 `main == origin/main` 的 `34f0c4ed` 构建。发布 ID `login-integration-20261025-34f0c4ed`，实际容器启动于 `2026-10-25T04:17:45.964Z`（北京时间 12:17:45）；不可变镜像 `sha256:9879dbbfcfe71ce43ecb58bbce67da3ec2c3fdde378d61f8989b37a650820819`。
- 源码包 SHA-256 `b9d5eef9187846140d2b75cb76f39de2f78b5ab82d413704b9a2a55d23459461`，服务器读取值一致；运行源码目录与发布源码目录完整比较一致。annotated tag `release/api-production/20261025-34f0c4ed` 已推送，指向精确源码。
- 本机 SSH 在最后镜像阶段中断，外层发布命令返回 1，清理重连也受网络影响；服务器端继续完成了正式发布。恢复连接后确认新 release header、容器镜像/健康、完整运行源码、原镜像备份及临时密钥清理，并重新运行 `verify-live.mjs` readiness 验证。没有盲目重复部署或覆盖备份。
- 回滚备份目录 `/opt/icao/backups/api-login-integration-20261025-34f0c4ed` 保留旧镜像身份、Compose 与受保护运行配置；旧 API 为 `guide-20261022-41fd90d4`，不可变镜像 `sha256:8dbedcdd6db418bf4008adba8868db770fca2ed51d05b839009b4ea2056de379`。
- 线上免费卡片 ID 集合逐项比对本地规范化正式题库：listening 40、sentences900 900、radiotelephony 18、OPI 23、storytelling 3；免费话题和音频解析成功，完整音频下载 175,532 字节及 SHA-256 一致。受限 OPI 话题/媒体为 403，无效 bearer 为 401，匿名 sandbox 为 403，匿名发现页文章/词书为 401；目录仍声明 `content-access-v2`。本机验证脚本初次错误要求每个路由都有仅健康接口提供的 release header，修正该断言后通过，不涉及业务源码修改。
- 新 API 的真实 AI-live 于 `2026-10-25T05:04:51.516Z` 通过：语音转写、语法反馈、润色、航空术语及临时音频/测试账号清理。通过原有真实验证器在生产容器环境执行生成工具，再取回生成证据；未手写通过结果。验证器指纹 `a679c49b56b71d035de13f72064c40e991279bcf554a4c7f70dd223a7bde14a5`，本机 TestFlight 关键能力门禁通过。
- 生产迁移台账复核 applied=55、pending=0、drift=0，只读检查未执行迁移。五题库 active release 保持 v26，摘要与本地一致；应用内容保持 v31 / `9b54adce11b8ab626c8e213c82d5972e826f1be55593f063459b4b940b381d36`。发布入口保留既有 active 内容，因此没有内容激活检查点文件；未重发题库或回退运营内容。

### 交付边界与收口

- 代码整合、完整检查、生产 API 部署与线上验证、Apple 归档/校验/上传、内部测试组可用性和测试渠道更新已完成；发布证据文档通过 [PR #250](https://github.com/XIciA/icao-app/pull/250) 归入主干。
- 本轮没有提交 App Store 正式审核，没有构建 Android 或部署产品 Web；旧正式渠道保持原状。
- 手机麦克风/耳机/中断恢复、Apple/微信真机登录、游客跨登录录音与学习记录实际体验、真实购买与恢复购买仍待用户在新 TestFlight 验收。真实服务器 AI 检查通过不替代这些真机结果。
- 原始工作目录的其他任务分支和修改保留；本轮自身分支/工作区按 PR 收口清理。归档、IPA、完整媒体检查与脱敏发布证据保留在独立发布 clone，清理整合工作区不删除交付制品。
