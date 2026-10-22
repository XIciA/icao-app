# 本轮整合测试版 1.2.2

状态：整合与验收准备中，尚未完成发布。

## 用户授权与版本

2026-10-22 用户授权统筹截图中六项任务，全部内容整合后发布 iOS TestFlight、Android 测试渠道及正式 Web，并要求模拟器真实点击每个可达页面、发现问题后修复重验。

用户明确要求最终对外版本为 **1.2.2**。该数字不表示减少本轮功能。内部 build number 递增；已有其他批次不可冒充本次完整交付。正式 Web 目标为现有 EdgeOne，Vercel 继续冻结。此任务不提交 App Store 正式审核。

## 整合范围

| 来源聊天 | 范围 | 当前状态 |
| --- | --- | --- |
| 梳理界面优化事项 | 全局返回、重复跳转、手势、冗余文案 | 初轮 #225 与补漏 #229 已合入 |
| 编写功能修复需求文档 | 使用指南与首次引导统一、聚光灯、配套注册时间字段 | #228 已合入；独立 1.2.4 发布批次须核对，不代表最终整合包 |
| 评估服务器承载与稳定性 | 稳定性看板与已完成运维改动 | 核对已合入提交与生产状态，不自动扩大安全/付费操作 |
| 讨论 APP 定价与支付方案 | 7/31/93 天实价 12/38/98 元、划线原价；Apple 后台调价 | #226/#227 已合入；核对 Android 线上实价 |
| 讨论 ICAO App UI 方案 | 七页 UI、会员信息、导出、答题卡、结束页 | 最终提交已整合，待实际点击验收 |
| 设计全局精美图标方案 | E 轻线浅面，全局共享图标，保留航司造型 | 最终提交已整合，待实际点击验收 |

## 实际点击验收要求

以下是待执行清单，不能作为通过证据。最终每项填写平台、源码 SHA、入口、动作、实际结果、截图/日志及修复重验结果。

- 三个主标签及每个可达入口；快速双击、连续返回、右滑完成/取消、转场中再次返回。
- 各题库目录、分类、学习、上一题/下一题、答题卡选题、结束与再次进入。
- 标签、高亮、笔记、查词收藏；按钮/右滑退出保存、失败保留输入。
- 本次学习记录、答题卡、历史记录详情与复习，保证返回无循环。
- 词书、单词学习、完成、本轮单词、重新学习与逐层退出。
- 随身听、播放控制、打开对应题目与返回原入口。
- 模拟练习、热点详情与关联题目、资源文章及外链。
- 会员标识、到期时间、个人资料编辑/保存/取消、备考目标。
- 会员套餐选择、商品失败恢复、取消购买；真实支付另列能力限制。
- 登录、协议、错误输入、账户安全、同步、退出登录。
- 反馈列表/详情/提交/放弃确认，提交后回到原列表且只新增一次。
- 新用户首次引导、老用户、跳过后不自动复现、主动重学、退出留在当前页。
- 900 句导出、范围选择、生成、系统分享取消、错误恢复。
- 无效路由、冷启动深链接、加载中返回与迟到异步结果。
- EdgeOne 深链接刷新、浏览器前进/后退、窄屏和跨端同步。

仅开启真实产品运行时，不用 mock 音频 E2E 或 UI acceptance 模式替代生产链路。隐藏功能检查入口与兜底；未执行、受设备能力限制或待人工真机验证项目明确列出。

## 完成证据

待填写：最终 main SHA、完整检查结果、模拟器点击清单及发现/修复项、三个渠道的实际版本/构建号、包签名与摘要、Apple 处理状态、Web 部署 ID、精确发布标签和回滚目标。

## 验收中发现的问题（未完成最终验收）

