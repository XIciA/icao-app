# Native 商业上线准备清单

更新时间：2026-08-09

## 结论

- 听你五个 / Read You 5 的中国内地原生 App 后端使用公司阿里云成都 ECS，因此正式运营前需要完成 **App 备案**。办理入口虽然叫“ICP 备案系统”，但它是 App 的互联网信息服务备案。
- 当前不提供 `readyoufife.com` 网页端，所以不需要为了 App 另做一个“网站 ICP 备案”。若以后把网站部署到中国内地并用该域名提供网页服务，再办理网站备案。
- 公司阿里云备案控制台当前显示“尚无备案信息”，公司主体和 App 备案申请都还没有提交；流程已推进到需要公司负责人接受《阿里云代备案服务协议》与信息收集声明的第一处人工节点。
- 服务器规格、正式域名、HTTPS 和生产数据迁移已经就绪；新域名已通过多地域公网验证，
  API 返回 200，Supabase 鉴权接口携带 publishable key 返回 200。Mac 上曾出现的握手失败由
  本机代理与 Fake DNS 引起，不需要购买 EIP。

## 已确定的正式标识

| 项目 | 正式值 |
| --- | --- |
| 中文名 / 英文名 | 听你五个 / Read You 5 |
| 主域名 | `readyoufife.com` |
| Native API / Supabase | `api.readyoufife.com` / `cloud.readyoufife.com` |
| iOS Bundle ID | `com.readyoufife.ios` |
| Android 包名 | `com.readyoufife.app` |
| URL Scheme | `readyoufife` |
| 运营主体 | 云启航科（成都）科技有限公司 |

这些值提交备案或商店后不应随意改变。Android 备案的签名、公钥和证书指纹必须从最终 Release 包提取。

## 技术清单

### 已完成

- 公司 ECS 上的 API、Supabase、数据库、Storage 和 HTTPS 网关已部署并健康运行。
- 旧生产数据已完整迁移：57 张业务表、6,761 个 Storage 文件及运行配置均通过哈希对比。
- 新版 App 仅使用 `api.readyoufife.com` / `cloud.readyoufife.com`，不兼容旧 API 域名或旧安装包。
- 数据库每日本机备份和隔离恢复演练已验证；异机数据库与 Storage 复制定时器已停用。
  当前明确接受“实例或系统盘丢失会同时丢失业务数据和本机备份”的风险。
- App 专属隐私政策、用户协议、App 支持和账号删除公开页源码已准备在 `official-site/apps/readyoufife/`，尚未部署，不能把源码路径当作商店或备案可访问 URL。
- App Store/Google Play 的中文文案、隐私问卷基线、审核说明和正式包截图矩阵已整理为商店提交材料，真实审核邀请码和主体联系人仍由负责人在商店私密字段填写。
- 正式名称、包名、域名和权限说明已写入发布配置；AI 录音/回答在首次发送前要求用户明确同意。
- 已生成 `v2026.08.07.0415` 正式发布候选元数据，并从受保护的 Android 正式证书提取备案预填所需的 MD5、SHA-256 与公钥；证书有效期至 2053 年，最终值仍要由 Release APK 复核。
- Native 回归通过：70 个测试套件、313 个测试，以及类型、Lint、音频边界和发布配置检查。
- 负责人个人 Team 签名的 iPhone Release 包已安装并通过首轮登录、题库加载和题库音频播放
  冒烟；Storage 的 6,761 个物理文件扩展属性已全量复核，五套题库代表音频 Range 请求均
  返回 HTTP 206。
- 旧账号中的 `api.feizhuicao.com`、`cloud.feizhuicao.com` 两条 A 记录已删除，新 ECS
  Caddy 也只保留两个 `readyoufife.com` 正式域名；未修改 `feizhuicao.com` 主域名或 `www`。
- 旧内测 APK 下载子域名的 A 记录和仓库发布入口已删除。旧 ECS 欠费停机且未被启动或
  释放，因此该清理没有改变 Vercel、公司主生产 ECS 或旧机中其他遗留项目的运行状态。

### 上线前仍需完成

1. 安装 Android SDK Build Tools 并接受其许可后，生成最终 Android Release APK/AAB，复核已经预提取的包名、签名 MD5、证书 SHA-256 和公钥。当前本机缺少 Build Tools，代码构建尚未开始。
2. 公司 Apple Developer Program 审核完成后，用公司 Team 签出商店包并在 App Store Connect 建档；
   当前个人 Team Release 仅用于负责人自己的 iPhone 冒烟。
3. iOS 与 Android 各做一次完整正式包真机验收：首轮 iPhone 的登录、题库和音频已经通过；
   仍需覆盖云同步、录音、AI 转写、反馈、注销账号和重装后恢复云数据，以及 Android 对应流程。
