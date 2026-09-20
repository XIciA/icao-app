# Vercel 查词发音与头像入口

授权：用户仅要求 Vercel 首页头像直达个人资料、查词发音，并直接发布。

- 线上实测首页头像已直达 `/account/profile`，复用现有入口，无需重复修改。
- Vercel 查词结果增加 44px 发音按钮，复用现有 `vocabulary/speech.ts` 的英语语音及语速。
- 关闭弹窗、切换单词或页面进入后台取消本次发音；取消发生在启动前时也不会迟到播放。
- 失败给出可重试提示；播放期间禁止重复启动。
- Native 与 EdgeOne 学习页继续使用原 `.native.tsx` 页面及原查词发音组件；不发布其他平台。
- 不变更题库、账号、支付、下载链接、环境配置及原生版本。

验证：完整 `pnpm check` 通过（应用 170 套 / 1189 项、API 55 套 / 727 项）；
查词语音专项 4 项通过；Vercel 冻结检查通过（仅为本次明确授权的精确文件哈希登记）。
既有 lint 警告 52 项，0 错误。

发布使用合入 origin/main 后的干净源码；精确提交、部署 URL 及线上验收结果记录在 annotated release tag。
回滚目标：`release/web-vercel-legacy/20260920-fa42c62c`，部署 `dpl_HEjoxgwczWeMAPQA6myHmKiimcvt`。
