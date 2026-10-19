# feizhuicao.com 静态宣传站

2026-10-20 用户授权将原 Vercel 体验站退役，把现有宣传页迁至雨云香港 VPS。

- 唯一页面来源：仓库 `public/promo/`，不重新构建 Native 或 EdgeOne。
- 服务器：189.24.77.48；独立目录 `/var/www/feizhuicao/releases/<commit>/`。
- `/var/www/feizhuicao/current` 指向已验证的不可变发布目录。
- 域名 `feizhuicao.com` 为首页；`www`、`/promo`、`/promo/` 跳转至规范首页。
- 静态资源保留已有 `/promo/legacy/static/` 路径，使课程弹窗、字体和样式继续工作。
- Nginx 配置见同目录 `feizhuicao.nginx.conf`，独立于现有 IP 默认站点。
- 域名证书使用现有 `/opt/certbot/bin/certbot` 和 `/var/www/acme`；现有续期服务自动涵盖新证书。
- 不向此站部署 `api/`、学习题库、账号配置或数据库。旧学习 API 和资源路径返回 410。
- 不修改 `/opt/hangxu`、现有默认站点、学习数据库以及 readyoufife.com 三端服务。

发布只使用已合入 `origin/main` 的干净提交；从该提交的 Git archive 取 `public/promo/` 及本目录配置。
先验证所有静态资源 SHA-256、独立 Host 请求和已有 IP 站点，再切换 DNS 和启用域名证书。
发布记录保存 commit、资源摘要、服务器检查和 DNS 切换结果，不保存凭据。
