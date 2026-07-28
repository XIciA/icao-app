# Web Study Audio Incident: First Playback Stuck at 0:00

状态：长期修复已实现，等待线上新浏览器验收

日期：2026-07-28

## User-visible symptoms

- 已使用过网站的电脑通常能够播放题卡音频。
- 新电脑、新手机或新浏览器首次进入学习页时，播放按钮可能一直转圈。
- 卡片时间停留在 `0:00`，页面没有失败状态或可执行的恢复出口。

## Environment

- App display version: `v2026.07.28.2002`
- Native build: 不涉及
- Commit or reviewed file set: Web `StudyAudioPlayer`、对应回归测试和阶段记录
- Platform/device/OS: Web；新浏览器会话，包含 iOS WebKit 浏览器
- Build type: Vercel Web
- Runtime endpoints: `feizhuicao.com` 与不可变 Vercel 题库资源分片
- Account/auth state: Web 体验邀请码；与完整 App 账号无关

## Reproduction

1. 使用无本站媒体授权和缓存的新浏览器进入任一带音频的题组。
2. 进入第一张学习卡。
3. 观察浏览器自动播放被限制或音频已加载但首帧未前进的状态。

Expected:

- 首次播放需要用户手势时显示可点击播放按钮。
- 播放请求未在有限时间内产生首帧时退出加载状态并提供重试。

Actual:

- Web 会对第一张卡直接发起自动播放。
- Expo Audio Web 不向调用方暴露底层 `HTMLMediaElement.play()` Promise。
- 已加载但时间停在 0 秒时，原有加载超时不再生效，spinner 没有退出条件。

## Evidence

- 截图对应的两份候选 MP3 均能返回 `200` 和 `206`，支持 Range，编码与时长可由 `ffprobe` 正常识别。
- Expo Audio 55 Web 的公开 `play()` 返回 `void`；内部调用没有转发或处理媒体元素播放 Promise。
- Expo Web 可先发布 `playing=true, currentTime=0`，现有 UI 因而进入首帧 spinner。
- `useAudioLoadTimeout` 只在 `isLoaded=false` 时计时，无法覆盖已经 loaded 但首帧不前进的状态。
- 旧浏览器已有资源缓存和媒体使用历史；新浏览器同时面临冷请求与首次有声播放限制。

## Root cause

Web 首次播放策略和播放器恢复状态机存在两个相邻缺口：

1. 第一张题卡在浏览器尚未确认有声播放前盲目自动播放。
2. 播放请求发出后只依赖 Expo 状态观察，没有独立的首帧期限；浏览器拒绝或媒体停在 0 秒时无法转入失败状态。

该问题没有破坏音频 owner 或录音资产，但违反了资源失败必须有明确状态和重试入口的产品不变量。

## Rejected hypotheses

| Hypothesis | Evidence that rejected it |
| --- | --- |
| `SIA 852-1` MP3 损坏 | 两份候选文件均可完整下载、解析和播放，编码与时长正常 |
| Vercel 不支持音频 Range | 代表请求返回 `206` 且 `accept-ranges: bytes` |
| 题库或 App 原生播放器整体损坏 | 已使用浏览器和 Native 自动播放测试正常；故障集中在 Web 新会话首次启动 |
| 原有 12 秒加载超时可以恢复 | `isLoaded=true` 后该计时器停止，不能覆盖首帧停在 0 秒 |

## Long-term fix

- Shared owner/source of truth reused: `StudyAudioPlayer`、`AudioSessionOrchestrator`、题库资源 resolver 和既有 Expo player。
- Implementation change: Web 学习会话在首次首帧确认前不自动播放；首次点击后才解锁后续切题自动播放。
- Restored invariant: 每次播放仍先获取 `study` lease；没有增加 audio owner、player、资源映射或时长来源。
- Recovery change: 每个 Web 播放请求使用 generation 隔离的 6 秒首帧看门狗；超时后暂停、释放 lease，并显示“音频启动超时”与重试。
- Regression test: 覆盖 Web 首次手势、首帧解锁、后续切题自动播放、0 秒超时，以及 iOS/Android 原有自动播放行为。
- Static or release gate: `pnpm check:audio` 继续验证唯一 orchestrator 与音频边界。

## Verification

- [x] Targeted `StudyAudioPlayer` tests: 17/17
- [x] `pnpm check:audio`
- [x] `pnpm check`
- [ ] Vercel Preview 新浏览器首次播放验收
- [ ] Production 正式域名新浏览器首次播放验收
- [ ] Native Development Build：不适用，Native 路径未修改
- [ ] Platform fingerprint：不适用，未修改原生敏感实现
- [ ] Physical-device microphone → playback → transcription：不适用，本事故不涉及录音或转写

## Remaining risks

- 中国大陆到 Vercel 音频分片的冷网络质量仍可能造成真实加载超时；本修复保证可诊断和可重试，不改变海外部署拓扑。
- Expo Audio Web 仍不暴露底层播放 Promise；因此以“是否产生首帧”作为稳定的公开 API 恢复边界。

## Follow-up

- Owner: Web 题卡音频
- Required evidence: Preview 和正式域名均使用无本站缓存、无既有媒体授权的新浏览器会话验收。
- Completion condition: 首卡显示可点击播放，点击后进度前进；人为阻断首帧时 6 秒内退出 spinner；下一题没有无限等待。