- 2026-10-22：用户报告真机曾出现“暂时无法确认账号状态”，本轮 iOS 模拟器同屏复现。模拟器运行日志明确为 `ERR_KEY_CHAIN` / 缺少授权；该诊断包使用 `CODE_SIGNING_ALLOWED=NO`，不具备 Keychain 身份。改用 Xcode 模拟器签名构建后须重新安装、启动验证，禁止清空用户数据来掩盖。正式 1.2.4 IPA 的 application/team identifier 和发行权限正常，不能将历史真机问题直接归因于模拟器签名。
- 确认并修复独立恢复缺陷：首次账号初始化失败后，重试复用内存会话，可能持续发送过期令牌。提交 `7cf80900` 改为每次经 auth service 读取/刷新持久化会话；保留并发身份保护。相关 3 组 97 项测试通过，含新令牌重试和已失效会话返回登录、不删除学习数据。真实 SDK 纯内存验证确认过期且永久失效的刷新凭据由 SDK 清理，无须无条件清 token。
- 本地 EdgeOne 导出登录阻断由生产 CORS 不允许 localhost:4175 造成：OPTIONS 204 不带 Allow-Origin，实际 GET 未发送；受控服务端探针 `/v1/account`、`/v1/legal-consent` 均200。正式 Web 点击验收需在授权正式域名完成，不扩大生产 CORS。
- 图标拆分导致旧发布边界脚本误报已修复，15项正反测试通过；保留全量导入禁令。完整整合测试发现的 ProfileTab 缺测试上下文、并发下载测试异步收尾竞态已修复，相关42项通过。

## 2026-10-22 用户要求暂停时的续做交接

用户因额度将尽要求尽快收尾，下次说“开始执行”即继续本任务。**未完成发布，不得称三端已上线。** 继续的授权：六任务全部整合，1.2.2，iOS TestFlight、Android 测试、EdgeOne Production；模拟器逐页真实点击并修复逻辑、报错、组件重复/遮挡/错位/截断等重大视觉问题。用户另已明确同意临时测试账号勾选登录协议，并允许使用本机 Maestro 做真实长按、滑动及安卓操作，不再重复询问。

### 保存位置与检查

- 工作树 `/Users/zhouyide/.codex/worktrees/integrated-test-release/icao-app`，分支 `codex/integrated-test-release`，PR #230；不触碰原始根目录的其他未提交改动。
- PR #233 最终提交 `00f2528f` 已通过 merge 进入本分支 `e6a5ed8f`，不独立重复合并 #233。待 #230 最终合入后确认 #233 已全包含再收口。
- `7f8d17cc` 完整本地 pnpm check 已通过（媒体不跳过），前端211组1409项、API67组682项；日志 `/tmp/icao-integrated-recovery-check.log`。该提交 GitHub run 39762190097 全部通过。
- 最新业务修复 `371ca61b`：引导跨Tab改为明确 navigate，到目标pathname才推进；仅正式端引导中关闭原生pager动画。12项针对测试、tsc、lint、freeze通过，**尚未模拟器重建重验，也未跑最新完整检查/CI**。
- 当前 app.json 版本1.2.2，iOS/Android内部build3580413；冻结Vercel不改不发布。
- 未合main、未生成本轮正式IPA/APK、未上传本轮TestFlight、未发布本轮Web/Android；先前其他任务1.2.4是中间批次。

### 实际验收结果与下一步

- 已使用正确签名模拟器包覆盖安装，原Keychain授权错误消失，真实密码登录成功，首次引导实际完成个人资料 ICAO5/复考选择、保存并返回我的；未清除本机数据。
- 发现引导从我的“知道了”切到题库后，AX选中题库但pager仍显示我的，跳过也不恢复；切发现再切题库可恢复。截图 `.generated/integrated-acceptance/screenshots/ios-guide-tab-stale.png`。`371ca61b` 是针对此现象的待重验修复。
- 实际已点：题库范围最全切换、陆空通话→QFA→免费场景 QFA160（18卡）、播放音频（时间走到19秒）、展开答案、单词flight高亮、好题标签、笔记输入Qa。其余学习/结束/历史/答题卡/导出/词书/资源/设置等仍需继续，不能标记全通过。
- 当前 iPhone17Pro/iOS26.3 模拟器 UDID `067A9FFF-E6E1-46EE-AAAC-3E30881B9B0D` 停在学习引导“长按查词”步骤。账号已登录，Qa笔记/flight高亮为本轮临时数据。下一步先重建安装最新修复，使用使用指南主动重学备考设置复验跨Tab；之后继续完整实际验收。长按/拖动Cua连续失败，用户已批准Maestro替代；Maestro2.8.0已安装，`./scripts/with-android-env.sh maestro --udid <UDID> ...`，不要启用mock或UI acceptance模式。
- CUA运行时若续接，先rewriteDocumentation；旧绑定/AX索引需刷新。测试凭据不要输出。iOS输入普通字段用setValue可行，编辑笔记使用pressKey可行；paste会因Simulator剪贴板同步产生错误内容，避免。
- 截图目录 `.generated/integrated-acceptance/screenshots`：ios-before-keychain-fix、ios-after-login-profile-save、ios-guide-tab-stale；实际记录 `.generated/integrated-acceptance/observations.json` 尚需补齐后续步骤。

