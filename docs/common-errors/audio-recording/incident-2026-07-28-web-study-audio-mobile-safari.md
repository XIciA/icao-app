# Web Study Audio Incident: Mobile Safari Startup Deadlock

状态：长期修复已实现并通过自动化；Vercel 与手机本体上线验收待完成

日期：2026-07-28

## User-visible symptoms

- 同一版本在桌面 Chrome、桌面 Safari 和开发机 Safari 可以播放题卡参考音频。
- iPhone Safari 和其它新手机进入题卡后，播放按钮先保持不可用，约 12 秒后显示“音频加载超时”。
- 点击重试只会重新进入等待，不能产生首帧。
- 故障仅影响题卡参考音频；题面、答案、录音和其它学习状态仍可使用。

## Environment

- Web display version before fix: `v2026.07.28.2043`
- Production domain: `https://feizhuicao.com`
- Reproduced card: Sentence68；用户截图另有 Sentence18
- Reproduced device: physical iPhone Safari through iPhone Mirroring
- Reproduced network: 5G；用户报告其它新机同样失败
- Desktop controls: macOS Chrome and Safari both pass
- Source branch: `codex/web-vercel-runtime`

## Evidence

### Physical iPhone

Sentence68 在真实 iPhone Safari 中稳定显示：

```text
音频加载超时
连接可能已中断；重试会重新获取音频地址。
```

点击重试后约 13 秒再次进入同一状态。错误发生在用户有机会点击播放之前，因此不是 `play()` Promise 拒绝，也不是录音 owner 抢占。

### Previous Web player

共享 `StudyAudioPlayer.tsx` 的 Web 路径同时满足以下条件才开放播放：

```text
uri
&& expo status.isLoaded
&& no 12-second load timeout
&& no playback error
```

Expo Audio Web 只在底层媒体元素触发 `loadeddata` 后发布 `isLoaded=true`。移动 Safari 可以在用户操作前只加载元数据或推迟有声媒体数据下载，于是形成：

```text
必须由用户点击才能继续加载或播放
        ↕
收到 loadeddata 之前禁止用户点击
```

### Resource controls

- Sentence68 和 Sentence18 的静态分片 MP3 均可直接返回 `206 Partial Content`。
- 响应类型为 `audio/mpeg`，支持 Range，CORS 为公开静态资源策略。
- 桌面浏览器可从相同 URI 正常播放。
- 当前问题不需要改变十个静态资源分片、题库映射、媒体 URL、Vercel Function 或 ECS。

## Root cause

共享 Expo player 暴露的 `isLoaded` 语义适合原生 stable player，但不能作为移动 Safari 首次有声播放的 UI 门槛。12 秒加载计时器又在用户操作前启动，把 Safari 合法的媒体延迟策略误判为致命网络失败。

真实根因是 Web 播放门槛和浏览器用户手势策略不兼容，不是 Vercel 免费额度、MP3 缺失、录音生命周期或手机硬件故障。

## Rejected hypotheses

| Hypothesis | Evidence that rejected it |
| --- | --- |
| Vercel 免费额度耗尽 | 静态分片仍稳定返回 206；桌面端使用同一生产资源正常 |
| Sentence68 或 Sentence18 文件损坏 | 直接 Range 请求和桌面解码均通过 |
| 首次 `play()` 没保留用户手势 | 本次失败在播放按钮开放前发生，尚未调用 `play()` |
| 录音占用了全局音频 session | 未启动录音也能稳定复现；错误属于预播放加载超时 |
| 需要媒体代理或 ECS 转发 | 原始静态 URI 可用，增加代理只会增加链路与成本 |

## Long-term fix

- 新增 `StudyAudioPlayer.web.tsx`，Expo Web 自动选择；无后缀 `StudyAudioPlayer.tsx` 的 iOS/Android 行为不修改。
- Web 组件在挂载周期内复用一个 `HTMLAudioElement`，设置 `preload="metadata"` 和 `crossOrigin="anonymous"`，切题只替换 `src`。
- URI 就绪即开放播放，不再等待 `loadeddata/isLoaded`，也不在用户点击前启动致命加载计时器。
- 手动点击先请求既有 `study` lease，但不等待 Promise；原生 `audio.play()` 在同一用户操作同步栈内立即执行。
- 使用 source generation 和 operation generation 隔离旧资源事件及过期 lease。
- 监听 metadata、canplay、playing、timeupdate、waiting、stalled、pause、ended 和 error，区分网络、解码、格式、session 与 20 秒首帧超时。
- `NotAllowedError` 回退为可点击播放，不伪装成网络错误；切题自动播放仅在首次手动首帧后尽力执行。
- Web 下一题预热改用至多一个浏览器 `Audio` 元素，且只在当前题首帧后开始；失败不改变当前播放器状态。
- 重试复用同一资源 URI，不增加随机查询参数。

