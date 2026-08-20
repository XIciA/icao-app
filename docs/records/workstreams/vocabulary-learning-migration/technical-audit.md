# 单词学习功能与资源迁移技术盘点

状态：已完成

更新时间：2026-07-13

## 1. 盘点结论

本任务具备完整执行条件。当前 App 已有单词页面视觉骨架、远程 API、缓存、本地 KV、账号绑定和通用文档同步；缺口集中在真实词书、正式 repository、持久化、系统发音、完成页和词汇测评。

现有 `user_documents` 能直接承载单词学习文档，因此不需要数据库 Schema 或 Migration。API 需要新增受鉴权的单词资源端点，完成后必须部署 ECS。

## 2. 当前 React Native 实现

- 入口：`src/app/content/[slug].tsx` 中的 `vocab` 分支。
- 页面：`src/features/content/VocabScreen.tsx`，约 100 行的单文件演示状态机。
- 资源：页面内硬编码三本词书，每本 10 条，共 30 条。
- 已有外观：词书选择、词书详情、搜索筛选、学习判断和收藏入口。
- 主要缺口：状态只在 React 内存；发音按钮没有动作；例句/译文未展示；多词书只取第一本；学习队列循环不结束；没有完成页、错词复习和词汇测评。

## 3. 来源资源与行为

`feizhuicu` 当前启用资源：

| 词书 | 数量 |
| --- | ---: |
| ICAO 考前预习 | 360 |
| ICAO 4 必会 | 372 |
| ICAO 5 冲刺 | 106 |
| 合计 | 838 |

核对结果：

- 838 条均有英文词/短语、中文释义、英文例句和例句译文。
- 稳定 ID 无重复，英文词/短语无重复。
- 535 条是多词短语，不能按单个英文单词假设处理。
- 838 条音标全部为空、音频全部为空；网页实际以 Web Speech API 朗读。
- 当前正式加载的是无后缀的三本词书；`*_例句替换.json` 不是运行时来源。
- 独立测评为 30 题、10 秒/题，包含校准、自适应、验证阶段和最近结果页。

## 4. 可复用工程能力

- `src/platform/api-client.ts` 已提供鉴权、刷新、统一 envelope 和错误恢复。
- `src/features/question-bank/data/repository.ts` 已验证远程版本、ETag、本地缓存和失败回退模式。
- `expo-sqlite/kv-store` 已用于学习数据和同步元数据。
- `src/features/sync/learning-sync.ts` 与服务端 `user_documents` 已支持版本化 `document` mutation。
- 登录前本地数据确认、账号绑定、归档、退出和注销清理已有统一流程。
- API 的 `RequireAuthGuard`、健康检查、测试和 ECS 容器部署路径已存在。
- UI 已有 TopBar、Screen、Card、Button、BottomSheet、字体和主题令牌。

## 5. 缺口与风险

### P0

- 单词资源尚未进入 `icao-app`，也没有自动数量/字段校验。
- App 没有 `expo-speech`；安装后必须重建 Development Build。
- 通用文档同步只会在客户端应用 `annotations`，需要增加单词文档读写和绑定/清理范围。
- 服务端通用 document 目前按整体版本冲突，需要为单词文档增加逐词更新时间合并。

### P1

- 838 条列表不能用当前一次性长列表方式无条件展开，需要控制渲染和筛选结果。
- 多词短语、长释义和双语例句需要真实屏幕检查。
- 测评计时必须避免重复提交、页面切换后残留计时器和语音。
- iOS 静音模式会让 `expo-speech` 无声，需要在验收和提示中明确。

### P2

- 当前工作区已有其它未提交改动；本任务必须只改独立单词目录、必要的同步/API/依赖文件和 workstream 文档，不覆盖无关差异。
- 当前第二阶段只验收 iOS，不能把本轮结果表述为 Android 已验证。

## 6. 总体判断

推荐顺序是：内容发布物与校验 → 远程 API/repository → 本地与云同步 → 学习 UI/发音 → 词汇测评 → API 部署与 iOS Development Build → 渲染验收和收口。
