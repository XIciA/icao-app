# 本轮整合测试版 1.2.2

状态：2026-10-23 三个目标渠道已发布。最终来源为 main `7b133eac`，iOS/Android 1.2.2（3580413）；用户真机验收待进行。

最新结果见[最终发布与验收记录](../../records/releases/20261023-integrated-test-1.2.2.md)。下文按日期保留过程、失败候选及暂停交接，不以其中旧“待发布”覆盖最新结果。

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
| 讨论 ICAO App UI 方案 | 七页 UI、会员信息、导出、答题卡、结束页 | 最终提交已整合，模拟器实际点击和遮挡修复重验完成 |
| 设计全局精美图标方案 | 按用户最新要求回退上一版共享、页面及航司尺寸/底托 | `69405411` 已回退；最终 iOS/Android 主要入口和航司目录实际确认 |

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

最终 main `7b133eac`、完整检查、模拟器操作与修复重验、三渠道版本/摘要/标签/回滚目标均见[发布记录](../../records/releases/20261023-integrated-test-1.2.2.md)。完整媒体正式检查前端 212 组/1419 项、API 67 组/682 项通过；最终 iOS 追加完整 30 题词汇评估及 12 题模拟考试，Android 最终四架构包覆盖保留登录与记录、原价/现价复核通过。证据已脱敏归档，临时测试账号已清理。

## 验收中发现的问题（未完成最终验收）

- 2026-10-22：用户报告真机曾出现“暂时无法确认账号状态”，本轮 iOS 模拟器同屏复现。模拟器运行日志明确为 `ERR_KEY_CHAIN` / 缺少授权；该诊断包使用 `CODE_SIGNING_ALLOWED=NO`，不具备 Keychain 身份。改用 Xcode 模拟器签名构建后须重新安装、启动验证，禁止清空用户数据来掩盖。正式 1.2.4 IPA 的 application/team identifier 和发行权限正常，不能将历史真机问题直接归因于模拟器签名。
- 确认并修复独立恢复缺陷：首次账号初始化失败后，重试复用内存会话，可能持续发送过期令牌。提交 `7cf80900` 改为每次经 auth service 读取/刷新持久化会话；保留并发身份保护。相关 3 组 97 项测试通过，含新令牌重试和已失效会话返回登录、不删除学习数据。真实 SDK 纯内存验证确认过期且永久失效的刷新凭据由 SDK 清理，无须无条件清 token。
- 本地 EdgeOne 导出登录阻断由生产 CORS 不允许 localhost:4175 造成：OPTIONS 204 不带 Allow-Origin，实际 GET 未发送；受控服务端探针 `/v1/account`、`/v1/legal-consent` 均200。正式 Web 点击验收需在授权正式域名完成，不扩大生产 CORS。
- 图标拆分导致旧发布边界脚本误报已修复，15项正反测试通过；保留全量导入禁令。完整整合测试发现的 ProfileTab 缺测试上下文、并发下载测试异步收尾竞态已修复，相关42项通过。

## 2026-10-23 恢复执行初期证据（历史阶段）

以下为恢复执行初期状态；最终状态见页首链接。**其他待测项目尚未完成，本轮尚未发布到 TestFlight、Android 测试渠道或正式 Web，不代表全功能验收通过。**

