# Web 在线版收口记录

状态：已完成

更新时间：2026-07-18

## 已完成范围

- 同一 Expo / React Native 主工程已经支持 iOS、Android、Web；没有第二套 Web 页面工程。
- Web 在手机和电脑浏览器中统一显示 375 × 812 固定手机画布、手机外壳和纯色背景。
- 现有 App 用户页面、题库、业务流程、本地状态、同步、前台音频、录音和电台已接入 Web。
- Vercel 前端可继续调用 ECS 题库/API 与 Supabase；用户数据使用同一账号和同步模型。
- 正式域名、API CORS、Vercel 环境、安全头、SPA fallback 和回滚点已准备。

## 后续三端更新规则

1. 普通页面和功能默认修改共享 `src/app`、`src/features`、`src/components`，三端随各自发布更新。
2. 题库、词汇和资源内容继续发布到现有服务端来源；三端按同一版本/checksum 获取，通常不需要 Web 重新部署。
3. 用户数据继续写同一云端模型；新字段必须先更新 contracts、API、迁移/兼容和三端 storage/sync，再发布客户端。
4. 涉及权限、文件、音频、后台或系统 UI 时，先判断是否需要 `.web` / Native adapter，并更新平台矩阵和例外。
5. 不复制题库、音频映射、同步 owner 或 Web 专属业务页面。

## 已确认不做

- 不配置正式 SMTP；找回密码和邮箱换绑明确未开放。
- 不保证浏览器权限弹窗、系统键盘、后台播放、锁屏控制、返回和刷新行为与原生完全一致。
- 本轮不做 Android 真机、模拟器或 Android Chrome 体验验收。
- 当前不修改隐私政策中的浏览器存储/Cookie/麦克风说明。

## 发布与验收结论

- iOS `ICAO` Debug / generic Simulator 原生构建成功。
- Vercel Production 远程构建成功，运行配置中没有加密占位符或服务端 secret。
- `feizhuicao.com` 已完整替换旧站并直接返回新应用；`www` 308 跳转到根域名。
- 公开正式域名的 Chrome 核心轨迹通过：注册、ECS 题库、电台队列弹层、刷新保持登录和注销。
- 旧 Production deployment 和 ECS rollback 镜像/源码/环境备份均保留。
- 本轮按用户决定只执行电脑 Chrome 浏览器专项验收；iPhone Safari 等其余浏览器不写成已实测通过，也不作为本次发布阻塞项。

小流程目标已完成，不存在需要回到大流程决定的功能阻塞。
