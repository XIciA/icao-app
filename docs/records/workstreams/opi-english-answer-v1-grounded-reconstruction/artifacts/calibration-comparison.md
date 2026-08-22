# OPI 英文答案 v1/v2 来源约束校准批对照

批次：`cal-001`

问题锁：`6a1b20f3cdeb9438115675cbc1a196b7df41e83e1d1e9b84881c4588c1b13e93`

校准 hash：`02699ad58cf08d018c6e1994f1bd1671ca148aa5568205b3ce13a02ba5b3eceb`

结果：34 个完成答案，5 个来源不足，1 个图片延期。独立 Codex 已全量阅读 40/40，发现 2 项问题，主 Codex 已逐项裁决关闭。

说明：下列“来源片段”是从固定历史提交原始答案中确定性抽出的英文原文；工具只负责展示，选择、删减、最小修订和最终答案均由主 Codex 完成。

## 01. `opi-core-001` · 雷击

- 风险：personal-experience
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Have you ever encountered a lightning strike during flight?

历史来源卡：

- `opi-core-001`（release 1，`d32f10ffbe46`）：Have you ever encountered a lightning strike during flight?

选用来源片段：

- `v1-categories-01-07:opi-core-001:s02:2e95cb42d490`，源卡 `opi-core-001`

> No, I have never encountered a lightning strike during flight. But I know a lightning strike is dangerous, so we should avoid lightning strikes during flight.

编辑动作：selected one legacy variant；removed repetition；corrected cohesion。

最终英文答案：

> No, I have never encountered a lightning strike during flight. I know that lightning strikes are dangerous, so I avoid them during flight.

来源与风险结论：First-person content is an adjustable practice answer and contains no experience beyond the selected variant.

独立复核：通过。

## 02. `opi-core-004` · 雷击

- 风险：aviation-procedure、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What should a pilot do if the aircraft is struck by lightning during flight?

历史来源卡：

- `opi-core-004`（release 1，`d32f10ffbe46`）：If your aircraft encounter a lightning strike during the flight. What will you do?
- `opi-core-009`（release 1，`d32f10ffbe46`）：What would you do if you encounter lightning strike?

选用来源片段：

- `v1-categories-01-07:opi-core-004:s03:b3643dfce96b`，源卡 `opi-core-004`

> If encountering a lightning strike, I first maintain aircraft control and follow SOPs to execute the checklist. I check for structural or system damage, such as navigation failures. I report the situation to ATC and request diversion to an alternate airport if damage is severe. I also request maintenance inspection after landing.

编辑动作：selected the most complete legacy variant；changed to conditional first person；tightened sequencing。

最终英文答案：

> I would first maintain control of the aircraft and follow the SOP and checklist. I would check for structural or system damage and report the situation to ATC. If the damage were severe, I would request a diversion to an alternate airport. After landing, I would request a maintenance inspection.

来源与风险结论：All actions come from the selected v1 variant; no checklist action or limit was added.

独立复核：通过。

## 03. `opi-core-005` · 雷击

- 风险：aviation-procedure、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What measures can pilots take to reduce the risk of a lightning strike?

历史来源卡：

- `opi-core-005`（release 1，`d32f10ffbe46`）：How could we avoid the lightning strike? What are the measures that a pilot should take to avoid windshear?
- `opi-core-010`（release 1，`d32f10ffbe46`）：How can pilots reduce the danger of encountering lightning strike?
- `opi-core-011`（release 1，`d32f10ffbe46`）：What is your suggestion to reduce incidents caused by lightning strike?

选用来源片段：

- `v1-categories-01-07:opi-core-005:s03:a0de9af1c4fe`，源卡 `opi-core-005`

> To avoid lightning strikes, preflight I check weather reports and request delays or runway changes if lightning is near the airport. During flight, I monitor the weather radar closely and request deviation from ATC if lightning is detected ahead. I also avoid flying near CBs and thunderstorm areas.

编辑动作：selected one coherent legacy variant；removed a runway-change detail；corrected word order。

最终英文答案：

> Before flight, I check the weather reports and avoid areas where lightning is likely. During flight, I monitor the weather radar and request a deviation from ATC if lightning is detected ahead. I also avoid cumulonimbus clouds and thunderstorm areas.

来源与风险结论：The answer retains only weather review, radar monitoring, deviation, and thunderstorm avoidance from v1.

独立复核：通过。

## 04. `opi-core-030-part-2` · 积冰

- 风险：split-card、aviation-procedure、numerical-source-risk
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Why must an aircraft take off within the applicable holdover time after ground de-icing or anti-icing?

历史来源卡：

- `opi-core-028`（release 1，`d32f10ffbe46`）：Can planes wait a long time to take off after deicing?
- `opi-core-030`（release 1，`d32f10ffbe46`）：What is holding time? Why is it important for de-icing and anti-icing?
- `opi-core-033`（release 1，`d32f10ffbe46`）：What happens if a pilot exceeds the holding time after applying anti-icing fluid?

选用来源片段：

- `v1-categories-01-07:opi-core-030:s01:a8bdf982a495`，源卡 `opi-core-030`

> Holding time is the estimated period during which an anti-icing fluid will protect the aircraft from ice, snow, or frost accumulation. It starts when the final anti-icing application begins and ends when the fluid loses effectiveness. Holding time depends on the fluid type, weather conditions, and precipitation intensity. It is important because if takeoff exceeds the holding time, the aircraft may have new ice contamination on critical surfaces like wings. This reduces lift and increases drag. Pilots must check the holding time on the de-icing certificate. If takeoff is delayed beyond this time, the aircraft must return for re-treatment. Safety depends on respecting holding time.

- `v1-categories-01-07:opi-core-033:s01:0778e4961722`，源卡 `opi-core-033`

> If the holding time is exceeded, the anti-icing fluid loses its effectiveness. Ice, snow, or frost may start to accumulate again on the aircraft surfaces, especially on the wings and tail. Contamination on critical surfaces reduces lift, increases drag, and may cause early stall or loss of control. Therefore, the pilot must not take off after exceeding holding time. Instead, the aircraft must return to the de-icing pad for re-treatment. The pilot should inform ATC and ground handling of the delay. During taxi, if snow or freezing rain continues, the pilot may need to request a shorter holding time estimate. Never take off if you are uncertain about the condition of the wings after holding time has expired.

