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

生产 API、签名 APK、正式 EdgeOne 网页和 Vercel 安卓下载入口均已发布；精确来源、制品摘要、部署标识及回滚目标见 [release.md](./release.md)。这表示制品与网站已交付，不表示真实 Android 设备及真实支付已验收。

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

### Android 原生依赖构建修正

- Expo Modules Core 55.0.25 仍引用旧 `intermediates/cmake` 路径；当前 Android Gradle 插件将 Worklets 输出到 `cxx`，并由既有 `mergeReleaseNativeLibs` 任务合并。与 Expo 官方 issue #42893 描述相同。
- 使用 pnpm 锁定补丁改为引用已有合并任务的稳定输出；保留原 Gradle 任务依赖，覆盖 Debug/Release 和各 ABI。没有升级依赖版本、修改 JavaScript 或手工复制动态库。
- 冻结检查仅加入这份 Android CMake 补丁及其 workspace/lockfile 的精确摘要；Web 业务代码保持冻结，负向门禁测试 7 项通过。
- 后续全链路原生检查发现 Reanimated 4.2.1 也引用同一旧路径，已对两个消费者统一修正，并将合并依赖明确加到各 ABI 的 CMake 任务上，避免并行链接竞态。扫描安装依赖的 CMake/Gradle 源码确认没有第三个现行消费者。
- 应用层生成的微信回调 Activity 直接使用 SDK 类型，模块依赖改为 `api`，使这些类型对应用编译可见；三个本地 Expo 模块补齐 SDK 55 发布插件所需的 defaultConfig 版本。
- 四种 ABI 的完整原生编译、应用 Kotlin 编译和 Release lint 通过；最终 `assembleRelease` 成功。16 GB 开发机并行 ABI 构建会造成明显内存争用，本次采用单 Gradle worker 完成构建；没有降级编译器或跳过 ABI。
- 实际 APK 的 `apkanalyzer` 将 `singleTop` 输出为数值 `1`。校验工具接受这两个等价表示，继续拒绝其他 launch mode；9 项合同测试通过，实际 APK 通过校验。该修正仅影响校验工具，未重建或更改已有签名 APK。

## 生产环境复核（2026-09-18）

- 正式网页 `readyoufife.com` 的线上 JavaScript 文件与已审查的 EdgeOne 构建一致。Chrome 实测手机号验证码/密码切换、下载页及返回；没有微信或 Apple 登录入口，未登录访问发现页会返回登录。
- 390px 和 1440px 页面宽度与内容宽度相同，没有横向溢出；下载页 Logo、两端按钮、上下/左右布局正常。浏览器验收期间未出现 console error/warn。
- `feizhuicao.com/content/app-download` 已显示正式 Android APK 下载；返回发现页后仍有 APP、OPI 热点、资源分享三个项目和原体系课程入口。云构建的冻结门禁确认 349 个受保护文件与基线完全一致。
- 公开 APK HTTP 200、MIME 正确、长度 132899861 字节；完整公开下载 SHA-256 与本地制品相同，公开响应 ETag 也与本地 MD5 一致。
- 生产数据库只读查询确认 7/31/93 天价格分别为 6800/15800/35800 分；既有四个私有 storage bucket 的权限与各自大小上限保持不变。
- API 和 Storage 容器健康。微信商户凭据保留在服务端，未放入客户端制品或本记录。
