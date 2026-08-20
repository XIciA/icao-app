# ICAO App 项目指令

## 权威顺序

- 当前用户请求决定本次任务目标和授权边界。
- 仓库代码、配置、测试和生成清单决定当前已经实现的事实。
- 只有 `docs/rules/` 下的文档是 Codex 的长期规则。每次只读取与当前任务直接相关的规则，
  不要预加载整个目录。
- `docs/resources/` 保存事实和可选参考资料，本身不授予操作权限，也不自动规定工作流程。
- `docs/records/` 保存过程产物、证据、事故、迁移和历史记录。除非用户明确指定某一记录，
  否则它们不能约束新的任务。
- 除非用户明确要求修改规则，否则 Codex 不得自行创建、修改或提升长期规则。

文档入口见 [docs/README.md](docs/README.md)。

## 项目长期边界

- iOS 和 Android 使用 React Native、Expo 和 TypeScript，通过 Development Build 与
  CNG/Prebuild 开发；Web 使用仓库中的 Expo Web 目标。
- 未经明确架构决策，不得引入 WebView 或第二套应用技术栈。
- 新增功能专用的数据、资源加载、播放、持久化或运行时配置前，先查找现有唯一来源，
  不得建立相互竞争的所有者或平行实现。
- 密钥、证书、签名材料和本地环境文件不得进入仓库、日志或聊天；保留用户的无关修改。
- 使用 pnpm 和仓库锁定的依赖版本。
- Vercel 网页项目默认冻结。除非用户明确授权修改 Vercel 端网页项目，否则不得修改其页面、
  API/Functions、配置、内容生成或部署链路，也不得构建、预览或部署 Vercel 项目。只读检查
  不属于改动，可以按任务需要执行。

## 任务路由

- 普通任务：`docs/rules/bigandsmall-workflows/orchestration-loop.md`。
- 跨系统、高风险、长周期或需要重要决策的任务：
  `docs/rules/bigandsmall-workflows/document-driven-development-workflow.md`。
- 验证、构建和交付：`docs/rules/problem-solving-and-maintenance/delivery-and-acceptance.md`。
  按用户最终验收环境选择最短路径，不默认串联模拟器、Development Build、Dev 真机和 Release。
- 用户明确以 TestFlight 为验收目标时，完成聚焦代码检查后直接构建并上传候选包；除非直接路径
  被阻塞或需要回答一个明确的底层诊断问题，否则不增加 Development Build 或模拟器步骤。
- UI 任务：`docs/rules/ui-style-guide.md`。
- Native 商业化产品范围和长期决策：只读取 `docs/rules/decisions/` 中与任务相关的文件。

生产部署和数据库迁移必须获得明确授权。只有任务改变了正式交付的用户可见行为、内容、运行时
行为或发布产物，或者用户明确要求提升版本时，才更新 `src/config/app-version.ts`。
