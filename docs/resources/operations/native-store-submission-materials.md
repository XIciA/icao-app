# 听你五个 Native 商店提交材料

更新时间：2026-08-07

本文把可由代码、生产拓扑和正式产品名称证明的商店字段整理成可直接粘贴的草稿。真实审核邀请码、负责人手机号、Apple 团队信息、商店账号和证件信息不得写入仓库。

## 固定技术字段

| 字段 | 正式值或建议值 |
| --- | --- |
| 中文名称 | 听你五个 |
| 英文名称 | Read You 5 |
| iOS Bundle ID | `com.readyoufife.ios` |
| Android 包名 | `com.readyoufife.app` |
| URL Scheme | `readyoufife` |
| 运营主体 | 云启航科（成都）科技有限公司 |
| 主分类 | 教育 |
| 次分类建议 | 工具（以商店实际可选项为准） |
| Apple SKU 建议 | `readyoufife-ios-prod` |
| 版权 | `© 2026 云启航科（成都）科技有限公司` |
| 隐私政策 URL | `https://yunqihangke.com/apps/readyoufife/privacy/` |
| 隐私选择 URL | `https://yunqihangke.com/apps/readyoufife/privacy-choices/` |
| 用户协议 URL | `https://yunqihangke.com/apps/readyoufife/terms/` |
| 支持 URL | `https://yunqihangke.com/apps/readyoufife/support/` |
| 账号删除 URL | `https://yunqihangke.com/apps/readyoufife/account-deletion/` |
| Marketing URL | 可暂用 `https://yunqihangke.com/`；App 专属介绍页完成后再替换 |

上述五个 App 专属 URL 的源码已经准备，但尚未部署和终审；上线前必须逐个使用公网无登录窗口验证 HTTP 200、HTTPS 证书、移动端排版和页面内容。

## App Store 中文元数据草稿

### 名称与副标题

- 名称：`听你五个`
- 副标题：`航空英语与陆空通话学习`
- 主要语言：简体中文
- 关键词：`航空英语,陆空通话,ICAO英语,飞行英语,听力,口语,题库,单词,学习记录`

名称和副标题均不声称与 ICAO 或监管机构存在官方关系。关键词提交时应在 App Store Connect 再次检查 100 字节限制。

### 推广文本

把航空英语题库、听力、陆空通话、口语录音、AI 辅助反馈、单词学习与学习记录放在一个 App 中，支持邀请码账号和跨设备云同步。

### 完整描述

听你五个（Read You 5）是一款面向航空英语学习者的 iOS 与 Android 学习工具。

你可以在一个 App 中使用：

- 航空英语听力、900 句、陆空通话、OPI 等学习内容；
- 题库练习、收藏、标注、笔记和学习记录；
- 随身听、后台播放和系统媒体控制；
- 口语录音，以及在明确同意后使用的 AI 转写和文本辅助反馈；
- 单词查询、收藏与复习；
- 邀请码账号和支持的学习数据云同步；
- 内容纠错、意见反馈、账号安全和账号注销。

听你五个是独立的航空英语学习工具，不代表国际民用航空组织（ICAO）、民航监管机构、考试机构或其他政府组织。练习结果和 AI 输出仅供学习参考，不构成官方评分、认证、等级评定或运行安全建议。

部分功能需要网络；录音功能需要你在实际使用时授权麦克风。你可以拒绝 AI 数据处理或在设置中撤回同意，不影响无需 AI 的学习功能。

### 本版本更新说明草稿

- 正式启用“听你五个 / Read You 5”品牌与公司生产服务；
- 完成账号、学习记录、题库资源和私有文件的生产环境迁移；
- 增加 AI 录音与回答处理前的明确同意；
- 完善隐私政策、用户协议、账号注销和反馈能力；
- 优化双端发布配置、音频稳定性和数据同步验证。

最终提交时只保留实际包含在对应构建中的变化，不能把尚未进入 Release 包的内容写入更新说明。

## App Review 审核说明草稿

> 听你五个是独立的航空英语学习工具，不代表 ICAO、民航监管机构或考试机构。App 使用专属邀请码登录。审核专用邀请码已填写在 App Review 的登录信息字段中，审核期间不会过期。
>
> 登录后可从底部导航进入题库、学习、随身听和“我的”。口语录音只在审核员主动开始练习时申请麦克风权限；录音只有在点击转写并明确同意后才发送至 AI 服务。拒绝或撤回同意不影响其他学习功能。
>
> 账号注销路径：“我的”—“设置”—“账号安全”—“注销账号”。隐私政策、用户协议和反馈入口位于“我的”—“信息与帮助”。
>
> 如审核网络无法访问或邀请码异常，请使用 App Review 联系信息与我们联系；不要把审核邀请码写入公开描述、截图、仓库或客服网页。

