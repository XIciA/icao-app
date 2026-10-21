# 生产基础监控

用户选择只在服务器保留告警，不配置消息推送或公开监控端口。

- 每五分钟检查磁盘、可用内存、CPU load、核心容器、API 本机/公网 readiness、最近数据库备份与 API 日志。
- 状态：`/var/lib/icao-monitor/status.json`；七天聚合历史：同目录 `history-*.ndjson`。
- 查看告警：`journalctl -u icao-monitor.service --since today`；仅告警新增和恢复时输出对应事件。
- 磁盘 80% 预警，90% 或不足 3 GiB 严重；数据库备份超过 30 小时严重。
- API 413、5xx 和非 AI 接口 P95 超过两秒触发预警。慢接口至少需要 20 条样本。
- 请求日志每次最多读取两万行；状态注明可能截断。只记录固定服务前缀和聚合指标，不保存身份、IP、查询参数或请求正文。
- 监控不会清理镜像、修改数据或自动重启服务。没有配置异机探针，整机失联时本机无法自行发出外部告警。

从已合入 `origin/main` 的干净源码安装到 `/opt/icao/runtime/monitor/releases/<commit>/`，将 `current` 原子切换至该目录，并安装本目录的 systemd unit。保留前一版目录可回滚。首次安装运行 `systemctl start icao-monitor.service`，检查状态文件、日志和 timer 后交付。
