# 1.4.4 性能优化、价格调整与 TestFlight 交付

日期：2026-11-01（北京时间）。用户授权部署兼容新旧客户端的 API，并上传 TestFlight；不提交 App Store 正式审核，不提前重启 ECS。0059 索引迁移在备份及隔离恢复演练通过后获准执行。用户另行确认立即修改实际会员售价，并接受新旧 App 共用商品价格。

## 来源与改动

- 客户端及 API 源码：`10e2dc48f78052cb30064f03880aba2698e3b458`，干净 `main = origin/main`。后端优化 PR #298、客户端优化 PR #304、价格 PR #307 均已合并。
- 保留既有账户、权限、接口和学习数据模型；缓存不可变内容计算、批量查询资源、增加耗时观测。客户端保留模块队列，采用两个下载 worker、播放与下载共享传输、消费者独立取消和真实字节进度。
- 包含主干已有的 900 句离线存储键修复和最新下载功能；没有重写登录、同步或购买体系，没有迁移 CDN。
- 7 / 31 / 93 天现售价改为 ¥28 / ¥68 / ¥168；划线原价 ¥68 / ¥158 / ¥358 保持。苹果以 CHN 为基准的对应 USD 档位为 $3.99 / $9.99 / $24.99。现有销售地区配置保持，未因此新增美国区可售范围。历史订单金额、权益和商品 ID 保持。
- Apple 价格配置已回读确认；新旧客户端共用生效，设备 StoreKit 缓存仍可能延迟刷新。服务端微信目录实际返回 2800 / 6800 / 16800 分。未进行真实扣款测试。

## 检查与生产验证

- 最终本地 `pnpm check` 完整退出 0：媒体 12651 文件 / 1705099521 字节、客户端 267 套 / 1871 项、API 84 文件 / 801 项通过；3 项按需基准默认跳过。GitHub CI 41292479097 通过。
- 隔离恢复使用新备份 `icao-20261101T092500Z-4165128.dump`。101 张原有表内容指纹前后一致，无缺表或指纹差异；195164 条业务记录、331 个认证用户保留，结构合同通过，隔离库清理完成。
- 0059 新增 `resource_objects_ready_path_created`、`resource_objects_version_path_created`，不改业务字段或记录。生产迁移计划由 59:1:0 变为 60:0:0，无漂移；上线后核实两索引存在。
- 公开接口 19 条与上线前数据一致：14 条原始 JSON 摘要直接相同；5 个目录仅顶层 `dataset` / `publishedAt` 属性排列改变，按上线前字段顺序完整重排后摘要相同，未删除或忽略任何字段。
- 临时账号经真实认证后，五库目录 / 主题读取、5 条签名音频下载及 SHA-256、新版批量资源解析、旧格式笔记同步与服务端价格通过；临时账号清理完成。
- 真实 AI 转写、语法、润色、航空术语及临时音频清理通过，证据时间 `2026-11-01T10:08:01.615Z`，绑定新 API release ID。
- 上述是接口兼容性证据，不能替代旧版已安装 App 与新版 TestFlight 的真机体验验收，也不代表线上已通过两千人并发测试。

## 生产服务与恢复资料

- API：`production-migration-10e2dc48f780`；镜像 `sha256:46f1e45dbf1d93414ceffdc199018470350021d2e5c1e8b0d0ac6de4e8942a21`；公网 readiness 200，容器 healthy，发布后重启次数 0。
- API 标签：`release/api-production/20261101-10e2dc48`（annotated，已推送）。
- 本次发布沿用现有迁移工具的停 API 后备份流程：18:04:15 完成排空，18:06:37 完成备份，18:06:56 公网恢复 200；约 2 分 42 秒切换窗口内部分请求返回 502。未重启操作系统。
- 切换备份：`/opt/icao/backups/postgres/icao-20261101T100415Z-94425.dump`，SHA-256 `0d317766cf1524cd8f040faf57d6f8b021656ef98dbd3e857d5eb4c706e4be36`。
- 演练证据：`/opt/icao/runtime/migration-rehearsals/evidence/rehearsal-10e2dc48f780-20261101T100041Z.txt`。
- 生产证据：`/opt/icao/runtime/production-migrations/evidence/apply-10e2dc48f780-20261101T100657Z-ce1946819eb3-succeeded.txt`。
- 切换资料：`/opt/icao/runtime/production-migrations/cutovers/cutover-10e2dc48f780-ce1946819eb3fe1560a12f0ea6f97a9b/`，保存旧镜像 ID、release ID、compose 和源码。

恢复顺序：如确认缓存或观测导致回归，先针对新镜像设置 `API_CONTENT_CACHE_ENABLED=false` 或 `API_PERFORMANCE_ENABLED=false` 并仅重建 API 容器，保留本轮价格。需要回退代码时，旧镜像 `icao-api:rollback-pre-144-20261101` 对应 `sha256:0ad1a6588c83c349de8204e2a86b64c1a8717d79c00fd3190f32b4d4cf2825cf`、旧 release `offline-root-20261031-78aa1b3a` 已保留；该旧镜像在新增索引后的数据库上只读结构检查通过。迁移工具在迁移开始后禁止自动回退数据库，不能直接重放旧备份覆盖新学习记录。人工回退旧 API 前还需处理其微信目录会恢复旧价格、Apple 价格不会自动回退的差异。

## TestFlight 与验收

- iOS **1.4.4 / 3593082**：Apple `VALID`、`IN_BETA_TESTING`，内部“测试”组可访问，回读时间 `2026-11-01T10:25:13.671Z`。
- Build / delivery ID：`544c2f37-bc28-459a-b3ce-be9ad8319675`；IPA 41324500 字节，SHA-256 `b4c819762b99314c9a4d4ca2f8bc73a040906c5efd88ac030b7f19ca71701beb`。
- Release 归档、签名、生产地址、包身份、权限、隐私 / SDK 审计及 Apple 包校验通过。标签 `release/ios-testflight/v1.4.4-b3593082`（annotated，已推送）。
- 仅将 `ios-testflight` 更新为本候选；其他三个正式 / Android 测试渠道保持。之前的 TestFlight 1.4.2 / 3593081 未移除，可作为客户端回退候选。
- 本地证据、签名 IPA、归档与校验日志：原项目 `.generated/performance-pricing-delivery-20261101/`。原项目已有的文档整理与媒体删除修改未纳入本轮发布。

待用户在最终 TestFlight 验收：冷启动登录恢复、五题库在线 / 离线、已有下载包、播放同时下载、取消及恢复、切换账号、录音与 AI、价格展示。没有提交 App Store 正式审核，没有替换 Android 正式版或正式升级清单。

CPU / 内存仍按 2026-11-02 03:00（北京时间）预约重启升配；本次没有提前触发。100 Mbps ECS 直发及 100 GiB 磁盘配置保持，不声称这一配置保证两千人同时流畅播放与下载。
