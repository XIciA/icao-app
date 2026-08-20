# RN / Web 视觉对齐执行基线

冻结日期：2026-07-11

## Web 设计稿

- 路径：`/Users/zhouyide/Desktop/icao设计稿`
- 分支：`main`
- 提交：`e976cec9f90aa0d71a568a57923b7ec14ab6ba16`
- 工作树：冻结时干净
- Node：`v24.4.1`
- pnpm：`11.7.0`
- 题库 SHA-256：`935e50d2a8aff3417666a6e687acab12f41044b09b23309e52fcc6e20761a4db`
- 运行入口：`http://localhost:3000`
- 约束：全程只读，不修改页面、数据或配置

## React Native App

- 路径：`/Users/zhouyide/Desktop/icao-app`
- 分支：`main`
- 提交：`65e3ec35aeb558b1c1e5575e78acfd84a2e79613`
- 远程基线：`origin/main` 同提交
- Node：`v24.4.1`
- pnpm：`11.7.0`
- 冻结时已有未跟踪目录：`战略/第二阶段-真实资源账号同步AI与商业化/`
- 保护规则：该目录不属于本 workstream，不修改、不删除、不纳入对齐产物

## 设备与画布

- Web 金标准：PhoneFrame 内部 iframe，CSS 视口 `375 × 812`
- iOS 几何对照：执行阶段创建/使用 375 × 812 的 iPhone 11 Pro 模拟器
- iOS 原生回归：现有 iOS 26.3 模拟器与已连接真机条件允许时执行
- Android：按用户最新要求，本 workstream 不启动或使用 Android 模拟器；不影响 Android 产品支持范围
- Web 截图不包含手机壳、浏览器装饰或开发工具悬浮入口

## 验证基线

- 文档/清单：JSON 可解析、截图路径存在、`git diff --check`
- RN TypeScript/React 改动：`pnpm check`
- 可见 UI：同状态 Web/RN 截图、叠加差异图与操作轨迹
- 原生能力：相关 iOS Development Build、模拟器或真机冒烟
