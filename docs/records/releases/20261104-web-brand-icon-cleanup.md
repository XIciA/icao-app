# 网页残留品牌图标统一

日期：2026-11-04。按用户要求，全局核查旧蓝色 A / 上三角、v0 模板图标与替代品牌标记；统一采用既有「5」Logo。仅发布 readyoufife.com，独立宣传站、公司官网与后台仅保留源码修改。

## 当前交付

- 最终源码：`c4e8b778d751010a740d766086c7183246bb7afa`；实现 PR [#337](https://github.com/XIciA/icao-app/pull/337)、hydration 路径修正 PR [#338](https://github.com/XIciA/icao-app/pull/338)。
- EdgeOne Production：`dpy5tn55ph9c`，项目 `makers-4khvzoj9ywnq` / `tingniwuge-web`。
- Annotated tag：`release/web-edgeone/20261104-c4e8b778`。
- 原始母版未改：`assets/images/icon-native.png`，SHA-256 `2e9401acce52ec48e675ca2d8df1e1659266cd0ad95698033880c5542967577b`。
- 回滚参考：本轮前 `8874900f` / `dpxdpmeg7yqh` / `release/web-edgeone/20261104-8874900f`。
- 首轮 `02130dd4` / `dpxepdqof601` / `release/web-edgeone/20261104-02130dd4` 已被最终部署取代。浏览器实测发现 Next hydration 还追加根路径图标声明，随后归一化静态与序列化 metadata，最终 DOM 只有四个带母版摘要的 `/promo/` 图标引用。

## 核查与替换

- 截图的蓝色 A 对应已退役的旧 `assets/images/favicon.png`；当前产品主站 favicon、Apple touch icon、manifest 和启动品牌原本已使用「5」。公司官网 `icoach-icon.png` 仍为旧 A，现已替换为母版派生图。
- `public/promo/` 的浅色 / 深色 32px 图标、Apple 180px 图标、SVG 中的 v0 图形已全部替换。保留兼容 URL，但内容为「5」，页面引用使用母版摘要缓存版本。HTML 与 hydration 后的声明一致，移除 v0 模板署名。
- 旧 Web 欢迎页飞机品牌标记复用 `AppBrandLogo`；后台登录页文字 5 与 favicon 改为直接引用母版。
- `scripts/sync-static-brand.mjs` 派生并校验静态资源，已接入 `check:web:source`。不维护第二份手绘 Logo。
- 已扫描受版本管理的资源与源码引用，旧 A / v0 图片摘要无剩余精确副本。公司自身「云启航科」标志、功能图标及历史设计截图不属于待替换 App 品牌；保留它们及 Git 历史。两张当前官网产品截图经目视检查无目标旧品牌。

## 验证

- 本地完整 `CI=true QUESTION_BANK_AUDIO_ROOT=/private/tmp/icao-verification-media/audio pnpm check` 通过：客户端 283 套 / 2000 项，API 823 项通过 / 3 项跳过。另有品牌 / 启动 / 登录 34 项聚焦测试、类型检查、品牌边界、相关 ESLint、静态派生与宣传资源完整性检查通过。后台 TypeScript / Vite 构建通过。
- hydration 补丁只修正两个文件中的图标路径，重新通过静态派生、完整引用、ESLint，并从干净 `main = origin/main` 导出最终 Web：189 文件 / 39.5 MiB；锁文件与移动端版本配置未变。
- 公网 26 个文件与最终构建逐字节一致，涵盖全部 12 个 JS、favicon、Apple / manifest 图标及宣传页图标和 HTML；首页相关声明、下载、登录、欢迎及宣传页面检查通过。首次回读曾遇到部署传播中的旧 HTML，传播完成后无版本参数的原 URL 也与最终产物一致。
- 浏览器目视确认旧 `/promo/icon.svg` 地址已显示「5」；hydration 后四个图标链接全部带 `2e9401acce52`；课程详情可打开。下载页正常显示「5」、App Store、正式 APK 1.2.1 / 3578875 与测试 APK 1.3.1 / 3596173。
- 完整机器可读结果见同名 JSON；本机完整证据位于 `/Users/zhouyide/.codex/artifacts/retired-icon-audit-20261104/`。浏览器截图及源工作区同步证据保留于该目录。

## 边界与待验

- 未部署 feizhuicao.com、公司官网或后台。它们的线上旧素材不在本次发布范围，不能视作已上线替换。
- 已将本任务 13 个源码 / 图标文件同步回用户原工程；逐文件确认与任务基线一致后才写入。原工程 Git HEAD、暂存区及其他未提交 diff 均保留，不重置、不清理、不混入原有修改；产品状态文档因原工程已有用户修改，仅更新隔离克隆与远端主干。
- 不生成 iOS / Android 包，不递增构建号，不修改 API、数据库、微信或更新渠道。已验收 iOS 1.3.1 / 3596172 与安卓正式渠道保持原状；既有安卓测试包仍待真机体验验收，微信测试配置限制见[上一交付记录](20261104-android-web-parity-1.3.1.md)。
- 不删除用户浏览器历史、旧书签或已安装主屏入口；这些系统缓存的实际刷新仍由用户最终验收，不把网页资源验证等同于所有设备缓存已更新。
