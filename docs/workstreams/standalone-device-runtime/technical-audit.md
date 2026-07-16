# 设备独立使用技术盘点

状态：保留 2026-07-13 基线；2026-07-16 已补充发布前复核

盘点日期：2026-07-13

> 本文保留执行前的只读基线，因此下文“当前”均指盘点时状态。公网 HTTPS 与 iOS Release 的最新执行结果以 `phase-log.md` 为准。

## 1. 盘点结论

当前 App、ECS、Supabase、题库、同步和 AI 主体能力已经具备，独立运行不需要重构项目。缺口集中在四处：

1. ECS 尚无公网 HTTPS 反向代理和证书。
2. App 的真实服务地址仍由 `pnpm ios:phase2a` 通过 Mac 隧道注入。
3. iPhone 尚未生成嵌入 JavaScript Bundle 的目标 Release 构建。
4. Android Release 仍使用 Debug签名，尚无可分发 APK。

因此当前方案成立，正确方向是补齐环境入口和双端构建，而不是修改产品页面或业务架构。

## 2. 仓库与工作区状态

- 当前仓库：`/Users/zhouyide/Desktop/icao-app`
- 当前分支：`main`
- 当前提交：`418f8e0`，与 `origin/main` 一致。
- 工作区存在其他任务的未提交改动，涉及题库标注与音频映射审计；本任务执行时不得把这些改动带入ECS部署或发布构建。
- 本 workstream 当前只新增文档，没有修改App、服务端或原生配置。

## 3. 当前运行链路

现有完整真机测试链路为：

```text
iPhone Development Build
-> Mac Metro :8081
-> Mac SSH本地转发 :3101 / :8000
-> ECS 127.0.0.1:3101 / 127.0.0.1:8000
-> API / Supabase / Storage / PostgreSQL
```

`scripts/start-phase2a-ios.sh`负责建立隧道、从ECS读取Supabase publishable key并向Metro注入公开配置。仓库没有可直接用于Release的真实环境文件；`.env.example`仍是 `127.0.0.1` 示例。

结论：当前功能依赖ECS，但手机到ECS之间仍依赖Mac作为入口。

## 4. 客户端配置边界

现有代码已经具备可替换入口：

- `src/platform/api-client.ts`读取 `EXPO_PUBLIC_ICAO_API_URL`。
- `src/features/auth/auth-service.ts`读取Supabase URL和publishable key。
- `src/features/question-bank/platform/resource-service.ts`把资源签名地址转换到当前Supabase公开入口。
- 页面和题库业务没有直接绑定Mac局域网IP或ECS公网IP。

结论：切换为个人域名不需要重写页面、题库仓库、认证、同步或AI客户端。

## 5. iOS 状态

| 项目 | 当前状态 |
| --- | --- |
| 设备 | iPhone `OOMG` 当前可连接 |
| Bundle ID | `com.anonymous.icao-app` |
| 签名 | Apple Development，Automatic Signing |
| Team | 已配置个人Team |
| Provisioning Profile | 有效期至 `2026-07-18T11:42:03Z` |
| 当前安装方式 | `expo run:ios --device` Development Build |
| Release真机产物 | 未发现 |
| 独立运行验证 | 未执行 |

当前Profile包含 `get-task-allow=true`，属于开发签名。项目原生配置同时为Debug和Release指定Apple Development，因此可以进入Release配置实测，但是否能在当前免费Team下稳定安装运行必须由真实构建确认。

结论：iOS无需更换签名路线，缺少的是Release构建、公开环境注入和脱离Mac真机验收。

## 6. Android 状态

| 项目 | 当前状态 |
| --- | --- |
| Package / applicationId | `com.anonymous.icaoapp` |
| 版本 | `versionCode 1` / `versionName 1.0.0` |
| Debug签名 | 项目自带 `debug.keystore` |
| Release签名 | 仍指向Debug签名 |
| 当前产物 | 只有 `app-debug.apk` |
| Release APK | 未生成 |
| 当前连接设备 | 未检测到ADB设备 |

Android工具链已存在，JDK、SDK和Gradle工程可用于Release构建。阻塞项是项目专属Release密钥、安全注入、Release APK构建以及真实Android设备安装/升级验证。

当前Debug安装与未来Release签名不同，首次切换时需要卸载Debug版；Release密钥固定后，后续APK才能覆盖升级。

## 7. ECS 与公网状态

当前ECS运行正常：

- `icao-api` 容器健康，`/health/ready` 返回API和数据库均为 `ok`。
- Supabase Auth、PostgreSQL、Kong、REST、Storage、Studio、Mailpit和连接池容器均在运行。
- API只绑定 `127.0.0.1:3101`。
- Supabase Kong只绑定 `127.0.0.1:8000` 和 `127.0.0.1:8443`。
- PostgreSQL、Mailpit和连接池也未直接暴露公网。

