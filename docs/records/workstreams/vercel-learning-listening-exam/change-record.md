# Vercel 网页端学习记录与听力模考修改记录

- 上线日期：2026-08-26
- 适用范围：仅 Vercel 网页端
- 生产地址：https://feizhuicao.com
- 本次部署：https://feizhuicao-website-ob9sc9znf-xixi-s-projects6.vercel.app
- 发布提交：`d3ae110b26c0579505c8838f2c8b23dbf365b9d2`
- 发布标签：`release/web-vercel-legacy/2026-08-26-d3ae110`
- 回滚版本：`dpl_2W6qmm5ZUKRSyRAZRqPnif1hzyTZ`（https://feizhuicao-website-ddpz1fg1d-xixi-s-projects6.vercel.app）

## 本次修改

- 用户手动点击题目播放键后即计入已学习，答题卡、学习结果和题库进度使用同一份学习记录并及时同步。
- AI 模拟考听力 20 题全部作答后统一显示 50 分制分数和等级，并在原刷题页面统一显示正确、错误答案供复盘。

## 验证结果

- 自动检查和正式网页导出全部通过。
- 正式网站已完成播放即学习、答题卡、目录进度、刷新保留、听力延迟揭晓、20 题统一结算和只读复盘验收。
- `feizhuicao.com`、`www.feizhuicao.com` 与 Vercel 主别名访问正常，健康状态正常。
