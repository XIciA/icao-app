# 设备独立使用执行记录

更新时间：2026-07-13

## 本轮范围

- 用户已授权开始执行。
- 本轮只执行 iPhone 独立运行。
- Android Release、签名、密钥、Gradle、APK 和真机验收全部延期，不在本轮修改。
- 不修改总战略、架构决策、UI、业务结构或数据库 Schema。

## 阶段 0：边界冻结与回滚准备

状态：已完成

完成内容：

- 确认临时域名为 `feizhuicao.com`。
- 权威 DNS 已验证：`api.feizhuicao.com` 与 `cloud.feizhuicao.com` 均解析到当前 ECS。
- 阿里云安全组已由用户开放公网 TCP 80/443；内部 API、Supabase、数据库和管理端口未直接开放。
- 当前 Git `HEAD` 与 `origin/main` 一致；题库、标注和音频审计等既有未提交改动保持原状，不进入 ECS 部署文件集。
- ECS 改造前健康检查通过，API 与数据库均为 `ok`。
- 已在 ECS 创建权限为仅 root 可读的回滚备份：
  `/opt/icao/backups/standalone-ios-20260713T121454Z`。
- 已保留 API 回滚镜像标签：
  `icao-api:rollback-standalone-ios-20260713T121454Z`。

阶段 0 明确未做：

- 未执行数据库迁移。
- 未修改 Supabase、API 或 App 运行配置。
- 未启动公网网关。
- 未修改任何 Android 文件。

进入下一阶段判断：满足阶段 1 的执行条件。

## 阶段 1：公网 HTTPS 与服务地址切换

状态：已完成

完成内容：

- 新增并部署最小 Caddy 公网网关，仅代理两个入口：
  - `https://api.feizhuicao.com` → ECS 回环 API `127.0.0.1:3101`
  - `https://cloud.feizhuicao.com` → ECS 回环 Supabase Kong `127.0.0.1:8000`
- 两个域名均已自动签发并加载受信任的 Let’s Encrypt 证书。
- API、Kong、数据库、Studio、Mailpit 等原有服务端口继续保持回环或容器网络访问；安全组只新增公网 TCP 80/443。
- Supabase 对外配置已切换为 `cloud` HTTPS 地址；App 深链回调保持 `feizhuicao://auth/callback*`。
- API 的资源公开地址已切换为 `cloud` HTTPS 地址。
- 已按最小范围重建 Supabase Auth、Storage、Studio 与 API；因 Auth/Storage 容器地址变化，随后重启 Kong 刷新上游解析。
- 所有相关容器健康检查通过，API `/health/ready` 返回 API 与数据库均为 `ok`。

公网代表性验收：

- Supabase Auth 设置接口通过 publishable key 返回 HTTP 200。
- 注册、登录、错误密码、跨会话同步、重复提交幂等和版本冲突验证全部通过。
- 5 个题库共 4947 张卡片从公网 API 加载成功。
- 3678 个音频映射通过，代表音频经公网签名 URL 下载成功，字节数与 SHA-256 均匹配。

回滚信息：

- 环境文件切换前副本已加入阶段 0 的受保护备份目录。
- 停止 `/opt/icao/runtime/gateway` 网关、恢复环境文件副本并重建受影响容器，可回到原回环入口状态。

## 阶段 2：iOS Release 独立构建

状态：已完成

已完成内容：

- 新增 `pnpm ios:standalone`，只使用公网 HTTPS 地址构建并安装 iOS Release。
- 构建时可从 ECS 受保护环境读取客户端 publishable key；不会写入仓库或打印具体值。
- 构建入口会在开始编译前拒绝 localhost、回环地址和私网地址，避免误生成仍依赖 Mac 的 Release 包。
- 构建命令直接使用 Xcode 生成 Release、校验内嵌 bundle，再通过 Apple 设备工具安装和启动，避免启动开发服务器。
- 现有 `pnpm ios:phase2a` Development Build 与 SSH 隧道流程保留，互不覆盖。
- 不安装或启用 EAS Update；本轮目标仅为 Apple Development 签名有效期内的独立运行。
- `pnpm check` 全部通过：内容检查通过，App 26 套共 68 个测试通过，API 2 个文件共 173 个测试通过，TypeScript、Lint 与 API 生产构建均通过。
- iOS `Release` 已完成真实构建、签名、安装和启动；Xcode 结果为 `BUILD SUCCEEDED`。
- Release 产物包含内嵌 JavaScript Bundle，不需要运行时连接 Metro。
- Bundle 已确认包含 `https://api.feizhuicao.com` 与 `https://cloud.feizhuicao.com`，且不含 `127.0.0.1:3101`、`127.0.0.1:8000` 或 Mac 局域网服务地址。
- Apple Development 签名、应用签名完整性和当前 Provisioning Profile 均已验证。
- 当前 Bundle ID 为 `com.anonymous.icao-app`，签名 Team 为 `4DPKHJKP5V`。
- 当前 Profile 有效期至北京时间 `2026-07-18 19:42:03`；到期或签名变化后需重新运行 `pnpm ios:standalone` 安装。

## 阶段 3：iPhone 独立运行终验

状态：自动化证据已完成，等待用户完成断开 Mac 的人工终验

已完成的自动化与运行证据：

- Release App 已安装到 `OOMG` 并成功启动，设备上可确认应用进程正在运行。
- 安装并启动后，Mac 上没有 Metro `8081`、本地 API `3101`、Supabase `8000` 监听，也没有项目 SSH 隧道。
- ECS 日志已记录该 Release App 经 `api.feizhuicao.com` 发出的真实请求，包括同步拉取/提交、听力题库、资源解析与 AI 查词，均成功返回。
- 公网注册/登录、错误密码、会话恢复、跨会话同步、幂等提交、版本冲突、五题库、音频映射及代表音频下载均已通过。
- Android 原生配置、签名、Gradle、APK 与设备均未修改。

唯一待完成的人工终验：

1. iPhone 与 Mac 断开连接，并彻底退出后重新打开 App。
2. 关闭 iPhone Wi-Fi，改用蜂窝网络冷启动 App。
3. 检查登录或会话恢复、打开任一题库、播放一段音频、保存一次学习/标注记录并执行一次 AI 查词。
4. 将 App 切到后台再打开，确认会话和学习状态仍可恢复。
5. 若没有出现红色服务配置错误或网络错误，即可确认本轮 iOS 独立运行验收完成。

重新构建与安装入口：

```sh
cd /Users/zhouyide/Desktop/icao-app
pnpm ios:standalone
```

说明：该命令的构建过程需要 Mac 和已连接的 iPhone；安装完成后，App 在本次 Apple Development 签名有效期内不再依赖 Mac。运行时仍需手机联网访问 ECS 公网服务。