公网入口尚未建立：

- ECS当前只监听SSH公网端口，没有80/443监听。
- Nginx与Caddy均未运行。
- 未发现Nginx/Caddy站点配置。
- 未发现Let’s Encrypt证书目录。
- API没有公网外部URL配置。

结论：当前服务安全地保持私有状态，但手机无法在没有SSH隧道时访问。

## 8. Supabase 外部地址与认证状态

当前容器配置仍面向隧道/本机：

- Auth `API_EXTERNAL_URL=http://127.0.0.1:8000/auth/v1`
- Auth `GOTRUE_SITE_URL=http://127.0.0.1:3000`
- API `SUPABASE_PUBLIC_URL=http://127.0.0.1:8000`
- 回调允许列表已包含 `feizhuicao://auth/callback*`
- 邮箱注册自动确认已开启，公开注册未禁用。

现有App深链基础可继续使用。公网阶段需要替换外部URL并验证回调，不需要更换JWT、用户表或数据库。

Mailpit只绑定ECS本机，当前没有正式SMTP。受控账号注册和登录可以工作，但真实外部密码找回/换绑邮件仍不是本任务的公开能力。

## 9. 数据、资源与AI状态

- 当前题库为5套、27分类、239题组、4947张卡片。
- 当前校验识别3678张引用音频卡和3895个资源条目。
- 题库可使用远程数据并回退缓存/内嵌数据。
- 音频通过Storage签名地址和现有资源解析接口访问，不需要打进安装包。
- 学习记录、标注和笔记已有本地持久化与云同步边界。
- AI通过ECS业务API调用，模型密钥保留在服务端。

结论：独立运行不需要数据迁移、资源迁移或AI代码迁移，只需确保域名入口覆盖现有API与Storage路径。

## 10. 当前验证基线

2026-07-13只读盘点期间执行 `pnpm check`：

- 内容检查通过。
- App TypeScript与Lint通过。
- App Jest：25套、60个测试通过。
- Contracts TypeScript检查通过。
- API TypeScript与Lint通过。
- API Vitest：2个文件、173个测试通过。
- API生产构建通过。

未执行iOS Release构建、Android Release构建或公网联调，因为这些属于路线图确认后的实施范围。

## 11. 缺口与风险分级

### P0：独立运行前必须解决

- 明确临时个人域名及DNS控制权。
- 确认大陆ECS的备案与安全组条件允许80/443访问。
- 建立HTTPS公网反向代理和证书续期。
- 更新Supabase/API外部公开地址并完成真实端点验证。
- 建立Release构建环境值注入方式，禁止回环和Mac局域网地址进入产物。
- 建立Android专属Release签名和安全备份。

### P1：设备验收必须解决

- iOS Release在Apple Development有效期内的安装与冷启动。
- Android Release APK干净安装和覆盖升级。
- Wi-Fi、蜂窝网络、音频Range、录音上传、同步和AI真机链路。
- Mac全部相关进程停止后的双端独立使用证明。

### P2：过渡阶段持续控制

- 临时域名未来切换公司域名时的兼容窗口。
- Apple Development签名到期后的重签安装。
- 小规模Android APK的版本、校验值和测试者范围记录。
- Mailpit不对公网提供真实邮件的明确边界。

## 12. 总体判断

本任务技术上可行，且可以保持当前项目结构基本稳定。建议执行顺序为：

```text
临时域名与回滚准备
-> HTTPS公网入口
-> 客户端Release配置
-> iPhone独立运行
-> Android Release签名与APK
-> 双端回归和收口
```

当前没有需要改变总战略或重做App功能的技术阻塞；真正的外部前置条件是临时域名、DNS、备案/安全组和真实Android设备。

## 13. 2026-07-16 发布前复核

- iOS 当前 Bundle ID 仍为 `com.anonymous.icao-app`，本任务禁止更换。
- Android 原配置仍为 `com.anonymous.icaoapp` 且 Release 使用 Debug 签名；本轮将其一次性切换为 `com.feizhuicao.app` 和项目专属签名。
- 权威 DNS 已确认 `download.feizhuicao.com` 的 A 记录指向 `47.109.132.161`，TTL 为 600，解析线路为默认。
- ECS 已运行 Caddy 2.11.4，`api` 与 `cloud` HTTPS 正常；下载站可在同一网关增加只读静态目录，不开放新的内部服务端口。
- 本机具备 Java 17、Android SDK、`apksigner`、`apkanalyzer`、macOS Keychain 与 iCloud Drive，可安全生成、验证和备份 Release 密钥。
- 当前 Git 工作区有大量用户未提交改动；用户明确授权 Android 首版按当前工作区构建并记录完整清单和哈希，后续 `pnpm release:android` 默认执行干净工作区门禁。
- 首版只建设网页下载入口，由测试者自行检查；不实现 App 内更新检查、密码保护或测试者登记。
