# Web Content Incident: Mainland Metadata Delivery

状态：长期修复已实现；Git Preview、Production 与中国大陆新设备验收待完成

日期：2026-07-28

## Symptoms

- 中国大陆网络的新设备打开“单词学习”时长时间停在“正在准备词汇资源”。
- “资源分享”页面外壳可以打开，但文章列表长期停在“加载中”。
- OPI 热点和体系课程正常；题卡同域音频修复后播放正常。

## Root cause

- OPI 热点约 31 KB JSON 和体系课程约 20 KB TypeScript 常量随主 Web bundle 从
  `feizhuicao.com/_expo/static/*` 同域交付，打开模块时不再请求内容服务。
- 单词和文章仍由 `resolveWebContentUrl` 指向独立 metadata 项目的 `*.vercel.app` 域名。
- 单词与文章 repository 虽先读取 IndexedDB，却仍阻塞等待远端请求完成才返回缓存。
- 两条内容请求没有启动超时；国内网络无法完成连接时，React 状态会长期停在 loading。
- 这是浏览器交付拓扑和缓存顺序问题，不是 Vercel Hobby 额度耗尽，也不是题卡音频播放器问题。

## Long-term fix

- Git Web 构建从当前不可变 pointer 读取 `web-release.json`、838 条词汇、文章 release、
  文章 manifest 和全部文章封面。
- 词汇 checksum、文章 release checksum、封面大小和 SHA-256 任一不匹配时构建失败。
- 校验后的内容原子写入 `dist/web-content/releases/<release-id>`；浏览器只读取
  `feizhuicao.com/web-content/*`。
- Web 内容 resolver 使用独立 `EXPO_PUBLIC_ICAO_WEB_SAME_ORIGIN_CONTENT` 开关；
  iOS/Android 内容 repository 不变。
- release checksum 匹配的 IndexedDB 缓存立即返回，刷新在后台进行；首次加载和刷新均有
  10 秒超时，失败时回退已有缓存或显示明确重试状态。
- 题卡音频物化脚本、`StudyAudioPlayer.web.tsx`、录音、随身听和
  `AudioSessionOrchestrator` 不修改。

## Automated gates

- 本地 fixture 验证同域内容输出和损坏封面拒绝。
- Web resolver 测试覆盖词汇、文章和封面的同域路径。
- repository 测试覆盖 release 匹配缓存不等待后台刷新。
- `pnpm check:web`、`pnpm check:audio` 和 App 全量测试必须通过。

## Rollback

- 发布前 Production deployment 为 `dpl_FSEHYnzVQNnvHfsrNJQNjFy3FpKw`。
- Preview 任一同域文件、缓存行为或现有音频回归失败时不 Promote。
- Production 异常时恢复上述 deployment；原 metadata 项目和不可变 release 不删除。

## Acceptance

- [ ] Preview 生成 838 条词汇、3 篇文章和 3 张封面
- [ ] Preview 单词、文章 JSON 和封面只访问同域
- [ ] Preview 现有题卡音频 marker、Range 和播放通过
- [ ] Production 正式域名同域内容通过
- [ ] 中国大陆新设备单词学习与资源分享首开通过
