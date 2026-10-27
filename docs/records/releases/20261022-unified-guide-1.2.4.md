# 统一指南与首次引导 1.2.4 交付记录

日期：2026-10-22。源码 PR：[#228](https://github.com/XIciA/icao-app/pull/228)。发布源码为 main 提交 `41fd90d4b2aa33ecc5749e018c4d4d5c11fb06b2`；独立发布副本与已验证任务分支的 Git tree 相同。

## 功能与边界

主动使用指南、首次使用引导共用教学引擎和步骤定义，采用细线聚光灯；固定 Sentence1/Maintaining 示例和独立旧进度逻辑已清理。能力按真实题目提供，跳过关闭教学并保留当前页面，手动入口可重学。

进度按账号保存在本机，未扩展云同步。自动引导只对注册时间不早于 `2026-10-22T08:00:00Z` 的账号开放；老账号仍可手动打开指南。重装或换设备后的跨设备去重不在本次实现范围内。

用户明确授权配套 API 部署；测试渠道及产品 Web 交付依据产品更新流程。未提交 App Store 正式审核，未替换 Android 正式下载。

17:30 收到统筹任务安排后继续完成已经启动的本批次，不再独立启动下一批发布。本批次只代表 `41fd90d4` 已含的改动；之后的导航补漏、七页 UI、E 图标等整合和模拟器实际验收由统筹任务完成，不能把本批次记为六项任务全部完成。

## 验证证据

- 完整 `pnpm check` 通过：前端 204 个测试集、1,385 项；API 67 个测试集、682 项；类型和合同检查通过。
- 13 项 Vercel 冻结检查通过，旧页面和构建链路保持冻结；产品 Web 经现有 EdgeOne 选择路径使用新版。
- [GitHub CI](https://github.com/XIciA/icao-app/actions/runs/39750890201) 通过。
- 历史媒体使用已恢复目录，并按 SHA-256 匹配本地文件；缺失的 46 段近期 OPI 音频从既有存储读取，大小与 SHA-256 均验证通过。只补齐本机校验输入，未发布或修改题库内容。
- 实际线上临时账号验证 `/v1/account` 返回有效注册时间；真实转写、语法纠错、表达润色及航空术语保护验证通过，暂存音频与临时账号清理完成。

## 渠道交付

- API：`guide-20261022-41fd90d4` 已切换并通过公网健康检查。只读 schema 检查为 CURRENT；无迁移，现有内容版本 31 保留。标签 `release/api-production/20261022-41fd90d4`。
- EdgeOne 产品 Web：deployment `dp447qbag0n7` 已成功部署。公网首页脚本 SHA-256 与本地构建一致，`/download` HTTP 200。标签 `release/web-edgeone/20261022-41fd90d4`。
- Android：独立测试包 1.2.4 / 3580360，包名 `com.readyoufife.app.test`，签名及内嵌运行时检查通过。APK SHA-256 `899c4b95ca1bdc132dee36b88091a7ebc6dbc6ef26d22970a0ab817bd50bd8ac`；测试渠道已发布，公网 APK 摘要校验通过。官网 `/download` 已用浏览器确认测试入口指向 1.2.4，正式入口仍指向 1.2.1；标签 `release/android-test/v1.2.4-b3580360`。
- iOS：1.2.4 / 3576435，正式 Bundle ID `com.readyoufife.ios`；Archive、IPA 导出及 Apple 校验通过；既有上传完成，Apple API 复核 processingState 为 `VALID`，marketingVersion 为 1.2.4，build 为 3576435。后台已有 1 个内部组关联。按统筹要求，在传输完成后终止后续脚本步骤，未主动执行 assign-groups、未更新 ios-testflight 渠道清单、未提交商店审核。标签 `release/ios-testflight/v1.2.4-b3576435`。

## 用户验收

代码检查和发布验证不等于真机验收。待用户验证高亮定位、长按查词、学习回顾、侧滑与页面拖动、弹层和键盘、跳过后留在原页、首次触发及跨题库去重。录音、评分和系统权限的真机体验仍需随候选包确认。

## 版本基线说明与统筹复用

用户随后在统筹聊天澄清“最新测试版本是 1.2.2”。本任务升到 1.2.4 的直接依据是实施前主线 `c3143e10` 的 `app.json` 与 `src/config/app-version.ts` 均已为 1.2.3；源码版本不等于此前实际测试渠道版本。本批次的实际发布状态以上文证据为准，不再另行改号或启动批次，用户最终明确要求全部内容保留、最终整合版本统一改为 1.2.2，内部 build 继续递增；由统筹实施，不由本任务重复构建改号包。

仅记录工具与受控路径，不记录配置值或凭据：

- 发布副本：`/Users/zhouyide/.codex/icao-guide-release-20261022`，main 源码 41fd90d4；APK、IPA、Archive 与本地发布证据位于其 `.generated/`。
- EdgeOne：`scripts/lib/release-common.sh` 读取已有正式运行配置；`pnpm web:edgeone:export` 导出；本轮使用 EdgeOne CLI 1.6.45 执行 `npx edgeone makers deploy dist -n tingniwuge-web -e production --skip-ai-gateway-sync --json`。本机登录状态目录 `/Users/zhouyide/.edgeone/`；项目绑定参考 `/Users/zhouyide/Desktop/icao-app/.edgeone/project.json`。
- Web 回退依据：本批次 `dp447qbag0n7` 已通过部署及公网字节检查，可作为后续整合批次的来源明确的回退点，但关键引导手势尚待用户验收。前一份历史记录的部署为 `dpgp9zsw76jf`（10 月 20 日启动优化记录）；本轮未重新验收该历史部署，不把它描述为本轮真机验收结果。
- Android：`scripts/build-standalone-android.sh`，设置 `ICAO_APP_VARIANT=android-test`；签名工具为 `scripts/lib/android-signing.sh`，受控签名目录 `/Users/zhouyide/Library/Application Support/Feizhu ICAO/Signing/`，密码来自既有 macOS Keychain。生产存储主机上用 `tools/publish-app-update.py` 发布 `android-test`；受控存储配置 `/opt/icao/runtime/supabase/.env`，本批次清单备份 `/opt/icao/backups/app-updates-20261022-guide/updates-before-20261022T092409808293Z.json`。
- iOS：`scripts/release-ios-testflight.sh`、`tools/app-store-connect-testflight.mjs`；配置 `/Users/zhouyide/.config/icao-app/testflight.env`，私钥位于 `/Users/zhouyide/.appstoreconnect/private_keys/`。不要复用已上传的构建号，先核对 App Store Connect 实际状态。
- API：`scripts/deploy-api-release.sh`；受控配置 `/opt/icao/runtime/api/.env`；内容签名密钥路径 `/Users/zhouyide/.config/icao-app/credentials/content-signing/content-credential-ed25519.pem`。本批次保留回滚镜像 `icao-api:rollback-guide-20261022-41fd90d4` 和 `/opt/icao/backups/api-guide-20261022-41fd90d4/`，不随任务清理删除。
- 模拟器/账号工具：`scripts/run-ios-development.sh`、`scripts/start-phase2a-ios.sh` 是现有开发入口；`tools/verify-ui-acceptance-config.mjs` 检查免登录 UI 验收开关。`services/api/scripts/live-verifier-account-fixture.mjs` 仅提供受控临时账号创建/清理能力，`verify-asr-live.mjs`、`verify-review-live.mjs` 为用法示例；本批次临时账号已经删除，没有可复用的保留会话。UI 免登录不能代替真实认证、首次账号识别和同步验收，不得带入正式包。

整合关注：保留唯一 `GuideTourProvider.tsx`；不要恢复独立 `.native` 教学引擎或旧 `tutorial-progress`。导航转场使用 `suspend`，目标使用 `GuideAnchor` / `GuideModalScope`，其他页面和图标改动应保留这些锚点及 `useAppRouter`/返回修复。集成时关注 `src/app/_layout.native.tsx`、题库学习页、学习报告、资料设置与范围选择器，以及 EdgeOne 的共享模块选择表。

最终统筹改号时需同步 `app.json` 和三份平台展示版本模块，并维护现有 Vercel 冻结检查中的精确版本元数据指纹，不能直接放宽冻结校验。
