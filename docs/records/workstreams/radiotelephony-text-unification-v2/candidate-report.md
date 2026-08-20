# 陆空通话文本第二轮统一候选报告

- 总卡片：1851
- 目标字段：audioText, audioTextZh, referenceText, referenceTextZh
- 候选修改卡片：1850
- 候选修改字段：6352
- 预期残留问题：0
- 本轮只执行新增规则；首轮工具、快照和报告由校验值保护。

## 规则统计

| 规则 | 修改字段 | 说明 |
| --- | ---: | --- |
| CALLSIGN-V2-001 | 6058 | Airline callsign codes and spacing; preserve the original number. |
| ICAO-V2-001 | 878 | ICAO phonetic alphabet words to compact aviation letter codes. |
| PROCEDURE-V2-001 | 304 | Arrival/departure designator hyphen; preserve digit width and suffix. |
| RUNWAY-V2-001 | 778 | Runway is capitalized only before a numeric runway designator. |

## 字段统计

| 字段 | 修改数 |
| --- | ---: |
| audioText | 1377 |
| audioTextZh | 1280 |
| referenceText | 1847 |
| referenceTextZh | 1848 |

## 预期残留

| 卡片 | 字段 | 问题 |
| --- | --- | --- |
| - | - | 0 |

## 前 120 条候选

