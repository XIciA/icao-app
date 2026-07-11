# ECS 主机初始化（第二阶段阶段 0）

本目录只准备开发/内测 ECS 的 Docker 运行环境，不部署 Supabase、业务 API、数据库或公开服务。

## 执行方式

在阿里云 Workbench 的 `root` 终端中执行以下命令。不要在聊天中发送密码、私钥、令牌或任何 `.env` 内容。

```bash
curl -fsSL https://raw.githubusercontent.com/<你的仓库>/main/infra/host/bootstrap-docker-host.sh -o /tmp/bootstrap-docker-host.sh
bash /tmp/bootstrap-docker-host.sh
```

仓库尚未推送时，可在本机将脚本安全复制到 ECS 后执行；不通过聊天粘贴或保存任何密钥。

## 本步骤会做什么

- 通过 Ubuntu/阿里云镜像安装 Docker Engine、Docker Compose Plugin。
- 启动 Docker 服务。
- 创建 `/opt/icao`、`/opt/icao/runtime` 和 `/opt/icao/backups` 目录。

## 本步骤不会做什么

- 不开放端口，不修改安全组。
- 不部署 Supabase、PostgreSQL、Storage、业务 API 或 Nginx/Caddy。
- 不写入品牌域名、Bundle ID、微信、短信、邮件或 AI 凭证。
- 不创建真实用户或上传题库、音频、图片和录音。

执行后保留终端输出中的 Docker 版本即可；下一步由阶段 0 门禁结论决定是否进入实际服务部署。
