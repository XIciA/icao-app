# Ops Console 生产交付

`https://api.readyoufife.com/admin/` 是完整内部运营后台，复用现有域名与证书，无需新增 DNS。浏览器访问同源 `/admin/v1/admin/*`，由 ECS 去掉 `/admin` 前缀后
网关转发到专用 Ops API，数据库连接只存在于该服务端容器。普通用户 API 不注册管理路由，Ops
发布失败或回滚不会替换普通 API 镜像。

本目录不属于冻结的 Vercel 用户 Web，也不生成或发布 EdgeOne 用户 Web 产物。正式执行入口是
仓库根目录的 `scripts/deploy-ops-release.sh`；不得手工从任务分支复制文件上线。

## 首次部署前的外部准备

下列事实不会由仓库猜测，缺一项时发布会在切换流量前失败：

1. 代码及所需数据库 migration 已审查、合入 `origin/main`，生产 migration 账本与仓库完全一致。
   发布脚本只做只读 `--require-current` 检查，绝不应用 migration。
2. `api.readyoufife.com` 的 DNS A 记录已指向当前 ECS 公网 IPv4；执行时必须通过
   `ICAO_OPS_EXPECTED_PUBLIC_IP` 再次明确该地址。Caddy 复用现有 80/443 入口自动申请和续期 TLS，
   脚本会在切换前验证 DNS 和现有 `api.readyoufife.com` TLS，在切换后验证 Ops 主机证书、HSTS、
   页面和健康接口。
3. `/opt/icao/runtime/ops-api/.env` 是 root 所有、权限 `0600` 的普通文件，并严格使用
   `ops-api.env.example` 中的键；未知键和重复键都会被拒绝。`DATABASE_URL`、账号身份散列密钥和三个
   Ops 专用秘密只从服务器秘密管理流程写入，不进入 Git、终端历史、部署参数或聊天。
4. `/opt/icao/runtime/gateway/.env` 是 root 所有、权限 `0600` 的普通文件，只包含
   `OPS_TRUSTED_PROXY_SHARED_SECRET`。其值必须与 Ops API 文件中的同名值一致；网关覆盖浏览器提供的
   `X-Ops-Client-IP` 和 `X-Ops-Proxy-Secret`，不会把该秘密发给浏览器。
5. 当前生产备份工具、timer、`supabase_default` 网络和 `icao-gateway` 容器正常。发布会以只读事务
   确认 `ops_staff_accounts` 至少有一个未禁用 `admin`；缺失时立即停止，部署脚本绝不创建或修改账号。
   首次管理员仍按 PR37 的 `ops:staff:provision` 一次性交付流程另行创建。
6. 发布会生成新备份、校验 SHA-256，并在隔离临时库完整恢复成功后才允许切换。恢复前只从
   `supabase-db` 容器读取非空 `POSTGRES_PASSWORD`，通过继承的环境变量交给恢复脚本，随后立即
   `unset`；密码不会进入命令参数、日志或证据文件。
7. ECS 必须保有足够磁盘空间。脚本以 production 数据库实时大小为基线，在构建前要求可用空间至少
   为数据库大小的两倍再加 4 GiB，并在恢复前再次要求至少为数据库大小再加 1 GiB；不足时不创建
   候选运行时或临时数据库。
8. ECS 在取得 Ops 发布锁后会清理超过 24 小时的陈旧上传；本次上传及校验文件始终排除，锁忙时
   不执行清理，上传根目录本身或其条目遇到链接、非真实目录或非普通文件时均拒绝继续。

## 运行时结构

- `icao-ops-api`：`127.0.0.1:3102`，只加入 `supabase_default`，使用最小 Ops 环境白名单。
- `icao-ops-web`：`127.0.0.1:4180`，只提供已构建静态文件。
- `icao-gateway`：唯一公网入口；仅 Ops 域名的 `/v1/admin/*` 和 `/health/*` 到 `3102`，其余到
  `4180`。普通 `api.readyoufife.com` 仍只到 `3101`。
- 两个 Ops 容器使用独立镜像、只读文件系统、最小 capabilities 和健康检查；不存在浏览器到
  PostgreSQL 的网络配置或凭据。

## 正式执行

必须先获得本次生产部署授权，并在干净、最新的 `main == origin/main` worktree 中运行：

```sh
ICAO_OPS_PRODUCTION_CONFIRM=api.readyoufife.com \
ICAO_OPS_EXPECTED_PUBLIC_IP=<当前 ECS 公网 IPv4> \
./scripts/deploy-ops-release.sh deploy
```

脚本从 `git archive HEAD` 生成确定性源码包并校验 SHA-256，在 ECS 构建两个候选镜像。切换前依次
验证秘密文件和白名单、DNS、现有 TLS 网关、普通 API 管理路由隔离、候选生产配置、只读 migration
账本、现存管理员、Caddy/Compose、数据库备份和隔离恢复。随后保存当前镜像、环境和网关配置，并在
任何运行时或网关切换前原子发布 release 根目录唯一的 `ops-active-rollback` 指针，启动 Ops，最后才
更新公网网关。该全局指针只允许当前切换或当前已部署 release 的手工入口使用，旧 release 不得覆盖
新 release。切换后失败
会自动回滚；只有恢复验证全部通过后才消费快照。自动回滚本身若失败，指针保持有效，供同一
`release-id` 的正式手工入口重试。消费身份保存在各 attempt 自己的 `rollback-used`；同一正式构建
可以在前一次失败并成功回滚后建立新 attempt，已消费 attempt 则不能再次使用。

成功后，服务器保存 root-only 的源码、回滚快照和 `deployment-evidence.json`；同一份无秘密证据会
复制到 `.generated/ops-release/<release-id>/deployment-evidence.json`。证据包含 commit、压缩包摘要、
镜像 ID、备份文件名、migration/恢复/本地健康/公网 TLS 结果和回滚快照路径，不包含环境值、密码、
数据库 URL 或代理秘密。完成后按仓库正式发布规则为该 commit 创建经确认命名的 annotated tag，
并把 tag、commit 和证据路径写入人工发布记录；部署脚本不会自行创建或推送 Git tag。

## 手工回滚

自动回滚之外，如需在已成功发布后恢复该次发布前的状态，必须再次获得生产授权，在干净的最新
`origin/main` 上执行一次性回滚：

```sh
ICAO_OPS_PRODUCTION_CONFIRM=api.readyoufife.com \
ICAO_OPS_ROLLBACK_CONFIRM=<release-id> \
./scripts/deploy-ops-release.sh rollback <release-id>
```

回滚恢复服务器保存的 Ops 环境/Compose、上一组不可变镜像和原网关配置；若已有旧版本，只有公网
Ops 的 HTTPS、HSTS、页面、健康接口和旧 `x-icao-api-version` 标识全部验证通过，才会生成成功证据并
消费指针。若这是首次部署，则移除两个 Ops 容器并恢复没有 Ops 主机的网关，并连续确认两个容器
均不存在、Ops 公网页面和健康接口均不可访问。快照成功使用后会被标记，不能重复消费；回滚证据复制到
本机对应 `.generated` 目录。回滚不逆向数据库 migration，因此正式部署门禁要求 production
schema 在部署前已经正确进入当前状态。

线上入口使用账号、密码及动态验证码登录，无注册入口。现有本地后台继续在根路径工作，页面、权限和正式数据来源不变。可选配置 `OPS_FEEDBACK_STORAGE_URL` 与 `OPS_FEEDBACK_STORAGE_READ_TOKEN` 用于反馈附件读取，秘密只保存在服务器。
