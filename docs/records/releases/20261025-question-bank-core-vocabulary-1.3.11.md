# 409 条全题库核心词书与 1.3.11 测试交付

状态：API、发音、Web、Android 测试版及 iOS TestFlight 已交付，实际学习体验待用户验收。

## 授权与源码

用户明确要求把审核后的 409 条制成适配 App 的独立新词书，原三本不动；随后明确频率只需大致区间，不继续追求精确计数。用户另行明确授权本轮生产 API 部署、新增发音内容发布和三端交付；不做数据库结构迁移或正式移动渠道发布。

实现 PR [#251](https://github.com/XIciA/icao-app/pull/251) 已合入主干，正式构建源码为 `83f6fb8f6cc0370f91904f514bdb880f4d6d33f3`。独立发布 clone 在 `main == origin/main`、工作区干净时完成源码归档及构建；未混入原工作目录或其他任务修改。

## 词书与兼容

- 新书“全题库高频核心词”：409 条，278 个单词、131 条表达，含航空释义、例句、译文、固定录音和大致频率标签。
- 唯一编辑来源为 `content/vocabulary/question-bank-core/source.json`，确定性生成 `book.json`。按五题库 v26 的原文归并词形及批准的拼写，排除答案、选项及已识别的无关义项；频率用于排序和 10+、50+ 等区间提示，不提供逐次人工精确统计承诺。
- 原三本 838 条的 JSON 字节及原有发音记录未变；原词书文件 SHA-256 为 `b4b00bb3bc62c994548b5345bba519e49c6b520687d35395adc865731c9869df`，线上默认目录 ETag 与之相同。
- 新客户端以 `?catalog=question-bank-core` 获取 4 本目录；旧默认接口继续返回原三本。进度、缓存、收藏、复习和播放复用现有机制，新词书不改变原 ICAO 等级测评题池。
- 新增 506 份录音，共 9,543,736 字节；既有 9,267 份清单记录保持一致。新词书实际使用的 818 份词条和例句录音已逐项核对线上资源记录、摘要及大小均就绪，另有 6 份签名下载样本完成全文摘要验证。

## 验证

- `pnpm check:ci` 与完整 `pnpm check` 通过：前端 232 套件 / 1,603 项、API 68 文件 / 688 项；词汇聚焦 66 项通过，含选新书→开始学习→频率展示→发音流程。
- [GitHub CI 40168994152](https://github.com/XIciA/icao-app/actions/runs/40168994152) 全部通过，含数据库约束、无 TypeScript loader 的生产合同加载以及 EdgeOne 导出。
- 完整媒体校验通过：12,651 个原题库资源、1,705,099,521 字节，大小与 SHA-256 一致；9,773 份所需发音文件的覆盖与摘要检查通过。
- 生产目录验证：4 本、409 条新词，全部例句、译文、发音文本及频率字段就绪，原三本及旧摘要一致；未登录新词书接口继续返回 401。
- 新生产 API 的真实 ASR、语法、润色、航空实体及临时录音清理验证通过，证据绑定 `vocabulary-20261025-83f6fb8f`；iOS 发布门禁再次通过。以上不代替用户真机体验。

## 已交付

### API 与发音

- Release ID：`vocabulary-20261025-83f6fb8f`；镜像 `sha256:3cc79ea4b3dc28aefc47123df3c41ac844f8fdbb551f014a1a90ae9e0afbd88d`，健康及非变更 readiness 检查通过。
- 源码包 SHA-256：`b9cb41f2948c3d8f7076da65f46b6c13639f946c6f4d1b4dfc6cee90a5a373da`；扩展目录摘要 `04c48457b508f678255f0f8705bfd1080b9aca6ad88edef7beaf84fb82134ecb`。
- 数据库结构校验为 CURRENT，无迁移；既有 app content v31 摘要保留，未重发五题库。只通过既有资源发布器追加新录音。
- 回滚备份：`/opt/icao/backups/api-vocabulary-20261025-83f6fb8f`；新录音为不可变追加资源，回退 API 或客户端不需删除它们。
- annotated tag：`release/api-production/20261025-83f6fb8f`。

### EdgeOne Web

- [readyoufife.com](https://readyoufife.com)，deployment `dpdjvdt1ktlz`，182 文件 / 37.9 MiB。
- 公网 HTML 指向本轮导出脚本，脚本包含新词书目录请求；根路由和 `/download` 返回 200。
- annotated tag：`release/web-edgeone/20261025-83f6fb8f`；可按 EdgeOne 历史恢复上一已验证部署。

### Android 独立测试版

- 包名 `com.readyoufife.app.test`，1.3.11 / 3583788，正式签名、v2 校验通过，与旧测试版证书一致：`25d4fe5523417289da5fe0bf970593b98fe4ea658883edeb5792906e31456629`。
- APK 137,428,157 字节；SHA-256 `73e533affcee2eac379c9803762e8bebd58684ed8f7c7eacb3a2702c6286b515`；本地、发布器及独立公网完整下载验证一致。
- [下载测试 APK](https://cloud.readyoufife.com/storage/v1/object/public/app-releases/android/feizhu-icao-android-test-1.3.11-b3583788.apk)，[官网测试入口](https://readyoufife.com/download)读取 `android-test`。
- 清单备份 `/opt/icao/backups/app-updates-vocabulary-20261025/updates-before-20261025T065411938954Z.json`；发布后核对其余三个渠道逐项保持一致。
- annotated tag：`release/android-test/v1.3.11-b3583788`。

### iOS TestFlight

- Bundle ID `com.readyoufife.ios`，1.3.11 / 3583788；Apple Build ID `c6f91b57-00e8-4c06-b90c-56b62c8865da`。
- Apple `VERIFY SUCCEEDED`、`UPLOAD SUCCEEDED`；独立 API 查询确认 processingState=VALID、expired=false、internalBuildState=IN_BETA_TESTING，内部“测试”组 hasAccessToAllBuilds=true。
- 归档与导出成功，身份、签名、隐私、生产运行时与正式包中的新词书目录请求校验通过。IPA 40,905,860 字节，SHA-256 `2aa4bfc5ad57e414c9a91809b98076aefec1515c2221a7c2e2dd71d758c1d51d`。
- IPA 保存在 `.generated/testflight/export-3583788-20261025T065515Z/app.ipa`，归档为同目录根下 `ICAO-3583788-20261025T065515Z.xcarchive`；候选证据绑定精确源码 `83f6fb8f`。
- 仅发布 `ios-testflight` 清单；备份 `/opt/icao/backups/app-updates-vocabulary-20261025/updates-before-20261025T071114823588Z.json`。最终独立回读确认两个测试渠道均为 1.3.11 / 3583788，两个正式渠道与发布前逐项一致。
- annotated tag：`release/ios-testflight/v1.3.11-b3583788`。旧测试候选 1.3.10 / 3583787 仍可从 TestFlight 历史选择；不以降低 build 的方式保证已升级 App 的本地数据回退。

## 证据与待验

脱敏证据位于发布 clone `/Users/zhouyide/.codex/icao-guide-release-20261022/.generated/vocabulary-core/`。iOS 首次 pod install 因 Maven 连接 SSL 中断失败；改用已有、同版本的官方 Hermes 0.14.1 Release 缓存，两个既有缓存的 SHA-256 同为 `af777af183efde76275685216f8ec442cf163223a451a636863bcaf7afda2b0e`，Pods 安装通过。仅从已完成检查、prebuild 与 Pods 之后接续原脚本的归档、审计、签名、导出、Apple 校验和上传，未改变依赖版本或产品源码。

iOS、Android 和 Web 的实际词书学习体验仍待用户验收。未提交 App Store 审核，未替换 Android 正式 APK，不把代码和候选校验写成真机已验收。