编辑动作：merged two matching legacy explanations；removed the variable 15–45 minute figure；shortened consequence chain。

最终英文答案：

> Anti-icing fluid loses effectiveness over time. If takeoff is delayed beyond the applicable holdover time, ice, snow, or frost may accumulate again on critical surfaces. This contamination can reduce lift and increase drag, so the aircraft must be treated again before takeoff.

来源与风险结论：The variable numerical range was excluded; every retained consequence and action is present in v1.

独立复核：通过。

## 05. `opi-core-042` · 风切变

- 风险：aviation-procedure、merged-source、unsafe-specific-risk
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What should pilots do if they hear a "GO-AROUND, WINDSHEAR AHEAD" warning during approach?

历史来源卡：

- `opi-core-042`（release 1，`d32f10ffbe46`）：When pilots hear "go around windshear ahead" during approach. How do they perform the wind shear recovery maneuvers?
- `opi-core-457`（release 1，`d32f10ffbe46`）：When pilots hear "go around, windshear ahead" during approach, how do they perform the wind shear recovery maneuvers?

选用来源片段：

- `v1-categories-01-07:opi-core-042:s02:876088607037`，源卡 `opi-core-042`

> On hearing the instruction, immediately push throttle to TOGA thrust. Retract landing gear, adjust flaps to go-around configuration. Pitch up to climb attitude, keep wings level, follow runway heading. Monitor airspeed, altitude and attitude closely. Execute missed approach procedure, climb to designated altitude and report to ATC for further guidance.

- `v1-categories-01-07:opi-core-457:s01:5ad45e7c2e18`，源卡 `opi-core-457`

> We will go around immediately. Press TOGA, use full power, pitch up 15 degrees, maintain configuration till recovered from windshear and pay close attention to speed, altitude and vertical speed.

编辑动作：removed fixed pitch guidance；retained common recovery actions；corrected grammar。

最终英文答案：

> The pilots should go around immediately. They should use TOGA thrust, maintain the required configuration until clear of the wind shear, and closely monitor airspeed, altitude, attitude, and vertical speed.

来源与风险结论：The fixed 15-degree pitch value and conflicting configuration changes were excluded rather than supplemented.

独立复核：通过。

## 06. `opi-core-061` · 应急设备

- 风险：aircraft-type、numerical-fact、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> How many evacuation slides are installed on the aircraft type you fly?

历史来源卡：

- `opi-core-061`（release 1，`d32f10ffbe46`）：How many evacuation slides do you have?
- `opi-core-070`（release 1，`d32f10ffbe46`）：How many emergency slides are there in your aircraft?

选用来源片段：

- `v1-categories-01-07:opi-core-061:s02:c41d97cd9563`，源卡 `opi-core-061`

> I fly C172. There is no emergency slide in C172 but I know there are emergency slides in A320 or B737

编辑动作：selected the C172 legacy variant；answered the number directly；corrected number agreement。

最终英文答案：

> I fly the C172, which has no evacuation slides.

来源与风险结论：The aircraft type and zero-slide answer are both stated in the selected v1 variant.

独立复核：通过。

## 07. `opi-core-078` · 紧急情况遇险

- 风险：personal-experience、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Have you ever encountered an emergency, urgency, or distress situation during a flight? If so, what happened?

历史来源卡：

- `opi-core-078`（release 1，`d32f10ffbe46`）：Have you ever encountered an
emergency situationduring flight? If
yes, what happened?
- `opi-core-104`（release 1，`d32f10ffbe46`）：Have you ever encountered any urgency or distress situations?

选用来源片段：

- `v1-categories-01-07:opi-core-078:s01:867ac333e7ff`，源卡 `opi-core-078`

> No, I haven't encountered an emergency during flight. But I am familiar with emergency disposal procedures through simulator training, such as engine failure, depressurization, and turbulence, and can respond in accordance with SOP and checklists.

- `v1-categories-01-07:opi-core-104:s01:10d87efa577f`，源卡 `opi-core-104`

> No, I have never encountered any urgency or distress situations.

编辑动作：merged consistent negative answers；condensed simulator examples；corrected terminology。

最终英文答案：

> No, I have never encountered an emergency, urgency, or distress situation during a flight. However, I have practised responses to engine failure, depressurization, and turbulence in simulator training, using SOPs and checklists.

来源与风险结论：No real event is invented; the simulator experience is explicit in v1.

独立复核：通过。

## 08. `opi-core-105` · 紧急情况遇险

- 风险：aviation-procedure、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What general steps should a pilot take in an urgency or distress situation?

历史来源卡：

- `opi-core-105`（release 1，`d32f10ffbe46`）：What would you do in case of emergency?
- `opi-core-106`（release 1，`d32f10ffbe46`）：Please give an example or describe the steps you may take in urgency or distress situations?

选用来源片段：

- `v1-categories-01-07:opi-core-105:s01:879e494dfcf9`，源卡 `opi-core-105`

> In case of emergency. I will keep control of the aircraft, ask the copilot to read the checklist, and l will do the operations. At the same time, I will report this situation to ATC, request diversion or priority to landing and emergency services,

编辑动作：repaired sentence fragments；corrected pronouns；split one run-on sentence。

最终英文答案：

> I would keep control of the aircraft and ask the copilot to read the checklist while I carry out the required actions. At the same time, I would report the situation to ATC. If necessary, I would request a diversion, priority landing, and emergency services.

来源与风险结论：The answer stays at the general level of the source and adds no emergency-specific checklist steps.

独立复核：通过。

## 09. `opi-core-168` · 危险品运输

- 风险：training、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What do you learn during dangerous goods training?

历史来源卡：

- `opi-core-168`（release 1，`d32f10ffbe46`）：What do you learn during your dangerous goods transportation training?
- `opi-core-180`（release 1，`d32f10ffbe46`）：What topics do you often discuss in dangerous goods transportation? Give one or two examples

选用来源片段：

- `v1-categories-01-07:opi-core-168:s01:e85fde721427`，源卡 `opi-core-168`

> We will learn the regulation about the dangerous goods, the dangerous goods category and how to transport the dangerous goods and so on.

- `v1-categories-01-07:opi-core-180:s01:f8b7e3a70697`，源卡 `opi-core-180`

