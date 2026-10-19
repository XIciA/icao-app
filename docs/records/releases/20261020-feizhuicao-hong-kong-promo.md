# 2026-10-20 feizhuicao.com 香港宣传站迁移

## 用户授权与范围

用户明确要求将原 `/promo` 宣传页迁至香港服务器，根域名直接显示宣传页，`/promo` 跳转首页，
并停用清理旧 Vercel 题库；保留“听你五个”iOS、Android、readyoufife.com Web 三端及
“会飞的猪”刷题站。此记录只说明本次迁移，不新增长期规则。

## 发布来源与配置

- PR： https://github.com/XIciA/icao-app/pull/206
- 干净 `main == origin/main` 发布提交：`644e3dfc4fa2753104a5087ada9193987e363467`。
- 页面来源：`public/promo/`，共 129 个文件，未修改原宣传内容或编译后的交互逻辑。
- 独立发布目录：`/var/www/feizhuicao/releases/644e3dfc4fa2753104a5087ada9193987e363467/`。
- 当前软链接：`/var/www/feizhuicao/current`；Nginx：`infra/promo/feizhuicao.nginx.conf`。
- DNS：`@ A 189.24.77.48`、`www CNAME feizhuicao.com`；原 TTL 600 秒。
- 域名切换时间：北京时间 2026-10-20 02:35；旧站清理在原 DNS 缓存窗口结束后进行。
- 证书涵盖根域名和 www；已通过 Certbot reconfigure 的 HTTP webroot 模拟续期，沿用
  `certbot-renew.timer` 自动续期与 Nginx reload，无需人工续证。
- 临时 DNS TXT 仅用于首次签发，完成后暂停；后续续期不依赖这些 TXT。

## 旧站退役与数据边界

退役范围共 26 个 Vercel 项目：主站 1 个、旧资源项目 25 个。
旧资源范围为 v8-7cf2feb2、v10-817646d5、v12-bf1bbbc3、v13-d9c5a7e2 的 content/aNN 项目。
其他 Vercel 项目不在此范围。清理前核对正式 Web 线上 bundle 无上述旧分片主机引用，
Native/正式 Web 的题库实现继续使用受保护的正式链路。

项目/域名/环境配置和部署元数据的受保护备份，以及资源 SHA、切换前后证据保存在本机
`/Users/zhouyide/Desktop/hangxu-vps/private/feizhuicao-migration-20261020/`。
该目录可能含密钥配置，不提交、不公开。历史 Vercel 项目身份及旧 .vercel 本机关联只用于追溯，
不得作为新的发布入口。

保留仓库共享的旧模式实现与冻结校验，避免删除同仓代码造成正式三端回归；不修改长期规则。
本次不更新或发布 iOS、Android、EdgeOne App 制品，不操作 Supabase 或刷题站数据库。

## 已验证证据

- 本地 HTML 与迁移前在线 `/promo` 逐字节相同；129 个可达资源检查通过。
- 所有 129 个新站文件通过 HTTPS 获取并逐一匹配 SHA-256。
- 根域名首页 200，www 和 `/promo` 永久跳转首页；旧学习 API/资源路径返回 410。
- 真实浏览器验证 ICAO 4、ICAO 5 课程切换、详情弹窗及“我们有话说”，无浏览器错误日志。
- Nginx 配置检查通过；已有刷题站默认 Nginx 配置、程序和资源清单 SHA 不变，进程 PID 不变。
- 现有 IP 刷题首页和管理后台正常，readyoufife.com 网页正常，正式 API live/ready 均为 ok。
- PR #206 完整 Repository and EdgeOne checks 通过。

自动检查和线上浏览器检查已完成；用户视觉验收待用户打开正式域名确认。
