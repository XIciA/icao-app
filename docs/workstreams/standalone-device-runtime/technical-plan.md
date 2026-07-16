# 设备独立使用技术方案

状态：双端发布与 Android 下载站方案已确认并实施

更新时间：2026-07-16

## 1. 方案结论

本任务采用最小环境改造方案，不重构 App 页面、业务模块、数据库或服务架构：

1. 在现有 ECS 前增加临时个人域名的 HTTPS 公网入口。
2. App 的 API、Supabase 和资源地址继续通过现有可替换配置注入。
3. iPhone 使用嵌入 JavaScript Bundle 的 Release 配置构建，并继续使用 Apple Development 签名。
4. Android 使用现有原生工程生成由项目专属密钥签名的 Release APK。
5. 保留现有 SSH 隧道和 Development Build 工作流，作为开发、排障和公网故障时的回退方式。
6. `download.feizhuicao.com` 由现有 ECS Caddy 提供静态下载页与 APK，不触碰只读设计仓库或 Vercel 主站。

该方案只改变“手机如何访问现有服务”和“安装包如何构建”，不改变产品功能和项目主体结构。

## 2. 过渡阶段定位

- 当前使用临时个人域名，只服务本人使用和少量受控 Android 测试。
- 公司主体、公司域名、备案、正式邮件、商店分发和商业运营仍属于后续正式阶段。
- 本任务不修改 `战略/总战略文档.md` 与 `战略/architecture-decisions.md`。
- 未来切换公司域名时，新旧入口并行一段时间，再通过新构建替换公开地址；数据库、账号和题库资源不迁移。

## 3. 公网入口方案

一个个人主域名下使用三个子域名：

| 入口 | 目标 | 承载能力 |
| --- | --- | --- |
| `api.<临时个人域名>` | ECS `127.0.0.1:3101` | 业务 API、同步、AI、健康检查 |
| `cloud.<临时个人域名>` | ECS `127.0.0.1:8000` | Supabase Auth、REST、Storage、音频签名地址 |
| `download.<临时个人域名>` | ECS 只读静态目录 | Android 下载页、`latest.apk`、版本信息 |

推荐在 ECS 安装 Caddy 作为唯一公网反向代理，配置文件纳入仓库的独立基础设施目录。选择 Caddy 的原因是配置量小、自动申请和续期 HTTPS 证书，适合当前单机 MVP 和临时域名阶段。

安全边界：

- 公网只开放 SSH、HTTP 和 HTTPS 所需端口。
- API、Supabase Kong、PostgreSQL、Mailpit 和连接池继续只监听 `127.0.0.1` 或 Docker 内部网络。
- 不向公网开放数据库、Studio、Mailpit或容器管理端口。
- 公网网关需要支持音频字节范围请求、录音上传、AI请求超时和后续 SSE。

## 4. Supabase 与 API 外部地址

公网入口建立后，只调整外部访问相关配置：

- Supabase Auth 的外部 API 地址改为 `cloud` HTTPS 入口。
- Supabase Site URL 和允许回调继续兼容 `feizhuicao://auth/callback*`。
- API 的 `SUPABASE_PUBLIC_URL` 改为 `cloud` HTTPS 入口，使资源签名地址对手机可见。
- App 的 API Base URL 改为 `api` HTTPS 入口。
- 继续使用现有数据库、JWT、用户、Storage Bucket 和对象 key，不执行数据库迁移。

封闭内测继续使用邮箱自动确认；Mailpit、真实外部邮件和密码找回邮件投递边界保持现状，不在本任务接入 SMTP。

## 5. 客户端配置方案

沿用当前三个公开配置边界：

- `EXPO_PUBLIC_ICAO_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

真实构建值通过受保护的本机环境或构建环境注入，不写入 Git。仓库只保存无真实值的示例和构建说明。

页面、认证、题库仓库和资源服务继续使用现有适配层，不在业务组件中写死临时域名。以后切换公司域名时只替换构建配置并重新生成安装包。

## 6. iOS 独立运行方案

- 保留当前 Apple Development 自动签名、当前 Team 和当前过渡期 Bundle ID。
- 使用 iOS `Release` 配置构建，使 JavaScript、字体和必要静态资源进入 App Bundle。
- 构建时注入公网 API、Supabase 和 publishable key。
- 安装后停止 Metro、SSH 隧道和本地资源服务，使用 Wi-Fi 与蜂窝网络完成真机验收。
- 签名到期后重新构建安装；本任务不解决长期分发资格。

现有 Development Build 与 `pnpm ios:phase2a` 保留，Release 独立运行使用单独命令和文档，避免两种模式混淆。

## 7. Android Release APK 方案

- Android 正式包名固定为 `com.feizhuicao.app`；iOS 继续使用 `com.anonymous.icao-app`，不改 iOS Bundle ID。
- 生成项目专属 Release Keystore，密钥文件和密码只存放在仓库外的受保护位置，并建立加密备份。
- 密钥采用带强随机密码的 PKCS#12，主副本位于本机受保护目录，密码存入 macOS Keychain，加密密钥副本保存到 iCloud Drive。
- Gradle 通过仓库外环境变量读取签名信息；Expo Prebuild 由本地 Config Plugin 可重复生成 Release 签名配置，不提交密钥和密码。
- `release` 构建不得继续使用 `debug.keystore`。
- 每次分发递增 `versionCode`，生成签名后的通用 Release APK、SHA-256 校验值和版本说明。
- 当前已安装 Debug APK 的设备在首次切换 Release 签名时需要卸载重装；此后的 Release 版本必须支持覆盖升级。

Android 安装包通过 `https://download.feizhuicao.com` 发给少量测试者。网页无密码但设置 `noindex, nofollow, noarchive`；固定入口 `latest.apk` 指向最新版本，带版本号产物继续保留在服务器但不列在页面。

