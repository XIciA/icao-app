# 离线学习、下载更新与启动恢复 1.4.0

日期：2026-10-31（北京时间）。用户已明确授权实施、API 部署与 TestFlight 上传；不涉及数据库迁移，不提交 App Store 正式审核。用户真机验收尚未完成。

## 交付

源码 `72ce6c960d809835b4e7c06c83de8864324b4d53`，PR [#296](https://github.com/XIciA/icao-app/pull/296)。所有发布产物均从干净 `main`、`HEAD=origin/main` 构建。

| 渠道 | 结果 | 追溯 |
| --- | --- | --- |
| iOS TestFlight | 1.4.0 / 3586479，Apple VALID、IN_BETA_TESTING，现有内部“测试”组可安装 | build ID `dad657b8-e44b-439c-8382-8265e1f6a3e8`；tag `release/ios-testflight/v1.4.0-b3586479` |
| Android 测试版 | 1.4.0 / 3591513，独立包名 `com.readyoufife.app.test`，官网测试入口与 `android-test` 更新提示已发布 | tag `release/android/v1.4.0-b3591513`；[测试入口](https://readyoufife.com/download) |
| 产品 Web | deployment `dpd9nosduue8`，公网脚本与本地主干导出一致，下载页 HTTP 200 | tag `release/web-edgeone/20261031-72ce6c96` |
| API | `offline-learning-20261031-72ce6c96`，健康及真实调用验证通过；无迁移，线上内容 v33 保持 | tag `release/api-production/20261031-72ce6c96` |

iOS IPA SHA-256：`e0d612f2267688516f85e6ad78992c8da3c325a27135ae277125b6068fe27452`。

Android APK：138,302,437 字节，SHA-256 `0248b327a09c126b0fcf92ccf40ba62490a84fa2c7064acc65c9335e0adc54c0`；不可变文件为 `app-releases/android/feizhu-icao-android-test-1.4.0-b3591513.apk`。发布工具校验公开文件后才更新测试指针；另外渠道逐项保持，iOS 测试指针随后单独更新。正式 App Store、Android 正式更新清单不变。

Web 入口脚本 SHA-256：`dc79feef6ac3dd142f02f3ec0c57bfa5f8c59ff0a8a5af16d75388c0491458c0`，9,522,440 字节。网页无下载入口；导出校验及公网检查确认未携带受保护题库发布目录。第一次网页上传准备中发现媒体校验输出混入目录，已在上传尚未完成、创建 deployment 之前中止；随后使用隔离的已校验网页快照发布，仅上述成功 deployment 生效。

## 功能与边界

- 五个题库固定折叠卡片；统一范围、容量、进度和按钮，完成只改卡片状态。900 句四级包含 3+4 级、五级包含全部；其他题库为精选/最全。
- 复用原学习流程；资源加密保存、有效本机优先、已知失效资源联网回退；暂停与重启复用已完成文件，手动更新，不承诺系统无限后台下载。
- 个人笔记按条目合并，保留冲突用户文本，删除不复活；下架内容清除受限详情，保留可保留历史摘要。
- 同账号先恢复合法本机页面，再完成在线账号、协议与会员校验；会员展示缓存不授予权限。
- 网页端不支持离线包；原 900 句 PDF 生成、预览和导出保持；不新增题目或音频导出。

## 检查证据

- GitHub [CI](https://github.com/XIciA/icao-app/actions/runs/41091730856) 通过，含数据库约束、仓库及 EdgeOne 导出。
- 最终主干完整 `pnpm check`：客户端 263 套件 / 1,822 项，API 79 文件 / 759 项；媒体 12,651 文件 / 1,705,099,521 字节；类型、lint 与构建无错误。已有依赖警告不等同于编译错误。
- 上传前录音与 iOS 合同门禁通过，Archive/Export/Apple 校验无错误；包身份、签名、麦克风权限、生产地址及隐私/SDK 审计通过。
- 真实 AI live 于 `2026-10-30T17:09:40.979Z` 通过，绑定本轮 API；转写、语法、润色、航空关键实体保护与暂存音频清理通过，测试账号清理按既有验证器执行。
- 公网验证十种范围的下载清单、容量求和、资源唯一性与摘要、范围包含关系、非法范围及 sandbox 权限拒绝；额外完成免费题目批量资源解析、实际音频下载与 SHA-256/字节数核验。
- 本机发布前依赖布局曾与严格 pnpm 校验不匹配，已在冻结锁文件下重装并以一致 CI 环境构建；源码、版本和锁文件未因此修改。旧私钥路径在上线前被一致性门禁拒绝，改用既有生产签名文件，未轮换线上密钥。

真实清单容量（包含所选文本与资源，单位 MiB，服务端以字节为准）：

| 题库 | 精选 / 四级 | 最全 / 五级 |
| --- | --- | --- |
| 听力 | 375 题，94.3 | 1,501 题，289.7 |
| 900 句 | 721 句，52.9 | 900 句，76.3 |
| 陆空通话 | 1,567 卡，158.1 | 5,750 卡，519.8 |
| OPI | 892 卡，84.1 | 2,361 卡，230.0 |
| 故事复诵 | 46 卡，42.4 | 382 卡，218.4 |

## 验收与回滚

详细 [真机验收清单](../../workstreams/offline-learning-2026-10/device-acceptance.md) 与 [代码逻辑复核](../../workstreams/offline-learning-2026-10/implementation.md)。手机麦克风、路由、系统后台调度、真实存储、窄屏观感及真实同步操作仍待用户验收，不使用代码检查替代。

- iOS 上一候选：1.2.2 / 3586478；Android 测试上一候选：1.3.12 / 3584843。
- Web 回滚 deployment：`dpilekjuysfe`。
- API 原版本：`production-migration-5fe05c123eb8`。部署脚本保留本次切换前镜像 `icao-api:rollback-offline-learning-20261031-72ce6c96` 及 `/opt/icao/backups/api-offline-learning-20261031-72ce6c96/`。
- 测试清单备份位于 `/opt/icao/backups/offline-clients-20261031/`；不用正式渠道指针代替测试回滚。
- 本地候选及脱敏回执保存在原项目 `.generated/offline-delivery-20261031/`；原工作区无关文档和资源修改保留。