- `69405411` 已按用户要求回退 #232 图标，包含航司默认尺寸/底托、共享及页面图标；保留七页布局、业务、导航、价格及引导最新修复。
- 完整本地 `pnpm check` 退出码 0：App 211 组/1413 项、StoreKit 19 组/187 项、API 67 文件/682 项通过；内容与媒体、类型、Contracts、API 构建检查通过。Expo lint 0 错误/56 个已有警告。日志 `/tmp/icao-resume-full-check.log`。另有图标聚焦测试 46 项、边界测试 16 项、网页源码及 351 文件冻结检查通过。代码检查不等同实际验收。
- 今日正确签名 iOS Release 模拟器包覆盖安装，未清数据；冷启动自动登录正常。
- CUA 真实主动重学“备考设置”，个人资料 ICAO4/初考；Maestro 实际点击保存与“知道了”，跨 Tab 后题库显示真实正文，再选精选结束引导。`371ca61b` 跨 Tab 修复经 CUA 页面与截图确认重验通过：`.generated/integrated-acceptance/screenshots/ios-guide-fixed.png`。
- Maestro 第一次 setup-save 实际跑到题库，但末尾截图路径 invalid 导致 exit 1；重复跑因已经不在保存页而失败。**不能记录整条自动化通过**；修复确认来自真实操作和人工 CUA 页面/截图。
- 航司目录图标恢复已实际确认，截图 `.generated/integrated-acceptance/screenshots/ios-airline-rollback.png`；不据此推断所有图标入口已验收。
- 美元会员 7/31/93 天分别 $1.99/$4.99/$14.99，逐项点选后购买按钮价格同步、无原价；购买须知开关和会员返回原目录正常。截图 `.generated/integrated-acceptance/screenshots/ios-usd-pricing.png`。未执行真实支付，人民币原价及其他购买情形仍待验证。
- 原有 flight 高亮及历史学习 1 卡恢复正常；其余未执行的学习、返回、导出及跨端清单继续待测，不标记全通过。

## 2026-10-22 用户要求暂停时的续做交接（历史记录）

用户因额度将尽要求尽快收尾，下次说“开始执行”即继续本任务。**未完成发布，不得称三端已上线。** 继续的授权：六任务全部整合，1.2.2，iOS TestFlight、Android 测试、EdgeOne Production；模拟器逐页真实点击并修复逻辑、报错、组件重复/遮挡/错位/截断等重大视觉问题。用户另已明确同意临时测试账号勾选登录协议，并允许使用本机 Maestro 做真实长按、滑动及安卓操作，不再重复询问。

### 保存位置与检查

- 工作树 `/Users/zhouyide/.codex/worktrees/integrated-test-release/icao-app`，分支 `codex/integrated-test-release`，PR #230；不触碰原始根目录的其他未提交改动。
- PR #233 最终提交 `00f2528f` 已通过 merge 进入本分支 `e6a5ed8f`，不独立重复合并 #233。待 #230 最终合入后确认 #233 已全包含再收口。
- `7f8d17cc` 完整本地 pnpm check 已通过（媒体不跳过），前端211组1409项、API67组682项；日志 `/tmp/icao-integrated-recovery-check.log`。该提交 GitHub run 39762190097 全部通过。
- 最新业务修复 `371ca61b`：引导跨Tab改为明确 navigate，到目标pathname才推进；仅正式端引导中关闭原生pager动画。12项针对测试、tsc、lint、freeze通过，当时尚未重验；2026-10-23 已完成 iOS 实际重验和完整本地检查，见上节；CI 另行核对。
- 当前 app.json 版本1.2.2，iOS/Android内部build3580413；冻结Vercel不改不发布。
- 未合main、未生成本轮正式IPA/APK、未上传本轮TestFlight、未发布本轮Web/Android；先前其他任务1.2.4是中间批次。

### 实际验收结果与下一步

- 已使用正确签名模拟器包覆盖安装，原Keychain授权错误消失，真实密码登录成功，首次引导实际完成个人资料 ICAO5/复考选择、保存并返回我的；未清除本机数据。
- 发现引导从我的“知道了”切到题库后，AX选中题库但pager仍显示我的，跳过也不恢复；切发现再切题库可恢复。截图 `.generated/integrated-acceptance/screenshots/ios-guide-tab-stale.png`。`371ca61b` 针对此现象，已于 2026-10-23 实际重验通过，见上节。
- 实际已点：题库范围最全切换、陆空通话→QFA→免费场景 QFA160（18卡）、播放音频（时间走到19秒）、展开答案、单词flight高亮、好题标签、笔记输入Qa。其余学习/结束/历史/答题卡/导出/词书/资源/设置等仍需继续，不能标记全通过。
- 暂停时 iPhone17Pro/iOS26.3 模拟器 UDID `067A9FFF-E6E1-46EE-AAAC-3E30881B9B0D` 停在学习引导“长按查词”步骤。账号已登录，Qa笔记/flight高亮为本轮临时数据。下一步先重建安装最新修复，使用使用指南主动重学备考设置复验跨Tab；之后继续完整实际验收。长按/拖动Cua连续失败，用户已批准Maestro替代；Maestro2.8.0已安装，`./scripts/with-android-env.sh maestro --udid <UDID> ...`，不要启用mock或UI acceptance模式。
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

