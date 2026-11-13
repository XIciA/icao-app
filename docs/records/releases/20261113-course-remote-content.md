# 2026-11-13 体系课程展示与远程内容

## 已发布 Web 展示

- PR：[#354](https://github.com/XIciA/icao-app/pull/354)。
- 提交：`a3d0582b6f63e16720201a51a62197e3fa3188cc`。
- 平台：EdgeOne Production，readyoufife.com。
- Deployment：`dpn0in0xj50l`。
- 结果：课程列表和详情以较大课时信息替代价格，原详情蓝色课时小标移除；课程内容、导航和其他页面保持。
- 验证：课程聚焦测试、类型检查、EdgeOne 构建、PR CI 通过；线上浏览器核验列表与详情未显示金额。

## App 远程内容候选

- 用户确认网页版效果后授权实施原生页面加远程内容，交付 iOS TestFlight；不使用 WebView。
- 版本：1.3.1 / 3596175。源码待合入 main 后补记。
- 课程数据采用版本化 JSON，包含内置兜底、本地缓存、摘要／结构校验及旧版本保护。
- 模拟练习录音修改保持暂停，本轮没有修改录音、学习记录或用户数据。
- 发布结果、标签、验证证据与回滚目标在实际完成后追加；当前不宣称 TestFlight 可用或用户真机验收通过。

实施与后续内容更新方法见[任务说明](../../workstreams/course-remote-content/implementation.md)。
