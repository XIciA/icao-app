# OPI v30 directory candidate

Baseline commit: 5532e8916c594cb88d8ea157094472b280965538. Production stays on v29.

237 -> 223 topics; 443 card relocations. All 2365 stored cards are unchanged. Scope ID sets: all=2361, selected=892, crash=393. The 23 free card IDs and all image topic content/order remain unchanged.

Learning identity: migrated cards continue using their original persistence keys. Directory moves do not rewrite or clear user progress, annotations, tombstones, sync versions, historical reviews or recordings. App and cloud writes use the same original identities. Current references resolve by bank/card identity.

Scope inheritance is preserved in topic-level cardStudyTiers metadata, without editing card objects. App/API share the scope helper.

Validation: identity/scope proof, content CI, hotspot validation, App/API types; focused client tests 9 suites/64 cases, repository/download tests 3 suites/79 cases.

Implementation merged through PR #323 (b0785dcaff794dda0862ffaa6156a6569a80095a) and PR #325 (3b558121946af64fa8d27c840949b74fe53765ac). Production API is deployed and v30 is staged inactive; no customer-table rewrite or formal v30 activation occurred. TestFlight 3596167 belongs to the preceding intermediate-state release; this candidate uses 1.3.1 / 3596168.

## Candidate directory

### 气象

| Topic | Stored cards |
| --- | ---: |
| 季节 | 7 |
| 空气密度 | 10 |
| 雷击 | 7 |
| 气象基础 | 18 |
| 风切变 | 22 |
| 微下击暴流 | 4 |
| 飞行气象运行 | 53 |
| 侧风着陆 | 8 |
| 积雨云与雷暴 | 16 |
| 积冰 | 21 |
| 强降雨 | 3 |
| 不利天气 | 9 |
| 低能见度与跑道视程 | 12 |
| 冬夏季运行 | 11 |
| 颠簸 | 9 |

### 特情

| Topic | Stored cards |
| --- | ---: |
| 紧急撤离 | 10 |
| 飞行中失火 | 6 |
| 医疗紧急情况 | 3 |
| 外来物吸入 | 8 |
| 鸟击 | 8 |
| 烟雾 | 4 |
| 水上迫降 | 29 |
| 非正常情况 | 77 |
| 充电宝与锂电池 | 13 |
| 紧急情况与遇险处置 | 44 |
| 劫机与非法干扰 | 6 |
| 失控 | 3 |
| 跑道侵入与地面冲突 | 14 |
| 危险品运输 | 17 |
| 应急设备 | 15 |
| 机上炸弹与可疑物品 | 5 |
| 失速警告 | 5 |
| 结构损伤 | 4 |
| 空中相撞与空中防撞系统 | 14 |
| 灭火器 | 9 |

### 缩略词

| Topic | Stored cards |
| --- | ---: |
| FCTM（飞行机组训练手册） | 5 |
| CFIT（可控飞行撞地） | 5 |
| EFB（电子飞行包） | 3 |
| PBN与RNAV与RNP（基于性能的导航与进近） | 8 |
| EFIS（电子飞行仪表系统） | 6 |
| RVSM（缩小垂直间隔） | 10 |
| CI（成本指数） | 12 |
| CDFA（连续下降最后进近） | 7 |
| EBT（循证训练） | 14 |
| VASI（目视进近坡度指示系统） | 4 |
| CPDLC（管制员与驾驶员数据链通信） | 4 |
| GNSS（全球导航卫星系统） | 3 |
| HUD（平视显示器） | 8 |
| CVR与FDR（驾驶舱话音与飞行数据记录器） | 17 |
| GPWS与EGPWS（近地警告与增强型近地警告系统） | 7 |
| GPS（全球定位系统） | 5 |
| QAR（快速存取记录器） | 3 |
| ATIS（自动终端情报服务） | 11 |
| NOTAM（航行通告） | 1 |
| QRH（快速检查单） | 5 |
| MEL（最低设备清单） | 3 |
| SOP（标准操作程序） | 13 |

### 人的因素

| Topic | Stored cards |
| --- | ---: |
| 飞行作风 | 5 |
| 机组资源管理与协作 | 51 |
| 飞行员健康与机组失能 | 18 |
| 危险态度 | 3 |
| 红眼航班 | 10 |
| 控酒政策 | 8 |
| 飞行中人的因素 | 35 |
| 人为因素与人为差错 | 4 |
| 禁烟政策 | 8 |
| 疲劳与值勤限制 | 44 |
| 情景意识 | 4 |
| 飞行安全 | 21 |