### 暂停后补充：会员价格币种验收

用户于2026-10-22明确要求留到下次验收，本次不继续执行：重点实际确认人民币环境的现价与划线原价同时正常显示，7/31/93天对应现价¥12/¥38/¥98、原价¥68/¥158/¥358，并检查排版、遮挡及购买按钮报价一致性。美元环境不得乱标原价，不得将人民币数字换成美元符号，也不得混币种比较；当前仅配置人民币原价，美元隐藏原价是预期行为。若以后展示美元原价，须先核实对应地区真实原价，不能凭换算或猜测补值。下轮将人民币与美元两种显示条件纳入实际验收。

### 暂停后补充：图标回退（覆盖此前保留新图标的要求）

用户要求下次统一执行时，将当前新改的图标全部回退到上一版本，包括航空公司图标及其他本轮更换的图标，原因是用户不认可当前视觉效果。此为暂停时要求；恢复执行后已由 `69405411` 完成回退，iOS 航司目录已确认，其余验收与发布继续进行。执行时先对照各图标改动前的实际Git版本与当前显示，确定上一版完整资产/组件，不仅回退共享E图标入口而遗漏航司或页面内图标。保留其他已要求的业务、返回、引导、价格和七页布局改动；避免整批revert混合提交导致无关功能丢失。回退后须在模拟器实际检查题库航司、三个主标签、发现、我的、会员及学习工具等入口，确认无新旧图标混用、缺失、重复或遮挡，并重验相关跨端构建边界。此前清单中的“保留E轻线浅面新图标”被本条用户最新要求替代。

### Android 实际验收补充（2026-10-23）

- 本地诊断包源码 `69405411`，版本 `1.2.2 (3580413)`，包名 `com.readyoufife.app.test`，arm64-v8a；使用 production 真实 API，无 mock。未发布，此包不替代合入 main 后的正式重建。SHA256：`11ebb4cbb3b923b4d0b1d6a083de9f686467a6d81910683b6b3c0e3d157095df`。
- 仅操作专用 AVD `ICAO_122_ACCEPTANCE` / `emulator-5562`。同签名从 `1.2.4 (3580360)` 执行 `adb install -r` 覆盖成功，firstInstallTime 保留，未卸载/清数据。基线未预置学习数据，不将其描述为学习数据完整性或自动更新提示验收。
- Maestro 真实点击：临时账号密码登录（协议勾选已授权）成功；我的→会员与购买，人民币7/31/93天现价¥12/¥38/¥98与划线价¥68/¥158/¥358同时显示，切换后的购买按钮金额同步。购买须知的关闭按钮及系统返回均正常，会员页系统返回到我的。没有实际支付。
- 会员状态显示未开通、到期日期“—”；系统返回、再次打开并跳转会员购买、顶部返回均正常。设置→账号安全／隐私与数据／关于逐一打开及返回；关于确认1.2.2。检查更新点击后看到加载并测试返回，未验证最终更新查询结果。
- 发现→单词学习／随身听／模拟练习／OPI热点／资源分享逐一真实进入并系统返回；第二轮跳过教学查看内容页，再返回我的。会员、购买须知、随身听、资源页面未见遮挡；资源图片后续加载正常。捕获应用 AndroidRuntime/ReactNativeJS 错误级日志未见错误，不等同于全部功能零缺陷。
- 发现模拟考试选中圆点覆盖 ICAO4 标题：原因是卡片右上绝对定位，窄屏与标题竞争空间。已最小调整为初考／复考说明行内的勾选标记，不改选择逻辑。此视觉修复尚待最终包重新安装后实际复验，不能把旧包截图作为修复通过证据。
- 证据与逐项观察：`.generated/integrated-acceptance/android-69405411/observations.json`，同目录保留各 Maestro flow/output 截图、`artifact.json`、脱敏运行日志。所有凭据只在受保护临时文件中，未写入记录。APK 位于 `android/app/build/outputs/apk/release/app-release.apk`；构建日志 `/tmp/icao-122-android-diagnostic-build.log`。
- 构建采用现有 release runtime 和签名配置执行 `expo prebuild --platform android --no-install` 后，`./gradlew :app:assembleRelease --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a`；未执行正式发布脚本。尚需最终源码重建与视觉复验；本轮 Android 未穷尽学习页所有下级功能，也未实测美元环境。

