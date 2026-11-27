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
2. 将 `host-isolation.sh` 放到测试目录、安装并 enable/start `icao-testing-host-isolation.service`，
   精确阻止测试内网向宿主机主动建立连接，保留主机发起请求的响应；Docker 内部网络自身不隔离宿主网关。
   然后 `docker compose -f /opt/icao/testing/compose.json up -d db`。
3. 在 systemd 一次性任务中运行 `restore.sh <快照绝对路径>`，避免 SSH 中断影响恢复。
   它只读正式角色名称，向测试实例补齐无登录归属角色；实际恢复及会话清除只连接测试容器。
   恢复后 `rekey-identities.py` 用测试摘要密钥重建已恢复的账号映射与终身权益防重复摘要，保留账号 ID。
   Storage 复制为独立文件，不能挂载正式目录、硬链接或以测试文件回写正式目录。
4. 核实 `restore-complete.json` 后启动其余服务，检查健康、登录、RLS、会员、学习与文件。
5. 验证原网关配置保持不变后，追加 `gateway.caddy` 中的两个虚拟主机并平滑 reload。
   新 DNS 使用 `test-api.readyoufife.com` 与 `test-cloud.readyoufife.com`。

失败恢复保留半成品供诊断；不要把命令重跑当成覆盖授权。只有确认该测试库是本次失败恢复
产生、尚未向开发者交付后，才能精确删除 `icao-testing-db` 内的 `icao_testing` 数据库重试。

## 外部副作用

初始化先使用无外部路由的恢复配置。恢复后启用完整运行时：

- 部署支持测试签名密钥的 develop 制品后，运行 `enable-full-runtime.py`，只复用经审阅的供应商账号配置。
- 脚本备份并清除快照中的可重放外部凭据、支付尝试和通知队列；保留账户、学习、会员与订单历史。
- `NODE_ENV=production` 运行全部业务和后台任务；`ICAO_DATA_ENVIRONMENT=testing` 只表示独立数据环境。
- API/Auth 加入单独出口网，只允许公网 HTTP(S)，包括 Apple 证书撤销状态查询；宿主机、正式入口和私网仍禁止主动访问。安装更新后的 `host-isolation.sh` 和 `full-runtime-egress.sh`，由现有 systemd 服务持久化。
- 短信使用真实供应商，删除固定验证码；内部 hook 名称只映射到测试 API IP。数据库、JWT、内容签名和凭据加密密钥不复制。为保留已复制的微信账号映射，身份及终身权益摘要配置复用原值；测试 JWT 仍不能访问正式数据。
- 微信支付使用同一商户及测试回调，真实付款需本人操作；Apple 沙盒通知指向测试 API，正式通知地址不变。真实第三方账号的撤销授权可能影响同一 App 的正式登录，删除/解绑验收应使用专用测试 Apple/微信账号。
- `verify.py` 验证数据隔离；AI 使用 `ICAO_RELEASE_ENVIRONMENT=testing` 的完整 live verifier。配置成功、供应商验证、真机端到端验证分别记录，不以配置存在冒充功能通过。

此脚本只初始化一次，不得重跑清除已经开始测试的订单。后续密钥轮换仅修改对应配置。

## 客户端与后续部署

本地受保护的环境文件从服务器 `client.env` 获取，使用 `set -a; . <文件>; set +a` 导出。
`EXPO_PUBLIC_ICAO_DATA_ENVIRONMENT=testing` 与 API/Auth 地址一起固定在构建中；SQLite、IndexedDB、
Keychain、录音和离线文件均独立。StoreKit 的 sandbox/production 与后端数据环境是不同概念。
正式候选仍需从 main 使用 production 配置重新构建，不能复用测试库归档。

测试 API 更新应从干净 `origin/develop` 构建新的不可变镜像，只替换测试 Compose 的 `api.image`，
先在测试快照库执行候选迁移并验证。初始化镜像并不代表 develop 自动部署已完成。
正式发布仍需用户明确指令；正式迁移在当时的正式库上执行，不以测试库覆盖正式库。
