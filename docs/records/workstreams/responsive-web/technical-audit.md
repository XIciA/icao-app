# 响应式 Web 适配技术盘点

状态：已确认  
更新时间：2026-07-22

## 1. 已有能力

- 工程已使用 Expo 55、React Native、React Native Web、React DOM 与 Expo Router；`app.json` 已启用 Web 静态导出。
- 已有 `pnpm web`、`pnpm web:export` 与 `pnpm check:web`，可启动和导出 Web。
- 路由、题库、认证、同步、页面和主题位于共享 `src/app`、`src/features`、`src/components`、`src/theme`；后端与数据契约也已共享。
- 现有 Web adapter 已覆盖存储、会话能力、录音仓库/适配器、随身听播放器和音频上传，具备平台隔离基础。

## 2. 当前 Web 形态与证据

- `src/components/platform/AppViewport.web.tsx` 将所有 Web 内容放入可缩放的 `375 × 812` 手机画布与黑色外框。
- `src/components/platform/useAppViewportDimensions.web.ts` 固定返回 `375 × 812`；底部抽屉、学习音频播放器、题库学习页等组件依赖该尺寸。
- `src/app/(tabs)/_layout.tsx` 在所有平台使用底部 `FloatingTabBar`；轻量方案确认继续复用，不新增 Web 桌面导航分支。
- 当前路由与业务页面可被 Web 复用；W0 已建立响应式断点，W1 只需补全局大屏限宽。

## 3. 缺口

- 手机 Web 仍是“浏览器中的手机预览”，不是使用真实视口的移动网站。
- PC Web 内容仍会占满浏览器宽度，需要统一限制横向拉伸并居中显示。
- 现有测试以 `375 × 812` 移动基准为主；`pnpm check:web` 只验证导出，不覆盖手机与 PC 的可视验收。

## 4. 不可破坏的边界

- 不复制题库、音频映射、学习状态、同步或资源解析逻辑。
- 不改变 iOS / Android 导航、音频和录音生命周期 owner。
- 不修改云端 API、认证、同步协议或题库数据。
- 不覆盖工作区中既有的未提交学习页改动。

## 5. 可验证性与回滚点

- 静态验证：`pnpm check`、`pnpm check:web`、相关单元测试。
- 视觉验证：手机、平板、PC 三类浏览器尺寸的关键路由截图/人工抽查；原生关键入口冒烟检查。
- 回滚点：布局变更集中在 Web 壳与宽度计算；共享业务、导航与平台 adapter 不作语义改变。