### iOS 实际验收补充：随身听引导与学习流程（2026-10-23）

- 本节记录 `69405411` 加当前工作树修复的诊断包实测，不冒充最终 main 发布包；本轮三端仍未发布。
- 随身听间隔引导原阻断已确认：`radio-interval` 锚点仅覆盖滑杆，推进事件却绑定遮罩之外的“完成”，导致改值后无法继续。最小修复将弹层锚点移至整个间隔控件区域，包含滑杆、预设和完成，保持点击完成才推进。
- Maestro `radio-guide-fixed` 整条实际通过：主动重学随身听→900句→播放模式→倍速→间隔3秒→完成→确认字幕引导→字幕→播放→进入当前题目学习。日志 `/tmp/icao-maestro-radio-fixed.log`；截图 `.generated/integrated-acceptance/maestro-radio-fixed/2026-10-23_073704/radio-guide-fixed/takeScreenshot/radio-interval-guide-fixed.png`、同目录 `radio-guide-learning.png`。此结果仅覆盖该条流程。
- 统筹 Agent 已实际确认词汇完整学习1词、总结及查看本轮单词流程通过，学习答题卡及长按交互通过；不扩展为全部词汇、录音或学习功能已通过。
- 返回文案已按真实来源修正：词汇结束返回单词列表/词书详情；查词、标注或错题列表进入回顾时显示相应返回目标。原路返回行为保持。
- 早期 `simple_push` 包实际右滑复验失败（已被后续统一返回方案替代），保留失败证据。此前 `animationMatchesGesture=true` 单独候选实测仍失败；系统设置同一 Maestro 手势成功，排除输入驱动普遍失效。LLDB 已脱离，记录确认原生导航4层、gesture开启、customAnimationOnSwipe开启、disableSwipeBack关闭；源码表明 `slide_from_right` 在 iOS 映射 Default，不能激活 RNS 自定义边缘识别器。调查与候选状态见 `.generated/integrated-acceptance/ios-edge-gesture-investigation.json`，失败日志保留。
- 完整媒体 `pnpm check` 已通过，日志 `/tmp/icao-resume-final-check.log`：App 211 suites / 1418 tests、StoreKit 19 / 187、API 67 / 682，lint 53 warnings。此检查早于最终右滑组件；最终源码另跑相关检查及 CI，不能将旧结果冒充最终全量。

### Android 追加验收与视觉修复复验（2026-10-23 07:58）

