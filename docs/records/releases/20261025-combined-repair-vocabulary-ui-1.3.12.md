# 综合修复、单词UI与1.3.12统一测试交付

状态：iOS TestFlight与产品Web已交付；Android测试包由单词任务继续处理，用户体验待验收。

## 授权与源码

用户先要求等待单词任务，随后明确授权协调完成后一起上传TestFlight，并要求检查单词UI与使用指南等功能的联动。单词聊天保留其已获授权的Web和Android测试交付；未提交App Store正式审核或替换Android正式版。

- 综合修复：PR #253，f89c748a。
- 单词紧凑卡片、统一介绍、居中单词与蓝色频率标签、首卡指南锚点：PR #254，93b9c58a。
- 统一版本：PR #255，63d2103e2829a96b91f2502f630bca5c3c32a134；1.3.12 / 3584843。
- iOS与其它测试制品使用同一已合并提交，不从未提交修改或旧分支构建。

## 验证

- 整合功能后的完整本地pnpm check：前端233套件/1609项，API68文件/688项；最终版本PR CI 40189157227通过，含数据库约束、合同生产加载及EdgeOne导出。
- 单词与指南21套件/134项回归，覆盖详情、多选、确认推进、手动重看、发音、收藏与进度；实际组件在宽屏与390px核对，长短单词保持居中。
- 12,651份原题库媒体、1,705,099,521字节的大小及SHA-256通过，未重发题库。
- iOS发布入口再次完成录音、类型、StoreKit与关键能力门禁。AI使用当日同一线上API版本、验证器指纹未变且仍在24小时内的真实live证据；门禁重新核对线上版本，不把历史证据写成新的调用结果。
- TestFlight真机登录往返、VIP即时刷新、教学/PDF流畅度、OPI播放按钮以及新单词UI仍待用户验收。

## 渠道结果

### EdgeOne产品Web

单词任务已完成同一63d2103e的部署，deployment dp28f0mity9r，182文件/37.9MiB。readyoufife.com根路由及/download返回200，公网JS与本地导出逐字节一致（8,143,637字节，SHA-256 a1ecdefb33e98f1b9ed3ee52a9b8327143a1b807d645c4a779c9a9afa1a6a07b），包含四本统一介绍。annotated tag release/web-edgeone/20261025-63d2103e。

### iOSTestFlight

- Bundle ID com.readyoufife.ios，版本1.3.12 / build3584843；Apple Build ID 530d2664-274f-4b43-a4bb-228dd16ea468。
- Apple VERIFY SUCCEEDED、UPLOAD SUCCEEDED；独立API查询确认processingState=VALID、expired=false、internalBuildState=IN_BETA_TESTING，内部“测试”组hasAccessToAllBuilds=true且当前构建已分配。
- IPA 40,906,689字节，SHA-256 c9ad3af67d0aef0191839962712d05f922183531993b2bdccf5a4d12cae1fd34。归档及导出位于现有发布clone的.generated/testflight/ICAO-3584843-20261025T114153Z.xcarchive与export-3584843-20261025T114153Z/app.ipa；candidate.json绑定精确提交63d2103e。
- 只发布ios-testflight清单；公网独立回读1.3.12/3584843，其余三个渠道与该次发布前逐项一致。备份/opt/icao/backups/app-updates-combined-20261025/updates-before-20261025T120537647585Z.json。
- annotated tag release/ios-testflight/v1.3.12-b3584843已推送。未提交App Store正式审核，未改ios-app-store正式更新清单。
- 脱敏证据：现有发布clone的.generated/combined-repair-1.3.12/ios-testflight.log及.generated/testflight/candidate.json；本聊天工作区.generated/combined-delivery/包含独立Apple回读和更新清单前后比较。
- 构建使用已有官方Hermes 0.14.1 Release缓存，SHA-256 af777af183efde76275685216f8ec442cf163223a451a636863bcaf7afda2b0e，与上一已验证制品一致；依赖图严格沿用锁文件，未隐式更新版本。

### Android独立测试版

等待iOS构建释放现有发布目录，由单词任务继续处理。

## 追溯与待验

API沿用vocabulary-20261025-83f6fb8f，本轮未部署API、迁移数据库或发布新音频。正式移动渠道保留1.2.1；测试交付与用户验收分别记录。iOS旧1.3.11候选保留在TestFlight历史，Web可按EdgeOne历史恢复；不承诺已安装新版App可通过降低build保留本地数据回退。