> We can discuss some topics in dangerous goods training such as how to identify/find/check the dangerous goods, the danger of dangerous goods, how to deal with dangerous goods (leak) during flight.

编辑动作：merged complementary topic lists；removed slash alternatives；corrected plurality。

最终英文答案：

> During dangerous goods training, we learn the regulations and categories of dangerous goods. We also learn how to identify and check them, how they should be transported, and how to deal with a leak during flight.

来源与风险结论：Every training topic is present in the two selected v1 segments.

独立复核：通过。

## 10. `opi-core-223` · 鸟击

- 风险：aviation-procedure、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What should a pilot do if an engine ingests a bird during initial climb?

历史来源卡：

- `opi-core-223`（release 1，`d32f10ffbe46`）：If bird ingestion happens to you during your initial climb, how will you deal with the situation?
- `opi-core-447`（release 1，`d32f10ffbe46`）：If bird ingestion happens to you during initial climb, how will you deal with the situation?

选用来源片段：

- `v1-categories-01-07:opi-core-223:s02:669d1d77114a`，源卡 `opi-core-223`

> If the engine ingests a bird during initial climb, I will: maintain aircraft control first, monitor engine parameters (EGT, N1, vibration) closely; follow SOP and execute the engine malfunction checklist; report to ATC, describe the situation and aircraft status; if engine performance degrades significantly, request diversion to the nearest suitable airport; and prepare for emergency landing if necessary.

编辑动作：converted a semicolon list to sentences；removed parameter examples；changed to conditional first person。

最终英文答案：

> I would first maintain control of the aircraft and closely monitor the engine parameters. I would follow the SOP and complete the engine malfunction checklist, then report the situation and aircraft status to ATC. If engine performance deteriorated significantly, I would request a diversion to the nearest suitable airport and prepare for an emergency landing if necessary.

来源与风险结论：Specific parameter labels were omitted; all retained actions come from the selected v1 segment.

独立复核：通过。

## 11. `opi-core-114` · CVR与FDR

- 风险：aviation-fact、merged-source、numerical-source-risk
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What is a cockpit voice recorder (CVR)?

历史来源卡：

- `opi-core-114`（release 1，`d32f10ffbe46`）：What is CVR
- `opi-core-118`（release 1，`d32f10ffbe46`）：What do you know about CVR?

选用来源片段：

- `v1-categories-01-07:opi-core-114:s02:9eb31aa86cc8`，源卡 `opi-core-114`

> CVR stands for Cockpit Voice Recorder. It records cockpit communications (crew conversations, ATC radio), warnings, and background sounds for at least 2 hours. Its main function is to provide critical clues for accident investigation, helping identify the cause of incidents.

编辑动作：removed the recording-duration claim；condensed the definition and purpose；corrected capitalization。

最终英文答案：

> CVR stands for Cockpit Voice Recorder. It records cockpit audio, including crew communications, radio transmissions, warnings, and background sounds. The recordings can provide important information for accident investigations.

来源与风险结论：The time-duration value was excluded; no replacement value was added.

独立复核：通过。

## 12. `opi-core-117` · CVR与FDR

- 风险：opinion、company-policy、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What is your opinion on using CVR recordings to monitor flight crews?

历史来源卡：

- `opi-core-117`（release 1，`d32f10ffbe46`）：What are your opinions about CVR supervision function?
- `opi-core-122`（release 1，`d32f10ffbe46`）：Some companies have policies on CVR supervision. Do you think it's necessary?

选用来源片段：

- `v1-categories-01-07:opi-core-117:s01:67259b6dcb83`，源卡 `opi-core-117`

> I think the Cockpit Voice Recorder (CVR) is extremely important for supervision. It ensures pilots communicate with crew members or controllers following standard operating procedures, reduces unnecessary chatter in the cockpit, and ultimately safeguards flight safety.

- `v1-categories-01-07:opi-core-122:s01:d39b727fd709`，源卡 `opi-core-122`

> Yes, it is necessary. Supervision ensures crews follow standard operating procedures, maintain professional communication, reduce irrelevant talk, and ultimately enhance flight safety.

编辑动作：merged duplicate views；softened an absolute claim；shortened the list。

最终英文答案：

> I think using CVR recordings for supervision can be useful. It can encourage crews to follow SOPs, maintain professional communication, and reduce irrelevant talk in the cockpit. These practices can improve flight safety.

来源与风险结论：The answer expresses only the positive supervisory rationale contained in v1 and does not invent a company policy.

独立复核：通过。

## 13. `opi-core-461` · RVSM

- 风险：aviation-fact、numerical-fact、source-insufficient
- 决定：`source-insufficient`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What are the lower and upper flight-level limits of Reduced Vertical Separation Minimum (RVSM) airspace?

历史来源卡：

- `opi-core-461`（release 1，`d32f10ffbe46`）：What is the base level? And Top level of RVSM airspace?
RVSM

已审查但未采用的来源片段：

- `v1-categories-01-07:opi-core-461:s01:dc36967674a8`，源卡 `opi-core-461`

> The basic level of RVSM airspace is 8900 meters (29100 feet), and the top level is 12500 meters (41100 feet). Vertical separation within this range is set to 300 meters.
> RVSM

编辑动作：rejected an unsupported conversion from altitude values to flight-level designators。

最终英文答案：

> （留空）

来源与风险结论：The authorized source gives metre and foot altitudes rather than the flight-level limits requested. Converting or rounding them would add a substantive numerical answer.

独立复核：通过。

## 14. `opi-core-721` · MEL

- 风险：aviation-fact、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What is a Minimum Equipment List (MEL)?

历史来源卡：

- `opi-core-721`（release 1，`d32f10ffbe46`）：What is MEL
- `opi-core-722`（release 1，`d32f10ffbe46`）：Do you know about MEL?What does MEL stand for?

选用来源片段：

- `v1-categories-01-07:opi-core-721:s01:daad9f31f8f3`，源卡 `opi-core-721`

> MEL stands for Minimum Equipment List. MEL is an essential document for aircraft dispatch. It can tell the crew whether they can fly when the aircraft has malfunctions.

编辑动作：selected the dispatch-focused definition；corrected conditional grammar；split into short sentences。

最终英文答案：

> MEL stands for Minimum Equipment List. It is an important document for aircraft dispatch because it tells the crew whether a flight can be conducted when equipment is inoperative.

