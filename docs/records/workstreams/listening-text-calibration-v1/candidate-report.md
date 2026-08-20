# 听力题库全量校准候选报告

- 卡片：631
- 候选修改卡片：421
- 候选修改字段：799
- ASR 已完成：631
- ASR 待完成：0
- WER > 60%：14
- 规则残留：0
- 数字序列变化：61（须有呼号规则或逐题音频证据）

## 字段统计

| 字段 | 修改数 |
| --- | ---: |
| audioText | 369 |
| audioTextZh | 387 |
| choices | 28 |
| correctChoiceIndex | 3 |
| referenceText | 12 |

## 规则统计

| 规则 | 修改字段 |
| --- | ---: |
| CALLSIGN-LISTENING-001 | 643 |
| RUNWAY-LISTENING-001 | 89 |
| STRUCTURE-LISTENING-001 | 98 |
| AUDIO-EVIDENCED-LISTENING-001 | 75 |
| ICAO-LISTENING-001 | 33 |
| STRUCTURE-LISTENING-002 | 97 |
| ANSWER-LISTENING-002 | 12 |
| ANSWER-LISTENING-001 | 4 |
| PROCEDURE-LISTENING-001 | 9 |

## 人工答案修正

- listening-main-003：音频和原文明确给出低空通场不得低于 45 米，A 为唯一正确答案。
- listening-main-076：原文列出右外副翼损伤、液压问题和方向舵卡阻；修正第三个事实选项后保留 D。
- listening-main-098：不能开车的直接原因是跑道正在清理，C 为唯一正确答案。
- listening-main-440：原文问题询问最初机动，机组请求并执行下降，A 为唯一正确答案。

## 音频证据修正

- listening-main-121：音频明确读作 1.5 seconds，并使用 ice accumulation。
- listening-main-128：音频为 requesting direct routing TLA，不是请求备降。
- listening-main-148：按音频补回 wherever practicable，并修正句法。
- listening-main-151：音频两次呼号均明确为 Speedbird 223。
- listening-main-161：现有 thrust the air 并非音频原话，按清晰音频恢复。
- listening-main-173：音频明确包含 cleared for takeoff 和 until 1800 m，原文漏记起飞许可。
- listening-main-177：音频在机组拒绝23R后仍有完整复飞、航向、高度和五分钟可用指令，原文漏句。
- listening-main-179：删除音频中不存在的 caution 释义注记。
- listening-main-189：修正 ex-point 等明显错听，并按音频恢复 exit point 和 direct。
- listening-main-196：按音频恢复 after you exit the runway 与 exit onto N。
- listening-main-198：音频明确逐位读作 heading three two zero。
- listening-main-206：音频明确为 Orly Airport 和 minor undercarriage damage。
- listening-main-220：音频为 Orange County 和 Vortex 1 departure，删除错误的 Arch County Standard。
- listening-main-228：音频明确CAT IIIB为50米，原文误写15米，并修复整句错听。
- listening-main-229：按音频补回 spark causes fumes to ignite。
- listening-main-236：音频明确为 offset right 3 miles，原文误记为 to L。
- listening-main-238：音频明确冲突飞机为 Boeing 747。
- listening-main-246：修正 a1titudeof 等错字并按音频恢复完整句法。
- listening-main-247：音频为 time pressure because of duty time limits，修正 tired pressure 等明显错听。
- listening-main-250：音频明确为 heavy rain showers。
- listening-main-266：音频为 carbon-fiber wingtips of some regional planes，修正 cargo/original planes。
- listening-main-273：音频两次呼号均为 Northwest 14 Heavy。
- listening-main-277：管制员复诵的呼号同样为ACA 3428，原文把中间两位颠倒。
- listening-main-278：按音频修正错句并确认呼号CCA 001、T/E/S滑行道和5L跑道。
- listening-main-286：音频为 Captain Michael、reports would be due 和 must be in，修正原文错听。
- listening-main-306：按音频补回最终带离乘客并继续行程的结尾。
- listening-main-307：音频明确为40个频道和108.10至111.95 MHz。
- listening-main-314：音频明确冲突飞机为 United 747。
- listening-main-318：音频清晰读作QNH 29.81。
- listening-main-348：音频明确为 departing from or entering China’s sovereign airspace，最高12500米。
- listening-main-354：音频呼号逐位读作 six five four niner。
- listening-main-357：音频为指定的tug AB，并非泛指blue tug。
- listening-main-370：按音频恢复Denver示例中 lower two levels is omitted。
- listening-main-379：音频明确逐位读作 one zero minutes ago。
- listening-main-390：按音频恢复state of urgency与request advice，删除自由改写。
- listening-main-396：音频全部呼号均逐位读作 seven three zero six；裸China按上下文统一为CSN。
- listening-main-412：音频明确为heading zero five zero，且选项A与该事实一致。
- listening-main-416：音频为we’ll figure out what is going on，并补全vacate runway。
- listening-main-432：音频在first reporter后仍有询问碎片具体位置的完整句，原文漏记。
- listening-main-434：音频明确逐位读作Runway 36L。
- listening-main-443：修正careful plan of pressure等明显错听，按音频恢复完整操作描述。
- listening-main-448：音频全部呼号均明确为Japan Air 782。
- listening-main-485：删除runway way等错字，并按音频恢复phase of takeoff。
- listening-main-584：音频明确为max top 57,000，修正原文断裂的5, 7000，并整理方位连字符。
- listening-main-623：音频为radial而非radio，并修正等待指令断句。

## 前 120 条候选

