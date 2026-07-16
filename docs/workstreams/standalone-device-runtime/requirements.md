# 设备独立使用需求

状态：Android 小规模分发与双端发布实施中

更新时间：2026-07-16

## 1. 核心目标

保持当前 App 已有功能、页面、视觉和学习流程不变，使安装到手机上的 App 能够独立使用。

> App 安装到手机后，Mac 关闭，用户仍可正常打开并使用当前 App。

## 2. 独立使用的定义

- App 运行时直接通过个人域名访问现有云端服务，不依赖 Mac 中转。
- iPhone 在 Apple Development 签名有效期内，可以脱离 Mac 独立运行。
- Android 通过 Android Release APK 安装后，可以脱离开发电脑独立运行。
- 当前登录、题库、音频、学习记录、标注、笔记、同步和 AI 等已实现能力保持可用。

独立使用不等于离线使用。手机仍需联网；本阶段不增加完整离线学习或资源下载能力。

## 3. 本阶段范围

### iPhone

- 生成可安装到当前 iPhone 的独立运行版本。
- 保持 Apple Development 签名方式。
- 在签名有效期内，App 不依赖 Metro、SSH 隧道或 Mac 上的本地服务。

### Android

- 生成可直接安装的 Android Release APK。
- 固定正式包名为 `com.feizhuicao.app`，使用项目专属 Release 密钥签名。
- 通过 `https://download.feizhuicao.com` 无密码、小规模分发。
- 后续版本能够正常覆盖升级，并保留用户账号和学习数据。

### 平台独立发布

- iOS 必须继续使用现有 Bundle ID `com.anonymous.icao-app`，不能被系统视为另一个 App。
- Android 使用 `pnpm release:android` 独立检查、构建并更新下载站；iPhone 是否连接不参与 Android 门禁。
- iOS 使用 `pnpm release:ios` 独立检查、构建并覆盖安装；Android 是否发布不参与 iOS 门禁。
- `pnpm release:dual` 仅作为“先 Android、后 iOS”的便利入口，后执行的平台失败不得回滚前一个平台。
- 首次发布以当前工作区为准，记录完整文件清单和 SHA-256；后续发布默认要求 Git 工作区干净。

### 云端访问

- 使用当前个人域名，为 App 提供稳定、安全的 HTTPS 访问入口。
- 当前 ECS、业务 API、Supabase、题库资源和音频资源继续使用。
- 当前个人域名未来可以替换为公司域名，不要求重做 App 功能或迁移业务数据。

## 4. 保持不变

- 不改变当前 UI、品牌风格、导航和核心学习流程。
- 不删除、降级或重做当前已有功能。
- 不改变 React Native + Expo + TypeScript、ECS、Supabase 和 TypeScript API 的总体架构。
- 不迁移数据库，不重建账号体系，不更换 AI 供应商。
- 不把完整音频资源放进安装包。

## 5. 验收效果

### iPhone

1. App 使用 Apple Development 签名安装成功。
2. Mac 关闭或手机与 Mac 断开后，App 可以冷启动和重新打开。
3. 用户可以完成登录、题库学习、音频播放、学习记录保存、标注、同步和 AI 代表性链路。
4. App 重启后，账号会话和学习数据能够正常恢复。

### Android

1. Release APK 可以安装到未配置开发环境的真实 Android 手机。
2. Mac 关闭后，App 可以冷启动并完成与 iPhone 相同的代表性核心链路。
3. 新版本 APK 可以覆盖升级，用户账号和学习数据不被意外清除。

### 整体验收

1. 停止 Mac 上全部 ICAO 开发进程后，iPhone 和 Android App 仍可使用。
2. Wi-Fi 和蜂窝网络下均能访问登录、API、音频、同步和 AI 服务。
3. 当前 App 已有功能没有因独立运行改造出现明显回归。
4. 下载页展示版本号、更新时间、安装包大小、更新说明和 SHA-256。
5. 下载页同时通过 HTML 与 HTTP 响应声明 `noindex`，首版不增加 App 内更新检查。

## 6. 本阶段不做

- 不接入 TestFlight、App Store、Google Play 或国内安卓应用市场。
- 不改变 Apple Development 签名路线。
- 不进行正式商业上架、付费、会员、推送或公开运营。
- 不建设完整离线学习、题库下载或音频包下载。
- 不迁移到公司域名，只保留未来替换能力。
- 不把 Android 小规模分发扩大为公开商业发布。
- 不给下载页增加密码、账号、测试者登记或应用内自动更新。

## 7. 过渡阶段定位

本任务是公司主体、正式公司域名、备案和商店手续完成前的过渡阶段：先使用临时个人域名，让当前 App 可以脱离 Mac 独立运行，并提供 Android Release APK 小规模受控测试。

本任务不改变总战略和架构决策的长期方向，也不要求同步修改两份上层文档。实现应以环境配置、构建和运行入口优化为主，不大规模调整现有项目结构。未来公司主体与公司域名具备后，再替换公开访问入口并进入正式发布流程。

## 8. 文档与执行状态

本需求对应的大流程文档已生成并确认：

1. `technical-plan.md`
2. `technical-audit.md`
3. `roadmap.md`

当前 iOS 自动执行证据和 Android/下载站实施证据统一记录在 `phase-log.md`。
