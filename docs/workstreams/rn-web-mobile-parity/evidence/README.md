# 视觉对齐证据规则

- Web 金标准直接引用 `docs/ui-screenshots/2026-07-11/`，本目录不再保存重复副本。
- `rn/ios/`：iOS 375 × 812 对照模拟器的同状态截图。
- `diff/`：Web/RN 并列或透明叠加差异图。
- 文件名必须等于 `state-manifest.json` 中的 `stateId`。
- 只保留金标准、最终 RN 对照和最终差异证据；调试中间图写入 `/tmp`，不进入仓库。
- 设计稿源仓库保持只读；本 workstream 不重复截图 Web。
- 本 workstream 不生成 Android 模拟器截图。
