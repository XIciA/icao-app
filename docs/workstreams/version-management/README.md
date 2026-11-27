# 版本管理迁移

用户确认：2026-11-27。本次整理现有成果和测试基础设施，正式产品保持冻结；后续上线由用户明确发令。
需求历史快照见 [requirements.md](requirements.md)，实时实施记录见 [execution-status.md](execution-status.md)。

## 分支与数据

| 分支 | 用途 | 数据 |
| --- | --- | --- |
| `main` | 正式发布准备和紧急修复 | 原正式数据库持续保留、增长 |
| `develop` | 下一版整合与测试部署 | 独立测试 Auth、数据库、Storage、API |
| `feature/<功能名>` | 单功能实现和本地验证 | 本地或独立测试数据 |

初始 main / develop 基线为 `7207bb90775f9e91d7c0943c6af39af5770cbc6e`，各端实际正式版本见
[正式基线清单](production-baseline.json)。源码整合不自动更新正式容器、网站、安装包或用户数据。
正式上线前用近期快照在测试环境演练；真正上线时备份并迁移当时的正式库，绝不把测试库覆盖正式库。

## 已启用的测试基础设施

- API：`https://test-api.readyoufife.com`。
- Auth / Storage：`https://test-cloud.readyoufife.com`。
- ECS：`/opt/icao/testing`，独立 Compose 项目、内部网络、数据库和文件副本；凭据只在受保护目录。
- 数据快照：`/opt/icao/backups/version-management-20261127/icao-20261127T105039Z-3021373.dump`，已校验并恢复。
- 恢复时重建测试身份摘要，保留原账号 ID 和权益，清除测试会话；不复用正式身份摘要密钥。
- 客户端 SQLite、IndexedDB、Keychain、待同步记录、录音、离线文件和签名按数据环境隔离。
- TestFlight 默认 testing / develop；App Store 门禁拒绝测试数据包。正式候选需从 main 用 production 重新构建。
- 真实验证包含新号码登录、恢复账号会员权益、学习/卡片/文档同步、文件读取及测试令牌在正式环境失效。

运行脚本与初始化方法见 [infra/testing/README.md](../../../infra/testing/README.md)。`testing.ready=true`
表示独立数据环境已通过基础验证，不表示所有产品功能、测试包或用户验收已经完成。

## 后续开发与交付

从最新 develop 创建 feature 分支；完成必要检查、PR 与 CI 后整合进 develop。
在干净且同步远端的 develop 目录运行：

```sh
./scripts/deploy-testing.sh
```

脚本归档精确提交、校验摘要，在测试网络执行迁移计划/迁移/复查，再更新测试 API；不部署正式服务。
测试客户端配置从服务器 `/opt/icao/testing/client.env` 获取到受保护的本地环境文件，不提交凭据。
用 `set -a; . <本地测试环境文件>; set +a` 导出后，再运行对应测试构建脚本。

真实短信、付费 AI、支付、Apple/微信登录默认关闭；需要对应测试凭据和受控连接验证才能启用。
缺少实际关键能力证据时，现有 TestFlight 门禁继续阻止交付。本次基础设施整理未递增产品版本/构建号，
没有上传 TestFlight、提交 App Store 审核或发布新的正式产品。真机环境切换体验仍需在后续测试包中验收。

## 备份与清理

沿用每日定期备份和数据库变更前备份，保留校验文件。旧本地包清理明细见 [local-cleanup.json](local-cleanup.json)。
服务器仅清理确认无运行引用的旧 API 镜像，保留正式当前镜像、回滚镜像、数据库、文件和备份。
原目录的未提交历史工作及另一任务的需求修改必须保留；最终迁入和剩余历史对象状态见执行记录。
