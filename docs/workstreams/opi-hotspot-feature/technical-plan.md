# OPI 热点技术方案

状态：已确认

## 数据

热点 JSON 只保存 `brief → topicId → cardIds` 映射。运行时按声明的话题解析卡片；缺失、错属、重复和图片题均失败关闭。

`scripts/validate-opi-hotspots.mjs` 在发布检查中验证：

- 资讯 ID、日期与排序；
- 话题存在且标题一致；
- 卡片存在并属于声明话题；
- 无重复卡片和图片题。

## 页面

- `/content/hotspot`：列表。
- `/content/hotspot/[briefId]`：全屏详情与真实问题列表。
- `/content/hotspot/[briefId]/study`：热点学习会话。

学习页继续复用 `QuestionBankStudyScreen`，通过显式 `returnHref` 返回热点详情，不维护独立播放器、录音器或学习状态。

## 发布

使用独立干净分支构建 Vercel Preview，验证后 Promote 到 production。保留上一条 production deployment 作为回滚点。由于没有 API 或数据库改动，不部署 ECS。