来源与风险结论：The answer avoids expanding the source into approval conditions or rectification intervals.

独立复核：通过。

## 15. `opi-core-136` · CRM与机组协作

- 风险：aviation-communication、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What communication practices should pilots use when speaking with ATC?

历史来源卡：

- `opi-core-136`（release 1，`d32f10ffbe46`）：2. The pilot communicate with ATC
- `opi-core-141`（release 1，`d32f10ffbe46`）：Are there any efficient ways for the pilot and controller to avoid misunderstanding with each other?
- `opi-core-142`（release 1，`d32f10ffbe46`）：8. In your opinion, what could the pilot do to improve the quality of RTF communication?
- `opi-core-143`（release 1，`d32f10ffbe46`）：What communication skills do you think may affect the smooth communication between the pilot and controller? Give some examples
- `opi-core-372`（release 1，`d32f10ffbe46`）：What can pilots do to improve communication qualities between pilots and controllers? How can you improve communication quality with ATC?
- `opi-core-378`（release 1，`d32f10ffbe46`）：What are the efficient ways to reduce misunderstanding with each other? How to avoid misunderstanding when communicating with ATC?
- `opi-core-379`（release 1，`d32f10ffbe46`）：What communication skills will affect smooth communication between pilots and controllers?

选用来源片段：

- `v1-categories-01-07:opi-core-372:s02:ded57d039a4e`，源卡 `opi-core-372`

> Pilots can conduct radio checks to ensure signal clarity, use standard phraseology, speak clearly and loudly, read back instructions correctly, confirm unclear clearances, enhance English proficiency, and stay focused to avoid distractions, ensuring accurate information transmission.

编辑动作：selected the clearest composite source；removed equipment-check material；reordered for spoken flow。

最终英文答案：

> Pilots should use standard phraseology, speak clearly, and read back instructions correctly. If a clearance is unclear, they should confirm it with ATC. They should stay focused and avoid distractions so that information is transmitted accurately.

来源与风险结论：All communication practices are explicitly listed in the selected v1 segment.

独立复核与主裁决：

- `cal-001-f002` minor/minimal-edit/selected-segment-boundary：The ATC communication action contained a timing qualifier not supported by the declared selected segment.；主裁决：accepted，Removed the unsupported word immediately and reran all calibration machine checks.

## 16. `opi-core-163` · CRM与机组协作

- 风险：crew-procedure、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> As the captain, how would you handle a conflict between a pilot and a cabin crew member?

历史来源卡：

- `opi-core-163`（release 1，`d32f10ffbe46`）：If something unhappy happened between a pilot and a flight attendant, what should you do as a captain?
- `opi-core-770`（release 1，`d32f10ffbe46`）：If something unhappy happens between a pilot and a flight attendant, what should you do as a captain?

选用来源片段：

- `v1-categories-01-07:opi-core-163:s01:f44f5b27454d`，源卡 `opi-core-163`

> I will calmly communicate with both parties to understand the cause, mediate impartially, emphasize the importance of teamwork for flight safety, guide them to set aside conflicts, and ensure they fulfill their duties professionally.

- `v1-categories-01-07:opi-core-770:s01:76de276ed80d`，源卡 `opi-core-770`

> If a conflict or unpleasant situation arises between a pilot and flight attendants, as a captain, I would first intervene to de - escalate tensions. I’d remind the team that we’re united in ensuring flight safety, and effective communication and mutual cooperation are essential. I’d encourage open dialogue to resolve misunderstandings promptly, ensuring the focus remains on the flight mission.

编辑动作：split a long list into three sentences；changed to conditional first person；clarified pronoun references。

最终英文答案：

> I would first speak calmly with both people to understand the cause of the conflict and reduce the tension. I would mediate impartially and remind them that teamwork and professional communication are essential to flight safety. I would then help them resolve the misunderstanding so they could focus on their duties and the flight.

来源与风险结论：No escalation path or company procedure absent from v1 was introduced.

独立复核：通过。

## 17. `opi-core-208` · CRM与机组协作

- 风险：crew-procedure、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> As the captain, how would you help the crew work effectively as a team?

历史来源卡：

- `opi-core-208`（release 1，`d32f10ffbe46`）：As a captain, what can you do to have the crew work as a team?
- `opi-core-368`（release 1，`d32f10ffbe46`）：What do you think a captain should do to have the whole crew working as a team?

选用来源片段：

- `v1-categories-01-07:opi-core-208:s01:6fea7520aae9`，源卡 `opi-core-208`

> As a captain, we can do many things to have our crew work as a team. First, we will know the duties and responsibility in the preflight briefing in the briefing room. Second, we should keep good communication and cooperation during flight to ensure the flight safety.

- `v1-categories-01-07:opi-core-368:s01:faf18a6f13dd`，源卡 `opi-core-368`

> The captain should respect every crew member and respect their opinions, have a good communication with them to exchange the ideas. Secondly, the captain should lead the crew to follow the SOP and company policy.

编辑动作：merged complementary leadership points；corrected number agreement；changed to conditional first person。

最终英文答案：

> As captain, I would make sure everyone understands their duties and responsibilities during the preflight briefing. I would respect each crew member's opinion and encourage good communication and cooperation throughout the flight. I would also lead the crew in following the SOP and company policy.

来源与风险结论：The leadership, briefing, communication, SOP, and policy points all appear in v1.

独立复核：通过。

## 18. `opi-core-743` · 红眼航班

- 风险：personal-experience、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Have you ever operated a red-eye flight? If so, what was it like?

历史来源卡：

- `opi-core-743`（release 1，`d32f10ffbe46`）：Have you ever flown red eye flight? If no, what kinds
of flights are red eye flights?
- `opi-core-747`（release 1，`d32f10ffbe46`）：Have you ever flown red-eye flight?

选用来源片段：

- `v1-categories-01-07:opi-core-743:s01:dc0773638a08`，源卡 `opi-core-743`

> No, I have never flown a red eye flight. A red eye flight is a flight which takes off late at night, and arrives early the next morning.

- `v1-categories-01-07:opi-core-747:s01:bfd037ab9ec8`，源卡 `opi-core-747`

> No, I haven’t ，as a student pilot. But I’ve learned that flying red-eye flights requires adequate pre-flight rest to stay alert. My flight school also trains us on fatigue management strategies to handle such flights safely in the future.