负责人需要在 App Store Connect 的私密字段中填写一个专用、可重复登录、审核期内不失效的测试邀请码，并在提交前从全新设备验证该账号。

## Apple App Privacy 预填基线

下表按当前代码和服务端真实处理方式整理。Apple 的“收集”包含由 App 或第三方合作方传出设备并保存的数据；最终仍应由账号持有人按 App Store Connect 当时的问卷定义确认。

| Apple 数据类型候选 | 当前用途 | 与身份关联 | 用于跟踪 |
| --- | --- | --- | --- |
| User ID | 邀请码账号、认证、会话、同步和防滥用 | 是 | 否 |
| Other User Contact Info | 用户在反馈中自愿填写的联系方式 | 是 | 否 |
| Photos or Videos | 用户自愿添加的反馈图片 | 是 | 否 |
| Audio Data | 用户明确同意后提交的口语录音转写 | 是 | 否 |
| Other User Content | 回答文本、反馈、笔记、标注和用户文档 | 是 | 否 |
| Product Interaction | 学习进度、收藏、学习记录和功能使用状态 | 是 | 否 |
| Other Diagnostic Data | App/系统版本、请求状态、错误编号和必要安全日志 | 通常是或可能是 | 否 |

- 主要目的：App Functionality；安全日志同时用于 Fraud Prevention / Security。
- 当前没有第三方广告、广告归因、跨 App 跟踪或数据经纪用途。
- 当前没有行为统计 SDK；不要因为服务器保存必要运行日志而错误勾选“用于第三方广告”。
- Apple 隐私政策 URL 必填；User Privacy Choices URL 可使用账号删除页。

## Google Play Data Safety 预填基线

| 问题 | 当前建议答案 |
| --- | --- |
| 是否收集用户数据 | 是 |
| 是否共享用户数据 | 阿里云仅作为实现托管和 AI 功能的服务提供者；是否符合 Google 的 service provider 例外应按提交时定义确认 |
| 传输中是否加密 | 是，正式服务使用 HTTPS/TLS |
| 是否提供删除请求 | 是，App 内注销并提供公开账号删除 URL |
| 是否用于广告或营销 | 否 |
| 是否用于账号管理和 App 功能 | 是 |
| 是否允许用户选择提供 | 反馈联系方式/图片、录音和 AI 内容为可选；账号与同步必要数据不是可选 |

Google Play 对支持账号创建的 App 要求同时提供 App 内删除路径和公开网页删除入口。当前代码已经有 App 内永久注销，公开页源码也已准备；二者都必须随正式包和官网部署验收。

## 截图与审核素材矩阵

不要使用 Web、开发工具悬浮入口、模拟数据或包含真实用户隐私的截图冒充 Native 正式包。每个平台从最终 Release 构建采集：

1. 登录页：正式名称、邀请码登录和法律入口。
2. 题库首页：主要学习模块和正式内容。
3. 代表性学习页：题目、音频、收藏/标注工具。
4. 陆空通话或听力页：专业学习场景。
5. 随身听：播放队列、字幕或系统媒体能力。
6. 口语练习：录音界面；不得在截图中展示系统麦克风弹窗或真实录音内容。
7. AI 同意：明确说明发送录音/文本前的选择，不使用夸大宣传。
8. 学习记录或云同步：使用审核专用空白/演示账号，不含真实用户信息。
9. 账号安全：退出设备和注销账号入口。
10. 信息与帮助：隐私政策、用户协议和反馈入口。

截图尺寸、数量和语言以各商店提交页面的实时要求为准；带文字的截图应为目标语言单独制作。

## 上架前负责人必须补齐

- Apple Developer 组织团队、Apple ID、App Store Connect App 记录和不可变 SKU 最终确认；
- 审核联系人姓名、电话、邮箱和私密审核邀请码；
- 免费/付费、可用国家或地区、发布日期和内容版权声明；
- 年龄分级问卷的最终答案；当前产品不应勾选儿童专用或官方考试认证；
- 中国内地 App 备案号及商店要求展示的位置；
- Android 首发商店及各商店企业认证、软著或其他材料要求；
- 隐私政策、支持、账号删除和用户协议公开页的公司终审与线上验收；
- 最终 Release 包真机截图、商店图标和 Android Feature Graphic（如渠道要求）。

## 官方填报依据

- Apple App 信息与名称/副标题限制：<https://developer.apple.com/help/app-store-connect/reference/app-information/app-information>
- Apple 版本信息、描述、关键词和审核账号：<https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information>
- Apple App Privacy：<https://developer.apple.com/help/app-store-connect/reference/app-privacy/>
- Google Play 商店文案：<https://support.google.com/googleplay/android-developer/answer/13393723>
- Google Play Data Safety：<https://support.google.com/googleplay/android-developer/answer/10787469>
- Google Play 账号删除要求：<https://support.google.com/googleplay/android-developer/answer/13327111>
