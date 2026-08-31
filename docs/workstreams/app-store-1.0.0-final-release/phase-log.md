# iOS 1.0.0 最终上架阶段记录

## 当前阶段

- 阶段 0：基线、规则与工作区冻结。
- 启动日期：2026-08-31。
- 主线基线：`origin/main` `88f301b816eab4f8719fff7259ae5ad6888b89b6`。

## 已完成

- 负责人确认四份大流程文档并正式授权连续执行至 App Store 提交。
- D2、D4、D7、D9 已更新为：1.0.0 启用微信登录、禁用微信支付。
- 建立非阻塞人工队列、动态 Agent 接管和独立审计门禁。
- 旧 `app-store-1.0.0` 工作流已标记为历史入口。
- 2026-09-01 在 `origin/main` `47ab262` 上完成 UI/Logo P2 候选：删除 Expo 图标编辑器遗留，品牌
  manifest 与门禁明确 `assets/images/icon.png` 为唯一产品母版，`ios/`、`android/` 仅是被忽略且
  不可跟踪的 CNG 生成树；三条 iOS Release 路径都在 `prebuild --clean` 后、编译前校验生成的
  AppIcon、Splash 图片集和 Storyboard。临时全平台 clean prebuild 的 iOS/Android 品牌后验通过。
- 同一候选将沙盒和不支持购买文案改为正式中性口径，并对 Android 直达会员页显示明确的平台状态；
  iOS 仍进入 StoreKit 会员页，Web 使用原有通用实现。`base-flows-parity` 已逐项等待异步事件、显式
  cleanup，并把任何 `console.error` 作为测试失败。
- Web freeze 基线文件及其固定摘要没有重设。门禁现与 Expo CLI Web resolver 一致地关闭
  `.native.*` fallback，并排除 `.native/.ios/.android`、Native 品牌母版和 CNG 生成树误报；fixture
  同时证明这些 Native-only 变化可通过、任一冻结 Web/shared 文件变化仍失败。主线相对旧批准基线
  已存在的 shared/Web 差异仍由门禁诚实报告为红；它阻止 Vercel 构建或发布，但不阻塞只使用
  `origin/main` clean prebuild 的 Native/App Store 候选，Vercel 继续冻结。

## 当前工作

- 将确认后的文档和长期规则通过短期分支、PR 合入 `main`。
- 合入后重新读取代码、Apple、微信和生产事实，拆分阶段 1 的三个独立执行闭环。

## 验证结果

- Markdown 相对链接检查通过。
- `git diff --check` 通过。
- 文档未包含审核手机号、密码、验证码、银行账号或平台密钥。

## 剩余风险

- 微信开放平台账号可访问，但移动应用创建、认证、AppID、Universal Link 和登录权限状态待读取。
- App Store Connect 当前最高 Build、五档 IAP 状态及最终材料仍需重新读取。
- 当前阶段尚未修改代码、构建、部署或提交审核。

## 阶段判断

- 文档进入 `origin/main` 且工作区恢复干净后，可进入阶段 1 并行实现与审计。