编辑动作：merged a negative experience answer with source knowledge；removed flight-school policy detail；corrected punctuation。

最终英文答案：

> No, I have never operated a red-eye flight. I understand that a red-eye flight departs late at night and arrives early the next morning. It requires adequate preflight rest to stay alert.

来源与风险结论：The answer does not claim an event; the definition and rest point are both stated in v1.

独立复核：通过。

## 19. `opi-core-754` · 飞行作风

- 风险：company-policy、source-insufficient
- 决定：`source-insufficient`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> How does your company promote good flight discipline?

历史来源卡：

- `opi-core-754`（release 1，`d32f10ffbe46`）：Could you talk about the flight
disciplines in your flight school or
your company?

已审查但未采用的来源片段：

- `v1-categories-01-07:opi-core-754:s01:265101db65f6`，源卡 `opi-core-754`

> The flight discipline in our flight school is very strict, emphasizing the importance of safety and standardization. First of all, we must strictly abide by the flight schedule and training arrangements, and are not allowed to be late or absent without reason. Secondly, during flight training, we must strictly follow the instructor's instructions and standard operating procedures (SOP) to ensure flight safety. In addition, we must maintain a good professional attitude, adhere to the principles of honesty and trustworthiness, and not take any risky flying behaviors. At the same time, the school also pays attention to cultivating our team cooperation spirit and situational awareness, requiring us to maintain effective communication and cooperation with instructors and classmates during the flight process. These strict flight disciplines and good work styles are crucial to ensuring flight safety and improving professional quality.

编辑动作：rejected conversion of a flight-school practice into company policy。

最终英文答案：

> （留空）

来源与风险结论：The only authorized answer describes a flight school. Recasting it as the speaker's company policy would invent a substantive employer practice.

独立复核：通过。

## 20. `opi-extra-247` · 疲劳与值勤限制

- 风险：personal-experience、fatigue-safety、persona-consistency、source-insufficient
- 决定：`source-insufficient`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Have you ever felt fatigued while on duty? If so, how did you manage it?

历史来源卡：

- `opi-extra-247`（release 1，`d32f10ffbe46`）：Have you ever felt fatigued during a shift? How did you handle it?

已审查但未采用的来源片段：

- `v1-categories-01-07:opi-extra-247:s01:3ba6a3762f9b`，源卡 `opi-extra-247`

> Yes, during night freight operations I've experienced fatigue. When it happens, I increase my vigilance, communicate more explicitly with my colleague, and ensure I stay hydrated. If it becomes severe, I would report it to the supervisor. Safety always comes first; pushing through fatigue is never acceptable.

编辑动作：retained the single legacy example；corrected tense consistency；split a semicolon sentence；cross-batch persona audit rejected the answer because it conflicts with the locked student-pilot and no-current-airline background。

最终英文答案：

> （留空）

来源与风险结论：The answer claims personal fatigue during night freight operations and reporting to a supervisor. This conflicts with the locked student-pilot and no-current-airline background.

独立复核：通过。

## 21. `opi-core-190` · 复杂/特殊机场运行

- 风险：personal-experience、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Have you ever taken off from or landed on a short and narrow runway?

历史来源卡：

- `opi-core-190`（release 1，`d32f10ffbe46`）：Have you ever experienced taking off or landing on short and narrow runways?
- `opi-core-251`（release 1，`d32f10ffbe46`）：Have you ever experienced takeoff or landing on the short and narrow runway?

选用来源片段：

- `v1-categories-01-07:opi-core-190:s02:23509f4dd91a`，源卡 `opi-core-190`

> No, I haven’t. But I have received relevant simulator training. When operating on such runways, I will strictly control speed, ensure sufficient thrust, maintain stable attitude, and follow SOP to avoid overrun or veering off.

编辑动作：selected the more informative negative variant；removed unasked procedure detail；corrected tense。

最终英文答案：

> No, I have never taken off from or landed on a short and narrow runway. However, I have received relevant simulator training.

来源与风险结论：No real short-runway operation is claimed.

独立复核：通过。

## 22. `opi-core-195` · 复杂/特殊机场运行

- 风险：aviation-procedure、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> How should a flight crew prepare before a flight to a high-elevation airport?

历史来源卡：

- `opi-core-195`（release 1，`d32f10ffbe46`）：When your destination is a high elevation airport, what preparations should you make before takeoff?
- `opi-core-244`（release 1，`d32f10ffbe46`）：If you fly a high elevation airport what operations you should do before take off
- `opi-core-258`（release 1，`d32f10ffbe46`）：What preparations will you make when you are going to fly high-elevation airports?

选用来源片段：

- `v1-categories-01-07:opi-core-195:s01:6590e663302d`，源卡 `opi-core-195`

> When I fly to the high elevation airport, I will do a lot of preparations before takeoff. First, I will do a good walk around check to ensure the aircraft in good conditions. Second, I will know the airport runway conditions, weather conditions, ground services, arrival and departing procedures of this airport. Third, I will discuss the—possible emergency situations with my crew member, and the procedures to deal with these situations.

- `v1-categories-01-07:opi-core-195:s02:10acfcdecaf8`，源卡 `opi-core-195`

> Conduct terrain and weather analysis, calculate MOCA, check aircraft performance (especially engine power), ensure adequate oxygen supply, familiarize with special procedures, and undergo relevant simulator training.

- `v1-categories-01-07:opi-core-244:s01:709b77fc52b9`，源卡 `opi-core-244`

> If I takeoff or landing at high elevation airport, I should be careful about surrounding terrain, the runway length, aircraft weight and I will pay special attention to aircraft airspeed and attitude.

编辑动作：merged complementary preparation lists；removed the unexplained MOCA acronym；grouped related checks。

最终英文答案：

> Before the flight, I would analyse the terrain and weather and review the runway conditions and the airport's arrival and departure procedures. I would check aircraft performance, including the effect of aircraft weight, and make sure the aircraft was in good condition. I would also discuss possible emergency situations and the relevant procedures with the crew.

来源与风险结论：The answer retains only checks and briefings stated across the selected v1 material.

独立复核与主裁决：

- `cal-001-f001` major/selected-segment-boundary：A substantive preparation factor could not be traced to the declared selectedSegmentIds, so the provenance record was incomplete.；主裁决：accepted，Added the already-authorized opi-core-244:s01 segment to selectedSegmentIds; the answer text did not change.