### 运行

| Topic | Stored cards |
| --- | ---: |
| 不稳定进近 | 3 |
| 高度偏差 | 2 |
| 客航与货航 | 3 |
| 飞行程序 | 38 |
| 开槽跑道与湿滑道面 | 14 |
| 飞行训练与复训 | 71 |
| 航线运行与签派协作 | 12 |
| 飞行操纵检查 | 2 |
| 燃油 | 62 |
| 飞行记录本、检查单与手册 | 30 |
| 等待程序 | 2 |
| 复杂与特殊机场运行 | 30 |
| 绕机检查 | 13 |
| 飞行前准备 | 15 |
| 备降与改航 | 12 |
| 驾驶舱进入规则 | 5 |
| 擦尾 | 9 |
| 局方检查 | 5 |
| 着陆重量 | 7 |
| 旅客异常情况处置 | 10 |
| 旅客广播 | 4 |
| 无线电检查 | 7 |
| 复飞 | 9 |
| 无人机 | 9 |
| 飞行员与管制员通信 | 23 |
| 标准喊话 | 3 |
| 尾流 | 5 |
| 机场环境与运行 | 25 |
| 机场安检与航空安保 | 9 |
| 中断起飞 | 8 |
| 起飞着陆性能 | 12 |
| 延误与流控 | 11 |
| 航食 | 3 |
| 重心 | 3 |
| 舱单 | 8 |
| 禁区、危险区与限制区 | 7 |
| 夜航 | 8 |

### 飞机系统

| Topic | Stored cards |
| --- | ---: |
| 襟翼 | 9 |
| 增压系统 | 11 |
| 刹车系统 | 4 |
| 空调系统 | 10 |
| 导航 | 15 |
| 传统与数字驾驶舱 | 9 |
| 飞行自动化系统 | 9 |
| 发动机滑油 | 12 |
| 发动机系统与故障 | 18 |
| 磁罗盘 | 9 |
| 液压系统 | 14 |
| 驾驶舱内设备 | 28 |
| 起落架 | 10 |
| 皮托管 | 6 |
| 飞行操纵系统 | 15 |
| 侧窗 | 8 |
| 电气系统与故障 | 20 |
| 氧气系统 | 8 |

### 日常与职业交流

| Topic | Stored cards |
| --- | ---: |
| 航空英语学习与培训 | 26 |
| 飞行经历 | 38 |
| 个人与工作背景 | 10 |
| 问候与自我介绍 | 6 |
| 日常生活与交流 | 6 |
| 互联网与日常科技 | 7 |
| ICAO英语考试 | 18 |
| 家乡、居住与旅行 | 23 |
| 交通 | 17 |
| 机型特点与比较 | 24 |
| 爱好 | 34 |
| 航空发展与新技术 | 35 |


## Staged rollout implementation

New client capability and preview configuration select staged v30 through the existing protected content endpoints. Legacy requests continue v29, including after later v30 activation, using release compatibility metadata. Explicit historical version reads remain checksum-checked. The importer supports --stage and does not change existing active releases or user tables. Current hotspot references are reprojected by card ID at read time; dates, source records and reported wording are retained.

The user explicitly authorized production API deployment and inactive candidate import in this chat. The candidate payload validates as one OPI bank with 2364 referenced resources. Other bank releases are not part of the content import.

Derived vocabulary inventories retain identical lexical entries; only source checksums, evidence locations and deterministic projections were refreshed. ASR hotword terms/weights/text are unchanged; evidence topic paths follow moved card IDs.

API rollout tests: 6 suites, 42 passed and 1 existing skipped. New/legacy capability isolation, pinned historical reads and hotspot re-targeting are covered. Executed deployment order: deploy compatible API, import inactive v30 with reviewed mapping, then prepare the client/Web candidate. v29 stays active for legacy clients. No user-table rewrite is required.

## Final verification and authorization

`pnpm check:ci` passed locally: 274 App suites / 1912 cases; API 86 suites / 812 cases passed with 3 existing skipped. `content:check:full` passed with all 12651 media resources. A read-only production comparison found zero card-content hash mismatches between live v29 and candidate v30 (2365/2365). iOS release checks passed. ASC prepared 1.3.1 build 3596168 after uploaded 3596167.

