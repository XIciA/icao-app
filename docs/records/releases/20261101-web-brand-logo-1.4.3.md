# Web 品牌图标统一 1.4.3

日期：2026-11-01（北京时间）。仅交付产品 Web；移动端不重新构建或上传。

## 已交付

- 源码：`aed1182299ab17f4645a1beb57a7285b65863a30`，[PR #305](https://github.com/XIciA/icao-app/pull/305)。
- EdgeOne Production：`dp6h8t31bptd`，`readyoufife.com` 已上线。
- Annotated tag：`release/web-edgeone/20261101-aed11822`。
- 回退参考：上一 Web deployment `dp23x0c1hw40`，tag `release/web-edgeone/20261031-a8fdceb3`。

网页品牌组件、favicon、Apple touch icon、Web manifest 图标及随身听 Media Session 封面统一使用 App 母版 `assets/images/icon-native.png`，SHA-256 `2e9401acce52ec48e675ca2d8df1e1659266cd0ad95698033880c5542967577b`。旧 favicon 和带白边的平行素材已移除；浏览器衍生图标由导出脚本生成，地址绑定母版内容摘要，常规 `/favicon.ico` 和 `/apple-touch-icon.png` 回退地址也已替换。

## 验证与边界

- 本地：18 项针对性测试、类型检查、相关 ESLint、品牌边界与发布配置检查通过。覆盖播放器切歌后提交封面、暂停保留、退出清除及元数据所有权隔离。
- [最终 CI](https://github.com/XIciA/icao-app/actions/runs/41277785399) 通过：客户端 265 套 / 1845 项，API 80 文件；数据库约束、仓库检查和 EdgeOne 导出均通过。
- 在干净 `main` 且 HEAD 等于 `origin/main` 的 `aed11822` 上按锁文件安装并构建，189 文件 / 39.4 MiB。公网八个图标与 manifest 文件及入口 JS 均与产物逐字节一致，下载页 HTTP 200；线上浏览器确认下载页使用同一 logo。
- 公网入口：`/_expo/static/js/web/index-d1ae11aeed58414b9d790a3cea585ce9.js`；SHA-256 `39bddfed683352a02041a3b7c53cc7b9c1bb1510142984c60423cab1e926ee70`。
- 本地全量 `pnpm check` 在隔离工作区因缺少历史音频 `audio/listening/main/001.mp3` 停止；最终 CI 使用规定的 `check:ci` 验证源码。本任务未改变或发布题库媒体。
- 第一轮 CI 发现平台版本常量未同步，补齐后最终 CI 全部通过。第一次生产构建时 pnpm 自动重解析依赖，发布前门禁发现锁文件偏移；上传在创建 deployment 之前中止。随后重新按主干锁文件安装，构建前后均通过干净主干门禁，仅上述成功 deployment 生效。
- **用户验收待完成**：iPhone Safari 重新打开网页、重新播放随身听后，确认真实锁屏封面和浏览器图标。桌面浏览器及代码检查不能替代 iPhone 系统界面验收；已缓存的旧书签 / 主屏入口可能需要重新添加。