## 23. `opi-core-268` · 燃油

- 风险：aircraft-type、numerical-fact
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What is the maximum fuel capacity of the aircraft type you fly?

历史来源卡：

- `opi-core-268`（release 1，`d32f10ffbe46`）：What is the maximum fuel quantity your type of aircraft can carry?
What is the maximum fuel quantity that your aircraft can carry?

选用来源片段：

- `v1-categories-01-07:opi-core-268:s01:ca257f2c231f`，源卡 `opi-core-268`

> I fly DA-40 for flight training. The maximum fuel quantity is 41 gallon, the usable fuel quantity is 39 gallon.

编辑动作：selected the only complete numerical variant；corrected unit plural；combined two clauses。

最终英文答案：

> I fly the DA-40 for flight training. Its maximum fuel capacity is 41 gallons, of which 39 gallons are usable.

来源与风险结论：The aircraft type and both quantities are copied from the authorized v1 variant without external correction.

独立复核：通过。

## 24. `opi-core-283` · 燃油

- 风险：aviation-fact、numerical-source-risk
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What does the term "minimum fuel" mean in aviation?

历史来源卡：

- `opi-core-283`（release 1，`d32f10ffbe46`）：According to the regulation, what does "Minimum Fuel" refer to?

选用来源片段：

- `v1-categories-01-07:opi-core-283:s01:5aa688cf0492`，源卡 `opi-core-283`

> According to regulations, minimum fuel is not a fuel emergency. It means if there is any further delay, fuel emergency will be declared. For IFR flights, it refers to fuel endurance less than 45 minutes at 3000ft over the destination airport.

编辑动作：retained the non-emergency definition；removed the 45-minute and 3,000-foot claim；corrected conditional grammar。

最终英文答案：

> Minimum fuel is not a fuel emergency. It means that any further delay may cause the aircraft to declare a fuel emergency.

来源与风险结论：Potentially system-specific numerical criteria were excluded and not replaced.

独立复核：通过。

## 25. `opi-core-463` · RVSM

- 风险：aviation-procedure、aviation-fact
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What should a pilot do if the autopilot fails in Reduced Vertical Separation Minimum (RVSM) airspace?

历史来源卡：

- `opi-core-463`（release 1，`d32f10ffbe46`）：If the autopilot failure in RVSM airspace, what will you do?

选用来源片段：

- `v1-categories-01-07:opi-core-463:s01:b79127428d56`，源卡 `opi-core-463`

> If the autopilot failure in RVSM airspace, we are no longer qualified. We will request leave the RVSM airspace.

编辑动作：corrected the conditional clause；changed to first person；made the ATC request explicit without adding a destination level。

最终英文答案：

> If the autopilot failed in RVSM airspace, I would request clearance to leave RVSM airspace because the aircraft would no longer meet the applicable requirements.

来源与风险结论：No contingency level, separation value, or checklist step was added.

独立复核：通过。

## 26. `opi-core-591` · 擦尾

- 风险：aviation-fact、cross-category-mapping-exclusion
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What factors can cause a tail strike?

历史来源卡：

- `opi-core-591`（release 1，`d32f10ffbe46`）：According to your understanding, what are the possible reasons to cause a tail strike?
- 已排除映射：`opi-image-018-q04`（source-card-not-present-in-authorized-release）

选用来源片段：

- `v1-categories-01-07:opi-core-591:s01:b6b77e2c6840`，源卡 `opi-core-591`

> There are some reasons for a tail strike, for example, strong wind shear, improper flight control, miscalculation of the CG (Center of Gravity) position, and so on.

- `v1-categories-01-07:opi-core-591:s02:4587414a7f72`，源卡 `opi-core-591`

> Causes include improper maneuver (excessive rotation rate, early flare), unstable approach, incorrect stabilizer trim, mishandling of crosswinds, over-rotation during go-around, CG miscalculation, and strong wake turbulence.

编辑动作：merged two v1 lists；excluded an unauthorized v2 image-source mapping；normalized terminology。

最终英文答案：

> A tail strike can result from improper control, such as an excessive rotation rate, an early flare, or over-rotation during a go-around. Other factors include an unstable approach, incorrect stabilizer trim, poor crosswind handling, a centre-of-gravity calculation error, strong wind shear, or wake turbulence.

来源与风险结论：Every factor comes from the two authorized v1 segments; the mapped image source was not read into the pool.

独立复核：通过。

## 27. `opi-extra-019` · 备降与改航

- 风险：crew-procedure、company-policy、unsafe-source-risk
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> As a first officer, what would you do if you disagreed with the captain about a diversion?

历史来源卡：

- `opi-extra-019`（release 1，`d32f10ffbe46`）：When making a decision to divert, if you have different opinion from your captain, what will you do?

选用来源片段：

- `v1-categories-01-07:opi-extra-019:s01:fcbbcc9f151f`，源卡 `opi-extra-019`

> First of all, I will have communication with him again to exchange ideas. Secondly, I will suggest following the SOP (Standard Operating Procedure) and company policy. At last, if the captain insists on his opinion, I will follow him, because he is the pilot - in - command.

编辑动作：retained communication and SOP points；removed the absolute instruction to follow the captain；corrected phrasing。

最终英文答案：

> I would discuss the issue with the captain again, explain my view, and suggest that we follow the SOP and company policy.

来源与风险结论：The unsafe absolute ending was deleted. No escalation procedure absent from v1 was added.

独立复核：通过。

## 28. `opi-core-474` · 液压系统

- 风险：aircraft-type、numerical-fact
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> How many independent hydraulic systems does the aircraft type you fly have?

历史来源卡：

- `opi-core-474`（release 1，`d32f10ffbe46`）：How many hydraulic systems do your aircraft have?

选用来源片段：

- `v1-categories-01-07:opi-core-474:s01:c37774a776c7`，源卡 `opi-core-474`

> I fly the DA-40, which has only one hydraulic system mainly used to control the main gear brakes. Larger civil aircraft like the B737 and A320 are equipped with three hydraulic systems (B737: A, B, Standby; A320: Blue, Green, Yellow) for redundancy to ensure flight safety.

编辑动作：selected the DA-40 variant；removed comparisons with other types；corrected sentence structure。

最终英文答案：

> I fly the DA-40, which has one hydraulic system, mainly for the main-gear brakes.

