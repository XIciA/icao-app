# 独立测试栈

这是部署方法，不增加长期审批规则。当前正式服务、数据库、存储保持原位。

## 一次性初始化

在已授权 ECS 上运行 `python3 provision.py`，仅创建 `/opt/icao/testing`，拒绝覆盖已有目录。
使用当前正式服务的不可变镜像 ID 作为起点，新建 `icao-testing` Compose 项目、内部网络、
数据库目录、文件存储目录、JWT、数据库密码、身份摘要密钥及离线内容签名密钥。
使用无外部路由的 `172.30.244.0/24` 内部网段，初始化先检查冲突。主机网关直接访问固定的
API `.10:3101` 和 Kong `.11:8000`；不开放数据库或映射测试容器公网端口。
配置/凭据由 root 的 0700 目录保护，不进入 Git，也不打印到终端。

1. 先用现有备份工具生成并校验正式快照。
2. `docker compose -f /opt/icao/testing/compose.json up -d db`。
3. 在 systemd 一次性任务中运行 `restore.sh <快照绝对路径>`，避免 SSH 中断影响恢复。
   它只读正式角色名称，向测试实例补齐无登录归属角色；实际恢复及会话清除只连接测试容器。
   Storage 复制为独立文件，不能挂载正式目录、硬链接或以测试文件回写正式目录。
4. 核实 `restore-complete.json` 后启动其余服务，检查健康、登录、RLS、会员、学习与文件。
5. 验证原网关配置保持不变后，追加 `gateway.caddy` 中的两个虚拟主机并平滑 reload。
   新 DNS 使用 `test-api.readyoufife.com` 与 `test-cloud.readyoufife.com`。

失败恢复保留半成品供诊断；不要把命令重跑当成覆盖授权。只有确认该测试库是本次失败恢复
产生、尚未向开发者交付后，才能精确删除 `icao-testing-db` 内的 `icao_testing` 数据库重试。

## 外部副作用

默认 `ICAO_DATA_ENVIRONMENT=testing` 停用全部账户、凭据和清理后台任务；`NODE_ENV=test` 另有现有任务保护。
短信外发配置不复制。
Compose 只给测试服务连接 `internal: true` 网络，无外部路由；不复制正式短信、Apple、微信支付、
AI 或云供应商密钥。测试邮箱只投递到内部 Mailpit。固定短信验证码只对应专用测试号码，保存在
服务器 `credentials.json`，不会发短信或对真实号码自动确认。

因此初始化时真实支付、Apple/微信第三方登录和付费 AI 暂不可用，不能伪报这些链路通过。
需要这些能力时配置对应测试服务凭据并进行范围受控的外部连接验证；不得直接恢复正式 `.env`。
现有关键能力发布门禁仍会拒绝没有实际 AI 证据的 TestFlight 包。

## 客户端与后续部署

本地受保护的环境文件从服务器 `client.env` 获取，使用 `set -a; . <文件>; set +a` 导出。
`EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT=testing` 与 API/Auth 地址一起固定在构建中；SQLite、IndexedDB、
Keychain、录音和离线文件均独立。StoreKit 的 sandbox/production 与后端数据环境是不同概念。
正式候选仍需从 main 使用 production 配置重新构建，不能复用测试库归档。

测试 API 更新应从干净 `origin/develop` 构建新的不可变镜像，只替换测试 Compose 的 `api.image`，
先在测试快照库执行候选迁移并验证。初始化镜像并不代表 develop 自动部署已完成。
正式发布仍需用户明确指令；正式迁移在当时的正式库上执行，不以测试库覆盖正式库。