| 卡片 | 字段 | 规则 | 修改前 | 修改后 |
| --- | --- | --- | --- | --- |
| atc-scenario-0001-card-main-001 | audioText | CALLSIGN-V2-001, ICAO-V2-001 | B: Your call sign is Qantas 432, you are parking at gate 24, you have got information Hotel, ask Shanghai Delivery for ATC clearance to Beijing. | B: Your call sign is QFA 432, you are parking at gate 24, you have got information H, ask Shanghai Delivery for ATC clearance to Beijing. |
| atc-scenario-0001-card-main-001 | audioTextZh | CALLSIGN-V2-001, ICAO-V2-001 | B：你的呼号是 Qantas 432，停在 24 号登机口，已收到 Hotel 情报，向上海放行申请前往北京的 ATC 放行许可。 | B：你的呼号是 QFA 432，停在 24 号登机口，已收到 H 情报，向上海放行申请前往北京的 ATC 放行许可。 |
| atc-scenario-0001-card-main-001 | referenceText | CALLSIGN-V2-001 | Shanghai Delivery, QFA432, gate 24, information H, request ATC clearance to Beijing. | Shanghai Delivery, QFA 432, gate 24, information H, request ATC clearance to Beijing. |
| atc-scenario-0001-card-main-001 | referenceTextZh | CALLSIGN-V2-001 | 上海放行，QFA432，24 号登机口，收到 H 情报，申请前往北京的 ATC 放行许可。 | 上海放行，QFA 432，24 号登机口，收到 H 情报，申请前往北京的 ATC 放行许可。 |
| atc-scenario-0001-card-main-002 | audioText | CALLSIGN-V2-001, ICAO-V2-001, PROCEDURE-V2-001, RUNWAY-V2-001 | C: Qantas 432, cleared to Beijing via flight planned route, runway in use runway 26, Hotel Zulu 01 departure, initial climb to 600 meters on QNH, after departure, contact 128.75, squawk 3421. | C: QFA 432, cleared to Beijing via flight planned route, runway in use Runway 26, HZ-01 departure, initial climb to 600 meters on QNH, after departure, contact 128.75, squawk 3421. |
| atc-scenario-0001-card-main-002 | audioTextZh | CALLSIGN-V2-001, ICAO-V2-001, PROCEDURE-V2-001 | C：Qantas 432，许可按飞行计划航路飞往北京，使用跑道 26，Hotel Zulu 01 离场，QNH 上初始爬升至 600 米，离场后联系 128.75，应答机 3421。 | C：QFA 432，许可按飞行计划航路飞往北京，使用跑道 26，HZ-01 离场，QNH 上初始爬升至 600 米，离场后联系 128.75，应答机 3421。 |
| atc-scenario-0001-card-main-002 | referenceText | CALLSIGN-V2-001, PROCEDURE-V2-001, RUNWAY-V2-001 | Cleared to Beijing via flight planned route, runway in use runway 26, HZ 01 departure, initial climb to 600 meters on QNH, after departure, contact 128.75, squawk 3421, QFA432. | Cleared to Beijing via flight planned route, runway in use Runway 26, HZ-01 departure, initial climb to 600 meters on QNH, after departure, contact 128.75, squawk 3421, QFA 432. |
| atc-scenario-0001-card-main-002 | referenceTextZh | CALLSIGN-V2-001, PROCEDURE-V2-001 | 许可按飞行计划航路飞往北京，使用跑道 26，HZ 01 离场，QNH 上初始爬升至 600 米，离场后联系 128.75，应答机 3421，QFA432。 | 许可按飞行计划航路飞往北京，使用跑道 26，HZ-01 离场，QNH 上初始爬升至 600 米，离场后联系 128.75，应答机 3421，QFA 432。 |
| atc-scenario-0001-card-main-003 | audioText | CALLSIGN-V2-001 | C: Qantas 432, read back correct, report when ready for push back and start up. | C: QFA 432, read back correct, report when ready for push back and start up. |
| atc-scenario-0001-card-main-003 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 432，复诵正确，准备好推出和开车时报告。 | C：QFA 432，复诵正确，准备好推出和开车时报告。 |
| atc-scenario-0001-card-main-003 | referenceText | CALLSIGN-V2-001 | Wilco, QFA432. | Wilco, QFA 432. |
| atc-scenario-0001-card-main-003 | referenceTextZh | CALLSIGN-V2-001 | 照办，QFA432。 | 照办，QFA 432。 |
| atc-scenario-0001-card-main-004 | referenceText | CALLSIGN-V2-001 | Shanghai Ground, QFA432, ready for push back and start up. | Shanghai Ground, QFA 432, ready for push back and start up. |
| atc-scenario-0001-card-main-004 | referenceTextZh | CALLSIGN-V2-001 | 上海地面，QFA432，准备好推出和开车。 | 上海地面，QFA 432，准备好推出和开车。 |
| atc-scenario-0001-card-main-005 | audioText | CALLSIGN-V2-001 | C: Qantas 432, push back and start up approved. | C: QFA 432, push back and start up approved. |
| atc-scenario-0001-card-main-005 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 432，推出和开车批准。 | C：QFA 432，推出和开车批准。 |
| atc-scenario-0001-card-main-005 | referenceText | CALLSIGN-V2-001 | Push back and start up approved, QFA432. | Push back and start up approved, QFA 432. |
| atc-scenario-0001-card-main-005 | referenceTextZh | CALLSIGN-V2-001 | 推出和开车批准，QFA432。 | 推出和开车批准，QFA 432。 |
| atc-scenario-0001-card-main-006 | referenceText | CALLSIGN-V2-001 | Shanghai Ground, QFA432, request taxi. | Shanghai Ground, QFA 432, request taxi. |
| atc-scenario-0001-card-main-006 | referenceTextZh | CALLSIGN-V2-001 | 上海地面，QFA432，请求滑行。 | 上海地面，QFA 432，请求滑行。 |
| atc-scenario-0001-card-main-007 | audioText | CALLSIGN-V2-001, ICAO-V2-001, RUNWAY-V2-001 | C: Qantas 432, taxi via taxiway Foxtrot, Charlie 1 and Bravo to holding point runway 26. Caution! work in progress at the end of gate 319. | C: QFA 432, taxi via taxiway F, C1 and B to holding point Runway 26. Caution! work in progress at the end of gate 319. |
| atc-scenario-0001-card-main-007 | audioTextZh | CALLSIGN-V2-001, ICAO-V2-001 | C：Qantas 432，经 Foxtrot、Charlie 1 和 Bravo 滑行道滑行至跑道 26 等待点。注意！319 号登机口末端有施工。 | C：QFA 432，经 F、C1 和 B 滑行道滑行至跑道 26 等待点。注意！319 号登机口末端有施工。 |
| atc-scenario-0001-card-main-007 | referenceText | CALLSIGN-V2-001, RUNWAY-V2-001 | Taxi via taxiway F, C1 and B to holding point runway 26, roger, thanks, QFA432. | Taxi via taxiway F, C1 and B to holding point Runway 26, roger, thanks, QFA 432. |
| atc-scenario-0001-card-main-007 | referenceTextZh | CALLSIGN-V2-001 | 经 F、C1 和 B 滑行道滑行至跑道 26 等待点，收到，谢谢，QFA432。 | 经 F、C1 和 B 滑行道滑行至跑道 26 等待点，收到，谢谢，QFA 432。 |
| atc-scenario-0001-card-main-008 | referenceText | CALLSIGN-V2-001 | Shanghai Ground, QFA432, we notice some smoke coming from APU on B747 ahead of us. | Shanghai Ground, QFA 432, we notice some smoke coming from APU on B747 ahead of us. |
| atc-scenario-0001-card-main-008 | referenceTextZh | CALLSIGN-V2-001 | 上海地面，QFA432，我们注意到前方 B747 的 APU 冒烟。 | 上海地面，QFA 432，我们注意到前方 B747 的 APU 冒烟。 |
| atc-scenario-0001-card-main-009 | audioText | RUNWAY-V2-001 | B: Now you are holding point runway 26, tell ATC you are ready for takeoff. | B: Now you are holding point Runway 26, tell ATC you are ready for takeoff. |
| atc-scenario-0001-card-main-009 | referenceText | CALLSIGN-V2-001, RUNWAY-V2-001 | Shanghai Tower, QFA432, holding point runway 26, ready for departure. | Shanghai Tower, QFA 432, holding point Runway 26, ready for departure. |
| atc-scenario-0001-card-main-009 | referenceTextZh | CALLSIGN-V2-001 | 上海塔台，QFA432，跑道 26 等待点，准备好离场。 | 上海塔台，QFA 432，跑道 26 等待点，准备好离场。 |
| atc-scenario-0001-card-main-010 | audioText | CALLSIGN-V2-001 | C: Qantas 432, behind landing traffic, line up behind. | C: QFA 432, behind landing traffic, line up behind. |
| atc-scenario-0001-card-main-010 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 432，在落地航空器之后，跟随其后进跑道。 | C：QFA 432，在落地航空器之后，跟随其后进跑道。 |
| atc-scenario-0001-card-main-010 | referenceText | CALLSIGN-V2-001 | Behind landing traffic, line up behind, QFA432. | Behind landing traffic, line up behind, QFA 432. |
| atc-scenario-0001-card-main-010 | referenceTextZh | CALLSIGN-V2-001 | 在落地航空器之后，跟随其后进跑道，QFA432。 | 在落地航空器之后，跟随其后进跑道，QFA 432。 |
| atc-scenario-0001-card-main-011 | referenceText | CALLSIGN-V2-001 | Beijing Approach, QFA432, reaching 5100 meters, request further descent. | Beijing Approach, QFA 432, reaching 5100 meters, request further descent. |
| atc-scenario-0001-card-main-011 | referenceTextZh | CALLSIGN-V2-001 | 北京进近，QFA432，正到达 5100 米，请求继续下降。 | 北京进近，QFA 432，正到达 5100 米，请求继续下降。 |
| atc-scenario-0001-card-main-012 | audioText | CALLSIGN-V2-001 | C: Qantas 432, descend and maintain 3300 meters on QNH 1031. | C: QFA 432, descend and maintain 3300 meters on QNH 1031. |
| atc-scenario-0001-card-main-012 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 432，下降并保持 QNH 1031 上 3300 米。 | C：QFA 432，下降并保持 QNH 1031 上 3300 米。 |
| atc-scenario-0001-card-main-012 | referenceText | CALLSIGN-V2-001 | Descend and maintain 3300 meters on QNH 1031, QFA432. | Descend and maintain 3300 meters on QNH 1031, QFA 432. |
| atc-scenario-0001-card-main-012 | referenceTextZh | CALLSIGN-V2-001 | 下降并保持 QNH 1031 上 3300 米，QFA432。 | 下降并保持 QNH 1031 上 3300 米，QFA 432。 |
| atc-scenario-0001-card-main-013 | referenceText | CALLSIGN-V2-001 | Beijing Approach, QFA432, maintaining 3300 meters, request further descent. | Beijing Approach, QFA 432, maintaining 3300 meters, request further descent. |
| atc-scenario-0001-card-main-013 | referenceTextZh | CALLSIGN-V2-001 | 北京进近，QFA432，保持 3300 米，请求继续下降。 | 北京进近，QFA 432，保持 3300 米，请求继续下降。 |
| atc-scenario-0001-card-main-014 | audioText | CALLSIGN-V2-001 | C: Qantas 432, maintain 3300 meters, opposite traffic at 2 o'clock 10 miles, report clear of traffic. | C: QFA 432, maintain 3300 meters, opposite traffic at 2 o'clock 10 miles, report clear of traffic. |
| atc-scenario-0001-card-main-014 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 432，保持 3300 米，相对飞行航空器在 2 点钟方向 10 海里，脱离冲突后报告。 | C：QFA 432，保持 3300 米，相对飞行航空器在 2 点钟方向 10 海里，脱离冲突后报告。 |
| atc-scenario-0001-card-main-014 | referenceText | CALLSIGN-V2-001 | Maintain 3300 meters, wilco, QFA432. | Maintain 3300 meters, wilco, QFA 432. |
| atc-scenario-0001-card-main-014 | referenceTextZh | CALLSIGN-V2-001 | 保持 3300 米，照办，QFA432。 | 保持 3300 米，照办，QFA 432。 |
| atc-scenario-0001-card-main-015 | referenceText | CALLSIGN-V2-001 | Beijing Approach, QFA432, clear of traffic, request descent. | Beijing Approach, QFA 432, clear of traffic, request descent. |
| atc-scenario-0001-card-main-015 | referenceTextZh | CALLSIGN-V2-001 | 北京进近，QFA432，已脱离航空器，请求下降。 | 北京进近，QFA 432，已脱离航空器，请求下降。 |
| atc-scenario-0001-card-main-016 | referenceText | CALLSIGN-V2-001 | Beijing Approach, QFA432, descending to 1200 meters, the sky is turning dark, the visibility is deteriorating, we suspect a sandstorm, is there sandstorm forecast ? | Beijing Approach, QFA 432, descending to 1200 meters, the sky is turning dark, the visibility is deteriorating, we suspect a sandstorm, is there sandstorm forecast ? |
| atc-scenario-0001-card-main-016 | referenceTextZh | CALLSIGN-V2-001 | 北京进近，QFA432，正下降至 1200 米，天空变暗，能见度变差，我们怀疑有沙尘暴，是否有沙尘暴预报？ | 北京进近，QFA 432，正下降至 1200 米，天空变暗，能见度变差，我们怀疑有沙尘暴，是否有沙尘暴预报？ |
| atc-scenario-0001-card-main-017 | referenceText | CALLSIGN-V2-001 | Beijing Approach, QFA432, the sandstorm is severe and the visibility is very poor, request climb to a higher level. | Beijing Approach, QFA 432, the sandstorm is severe and the visibility is very poor, request climb to a higher level. |
| atc-scenario-0001-card-main-017 | referenceTextZh | CALLSIGN-V2-001 | 北京进近，QFA432，沙尘暴严重，能见度很差，请求爬升到更高高度。 | 北京进近，QFA 432，沙尘暴严重，能见度很差，请求爬升到更高高度。 |
| atc-scenario-0001-card-main-018 | audioText | CALLSIGN-V2-001 | C: Qantas 432, climb to 2100 meters, turn right heading 230. | C: QFA 432, climb to 2100 meters, turn right heading 230. |
| atc-scenario-0001-card-main-018 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 432，爬升至 2100 米，右转航向 230。 | C：QFA 432，爬升至 2100 米，右转航向 230。 |
| atc-scenario-0001-card-main-018 | referenceText | CALLSIGN-V2-001 | Climb to 2100 meters, turn right heading 230, QFA432. | Climb to 2100 meters, turn right heading 230, QFA 432. |
| atc-scenario-0001-card-main-018 | referenceTextZh | CALLSIGN-V2-001 | 爬升至 2100 米，右转航向 230，QFA432。 | 爬升至 2100 米，右转航向 230，QFA 432。 |
| atc-scenario-0001-card-main-019 | referenceText | CALLSIGN-V2-001 | PANPAN PANPAN PANPAN, Beijing Approach, QFA432, No.1 and No.2 engines have failed due to sandstorm, request radar vector to Beijing for priority landing. Is weather in Beijing clear? | PANPAN PANPAN PANPAN, Beijing Approach, QFA 432, No.1 and No.2 engines have failed due to sandstorm, request radar vector to Beijing for priority landing. Is weather in Beijing clear? |
| atc-scenario-0001-card-main-019 | referenceTextZh | CALLSIGN-V2-001 | PANPAN PANPAN PANPAN，北京进近，QFA432，1 号和 2 号发动机因沙尘暴失效，请求雷达引导前往北京优先着陆。北京天气晴朗吗？ | PANPAN PANPAN PANPAN，北京进近，QFA 432，1 号和 2 号发动机因沙尘暴失效，请求雷达引导前往北京优先着陆。北京天气晴朗吗？ |
| atc-scenario-0001-card-main-020 | audioText | CALLSIGN-V2-001 | C: Qantas 432, turn right heading 250, the weather in Beijing is clear. | C: QFA 432, turn right heading 250, the weather in Beijing is clear. |
| atc-scenario-0001-card-main-020 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 432，右转航向 250，北京天气晴朗。 | C：QFA 432，右转航向 250，北京天气晴朗。 |
| atc-scenario-0001-card-main-020 | referenceText | CALLSIGN-V2-001 | Roger, turn right heading 250, QFA432. | Roger, turn right heading 250, QFA 432. |
| atc-scenario-0001-card-main-020 | referenceTextZh | CALLSIGN-V2-001 | 收到，右转航向 250，QFA432。 | 收到，右转航向 250，QFA 432。 |
| atc-scenario-0002-card-main-021 | audioText | CALLSIGN-V2-001, ICAO-V2-001 | B: Your call sign is Qantas 160, a flight from Tokyo to Guangzhou, you are maintaining 11000 meters, over Whiskey X-Ray India, your transponder code is 4525, make an initial contact with Zhengzhou Control. | B: Your call sign is QFA 160, a flight from Tokyo to Guangzhou, you are maintaining 11000 meters, over WXI, your transponder code is 4525, make an initial contact with Zhengzhou Control. |
| atc-scenario-0002-card-main-021 | audioTextZh | CALLSIGN-V2-001, ICAO-V2-001 | B：你的呼号是 Qantas 160，从东京飞往广州，保持 11000 米，飞越 Whiskey X-Ray India，应答机代码 4525，与郑州管制首次联系。 | B：你的呼号是 QFA 160，从东京飞往广州，保持 11000 米，飞越 WXI，应答机代码 4525，与郑州管制首次联系。 |
| atc-scenario-0002-card-main-021 | referenceText | CALLSIGN-V2-001 | Zhengzhou Control, QFA160, maintaining 11000 meters, over WXI, squawking 4525. | Zhengzhou Control, QFA 160, maintaining 11000 meters, over WXI, squawking 4525. |
| atc-scenario-0002-card-main-021 | referenceTextZh | CALLSIGN-V2-001 | 郑州管制，QFA160，保持 11000 米，飞越 WXI，应答机 4525。 | 郑州管制，QFA 160，保持 11000 米，飞越 WXI，应答机 4525。 |
| atc-scenario-0002-card-main-022 | audioText | CALLSIGN-V2-001 | C: Qantas 160, Zhengzhou Control, radar contact, descend and maintain 10400 meters. | C: QFA 160, Zhengzhou Control, radar contact, descend and maintain 10400 meters. |
| atc-scenario-0002-card-main-022 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 160，郑州管制，雷达识别，下降并保持 10400 米。 | C：QFA 160，郑州管制，雷达识别，下降并保持 10400 米。 |
| atc-scenario-0002-card-main-022 | referenceText | CALLSIGN-V2-001 | Descend and maintain 10400 meters, QFA160. | Descend and maintain 10400 meters, QFA 160. |
| atc-scenario-0002-card-main-022 | referenceTextZh | CALLSIGN-V2-001 | 下降并保持 10400 米，QFA160。 | 下降并保持 10400 米，QFA 160。 |
| atc-scenario-0002-card-main-023 | referenceText | CALLSIGN-V2-001 | Zhengzhou Control, QFA160, until what time we can expect high level ? | Zhengzhou Control, QFA 160, until what time we can expect high level ? |
| atc-scenario-0002-card-main-023 | referenceTextZh | CALLSIGN-V2-001 | 郑州管制，QFA160，我们什么时候可以预期高高度？ | 郑州管制，QFA 160，我们什么时候可以预期高高度？ |
| atc-scenario-0002-card-main-024 | audioText | CALLSIGN-V2-001, ICAO-V2-001 | C: Qantas 160, Zhengzhou Control, you can expect further climb after passing Zulu Hotel Oscar, but for now, continue descent to 9200 meters, reduced to minimum speed due to temporary airways restriction. | C: QFA 160, Zhengzhou Control, you can expect further climb after passing ZHO, but for now, continue descent to 9200 meters, reduced to minimum speed due to temporary airways restriction. |
| atc-scenario-0002-card-main-024 | audioTextZh | CALLSIGN-V2-001, ICAO-V2-001 | C：Qantas 160，郑州管制，飞越 Zulu Hotel Oscar 后可预期继续爬升，但现在继续下降并保持 9200 米，因临时航路限制减至最小速度。 | C：QFA 160，郑州管制，飞越 ZHO 后可预期继续爬升，但现在继续下降并保持 9200 米，因临时航路限制减至最小速度。 |
| atc-scenario-0002-card-main-024 | referenceText | CALLSIGN-V2-001 | Roger, expect further climb after passing ZHO, continue descend and maintain 9200 meters, reduced to minimum speed, QFA160. | Roger, expect further climb after passing ZHO, continue descend and maintain 9200 meters, reduced to minimum speed, QFA 160. |
| atc-scenario-0002-card-main-024 | referenceTextZh | CALLSIGN-V2-001 | 收到，飞越 ZHO 后预期继续爬升，继续下降并保持 9200 米，减至最小速度，QFA160。 | 收到，飞越 ZHO 后预期继续爬升，继续下降并保持 9200 米，减至最小速度，QFA 160。 |
| atc-scenario-0002-card-main-025 | audioText | CALLSIGN-V2-001 | C: Qantas 160, orbit right from present position until further advised. | C: QFA 160, orbit right from present position until further advised. |
| atc-scenario-0002-card-main-025 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 160，从当前位置右盘旋，直到进一步通知。 | C：QFA 160，从当前位置右盘旋，直到进一步通知。 |
| atc-scenario-0002-card-main-025 | referenceText | CALLSIGN-V2-001 | Orbit right from present position until further advised, QFA160. | Orbit right from present position until further advised, QFA 160. |
| atc-scenario-0002-card-main-025 | referenceTextZh | CALLSIGN-V2-001 | 从当前位置右盘旋，直到进一步通知，QFA160。 | 从当前位置右盘旋，直到进一步通知，QFA 160。 |
| atc-scenario-0002-card-main-026 | referenceText | CALLSIGN-V2-001 | Zhengzhou Control, QFA160, we will reach our minimum fuel if we are delayed any further. | Zhengzhou Control, QFA 160, we will reach our minimum fuel if we are delayed any further. |
| atc-scenario-0002-card-main-026 | referenceTextZh | CALLSIGN-V2-001 | 郑州管制，QFA160，如果再被延误，我们将达到最低燃油。 | 郑州管制，QFA 160，如果再被延误，我们将达到最低燃油。 |
| atc-scenario-0002-card-main-027 | audioText | CALLSIGN-V2-001 | C: Qantas 160, Zhengzhou Control, roger, after this orbit, direct to AKOMA. | C: QFA 160, Zhengzhou Control, roger, after this orbit, direct to AKOMA. |
| atc-scenario-0002-card-main-027 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 160，郑州管制，收到，本次盘旋后，直飞 AKOMA。 | C：QFA 160，郑州管制，收到，本次盘旋后，直飞 AKOMA。 |
| atc-scenario-0002-card-main-027 | referenceText | CALLSIGN-V2-001 | After this orbit, direct to AKOMA, QFA160. | After this orbit, direct to AKOMA, QFA 160. |
| atc-scenario-0002-card-main-027 | referenceTextZh | CALLSIGN-V2-001 | 本次盘旋后，直飞 AKOMA，QFA160。 | 本次盘旋后，直飞 AKOMA，QFA 160。 |
| atc-scenario-0002-card-main-028 | referenceText | CALLSIGN-V2-001 | Zhengzhou Control, QFA160, we don't have enough fuel to fly to Guangzhou, request divert to Changsha Airport. | Zhengzhou Control, QFA 160, we don't have enough fuel to fly to Guangzhou, request divert to Changsha Airport. |
| atc-scenario-0002-card-main-028 | referenceTextZh | CALLSIGN-V2-001 | 郑州管制，QFA160，我们没有足够燃油飞往广州，请求备降长沙机场。 | 郑州管制，QFA 160，我们没有足够燃油飞往广州，请求备降长沙机场。 |
| atc-scenario-0002-card-main-029 | audioText | CALLSIGN-V2-001 | C: Qantas 160, stand by for your request, temporary restriction is now cancelled, resume normal speed, direct to OBLIK. | C: QFA 160, stand by for your request, temporary restriction is now cancelled, resume normal speed, direct to OBLIK. |
| atc-scenario-0002-card-main-029 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 160，等待你的请求，临时限制现已取消，恢复正常速度，直飞 OBLIK。 | C：QFA 160，等待你的请求，临时限制现已取消，恢复正常速度，直飞 OBLIK。 |
| atc-scenario-0002-card-main-029 | referenceText | CALLSIGN-V2-001 | Resume normal speed, direct to OBLIK, QFA160. | Resume normal speed, direct to OBLIK, QFA 160. |
| atc-scenario-0002-card-main-029 | referenceTextZh | CALLSIGN-V2-001 | 恢复正常速度，直飞 OBLIK，QFA160。 | 恢复正常速度，直飞 OBLIK，QFA 160。 |
| atc-scenario-0002-card-main-030 | referenceText | CALLSIGN-V2-001 | Zhengzhou Control, QFA160, we have a navigation system problem, our instrument is showing inaccurate position, request radar monitoring. | Zhengzhou Control, QFA 160, we have a navigation system problem, our instrument is showing inaccurate position, request radar monitoring. |
| atc-scenario-0002-card-main-030 | referenceTextZh | CALLSIGN-V2-001 | 郑州管制，QFA160，我们有导航系统问题，仪表显示位置不准确，请求雷达监控。 | 郑州管制，QFA 160，我们有导航系统问题，仪表显示位置不准确，请求雷达监控。 |
| atc-scenario-0002-card-main-031 | audioText | CALLSIGN-V2-001 | C: Qantas 160, roger, you are slightly deviating to the left, turn right 5 degrees, contact Wuhan Control on 134.7, request diversion from Wuhan Control. | C: QFA 160, roger, you are slightly deviating to the left, turn right 5 degrees, contact Wuhan Control on 134.7, request diversion from Wuhan Control. |
| atc-scenario-0002-card-main-031 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 160，收到，你稍微向左偏航，右转 5 度，联系武汉管制134.7，向武汉管制请求备降。 | C：QFA 160，收到，你稍微向左偏航，右转 5 度，联系武汉管制134.7，向武汉管制请求备降。 |
| atc-scenario-0002-card-main-031 | referenceText | CALLSIGN-V2-001 | Roger, turn right 5 degrees, 134.7, QFA160. | Roger, turn right 5 degrees, 134.7, QFA 160. |
| atc-scenario-0002-card-main-031 | referenceTextZh | CALLSIGN-V2-001 | 收到，右转 5 度，134.7，QFA160。 | 收到，右转 5 度，134.7，QFA 160。 |
| atc-scenario-0002-card-main-032 | referenceText | CALLSIGN-V2-001 | Wuhan Control, QFA160, maintaining 9200 meters, over OBLIK, squawking 4525. | Wuhan Control, QFA 160, maintaining 9200 meters, over OBLIK, squawking 4525. |
| atc-scenario-0002-card-main-032 | referenceTextZh | CALLSIGN-V2-001 | 武汉管制，QFA160，保持 9200 米，飞越 OBLIK，应答机 4525。 | 武汉管制，QFA 160，保持 9200 米，飞越 OBLIK，应答机 4525。 |
| atc-scenario-0002-card-main-033 | audioText | CALLSIGN-V2-001 | C: Qantas 160, Wuhan Control, radar contact, I understand you have a navigation problem and fuel shortage, confirm you are diverting to Changsha.<br>B: Tell Wuhan Control you are performing the checklist and tell Wuhan Control to stand by. | C: QFA 160, Wuhan Control, radar contact, I understand you have a navigation problem and fuel shortage, confirm you are diverting to Changsha.<br>B: Tell Wuhan Control you are performing the checklist and tell Wuhan Control to stand by. |
| atc-scenario-0002-card-main-033 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 160，武汉管制，雷达识别，我了解你有导航问题和燃油不足，确认你正在备降长沙。<br>B：告诉武汉管制你正在执行检查单，并让武汉管制稍等。 | C：QFA 160，武汉管制，雷达识别，我了解你有导航问题和燃油不足，确认你正在备降长沙。<br>B：告诉武汉管制你正在执行检查单，并让武汉管制稍等。 |
| atc-scenario-0002-card-main-033 | referenceText | CALLSIGN-V2-001 | Wuhan Control, QFA160, stand by, we are performing the checklist. | Wuhan Control, QFA 160, stand by, we are performing the checklist. |
| atc-scenario-0002-card-main-033 | referenceTextZh | CALLSIGN-V2-001 | 武汉管制，QFA160，请稍等，我们正在执行检查单。 | 武汉管制，QFA 160，请稍等，我们正在执行检查单。 |
| atc-scenario-0002-card-main-034 | referenceText | CALLSIGN-V2-001 | Wuhan Control, QFA160, we are flying with basic navigation instruments, request divert to Wuhan Airport. | Wuhan Control, QFA 160, we are flying with basic navigation instruments, request divert to Wuhan Airport. |
| atc-scenario-0002-card-main-034 | referenceTextZh | CALLSIGN-V2-001 | 武汉管制，QFA160，我们正在使用基本导航仪表飞行，请求备降武汉机场。 | 武汉管制，QFA 160，我们正在使用基本导航仪表飞行，请求备降武汉机场。 |
| atc-scenario-0002-card-main-035 | audioText | CALLSIGN-V2-001 | C: Qantas 160, roger, divert to Wuhan approved, descend and maintain 4800 meters, contact Wuhan Approach on 120.45 when reaching. | C: QFA 160, roger, divert to Wuhan approved, descend and maintain 4800 meters, contact Wuhan Approach on 120.45 when reaching. |
| atc-scenario-0002-card-main-035 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 160，收到，备降武汉批准，下降并保持 4800 米，到达时联系武汉进近120.45。 | C：QFA 160，收到，备降武汉批准，下降并保持 4800 米，到达时联系武汉进近120.45。 |
| atc-scenario-0002-card-main-035 | referenceText | CALLSIGN-V2-001 | Divert to Wuhan approved, descend and maintain 4800 meters, 120.45, QFA160. | Divert to Wuhan approved, descend and maintain 4800 meters, 120.45, QFA 160. |
| atc-scenario-0002-card-main-035 | referenceTextZh | CALLSIGN-V2-001 | 备降武汉批准，下降并保持 4800 米，120.45，QFA160。 | 备降武汉批准，下降并保持 4800 米，120.45，QFA 160。 |
| atc-scenario-0002-card-main-036 | audioText | ICAO-V2-001 | B: Now you are reaching 4800 meters, you have got information Bravo, make an initial contact with Wuhan Approach. | B: Now you are reaching 4800 meters, you have got information B, make an initial contact with Wuhan Approach. |
| atc-scenario-0002-card-main-036 | audioTextZh | ICAO-V2-001 | B：现在你正到达 4800 米，已收到 Bravo 情报，与武汉进近首次联系。 | B：现在你正到达 4800 米，已收到 B 情报，与武汉进近首次联系。 |
| atc-scenario-0002-card-main-036 | referenceText | CALLSIGN-V2-001 | Wuhan Approach, QFA160, reaching 4800 meters, information B. | Wuhan Approach, QFA 160, reaching 4800 meters, information B. |
| atc-scenario-0002-card-main-036 | referenceTextZh | CALLSIGN-V2-001 | 武汉进近，QFA160，正到达 4800 米，收到 B 情报。 | 武汉进近，QFA 160，正到达 4800 米，收到 B 情报。 |
| atc-scenario-0002-card-main-037 | audioText | CALLSIGN-V2-001, ICAO-V2-001, PROCEDURE-V2-001, RUNWAY-V2-001 | C: Qantas 160, Wuhan Approach, radar contact, information Bravo is current, follow Zulu Foxtrot 01 Alpha arrival, expect ILS approach runway 36R. | C: QFA 160, Wuhan Approach, radar contact, information B is current, follow ZF-01A arrival, expect ILS approach Runway 36R. |
| atc-scenario-0002-card-main-037 | audioTextZh | CALLSIGN-V2-001, ICAO-V2-001, PROCEDURE-V2-001 | C：Qantas 160，武汉进近，雷达识别，Bravo 情报有效，执行 Zulu Foxtrot 01 Alpha 进场，预期 ILS 进近跑道 36 右。 | C：QFA 160，武汉进近，雷达识别，B 情报有效，执行 ZF-01A 进场，预期 ILS 进近跑道 36 右。 |
| atc-scenario-0002-card-main-037 | referenceText | CALLSIGN-V2-001, PROCEDURE-V2-001, RUNWAY-V2-001 | Follow ZF 01A arrival, expect ILS approach runway 36R, QFA160. | Follow ZF-01A arrival, expect ILS approach Runway 36R, QFA 160. |
| atc-scenario-0002-card-main-037 | referenceTextZh | CALLSIGN-V2-001, PROCEDURE-V2-001 | 执行 ZF 01A 进场，预期 ILS 进近跑道 36R，QFA160。 | 执行 ZF-01A 进场，预期 ILS 进近跑道 36R，QFA 160。 |
| atc-scenario-0002-card-main-038 | audioText | CALLSIGN-V2-001 | C: Qantas 160, are you declaring fuel emergency?<br>B: Inform the controller that you still have more than 2 hours fuel endurance and you are not declaring a fuel emergency. | C: QFA 160, are you declaring fuel emergency?<br>B: Inform the controller that you still have more than 2 hours fuel endurance and you are not declaring a fuel emergency. |
| atc-scenario-0002-card-main-038 | audioTextZh | CALLSIGN-V2-001 | C：Qantas 160，你是否宣布燃油紧急？<br>B：通知管制员你仍有超过 2 小时续航燃油，并且不宣布燃油紧急。 | C：QFA 160，你是否宣布燃油紧急？<br>B：通知管制员你仍有超过 2 小时续航燃油，并且不宣布燃油紧急。 |
| atc-scenario-0002-card-main-038 | referenceText | CALLSIGN-V2-001 | Negative, we still have more than 2 hours fuel endurance, QFA160 | Negative, we still have more than 2 hours fuel endurance, QFA 160 |