来源与风险结论：The type, count, and stated function all come from the selected v1 variant.

独立复核：通过。

## 29. `opi-core-871` · 增压系统

- 风险：company-procedure、aviation-procedure、unsafe-specific-risk、persona-consistency、source-insufficient
- 决定：`source-insufficient`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What procedure does your company require for a rapid depressurization?

历史来源卡：

- `opi-core-871`（release 1，`d32f10ffbe46`）：In case of rapid depressurization, what are your standard operation procedures?

已审查但未采用的来源片段：

- `v1-categories-01-07:opi-core-871:s01:b39436567415`，源卡 `opi-core-871`

> If we encounter rapid depressurization, we must wear oxygen masks immediately and make an emergency descent. At the same time, I will advise ATC of our situation.

编辑动作：selected the non-numerical variant；removed the fixed FL100 target；corrected pronoun consistency；cross-batch persona audit rejected the answer because it conflicts with the locked student-pilot and no-current-airline background。

最终英文答案：

> （留空）

来源与风险结论：The answer claims a current rapid-decompression company procedure involving an oxygen mask and emergency descent on a pressurized aircraft. This conflicts with the locked student-pilot and no-current-airline background.

独立复核：通过。

## 30. `opi-extra-125` · 飞行操纵系统

- 风险：aircraft-type、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Does the aircraft type you fly use a control column or a sidestick?

历史来源卡：

- `opi-extra-125`（release 1，`d32f10ffbe46`）：Do you use control column or side stick in your aircraft?
- `opi-extra-213`（release 1，`d32f10ffbe46`）：Do you use control column or side stick in your aircraft?

选用来源片段：

- `v1-categories-01-07:opi-extra-125:s01:45a96f079ff7`，源卡 `opi-extra-125`

> I fly C172, I use control column.

编辑动作：selected the concise C172 variant；repaired a comma splice。

最终英文答案：

> I fly the C172, which uses a control column.

来源与风险结论：Both the type and control input are explicit in v1.

独立复核：通过。

## 31. `opi-extra-216` · 发动机问题

- 风险：personal-experience、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Have you ever experienced an engine problem in flight? If so, what happened?

历史来源卡：

- `opi-extra-216`（release 1，`d32f10ffbe46`）：Have you ever encountered engine problems or malfunctioned? What was the problem?
- `opi-extra-219`（release 1，`d32f10ffbe46`）：Have you ever experienced engine out during flight?
- `opi-extra-281`（release 1，`d32f10ffbe46`）：Have you ever encountered engine fire during flight?

选用来源片段：

- `v1-categories-01-07:opi-extra-216:s01:101b585a7f07`，源卡 `opi-extra-216`

> No, I have never encountered engine problems, but I have practiced the engine problems in the simulator such as engine failure, engine flameout, engine fire, engine surge and so on.

编辑动作：retained the negative experience answer；condensed simulator examples；corrected repetition。

最终英文答案：

> No, I have never experienced an engine problem in flight. However, I have practised engine failure, flameout, fire, and surge scenarios in the simulator.

来源与风险结论：No real event is claimed; every simulator scenario is listed in v1.

独立复核：通过。

## 32. `opi-core-058` · 机型与职业

- 风险：aircraft-type、personal-background、merged-source
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What type of aircraft do you currently fly?

历史来源卡：

- `opi-core-058`（release 1，`d32f10ffbe46`）：What type of aircraft are you flying now? What kinds of emergency equipment do you have in the cockpit?
- `opi-core-865`（release 1，`d32f10ffbe46`）：What type of aircraft Do you fly?

选用来源片段：

- `v1-categories-01-07:opi-core-865:s01:09ff82710bd3`，源卡 `opi-core-865`

> I am a student pilot. I fly the DA - 40 for flight training.

编辑动作：selected the complete non-placeholder source；normalized the model hyphenation；combined two sentences。

最终英文答案：

> I am a student pilot, and I currently fly the DA-40 for flight training.

来源与风险结论：The placeholder answer was not used; the selected v1 source states the role, type, and purpose.

独立复核：通过。

## 33. `opi-core-849` · 机型与职业

- 风险：aircraft-type、personal-background、source-insufficient
- 决定：`source-insufficient`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Which aircraft type ratings have you held?

历史来源卡：

- `opi-core-849`（release 1，`d32f10ffbe46`）：What type of aircraft are you flying now? / How many type ratings have you had?
- `opi-extra-132`（release 1，`d32f10ffbe46`）：How many kinds of type ratings do you have now? What are they?
- `opi-extra-153`（release 1，`d32f10ffbe46`）：How many type ratings have you ever had?

已审查但未采用的来源片段：

- `v1-categories-01-07:opi-core-849:s01:0d9ea0f8c800`，源卡 `opi-core-849`

> I am a student pilot. I take flight training at Jiutian Flight School. I fly the DA - 40 for flight training. I have built up 100 flying hours. Now I only hold my private pilot license.

- `v1-categories-01-07:opi-extra-132:s01:035bf5f4efb7`，源卡 `opi-extra-132`

> Now I have 3 type - ratings.
> single engine land

- `v1-categories-01-07:opi-extra-132:s02:f812739d6054`，源卡 `opi-extra-132`

> multi - engine land

- `v1-categories-01-07:opi-extra-132:s03:7ba69da902ce`，源卡 `opi-extra-132`

> A320/B737

- `v1-categories-01-07:opi-extra-153:s01:967c6b0ef6d4`，源卡 `opi-extra-153`

> I have flown da 40, da 42. It is a single engine land a/c, da 42 is a multi-engine high performance a/c.

编辑动作：rejected conflation of licence, class rating, aircraft flown, and type rating。

最终英文答案：

> （留空）

来源与风险结论：The authorized sources are internally inconsistent and do not support a safe, unambiguous list of aircraft type ratings.

独立复核：通过。

## 34. `opi-extra-130` · 机型与职业

- 风险：aircraft-type、numerical-fact
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What is the passenger capacity of the aircraft type you fly?

历史来源卡：

- `opi-extra-130`（release 1，`d32f10ffbe46`）：How many passengers can your aircraft accommodate?

选用来源片段：

- `v1-categories-01-07:opi-extra-130:s01:90287c973e40`，源卡 `opi-extra-130`

> I fly the C172. It can accommodate 2 passengers.

