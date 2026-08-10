# 历史归档：App / Web 一致性验收矩阵

状态：已完成

更新时间：2026-07-18

| 轨迹 | 共享基线 | Chrome Web | iOS 回归 | 结论 |
| --- | --- | --- | --- | --- |
| 未登录打开、注册、登录、刷新 | `AuthService` / Supabase | 通过，刷新后会话恢复 | 既有流程 + 本轮原生构建 | 一致 |
| 五套题库目录和版本 | question-bank repository / ECS | 5 套题库响应成功，后续 ETag 304 | 共用 repository | 一致 |
| 题库学习和记录 | study engine / learning store | 页面、上下题、结束流程通过 | 201 个 App 测试覆盖 | 一致 |
| 查词、划线、标签、笔记 | annotations / AI client | 弹层和状态通过 | 共享组件测试通过 | 一致 |
| 题卡音频 | Expo Audio / orchestrator | 进入 playing，进度可用 | 音频边界检查通过 | 前台一致 |
| 录音、重录、回放资产 | recorder controller / repository | 录音提交并出现回放/重录；失败转写保留录音 | 共享状态机和 repository 测试通过 | 一致，格式例外 |
| 电台 | shared catalog/queue/snapshot | 播放、队列、画布内弹层通过 | Native provider / Track Player 保留 | 前台一致 |
| 词汇进度和本机缓存 | vocabulary repository / storage | IndexedDB 持久化 | SQLite 持久化 | 契约一致 |
| 用户同步 | `learning-sync` / `/v1/sync` | 鉴权 API 与本地 outbox 可用 | 共用服务 | 一致 |
| 退出和注销 | AuthProvider / Account API | 通过，回到登录页 | 共用页面和服务 | 一致 |
| 44 个页面路径 | Expo Router | 全部可达、深链可刷新 | 同一路由源 | 一致 |
| 固定显示形态 | 375 × 812 App 基线 | 桌面和移动视口均为手机画布 | 真机自然设备画布 | 产品效果一致 |

## 自动与运行证据

- `pnpm check:app`：43 suites、201 tests 通过。
- `pnpm check:contracts`：通过。
- `pnpm check:api`：3 files、177 tests 通过。
- `pnpm check:web` / Expo Web production export：通过。
- 桌面 Chrome：注册、ECS 题库、登录恢复、电台队列弹层、注销轨迹通过。
- API CORS：正式域名和指定预览来源允许，未知来源无允许头；ETag 条件请求返回 304。
- 正式域名 `https://feizhuicao.com`：根路径和深链 200；Chrome 在公开域名重复执行注册、题库加载、画布内队列弹层、刷新保持登录和注销，1 条完整轨迹通过。