## 8. 平台独立发布编排

Android 主命令为 `pnpm release:android`，按以下顺序执行：

1. 首次发布记录当前工作区全部非忽略文件及哈希；已有公开版本时先要求 Git 工作区干净。
2. 统一更新 App 显示版本、Android `versionCode` 和 iOS `buildNumber`，保持营销版本一致。
3. 运行 `pnpm check`；通过发布清单中的 API 指纹识别服务端变化。
4. API 指纹变化时先备份、构建候选镜像、重启、检查 `/health/ready` 并运行真实账号/同步验证；迁移文件变化时自动暂停，禁止顺带迁移数据库。
5. 构建并核验正式签名 Android APK，检查包名、版本、证书、内嵌公网地址和 SHA-256。
6. 上传带版本号 APK；Android 自身门禁成功后原子切换公开 `latest.apk` 和 `version.json`。
7. 从 HTTPS 下载入口复核 `noindex`、文件类型、文件哈希以及 API 健康状态。

iOS 使用 `pnpm release:ios` 单独运行检查与 `pnpm ios:standalone`，保持原 Bundle ID 覆盖安装。`pnpm release:dual` 只按 Android、iOS 顺序调用两个独立流程；iOS 失败不会撤销已上线的 Android。

## 9. ECS 变更与回滚

执行公网配置前必须：

1. 记录目标代码提交和文件范围。
2. 备份当前 ECS 网关配置、Supabase 环境文件、API 运行源码和镜像。
3. 不携带当前工作区无关改动进入部署包。
4. 不执行数据库 Migration。

变更后依次验证 HTTPS、`/health/ready`、认证、题库、资源解析、音频 Range、同步和 AI。

回滚时恢复 Supabase/API外部地址和原运行配置，停止公网网关；现有 SSH 隧道测试链路必须仍然可用。

## 10. 验证方案

### 自动验证

- `pnpm check`
- Expo环境检查和生产Bundle导出
- iOS Release真机构建
- Android Release APK构建
- Android APK签名证书、包名、版本号和SHA-256检查
- ECS `/health/ready` 与现有真实接口验证脚本

### 真机验证

- iPhone：停止Mac上的Metro、3101/8000隧道和本地资源服务后冷启动。
- Android：在干净设备安装APK，再用递增版本验证覆盖升级。
- 两端均检查登录、五题库、音频、学习数据、标注、同步、AI、前后台恢复和错误提示。
- Wi-Fi和蜂窝网络分别完成至少一轮代表性链路。

## 11. 不采用的方案

- 不把API、Supabase或音频继续通过Mac转发作为独立运行方案。
- 不把完整音频库打入安装包。
- 不为临时阶段引入新的后端、数据库、对象存储或账号系统。
- 不使用Android Debug签名进行分发。
- 不为了脱离Mac接入TestFlight、App Store、Google Play或完整EAS发布体系。
- 不在页面或业务数据中硬编码临时个人域名。

## 12. 主要风险与暂停条件

- 临时域名不能完成DNS、HTTPS、备案或ECS安全组配置时，暂停公网阶段。
- 公网开放后发现未鉴权接口、内部管理端口或敏感信息暴露时，立即关闭公网入口并回滚。
- Apple Development无法为目标Release构建生成有效签名时，保留Development Build，不扩大到付费Apple分发方案。
- Android Release密钥无法安全备份时，不生成对外测试APK。
- 若独立运行必须大改App业务结构、迁移数据库或改变账号体系，暂停并返回大流程。
- 当前工作区已有其他未完成改动；执行时如与目标文件冲突，必须隔离目标提交或明确文件集后继续。

## 13. 方案完成标准

本方案已经用户确认并按 `roadmap.md` 执行。当前 iOS、Android、下载站和双端发布证据记录在 `phase-log.md`。
