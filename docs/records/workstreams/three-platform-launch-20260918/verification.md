# 本轮验证记录

## 发布前检查

- 完整 `pnpm check` 通过（使用已恢复并校验的正式媒体源）：APP 162 套 / 1108 项，API 52 套 / 704 项；内容、合同、类型、构建与发布配置检查通过。
- 既有 ESLint 警告 52 项，0 错误；本轮新增权益模块聚焦检查无错误。
- 新增网页权益测试覆盖只读购买边界、账号切换后旧请求丢弃、网络错误重试、退出清理；配合既有 API 401 恢复测试共 7 项通过。
- 独立审查指出网页会员音频残留和显式令牌绕过刷新，均已修复；新增随身听目录与在途播放隔离测试、Android 同用户令牌刷新测试。
- 最后变更后的 APP 全量回归 163 套 / 1117 项通过；商户只读请求与 API 支付聚焦测试通过。初次三端维持 1.0.0，候选构建号更新为 3530529。
- EdgeOne 白名单解析测试确保 Vercel、iOS、Android 不使用网页共享映射；浏览器存储和播放适配不导入设备文件缓存。
- 浏览器实测手机号登录、密码切换、协议确认取消、公开下载页；390px 手机及 1440px 桌面无横向溢出。测试未发送验证码或创建账号。
- 微信支付官方 API 的真实只读查单返回签名已验证，结果为 `ORDER_NOT_EXIST`，证实商户请求签名与微信响应公钥可用；未创建订单、未扣费，不能代替实付验收。
- 当前生产 API 健康，数据库 50 项迁移已应用，无待执行迁移及漂移；EdgeOne CLI 登录有效。

## 正式发布记录

待代码进入 origin/main 后填写制品 SHA、部署标识、下载地址与线上检查结果。不能将本地构建或预览记为正式上线。

## 真实设备边界

当前无连接 Android 真机；微信后台登记签名本轮未直接核验。签名摘要与既有备案材料一致，客户端微信状态检测及手机登录兜底已准备。真实设备安装、锁屏连续播放、微信授权/实付/退款仍以实际观察为准，不凭自动化测试宣称通过。

## EdgeOne 共享产品与浏览器验收（2026-09-18）

- `tools/edgeone-shared-modules.cjs` 在 `edgeone-production` Web 构建中复用 App 的账号、题库内容、学习记录、笔记、AI、资讯与模拟考试实现；Vercel 和 iOS/Android 不受此映射影响。映射边界测试 `tools/edgeone-shared-modules.test.cjs`：2/2 通过。
- 浏览器会话和 OTP challenge 使用 Web 存储适配。浏览器验收发现原 OTP challenge 直接调用 SecureStore 导致初始化报错，抽取 `phone-otp-storage.ts` / `.web.ts` 后复验已消失；原生存储 key/选项保持一致。Auth/登录/同步 95 条测试、后续 Auth/OTP 55 条聚焦测试均通过。
- `member-content-cache.browser.ts` 仅提供账号代际边界，不复用原生文件缓存；网页会员内容由服务器授权后在线加载。
- `catalog.browser.ts` 使用共享题库 API 补齐会员随身听主题，限制 3 个并发请求。
- `provider-web-isolation-test.tsx` 3/3 通过：会员 A 退出后非会员 B 离线不残留 A 的字幕/目录；切换账号后的旧目录与音频 URL 响应不生效；会员被撤销且重新加载失败时立即清除受保护内容。播放器异步播放也校验账号/请求代际。
- `EdgeOneAlertHost.tsx` 补齐 React Native Web 原本不显示的 Alert。浏览器以虚拟表单数据触发协议前置弹窗，确认可显示并取消，未接受协议、未发送短信、未请求真实账号登录。
- 本地正式 Web 导出：`EXPO_PUBLIC_ICAO_WEB_RUNTIME=edgeone-production EXPO_PUBLIC_ICAO_UI_ACCEPTANCE=0 pnpm exec expo export --platform web --output-dir .generated/edgeone-parity-audit` 成功。
- 浏览器手机 390×844、桌面 1440×1000：手机号验证码/密码入口正常，无 Apple/微信入口；下载页 Logo、App Store 链接和 Android 待开放状态正常，无横向溢出；从登录页进入下载页再返回登录页已复测通过。
- 浏览器初次发现临时 Supabase client 与主 client 共用 storageKey 警告，已隔离临时 client key；新构建未出现新的控制台错误/警告。
- 验收边界：没有使用生产账号写学习记录、发起 AI 消费或购买；上述浏览器 smoke 不代替真实登录后的三端双向同步及真实支付验收。网页录音采用现有浏览器录音适配，原始录音文件不会因此新增跨设备云同步。

### PR 冻结边界收敛

- 修复版随身听迁至 `RadioPlayerProvider.browser.tsx`，`RadioPlayerProvider.web.tsx` 恢复为 `origin/main` 字节一致内容；原 Vercel 播放行为保持不变。
- 正式网页权益/会员页迁至 `CommerceRuntimeProvider.browser.tsx`、`MembershipRoutePage.browser.tsx`，仅 EdgeOne Metro 映射到新实现；删除新增 `.web.tsx` 覆盖，Vercel 继续解析原 base 实现及原提示文本。
- 同一构建内 Provider 和 `useRadioPlayer` 均通过同一路径映射到同一模块，避免出现两个 Context。音频所有权门禁显式覆盖正式 browser 实现。
- 映射测试 3/3；网页随身听/权益隔离聚焦测试 7/7；音频边界门禁和 TypeScript 检查通过。
