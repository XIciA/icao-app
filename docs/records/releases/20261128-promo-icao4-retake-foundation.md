# 2026-11-28 宣传站 ICAO 4 复考基础班更新

正式页面显示 4500 元、15 节课和 2 次模拟测试。详情包含测评与备考规划、陆空通话、OPI 三个模块，共 11 项，采用复考文案并省略“900句”模块。

- 正式提交：`2bb8ac860ca17cfaa6574565de36f74931d1e709`，标签 `release/promo/20261128-2bb8ac86`。
- 正式来源：[PR #380](https://github.com/XIciA/icao-app/pull/380)，已同步 [develop PR #379](https://github.com/XIciA/icao-app/pull/379)。两条分支的仓库和 EdgeOne 构建检查均通过。
- 发布目标：香港宣传站 `public/promo/`。服务器核验 129 个静态文件后切换到该提交目录。保留上一发布目录 `644e3dfc4fa2753104a5087ada9193987e363467` 供回退。
- Git archive SHA-256：`98f16a5e968a58b87b6b4ce6d098188a9e85927f1be5baa1593ceaef326d2fc2`。
- 首页 SHA-256：`3cd51dfdcbb1db10e7927cb02810f9bd058b280a5b0d36d0a8acdba92d93b4df`。课程脚本 SHA-256：`3e96be4cb5290b2c04392ea2aa02ee6dc48d21e4bb08f4acaa49932a0bf1b7c0`。公网回读均匹配。
- 从 [www 首页](https://www.feizhuicao.com) 和 [www /promo](https://www.feizhuicao.com/promo) 分别验证 301 跳转至规范首页。Chrome 在 1440×900 和 390×844 下通过课程卡片、详情全文、滚动和关闭检查，同时核对初考基础班的“900句”和其他复考班的价格。
- 验收状态：正式宣传站已上线，浏览器交互复查通过。服务器上的 IP 刷题站回查正常。本次生产交付范围为宣传站静态文件。