### 构建与发布操作信息

- iOS签名模拟器构建已成功，源码截至7f8d17cc；日志 `/tmp/icao-integrated-ios-simulator-signed.log`。使用Release、production真实运行时；必须 `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`，不要再用NO。Xcode生成的Simulated.xcent包含 `3FX69S3S8P.com.readyoufife.ios`，解决本次模拟器Keychain错误。
- 重建：先 `PROJECT_ROOT="$PWD"; . scripts/lib/release-common.sh; . scripts/lib/ios-release-product.sh; load_release_runtime; configure_ios_cng_product "$PWD/ios"; export NODE_BINARY="$(command -v node)"`，然后 `ICAO_APP_VARIANT=production xcodebuild -quiet -jobs 2 -workspace "$IOS_WORKSPACE" -scheme "$IOS_SCHEME" -configuration Release -destination 'platform=iOS Simulator,id=067A9FFF-E6E1-46EE-AAAC-3E30881B9B0D' -derivedDataPath "$PWD/.generated/ios-simulator-build" CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build`。覆盖安装 `.generated/ios-simulator-build/Build/Products/Release-iphonesimulator/app.app`。
- full pnpm check需 `QUESTION_BANK_AUDIO_ROOT=/Users/zhouyide/.codex/icao-question-bank-recovered-media-20261014/audio`。Web export会覆盖dist；若content check报release_output_missing，先带同env执行 `node tools/question-bank-content.mjs build`，不是跳过检查。
- 当前主干最新已知445eea71。正式发布必须干净main=origin/main；可复用独立干净clone `/Users/zhouyide/.codex/icao-guide-release-20261022`，先fetch/同步最终主干，避免重建所有native依赖。发布脚本及先前回滚详见 `docs/records/releases/20261022-unified-guide-1.2.4.md`。
- Android专用AVD `ICAO_122_ACCEPTANCE` 已建，当前关机；安装了同签名1.2.4基线APK待升级测试，未登录。既有ICAO_API_36的其他签名1.3.0包未删。新1.2.2内部build更大可以直接安装，但旧1.2.4自动更新版本过滤不会提示降显示版本，需最终直接测试下载入口，不谎称自动升级已验收。
- EdgeOne本地导出已通过，但localhost被生产CORS正常拒绝，正式域名实际验收须部署后；不开放CORS。Vercel冻结。现有Web回滚部署 dp447qbag0n7；API guide-20261022-41fd90d4已包含所需后端，不无故重部署。
- 磁盘约15GiB可用，不清理其他用户缓存。正式发布签名/Apple凭据已有本机配置，不输出密钥。正式包用release-ios-testflight.sh、release-android.sh及EdgeOne现有发布流程，最后验证渠道版本/构建/签名/摘要、做annotated tags和发布记录。

### 临时测试账号（完成后必须清理）

专用账号凭据仅在本机 `.generated/integrated-acceptance/account.json`（0600），不要输出内容。服务器icao-api容器中保护状态 `/tmp/icao-integrated-qa-20261022.json`。本地 `.generated/integrated-acceptance/account-fixture.mjs` 是创建/清理帮助脚本；已创建，禁止盲目重复创建。用户已授权该测试账号登录。完成全部验收后执行下面的清理模式并确认成功，再删除仅本轮保护文件；不得删用户真实账号：

```sh
ssh -i /Users/zhouyide/.ssh/icao_app_codex -o BatchMode=yes root@47.108.90.19 \
  'docker exec -i -w /app/services/api -e ICAO_QA_MODE=cleanup icao-api node --input-type=module' \
  < .generated/integrated-acceptance/account-fixture.mjs
```

当前暂停保留此临时账号供下轮续测。所有子Agent已完成各自任务，无需等待未完成交付。不要将当前暂停当任务完成或跳过最终验收。