- 真正打开学习记录并验证 iOS 的900句与QFA临时记录同步；900句历史详情可打开返回。我的标注标签/高亮/笔记各1，切换标签页并打开Qa笔记对应学习页再返回；单词收藏flight与词书短语同步，flight释义可打开返回。
- 意见反馈列表→新建草稿→输入测试文本→返回→放弃确认→列表仍为空；没有提交反馈。个人资料昵称输入草稿后关闭弹层，原昵称保留；AI额度100%弹层及系统返回正常。
- 隐私政策、用户协议、第三方服务清单均实际打开和返回；更换手机号、设置登录密码子页可达并返回，没有发送验证码或修改账号。
- 900句PDF实际生成900句/58页/A4；系统分享面板出现后返回，回到PDF已生成页面，没有发送文件。导出范围独立于按备考目标筛选的题库目录；实际取消5级后计数变为721句，不能把目录721与默认全选900误判为缺陷。
- 新诊断包（858535f6加本轮待提交修复）已 `install -r`，登录状态保留，SHA256 `b7da60ef724f3a811fa78c59077df1e4f5b689a79c611a1760a6a9c878177eb4`。模拟考试四种类型逐一真实选择，截图确认标题与勾选圆点不再遮挡；取消全部板块后0/4且按钮AX enabled=false；系统返回发现正常。当前进程捕获的AndroidRuntime/ReactNativeJS错误级日志无错误。
- 后半轮旧包证据已并入 `.generated/integrated-acceptance/android-69405411/observations.json`；修复包复验见 `.generated/integrated-acceptance/android-retest/observations.json` 及同目录截图。未操作麦克风；账号仍保持登录，最终正式包仍须干净main构建。

- Android 08:03追加：专用临时账号实际退出登录→登录页→同账号密码登录成功；900句/QFA学习记录、Qa笔记、flight收藏仍恢复并逐一返回我的。证据已追加android-retest/observations.json及relogin-data-output截图。无验证码、改密或反馈发送；当前账号仍登录。

### iOS 左缘返回与保存复验（2026-10-23）

- 原生 edge-only 两个候选均失败；24pt 限定的 RNS 自定义 pan 虽可返回普通页面，实测词书详情会直接退到发现，LLDB 已证实详情 `preventNativeDismiss=1`、栈2层，失败后原生只剩1层。未将该候选计为通过，所有 LLDB 已 detach。
- 最终源码 `8573f5bf` 只在 iOS Native Stack screenLayout 加左缘识别，触摸起点不超过24pt、明确水平右拖、完成至少80pt才调用当前 screen 的 `navigation.goBack()`；沿用既有 usePreventRemove/保存链，取消及中部不触发，关闭 iOS 原生返回识别器，恢复原动画；Android/Web 保持。
- 真正 Maestro 整条通过 `/tmp/icao-edge-js-acceptance2.log`：ScrollView 中部右拖不退、左缘短拖取消不退、左缘完整右拖返回发现、重新进入词书详情后右滑准确回词书首页。首次 JS 候选误用 grant 前恒0的 x0 导致中部误退，已改 touch-start pageX 捕获并加入反例，失败日志保留。
- 保存真实复验 `/tmp/icao-edge-save.log` 通过：最全 QFA160 免费18题→下一题→左缘右滑回目录→重进，恢复 QFA160-2，再上一题回 QFA160-1；显示答案后原 flight 高亮仍在（`ios-edge-final/study-preserved-highlight.png`）。针对检查 auth11、local/save17、新边缘1测试以及 tsc/lint/freeze351 通过；证据归档 `.generated/integrated-acceptance/ios-edge-final/`。
- 统筹补充实测：免费18卡前后题、答题卡跳18、结束3题/2分钟、查词返回原题/列表/结束页、历史3题与目录3/18正常；词汇完整1词/本轮列表/回原列表、测评开始2/30后返回正常。未执行全30题、录音或所有功能，不写全部通过，三端仍未发布。

- 独立复核补充多指保护：左缘拖动接管后若加入第二指，本次手势保持取消，即使恢复单指也不返回；已加入对应回归序列。auth/local/edge 共13项及冻结检查通过，最后模拟器覆盖包正在重建。
- 正式网页部署前基线：临时账号真实密码登录、跨端学习记录详情及返回、/learning-records刷新后保留登录与记录已通过。证据 `.generated/integrated-acceptance/web-observations.json`；此项不冒充待发布新网页的验收。
