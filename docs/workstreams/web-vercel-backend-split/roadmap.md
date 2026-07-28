# Web Vercel 迁移执行与验收

状态：发布前验收

更新时间：2026-07-28

## 大流程

### A. 基线冻结

- [x] 确认不创建 Web V2。
- [x] 确认 App 继续使用 ECS，Web 独立迁移。
- [x] 记录 Vercel 项目、正式域名和迁移前 Production deployment。
- [x] 在干净工作树和 `codex/web-vercel-runtime` 分支实施。

### B. Web 运行边界

- [x] Web 独立邀请码和 Cookie 会话。
- [x] Web AuthProvider 禁用 Supabase 和云同步。
- [x] Web API client 固定同源 Vercel Functions。
- [x] Web 账户页、本机数据和体验版说明。
- [x] 文本 AI、录音 Base64 上送、AI Gateway 主转写和 Qwen3-ASR 备用转写。

### C. 内容镜像

- [x] 确认 Vercel Hobby Blob 的 2000 次高级操作上限不适合一次上传 6081 个资源。
- [x] 以 `releaseVersion 8` 构建首次完整内容闭包。
- [x] 将 814.5 MB 资源按稳定哈希部署到 10 个不可变 Vercel 静态项目。
- [x] 部署独立版本清单项目和 `web-content/current.json`。
- [x] 配置 Web 当前指针、分片模板、版本和 checksum。

### D. 验证与发布

- [x] TypeScript、Lint 和音频结构边界初检。
- [x] 全量 Jest、TypeScript、Lint、音频边界和 Web export 初检。
- [x] Web bundle 零 ECS 扫描。
- [x] Vercel Preview 登录、内容、音频和文本 AI 冒烟。
- [x] Vercel Preview/Production Qwen3-ASR 录音转写冒烟；随后发现跨境链路间歇超时。
- [x] 真实浏览器网络目标检查。
- [x] 删除旧 Web ECS/Supabase 环境变量。
- [x] Production 切换并验证 `feizhuicao.com`。
- [x] Web 暂时隐藏转写按钮；AI Gateway 账单验证不再阻塞本次 v10 发布。

### E. App v10 跟随同步

- [x] 固化 App 真机基准：题库 v10、1223 道听力题的 4892 条中文选项、16 条 OPI 热点。
- [x] 合并热点列表、真实题目详情、学习与返回链路。
- [x] 扩展 `web:content:sync`，严格校验后复用 v8 的 6081 个不可变资源。
- [ ] 发布 v10 metadata，部署 Preview 并完成浏览器验收。
- [ ] Preview 通过后提升 Production，并记录正式域名和回滚证据。

### 已发现的网络事实

- 本机到受保护的 `*.vercel.app` Preview 曾连续出现 TLS 握手失败，请求未到达函数。
- 这类故障发生在浏览器/本机到 Vercel 边缘的链路，无法由登录或 API 代码修复。
- 正式切换必须以 `feizhuicao.com` 的公网可达性为准；纯 Vercel 不承诺中国大陆全运营商 100% 可达。
- Vercel 新加坡和东京函数到阿里北京 `dashscope.aliyuncs.com` 均观察到间歇连接超时；仅更换 Vercel 区域不足以保证转写稳定。
- AI Gateway OIDC 请求已到达 Gateway，但团队未完成账单验证时返回 `customer_verification_required`，因此不能把该路径标记为已验收。

## 小流程验收记录模板

每个小流程必须记录：

1. 修改范围和共享模块复用情况。
2. 是否改变 Native 运行路径。
3. 自动检查、Preview 或浏览器验证结果。
4. 失败时的明确回滚点。
5. 仍未覆盖的体验版差异。

## 首发通过条件

- 独立邀请码登录和刷新恢复成功。
- release v10 的 6867 张卡片、听力中文选项和完整资源闭包可从公开 versioned URL 读取。
- 代表性音频支持正常请求和播放。
- 查词和文本 AI 至少各完成一次真实请求；Web 不显示转写按钮。
- 浏览器运行时零 ECS 请求。
- `feizhuicao.com` 指向已验收的 Vercel Production。
- iOS/Android 配置、依赖和 ECS 链路未切换。
- `src/config/app-version.ts` 更新为最终上海时间。