编辑动作：combined the type and capacity statements；spelled out the number。

最终英文答案：

> I fly the C172, which can accommodate two passengers.

来源与风险结论：The aircraft type and passenger count are explicit in v1.

独立复核：通过。

## 35. `opi-extra-144` · 基本情况

- 风险：company-background、personal-background
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> What does your company's logo look like?

历史来源卡：

- `opi-extra-144`（release 1，`d32f10ffbe46`）：What's your company's logo?

选用来源片段：

- `v1-categories-01-07:opi-extra-144:s01:72f5742cc5c7`，源卡 `opi-extra-144`

> As a student pilot who hasn't officially joined an airline yet, I don't have a company logo corresponding to my current status. However, I have a certain understanding of the logos of many well-known airlines. For example, the logo of Air China is a phoenix pattern, symbolizing auspiciousness and nobility.

编辑动作：selected the source's direct no-company response；removed the unrelated Air China example；shortened wording。

最终英文答案：

> I am a student pilot and have not officially joined an airline, so I do not have a company logo to describe.

来源与风险结论：No employer or logo is invented.

独立复核：通过。

## 36. `opi-extra-179` · 爱好

- 风险：personal-experience、ordinary-language
- 决定：`complete`
- 来源策略：`v1-categories-01-07`

当前英文问题：

> Have you ever traveled abroad?

历史来源卡：

- `opi-extra-179`（release 1，`d32f10ffbe46`）：Have you ever been abroad?/Have you ever been to any foreign countries?

选用来源片段：

- `v1-categories-01-07:opi-extra-179:s01:594864465c60`，源卡 `opi-extra-179`

> Yes, I have been to Australia, America, Japan and South Africa.

编辑动作：split the direct answer from the examples；normalized the country name。

最终英文答案：

> Yes, I have. I have travelled to Australia, the United States, Japan, and South Africa.

来源与风险结论：All destinations are present in v1; only the country name was normalized.

独立复核：通过。

## 37. `opi-image-002-q01` · 机翼积冰

- 风险：image-dependent、deferred-image-answer
- 决定：`deferred-image-answer`
- 来源策略：`v2-category-08-images`

当前英文问题：

> What can you see in this picture?

历史来源卡：

- `opi-image-002-q01`（release 2，`b95d541315da`）：Please describe what you can see in this picture

已审查但未采用的来源片段：

- `v2-category-08-images:opi-image-002-q01:s01:d07f97047b5d`，源卡 `opi-image-002-q01`

> In this picture, I can see a situation related to Wing ice contamination. The key points are loss of lift, increased drag, higher stall speed, and possible control problems. It is important for the crew to recognize the risk early, keep good communication, and follow standard operating procedures.

编辑动作：preserved the existing image-dependent deferral。

最终英文答案：

> （留空）

来源与风险结论：The answer requires identifying visible details in the specific picture.

独立复核：通过。

## 38. `opi-image-006-q01` · 冬季起飞前运行

- 风险：image-context、aviation-procedure、merged-source
- 决定：`complete`
- 来源策略：`v2-category-08-images`

当前英文问题：

> What pre-takeoff preparations should a flight crew make in the winter conditions shown?

历史来源卡：

- `opi-image-006-q01`（release 2，`b95d541315da`）：What flight pre - takeoff preparations should you make if you encounter this situation?
- `opi-image-006-q03`（release 2，`b95d541315da`）：How should pilots prepare to avoid such situations?

选用来源片段：

- `v2-category-08-images:opi-image-006-q01:s01:837178f842b4`，源卡 `opi-image-006-q01`

> I would brief the threat, check the relevant aircraft systems and performance, coordinate with ATC and the crew, and follow the checklist. If safety is not assured, I would delay, discontinue, reject, go around, or divert as appropriate.

编辑动作：retained pre-takeoff-relevant actions；removed go-around and diversion options；made the winter threat explicit from the question。

最终英文答案：

> I would brief the winter-weather threat, check the relevant aircraft systems and performance, coordinate with the crew and ATC, and follow the checklist. If safety were not assured, I would delay or reject the takeoff.

来源与风险结论：The winter context comes from the locked question; every action and decision comes from the authorized v2 source.

独立复核：通过。

## 39. `opi-image-013-q01` · 外来物损伤

- 风险：image-topic-general-knowledge、aviation-fact
- 决定：`complete`
- 来源策略：`v2-category-08-images`

当前英文问题：

> What is foreign object debris (FOD), and why is it hazardous?

历史来源卡：

- `opi-image-013-q01`（release 2，`b95d541315da`）：What do you know about FOD?

选用来源片段：

- `v2-category-08-images:opi-image-013-q01:s01:8307a5208ffa`，源卡 `opi-image-013-q01`

> FOD means foreign object debris or foreign object damage. It can damage tires, engines, and aircraft structures, so ramp inspection and runway cleaning are very important.

编辑动作：split definition, hazard, and prevention into sentences；corrected cohesion。

最终英文答案：

> FOD means foreign object debris or foreign object damage. It is hazardous because it can damage tyres, engines, and aircraft structures. Ramp inspections and runway cleaning are therefore important.

来源与风险结论：No examples or effects beyond the v2 source were added.

独立复核：通过。

## 40. `opi-image-021-q02` · 鸟击

- 风险：image-context、aviation-procedure
- 决定：`complete`
- 来源策略：`v2-category-08-images`

当前英文问题：

> As captain, how would you respond to a suspected bird strike in flight?

历史来源卡：

- `opi-image-021-q02`（release 2，`b95d541315da`）：As captain,if you encounter that situation,how will you handle it?

选用来源片段：

- `v2-category-08-images:opi-image-021-q02:s01:837178f842b4`，源卡 `opi-image-021-q02`

> I would brief the threat, check the relevant aircraft systems and performance, coordinate with ATC and the crew, and follow the checklist. If safety is not assured, I would delay, discontinue, reject, go around, or divert as appropriate.

编辑动作：retained in-flight-relevant actions；removed delay, reject, and go-around options；condensed the generic source。

最终英文答案：

> I would check the relevant aircraft systems and performance, coordinate with the crew and ATC, and follow the checklist. If safety were not assured, I would divert as appropriate.

来源与风险结论：The answer is deliberately general because v2 contains no bird-strike-specific checklist detail.

独立复核：通过。

