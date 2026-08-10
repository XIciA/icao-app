# 历史归档：第二阶段阶段 0——前置条件与高风险验证

状态：进行中

更新时间：2026-07-12

## 已确认

- 长期运营主体为公司。
- ECS 已创建：阿里云中国内地、成都、Ubuntu 22.04、4 核 8 GiB、40 GiB 系统盘。
- 当前 ECS 为个人版按量免费试用，只作为开发/内测技术环境；不可用于 ICP 备案，不承载公开正式服务。
- 已通过项目专用 SSH 密钥建立直连；现有密码和其他密钥未读取或修改。
- Docker `29.1.3`、Docker Compose `2.40.3` 已安装并启用；`/opt/icao/runtime` 和 `/opt/icao/backups` 已创建。
- 当前执行范围只包含 Docker 主机初始化、环境边界和可行性验证；不部署真实登录、业务数据、AI 或公开 API。

## 密钥边界

| 类别 | 当前状态 | 允许位置 | 禁止位置 |
| --- | --- | --- | --- |
| Supabase JWT/服务端密钥 | 未创建 | 服务器 `infra/runtime/.env` | RN、Git、聊天记录 |
| 微信 AppID/Secret | 未申请 | 服务器受限环境变量 | RN、Git、聊天记录 |
| 短信/邮件/AI 密钥 | 未开通 | 服务器受限环境变量 | RN、Git、聊天记录 |
| 客户端公开配置 | 未创建 | 后续 Expo public env | 服务端密钥字段 |

## 微信 Auth 门禁

结论：**尚未通过，阻塞真实微信登录实现。**

- 自托管 Supabase 官方 OAuth provider 列表不包含微信。
- 官方自定义 OAuth/OIDC 文档以 Supabase 平台控制台创建 provider 为前提，不能作为自托管实例可直接配置微信的证据。
- 微信移动应用的 AppID/Secret、iOS Bundle ID、Universal Link、回调域名和测试账号尚未具备，无法进行端到端验证。
- 不为绕过此门禁创建平行用户/会话系统，也不将微信 token 交给客户端自行换取项目会话。

进入阶段 1 前，需要获得一个可维护的、自托管 Supabase 保持会话权威的微信接入方案；否则必须回到架构决策。

## 当前可继续的技术工作

- 初始化 ECS 的 Docker 运行环境。
- 建立后端工程和 Migration 的本地骨架，但不宣告阶段 1 验收。
- 为正式环境准备无密钥配置模板和部署结构。

## 当前不能继续的工作

- 真实微信、手机号、邮箱登录与游客升级。
- 带真实用户数据的 Supabase、Storage、业务 API 或 AI 部署。
- 域名、HTTPS 回调、Universal Link、ICP备案和公开内测。

## 官方依据

- Supabase 自托管 OAuth providers：https://supabase.com/docs/guides/self-hosting/self-hosted-oauth
- Supabase 自定义 OAuth/OIDC providers：https://supabase.com/docs/guides/auth/custom-oauth-providers
- 阿里云免费试用说明：https://help.aliyun.com/zh/ecs/user-guide/ecs-free-trial
