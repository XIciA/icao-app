# 当前运行时拓扑

更新时间：2026-10-20

## Native 正式链路

`iOS / Android App → ECS API → Supabase / 受保护的运行时服务`

- App 使用仓库内 contracts 与 API 交互。
- 主生产 ECS 为公司账号下的 `47.108.90.19`；正式入口为
  `https://api.readyoufife.com` 与 `https://cloud.readyoufife.com`。
- 新版 Native App 不再兼容 `api.feizhuicao.com`、`cloud.feizhuicao.com` 或旧 ECS
  `47.109.132.161`；两条旧域名 A 记录和新机 Caddy 旧别名均已删除，旧安装包停止服务不
  影响正式 iOS 包 `com.readyoufife.ios` 或 Android 包 `com.readyoufife.app`。
- 账号、云端学习记录、正式 AI 与真实反馈属于这条链路。
- 本地 API 修改不等于线上已更新；线上验收需要明确的部署授权与部署证据。

## Web 链路

### EdgeOne 三端同步站

`Browser → EdgeOne Pages 静态前端 → ECS API → Supabase / PostgreSQL / 私有题库资源`

- `readyoufife.com` 使用仓库的 Expo Web 目标，不引入 WebView 或第二套前端。
- Web 使用与 iOS、Android 相同的 Supabase 用户身份、ECS contracts、题库和学习同步接口。
- 首发只支持中国大陆手机号短信验证码自动注册/登录，不做旧 Web 账号或本地进度迁移。
- 题库音频继续存放在 ECS 上的私有 Supabase Storage；浏览器通过 ECS API 获取短期签名 URL，
  EdgeOne 构建不复制整套音频。
- Web 录音原件和设备缓存仍保存在当前浏览器，不进入三端云同步。

### 香港静态宣传站

`Browser → 香港 VPS Nginx → public/promo 静态宣传页`

- `https://feizhuicao.com/` 直接显示原 `/promo` 宣传页；`www` 统一跳转至根域名，
  `/promo`、`/promo/` 和 `/promo/index.html` 永久跳转至首页。
- 使用雨云香港 VPS `189.24.77.48` 的独立域名站点和 `/var/www/feizhuicao/` 目录；
  与该服务器原有“会飞的猪”IP 刷题站分开，后者的程序、默认站点与数据库保持不变。
- 此站仅部署 `public/promo/`；不提供邀请码登录、学习 API 或题库资源。
- Nginx 配置和发布来源见 `infra/promo/`；证书续期沿用现有 Certbot 定时任务。

### 旧 Vercel 体验站退役

- 2026-10-20 用户明确授权停用和清理原 `feizhuicao.com` 的 Vercel 邀请码题库。
- 退役范围是旧主站 `feizhuicao-website` 和 25 个旧内容/音频分片项目。
- 旧站使用独立 cookie 和浏览器本地学习进度；本次不迁移或删除正式三端的账号、题库、
  云端学习记录或数据库，也不处理用户浏览器中的历史缓存。
- 共享仓库里的 `vercel-legacy`、`api/` 和旧快照暂留作兼容与历史追溯，不代表仍有对外运行
  的 Vercel 题库，不在本次迁移中批量删除共享源码或重写冻结基线。
- 迁移及验收记录见 `docs/records/releases/20261020-feizhuicao-hong-kong-promo.md`。

## 运行时选择与边界

- `EXPO_PUBLIC_ICAO_WEB_RUNTIME=edgeone-production` 才启用三端同步站；未设置时默认
  `vercel-legacy`，防止旧 Vercel 构建意外连接生产云端。
- 不因 Web 的本地存储策略削弱 Native 的账号与云端能力。
- 不在客户端、文档、部署包或日志中写入运行时密钥。
- 数据库迁移与普通 API 发布分开审批、备份和验收。
- 内测 APK 下载站的 DNS 记录已于 2026-08-09 删除，仓库中的页面和上传脚本也已移除；
  任何 Native 构建或部署脚本都不得恢复对它或旧 ECS 的依赖。旧 ECS 当前欠费停机，因
  无法启动而未删除磁盘内的历史文件；这一残留不属于运行链路，也不得以启动或释放整机的
  方式在未单独授权时处理。

EdgeOne 的当前部署事实、验收证据与回滚入口见
`docs/resources/operations/edgeone-three-client-web-rollout.md`。