## Ownership boundary

- 全局 session 仍只有 `AudioSessionOrchestrator`；owner 仍是 `study`，没有新增 owner registry。
- Web 平台差异只存在于题卡参考音频组件和下一题预热 Hook。
- iOS/Android 题卡、录音、录音回放、随身听、题库音频映射与资源 resolver 均保持既有唯一事实来源。
- Web 预热元素没有 session lease、播放 UI 或业务状态，不是第二播放器 owner。

## Automated verification

- [x] 未收到 `loadeddata` 或 metadata 时播放按钮仍可点击
- [x] `audio.play()` 在点击同步调用栈内、lease Promise 完成前执行
- [x] 首帧成功与 `onReady` 单次发布
- [x] `NotAllowedError` 安静回退
- [x] 网络、解码、格式不支持、20 秒首帧超时与同 URI 重试
- [x] 切题复用元素并隔离旧 generation 事件
- [x] metadata、拖动、倍速、结束与后续自动播放回退
- [x] 后台、录音抢占、外部暂停和卸载均暂停；已有 lease 正确释放
- [x] 下一题预热不早于当前首帧且同时至多一条
- [x] 原生 `StudyAudioPlayer` 既有测试保持通过
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm check:audio`
- [x] `pnpm check:web`
- [x] `pnpm check:app`：67 suites / 306 tests
- [x] contracts 与 API 分项检查：API 8 suites / 235 tests
- [x] 其它内容静态检查：OPI、editorial、vocabulary、word lookup、ASR assets
- [x] bundle 性能：相对生产提交 raw `+943 bytes`、Brotli `+767 bytes`
- [ ] 顶层 `pnpm check`：该现网分支原本缺少题库 release output，第一步以 `release_output_missing_run_content_build` 停止；按“不更新内容 release”边界未生成或带入该输出
- [ ] fresh iOS/Android audio-sensitive fingerprints：两条命令均已执行，但本机缺少 Maestro，按门禁在生成证据前停止；本次没有修改 fingerprint 输入中的原生敏感文件

## Physical-device verification

- [ ] iPhone Safari / 5G：Sentence68 冷开后立即可点并产生首帧
- [ ] iPhone Safari / Wi-Fi：Sentence18 冷开后立即可点并产生首帧
- [ ] iPhone Safari：连续切换至少 10 题；自动播放被拒绝时可手动恢复
- [ ] macOS Chrome 和 Safari 无回归
- [ ] Android Chrome 首卡播放与录音互斥
- [ ] 手机本体真实麦克风：题目播放 → 按住录音 → 录音回放 → 再次题目播放

## Rollback

上线前保留当前 Production deployment：

```text
dpl_5e98EdT9C9qjiCk5CGJ5JCvqpchb
https://feizhuicao-website-bi9omaggj-xixi-s-projects6.vercel.app
```

如果直接打开分片 MP3 或新 Web 播放层在手机 Safari 仍无法取流，立即将该 deployment 重新 Promote；不修改 DNS、ECS、数据库、Vercel 环境变量或内容 release。

## Remaining risks

- iPhone Mirroring 可以验证 Safari 页面和扬声器播放，但不能替代手机本体麦克风闭环。
- WebKit 后续仍可能拒绝非用户手势自动播放；该路径设计为安静回退，不把自动播放成功作为正确性条件。
- 媒体分片当前从上海可能命中较远边缘节点；这会影响启动速度，但不应再次禁用首次播放按钮。

## Completion condition

只有 Preview、Production、桌面浏览器、iPhone Safari 5G/Wi-Fi、Android Chrome 和手机本体录音互斥矩阵完成，并记录最终 display version 与平台指纹后，事故才可标记为关闭。
