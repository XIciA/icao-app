# 第二阶段 A 环境边界

本目录记录 A0 确认的部署和凭证边界，不保存运行密钥。

## 当前基线

- Git：`main`，起点提交 `6e6a4519eecda00a40eb19dc96d417693623b7be`，A0 启动前工作区干净。
- ECS：阿里云成都，Ubuntu 22.04，4 vCPU，约 7.1 GiB 内存，40 GB 系统盘。
- Docker：29.1.3；Docker Compose：2.40.3；当前无容器。
- 目录：`/opt/icao/runtime`、`/opt/icao/backups`，权限 `750 root:root`。
- 访问：项目专用 SSH 密钥；不在仓库、文档或聊天中保存私钥。

## 服务暴露边界

正式域名和 HTTPS 就绪前：

- Supabase API gateway 和 TypeScript API 只绑定 ECS 本机地址，通过 SSH 隧道访问。
- PostgreSQL、Supavisor、Storage 内部接口和 Studio 不直接暴露公网。
- RN 不通过公网 HTTP 发送邮箱密码、access token 或学习数据。
- 不修改域名、备案、微信、短信、SMTP、AI、商店或付费资源。

未来有受信任 HTTPS 后，只由反向代理暴露 443；业务服务和数据库继续保留在容器网络或本机端口。

## 配置分类

### 允许进入客户端的公开配置

- Supabase public URL。
- Supabase publishable key。
- 业务 API public URL。
- 数据版本和功能开关。

### 仅允许存在于 ECS 的私密配置

- PostgreSQL 密码和连接串。
- Supabase secret/service key、JWT 签名材料和 Dashboard 密码。
- Storage 管理密钥。
- 后续 SMTP、短信、微信、AI 或其他第三方密钥。

所有真实 `.env` 文件必须位于被 Git 忽略的路径；仓库只允许提交 `.env.example`。

## 延期但必须保持的接口

- `AuthService`：匿名、手机号、微信、Apple provider。
- `ObjectStorage`：从自托管 Storage 迁移到 OSS/CDN。
- 业务 API：AI Gateway、entitlement 和运营能力。
- 备份：ECS 内备份未来扩展到云快照或异机副本。
