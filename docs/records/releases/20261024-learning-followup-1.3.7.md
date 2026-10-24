# 2026-10-24 学习反馈、听力显示与全局动画修复 1.3.7

状态：产品 Web 已上线；TestFlight 和 Android 独立测试渠道可用。代码检查、候选交付完成，三端实际体验待用户验收；按要求未使用模拟器。

## 同源交付与范围

- [修复 PR #240](https://github.com/XIciA/icao-app/pull/240) 与另一任务的[指南 PR #239](https://github.com/XIciA/icao-app/pull/239)统一交付，源码 `6e2c86963a2825293bd42f3907822bf75cd4835a`，版本 1.3.7 / build 3583088。三端从同一干净 main 等于 origin/main 的发布 clone 构建。
- 本任务五项及追加全局审查见[任务记录](../../workstreams/learning-followup-five-20261024/README.md)和[动画审查](../../workstreams/learning-followup-five-20261024/animation-audit.md)。指南逻辑由对应任务实施，本任务仅协调共享冲突、集成检查与发布。
- 记错保存成功后原按钮显示勾选与“已标记记错”，不新增弹层或改变布局；失败不提前显示成功，下一词清除本词反馈。
- 听力按最终可见范围连续显示编号；四组显示顺序为10秒航空英语、10秒陆空通话、20秒航空英语、20秒陆空通话。稳定题目/分类 ID、组内顺序、内容、音频、答案和历史关联不改，非编号描述标题保留。模考改用稳定分类 ID 定位，新增分类改名后抽题来源完全一致的回归。
- PDF 删除顶部重复忙碌块，只保留原按钮内转圈，保留指南确认与生成结果生命周期、重复保护和失败恢复。
- 范围菜单可见状态与测量坐标分离，关闭只改变可见性，原生淡出期间沿用坐标；选择当前范围不保存、不重载。
- 全局审查在共享原生 Modal / BottomSheet 保留最后可见内容直至退场，关闭时禁止旧控件交互；登录方式、更新提醒与法律文档避免关闭立即卸载。没有加业务延时、请求重试或逐页隐藏异常，账号及强制安全边界仍优先执行。
- 指南 PR 保留 v3 唯一恢复状态、真实业务页面与弹层锚点、明确完成和失败恢复。本轮集成保留单词按钮教学锚点及已保存反馈、PDF结果保护。当前指南手动进入真实900句 Sentence1，取代1.3.6历史记录中的LT首题；自然进入保留业务原题。

## 检查与边界

- 最终 [CI 40069262530](https://github.com/XIciA/icao-app/actions/runs/40069262530)通过：前端225组 / 1522项、API67文件 / 682项、TypeScript、内容身份/结构不变量、数据库authority、无TS加载器合同和EdgeOne导出。ESLint 0错误 / 19个既有警告。合并前13组 / 68项集成回归通过；发布脚本录音15组 / 189项通过。
- 本机完整历史媒体源仍缺失，`pnpm check`未通过完整媒体扫描；不得把`check:ci`当作完整媒体校验。本轮没有改权威内容、资源路径、数据库或API。
- 关键能力门禁复用2026-10-24 10:28（北京时间）真实AI-live合同证据，验证器指纹、线上API版本一致且在24小时内；不是本候选真机录音/AI全流程验收。API保持`guide-20261022-41fd90d4`。

## EdgeOne 产品 Web

- [readyoufife.com](https://readyoufife.com)，deployment `dpgy5yhya9hm`，181文件 / 35.9MiB。
- 公网JS `/_expo/static/js/web/index-02bba4a148062a933c83814fc7850ad5.js`，7605956字节，SHA256 `8dce50de45b6a8a90ed63283ef6947bf9d5075d47a8fd9b0260f5a157daa6330`，与本地产物逐字节一致；首页、`/download`、`/info/guide`、`/question-bank/sentences900`返回200。
- 首次部署完成后即刻校验短暂读到旧HTML；后续直接与带版本参数GET均指向新脚本，未重复部署，精确校验通过后才继续移动构建。
- annotated tag `release/web-edgeone/20261024-6e2c8696`；可回滚上一deployment `dp3w4tprilkb`，见[1.3.6发布](20261024-learning-ui-1.3.6.md)。

## iOS TestFlight

- Bundle ID `com.readyoufife.ios`，1.3.7 / 3583088；Apple Build ID `fdb062b1-be32-4c9e-aacb-76a7192c3463`。独立查询VALID、未过期、内部测试组可访问且IN_BETA_TESTING。
- 归档、正式签名、权限/隐私、生产运行时、Apple校验与上传通过。IPA SHA256 `9630efbd220858dfd2cafe105adcce458b14d705e21131f1c1041fbd31bf9646`，文件`.generated/testflight/export-3583088-20261024T062410Z/app.ipa`。
- tag `release/ios-testflight/v1.3.7-b3583088`；未提交App Store或外部测试审核，旧1.3.6可由既有内部测试组选择。
- `ios-testflight`更新清单已发布及回读，备份`/opt/icao/backups/app-updates-20261024-followup/updates-before-20261024T063846896254Z.json`。

## Android 独立测试版

- 包`com.readyoufife.app.test`，1.3.7 / 3583088，Release正式签名、v2验证通过，证书与旧测试版一致：`25d4fe5523417289da5fe0bf970593b98fe4ea658883edeb5792906e31456629`。
- APK 135599957字节，SHA256 `734962c1bcfcee6ec7d715e612e601001941e8c44025cefa2d14977c1b38efe4`；上传前本地、服务器发布前公网完整验证及独立公网下载一致。
- [测试APK](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-android-test-1.3.7-b3583088.apk)；[官网下载页](https://readyoufife.com/download)测试入口读取最新`android-test`渠道。
- tag `release/android-test/v1.3.7-b3583088`；清单备份`/opt/icao/backups/app-updates-20261024-followup/updates-before-20261024T064711981521Z.json`。正式安装包不被覆盖；旧APK不能直接低versionCode覆盖降级并保证本地数据，后续修复沿用同签名递增build。

## 证据、回滚与待验

- 两个测试渠道均独立回读1.3.7 / 3583088；正式iOS 1.2.1 / 3576434、正式Android 1.2.1 / 3578875所有字段与发布前一致。未发布宣传站、Vercel、API、数据库，原目录及其他任务无关修改保留。
- 清单备份目录`/opt/icao/backups/app-updates-20261024-followup/`；回退相关测试渠道时提取单渠道复用publisher，先验证旧制品，禁止整份旧清单覆盖其他渠道。
- 脱敏证据在`/Users/zhouyide/.codex/icao-guide-release-20261022/.generated/release-137/`，包含`source.json`、`ci-final.log`、`web-deploy.json`、`web-verification.json`、`testflight-availability.json`、`android-signature-verification.json`、两份发布回执及`channels-verification.json`。签名报告/制品保留在发布clone既有`.generated/`目录。
- **代码检查通过、三端候选已交付；用户真机和浏览器体验待验。** 点击步骤见[本轮10项验收清单](../../workstreams/learning-followup-five-20261024/acceptance-checklist.md)，前轮固定导航、答题卡等沿用[原清单](../../workstreams/learning-ui-repair-20261024/acceptance-checklist.md)。构建/200/摘要不代替动画、键盘、连续触控、保存失败和历史记录体验验收。

收口：代码与发布记录均已合入主干，任务临时分支已删除，发布clone干净且等于origin/main；服务器本轮六个暂存文件已删除，制品与备份保留。应用归档工具将本任务工作区标记为“protected by a pinned task or workspace”，因此保留干净、无任务分支的受保护工作区，不绕过保护删除。指南任务报告其工作区也受固定保护；不改动其他任务或原目录。
