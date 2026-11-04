# Android 测试版与产品 Web 对齐交付

日期：2026-11-04（北京时间）。用户明确授权独立 Android 测试 APK 与产品 Web 生产发布，不授权新 iOS 包、正式 Android 渠道、生产 API / 数据库 / 正式微信配置变更。

## 基准与源码

iOS 1.3.1（3596172）、`2158d86a640a586863a66a3236d119b65bcf01e8`、`release/ios-testflight/v1.3.1-b3596172` 已由用户明确验收。原记录已更正；本轮不生成 iOS 包，iOS build 保持 3596172。PR #335 仅将 Android versionCode 从 3596166 提高到 3596173，并更新验收记录。交付构建来自干净 `main = origin/main` 的 `8874900f0aed26f6188966eec4b138eaa1787d6b`，产品源码与已验收 iOS 一致。

## 对齐与必要系统差异

导航、返回、弹层、目录和学习页复用 Native 路由及公共组件。学习保存、标注 / 高亮 / 笔记、查词 / 收藏、下载 / 离线、同步和账号权益复用现有负责人及合同。保留此前 Android 学习返回保护，避免退出时闪现报告。随身听直接继承完整目录索引、数量稳定、正在进行的音频准备复用、切换后旧请求失效修复；没有另造 Android 业务实现。

必要系统差异仅涉及 Android 系统返回、APK 安装授权及更新；Apple 原生登录 / StoreKit；系统录音权限、音频路由、后台与锁屏限制；PDF 系统打印 / 分享；OTP 键盘、安全区、阴影及启动图的最小适配。业务规则不因此分叉。以上设备表现未全部实测，不能宣称完整真机对齐已验收。

## 微信实际边界

独立测试身份仍为 `com.readyoufife.app.test`，配置按现有策略清空微信 App ID / Universal Link；登录可用性要求 SDK 已配置，因此测试包不提供可用的微信登录。支付保留原有实现，在创建订单前检查微信安装 / 配置状态，不能因按钮存在就视为可支付；已有服务器会员权益仍可读取。

这是未解决的测试配置差异，**不是系统必需差异**，当前为测试候选，不宣称微信已完整对齐。未来若要求此独立包微信可用，最小依赖为该包名与现有签名的有效微信移动应用注册 / App ID，以及服务端 challenge、登录和绑定对该 App ID 的适配核对；本轮不访问微信开放平台、不替换正式注册、不修改支付、全局鉴权或生产配置。

## 验证与边界

- Android 平台专项 50 组 / 375 项；微信与 EdgeOne 模块合同 15 项通过。
- 完整 `CI=true QUESTION_BANK_AUDIO_ROOT=/private/tmp/icao-verification-media/audio pnpm check` 通过：前端 283 组 / 2000 项，API 89 文件 / 823 项，3 项按既有配置跳过；12651 份资源大小检查通过。PR #335 GitHub 仓库与 EdgeOne 检查通过（run 41817602609）。
- `adb devices -l` 未发现设备。新旧 APK 的身份 / 证书 / 版本升级条件核验不等于真实安装升级及数据保留验收；后台音频、锁屏、快速切换、麦克风、系统返回、学习保存、离线恢复、账号与跨端同步仍待用户在最终 APK 验收。
- Web 使用浏览器音频与存储适配，不套用 Native TrackPlayer / 凭证预取，网页不新增离线包。线上 12 个 JS 的 SHA-256 与本地产物一致。首页、900句目录、导出与返回、发现页、随身听目录 / 切题 / 自动续播已检查；实际导出并下载 900句 / 58页 PDF。
- 本机 Chrome 直接进入随身听显示正常播放按钮，首次点击后 UI 与 Chrome 均显示正在播放。内置浏览器两次冷进入显示重试，点击后播放正常；刷新后页内返回未跳转，作为浏览器兼容观察保留。未确认根因，不据此改变已验收原生逻辑，也不宣称所有浏览器、认证会员流程或跨设备体验均通过。

## 构建过程说明

首次 Android 发布脚本因并行 Web 导出清空 `dist/question-bank-release` 而停止于媒体检查，未生成或发布失败候选。随后独立保存已验证 Web 产物，按现有来源重建本地题库校验目录，再运行原发布脚本。没有发布题库内容或改动源码、锁文件；三个模块生成的 Android build 缓存在本克隆 `.git/info/exclude` 局部忽略，未修改项目规则。

## 交付与追溯

- Android：1.3.1（3596173），`com.readyoufife.app.test`，138403717 字节。SHA-256：`f02c25864c48e2e52265a1b6abbf87d5fff88652e72e96b429f361462b9fc636`。与旧测试包同证书、相同最低 API 24 和四种 CPU 架构，版本号递增；实际安装升级待真机。
- [官网测试入口](https://readyoufife.com/download)已指向[不可变 APK](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-android-test-1.3.1-b3596173.apk)。公网重新下载的大小与摘要一致；仅 `android-test` 改变，另三个渠道逐项一致，正式下载按钮仍为 1.2.1 / 3578875。
- Android annotated tag：`release/android/v1.3.1-b3596173`。旧测试 APK 保留；清单备份为 `/opt/icao/backups/app-updates/android-test-131-b3596173/updates-before-20261104T112838046119Z.json`，服务器备份与任务开始快照一致。
- Web：EdgeOne Production `dpxdpmeg7yqh`；annotated tag `release/web-edgeone/20261104-8874900f`。189 文件 / 39.4 MiB，线上入口与 12 个 JS 文件摘要均通过。回滚参考为 `dph7hstgf9hz` / `c841dbae`。
- 构建、交付和公网上线已完成；Android 及移动浏览器实际体验仍待用户验收。版本、摘要、脚本逐文件证据和回滚目标见[同名 JSON](20261104-android-web-parity-1.3.1.json)。签名材料不纳入证据或仓库。证据与交付制品保存在 `/Users/zhouyide/.codex/artifacts/android-web-3596172-20261104/`，用户原工程未修改。