The user explicitly authorized production API deployment and inactive v30 import through the approval reply in this chat. This does not authorize activating the formal directory, rewriting user tables or App Store submission. Production Web stays on v29; Web testing must use a preview deployment.

## Production API and inactive content delivery

Production API release: `opi-directory-v30-b0785dcaff79`, source `b0785dcaff794dda0862ffaa6156a6569a80095a`, annotated tag `release/api-production/20261102-b0785dca`. Existing schema ledger 0060/0061 was already current; no schema migration ran. Existing content-signing key was retained. Rollback target is the retained previous `production-migration-b46896c0b8be` API release, with OPI v29 still active.

The reviewed one-bank archive SHA-256 is `6c0f650d579784a28258e399085504b32654b26a150c041e9d1c94bda802e0c9`. Imported OPI v30 payload checksum: `37aba6e41b5150a300c7eb8f77826d50fc3ccaee0bd1d15590893632520ec025`. Import completed using `--stage`, explicit reviewed moves and expected-active-release checks. All 2364 referenced resources were already present. No customer tables were rewritten.

Post-deployment read-only checks: ordinary HTTP clients receive v29 / 237 topics; capable preview clients receive v30 / 223 topics. ID sets for all (2361), selected (892), crash (393) and free (23) are identical; image category objects are equal. Database confirms OPI v29 active and v30 inactive. Other active releases remain listening 26, radiotelephony 29, sentences900 27 and storytelling 26.

PR #325 additionally handles reorganized topic-only links by returning to the current directory; card links retain card-ID resolution. Focused storage/route tests: 18 passed, typecheck passed, GitHub CI passed. It changes client code only, so the production API remains at b0785dca.

A fresh real production AI verification passed on this API version, including transcription, grammar, polish, aviation entity preservation and temporary-test-data cleanup. This is server verification, not real-device microphone acceptance.

## User acceptance checklist

- Compare all / selected directories: names are understandable, duplicate supplemental topics are gone, adjacent topics are distinguishable, and names use consistent punctuation.
- Open moved cards and compare question, answer, translation and media; no card content or selected membership should change.
- With an existing account, check notes, tags, highlights and completed status before/after moving into the new directory; check cloud sync and a second login without clearing local storage.
- Check old card links, reorganized topic-only links, history/review entry, downloaded content, offline use and reconnect/update.
- In TestFlight, confirm audio playback, real microphone recording/replay and AI remain usable. Automatic checks do not replace these device observations.

Formal activation, customer-data rewrites, App Store review and production Web v30 deployment remain outside this delivery. User acceptance is pending.

## TestFlight and Web preview delivered

TestFlight **1.3.1 (3596168)** is uploaded and Apple reports `processingState=VALID`, `internalBuildState=IN_BETA_TESTING`; existing internal group **测试** can access it. App source: `3b558121946af64fa8d27c840949b74fe53765ac`; annotated tag: `release/ios-testflight/v1.3.1-b3596168`. IPA SHA-256: `179546412cc1e21a11b3790c00ee2c69c6bc7f0191beb31806607ffb4127df9d`. Delivery UUID: `f33c70de-dcec-44bf-8a5c-c6bb5556328c`. Prior TestFlight build 3596167 remains the rollback/reference candidate.

The clean-main Release archive, signing, production runtime, privacy manifests, SDK audit, Apple validation and upload passed. Release recording tests: 15 suites / 196 cases; iOS contract tests: 20 suites / 197 cases. This confirms candidate delivery, not user acceptance or real-device microphone success. No App Store submission or formal mobile update-channel change occurred.

Final-source Web export passed (189 files, 39.4 MiB). Local preview: `http://127.0.0.1:8083/question-bank/opi`, served only on localhost. Browser verification confirmed 223 topics; a removed topic-only link returned to the current directory, and a migrated-card old link reached the existing membership gate rather than unavailable content. Authenticated notes/progress and real-device paths remain on the checklist above. Production Web was not redeployed.

Durable local release evidence: `/Users/zhouyide/.codex/artifacts/opi-directory-v30-testflight/`; local Web export: `/Users/zhouyide/.codex/artifacts/opi-directory-v30-web-preview/`. These contain the archived candidate/IPA, audit, fingerprints and Apple status; credentials are not included. Formal OPI remains v29. User acceptance is pending.
