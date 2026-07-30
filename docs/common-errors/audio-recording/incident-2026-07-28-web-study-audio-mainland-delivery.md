# Web Study Audio Incident: Mainland Static Asset Delivery

状态：Git Preview 已通过；Production 与中国大陆实机验收待完成

日期：2026-07-28

## User-visible symptoms

- `feizhuicao.com` 在 iPhone Safari 使用中国大陆 5G/Wi-Fi 时，题卡音频启动非常慢或超时。
- 同一设备开启海外 VPN 后立即恢复流畅。
- 同样部署在 Vercel 的 `feizhuicao.icu` 在无 VPN 时可以正常播放。
- Web 播放按钮和首帧状态机修复后仍能观察到网络差异，说明播放器时序不是剩余问题的全部根因。

## Evidence

- Vercel 团队为 Hobby，最近 30 天 Fast Data Transfer 为 3.3 GB / 100 GB，Fast Origin Transfer 为 458 MB / 10 GB，Edge Requests 为 54K / 1M；静态流量额度未耗尽。
- `Sentence18` 在 `.com` 分片和 `.icu` 同域路径下载结果逐字节相同，SHA-256 均为 `10570d04e65e9b333f6064caf063dc96e29c9f4358cac8840051f77db1968ffe`。
- `.com` 的浏览器资源地址散列到十个 `feizhuicao-v8-...-a{shard}.vercel.app` 域名；`.icu` 使用 `feizhuicao.icu/question-bank-assets/*`。
- Vercel 官方说明中国大陆没有 Vercel 基础设施，`*.vercel.app` 可能被阻断或限速，并建议使用自定义域名。
- `.icu` 当前工作副本的 `public/question-bank` 为 5269 个文件、672240183 bytes，其中 5246 个 MP3、661099506 bytes；其线上 Production 来源为 Git build。
- 当前 App v10 资源 manifest 为 6081 个文件、814518693 bytes，其中 6058 个 MP3 和 23 张图片。

## Root cause

浏览器直接跨域访问十个默认 `*.vercel.app` 资源项目，使中国大陆移动网络同时承受默认域名可达性、国际出口和多个 DNS/TLS 连接的不确定性。升级 Vercel 额度不会增加中国大陆节点，也不能修复该路径。

此前的 10 分片是内容发布和 CLI 上传约束，不应继续成为浏览器交付拓扑。资源 manifest、checksum 和分片仍可作为唯一不可变构建输入，但用户浏览器应只读取主站自定义域名。

## Long-term fix

- Vercel 项目连接当前 `XIciA/icao-app` 仓库，以 Git Preview 构建并提升同一构建到 Production。
- `web:deploy:export` 先执行 Expo Web export，再读取环境对应的内容 pointer。
- 构建要求 pointer 的 release ID/checksum 与环境一致，读取资源 manifest，以既有 FNV-1a 规则从十个分片取回全部资源。
- 每个文件校验 `sizeBytes` 和 SHA-256；任一资源失败则整个构建失败。
- 资源先写入隔离 staging 目录，全部完成后原子发布为 `dist/question-bank-assets`，并生成可核验的 `release.json`。
- Expo Web 构建使用 `EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_ASSETS=1`；Web resolver 返回 `/question-bank-assets/*`。
- iOS/Android resolver、App 内容服务、播放器、录音、随身听 owner、资源映射和音频文件均不修改。
- 首页和入口 bundle 不引用资源目录；题卡仍只请求当前音频，并在当前音频产生首帧后至多预热下一条。

## Automated gates

- 物化器使用本地双分片 fixture 验证成功输出、release marker、大小校验和损坏资源拒绝。
- Web resolver 测试覆盖同源规范路径、无前导斜杠路径、远端解析和显式绝对 URL 保留。
- `pnpm check:web` 必须包含物化器门禁和既有零 ECS 网络边界。
- `pnpm check:audio` 必须确认没有新增音频 owner 或原生生命周期变化。

本地实现检查已通过 `pnpm check:web`、`pnpm check:app`（68 suites / 308 tests）、
`pnpm check:contracts`、`pnpm check:api`（235 tests）、`pnpm typecheck`、`pnpm lint`
和 `pnpm check:audio`。仓库顶层 `pnpm check` 在既有的
`release_output_missing_run_content_build` 内容产物前置门禁停止；本次没有生成、修改或发布
题库内容 release，因此以各独立门禁作为代码回归证据。

Git Preview `dpl_DwGeKmDVmNMLryfF7dPKXEuqGvVN` 已从提交 `b7506fb` 完成构建：
`release.json` 为 `app-qb-v10-817646d597e77a8c`、6081 个文件、
814518693 bytes。`Sentence18` 返回 `audio/mpeg`、支持 `206` Range，
完整 SHA-256 为 `10570d04e65e9b333f6064caf063dc96e29c9f4358cac8840051f77db1968ffe`，
与资源 manifest 一致。Preview 首页 HTML 只有入口 bundle，不引用题库音频；
入口 bundle 压缩传输为 2581721 bytes，迁移前 Production 为 2581809 bytes，
没有因静态资源目录增加首页负载。

## Rollback

- 保留迁移前 Production deployment `dpl_7MxNsiYaSvPXxuC7vipHZHpcRqoP`。
- Git Preview 未通过时不 Promote。
- Production 上线后若同域 Range、首页性能或移动 Safari 任一失败，立即 Promote 迁移前 deployment。
- 原十个不可变资源项目、metadata pointer、ECS、数据库和 App 配置不删除。

## Acceptance

- [x] Git Preview 构建完成 6081 个文件、814518693 bytes
- [x] Preview marker、代表 MP3 的 `200/206`、MIME 和 checksum 通过
- [x] Preview 首页无题库音频请求，入口 bundle 相对基线无显著增长
- [ ] Production 只从 `feizhuicao.com/question-bank-assets/*` 播放题卡音频
- [ ] iPhone Safari 无 VPN 的 5G 与 Wi-Fi 首帧通过
- [ ] macOS Chrome/Safari 与录音互斥无回归
- [ ] Android Chrome 首帧通过
