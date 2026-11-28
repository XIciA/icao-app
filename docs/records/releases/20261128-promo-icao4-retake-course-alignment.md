# 2026-11-28 宣传站 ICAO 4 复考包过班与冲刺班更新

复考包过班为 6999 元、无限课时，保留 2 次模拟测试权益和 15 项课程内容。复考冲刺班为 3600 元、12 节课和 1 次模拟测试，共 6 项课程内容。两班均采用复考措辞，未包含「900句」模块。

- 正式源提交 `58cf780f5961d3616e3e49a09b1660062b3432c0`，发布标签 `release/promo/20261128-58cf780f`。
- [正式 PR #383](https://github.com/XIciA/icao-app/pull/383) 已通过仓库和 EdgeOne 构建检查。课程与回归断言已同步至 develop，见 [PR #382](https://github.com/XIciA/icao-app/pull/382) 和 [PR #384](https://github.com/XIciA/icao-app/pull/384)。
- 服务器切换至本次宣传站独立静态目录前，已校验全部 129 个文件。保留上一发布 `2bb8ac860ca17cfaa6574565de36f74931d1e709` 作为回退来源。
- Git archive SHA-256 为 `f774e5a53b726b54311a4e9ad27867e28bbb1366173b93dcc468cb7ecbd517d2`。
- 首页 SHA-256 为 `24b2a97838ffd94ab3b6d2c62fc4e383e7f7574eaea291c9ed44b73bbd670743`。课程脚本 SHA-256 为 `49de7493f9ae9715b8dd6aaf3519aff74fa89f960b856fb5442c8b47892804a6`。两个入口的首页及课程脚本公网回读均匹配。
- [官网首页](https://www.feizhuicao.com) 和 [宣传页入口](https://www.feizhuicao.com/promo) 均经 301 跳转到正式首页。Chrome 在 1440×900 与 390×844 下核验卡片、详情全文与权益、滚动、关闭和复考措辞。服务器回查时独立 IP 刷题站正常。
- 验收状态为宣传站已上线，桌面与手机尺寸的浏览器交互通过。