| 卡片 | 字段 | 规则 | 修改前 | 修改后 |
| --- | --- | --- | --- | --- |
| listening-main-001 | audioText | CALLSIGN-LISTENING-001 | "United Airlines 919, we've just been struck by lightning, and we'll have to go back to the ramp to check our electrics, and make sure there is no damage on the fuselage.\nQuestion: what will the crew do?" | "UAL 919, we've just been struck by lightning, and we'll have to go back to the ramp to check our electrics, and make sure there is no damage on the fuselage.\nQuestion: what will the crew do?" |
| listening-main-001 | audioTextZh | CALLSIGN-LISTENING-001 | "联合航空公司919航班，我们刚刚遭遇雷击，需要返回停机坪检查电气系统，并确保机身没有损坏。\n问题：机组人员会怎么做？" | "UAL 919航班，我们刚刚遭遇雷击，需要返回停机坪检查电气系统，并确保机身没有损坏。\n问题：机组人员会怎么做？" |
| listening-main-002 | audioText | CALLSIGN-LISTENING-001 | "China Eastern 5152 returned to the airport after taking off from Beijing, because a passenger was found not on board while the luggage was on the airplane.\nQuestion: what happened to China Eastern 5152?" | "CES 5152 returned to the airport after taking off from Beijing, because a passenger was found not on board while the luggage was on the airplane.\nQuestion: what happened to CES 5152?" |
| listening-main-002 | audioTextZh | CALLSIGN-LISTENING-001 | "中国东方航空5152航班从北京起飞后返回机场，原因是发现有乘客未登机但行李在飞机上。\n问题：中国东方航空5152航班发生了什么？" | "CES 5152航班从北京起飞后返回机场，原因是发现有乘客未登机但行李在飞机上。\n问题：CES 5152航班发生了什么？" |
| listening-main-029 | audioText | CALLSIGN-LISTENING-001 | "QFA564, we have got a suspected cholera patient on board. Request necessary services on landing.\nQuestion: What might be needed on landing?" | "QFA 564, we have got a suspected cholera patient on board. Request necessary services on landing.\nQuestion: What might be needed on landing?" |
| listening-main-029 | audioTextZh | CALLSIGN-LISTENING-001 | "QFA564，我们机上有一名疑似霍乱患者。请求落地时提供必要服务。\n问题：落地时可能需要什么？" | "QFA 564，我们机上有一名疑似霍乱患者。请求落地时提供必要服务。\n问题：落地时可能需要什么？" |
| listening-main-041 | audioText | CALLSIGN-LISTENING-001 | "Ground, CES5056, we found some mistakes with takeoff center of gravity and zero fuel center of gravity when we were checking the loading sheet. Would you recheck it and correct the mistakes?\nQuestion: What do you learn from the statement?" | "Ground, CES 5056, we found some mistakes with takeoff center of gravity and zero fuel center of gravity when we were checking the loading sheet. Would you recheck it and correct the mistakes?\nQuestion: What do you learn from the statement?" |
| listening-main-041 | audioTextZh | CALLSIGN-LISTENING-001 | "地面，CES5056，我们检查载重表时发现起飞重心和零燃油重心有一些错误。请你们重新检查并更正这些错误，可以吗？\n问题：从这段陈述中你了解到什么？" | "地面，CES 5056，我们检查载重表时发现起飞重心和零燃油重心有一些错误。请你们重新检查并更正这些错误，可以吗？\n问题：从这段陈述中你了解到什么？" |
| listening-main-061 | audioText | CALLSIGN-LISTENING-001 | "UAL919, flight level 250 not available due traffic. Alternative is flight level 230.\nQuestion: Which flight level might be used?" | "UAL 919, flight level 250 not available due traffic. Alternative is flight level 230.\nQuestion: Which flight level might be used?" |
| listening-main-061 | audioTextZh | CALLSIGN-LISTENING-001 | "UAL919，由于交通原因，飞行高度层250不可用。可选飞行高度层为230。\n问题：可能使用哪个飞行高度层？" | "UAL 919，由于交通原因，飞行高度层250不可用。可选飞行高度层为230。\n问题：可能使用哪个飞行高度层？" |
| listening-main-063 | audioText | CALLSIGN-LISTENING-001, RUNWAY-LISTENING-001 | "A controller informed SIA223 that the taxi route was A5 and A, and the active runway was 36R. The pilot should follow the taxi clearance to runway 36R.\nQuestion: Which word should be used to express the pilot’s response?" | "A controller informed SIA 223 that the taxi route was A5 and A, and the active runway was 36R. The pilot should follow the taxi clearance to Runway 36R.\nQuestion: Which word should be used to express the pilot’s response?" |
| listening-main-063 | audioTextZh | CALLSIGN-LISTENING-001 | "管制员通知SIA223，滑行路线为A5和A，使用跑道为36R。飞行员应按照滑行许可滑行至36R跑道。\n问题：飞行员应使用哪个词来表达回应？" | "管制员通知SIA 223，滑行路线为A5和A，使用跑道为36R。飞行员应按照滑行许可滑行至36R跑道。\n问题：飞行员应使用哪个词来表达回应？" |
| listening-main-064 | audioText | CALLSIGN-LISTENING-001 | "BAW125, go around, I say again, go around, unknown traffic is crossing the runway.\nQuestion: Why must BAW125 go around?" | "BAW 125, go around, I say again, go around, unknown traffic is crossing the runway.\nQuestion: Why must BAW 125 go around?" |
| listening-main-064 | audioTextZh | CALLSIGN-LISTENING-001 | "BAW125，复飞，我再说一遍，复飞，有不明航空器正在穿越跑道。\n问题：BAW125为什么必须复飞？" | "BAW 125，复飞，我再说一遍，复飞，有不明航空器正在穿越跑道。\n问题：BAW 125为什么必须复飞？" |
| listening-main-065 | audioText | CALLSIGN-LISTENING-001 | "CSN3527, We’ve returned due to bird strike. Engine No 3 is overheating. Our position is 15nm from LKO at 3900m.\nQuestion: What is the pilot’s intention?" | "CSN 3527, We’ve returned due to bird strike. Engine No 3 is overheating. Our position is 15nm from LKO at 3900m.\nQuestion: What is the pilot’s intention?" |
| listening-main-065 | audioTextZh | CALLSIGN-LISTENING-001 | "CSN3527，我们因鸟击返航。3号发动机过热。我们的位置在LKO外15海里、高度3900米。\n问题：飞行员的意图是什么？" | "CSN 3527，我们因鸟击返航。3号发动机过热。我们的位置在LKO外15海里、高度3900米。\n问题：飞行员的意图是什么？" |
| listening-main-078 | audioText | STRUCTURE-LISTENING-001 | "PIL: Panpan, panpan, panpan, Wuhan approach, request priority landing. A passenger claimed he has bird flu. I am not sure. But it scared the passengers. The attendants are trying to comfort other passengers, but I am afraid the situation could soon get out of control.\nQuestion: Why is the situation going be out of control?" | "P: Panpan, panpan, panpan, Wuhan approach, request priority landing. A passenger claimed he has bird flu. I am not sure. But it scared the passengers. The attendants are trying to comfort other passengers, but I am afraid the situation could soon get out of control.\nQuestion: Why is the situation going be out of control?" |
| listening-main-081 | choices | RUNWAY-LISTENING-001 | ["Main gear failure","Traffic conflict","Request taxi","Runway blocked"] | ["Main gear failure","Traffic conflict","Request taxi","runway blocked"] |
| listening-main-084 | audioText | CALLSIGN-LISTENING-001, RUNWAY-LISTENING-001 | "UAL334, we can not accept runway 27 with such a tailwind. We wish to change to runway 09.\nQuestion: Which runway will the crew use to take off?" | "UAL 334, we can not accept Runway 27 with such a tailwind. We wish to change to Runway 09.\nQuestion: Which runway will the crew use to take off?" |
| listening-main-084 | audioTextZh | CALLSIGN-LISTENING-001 | "UAL334，顺风这么大，我们不能接受27跑道。我们希望改用09跑道。\n问题：机组将使用哪条跑道起飞？" | "UAL 334，顺风这么大，我们不能接受27跑道。我们希望改用09跑道。\n问题：机组将使用哪条跑道起飞？" |
| listening-main-105 | audioText | RUNWAY-LISTENING-001 | "The flight crew was told to abort the takeoff because the Airport radar system detected a target at the departure end of runway 25.\nQuestion: What was the flight crew told?" | "The flight crew was told to abort the takeoff because the Airport radar system detected a target at the departure end of Runway 25.\nQuestion: What was the flight crew told?" |
| listening-main-121 | audioText | AUDIO-EVIDENCED-LISTENING-001 | "If significant engine vibration occurs due to ice buildup on the blades, the engine should be accelerated to a minimum of 70% N1 for approximately 15 seconds.\nQuestion: What causes the vibration?" | "If significant engine vibration occurs due to ice accumulation on the blades, the engine should be accelerated to a minimum of 70% N1 for approximately 1.5 seconds.\nQuestion: What causes the vibration?" |
| listening-main-121 | audioTextZh | AUDIO-EVIDENCED-LISTENING-001 | "如果叶片积冰导致发动机明显振动，应把发动机加速至至少70% N1，并保持约15秒。\n问题：是什么造成了发动机振动？" | "如果叶片积冰导致发动机明显振动，应把发动机加速至至少70% N1，并保持约1.5秒。\n问题：是什么造成了发动机振动？" |
| listening-main-154 | audioText | CALLSIGN-LISTENING-001 | "P: New York Departure, good morning, CCA818, climbing through 3000 feet, heading 220, direct VINE.\nQuestion: What is the current heading for Air China 818?" | "P: New York Departure, good morning, CCA 818, climbing through 3000 feet, heading 220, direct VINE.\nQuestion: What is the current heading for CCA 818?" |
| listening-main-154 | audioTextZh | CALLSIGN-LISTENING-001 | "飞行员：纽约离场，早上好，CCA818，正在爬升通过3000英尺，航向220，直飞VINE。\n问题：国航818当前的航向是多少？" | "飞行员：纽约离场，早上好，CCA 818，正在爬升通过3000英尺，航向220，直飞VINE。\n问题：CCA 818当前的航向是多少？" |
| listening-main-161 | audioText | AUDIO-EVIDENCED-LISTENING-001 | "Because the aircraft is heavier than air, the wings must thrust the air in a way that makes the air support the aircraft.\nQuestion: What is the man mainly talking about?" | "Because an airplane is heavier than air, the wings must do something to the surrounding air to make the air support the weight of the airplane.\nQuestion: What is the man mainly talking about?" |
| listening-main-203 | audioText | RUNWAY-LISTENING-001 | "You are at runway 16L, cleared for immediate takeoff, ahead you see a RJ taxiing toward your runway from a parallel runway 16R.\nQuestion: What is the RJ supposed to do when it reaches 16L, your runway?" | "You are at Runway 16L, cleared for immediate takeoff, ahead you see a RJ taxiing toward your runway from a parallel Runway 16R.\nQuestion: What is the RJ supposed to do when it reaches 16L, your runway?" |
| listening-main-203 | choices | RUNWAY-LISTENING-001 | ["Cross runway 16 L.","Line up and wait on 16 L.","Hold short of 16 L.","Vacate the runway."] | ["Cross Runway 16 L.","Line up and wait on 16 L.","Hold short of 16 L.","Vacate the runway."] |
| listening-main-206 | audioText | AUDIO-EVIDENCED-LISTENING-001 | "A British Airways B737 skidded off the runway at Charles de Gaulle Airport in Paris on November 16, 2006, while landing in bad weather. There were no fatalities; ten passengers and two crew members were injured. The airplane sustained minor structural damage.\nQuestion: How many people died in the accident in Paris?" | "A BAW B737 skidded off the runway at Orly Airport in Paris on November 16, 2006, while landing in bad weather. There were no fatalities, although ten passengers and two crew members were injured. The airplane sustained minor undercarriage damage.\nQuestion: How many people died in the accident in Paris?" |
| listening-main-206 | audioTextZh | AUDIO-EVIDENCED-LISTENING-001 | "2006年11月16日，一架英国航空B737在恶劣天气中着陆时冲出巴黎戴高乐机场跑道。事故没有造成人员死亡，10名乘客和2名机组成员受伤，飞机结构受到轻微损伤。\n问题：巴黎的这起事故中有多少人死亡？" | "2006年11月16日，一架BAW B737在恶劣天气中着陆时冲出巴黎奥利机场跑道。事故没有造成人员死亡，但10名乘客和2名机组成员受伤，飞机起落架受到轻微损伤。\n问题：巴黎的这起事故中有多少人死亡？" |
| listening-main-214 | audioText | RUNWAY-LISTENING-001 | "P: Tower, NWA 14, declaring an emergency, we have a fire in No. 1 engine, we need to return to the airport runway 28L.\nQuestion: What are they  requesting?" | "P: Tower, NWA 14, declaring an emergency, we have a fire in No. 1 engine, we need to return to the airport Runway 28L.\nQuestion: What are they  requesting?" |
| listening-main-229 | audioText | AUDIO-EVIDENCED-LISTENING-001 | "The major refueling hazard is the possible combustion of fuel. The most likely spark is from static electricity discharged between the refueling equipment and the aircraft.\nQuestion: What may cause a spark when refueling?" | "The major refueling hazard is the possible combustion of the fuel by a spark that causes fumes to ignite. The most probable cause of a spark is static electricity discharged between the refueling equipment and the aircraft.\nQuestion: What may cause a spark when refueling?" |
| listening-main-294 | audioText | CALLSIGN-LISTENING-001 | "P: Moscow Approach, CSN235, overhead GCF, 4500 feet on QNH, request joining instructions.\nQuestion: What stage of flight is China Southern 235 about to carry out next?" | "P: Moscow Approach, CSN 235, overhead GCF, 4500 feet on QNH, request joining instructions.\nQuestion: What stage of flight is CSN 235 about to carry out next?" |
| listening-main-294 | audioTextZh | CALLSIGN-LISTENING-001 | "飞行员：莫斯科进近，CSN235，飞越GCF，按QNH高度4500英尺，请求加入进近指令。\n问题：南航235接下来将进入哪个飞行阶段？" | "飞行员：莫斯科进近，CSN 235，飞越GCF，按QNH高度4500英尺，请求加入进近指令。\n问题：CSN 235接下来将进入哪个飞行阶段？" |
| listening-main-327 | choices | RUNWAY-LISTENING-001 | ["Outside air temperature.","Light wind.","Runway surface.","Airfield elevation."] | ["Outside air temperature.","Light wind.","runway surface.","Airfield elevation."] |
| listening-main-329 | audioText | RUNWAY-LISTENING-001 | "Heathrow Information C: cloud scattered at 3000 feet, broken at 5000 feet; wind 210 degrees at 8 knots; visibility 2 miles with light wind. Report established on the ILS for runway 23.\nQuestion: What is the cloud cover at 5000 feet?" | "Heathrow Information C: cloud scattered at 3000 feet, broken at 5000 feet; wind 210 degrees at 8 knots; visibility 2 miles with light wind. Report established on the ILS for Runway 23.\nQuestion: What is the cloud cover at 5000 feet?" |
| listening-main-331 | audioText | CALLSIGN-LISTENING-001 | "P: ACA215, unknown fast-moving traffic, 11 o'clock, 10 miles, crossing left to right.\nQuestion: Where is the unknown traffic?" | "P: ACA 215, unknown fast-moving traffic, 11 o'clock, 10 miles, crossing left to right.\nQuestion: Where is the unknown traffic?" |
| listening-main-331 | audioTextZh | CALLSIGN-LISTENING-001 | "飞行员：ACA215，不明快速移动航空器，在11点钟方向、距离10海里，正从左向右穿越。\n问题：不明航空器在哪里？" | "飞行员：ACA 215，不明快速移动航空器，在11点钟方向、距离10海里，正从左向右穿越。\n问题：不明航空器在哪里？" |
| listening-main-342 | audioText | CALLSIGN-LISTENING-001 | "Singapore Airlines 413 is inbound to Beijing Capital, but there is fog at the airport and the RVR is below the landing limits, so the aircraft has to hold for an improvement in visibility.\nQuestion: Why is Singapore Airlines 413 holding?" | "SIA 413 is inbound to Beijing Capital, but there is fog at the airport and the RVR is below the landing limits, so the aircraft has to hold for an improvement in visibility.\nQuestion: Why is SIA 413 holding?" |
| listening-main-342 | audioTextZh | CALLSIGN-LISTENING-001 | "新加坡航空413正飞往北京首都机场，但机场有雾，跑道视程（RVR）低于着陆标准，因此飞机必须等待能见度改善。\n问题：新加坡航空413为什么等待？" | "SIA 413正飞往北京首都机场，但机场有雾，跑道视程（RVR）低于着陆标准，因此飞机必须等待能见度改善。\n问题：SIA 413为什么等待？" |
| listening-main-353 | audioText | CALLSIGN-LISTENING-001, RUNWAY-LISTENING-001 | "P: Ground, CSN15, on taxiway N for runway 27L. We see debris on the left side of the runway near the high-speed turnoff. It appears to be part of an engine cowling.\nQuestion: Where is the debris?" | "P: Ground, CSN 15, on taxiway N for Runway 27L. We see debris on the left side of the runway near the high-speed turnoff. It appears to be part of an engine cowling.\nQuestion: Where is the debris?" |
| listening-main-353 | audioTextZh | CALLSIGN-LISTENING-001 | "飞行员：地面，CSN15，在N滑行道，前往27L跑道。我们看到跑道左侧、靠近快速脱离道的位置有碎片，看起来像发动机整流罩的一部分。\n问题：碎片在哪里？" | "飞行员：地面，CSN 15，在N滑行道，前往27L跑道。我们看到跑道左侧、靠近快速脱离道的位置有碎片，看起来像发动机整流罩的一部分。\n问题：碎片在哪里？" |
| listening-main-353 | choices | ICAO-LISTENING-001 | ["On taxiway November.","On the high speed turn off.","On the right side of the runway.","On the left side of the runway."] | ["On taxiway N.","On the high speed turn off.","On the right side of the runway.","On the left side of the runway."] |
| listening-main-354 | audioText | AUDIO-EVIDENCED-LISTENING-001, CALLSIGN-LISTENING-001 | "P: Guangzhou Departure, CSN5469, airborne, passing 600 meters, climbing to 3000 meters, request heading 290 due to weather.\nQuestion: What stage of flight does the transmission refer to?" | "P: Guangzhou Departure, CSN 6549, airborne, passing 600 meters, climbing to 3000 meters, request heading 290 due to weather.\nQuestion: What stage of flight does the transmission refer to?" |
| listening-main-354 | audioTextZh | AUDIO-EVIDENCED-LISTENING-001, CALLSIGN-LISTENING-001 | "飞行员：广州离场，CSN5469，已经离地，正通过600米爬升至3000米；由于天气原因，请求航向290。\n问题：这段通话所指的是哪个飞行阶段？" | "飞行员：广州离场，CSN 6549，已经离地，正通过600米爬升至3000米；由于天气原因，请求航向290。\n问题：这段通话所指的是哪个飞行阶段？" |
| listening-main-355 | audioText | CALLSIGN-LISTENING-001 | "P: Approach, good morning, CCA 512, descending through FL200, squawking 4123.\nQuestion: What is the squawk code of Air China 512?" | "P: Approach, good morning, CCA 512, descending through FL200, squawking 4123.\nQuestion: What is the squawk code of CCA 512?" |
| listening-main-355 | audioTextZh | CALLSIGN-LISTENING-001 | "飞行员：进近，早上好，CCA 512，正在下降通过FL200，应答机编码4123。\n问题：国航512的应答机编码是多少？" | "飞行员：进近，早上好，CCA 512，正在下降通过FL200，应答机编码4123。\n问题：CCA 512的应答机编码是多少？" |
| listening-main-401 | choices | RUNWAY-LISTENING-001 | ["Runway closure.","To save time.","It hasn't been approved.","Severe weather."] | ["runway closure.","To save time.","It hasn't been approved.","Severe weather."] |
| listening-main-409 | audioTextZh | STRUCTURE-LISTENING-002 | "飞行前检查期间，副驾驶注意到起落架舱附近有液压油，但没有发现任何泄漏点。问题：副驾驶在哪里发现了液压油？" | "飞行前检查期间，副驾驶注意到起落架舱附近有液压油，但没有发现任何泄漏点。\n问题：副驾驶在哪里发现了液压油？" |
| listening-main-410 | audioTextZh | STRUCTURE-LISTENING-002 | "现代雷达系统十分灵敏，使飞行员能够在完全没有目视参照的情况下安全着陆。问题：飞行员为什么能够实施完全盲降？" | "现代雷达系统十分灵敏，使飞行员能够在完全没有目视参照的情况下安全着陆。\n问题：飞行员为什么能够实施完全盲降？" |
| listening-main-414 | audioText | CALLSIGN-LISTENING-001 | "P: Control, CSN303, over OBC at 15, FL330, estimating PNO at 46, WFT next.\nQuestion: What is the immediate next reporting point?" | "P: Control, CSN 303, over OBC at 15, FL330, estimating PNO at 46, WFT next.\nQuestion: What is the immediate next reporting point?" |
| listening-main-414 | audioTextZh | CALLSIGN-LISTENING-001 | "飞行员：区调，CSN303，15分飞越OBC，FL330，预计46分到达PNO，下一报告点WFT。\n问题：紧接着要到达的报告点是哪一个？" | "飞行员：区调，CSN 303，15分飞越OBC，FL330，预计46分到达PNO，下一报告点WFT。\n问题：紧接着要到达的报告点是哪一个？" |
| listening-main-417 | audioTextZh | STRUCTURE-LISTENING-002 | "男1：你能否向上海区调询问，给我们一个更高的高度？我们需要脱离颠簸区。男2：好的，我会联系管制员，看能否给我们FL350。问题：机组为什么想改变高度？" | "男1：你能否向上海区调询问，给我们一个更高的高度？我们需要脱离颠簸区。男2：好的，我会联系管制员，看能否给我们FL350。\n问题：机组为什么想改变高度？" |
| listening-main-421 | audioTextZh | STRUCTURE-LISTENING-002 | "空速表、高度表和升降速度表都使用静压，但只有空速表还使用皮托管压力。问题：以下哪种仪表同时使用静压和皮托管压力？" | "空速表、高度表和升降速度表都使用静压，但只有空速表还使用皮托管压力。\n问题：以下哪种仪表同时使用静压和皮托管压力？" |
| listening-main-423 | audioTextZh | STRUCTURE-LISTENING-002 | "进行飞行准备时，机组应认真考虑，确保续航能力和燃油储备充分高于法规要求的最低标准。问题：飞行准备时，机组应考虑什么？" | "进行飞行准备时，机组应认真考虑，确保续航能力和燃油储备充分高于法规要求的最低标准。\n问题：飞行准备时，机组应考虑什么？" |
| listening-main-424 | audioTextZh | STRUCTURE-LISTENING-002 | "有时，管制员会向飞行员发布绕飞天气许可；此类许可总会包含方向和距离。问题：绕飞许可中包含什么？" | "有时，管制员会向飞行员发布绕飞天气许可；此类许可总会包含方向和距离。\n问题：绕飞许可中包含什么？" |
| listening-main-425 | audioTextZh | STRUCTURE-LISTENING-002 | "由于离场时间可能调整，飞行员必须在正确的频率上持续守听。问题：飞行员应该怎么做？" | "由于离场时间可能调整，飞行员必须在正确的频率上持续守听。\n问题：飞行员应该怎么做？" |
| listening-main-427 | audioTextZh | STRUCTURE-LISTENING-002 | "进行飞行前计划时，必须准确估算航路飞行时间，以确定该航班的燃油需求。问题：为什么必须准确计算航路飞行时间？" | "进行飞行前计划时，必须准确估算航路飞行时间，以确定该航班的燃油需求。\n问题：为什么必须准确计算航路飞行时间？" |
| listening-main-428 | audioTextZh | STRUCTURE-LISTENING-002 | "一架支线客机获准进跑道对正，并准备在一架离场B747之后立即起飞；进场航空器正在短五边。当前静风，天气干燥晴朗。问题：为什么前方离场航空器对这架支线客机的机长很重要？" | "一架支线客机获准进跑道对正，并准备在一架离场B747之后立即起飞；进场航空器正在短五边。当前静风，天气干燥晴朗。\n问题：为什么前方离场航空器对这架支线客机的机长很重要？" |
| listening-main-429 | audioTextZh | STRUCTURE-LISTENING-002 | "飞行员收到决断咨询（RA）时，距离可能相撞只剩约30秒，因此没有足够时间先通知空中交通管制，首要任务是立即采取避让行动。问题：飞行员收到RA后首先应该做什么？" | "飞行员收到决断咨询（RA）时，距离可能相撞只剩约30秒，因此没有足够时间先通知空中交通管制，首要任务是立即采取避让行动。\n问题：飞行员收到RA后首先应该做什么？" |
| listening-main-438 | audioText | CALLSIGN-LISTENING-001 | "P: Xi'an Control, CES2512, TCAS descent completed, 7800m resumed.\nQuestion: What does the pilot mean?" | "P: Xi'an Control, CES 2512, TCAS descent completed, 7800m resumed.\nQuestion: What does the pilot mean?" |
| listening-main-438 | audioTextZh | CALLSIGN-LISTENING-001, STRUCTURE-LISTENING-002 | "飞行员：西安区调，CES2512，TCAS下降机动已完成，已恢复7800米。问题：飞行员是什么意思？" | "飞行员：西安区调，CES 2512，TCAS下降机动已完成，已恢复7800米。\n问题：飞行员是什么意思？" |
| listening-main-442 | audioTextZh | STRUCTURE-LISTENING-002 | "说话人：飞行机组训练使用正常程序，以确保飞机状态适合飞行。问题：以下哪项不是正常程序的功能？" | "说话人：飞行机组训练使用正常程序，以确保飞机状态适合飞行。\n问题：以下哪项不是正常程序的功能？" |
| listening-main-444 | audioTextZh | STRUCTURE-LISTENING-002 | "说话人：每个航段附近的最高地形或障碍物都应远低于设计飞行高度，并远离飞行航迹。问题：这句话是什么意思？" | "说话人：每个航段附近的最高地形或障碍物都应远低于设计飞行高度，并远离飞行航迹。\n问题：这句话是什么意思？" |
| listening-main-449 | audioText | CALLSIGN-LISTENING-001 | "P: Tower, AFR2136, going around, we encountered severe wake turbulence during approach.\nQuestion: What caused the turbulence during the approach?" | "P: Tower, AFR 2136, going around, we encountered severe wake turbulence during approach.\nQuestion: What caused the turbulence during the approach?" |
| listening-main-449 | audioTextZh | CALLSIGN-LISTENING-001 | "飞行员：塔台，AFR2136，正在复飞，我们在进近过程中遭遇了严重尾流颠簸。\n问题：进近过程中的颠簸是什么造成的？" | "飞行员：塔台，AFR 2136，正在复飞，我们在进近过程中遭遇了严重尾流颠簸。\n问题：进近过程中的颠簸是什么造成的？" |
| listening-main-454 | audioText | STRUCTURE-LISTENING-001 | "B:Before each flight, the pilots must have all the necessary documents in hand such as flight plan, weather forecast, NOTAM and so on.\nQuestion: Which document is not mentioned?" | "B: Before each flight, the pilots must have all the necessary documents in hand such as flight plan, weather forecast, NOTAM and so on.\nQuestion: Which document is not mentioned?" |
| listening-main-455 | audioText | STRUCTURE-LISTENING-001 | "B:Air density is easily changed by compression and expansion due to the influence of temperature, pressure and humidity.\nQuestion: Which of the following was not mentioned?" | "B: Air density is easily changed by compression and expansion due to the influence of temperature, pressure and humidity.\nQuestion: Which of the following was not mentioned?" |
| listening-main-461 | audioText | RUNWAY-LISTENING-001 | "Runway incursions do occur in daytime as well as at night, in good, as well as in low visibility conditions.\nQuestion: when do the runway incursions occur according to the statement?" | "runway incursions do occur in daytime as well as at night, in good, as well as in low visibility conditions.\nQuestion: when do the runway incursions occur according to the statement?" |
| listening-main-469 | audioText | ICAO-LISTENING-001 | "Golf Charlie Delta, one aircraft on runway vacating. Land at your discretion. Surface wind 260, 6 KTS.\nQuestion: what should the pilot do?" | "GCD, one aircraft on runway vacating. Land at your discretion. Surface wind 260, 6 KTS.\nQuestion: what should the pilot do?" |
| listening-main-470 | audioText | CALLSIGN-LISTENING-001 | "Northwest 345, hold at north cross FL60, inbound track 256 degrees, turns left, outbound time 1 minute.\nQuestion: What should the pilot do when the controller gives such an instruction?" | "NWA 345, hold at north cross FL60, inbound track 256 degrees, turns left, outbound time 1 minute.\nQuestion: What should the pilot do when the controller gives such an instruction?" |
| listening-main-470 | audioTextZh | CALLSIGN-LISTENING-001 | "西北航空345号航班，在北交叉点保持飞行高度层60，入航航迹256度，左转，出航时间1分钟。\n问题：当管制员给出这样的指令时，飞行员应该怎么做？" | "NWA 345号航班，在北交叉点保持飞行高度层60，入航航迹256度，左转，出航时间1分钟。\n问题：当管制员给出这样的指令时，飞行员应该怎么做？" |
| listening-main-491 | audioText | CALLSIGN-LISTENING-001 | "Ground, Danair 432, ready to go, but the tow bar has broken. Is it OK if we are a few minutes late?\nQuestion: What is the problem?" | "Ground, DAN 432, ready to go, but the tow bar has broken. Is it OK if we are a few minutes late?\nQuestion: What is the problem?" |
| listening-main-491 | audioTextZh | CALLSIGN-LISTENING-001 | "地面（管制），丹麦航空432，准备就绪，但牵引杆断了。我们晚几分钟出发可以吗？\n问题：出了什么问题？" | "地面（管制），DAN 432，准备就绪，但牵引杆断了。我们晚几分钟出发可以吗？\n问题：出了什么问题？" |
| listening-main-491 | choices | CALLSIGN-LISTENING-001 | ["Danair 432 is a few minutes late.","Danair 432 is ready for takeoff.","Danair 432 has taken off.","Danair 432 has a tow bar problem."] | ["DAN 432 is a few minutes late.","DAN 432 is ready for takeoff.","DAN 432 has taken off.","DAN 432 has a tow bar problem."] |
| listening-main-491 | referenceText | ANSWER-LISTENING-002 | "正确答案：D. Danair 432 has a tow bar problem." | "正确答案：D. DAN 432 has a tow bar problem." |
| listening-main-493 | audioTextZh | CALLSIGN-LISTENING-001 | "荷兰皇家航空991航班，蓝场进近管制，我们刚刚接到一个匿名电话，称你的飞机上有一枚炸弹。请立即返回蓝场机场。\n问题：发生了什么事？" | "KLM 991航班，蓝场进近管制，我们刚刚接到一个匿名电话，称你的飞机上有一枚炸弹。请立即返回蓝场机场。\n问题：发生了什么事？" |
| listening-main-509 | audioText | CALLSIGN-LISTENING-001 | "Iran 800, nose wheel still appears to be jammed. We'll have to make an emergency landing.\nQuestion: what might be the pilot's intention?" | "IRA 800, nose wheel still appears to be jammed. We'll have to make an emergency landing.\nQuestion: what might be the pilot's intention?" |
| listening-main-509 | audioTextZh | CALLSIGN-LISTENING-001 | "伊朗航空800航班，前起落架似乎仍然卡死。我们将不得不进行紧急迫降。\n问题：飞行员的意图可能是什么？" | "IRA 800航班，前起落架似乎仍然卡死。我们将不得不进行紧急迫降。\n问题：飞行员的意图可能是什么？" |
| listening-main-530 | audioText | CALLSIGN-LISTENING-001 | "Eastern 546, Airbus 300, green system fails due system leakage. I am not sure whether I can extend my landing gear. Request emergency assistance when landing.\nQuestion: Why does the pilot ask for the emergency assistance on landing?" | "EAL 546, Airbus 300, green system fails due system leakage. I am not sure whether I can extend my landing gear. Request emergency assistance when landing.\nQuestion: Why does the pilot ask for the emergency assistance on landing?" |
| listening-main-530 | audioTextZh | CALLSIGN-LISTENING-001 | "东方航空546，空客300，绿色系统因系统泄漏而失效。我不确定能否放下起落架。着陆时请求紧急援助。\n问题：为什么飞行员在着陆时请求紧急援助？" | "EAL 546，空客300，绿色系统因系统泄漏而失效。我不确定能否放下起落架。着陆时请求紧急援助。\n问题：为什么飞行员在着陆时请求紧急援助？" |
| listening-main-532 | audioTextZh | CALLSIGN-LISTENING-001 | "荷兰皇家航空567，请求返回机场，因为在发动机指示和机组告警系统（ECAM）上显示轮舱温度过高。\n问题：为什么机组人员请求返回（机场）？" | "KLM 567，请求返回机场，因为在发动机指示和机组告警系统（ECAM）上显示轮舱温度过高。\n问题：为什么机组人员请求返回（机场）？" |
| listening-main-533 | audioText | CALLSIGN-LISTENING-001 | "MAYDAY MAYDAY MAYDAY, Greater Bay Airlines 303 , left engine on fire, emergency slides are released, request fire services and first aid.\nQuestion: What might the crew be doing now?" | "MAYDAY MAYDAY MAYDAY, HGB 303 , left engine on fire, emergency slides are released, request fire services and first aid.\nQuestion: What might the crew be doing now?" |
| listening-main-533 | audioTextZh | CALLSIGN-LISTENING-001 | "MAYDAY MAYDAY MAYDAY, GBA303，左发动机着火，应急滑梯已放出，请求消防服务和急救。\n问题：机组人员现在可能在做什么？" | "MAYDAY MAYDAY MAYDAY, HGB 303，左发动机着火，应急滑梯已放出，请求消防服务和急救。\n问题：机组人员现在可能在做什么？" |
| listening-main-540 | choices | RUNWAY-LISTENING-001 | ["The point of touchdown.","Airport elevation.","Runway threshold.","Final leg."] | ["The point of touchdown.","Airport elevation.","runway threshold.","Final leg."] |
| listening-main-550 | audioText | CALLSIGN-LISTENING-001 | "Control, Delta 443. Several passengers have lost consciousness, faint, because a number of oxygen masks didn't drop.\nQuestion: what happened on board?" | "Control, DAL 443. Several passengers have lost consciousness, faint, because a number of oxygen masks didn't drop.\nQuestion: what happened on board?" |
| listening-main-550 | audioTextZh | CALLSIGN-LISTENING-001 | "管制员，达美航空443。有几名乘客失去了意识，昏迷了，因为有一些氧气面罩没有掉落下来。\n问题：飞机上发生了什么事？" | "管制员，DAL 443。有几名乘客失去了意识，昏迷了，因为有一些氧气面罩没有掉落下来。\n问题：飞机上发生了什么事？" |
| listening-main-553 | audioText | CALLSIGN-LISTENING-001 | "Tower, Air France 2136 going around. We encountered severe wake turbulence during approach.\nQuestion: what caused the turbulence during approach?" | "Tower, AFR 2136 going around. We encountered severe wake turbulence during approach.\nQuestion: what caused the turbulence during approach?" |
| listening-main-553 | audioTextZh | CALLSIGN-LISTENING-001 | "塔台，法航2136要复飞。我们在进近过程中遭遇了严重的尾流紊流。\n问题：进近过程中的紊流是由什么引起的？" | "塔台，AFR 2136要复飞。我们在进近过程中遭遇了严重的尾流紊流。\n问题：进近过程中的紊流是由什么引起的？" |
| listening-main-570 | audioText | CALLSIGN-LISTENING-001 | "Air China 104, caution, the blast fence on the right hand side of the taxi route. You are too close to it.\nQuestion: what did the ram controller tell Air China 104 to be careful about?" | "CCA 104, caution, the blast fence on the right hand side of the taxi route. You are too close to it.\nQuestion: what did the ram controller tell CCA 104 to be careful about?" |
| listening-main-570 | audioTextZh | CALLSIGN-LISTENING-001 | "中国国际航空104，注意，滑行路线右侧有防爆网。你们离它太近了。\n问题：管制员提醒中国国际航空104要小心什么？" | "CCA 104，注意，滑行路线右侧有防爆网。你们离它太近了。\n问题：管制员提醒CCA 104要小心什么？" |
| listening-main-572 | audioText | CALLSIGN-LISTENING-001 | "Dispatch, Air China 101, request three wheelchairs for the handicapped passengers on arrival.\nQuestion: according to the exchange, what did the pilot request?" | "Dispatch, CCA 101, request three wheelchairs for the handicapped passengers on arrival.\nQuestion: according to the exchange, what did the pilot request?" |
| listening-main-572 | audioTextZh | CALLSIGN-LISTENING-001 | "签派员，中国国际航空101，到达时请为残疾乘客准备三把轮椅。\n问题：根据这段对话，飞行员提出了什么请求？" | "签派员，CCA 101，到达时请为残疾乘客准备三把轮椅。\n问题：根据这段对话，飞行员提出了什么请求？" |
| listening-main-579 | choices | RUNWAY-LISTENING-001 | ["Runway not available.","Traffic congestion.","Speed limit.","Bad weather."] | ["runway not available.","Traffic congestion.","Speed limit.","Bad weather."] |
| listening-main-590 | audioText | ICAO-LISTENING-001, CALLSIGN-LISTENING-001 | "Air China 104, Beijing Approach, cancel SID, turn right, heading 230 to intercept 190 Radio of the Charlie Golf VOR.\nQuestion: what did the controller tell Air China 104 to do?" | "CCA 104, Beijing Approach, cancel SID, turn right, heading 230 to intercept 190 Radio of the CG VOR.\nQuestion: what did the controller tell CCA 104 to do?" |
| listening-main-590 | audioTextZh | ICAO-LISTENING-001, CALLSIGN-LISTENING-001 | "中国国际航空104，北京进近，取消标准仪表离场程序，向右转，航向230，截获Charlie Golf VOR的190径向线。\n问题：管制员告知中国国际航空104要做什么？" | "CCA 104，北京进近，取消标准仪表离场程序，向右转，航向230，截获CG VOR的190径向线。\n问题：管制员告知CCA 104要做什么？" |
| listening-main-591 | audioText | ICAO-LISTENING-001, CALLSIGN-LISTENING-001 | "Air China 104, maintain present level, join holding procedure at Hotel Golf due temporary radar lost, keep you advised.\nQuestion: why was the pilot instructed to join the holding procedure?" | "CCA 104, maintain present level, join holding procedure at HG due temporary radar lost, keep you advised.\nQuestion: why was the pilot instructed to join the holding procedure?" |
| listening-main-591 | audioTextZh | CALLSIGN-LISTENING-001 | "中国国际航空104，保持当前高度，前往HG执行等待程序，因为雷达暂时失效，会随时告知你情况。\n问题：为什么飞行员被指示执行等待程序？" | "CCA 104，保持当前高度，前往HG执行等待程序，因为雷达暂时失效，会随时告知你情况。\n问题：为什么飞行员被指示执行等待程序？" |
| listening-main-592 | audioText | CALLSIGN-LISTENING-001 | "Wuhan Tower, China Southern 206, thrust reverser and airbrake failed, we require tax back to the apron.\nQuestion: which parts of the aircraft have problems?" | "Wuhan Tower, CSN 206, thrust reverser and airbrake failed, we require tax back to the apron.\nQuestion: which parts of the aircraft have problems?" |
| listening-main-592 | audioTextZh | CALLSIGN-LISTENING-001 | "武汉塔台，中国南方航空206，反推装置和空气制动器失效，我们要求滑行回停机坪。\n问题：飞机的哪些部件出现了问题？" | "武汉塔台，CSN 206，反推装置和空气制动器失效，我们要求滑行回停机坪。\n问题：飞机的哪些部件出现了问题？" |
| listening-main-599 | choices | RUNWAY-LISTENING-001 | ["Runway in use.","Vertical airspeed limitation","Aircraft speed.","Where the aircraft arrives from."] | ["runway in use.","Vertical airspeed limitation","Aircraft speed.","Where the aircraft arrives from."] |
| listening-main-603 | audioText | CALLSIGN-LISTENING-001 | "China Southern 3041, we've just been caught in severe turbulence. About fifteen passengers have been hurt.\nQuestion: what happened to China Southern 3041?" | "CSN 3041, we've just been caught in severe turbulence. About fifteen passengers have been hurt.\nQuestion: what happened to CSN 3041?" |
| listening-main-603 | audioTextZh | CALLSIGN-LISTENING-001 | "中国南方航空3041，我们刚刚遭遇了严重的乱流。大约15名乘客受伤了。\n问题：中国南方航空3041发生了什么事？" | "CSN 3041，我们刚刚遭遇了严重的乱流。大约15名乘客受伤了。\n问题：CSN 3041发生了什么事？" |
| listening-main-604 | audioTextZh | CALLSIGN-LISTENING-001 | "荷兰皇家航空341，继续进近。前机报告在最后进近的最后300英尺处有风切变。\n问题：前机报告了什么？" | "KLM 341，继续进近。前机报告在最后进近的最后300英尺处有风切变。\n问题：前机报告了什么？" |
| listening-main-605 | audioText | CALLSIGN-LISTENING-001 | "Northwest 552, we have undercarriage trouble. We'd like to go around.\nQuestion: what problem does the crew have?" | "NWA 552, we have undercarriage trouble. We'd like to go around.\nQuestion: what problem does the crew have?" |
| listening-main-605 | audioTextZh | CALLSIGN-LISTENING-001 | "西北航空552，我们起落架有故障。我们要复飞。\n问题：机组人员遇到了什么问题？" | "NWA 552，我们起落架有故障。我们要复飞。\n问题：机组人员遇到了什么问题？" |
| listening-main-606 | audioText | CALLSIGN-LISTENING-001 | "China Southern 302, Hong Kong delivery, clear to Bekol course, FL160, cross Bekol course, FL130 or above.\nQuestion: which statement is true?" | "CSN 302, Hong Kong delivery, clear to Bekol course, FL160, cross Bekol course, FL130 or above.\nQuestion: which statement is true?" |
| listening-main-606 | audioTextZh | CALLSIGN-LISTENING-001 | "中国南方航空302，香港放行，许可沿反航道飞行，飞行高度层160，穿越反航道时，飞行高度层需达到130或以上。\n问题：以下哪个陈述是正确的？" | "CSN 302，香港放行，许可沿反航道飞行，飞行高度层160，穿越反航道时，飞行高度层需达到130或以上。\n问题：以下哪个陈述是正确的？" |
| listening-main-607 | audioText | CALLSIGN-LISTENING-001 | "Northwest 281, we have an electrical failure. We intend to return to the airport, but we have to down 40 tons of fuel first.\nQuestion: what is the crew intention?" | "NWA 281, we have an electrical failure. We intend to return to the airport, but we have to down 40 tons of fuel first.\nQuestion: what is the crew intention?" |
| listening-main-607 | audioTextZh | CALLSIGN-LISTENING-001 | "西北航空281，我们遭遇了电气故障。我们打算返回机场，但我们得先排放40吨燃油。\n问题：机组的意图是什么？" | "NWA 281，我们遭遇了电气故障。我们打算返回机场，但我们得先排放40吨燃油。\n问题：机组的意图是什么？" |
| listening-main-610 | audioText | CALLSIGN-LISTENING-001 | "Japan Air 651, we have had a flat tire on the nose gear. Engines are shut down, and request a tug.\nQuestion: which of the following statements is not true?" | "JAL 651, we have had a flat tire on the nose gear. Engines are shut down, and request a tug.\nQuestion: which of the following statements is not true?" |
| listening-main-610 | audioTextZh | CALLSIGN-LISTENING-001 | "日本航空651，我们前起落架爆胎了。发动机已关闭，请求一辆拖车。\n问题：以下哪个陈述是不正确的？" | "JAL 651，我们前起落架爆胎了。发动机已关闭，请求一辆拖车。\n问题：以下哪个陈述是不正确的？" |
| listening-main-611 | audioText | CALLSIGN-LISTENING-001 | "Japan 781, stop descent immediately. I say again, stop descent immediately. Unknown traffic approaching you from below.\nQuestion: Why is Japan Air 781 instructed to stop descent?" | "JAL 781, stop descent immediately. I say again, stop descent immediately. Unknown traffic approaching you from below.\nQuestion: Why is JAL 781 instructed to stop descent?" |
| listening-main-611 | audioTextZh | CALLSIGN-LISTENING-001 | "日本航空781，立刻停止下降。我再说一遍，立刻停止下降。有不明航空器从下方朝你飞来。\n问题：为什么日本航空781被指示停止下降？" | "JAL 781，立刻停止下降。我再说一遍，立刻停止下降。有不明航空器从下方朝你飞来。\n问题：为什么JAL 781被指示停止下降？" |
| listening-main-612 | audioText | CALLSIGN-LISTENING-001 | "Air China 982, hold at PM at 6000 meters, expect further clearance at 16. Landing delays at Beijing 20 minutes.\nQuestion: Why is Air China 982 instructed to hold?" | "CCA 982, hold at PM at 6000 meters, expect further clearance at 16. Landing delays at Beijing 20 minutes.\nQuestion: Why is CCA 982 instructed to hold?" |
| listening-main-612 | audioTextZh | CALLSIGN-LISTENING-001 | "中国国际航空982，在PM保持6000米高度等待，预计16点（获得）进一步的许可。在北京降落将延误20分钟。\n问题：为什么中国国际航空982被指示进行等待？" | "CCA 982，在PM保持6000米高度等待，预计16点（获得）进一步的许可。在北京降落将延误20分钟。\n问题：为什么CCA 982被指示进行等待？" |
| listening-main-613 | audioText | CALLSIGN-LISTENING-001 | "Wuhan Control, this is Air China 4106. Our fuel endurance is only 50 minutes. We'd like to refuel at Wuhan.\nQuestion: What does a crew intend to do?" | "Wuhan Control, this is CCA 4106. Our fuel endurance is only 50 minutes. We'd like to refuel at Wuhan.\nQuestion: What does a crew intend to do?" |
| listening-main-613 | audioTextZh | CALLSIGN-LISTENING-001 | "武汉管制，这里是中国国际航空4106。我们的燃油续航时间仅剩50分钟。我们想在武汉加油。\n问题：机组人员打算做什么？" | "武汉管制，这里是CCA 4106。我们的燃油续航时间仅剩50分钟。我们想在武汉加油。\n问题：机组人员打算做什么？" |
| listening-main-619 | audioText | CALLSIGN-LISTENING-001 | "Wuhan Control, China Southern 3108. It looks like our windshields iced over. Does the met confirm severe icing in the area?\nQuestion: what does a pilot mean?" | "Wuhan Control, CSN 3108. It looks like our windshields iced over. Does the met confirm severe icing in the area?\nQuestion: what does a pilot mean?" |
| listening-main-619 | audioTextZh | CALLSIGN-LISTENING-001 | "武汉管制，这里是中国南方航空3108。我们的挡风玻璃好像结冰了。气象部门确认该区域有严重结冰情况吗？\n问题：飞行员（说这话）是什么意思？" | "武汉管制，这里是CSN 3108。我们的挡风玻璃好像结冰了。气象部门确认该区域有严重结冰情况吗？\n问题：飞行员（说这话）是什么意思？" |
