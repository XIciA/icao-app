# 陆空通话呼号修正测试应用复核清单

> 定位格式：航司分类 → 修正后场景名 → 场景 ID → 任务标题。勾选项仅用于人工页面抽查，正式修正结论已按用户统计锁定。

## 发布候选

- 本地题库版本：v11
- 陆空通话：186 场景 / 3216 卡
- 陆空通话 checksum：`3f1caafa8d4d5842aacf0e311b14055907c893dbc1b034f218e146ce5de0d393`
- 资源 manifest：`94525c1fd882667345b733d2e26885c2f761e725b0f3b454b4e4c914e3533693`；资源不变

## A. 已删除的跨场景错误题

| 复核 | 航司 | 场景 | 原任务标题 | 卡 ID | 原音频路径 |
|---|---|---|---|---|---|
| □ | JAL | atc-scenario-0044 · JAL 220 转述接收机失效 吸入外来物体 右发超温 | JAL 220-2 | `atc-scenario-0044-card-main-747` | `/question-bank-assets/audio/radiotelephony/main/747.mp3` |
| □ | JAL | atc-scenario-0182 · JAL 220 鸟击 积冰/防冰 乘客医疗 | JAL 220-2 | `atc-scenario-0182-card-main-3132` | `/question-bank-assets/audio/radiotelephony/web-v6/pepec-radiotelephony-083-jal220-q02.mp3` |

删除后两个场景均按页面连续显示 `JAL 220-1` 至 `JAL 220-14`；原音频文件保留，不重新映射。

## B/C. 已统一的场景呼号

| 复核 | 航司 | 场景 ID | 修正后场景名 | 原错误呼号 | 最终呼号 | 任务标题范围 |
|---|---|---|---|---|---|---|
| □ | SIA | atc-scenario-0014 | SIA 334 通讯失效 地面延误 | `SIA 1334` | `SIA 334` | `SIA 334-1` 至 `SIA 334-10` |
| □ | AFR | atc-scenario-0024 | AFR 939 中断起飞 刹车超温 | `AFR 9939` | `AFR 939` | `AFR 939-1` 至 `AFR 939-16` |
| □ | BAW | atc-scenario-0031 | BAW 352 询问两地天气 复飞 | `BAW 2352` | `BAW 352` | `BAW 352-1` 至 `BAW 352-19` |
| □ | CCA | atc-scenario-0068 | CCA 301 刹车超温 一个前轮没气 | `CCA 1301` | `CCA 301` | `CCA 301-1` 至 `CCA 301-20` |
| □ | CCA | atc-scenario-0069 | CCA 432 避开强下沉气流 | `CCA 1432` | `CCA 432` | `CCA 432-1` 至 `CCA 432-15` |
| □ | CCA | atc-scenario-0070 | CCA 368(印度口音)跑线 复飞 | `CCA 1368` | `CCA 368` | `CCA 368-1` 至 `CCA 368-16` |
| □ | CSN | atc-scenario-0077 | CSN 102 因延误重新加油 | `CSN 3102` | `CSN 102` | `CSN 102-1` 至 `CSN 102-15` |
| □ | CSN | atc-scenario-0078 | CSN 109 冰雹风挡裂 自动降落许可 | `CSN 3109` | `CSN 109` | `CSN 109-1` 至 `CSN 109-16` |
| □ | CSN | atc-scenario-0079 | CSN 310 减跑道 地面延误加油 | `CSN 1310` | `CSN 310` | `CSN 310-1` 至 `CSN 310-17` |
| □ | CSN | atc-scenario-0080 | CSN 202 前缘襟翼结冰 | `CSN 6202` | `CSN 202` | `CSN 202-1` 至 `CSN 202-21` |
| □ | CSN | atc-scenario-0081 | CSN 353 危险品卸载 浓雾 | `CSN 7353` | `CSN 353` | `CSN 353-1` 至 `CSN 353-16` |
| □ | CSN | atc-scenario-0082 | CSN 311 跑线 宣布燃油紧急 | `CSN 3112`、`CSN 112`、`CSN 7112` | `CSN 311` | `CSN 311-1` 至 `CSN 311-19` |
| □ | CSN | atc-scenario-0083 | CSN 102 轮挡 左发防冰失效 | `CSN 3102` | `CSN 102` | `CSN 102-1` 至 `CSN 102-19` |
| □ | CSN | atc-scenario-0084 | CSN 001 老太太受伤 2座乘客重伤 | `CSN 3001`、`CSN 7001` | `CSN 001` | `CSN 001-1` 至 `CSN 001-17` |
| □ | CSN | atc-scenario-0085 | CSN 102 乘客被热咖啡烫伤 | `CSN 3102`、`CSN 7102` | `CSN 102` | `CSN 102-1` 至 `CSN 102-21` |
| □ | CSN | atc-scenario-0086 | CSN 235 完全准备 强风切变 | `CSN 3235` | `CSN 235` | `CSN 235-1` 至 `CSN 235-15` |
| □ | CSN | atc-scenario-0087 | CSN 682 试音 襟翼卡起飞位 液压漏油 | `CSN 6682` | `CSN 682` | `CSN 682-1` 至 `CSN 682-17` |
| □ | CSN | atc-scenario-0088 | CSN 302 异物击中,疑似冰雹,仪表失真 | `CSN 9302` | `CSN 302` | `CSN 302-1` 至 `CSN 302-19` |
| □ | CES | atc-scenario-0095 | CES 151 拖把断了 鸟击一发失效 | `CES 2151` | `CES 151` | `CES 151-1` 至 `CES 151-15` |
| □ | CES | atc-scenario-0096 | CES 102 异响 3客受伤 | `CES 5102` | `CES 102` | `CES 102-1` 至 `CES 102-18` |
| □ | CES | atc-scenario-0097 | CES 325 左翼撞击 三号熄火 冲出跑道 | `CES 5325` | `CES 325` | `CES 325-1` 至 `CES 325-23` |
| □ | CES | atc-scenario-0099 | CES 277 襟翼卡阻 无法完全放下 | `CES 5277` | `CES 277` | `CES 277-1` 至 `CES 277-16` |
| □ | CSN | atc-scenario-0102 | CSN 426 乘客坐错 翼尖相撞 | `CSN 3426` | `CSN 426` | `CSN 426-1` 至 `CSN 426-11` |
| □ | BAW | atc-scenario-0124 | BAW 352 鸟击 雷暴绕飞 TCAS机动 | `BAW 2352` | `BAW 352` | `BAW 352-1` 至 `BAW 352-19` |
| □ | CSN | atc-scenario-0160 | CSN 302 雷暴绕飞 TCAS机动 备降/返航 | `CSN 9302`、`CSN 3902` | `CSN 302` | `CSN 302-1` 至 `CSN 302-19` |
| □ | AFR | atc-scenario-0165 | AFR 939 刹车问题 积冰/防冰 TCAS机动 | `AFR 9939` | `AFR 939` | `AFR 939-1` 至 `AFR 939-16` |

## D. 语境串题候选

- 本轮不处理；继续保留在完整音频原文语境审查报告中。

## 自动检查结论

- 场景级错误呼号替换：1369 处。
- 删除错误卡：2 张。
- 非目标卡 ID、音频路径和资源 manifest：已验证未变化。
