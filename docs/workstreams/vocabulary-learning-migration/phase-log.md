# 单词学习功能与资源迁移阶段记录

状态：已完成

更新时间：2026-07-14

## 阶段 0：决策冻结

- 完成内容：确认需求、技术方案、真实工程盘点和阶段路线图；确认纳入 30 题测评，使用 838 条现有资源，系统英文语音承担发音。
- 关键文件：`requirements.md`、`technical-plan.md`、`technical-audit.md`、`roadmap.md`。
- 验证结果：四份文档在资源数量、功能边界、同步方案、部署范围和明确不做事项上保持一致。
- 明确未做：未把 `feizhuicu` 当作设计稿，未复制其 Web 代码或题库。
- 阶段结论：通过。

## 阶段 1：内容资源与远程读取

- 完成内容：生成三本词书的正式发布物；增加抽取/校验工具、共享 contracts、受鉴权 API、ETag、缓存和 App repository。
- 关键文件：`content/vocabulary/`、`tools/vocabulary-content.mjs`、`services/api/src/vocabulary/`、`src/features/vocabulary/repository.ts`。
- 验证结果：预备级 360、ICAO 4 级 372、ICAO 5 级 106，合计 838；内容 checksum 为 `dbcef6cb7d26aa9a9b81a02fafa5d3a91e8ef1d220ef34512f7a1dd459aa70d2`；原始 JSON 文件 SHA-256 为 `b4b00bb3bc62c994548b5345bba519e49c6b520687d35395adc865731c9869df`。
- 明确未做：未迁移备份稿、例句替换稿、题库、空音标或空音频字段。
- 阶段结论：通过。

## 阶段 2：本地状态与云同步

- 完成内容：以版本化 `vocabulary` 文档保存掌握状态、收藏和最近测评；本地先写、outbox 重试、账号绑定/归档/清理；服务端按词条 `updatedAt` 合并。
- 关键文件：`src/features/vocabulary/persistence.ts`、`src/features/vocabulary/progress-store.ts`、`src/features/sync/learning-sync.ts`、`services/api/src/sync/vocabulary-document.ts`。
- 验证结果：持久化、outbox 折叠、服务端文档合并和 API 同步测试通过；线上代表性账号曾完成 push/pull，并恢复单词状态和 30 题最近结果。
- 明确未做：未新增数据库表或 Migration，未改变题库 annotation 数据语义。
- 阶段结论：通过。

## 阶段 3：单词学习闭环

- 完成内容：词书选择与详情、虚拟化列表、搜索筛选、收藏、多词书队列、认识/模糊/忘记/记错、双语例句、完成统计、再来一轮和错词复习。
- 发音：接入 Expo SDK 55 的 `expo-speech ~55.0.15`；单词自动播放，揭示后支持单词与例句连续播放，离开页面停止，失败不阻断学习。
- 关键文件：`src/features/vocabulary/`、`src/features/content/VocabScreen.tsx`。
- 验证结果：repository、持久化、页面交互测试通过；iOS Development Build 编译并链接 `ExpoSpeech 55.0.15`。
- 明确未做：未增加真人录音、音标生成、离线下载或 WebView。
- 阶段结论：通过。

## 阶段 4：词汇测评

- 完成内容：30 题、每题 10 秒、校准/自适应/验证三阶段、弱/正常/强模式、不重复抽题、超时处理、认识后纠错、结果分级和错词清单。
- 关键文件：`src/features/vocabulary/test-engine.ts`、`src/features/vocabulary/components/VocabularyTestViews.tsx`。
- 验证结果：纯函数引擎和页面测试通过；计时使用绝对截止时间，避免 App 前后台切换造成倒计时漂移。
- 明确未做：未宣称官方等级、考试通过判断或 AI 测评。
- 阶段结论：通过。

## 阶段 5：运行验收

- 自动检查：`pnpm check` 通过；App 32 个测试套件、87 个测试全部通过；API 3 个测试文件、176 个测试全部通过；contracts 类型检查和 API build 通过。
- 内容检查：`pnpm content:check:full` 通过；`pnpm vocabulary:check` 通过。
- Expo 诊断：`pnpm doctor` 的 19/19 项检查通过。
- 原生构建：iOS Prebuild 和 Development Build 成功，0 error；本阶段未声明 Android 已验证。已连接的实体 iPhone当时处于 offline，本轮不把实体设备体验作为代码收口阻塞项。
- ECS：使用已复核文件集部署，健康检查通过；受鉴权词汇端点曾验证 838 条、分书数量、ETag 304 和同步。2026-07-14 再次验证 `https://api.feizhuicao.com/health/ready` 为 API/database `ok`，未登录访问 `/v1/vocabulary` 返回 401。
- 渲染证据：`evidence/` 保留词书、列表、学习揭示、测评倒计时和结果页截图。用户明确最终真实交互体验由其自行完成，不再继续自动操作模拟器。
- 阶段结论：代码与自动验证通过，无阻塞问题。

## 阶段 6：收口

- 完成内容：路线图状态、阶段记录、证据索引、关闭报告和最终展示版本收口。
- 差异检查：`git diff --check` 通过；工作区存在并行题库、图片题和运行环境改动，本任务未回退或覆盖这些差异。
- 剩余风险：系统语音的实际音量受设备静音/音量和可用 voice 影响；最终触感、文案偏好和实体设备体验由用户验收；Android 不在当前阶段验收结论内。
- 阶段结论：通过。
