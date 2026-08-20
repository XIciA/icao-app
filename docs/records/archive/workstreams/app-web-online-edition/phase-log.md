# 历史归档：Web 在线版阶段执行记录

更新时间：2026-07-18

## 阶段结果

| 阶段 | 状态 | 主要结果 |
| --- | --- | --- |
| 1. Universal 基线 | 完成 | SPA 导出、Web 入口、固定手机画布、原生直通边界 |
| 2. 存储/认证/数据 | 完成 | IndexedDB、浏览器会话、ECS CORS、题库/同步链路 |
| 3. 全页面 | 完成 | 44 路径可达；所有 Modal 收敛到手机画布 |
| 4. 音频/录音/电台 | 完成 | Web 录音 Blob、上传、电台前台引擎；原生 owners 保持 |
| 5. 回归 | 完成（其余浏览器/Android 按确认不做专项体验测试） | App/API/contracts/Chrome/视觉证据通过；iOS Simulator 原生构建成功 |
| 6. 发布 | 完成 | `feizhuicao.com` 已切换到新 Expo Web；公开域名 Chrome 轨迹通过，旧部署可回滚 |
| 7. 收口 | 完成 | 矩阵、例外、运行规则、维护规则和 closeout 已固化 |

## API 发布证据

- ECS API 发布版本：`v2026.07.18.2058`。
- 运行 compose 与部署 archive 已补齐 `patches/`，避免生产 install 缺失 pnpm patch 文件。
- 部署前保留旧镜像、源码、compose 和环境备份；Web CORS 环境备份位于 ECS `/opt/icao/backups/api-env-before-web-cors-20260718-2042`。
- `/health/ready`、数据库状态、live verify、正式/预览 CORS 和题库 ETag 请求均通过。

## Web 发布准备

- 复用 Vercel 项目 `xixi-s-projects6/feizhuicao-website`。
- 当前旧生产部署保留为回滚点：`feizhuicao-website-2xw8qh817-xixi-s-projects6.vercel.app`。
- Web 新预览部署：`dpl_ExHryZbAcmSDbTFwwh3f8TJVEXDL`；预览受 Vercel SSO 保护，正式域名发布后公开访问。
- `vercel.json` 已配置 SPA rewrite、安全头、麦克风 self 权限和静态资源长期缓存。
- 首次公开验收候选：`dpl_BuD8RMHx6y4Dv6EXp5gKgn31BeE2`；Promote 后公开域名 Chrome 核心轨迹通过。
- 域名策略已调整为 `feizhuicao.com` 直接服务应用，`www.feizhuicao.com` 使用 308 跳转到根域名。

## 验证说明

- 全量 `pnpm check` 在 `content:check` 停止，原因是工作区另一项未完成的 OPI 重建缺少 release output。该产物不属于本 workstream，未执行 `content:build`，避免覆盖用户的并行内容工作。
- 本 workstream 相关的 `check:app`、audio、typecheck、lint、201 个 App tests、contracts、177 个 API tests 和 Web export 均独立通过。
- `xcodebuild` 对 `ICAO` Debug / generic iOS Simulator 编译成功，证明 Web 平台文件拆分未破坏苹果原生工程。

## 录音修复（2026-07-18）

- Web 录音适配改为直接收集浏览器 `MediaRecorder` 的完整分片，并在 `stop` 事件后生成 Blob；不再依赖 Chrome WebM 的不稳定时长元数据或单个停止分片。
- Web `RecordingRepository` 对压缩 WebM/Opus 使用 1 KB 有效文件下限及格式比例校验，Native WAV 的 10 KB 校验保持不变。
- 本地 Chrome 假麦克风轨迹通过：按住录音、停止、提交资产、进入重录状态和回放入口均可用；语音转写的 503 仍属于既有 AI 服务不可用状态，不回滚已提交录音。

## 旧版课程宣传页兼容入口（2026-07-19）

- 根据产品决定，保留当前 Expo Web 首页与 App 手机画布不变，同时恢复原营销站的课程宣传页入口：`/promo`。
- 该入口使用旧站 `feizhuweb` 已构建的静态快照和同一批本地素材，保留课程介绍、价格分栏、详情弹窗与咨询信息；其静态资源位于 `public/promo/`，与 Expo 运行时代码和原生 App 隔离。
- Vercel 为 `/promo` 和 `/promo/` 配置了优先 rewrite，其他路径继续由 Expo Web SPA 处理。