4. 负责人终审 App 内和公开页源码中已按真实数据流更新的隐私政策、用户协议，再把 App 专属法律页部署到现有公司官网，形成公开、长期稳定的 URL；不在生产 ECS 增加网页产品。
5. 正式构建前单独处理 Expo Doctor 维护项：评估 SDK 55 的补丁版本更新，并在 iOS/Android 真机验证 `react-native-track-player` 的新架构播放、后台和锁屏行为。当前实现及自动测试已通过，迁移收尾阶段不直接替换播放器或批量升级依赖。

## 备案与公司事项

### App 备案（必须）

准备公司营业执照、法定代表人/备案负责人资料与手机号、App 图标和服务说明、`readyoufife.com` 及新 ECS IP、iOS/Android 平台信息、Android Release 包的签名/公钥/证书信息，以及调用的第三方 SDK/服务清单。流程为：阿里云填写并初审 → 工信部短信核验 → 四川通信管理局审核 → 取得 App 备案号。备案后再按阿里云和属地要求确认公安联网备案。

同名 App 同时运行在 iOS 和 Android 时可在同一次 App 备案中添加两个平台。不要分别创建两个不同名称的备案。

### Apple（必须）

- 以公司组织加入 Apple Developer Program；组织注册需要合法实体、D‑U‑N‑S 编码、可代表公司签约的人、公司域名邮箱和可访问的公司官网。
- 官方年费当前为 99 美元或当地等值货币。
- 在 App Store Connect 完成 App 隐私问卷、隐私政策 URL、审核测试账号/邀请码、截图、分级、联系信息与审核说明。
- App 支持账号时必须能在 App 内发起账号删除；当前代码已经具备该入口和服务端级联删除，正式包仍需真机验证。

### Android（按目标渠道）

- 至少确定首发渠道并注册对应的公司开发者账号；中国大陆各安卓商店的企业认证和材料要求分别办理。
- iOS 固定使用 `com.readyoufife.ios`，Android 固定使用 `com.readyoufife.app`；各平台分别保持同一正式签名和连续升级链，并共用同一个 App 备案号。
- 若同时上 Google Play，再单独完成 Google Play 企业开发者注册、身份验证、数据安全表和测试/发布要求。

## 隐私与数据披露基线

当前 App 实际处理的数据包括：邀请码账号与昵称、登录/安全记录、学习进度/收藏/标注/学习记录、反馈文字和可选联系方式、可选反馈图片、设备与 App 版本信息、录音和回答文本、AI 同意与用量日志。

正式隐私政策至少要写清：

- 运营主体和 `privacy@yunqihangke.com` 联系方式；
- 每类数据的目的、处理方式、保存期限和删除方式；
- 麦克风和可选相册权限均在实际使用时申请，拒绝后不影响无关功能；
- 录音会经公司服务器发送至腾讯云语音识别用于转写，回答文本会发送至 DeepSeek 开放平台用于语法纠错和表达润色；签名音频链接默认 10 分钟，处理后删除，异常暂存最长 24 小时；
- 反馈图片默认保留 365 天，AI 单词缓存 30 天；其他账号/学习/反馈记录应写明以账号存续、客服处理或法定义务为界的确定规则；
- 用户可以撤回 AI 同意、注销账号、请求查阅/更正/删除数据；
- 第三方 SDK/受托处理者清单、共享数据种类、目的和隐私规则链接。

App 内原有的示例文案已经按当前真实数据流替换为 v3.0 技术草案；正式提交前仍应由公司负责人确认，并把同一版本发布到公开 URL。如业务加入支付、广告、推送、统计、手机号或微信登录，必须在上线前重新审计并更新政策及商店披露。

## 最少需要负责人亲自完成的节点

1. 阿里云备案中的法定代表人/负责人实名认证、短信核验和最终提交。
2. Apple/安卓商店的企业认证、付费、协议签署和最终上架提交。
3. 确认正式隐私政策、用户协议、客服渠道和内容/商标授权。

其余服务器配置、迁移、构建检查、备案材料技术字段整理和发布前验证可以继续自动完成。

## 官方依据

- 工信部《工业和信息化部关于开展移动互联网应用程序备案工作的通知》：<https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2023/art_920db564162e4312916a01bed6540ad8.html>
- 阿里云 App 备案 FAQ：<https://help.aliyun.com/zh/icp-filing/basic-icp-service/support/basics-about-icp-filling-for-apps>
- 阿里云 App 备案快速入门：<https://help.aliyun.com/zh/icp-filing/basic-icp-service/getting-started/quick-sta-rt-for-icp-filing-for-personal-app>
- 《中华人民共和国个人信息保护法》：<https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html>
- Apple Developer Program 组织注册：<https://developer.apple.com/help/account/membership/program-enrollment/>
- Apple App 隐私信息：<https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/>
- Apple App Review Guidelines：<https://developer.apple.com/app-store/review/guidelines/>
