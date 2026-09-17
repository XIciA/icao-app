# Android 候选包准备与支付审查

日期：2026-09-18。本文是本轮事实记录，不新增长期规则。

## 已完成的代码检查与修复

- 微信支付价格：7 天 6800 分、31 天 15800 分、93 天 35800 分，现有服务端商品表符合用户要求。
- 下单前检查微信可用性；用户取消后向服务端查单并关闭未付款订单，已付款状态优先于客户端取消回调。
- 已过期订单先查微信交易状态，再关闭未支付订单；处理关单与支付成功同时发生的竞态，避免付费后丢失权益。
- 查询未结订单失败时，已从服务器获取的会员权益仍可使用。
- 退款请求先持久化退款号，再请求微信；不确定响应重试复用同一退款号，避免退款意图因数据库事务回滚而消失。
- 微信商户私钥与支付公钥支持环境变量中的转义换行，适配生产单行 env-file。
- 已有验签、金额及商户/应用校验、账号归属校验、回调幂等与权益账本继续使用原唯一实现。

验证：Android 客户端两套测试 15 项通过；API 支付三套测试原 19 项通过，新增 PEM 转义测试后 merchant 单套 7 项通过；API typecheck 通过。构建脚本 shell 语法与 Android 微信发布辅助测试 8 项通过。未在此步骤执行真实扣款、退款或正式发布。

## 本机构建环境

- Java：OpenJDK 17.0.20。
- SDK：`/Users/zhouyide/Library/Android/sdk`。
- 已安装 Android Platform 36、Build Tools 36.0.0、NDK 27.1.12297006、CMake 3.22.1、Platform Tools 37.0.1。
- 命令行工具来自 Google 官方 ARM64 下载，下载包 SHA256 已与官网值核对；sdkmanager 22.0 可运行。
- 本机正式签名材料与 Keychain 密码可访问，未修改签名，也未输出任何密码或私钥。
- 包名：`com.readyoufife.app`；微信 AppID：`wx70dc872ad93a256b`。
- 本机正式签名证书 MD5：`06146ce669663f920e2cd78c0e302714`。
- 本机正式签名证书 SHA256：`25d4fe5523417289da5fe0bf970593b98fe4ea658883edeb5792906e31456629`。
- 以上签名摘要与既有备案制品元数据一致。现有记录表明微信后台曾填写包名及签名，但本轮尚未读取后台实际登记摘要，不能将其认定为已经核对一致。
- `adb devices -l` 未发现连接设备。

## 候选包和最终验收分开

按现行 delivery-and-acceptance 规则，`scripts/release-android.sh` 保留干净主线来源、完整代码检查及签名制品验证，先生成可安装候选包，不再将先行 Development Build/音频真机证据作为产包前提。

候选包旁生成 `acceptance-pending.json`，明确待验收状态。原关键能力及音频证据验证保留在 `scripts/release-android.sh --verify-acceptance`，该入口不生成或伪造通过记录。

尚需候选包真实验证：安装与同签名升级；手机号及微信登录；微信支付、取消、返回、到账和退款；锁屏顺序播放及媒体控制；录音权限与耳机/蓝牙路由；AI 与跨端学习记录、会员权益同步。自动化测试与构建通过不能代替这些事实。

## 正式检查媒体恢复

完整内容检查需要权威资源清单中的 6981 个文件（894194679 字节）。本机缺失的 3894 个文件（579146043 字节）均在既有正式资源备份中找到，逐一匹配当前 manifest 的 SHA256 和大小后复制到仓库外缓存，无需网络下载或修改 Vercel。

后续完整检查及 Android 构建使用：

```sh
QUESTION_BANK_AUDIO_ROOT=/Users/zhouyide/.cache/icao-question-bank-source/audio pnpm check
QUESTION_BANK_AUDIO_ROOT=/Users/zhouyide/.cache/icao-question-bank-source/audio pnpm release:android
```

仓库内已有资源覆盖层仍由现有解析器读取。未修改资源 manifest、检查门槛或冻结的 Vercel 项目。

恢复后发现本机 `dist/question-bank-release` 也缺失：先通过 `check-source` 证实嵌入题库与当前源码一致，再运行原有 `content:build` 生成派生产物，嵌入题库文件无差异。随后 `content:check:full` 通过，6981 份媒体完整 SHA256 校验通过，文字审查 40564 项通过。
