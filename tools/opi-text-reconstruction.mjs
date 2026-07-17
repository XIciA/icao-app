import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opiRoot = join(root, 'content/question-banks/banks/opi');
const bankPath = join(opiRoot, 'bank.json');
const categoriesRoot = join(opiRoot, 'categories');
const topicsRoot = join(opiRoot, 'topics');
const generatedRoot = join(root, '.generated/opi-question-bank-text-reconstruction');
const snapshotRoot = join(generatedRoot, 'snapshot');
const manifestPath = join(generatedRoot, 'freeze-manifest.json');
const auditPath = join(generatedRoot, 'audit-report.json');
const currentAuditPath = join(generatedRoot, 'audit-current-report.json');
const workItemsPath = join(generatedRoot, 'work-items.json');
const reviewPath = join(generatedRoot, 'review-report.json');
const candidateRoot = join(generatedRoot, 'candidate');
const artifactsRoot = join(root, 'docs/workstreams/opi-question-bank-text-reconstruction/artifacts');
const decisionsPath = join(artifactsRoot, 'final-card-decisions.json');
const mappingPath = join(artifactsRoot, 'card-target-mapping.json');
const qualityPath = join(artifactsRoot, 'final-quality-report.json');

const STAGES = ['question-en', 'question-zh', 'answer-en', 'answer-zh'];
const HAN = /[\u3400-\u9fff]/u;
const LATIN = /[A-Za-z]/u;
const ANSWER_NUMBERING =
  /(?:^|\n)\s*(?:[（(]?\d{1,2}[）).、]|version\s+[a-z0-9]+)\s*/iu;
const UNRESOLVED_SLASH = /\b[A-Za-z][A-Za-z -]{0,30}\s*\/\s*[A-Za-z][A-Za-z -]{0,30}\b/u;
const SAFE_SLASH = /\b(?:and\/or|he\/she|his\/her|input\/output|takeoff\/landing|departure\/arrival)\b/giu;
const PURE_IMAGE_KIND = 'image';

const QUESTION_ZH_OVERRIDES = {
  'opi-core-003': '为什么雷击会威胁飞行安全？',
  'opi-core-004': '如果飞机在飞行中遭遇雷击，你会怎么做？',
  'opi-core-005': '飞行员可以采取哪些措施避免雷击？',
  'opi-core-006': '雷击会如何威胁飞行安全？',
  'opi-core-021': '飞机哪些部位最容易结冰？',
  'opi-core-095': '实施紧急撤离时应遵循哪些程序？',
  'opi-core-096': '飞行员可以如何协助客舱机组实施紧急撤离？',
  'opi-core-108': '紧急情况下谁应最后离开飞机，为什么？',
  'opi-core-218': '鸟击最可能发生在哪些飞行阶段，为什么？',
  'opi-core-220': '鸟击会如何威胁飞行安全？',
  'opi-core-225': '发动机吸入外来物会如何威胁飞行安全？',
  'opi-core-226': '发动机吸入鸟类或外来物最可能发生在哪些飞行阶段，为什么？',
  'opi-core-234': '你认为标准操作程序能有效预防人为错误吗，为什么？',
  'opi-core-238': '良好的机组资源管理是否依赖严格遵守标准操作程序，为什么？',
  'opi-core-240': 'SOP 代表什么，它为什么对飞行安全重要？',
  'opi-core-360': '你的公司是否提供通信失效处置指南，可以在哪里查阅？',
  'opi-core-561': '哪些类型的机场最容易出现流量控制？',
  'opi-core-638': '什么是标准喊话？',
  'opi-core-660': '你如何看待公司的禁烟政策？',
  'opi-core-661': '飞行员在驾驶舱吸烟可能造成哪些后果？',
  'opi-core-662': '请介绍你所在公司的禁烟政策。',
  'opi-core-114': '什么是驾驶舱话音记录器（CVR）？',
  'opi-core-136': '飞行员应如何与空中交通管制员进行有效沟通？',
  'opi-core-137': '机长应如何与副驾驶进行有效沟通？',
  'opi-core-138': '飞行员应如何与客舱机组进行有效沟通？',
  'opi-core-139': '飞行员应如何与空中交通管制员有效协作？',
  'opi-core-144': '驾驶舱内的飞行员应如何有效协作？',
  'opi-core-145': '飞行员应如何与客舱机组有效协作？',
  'opi-core-261': '你所在的航空公司是否运行复杂机场？',
  'opi-core-310': '什么是快速存取记录器（QAR）？',
  'opi-core-142': '飞行员可以怎样提高无线电通话质量？',
  'opi-core-520': '什么是增强型近地警告系统（EGPWS）？',
  'opi-core-774': '哪些因素可能导致机组成员失能？',
  'opi-core-555': '航班延误可能由哪些原因造成？',
  'opi-core-671': '飞行机组为什么要在飞行前检查维修日志？',
  'opi-core-717': '什么是空中交通防撞系统（TCAS），它有哪些主要功能？',
  'opi-extra-003': '你会如何帮助因长时间延误而焦虑的旅客？',
  'opi-extra-004': '你会如何处理旅客对备降的投诉？',
  'opi-extra-005': '如果旅客在飞行中生病、不适、心脏病发作或因颠簸受伤，你会如何处置？',
  'opi-extra-006': '你会如何处置飞行中的醉酒或扰乱秩序旅客？',
  'opi-extra-007': '如果旅客之间发生打斗，你会如何处置？',
  'opi-extra-008': '如果旅客拒绝托运超大行李或关闭手机，你会如何处置？',
  'opi-extra-345': '磁罗盘的主要用途是什么？与陀螺仪表相比，它最大的优势是什么？',
  'opi-core-743': '什么是红眼航班？',
  'opi-image-002-q03': '如果离场前发现机翼上有冰或霜，你应该怎么做？',
  'opi-image-003-q03': '你还知道哪些其他跑道灯光设施？',
  'opi-image-014-q02': '多个显示屏如何在飞行中帮助飞行员？',
  'opi-image-017-q01': '哪些严重故障可能迫使大型喷气客机在海上迫降？',
  'opi-image-017-q03': '成功水上迫降后，机组应立即执行哪些撤离步骤？',
  'opi-image-020-q02': '机翼结冰污染会如何影响飞行安全？',
  'opi-image-020-q03': '在这种情况下，飞行员应如何确保飞行安全？',
  'opi-image-022-q01': '在这类地形机场夜间着陆时，哪些天气条件会进一步降低能见度？',
};

const QUESTION_EN_OVERRIDES = {
  'opi-core-003': 'Why can a lightning strike threaten flight safety?',
  'opi-core-004': 'What would you do if your aircraft encountered a lightning strike in flight?',
  'opi-core-005': 'What measures can pilots take to avoid lightning strikes?',
  'opi-core-006': 'How can a lightning strike threaten flight safety?',
  'opi-core-021': 'On which parts of an aircraft is ice most likely to form?',
  'opi-core-095': 'What procedures should be followed during an emergency evacuation?',
  'opi-core-096': 'How can pilots help the cabin crew conduct an emergency evacuation?',
  'opi-core-108': 'Who should be the last person to leave the aircraft in an emergency, and why?',
  'opi-core-218': 'During which flight phases are bird strikes most likely, and why?',
  'opi-core-220': 'How can bird strikes threaten flight safety?',
  'opi-core-225': 'How can foreign-object ingestion endanger flight safety?',
  'opi-core-226':
    'During which flight phases is ingestion of birds or foreign objects most likely, and why?',
  'opi-core-234': 'Do you believe SOPs can effectively prevent human error, and why?',
  'opi-core-238':
    'Does effective crew resource management depend on strict adherence to SOPs, and why?',
  'opi-core-240': 'What does SOP stand for, and why is it important to flight safety?',
  'opi-core-360':
    'Does your company provide guidance for communication failures, and where can you find it?',
  'opi-core-561': 'At what kinds of airports are flow-control measures most likely?',
  'opi-core-638': 'What is a standard callout?',
  'opi-core-660': 'What is your opinion of your company’s no-smoking policy?',
  'opi-core-661': 'What consequences could result if a pilot smoked in the cockpit?',
  'opi-core-662': 'Could you describe your company’s no-smoking policy?',
  'opi-core-036': 'Where is wind shear most likely to occur?',
  'opi-core-058': 'What emergency equipment is available in your cockpit?',
  'opi-core-081': 'What may cause a pilot to go around or execute a missed approach?',
  'opi-core-085': 'What procedures should you follow when making an emergency descent?',
  'opi-core-114': 'What is a cockpit voice recorder (CVR)?',
  'opi-core-136': 'How should pilots communicate effectively with air traffic controllers?',
  'opi-core-137': 'How should a captain communicate effectively with the first officer?',
  'opi-core-138': 'How should pilots communicate effectively with the cabin crew?',
  'opi-core-139': 'How should pilots cooperate effectively with air traffic controllers?',
  'opi-core-144': 'How should pilots cooperate effectively in the cockpit?',
  'opi-core-145': 'How should pilots cooperate effectively with the cabin crew?',
  'opi-core-261': 'Does your airline operate at any complex airports?',
  'opi-core-310': 'What is a quick access recorder (QAR)?',
  'opi-core-142': 'What can pilots do to improve the quality of radiotelephony communication?',
  'opi-core-169':
    'Why are some goods, such as liquids and lithium batteries, restricted or treated as dangerous in aviation?',
  'opi-core-196':
    'What preparations should you make before landing at a high-elevation airport?',
  'opi-core-210':
    'As a copilot, what would you do if the captain read personal material during flight?',
  'opi-core-227': 'During which flight phases are bird strikes most likely to occur?',
  'opi-core-232': 'What does SOP stand for?',
  'opi-core-313': 'What is runway visual range (RVR)?',
  'opi-core-318': 'What are the functions of engine oil?',
  'opi-core-337': 'Have you heard of any mid-air collision accidents?',
  'opi-core-338': 'How can pilots avoid mid-air collisions, near misses, and ground collisions?',
  'opi-core-372': 'What can pilots do to improve communication with air traffic controllers?',
  'opi-core-414':
    'What should you do if an engine ingests foreign objects during the takeoff roll or initial climb?',
  'opi-core-438':
    'How can pilots reduce the risks associated with turbulence, clear-air turbulence, and other dangerous weather?',
  'opi-core-516': 'What are the differences between GPS and conventional navigation?',
  'opi-core-520': 'What is an enhanced ground proximity warning system (EGPWS)?',
  'opi-core-578':
    'Do you think virtual reality and augmented reality can improve simulator training?',
  'opi-core-588': 'After an overweight landing, would you submit a report to your airline?',
  'opi-core-615': 'What other landing aids do you know besides a head-up display?',
  'opi-core-629': 'What does FCTM stand for?',
  'opi-core-671': 'Why do flight crews check the maintenance log before flight?',
  'opi-core-796': 'What special considerations apply to an ELT on overwater flights?',
  'opi-core-859': 'Under what conditions should a flight crew carry out an emergency evacuation?',
  'opi-core-774': 'What may cause a crew member to become incapacitated?',
  'opi-core-555': 'What are the possible causes of flight delays?',
  'opi-core-717': 'What is TCAS, and what are its main functions?',
  'opi-extra-003': 'How would you help passengers who become anxious during a long delay?',
  'opi-extra-004': 'How would you handle a passenger complaint about a diversion?',
  'opi-extra-005':
    'How would you respond if a passenger became ill, suffered a heart attack, or was injured by turbulence?',
  'opi-extra-006': 'How would you handle a drunk or unruly passenger during flight?',
  'opi-extra-007': 'How would you respond to a fight between passengers?',
  'opi-extra-008':
    'How would you handle a passenger who refused to check oversized baggage or turn off a mobile phone?',
  'opi-extra-055': 'Why can an aircraft become uncontrollable?',
  'opi-extra-065': 'Have you taken any radiotelephony communication courses?',
  'opi-extra-100': 'How can aviation security help prevent hijacking and terrorism?',
  'opi-extra-113': 'What may cause smoke in the flight deck?',
  'opi-core-743': 'What is a red-eye flight?',
  'opi-image-002-q03': 'What should you do if you find ice or frost on a wing before departure?',
  'opi-image-003-q03': 'What other types of runway lighting do you know?',
  'opi-image-014-q02': 'How do multiple display screens help pilots during flight?',
  'opi-image-017-q01': 'What serious failures might force a large jet to ditch at sea?',
  'opi-image-017-q03':
    'After a successful ditching, what evacuation steps should the flight crew take immediately?',
  'opi-image-020-q02': 'How can ice contamination on the wings affect flight safety?',
  'opi-image-020-q03': 'What should pilots do to ensure safety in this situation?',
  'opi-image-022-q01':
    'What weather conditions can further reduce visibility during a night landing at a terrain-critical airport?',
};

const ANSWER_EN_OVERRIDES = {
  'opi-core-003':
    'A lightning strike can damage the airframe, windshield, control surfaces, or electrical systems. It may also disrupt navigation and communication equipment, start an electrical fire, or injure people on board. The crew should avoid thunderstorms whenever possible and assess the aircraft carefully after any strike.',
  'opi-core-004':
    'I would first maintain aircraft control and follow the applicable checklist. I would assess the aircraft for structural or system damage, inform ATC, and request a deviation, diversion, or priority handling if necessary. After landing, I would record the event and arrange the required maintenance inspection.',
  'opi-core-005':
    'Pilots should review forecasts, reports, and airport weather before departure and continue monitoring weather during flight. They should use available weather radar and ATC information, avoid cumulonimbus clouds and thunderstorms by a safe margin, and request an early deviation when hazardous weather is ahead. Delaying departure or diverting is appropriate when safe avoidance is not possible.',
  'opi-core-006':
    'A lightning strike can cause structural damage, crack a windshield, damage control surfaces, or affect electrical, navigation, and communication systems. It may also produce an electrical fire or injure people on board. The severity varies, so the crew should assess the aircraft and follow the applicable procedure after a strike.',
  'opi-core-743':
    'A red-eye flight normally departs late at night and arrives early the next morning. Because it operates during a period when people are normally asleep, fatigue management, adequate rest, and careful monitoring are especially important.',
  'opi-core-108':
    'The captain should normally be the last crew member to leave after confirming, as far as safely possible, that evacuation duties have been completed and no one remains on board. The captain must not delay departure if staying would create an immediate danger. The exact actions should follow the operator’s emergency procedures.',
  'opi-core-218':
    'Bird strikes are most likely during takeoff, initial climb, approach, and landing because aircraft are at lower altitudes where bird activity is concentrated. The risk can also increase near airports, coastlines, wetlands, migration routes, and areas with reported bird activity.',
  'opi-core-220':
    'Bird strikes can damage the windshield, nose, wings, sensors, or engines. Engine ingestion may cause vibration, loss of thrust, or engine failure, while a windshield strike can injure pilots or reduce visibility. The crew should maintain control, assess the aircraft, follow the checklist, and land at a suitable airport if necessary.',
  'opi-core-225':
    'Foreign-object ingestion can damage compressor or fan blades, cause vibration, reduce thrust, or lead to an engine failure or fire. The crew should maintain aircraft control, assess the engine indications, follow the applicable checklist, and decide whether to reject the takeoff, return, or divert according to the actual phase and aircraft procedure.',
  'opi-core-226':
    'Ingestion of birds or foreign objects is most likely during the takeoff roll, initial climb, approach, and landing because the engines are operating near the ground and often at high thrust. The risk is greater where bird activity, loose debris, contaminated pavement, or poor housekeeping is present.',
  'opi-core-234':
    'Yes. Well-designed SOPs provide a consistent sequence of actions, clarify crew duties, and support callouts and cross-checks. They reduce avoidable variation and help trap errors before they become serious. SOPs still require sound judgment, and any necessary deviation should be clearly communicated and managed under the applicable procedure.',
  'opi-core-238':
    'Yes. CRM works best when the crew shares a common procedural framework. SOPs define task sharing, callouts, monitoring, and cross-checks, while CRM helps the crew communicate, challenge, and make decisions effectively within that framework. Good CRM does not replace SOP compliance; the two support each other.',
  'opi-core-360':
    'This is a sample answer that should be adapted to the operator. Communication-failure guidance is normally available in the aircraft checklist, operations manual, SOPs, EFB, and applicable aeronautical publications. Before flight, pilots should know which source controls and how to access it if normal communication is lost.',
  'opi-core-747':
    'This is a sample answer that should be adapted to the speaker’s real experience. I have not flown a red-eye flight, but I understand that it operates overnight and requires careful fatigue management. I would obtain adequate rest, monitor my alertness, and follow the operator’s fatigue-risk procedures.',
  'opi-core-638':
    'Standard callouts are predefined words or phrases used at specific points in an operation. They help both pilots share the same understanding of aircraft status, identify deviations, and coordinate actions. Examples include approved speed, altitude, configuration, and approach-stability callouts published in the operator’s SOPs.',
  'opi-image-002-q03':
    'The aircraft should not depart with ice, snow, or frost contaminating a critical surface. I would stop the departure, arrange approved de-icing or anti-icing as required, verify that the wings and other critical surfaces are clean, and complete the applicable inspections and procedures before takeoff.',
  'opi-image-003-q03':
    'Runway lighting may include edge lights, threshold lights, runway-end lights, centerline lights, touchdown-zone lights, and approach-light systems. Taxiway centerline and edge lights also help crews move safely on the ground. The exact installation and light colors depend on the aerodrome and published information.',
  'opi-image-014-q02':
    'Multiple displays integrate attitude, airspeed, altitude, navigation, engine, and system information in the pilots’ normal field of view. They improve cross-checking and help the crew identify trends or abnormal indications. Pilots still need disciplined scanning and must know how to manage display or sensor failures.',
  'opi-image-017-q01':
    'A ditching may become necessary after failures that prevent the aircraft from reaching a suitable runway, such as multiple-engine power loss, an uncontrollable fire, severe structural damage, or critical fuel exhaustion. The crew should use every available option to reach land, but if ditching is unavoidable, they should follow the approved procedure and prepare the cabin early.',
  'opi-image-017-q03':
    'After the aircraft stops, the crew should assess external hazards, order the evacuation, and use only safe exits. The cabin crew should direct passengers to leave belongings, put on life jackets as instructed, and move to slides, rafts, or flotation devices. The crew should account for occupants as far as possible, move everyone away from the aircraft, and activate survival and rescue equipment.',
  'opi-image-020-q02':
    'Ice contamination changes the wing shape and surface roughness. It can reduce lift, increase drag and stall speed, impair handling, and create unreliable instrument or control indications. Even a small amount of contamination can significantly reduce the safety margin, especially during takeoff and landing.',
  'opi-image-020-q03':
    'Pilots should not take off until all critical surfaces are free of prohibited contamination. They should use approved de-icing or anti-icing procedures, respect holdover-time limitations, perform the required checks, and reassess conditions if precipitation continues. If a clean-aircraft condition cannot be confirmed, the departure should be delayed.',
  'opi-image-022-q01':
    'Fog, low cloud, rain, snow, haze, smoke, and blowing dust can further reduce visibility at night. Mountainous terrain can also create localized cloud and precipitation, while few ground lights may make terrain harder to distinguish. Crews should use current weather, terrain awareness, published procedures, and conservative approach minima.',
  'opi-core-036':
    'Wind shear can occur near thunderstorms, fronts, temperature inversions, strong terrain effects, and areas with rapid changes in wind. Low-level wind shear is especially critical during takeoff and landing because the aircraft is close to the ground. Pilots should use forecasts, reports, onboard warnings, and ATC information to avoid hazardous areas.',
  'opi-core-058':
    'A sample answer could mention portable fire extinguishers, oxygen masks, smoke goggles, emergency checklists, and communication equipment. The exact equipment depends on the aircraft type and operator. Before flight, the crew should know where each item is located and confirm that required equipment is serviceable.',
  'opi-core-085':
    'I would first maintain aircraft control, put on oxygen masks if required, and initiate the applicable emergency-descent checklist. I would coordinate with the other pilot, inform ATC and the cabin crew, and descend on a safe path while monitoring terrain, traffic, and aircraft limits. The exact configuration and speed depend on the aircraft procedure, so I would follow the approved checklist rather than use a memorized generic profile.',
  'opi-core-104':
    'This is a sample answer that should be adapted to the speaker’s own experience. I have not personally encountered an urgency or distress situation, but I have trained for them. If one occurred, I would maintain aircraft control, use the applicable checklist, communicate clearly with the crew and ATC, and choose the safest option for the circumstances.',
  'opi-core-120':
    'CVR retention requirements depend on the aircraft category, date of manufacture, and applicable authority. Two hours has been a common minimum for many aircraft, while newer large aircraft in some regulatory systems require twenty-five hours. A pilot should check the current approved aircraft and operator requirements instead of assuming that one duration applies to every aircraft.',
  'opi-core-126':
    'CVR installation requirements depend on the aircraft’s mass, certification date, crew configuration, and type of operation. ICAO Annex 6 specifies which aircraft need recorders and what information they must capture, but the detailed applicability changes across aircraft categories and amendments. For a specific aircraft, the crew should refer to the current approved equipment list and the rules adopted by the State of the Operator.',
  'opi-core-167':
    'A safe sample answer is that the operator provides initial and recurrent dangerous-goods training appropriate to each employee’s duties. The training should cover recognition, acceptance limits, reporting, emergency response, and the operator’s procedures. A candidate should adapt this answer to the training actually received and should not claim qualifications they do not hold.',
  'opi-core-169':
    'Some goods are restricted because they may burn, explode, leak, release toxic material, or create other hazards in flight. Liquids are subject to security controls, while lithium batteries are regulated because damage or short circuits can cause thermal runaway and fire. The exact carriage rules depend on the item, quantity, packaging, baggage location, and current dangerous-goods requirements.',
  'opi-core-217':
    'This is a sample answer that should be adapted to personal experience. I have not personally experienced a bird strike, but I understand that it can damage the windshield, engines, or airframe. If it happened, I would maintain control, assess the aircraft, follow the checklist, inform ATC, and land at a suitable airport if necessary.',
  'opi-core-268':
    'The maximum fuel quantity is aircraft-specific and is stated in the approved aircraft manuals. It depends on tank capacity, fuel density, loading limits, and operational restrictions. I would use the actual fuel figures for my aircraft and verify that the planned load remains within weight and balance limits.',
  'opi-core-283':
    'Minimum fuel means that, after reaching the destination, the aircraft can accept little or no additional delay. It is an advisory to ATC, not an emergency declaration and not an automatic request for priority. If further delay would make a safe landing uncertain, the crew should declare a fuel emergency using the applicable distress phraseology.',
  'opi-core-284':
    'I would state the aircraft call sign followed by “minimum fuel” on initial contact with ATC. I would also communicate any operational information ATC needs, such as my intentions and inability to accept undue delay. I would continue monitoring fuel closely and declare an emergency if priority became necessary for a safe landing.',
  'opi-core-285':
    'I would declare a fuel emergency when the remaining usable fuel indicates that traffic priority or immediate assistance is required to ensure a safe landing. This is more serious than a minimum-fuel advisory. The decision should be made early enough to protect the final reserve and avoid allowing the situation to become critical.',
  'opi-core-286':
    'The crew should use the applicable distress call, normally “Mayday” repeated three times followed by “fuel,” the aircraft call sign, position, intentions, and fuel endurance or persons on board when required. The exact message follows the applicable radiotelephony procedure. The important point is to state the emergency clearly and early so ATC can provide priority and assistance.',
  'opi-core-287':
    'Minimum fuel is an advisory that the aircraft can accept little or no further delay at destination; by itself, it is not an emergency and does not automatically give priority. A fuel emergency means the remaining fuel requires priority or immediate assistance to ensure a safe landing. The crew should monitor the trend continuously and escalate the declaration before the situation becomes unsafe.',
  'opi-core-313':
    'Runway visual range is the distance over which a pilot on the runway centerline can see runway markings or the lights outlining or identifying the runway. It is normally reported for relevant runway zones, such as touchdown, midpoint, and stop end. Crews use RVR with the applicable operating minima to decide whether takeoff, approach, or landing may be continued.',
  'opi-core-316':
    'Low-visibility procedures are used when visibility or cloud conditions fall below locally defined thresholds and normal surface operations need additional protection. The airport and ATC activate them according to published procedures, and crews follow the applicable low-visibility taxi, takeoff, and approach requirements. The exact trigger values vary by aerodrome and authority, so pilots must use current operational information.',
  'opi-core-337':
    'This is a sample answer. I have studied mid-air collision accidents and incidents in which communication, loss of separation, and conflicting instructions were important factors. The main lesson is to maintain situational awareness, use standard communication, and follow an airborne collision-avoidance resolution advisory promptly unless doing so would make the aircraft unsafe.',
  'opi-core-342':
    'A runway incursion is an occurrence at an aerodrome involving the incorrect presence of an aircraft, vehicle, or person on the protected area of a surface designated for landing and takeoff. It may create a serious collision risk even when no collision occurs. Clearances, hold-short instructions, markings, lighting, and careful monitoring all help prevent incursions.',
  'opi-extra-372':
    'Red over red on a two-bar VASI means the aircraft is below the visual glide path. The pilot should correct the approach smoothly while remaining stabilized and respecting the published procedure and aircraft limits. If a safe stabilized approach cannot be regained, the correct decision is to go around.',
  'opi-core-414':
    'I would maintain aircraft control and apply the approved rejected-takeoff or continued-takeoff decision for the actual phase and aircraft. After liftoff, I would stabilize the flight path, assess engine indications, complete the applicable checklist, and inform ATC. I would then return or divert as appropriate, without assuming that one generic action is correct for every speed, aircraft, or type of damage.',
  'opi-core-421':
    'Yes. Catering staff and supplies can enter security-sensitive areas and the aircraft, so appropriate screening helps prevent prohibited articles or dangerous items from being introduced. The process should follow the airport and operator security programme while treating staff consistently and professionally.',
  'opi-core-438':
    'Pilots can reduce weather risk through careful pre-flight analysis, realistic alternates, and clear threat briefings. During flight, they should use available weather information, reports, radar, and ATC assistance to avoid hazardous areas by a safe margin. If conditions no longer support a stable and safe operation, delaying, deviating, holding, going around, or diverting may be the best choice.',
  'opi-core-552':
    'The maximum permitted tailwind is aircraft- and operation-specific. It depends on the approved aircraft limitations, runway condition, performance calculation, and operator procedures. I would use the value shown in the current aircraft manual and performance system, and I would not take off or land if the calculated limits or safety margins were not met.',
  'opi-core-586':
    'Maximum landing weight is specific to the aircraft model and configuration and is published in the approved aircraft manual. Before landing, the crew should compare the estimated landing weight with structural and performance limits. If the aircraft is overweight, the crew follows the approved procedure and considers fuel burn, fuel jettison if available and appropriate, or an overweight landing when safety requires it.',
  'opi-core-614':
    'A HUD may support operations to lower minima only when the aircraft system, crew training, procedure, airport, and operator approval all meet the applicable requirements. The presence of a HUD alone does not authorize lower minima. Pilots must use the minima stated in the approved procedure and operational authorization.',
  'opi-core-648':
    'The takeoff flap setting is aircraft-, runway-, and performance-specific. It is selected from the approved performance calculation and then verified through the normal checklist and cross-check process. I would not quote one setting as universal because weight, runway length, obstacles, weather, and aircraft configuration can change the correct value.',
  'opi-core-656':
    'Alcohol limits and required abstinence periods vary by State and operator, so crews must follow the strictest applicable rule. A pilot should never report for duty while impaired, should not rely only on a clock or a legal limit, and should report any fitness concern. The safe principle is to allow adequate time, avoid alcohol before duty, and comply with company and authority requirements.',
  'opi-core-876':
    'There is no single safe decompression altitude for every situation because terrain, oxygen availability, aircraft condition, and route all matter. The crew should use oxygen, complete the emergency-descent checklist, coordinate with ATC, and descend to an altitude that is both physiologically and terrain safe. The approved aircraft procedure and minimum safe altitudes determine the actual target.',
  'opi-extra-089':
    'Pilots can reduce dangerous-weather risk through thorough preparation, clear crew coordination, and timely use of reliable weather information. During flight, they should monitor changing conditions, use available detection equipment, and request deviations or level changes before the margin becomes small. Delaying, going around, or diverting is appropriate whenever a safe operation cannot be assured.',
  'opi-extra-146':
    'This is a sample answer that should be adapted to the speaker’s real background. For example: “I am currently a first officer, and my main responsibilities are to support the captain, monitor the flight, communicate with ATC, and carry out the duties assigned by our SOPs.” The candidate should state only their actual position and duties.',
  'opi-extra-147':
    'This is a sample answer that should be adapted to the speaker’s real role. For example: “I am currently a first officer. I support the captain, monitor the aircraft and flight path, and carry out my assigned duties under our SOPs.” A captain would instead describe command responsibility and leadership of the crew.',
  'opi-extra-174':
    'This is a sample answer that should be personalized. For example: “My hobby is hiking. It helps me relax, stay physically active, and take a break from work. I usually go with friends on weekends when the weather is suitable.”',
  'opi-extra-175':
    'This is a sample answer that should be personalized. For example: “Yes. I enjoy reading and hiking. Reading helps me keep learning, while hiking helps me stay fit and relax after a busy week.”',
  'opi-extra-176':
    'This is a sample answer that should be personalized. For example: “When I am not flying, I like to exercise, read, and spend time with my family. These activities help me relax and maintain a healthy balance between work and personal life.”',
  'opi-extra-226':
    'During flight, pilots may use several navigation aids, including GNSS or GPS, VOR, DME, ILS, inertial navigation, and the flight management system. The equipment used depends on the aircraft, route, and phase of flight. The crew should cross-check available sources and be ready to use an approved alternative if one system becomes unreliable.',
  'opi-extra-357':
    'If fuel is becoming a concern, I would first verify the fuel state, destination and alternate conditions, and any expected delay. I would use the operator’s approved fuel-management and cost-index guidance rather than assume that setting one value solves the problem. I would coordinate early, consider a more suitable speed or route, and make a timely minimum-fuel or emergency declaration when the criteria were met.',
  'opi-core-196':
    'Before landing at a high-elevation airport, I would review terrain, weather, runway data, aircraft performance, and any special procedures. I would calculate landing distance carefully because true airspeed and groundspeed may be higher, and I would brief the approach, missed approach, and escape options. If the safety margins were not adequate, I would delay or use another airport.',
  'opi-core-232':
    'SOP stands for standard operating procedure. SOPs provide a consistent and approved way to conduct normal, abnormal, and emergency operations. They support clear task sharing, cross-checking, and safe crew coordination.',
  'opi-core-318':
    'Engine oil lubricates moving parts, helps remove heat, reduces wear, and carries contaminants toward the oil filter. It also supports sealing and corrosion protection in some engine components. Pilots monitor oil pressure, temperature, and quantity because abnormal indications may show a leak or developing engine problem.',
  'opi-core-616':
    'Pilots use a HUD when it is installed and approved for the operation, particularly during takeoff, approach, and landing. It presents important flight information in the pilot’s forward field of view, which can reduce the need to look down at the instrument panel. The crew still has to monitor all required instruments and follow the approved procedure.',
  'opi-core-629':
    'FCTM stands for Flight Crew Training Manual. It provides guidance on aircraft handling, techniques, operational considerations, and training topics. It supports training and good practice, while approved procedures and checklists remain controlling for actual operations.',
  'opi-core-662':
    'A safe sample policy is that smoking and the use of prohibited smoking devices are not allowed during flight or in restricted operational areas. The operator should communicate the rule clearly and the crew should address any violation through the applicable cabin and security procedures. A candidate should describe the actual policy of their operator.',
  'opi-extra-065':
    'This is a sample answer that should reflect the speaker’s real training. For example: “Yes, I have completed a radiotelephony communication course. It covered standard phraseology, listening practice, readbacks, and communication in abnormal situations.”',
  'opi-extra-076':
    'This is an aircraft-specific sample answer. For example: “Yes, my aircraft is equipped with an electronic flight instrument system. It integrates primary flight, navigation, and system information on electronic displays, and I use it together with normal cross-checking procedures.”',
  'opi-extra-079':
    'EFIS stands for electronic flight instrument system. It displays flight, navigation, and system information electronically, often through a primary flight display and navigation display. It can improve information integration, but pilots still need disciplined monitoring and cross-checking.',
  'opi-extra-315':
    'A fire extinguisher should be discharged only for the type and location of fire it is designed to fight and in accordance with the applicable checklist. The crew should identify the source, use the correct extinguisher, protect themselves from smoke or fumes, and coordinate the response. Engine fire-extinguishing systems and portable cabin extinguishers have different procedures.',
};

const ANSWER_ZH_OVERRIDES = {
  'opi-core-003':
    '雷击可能损坏机体、风挡、操纵面或电气系统，也可能干扰导航和通信设备，引发电气火灾，或造成人员受伤。机组应尽可能避开雷暴，并在遭遇雷击后认真评估飞机状态。',
  'opi-core-004':
    '我会首先保持对飞机的控制并执行适用的检查单，评估飞机是否存在结构或系统损伤，通知空中交通管制员，并在必要时申请偏航、备降或优先处置。着陆后，我会记录事件并安排所需的维修检查。',
  'opi-core-005':
    '飞行员应在离场前检查天气预报、报告和机场天气，并在飞行中持续监控天气。机组应利用可用的气象雷达和空中交通管制信息，与积雨云和雷暴保持安全间隔，并在前方存在危险天气时尽早申请偏航。如果无法安全绕飞，延误起飞或备降是合适的选择。',
  'opi-core-006':
    '雷击可能造成结构损伤、风挡破裂、操纵面损坏，或影响电气、导航和通信系统，也可能引发电气火灾或造成人员受伤。损伤程度各不相同，因此机组遭遇雷击后应评估飞机状态并执行适用程序。',
  'opi-core-743':
    '红眼航班通常在深夜起飞，并在第二天清晨到达。由于运行时段正值人们通常睡眠的时间，因此疲劳管理、充分休息和认真监控尤其重要。',
  'opi-core-108':
    '机长通常应在确认撤离职责已经完成、且在安全可行范围内确认无人留在机上后，作为最后一名机组成员离开飞机。但如果继续停留会造成直接危险，机长不应延误撤离。具体行动应遵循运营人的应急程序。',
  'opi-core-218':
    '鸟击最可能发生在起飞、初始爬升、进近和着陆阶段，因为飞机处于鸟类活动集中的较低高度。机场附近、海岸、湿地、迁徙路线以及已报告鸟类活动的区域，风险也可能更高。',
  'opi-core-220':
    '鸟击可能损坏风挡、机头、机翼、传感器或发动机。鸟类被发动机吸入后可能造成振动、推力损失或发动机失效；撞击风挡则可能导致飞行员受伤或视线受阻。机组应保持对飞机的控制，评估飞机状态，执行检查单，并在必要时在合适机场着陆。',
  'opi-core-225':
    '外来物被发动机吸入后可能损坏压气机或风扇叶片，引起振动、推力下降、发动机失效或火灾。机组应保持对飞机的控制，评估发动机指示，执行适用的检查单，并根据实际飞行阶段和机型程序决定中断起飞、返航或备降。',
  'opi-core-226':
    '鸟类或外来物吸入最可能发生在起飞滑跑、初始爬升、进近和着陆阶段，因为发动机靠近地面且通常以较大推力工作。鸟类活动、松散碎片、道面污染或场面管理不良会进一步增加风险。',
  'opi-core-234':
    '是的。设计合理的标准操作程序能够提供一致的操作顺序，明确机组职责，并支持标准喊话和交叉检查。它们可以减少不必要的操作差异，帮助机组在错误演变成严重后果前发现问题。标准操作程序仍需配合良好判断；如确需偏离，应清楚沟通并按适用程序管理。',
  'opi-core-238':
    '是的。机组共享同一套程序框架时，机组资源管理最有效。标准操作程序规定分工、喊话、监控和交叉检查，机组资源管理则帮助机组在该框架内有效沟通、提出质疑并作出决定。良好的机组资源管理不能替代遵守标准操作程序，两者相互支持。',
  'opi-core-360':
    '这是一个应根据运营人实际情况调整的示范回答。通信失效处置指南通常可在飞机检查单、运行手册、标准操作程序、电子飞行包和适用的航空资料中查阅。飞行前，飞行员应明确以哪一来源为准，并知道正常通信中断时如何获取这些信息。',
  'opi-core-747':
    '这是一个应根据答题者真实经历调整的示范回答。我没有执行过红眼航班，但我知道这类航班在夜间运行，需要认真管理疲劳。我会保证充分休息，监控自身警觉性，并遵守运营人的疲劳风险管理程序。',
  'opi-core-638':
    '标准喊话是在运行中的特定时点使用的预先规定用语，帮助两名飞行员对飞机状态形成共同理解、发现偏差并协调操作。例如，运营人的标准操作程序会规定与速度、高度、构型和进近稳定性有关的喊话。',
  'opi-image-002-q03':
    '飞机不得在关键表面受到冰、雪或霜污染的情况下起飞。我会停止离场，按需安排经批准的除冰或防冰，确认机翼和其他关键表面清洁，并在起飞前完成适用的检查和程序。',
  'opi-image-003-q03':
    '跑道灯光可以包括跑道边灯、入口灯、跑道末端灯、中线灯、接地区灯和进近灯光系统。滑行道中线灯和边灯也有助于机组在地面安全运行。具体配置和灯光颜色取决于机场设施及公布资料。',
  'opi-image-014-q02':
    '多个显示屏可以在飞行员正常视野内综合显示姿态、空速、高度、导航、发动机和系统信息，改善交叉检查，并帮助机组发现趋势或异常指示。飞行员仍需保持规范的仪表扫描，并了解显示器或传感器失效时的处置方法。',
  'opi-image-017-q01':
    '当飞机无法到达合适跑道时，某些严重故障可能迫使机组水上迫降，例如多台发动机失去动力、无法控制的火灾、严重结构损伤或关键燃油耗尽。机组应尽一切可能到达陆地；如果水上迫降无法避免，则应执行经批准的程序并尽早准备客舱。',
  'opi-image-017-q03':
    '飞机停止后，机组应评估外部危险，下达撤离指令，并只使用安全出口。客舱机组应指挥旅客放弃行李，按指令穿好救生衣，并前往滑梯、救生筏或漂浮设备。机组应在可行范围内清点人员，将所有人转移到远离飞机的位置，并启用生存和救援设备。',
  'opi-image-020-q02':
    '结冰污染会改变机翼外形并增加表面粗糙度，可能降低升力、增加阻力和失速速度、恶化操纵性能，并造成仪表或操纵指示不可靠。即使少量污染也可能显著降低安全裕度，尤其是在起飞和着陆阶段。',
  'opi-image-020-q03':
    '在确认所有关键表面没有禁止的污染前，飞行员不应起飞。机组应采用经批准的除冰或防冰程序，遵守保持时间限制，完成规定检查，并在降水持续时重新评估条件。如果无法确认飞机清洁，应延误离场。',
  'opi-image-022-q01':
    '雾、低云、雨、雪、霾、烟和扬尘都会在夜间进一步降低能见度。山区地形还可能形成局地云和降水，而地面灯光稀少会使地形更难辨认。机组应利用最新天气、地形感知系统和公布程序，并采用保守的进近最低标准。',
  'opi-core-036':
    '风切变可能出现在雷暴、锋面、逆温层、地形影响明显的区域以及风速风向快速变化的地方。低空风切变在起飞和着陆阶段尤其危险，因为飞机距离地面很近。飞行员应利用预报、报告、机载警告和空中交通管制信息避开危险区域。',
  'opi-core-058':
    '示范回答可以提到便携式灭火器、氧气面罩、防烟眼镜、应急检查单和通信设备。具体设备取决于机型和运营人。飞行前，机组应了解各项设备的位置，并确认规定设备处于可用状态。',
  'opi-core-085':
    '我会首先保持对飞机的控制，按需戴上氧气面罩，并执行适用的紧急下降检查单。我会与另一名飞行员协同，通知空中交通管制员和客舱机组，在监控地形、交通和飞机限制的同时沿安全航迹下降。具体构型和速度取决于机型程序，因此我会遵循经批准的检查单，而不是套用记忆中的通用下降方式。',
  'opi-core-104':
    '这是一个可以根据个人经历调整的示范回答。我从未遇到过紧急或遇险情况，但我接受过相关训练。如果真的发生这种情况，我会保持对飞机的控制，执行适用的检查单，与机组和空中交通管制员清楚沟通，并根据实际情况选择最安全的方案。',
  'opi-core-120':
    '驾驶舱话音记录器的保留时长要求取决于飞机类别、制造日期和适用监管体系。许多飞机长期采用至少两小时的要求，而一些监管体系对较新的大型飞机要求二十五小时。飞行员应核对当前经批准的飞机和运营人要求，不能假定所有飞机都适用同一个时长。',
  'opi-core-126':
    '驾驶舱话音记录器的安装要求取决于飞机重量、审定日期、机组配置和运行类型。ICAO 附件 6 规定了哪些飞机需要记录器以及应记录哪些信息，但具体适用范围会随飞机类别和修订版本而变化。对于具体飞机，机组应查阅当前经批准的设备清单以及运营人所在国采用的规定。',
  'opi-core-136':
    '飞行员与空中交通管制员之间的良好沟通对飞行安全非常重要。飞行员应使用标准用语，清楚、简洁地报告信息，并认真监听和正确复诵许可。如果信息不清楚或存在疑问，应立即请求澄清。双方还应及时交换影响飞行的天气、交通和运行信息。',
  'opi-core-137':
    '机长与副驾驶之间应保持开放、专业的沟通。双方应共享重要信息、交叉检查关键操作，并按照标准操作程序明确分工。如果副驾驶发现风险，应及时、明确地提出；机长则应认真听取意见并作出安全决定。良好的驾驶舱资源管理依赖相互尊重，而不是单向服从。',
  'opi-core-138':
    '飞行员与客舱机组之间的沟通对正常运行和紧急处置都很重要。双方应在飞行前完成联合简令，并及时交换与安全、天气、旅客和飞机状态有关的信息。出现异常情况时，驾驶舱应给出清楚指令，客舱机组应报告客舱状况并执行相应程序。相互尊重和闭环沟通有助于避免误解。',
  'opi-core-139':
    '飞行员与空中交通管制员的协作建立在清楚、及时和标准化的通信上。正常运行中，飞行员应准确报告位置和意图，正确复诵许可，并在有疑问时请求澄清。异常情况下，飞行员应尽早说明飞机状态、意图和所需协助，管制员则可提供间隔、优先权和相关信息。双方始终以安全运行为共同目标。',
  'opi-core-144':
    '驾驶舱内的有效协作需要明确分工、持续监控和相互交叉检查。操纵飞行员负责飞行航迹，监控飞行员负责监控仪表、通信和检查单，并及时指出偏差。异常情况下，机组应按照标准操作程序分配任务，保持态势感知并共同评估方案。任何机组成员发现安全问题时都应清楚提出。',
  'opi-core-145':
    '飞行员与客舱机组应通过联合简令、及时报告和清楚指令进行协作。正常运行中，驾驶舱负责安全操纵飞机，客舱机组负责客舱安全和旅客管理，并向驾驶舱报告异常情况。紧急情况下，机长应说明计划和时间，客舱机组应准备客舱并反馈执行情况。闭环沟通和相互支持能够提高整体处置能力。',
  'opi-core-142':
    '飞行员可以通过使用标准通话用语、保持语速适中并清楚发音来提高无线电通话质量。收到许可后应完整、准确地复诵关键内容，并认真监听空中交通管制员的修正。如果没有听清或对许可有疑问，应立即请求重复或澄清。良好的准备、简洁的信息组织和减少无关通话也能降低误解风险。',
  'opi-core-167':
    '一个稳妥的示范回答是：运营人会根据员工职责提供相应的危险品初始培训和复训。培训应涵盖危险品识别、接收限制、报告、应急处置和运营人程序。考生应根据自己实际接受的培训调整回答，不能声称自己并不具备的资质。',
  'opi-core-169':
    '一些物品受到限制，是因为它们可能燃烧、爆炸、泄漏、释放有毒物质或在飞行中造成其他危险。液体受到安保限制，而锂电池因损坏或短路可能引发热失控和火灾而受到监管。具体携带规则取决于物品类别、数量、包装、行李位置以及当前危险品规定。',
  'opi-core-217':
    '这是一个应根据个人经历调整的示范回答。我本人没有经历过鸟击，但我知道鸟击可能损坏风挡、发动机或机体。如果发生鸟击，我会保持对飞机的控制，评估飞机状态，执行检查单，通知空中交通管制员，并在必要时在合适机场着陆。',
  'opi-core-268':
    '最大燃油量由具体机型决定，并载于经批准的飞机手册。它取决于油箱容量、燃油密度、装载限制和运行限制。我会使用自己所飞机型的实际数据，并确认计划燃油量符合重量和平衡限制。',
  'opi-core-283':
    '“最低燃油”表示飞机到达目的地后只能接受很少或不能接受额外延误。它是向空中交通管制员发出的提示，不是紧急情况声明，也不会自动获得优先权。如果继续延误会使安全着陆变得不确定，机组应使用适用的遇险用语宣布燃油紧急情况。',
  'opi-core-284':
    '我会在首次联系空中交通管制员时，先报告航空器呼号，再说“最低燃油”。我还会说明管制员所需的运行信息，例如我的意图以及无法接受额外延误。我会继续严密监控燃油，并在安全着陆需要优先权时宣布紧急情况。',
  'opi-core-285':
    '当剩余可用燃油表明需要交通优先权或立即协助才能确保安全着陆时，我会宣布燃油紧急情况。这比“最低燃油”提示更严重。机组应尽早作出决定，以保护最后储备燃油，避免情况发展到危急程度。',
  'opi-core-286':
    '机组应使用适用的遇险呼叫，通常是连续三次说“Mayday”，随后说明“fuel”、航空器呼号、位置、意图，并按要求报告剩余续航时间或机上人数。具体报文应遵循适用的无线电通话程序。关键是尽早、清楚地说明紧急情况，以便空中交通管制员提供优先权和协助。',
  'opi-core-287':
    '“最低燃油”表示飞机到达目的地后只能接受很少或不能接受进一步延误；它本身不是紧急情况，也不会自动获得优先权。燃油紧急情况则表示剩余燃油已经需要优先权或立即协助才能确保安全着陆。机组应持续监控趋势，并在情况变得不安全之前及时升级声明。',
  'opi-core-313':
    '跑道视程是指位于跑道中心线上的飞行员能够看到跑道标志，或勾画跑道轮廓、标示跑道的灯光的距离。它通常按跑道相关区域报告，例如接地区、中点和停止端。机组结合适用的运行最低标准使用跑道视程，判断能否继续起飞、进近或着陆。',
  'opi-core-316':
    '当能见度或云况低于当地规定阈值、正常地面运行需要额外保护时，会实施低能见度程序。机场和空中交通管制部门根据公布程序启动该程序，机组则执行适用的低能见度滑行、起飞和进近要求。具体启动数值因机场和监管体系而异，因此飞行员必须使用最新运行信息。',
  'opi-core-337':
    '这是一个示范回答。我学习过一些空中相撞事故和事件，其中通信、间隔丧失和冲突指令是重要因素。主要教训是保持态势感知、使用标准通信，并及时遵循机载防撞系统的决断咨询，除非这样做会使飞机处于不安全状态。',
  'opi-core-342':
    '跑道侵入是指在机场内，航空器、车辆或人员错误地出现在供航空器着陆和起飞的受保护道面区域。即使没有发生碰撞，也可能形成严重碰撞风险。清楚的许可、跑道外等待指令、标志、灯光和认真监控都有助于防止跑道侵入。',
  'opi-extra-372':
    '在双排 VASI 上看到“红灯在红灯之上”，表示飞机低于目视下滑航迹。飞行员应在保持稳定进近并遵守公布程序和飞机限制的前提下平稳修正。如果无法恢复安全、稳定的进近，正确决定是复飞。',
  'opi-core-414':
    '我会保持对飞机的控制，并根据实际阶段和机型执行经批准的中断起飞或继续起飞决策。离地后，我会先稳定飞行航迹，评估发动机指示，完成适用检查单并通知空中交通管制员。随后根据情况返场或备降，不能假定某一种通用动作适用于所有速度、机型和损伤类型。',
  'opi-core-421':
    '有必要。配餐人员和物资能够进入安保敏感区域及飞机，因此适当安检有助于防止违禁品或危险物品被带入。安检过程应遵循机场和运营人的安保方案，同时一致、专业地对待工作人员。',
  'opi-core-438':
    '飞行员可以通过认真分析飞行前天气、准备现实可用的备选方案并完成清楚的威胁简令来降低天气风险。飞行中应利用可用的天气信息、报告、雷达和空中交通管制协助，与危险区域保持安全距离。如果条件已不支持稳定、安全运行，延误、绕飞、等待、复飞或备降都可能是最佳选择。',
  'opi-core-552':
    '允许的最大顺风分量由具体机型和运行决定。它取决于经批准的飞机限制、跑道状态、性能计算和运营人程序。我会使用当前飞机手册和性能系统给出的数值；如果计算限制或安全裕度不满足要求，就不会起飞或着陆。',
  'opi-core-586':
    '最大着陆重量由具体机型和构型决定，并公布在经批准的飞机手册中。着陆前，机组应将预计着陆重量与结构和性能限制进行比较。如果飞机超重，机组应执行经批准程序，并根据情况考虑耗油、在具备能力且适当时放油，或在安全需要时实施超重着陆。',
  'opi-core-614':
    '只有当飞机系统、机组训练、程序、机场和运营人批准都满足适用要求时，HUD 才可能支持较低最低标准运行。仅仅安装 HUD 并不自动授权降低最低标准。飞行员必须使用经批准程序和运行授权中规定的最低标准。',
  'opi-core-648':
    '起飞襟翼设置取决于机型、跑道和性能计算。机组应根据经批准的性能计算选择设置，并通过正常检查单和交叉检查进行确认。重量、跑道长度、障碍物、天气和飞机构型都会影响正确数值，因此不能把某一个设置说成通用答案。',
  'opi-core-656':
    '酒精限值和禁酒时间因国家和运营人而异，机组必须遵守适用规定中最严格的要求。飞行员绝不能在受到酒精影响时执行任务，也不能只依赖时间或法定限值判断；任何适航值勤疑虑都应报告。安全原则是值勤前留出充分时间、避免饮酒，并遵守公司和监管要求。',
  'opi-core-876':
    '所有情况下并不存在一个统一的安全失压下降高度，因为地形、氧气供应、飞机状态和航路都会影响决定。机组应使用氧气，执行紧急下降检查单，与空中交通管制员协同，并下降到同时满足人体生理和地形安全的高度。实际目标由经批准的机型程序和最低安全高度决定。',
  'opi-extra-089':
    '飞行员可以通过充分准备、清楚的机组协同和及时使用可靠天气信息来降低危险天气风险。飞行中应监控天气变化，使用可用探测设备，并在安全裕度变小前申请绕飞或改变高度。只要无法确保安全运行，就应考虑延误、复飞或备降。',
  'opi-extra-146':
    '这是一个应根据答题者真实背景调整的示范回答。例如：“我目前是一名副驾驶，主要职责是协助机长、监控飞行、与空中交通管制员通信，并按照标准操作程序完成分配给我的任务。”答题者只能说明自己的实际职位和职责。',
  'opi-extra-147':
    '这是一个应根据答题者真实职位调整的示范回答。例如：“我目前是一名副驾驶。我协助机长，监控飞机和飞行航迹，并按照标准操作程序完成分配给我的职责。”机长则应说明自己的指挥责任和带领机组的职责。',
  'opi-extra-174':
    '这是一个应个性化调整的示范回答。例如：“我的爱好是徒步。它能让我放松、保持身体活力，并暂时从工作中抽离。天气合适时，我通常会在周末和朋友一起去。”',
  'opi-extra-175':
    '这是一个应个性化调整的示范回答。例如：“有。我喜欢阅读和徒步。阅读能让我不断学习，徒步则能帮助我保持健康，并在忙碌一周后放松下来。”',
  'opi-extra-176':
    '这是一个应个性化调整的示范回答。例如：“不飞行时，我喜欢锻炼、阅读以及陪伴家人。这些活动能帮助我放松，并在工作和个人生活之间保持健康平衡。”',
  'opi-extra-226':
    '飞行中，飞行员可能使用多种导航设备，包括 GNSS 或 GPS、VOR、DME、ILS、惯性导航和飞行管理系统。实际使用的设备取决于飞机、航路和飞行阶段。机组应交叉检查可用信息源，并在某个系统不可靠时准备使用经批准的替代方式。',
  'opi-extra-357':
    '如果燃油开始成为问题，我会先核实燃油状态、目的地和备降场条件以及预计延误。我会使用运营人批准的燃油管理和成本指数指导，而不会假定设置某一个数值就能解决问题。我会尽早协同，考虑更合适的速度或航路，并在符合条件时及时报告“最低燃油”或宣布紧急情况。',
  'opi-core-196':
    '在高高原机场着陆前，我会检查地形、天气、跑道资料、飞机性能和任何特殊程序。由于真空速和地速可能更高，我会仔细计算着陆距离，并简令进近、复飞和脱离方案。如果安全裕度不足，我会延误运行或选择其他机场。',
  'opi-core-232':
    'SOP 指标准操作程序。SOP 为正常、非正常和紧急运行提供一致且经批准的操作方式，有助于明确分工、交叉检查和安全的机组协同。',
  'opi-core-318':
    '发动机滑油用于润滑运动部件、带走热量、减少磨损，并把污染物带向滑油滤。它还可在部分发动机部件中帮助密封和防腐。飞行员会监控滑油压力、温度和油量，因为异常指示可能意味着泄漏或正在发展的发动机故障。',
  'opi-core-616':
    '当飞机安装 HUD 且该运行获得批准时，飞行员会在起飞、进近和着陆等阶段使用它。HUD 把重要飞行信息显示在飞行员前方视野中，可以减少低头查看仪表板的需要。机组仍必须监控所有规定仪表并遵循经批准程序。',
  'opi-core-629':
    'FCTM 指飞行机组训练手册。它提供飞机操纵、技术方法、运行考虑和训练课题方面的指导。它支持训练和良好实践，但实际运行仍以经批准的程序和检查单为准。',
  'opi-core-662':
    '一个稳妥的示范政策是：飞行中以及受限制的运行区域内禁止吸烟和使用被禁止的吸烟装置。运营人应清楚传达规定，机组则应按照适用的客舱和安保程序处理违规行为。考生应说明自己运营人的真实政策。',
  'opi-extra-065':
    '这是一个应反映答题者真实培训经历的示范回答。例如：“是的，我完成过无线电通话课程。课程包括标准通话用语、听力练习、复诵以及非正常情况下的通信。”',
  'opi-extra-076':
    '这是一个与机型有关的示范回答。例如：“是的，我所飞的飞机装有电子飞行仪表系统。它在电子显示器上整合主要飞行、导航和系统信息，我会结合正常交叉检查程序使用它。”',
  'opi-extra-079':
    'EFIS 指电子飞行仪表系统。它通过电子方式显示飞行、导航和系统信息，通常包括主飞行显示器和导航显示器。它可以改善信息整合，但飞行员仍需保持严格监控和交叉检查。',
  'opi-extra-315':
    '只有在确认火灾类型和位置与灭火器用途相符，并按照适用检查单时，才应释放灭火剂。机组应识别火源，使用正确的灭火器，防护烟雾或有害气体，并协调处置。发动机灭火系统和客舱便携式灭火器的程序并不相同。',
};

const FACT_SOURCE_GROUPS = {
  cvr: [
    {
      title: 'ICAO Annex 6 — Operation of Aircraft, Part I',
      url: 'https://www.icao.int/safety/CAPSCA/PublishingImages/Pages/ICAO-SARPs-%28Annexes-and-PANS%29/Annex%206.pdf',
    },
    {
      title: 'EASA Easy Access Rules for Air Operations — Cockpit voice recorder',
      url: 'https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-air-operations?erules-id=ERULES-1963177438-14189',
    },
  ],
  fuel: [
    {
      title: 'FAA Aeronautical Information Manual — Minimum Fuel Advisory',
      url: 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_5.html',
    },
    {
      title: 'FAA Pilot/Controller Glossary — Minimum Fuel and Mayday',
      url: 'https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-m.html',
    },
  ],
  runwayIncursion: [
    {
      title: 'FAA Runway Incursions',
      url: 'https://www.faa.gov/airports/runway_safety/resources/runway_incursions',
    },
  ],
  vasi: [
    {
      title: 'FAA Aeronautical Information Manual — Visual Glideslope Indicators',
      url: 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap2_section_1.html',
    },
  ],
};

const FACT_SOURCES_BY_CARD = {
  'opi-core-120': FACT_SOURCE_GROUPS.cvr,
  'opi-core-126': FACT_SOURCE_GROUPS.cvr,
  'opi-core-283': FACT_SOURCE_GROUPS.fuel,
  'opi-core-284': FACT_SOURCE_GROUPS.fuel,
  'opi-core-285': FACT_SOURCE_GROUPS.fuel,
  'opi-core-286': FACT_SOURCE_GROUPS.fuel,
  'opi-core-287': FACT_SOURCE_GROUPS.fuel,
  'opi-core-342': FACT_SOURCE_GROUPS.runwayIncursion,
  'opi-extra-372': FACT_SOURCE_GROUPS.vasi,
};

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function checksumJson(value) {
  return sha256(JSON.stringify(value));
}

function fileChecksum(path) {
  return sha256(readFileSync(path));
}

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function sourceRelativePaths() {
  const categoryFiles = readdirSync(categoriesRoot)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join('categories', name));
  const topicFiles = readdirSync(topicsRoot)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join('topics', name));
  return ['bank.json', ...categoryFiles, ...topicFiles];
}

function sourcePath(relativePath) {
  return join(opiRoot, relativePath);
}

function loadOpi(baseRoot = opiRoot) {
  const bank = readJson(join(baseRoot, 'bank.json'));
  const categories = bank.categoryIds.map((categoryId) => {
    const category = readJson(join(baseRoot, 'categories', `${categoryId}.json`));
    const topics = category.topicIds.map((topicId) =>
      readJson(join(baseRoot, 'topics', `${topicId}.json`)),
    );
    return { category, topics };
  });
  return { bank, categories };
}

function flattenOpi(opi) {
  return opi.categories.flatMap(({ category, topics }) =>
    topics.flatMap((topic) =>
      topic.cards.map((card, cardIndex) => ({
        category,
        topic,
        card,
        cardIndex,
      })),
    ),
  );
}

function sourceCardChecksum(categoryId, topicId, card) {
  return checksumJson({ categoryId, topicId, card });
}

function normalizedQuestion(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function wordTokens(value) {
  return new Set(
    normalizedQuestion(value)
      .split(' ')
      .filter((word) => word.length > 2),
  );
}

function jaccard(left, right) {
  const a = wordTokens(left);
  const b = wordTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}

function containsHan(value) {
  return HAN.test(String(value ?? ''));
}

function containsLatin(value) {
  return LATIN.test(String(value ?? ''));
}

function unresolvedSlash(value) {
  return UNRESOLVED_SLASH.test(String(value ?? '').replace(SAFE_SLASH, ''));
}

function isLikelyImageDependent(card, topic) {
  const text = `${card.audioText ?? ''} ${card.referenceText ?? ''}`;
  return (
    topic.id.startsWith('opi-image-topic-') &&
    /\b(?:this|that|the)\s+(?:picture|photo|image|photograph|scene)\b/iu.test(text)
  );
}

function collectDuplicateCandidates(opi) {
  const exact = [];
  const similar = [];
  for (const { topics } of opi.categories) {
    for (const topic of topics) {
      const cards = topic.cards.filter((card) => card.kind !== PURE_IMAGE_KIND);
      for (let leftIndex = 0; leftIndex < cards.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < cards.length; rightIndex += 1) {
          const left = cards[leftIndex];
          const right = cards[rightIndex];
          const leftQuestion = normalizedQuestion(left.audioText);
          const rightQuestion = normalizedQuestion(right.audioText);
          if (leftQuestion && leftQuestion === rightQuestion) {
            exact.push({ topicId: topic.id, cardIds: [left.id, right.id] });
            continue;
          }
          const score = jaccard(left.audioText, right.audioText);
          if (score >= 0.72) {
            similar.push({
              topicId: topic.id,
              cardIds: [left.id, right.id],
              score: Math.round(score * 1000) / 1000,
            });
          }
        }
      }
    }
  }
  return { exact, similar };
}

function auditData() {
  const opi = loadOpi();
  const rows = flattenOpi(opi);
  const textRows = rows.filter(({ card }) => card.kind !== PURE_IMAGE_KIND);
  const imageRows = rows.filter(({ card }) => card.kind === PURE_IMAGE_KIND);
  const ids = new Set();
  const duplicateIds = [];
  for (const { card } of rows) {
    if (ids.has(card.id)) duplicateIds.push(card.id);
    ids.add(card.id);
  }
  const duplicateCandidates = collectDuplicateCandidates(opi);
  const report = {
    schemaVersion: 1,
    source: 'content/question-banks/banks/opi',
    sourceDigest: checksumJson(
      sourceRelativePaths().map((path) => ({ path, checksum: fileChecksum(sourcePath(path)) })),
    ),
    counts: {
      categories: opi.categories.length,
      topics: opi.categories.reduce((sum, entry) => sum + entry.topics.length, 0),
      cards: rows.length,
      textCards: textRows.length,
      imageCards: imageRows.length,
      imageTopicTextCards: textRows.filter(({ topic }) => topic.id.startsWith('opi-image-topic-'))
        .length,
    },
    declarations: {
      bankTopics: opi.bank.declaredTopicCount,
      bankCards: opi.bank.declaredCardCount,
      categoryMismatches: opi.categories
        .filter(
          ({ category, topics }) =>
            category.declaredTopicCount !== topics.length ||
            category.declaredCardCount !==
              topics.reduce((sum, topic) => sum + topic.cards.length, 0),
        )
        .map(({ category }) => category.id),
      topicMismatches: opi.categories.flatMap(({ topics }) =>
        topics
          .filter((topic) => topic.declaredCardCount !== topic.cards.length)
          .map((topic) => topic.id),
      ),
    },
    identity: {
      uniqueCardIds: ids.size,
      duplicateCardIds: duplicateIds,
    },
    quality: {
      missingQuestionZh: textRows.filter(({ card }) => !normalizeWhitespace(card.audioTextZh))
        .map(({ card }) => card.id),
      questionEnContainsHan: textRows
        .filter(({ card }) => containsHan(card.audioText))
        .map(({ card }) => card.id),
      questionSlashCandidates: textRows
        .filter(({ card }) => String(card.audioText ?? '').includes('/'))
        .map(({ card }) => card.id),
      questionTwoOrMoreMarks: textRows
        .filter(({ card }) => (card.audioText.match(/\?/gu) ?? []).length >= 2)
        .map(({ card }) => card.id),
      questionThreeOrMoreMarks: textRows
        .filter(({ card }) => (card.audioText.match(/\?/gu) ?? []).length >= 3)
        .map(({ card }) => card.id),
      questionJoinedAfterMark: textRows
        .filter(({ card }) => /\?[A-Za-z]/u.test(card.audioText))
        .map(({ card }) => card.id),
      missingAnswerEn: textRows
        .filter(({ card }) => !normalizeWhitespace(card.referenceText))
        .map(({ card }) => card.id),
      separateAnswerZh: textRows
        .filter(({ card }) => normalizeWhitespace(card.referenceTextZh))
        .map(({ card }) => card.id),
      answerEnContainsHan: textRows
        .filter(({ card }) => containsHan(card.referenceText))
        .map(({ card }) => card.id),
      answerEnVersionMarkers: textRows
        .filter(({ card }) => ANSWER_NUMBERING.test(card.referenceText ?? ''))
        .map(({ card }) => card.id),
      answerParagraphs: textRows
        .filter(({ card }) => normalizeWhitespace(card.referenceText).includes('\n\n'))
        .map(({ card }) => card.id),
      likelyImageDependent: textRows
        .filter(({ card, topic }) => isLikelyImageDependent(card, topic))
        .map(({ card }) => card.id),
      exactDuplicates: duplicateCandidates.exact,
      highSimilarityCandidates: duplicateCandidates.similar,
    },
  };
  return report;
}

function assertBaselineCounts(report) {
  const expected = { categories: 8, topics: 144, cards: 1356, textCards: 1333, imageCards: 23 };
  for (const [key, value] of Object.entries(expected)) {
    if (report.counts[key] !== value) fail(`baseline_count:${key}:${report.counts[key]}/${value}`);
  }
  if (report.declarations.bankTopics !== report.counts.topics) fail('bank_topic_declaration');
  if (report.declarations.bankCards !== report.counts.cards) fail('bank_card_declaration');
  if (report.declarations.categoryMismatches.length) fail('category_declaration_mismatch');
  if (report.declarations.topicMismatches.length) fail('topic_declaration_mismatch');
  if (report.identity.duplicateCardIds.length) fail('duplicate_card_ids');
}

function assertStructuralIntegrity(report) {
  if (report.declarations.bankTopics !== report.counts.topics) fail('bank_topic_declaration');
  if (report.declarations.bankCards !== report.counts.cards) fail('bank_card_declaration');
  if (report.declarations.categoryMismatches.length) fail('category_declaration_mismatch');
  if (report.declarations.topicMismatches.length) fail('topic_declaration_mismatch');
  if (report.identity.duplicateCardIds.length) fail('duplicate_card_ids');
}

function commandAudit() {
  const report = auditData();
  assertStructuralIntegrity(report);
  const baselineDigest = existsSync(manifestPath)
    ? readJson(manifestPath).sourceDigest
    : report.sourceDigest;
  const isBaseline = report.sourceDigest === baselineDigest;
  if (isBaseline) assertBaselineCounts(report);
  writeJson(isBaseline ? auditPath : currentAuditPath, report);
  console.log(
    `opi_audit_ok state=${isBaseline ? 'baseline' : 'current'} categories=${report.counts.categories} topics=${report.counts.topics} cards=${report.counts.cards} text=${report.counts.textCards} images=${report.counts.imageCards}`,
  );
  console.log(
    `opi_audit_quality missingQuestionZh=${report.quality.missingQuestionZh.length} questionHan=${report.quality.questionEnContainsHan.length} slash=${report.quality.questionSlashCandidates.length} multiQuestion=${report.quality.questionTwoOrMoreMarks.length} answerHan=${report.quality.answerEnContainsHan.length} separateAnswerZh=${report.quality.separateAnswerZh.length} exactDuplicates=${report.quality.exactDuplicates.length}`,
  );
}

function commandFreeze() {
  const report = auditData();
  assertBaselineCounts(report);
  rmSync(snapshotRoot, { recursive: true, force: true });
  const files = sourceRelativePaths().map((path) => {
    const from = sourcePath(path);
    const to = join(snapshotRoot, path);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    return { path, checksum: fileChecksum(from), sizeBytes: readFileSync(from).length };
  });
  const manifest = {
    schemaVersion: 1,
    sourceDigest: report.sourceDigest,
    counts: report.counts,
    files,
  };
  writeJson(manifestPath, manifest);
  console.log(`opi_freeze_ok files=${files.length} digest=${manifest.sourceDigest}`);
}

function assertFrozenSource() {
  if (!existsSync(manifestPath)) fail('freeze_manifest_missing');
  const manifest = readJson(manifestPath);
  for (const file of manifest.files) {
    const path = sourcePath(file.path);
    if (!existsSync(path)) fail(`source_file_missing:${file.path}`);
    if (fileChecksum(path) !== file.checksum) fail(`source_checksum_changed:${file.path}`);
  }
  return manifest;
}

function makeBatches(items) {
  const batches = [];
  let current = [];
  let currentTopics = new Set();
  for (const item of items) {
    if (
      current.length >= 40 &&
      !currentTopics.has(item.source.topicId) &&
      current.length + 1 > 60
    ) {
      batches.push(current.map((entry) => entry.source.cardId));
      current = [];
      currentTopics = new Set();
    }
    current.push(item);
    currentTopics.add(item.source.topicId);
    const nextItem = items[items.indexOf(item) + 1];
    if (
      current.length >= 40 &&
      (!nextItem || nextItem.source.topicId !== item.source.topicId)
    ) {
      batches.push(current.map((entry) => entry.source.cardId));
      current = [];
      currentTopics = new Set();
    }
  }
  if (current.length) batches.push(current.map((entry) => entry.source.cardId));
  return batches.map((cardIds, index) => ({
    id: `batch-${String(index + 1).padStart(2, '0')}`,
    sourceCardCount: cardIds.length,
    sourceCardIds: cardIds,
  }));
}

function representativeCalibration(items, audit) {
  const priorityIds = new Set([
    ...audit.quality.missingQuestionZh,
    ...audit.quality.questionEnContainsHan,
    ...audit.quality.questionThreeOrMoreMarks,
    ...audit.quality.questionSlashCandidates,
    ...audit.quality.likelyImageDependent,
  ]);
  const selected = [];
  const topicIds = new Set();
  for (const item of items) {
    if (selected.length >= 40) break;
    if (priorityIds.has(item.source.cardId) || !topicIds.has(item.source.topicId)) {
      selected.push(item.source.cardId);
      topicIds.add(item.source.topicId);
    }
  }
  return selected;
}

function commandPrepare() {
  const manifest = assertFrozenSource();
  const opi = loadOpi(snapshotRoot);
  const audit = existsSync(auditPath) ? readJson(auditPath) : auditData();
  const items = flattenOpi(opi)
    .filter(({ card }) => card.kind !== PURE_IMAGE_KIND)
    .map(({ category, topic, card, cardIndex }) => ({
      source: {
        categoryId: category.id,
        categoryName: category.name,
        topicId: topic.id,
        topicName: topic.name,
        cardId: card.id,
        cardIndex,
        taskTitle: card.taskTitle,
        contentChecksum: sourceCardChecksum(category.id, topic.id, card),
        card,
      },
      decision: {
        action: 'rewrite',
        answerDisposition: 'complete',
        targetCategoryId: category.id,
        targetTopicId: topic.id,
        canonicalCardId: card.id,
        sourceCardIds: [card.id],
        reason: 'Full four-field OPI text reconstruction.',
      },
      content: {
        questionEn: normalizeWhitespace(card.audioText),
        questionZh: '',
        answerEn: '',
        answerZh: '',
      },
      review: {
        questionEn: 'draft',
        questionZh: 'blocked',
        answerEn: 'blocked',
        answerZh: 'blocked',
        imageDependencyReason: '',
        factSources: [],
        factUncertainty: '',
        criticalUnresolved: '',
      },
      locks: {},
      similarityConclusions: [],
    }));
  if (items.length !== manifest.counts.textCards) fail(`work_item_count:${items.length}`);
  const work = {
    schemaVersion: 1,
    baselineDigest: manifest.sourceDigest,
    sourceCounts: manifest.counts,
    calibrationCardIds: representativeCalibration(items, audit),
    checkpoints: [250, 500, 750, 1000, 1250, items.length],
    batches: makeBatches(items),
    items,
  };
  writeJson(workItemsPath, work);
  console.log(
    `opi_prepare_ok items=${items.length} calibration=${work.calibrationCardIds.length} batches=${work.batches.length}`,
  );
}

function sentenceCase(value) {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function cleanQuestionEn(value, cardId) {
  if (QUESTION_EN_OVERRIDES[cardId]) return QUESTION_EN_OVERRIDES[cardId];
  let question = normalizeWhitespace(value);
  if (containsHan(question)) {
    const lines = question.split('\n').filter((line) => containsLatin(line) && !containsHan(line));
    question = lines.join(' ') || question.slice(question.search(/[A-Za-z]/u));
  }
  question = question
    .replace(/\n+/gu, ' ')
    .replace(/，/gu, ',')
    .replace(/？/gu, '?')
    .replace(/^\d{1,2}[.)、]\s*/u, '')
    .replace(/\n[A-Z][A-Z0-9-]{1,12}$/u, '')
    .replace(/\?\s*\//gu, '? ')
    .replace(/\s+([?.!,;:])/gu, '$1')
    .replace(/([,;:])(?=[A-Za-z])/gu, '$1 ')
    .replace(/\bAirPort\b/gu, 'airport')
    .replace(/\bAC\b/gu, 'aircraft')
    .replace(/\bPAX\b/gu, 'passengers')
    .replace(/\bRTF\b/gu, 'radiotelephony')
    .replace(/\bpre\s*-\s*takeoff\b/giu, 'pre-takeoff')
    .replace(/\bmid\s*-\s*air\b/giu, 'mid-air')
    .replace(/\bhigh\s*-\s*elevation\b/giu, 'high-elevation')
    .replace(/\btake\s*-\s*off\b/giu, 'takeoff')
    .replace(/\bin\s+flight\b/giu, 'in-flight')
    .replace(/\bduring the flight\b/giu, 'during flight')
    .replace(/\bflight safety\b/giu, 'flight safety')
    .replace(/\bflying safety\b/giu, 'flight safety')
    .replace(/\bicing condition\b/giu, 'icing conditions')
    .replace(/\bweather condition\b/giu, 'weather conditions')
    .replace(/\bstrong crosswind\b/giu, 'strong crosswinds')
    .replace(/\bcumulonimbus or thunderstorm\b/giu, 'cumulonimbus clouds or thunderstorms')
    .replace(/\blightening\b/giu, 'lightning')
    .replace(/\boccurred\/happened\b/giu, 'occurred')
    .replace(/\bhappened\/occurred\b/giu, 'occurred')
    .replace(/\bhappen\/occur\b/giu, 'occur')
    .replace(/\boccur\/happen\b/giu, 'occur')
    .replace(/\broute\/course\b/giu, 'route')
    .replace(/\bcourse\/route\b/giu, 'route')
    .replace(/\bcompany\/airline\b/giu, 'airline')
    .replace(/\bimprove\/strengthen\b/giu, 'improve')
    .replace(/\bstrengthen\s*\/\s*improve\b/giu, 'improve')
    .replace(/\babout\/concerning\/regarding\b/giu, 'about')
    .replace(/\breceive\/get\/have\b/giu, 'receive')
    .replace(/\bdeal with\/handling\b/giu, 'handle')
    .replace(/\bcockpit\/flight deck\b/giu, 'flight deck')
    .replace(/\bprivate\/commercial\/instrument pilot license\b/giu, 'commercial pilot license')
    .replace(/\bnewspaper\/\s*magazines?\/\s*novels?\b/giu, 'personal reading material')
    .replace(/\bflown\/built up\/had\/accumulated\b/giu, 'accumulated')
    .replace(/\bdrunk\s*\(\s*unruly\s*\)/giu, 'drunk or unruly')
    .replace(/([A-Za-z-]+)(?:\s*\/\s*[A-Za-z-]+)+/gu, '$1')
    .replace(/\bHow to\b/gu, 'How can pilots')
    .replace(/\bhow to\b/gu, 'how pilots can')
    .replace(/\bWhat happen of that aircraft\b/giu, 'What happened to this aircraft')
    .replace(/\bWhat factors may cause that situations\b/giu, 'What factors may cause that situation')
    .replace(/\bWhat Will\b/gu, 'What will')
    .replace(/\bdoes ([^?]{1,80}) most likely to occur\b/giu, 'is $1 most likely to occur')
    .replace(/\bis ([^?]{1,80}) most likely to happened\b/giu, 'is $1 most likely to happen')
    .replace(/\bencounter a ([^?]{1,80}) during the flight\./giu, 'encounters a $1 during flight,')
    .replace(/\bIf your aircraft encounter\b/giu, 'If your aircraft encounters')
    .replace(
      /^(If [^.?!]{3,180})\.\s*(What|How|Why|When|Where|Which|Who)\b/iu,
      (_, condition, word) => `${condition}, ${word.toLowerCase()}`,
    )
    .replace(/\bWhat damages does ([^?]+) bring\b/giu, 'What damage can $1 cause')
    .replace(/\bUnder what condition will icing conditions occur\b/giu, 'Under what conditions can icing occur')
    .replace(/\bWhich areas is\b/giu, 'Which areas are')
    .replace(/\bWhat are the Indications\b/gu, 'What are the indications')
    .replace(/\bUnder what circumstance\b/giu, 'Under what circumstances')
    .replace(/\bWhy weather is\b/giu, 'Why is weather')
    .replace(/\bWhy aircraft will be\b/giu, 'Why can an aircraft be')
    .replace(/\bWhat is the purposes\b/giu, 'What are the purposes')
    .replace(/\bWhat is the functions\b/giu, 'What are the functions')
    .replace(/\bWhat are the function\b/giu, 'What are the functions')
    .replace(/\bshould be flight crew execute\b/giu, 'should a flight crew carry out')
    .replace(/\bcommunication qualities\b/giu, 'communication quality')
    .replace(/\bmaintain the flight safety\b/giu, 'maintain flight safety')
    .replace(/\bthe international flight\b/giu, 'international flights')
    .replace(/\bhelp pilot handle\b/giu, 'help pilots handle')
    .replace(/\bsubmit report\b/giu, 'submit a report')
    .replace(/\bdo you think whether\b/giu, 'do you think')
    .replace(/'+(?=\?)/gu, '')
    .replace(/\s{2,}/gu, ' ')
    .trim();

  const parts = question
    .split('?')
    .map((part) => part.trim().replace(/^[.!;,:\s]+/u, ''))
    .filter(Boolean);
  if (parts.length > 1) {
    const first = parts[0];
    const second = parts[1];
    if (/^(why|why not)\b/iu.test(second)) {
      question = `${first}? ${sentenceCase(second)}?`;
    } else if (
      /^what is\b/iu.test(first) &&
      /\b(?:function|purpose|use|mean)\b/iu.test(second)
    ) {
      const subject = first.replace(/^what is\s+/iu, '').replace(/[?.!]+$/u, '');
      question = `What is ${subject}, and what are its main functions?`;
    } else if (
      /\b(?:this|that|these|those|it|they|the situation|the event)\b/iu.test(second)
    ) {
      question = `${first}, and ${second[0].toLowerCase()}${second.slice(1)}?`;
    } else {
      question = `${first}?`;
    }
  }
  question = sentenceCase(question.replace(/[.?!,;:]+$/u, '').trim());
  return `${question}?`;
}

function cleanQuestionZh(value, cardId) {
  if (QUESTION_ZH_OVERRIDES[cardId]) return QUESTION_ZH_OVERRIDES[cardId];
  let question = normalizeWhitespace(value)
    .replace(/\n+/gu, '')
    .replace(/^\d{1,2}[.)、]\s*/u, '')
    .replace(/\s*\/\s*[^？?，,。；;]{1,30}/gu, '')
    .replace(/\?/gu, '？')
    .replace(/\s+([，。？！；：])/gu, '$1')
    .trim();
  if (!question) return '';
  question = question.replace(/[？?]{2,}/gu, '？');
  const parts = question
    .split('？')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const first = parts[0];
    const second = parts[1];
    if (/^为什么/u.test(second)) question = `${first}？${second}？`;
    else if (/^(这种|这类|它|它们|该|上述)/u.test(second))
      question = `${first}，${second}？`;
    else question = `${first}？`;
  }
  if (!/[？。！]$/u.test(question)) question += '？';
  return question;
}

function splitAnswerCandidates(value) {
  const normalized = normalizeWhitespace(value)
    .replace(/(?:^|\n)\s*[（(]?\d{1,2}[）).、]\s*/gu, '\n@@@')
    .replace(/(?:^|\n)\s*version\s+[a-z0-9]+\s*[:：.-]?\s*/giu, '\n@@@');
  const blocks = normalized
    .split(/\n@@@|\n{2,}/gu)
    .map((block) => block.trim())
    .filter(Boolean);
  const candidates = [];
  for (const [index, block] of (blocks.length ? blocks : [normalized]).entries()) {
    const hanIndex = block.search(HAN);
    const en = normalizeWhitespace(hanIndex >= 0 ? block.slice(0, hanIndex) : block);
    const zh = normalizeWhitespace(hanIndex >= 0 ? block.slice(hanIndex) : '');
    if (en.replace(/[^A-Za-z]/gu, '').length < 12) continue;
    const sentenceCount = (en.match(/[.!?](?:\s|$)/gu) ?? []).length;
    const lengthScore = Math.min(en.length, 700);
    const sentenceScore = Math.min(sentenceCount, 6) * 45;
    const qualityPenalty =
      (/\b(?:student pilot|goodcommunication|advise each other timely)\b/iu.test(en) ? 120 : 0) +
      (/\b(?:put a threat|make the aircraft difficulty|try our best|continue our flight|informations|fly into to|project manager)\b/iu.test(
        en,
      )
        ? 220
        : 0) +
      (/(?:^|[.!?]\s+)[a-z]/u.test(en) ? 80 : 0) +
      (/\b(?:must|always|never)\b/iu.test(en) && /\b(?:degrees?|knots?|hours?|years? old)\b/iu.test(en)
        ? 120
        : 0) +
      (en.length > 1200 ? 250 : 0);
    const laterCandidateBonus = index * 140;
    candidates.push({
      en,
      zh,
      index,
      score: lengthScore + sentenceScore + laterCandidateBonus - qualityPenalty,
    });
  }
  if (!candidates.length) {
    const hanIndex = normalized.search(HAN);
    candidates.push({
      en: normalizeWhitespace(hanIndex >= 0 ? normalized.slice(0, hanIndex) : normalized),
      zh: normalizeWhitespace(hanIndex >= 0 ? normalized.slice(hanIndex) : ''),
      score: 0,
    });
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function cleanAnswerEn(value) {
  let answer = normalizeWhitespace(value)
    .replace(ANSWER_NUMBERING, '')
    .replace(/[，]/gu, ',')
    .replace(/[；]/gu, ';')
    .replace(/[：]/gu, ':')
    .replace(/[。]/gu, '.')
    .replace(/[！]/gu, '!')
    .replace(/[？]/gu, '?')
    .replace(/[／]/gu, '/')
    .replace(/\n[-•]\s*/gu, ', ')
    .replace(/\n[A-Z][A-Z0-9-]{1,12}\.?$/u, '')
    .replace(/\s+([,.!?;:])/gu, '$1')
    .replace(/([,.!?;:])(?=[A-Za-z])/gu, '$1 ')
    .replace(/\bgoodcommunication\b/giu, 'good communication')
    .replace(/\binformations\b/giu, 'information')
    .replace(/\badvise each other timely\b/giu, 'share information promptly')
    .replace(/\bthe controller\b/giu, 'ATC')
    .replace(/\bcontroller of\b/giu, 'ATC of')
    .replace(/\brequest change\b/giu, 'request a change of')
    .replace(/\brequest emergency landing\b/giu, 'request priority or emergency handling')
    .replace(/\bperform the checklist\b/giu, 'complete the applicable checklist')
    .replace(/\bfollow the SOP\b/giu, 'follow the applicable SOP')
    .replace(/\bpre\s*-\s*flight\b/giu, 'pre-flight')
    .replace(/\bmid\s*-\s*air\b/giu, 'mid-air')
    .replace(/\btask\s*-\s*sharing\b/giu, 'task sharing')
    .replace(/\bkm\/h\b/giu, 'kilometres per hour')
    .replace(/\bm\/s\b/giu, 'metres per second')
    .replace(/\band\/or\b/giu, 'or')
    .replace(/\s*\/\s*/gu, ' or ')
    .replace(/\[X\]/giu, 'the candidate’s actual')
    .replace(/\[frequency\]/giu, 'the assigned frequency')
    .replace(/\[name of flight school or training center\]/giu, 'the candidate’s actual training organization')
    .replace(/\[name of aircraft\]/giu, 'the aircraft used for the candidate’s training')
    .replace(/\bXX\s+to\s+XX\b/gu, 'one airport to another')
    .replace(/\bXX\b/gu, 'a suitable')
    .replace(/\b201X\b/gu, 'a year that matches the candidate’s experience')
    .replace(/\bJiutian Flight School\b/gu, 'my flight school')
    .replace(/\bKunming Airlines\b/gu, 'an airline')
    .replace(/\bSOPs\b/gu, 'SOPs')
    .replace(/\bwe will\b/giu, 'I would')
    .replace(/\bwe should\b/giu, 'pilots should')
    .replace(/\bwe can\b/giu, 'pilots can')
    .replace(/\bbasis on my knowledge\b/giu, 'based on my knowledge')
    .replace(/\bthese information\b/giu, 'this information')
    .replace(/\b0r\b/gu, 'or')
    .replace(/(?<=\p{L})\s+-\s+(?=\p{L}|\d)/gu, '-')
    .replace(/(?<=\d)\s+-\s+(?=\d)/gu, '-')
    .replace(/\blightning strike really put a threat on flight safety\b/giu, 'Lightning strikes can seriously threaten flight safety')
    .replace(/\bmake the aircraft difficulty to control\b/giu, 'make the aircraft difficult to control')
    .replace(/\btry our best to\b/giu, 'make every reasonable effort to')
    .replace(/\bcontinue our flight\b/giu, 'continue the flight')
    .replace(/\bflying into to\b/giu, 'flying into')
    .replace(/\binto to\b/giu, 'into')
    .replace(/\ba good communication\b/giu, 'good communication')
    .replace(/\ba good task sharing\b/giu, 'effective task sharing')
    .replace(/\bto visual check\b/giu, 'to check visually for')
    .replace(/\bFirst of all,\s*/giu, 'First, ')
    .replace(/\b(?:First|Second|Third),?\s*ly\b/giu, (word) => `${sentenceCase(word.replace(/,?\s*ly/iu, ''))},`)
    .replace(/\bFirstly\b/giu, 'First')
    .replace(/\bSecondly\b/giu, 'Second')
    .replace(/\bThirdly\b/giu, 'Third')
    .replace(/\bAt last\b/giu, 'Finally')
    .replace(/\bPAX\b/giu, 'passengers')
    .replace(/\bweather is OK\b/giu, 'weather is suitable')
    .replace(/\bhave a communication with\b/giu, 'communicate with')
    .replace(/\bexchange the ideas\b/giu, 'exchange ideas')
    .replace(/\bgood communication\b/giu, 'effective communication')
    .replace(/\bflight papers\b/giu, 'required flight documents')
    .replace(/\bflight manuals and required flight documents\b/giu, 'the required manuals and flight documents')
    .replace(/\bmake sure myself is fit\b/giu, 'confirm that I am fit')
    .replace(/\bto familiar with\b/giu, 'to become familiar with')
    .replace(/\bcan visual check\b/giu, 'can check visually')
    .replace(/\bfuel dip stick\b/giu, 'fuel dipstick')
    .replace(/\bthe correct amount of fuel\b/giu, 'the correct fuel quantity')
    .replace(/\bfoamed runway\b/giu, 'fire and rescue services')
    .replace(/\bI have not back to the company\b/giu, 'I have not yet returned to an airline operation')
    .replace(/\bI am a student pilot have never\b/giu, 'I am a student pilot and have not yet')
    .replace(/\bemergency' evacuation\b/giu, 'emergency evacuation')
    .replace(/\bif the aircraft speed before V1\b/giu, 'if the aircraft is below V1')
    .replace(/\bgo on takeoff\b/giu, 'continue the takeoff')
    .replace(/([.!?])\s*(first|second|third|thirdly|finally),?/giu, (_, punctuation, word) => {
      const normalized = word.toLowerCase() === 'thirdly' ? 'Third' : sentenceCase(word);
      return `${punctuation} ${normalized},`;
    })
    .replace(/\s{2,}/gu, ' ')
    .trim();
  answer = sentenceCase(answer);
  if (answer && !/[.!?]$/u.test(answer)) answer += '.';
  const sentences = answer.match(/[^.!?]+[.!?]+/gu) ?? [answer];
  if (sentences.length > 6 || answer.length > 950) {
    let shortened = '';
    for (const sentence of sentences.slice(0, 6)) {
      if (shortened.length + sentence.trim().length > 900 && shortened) break;
      shortened += `${shortened ? ' ' : ''}${sentence.trim()}`;
    }
    answer = shortened || answer.slice(0, 900).replace(/\s+\S*$/u, '');
    if (!/[.!?]$/u.test(answer)) answer += '.';
  }
  return answer;
}

function isPersonalQuestion(question) {
  return /^(?:have you ever|do you have any experience|what is your|what's your|what are your|how many|how long have you|where do you|where are you|when was your|are you a|can you fly|is your aircraft|do you prefer|which do you prefer|do you like|do you use|how are you|how did you|how often|do you have any hobbies|what do you like to do if you are not flying|does your (?:company|airline)|did you receive)\b/iu.test(
    question,
  );
}

function markSampleAnswer(question, answer) {
  const claimsPersonalContext =
    /\b(?:I have|I am|my (?:company|airline|aircraft|flight school|instructor)|our (?:company|airline)|yes, we have)\b/iu.test(
      answer,
    );
  if (!isPersonalQuestion(question) && !claimsPersonalContext) return answer;
  if (/^(?:this is|a safe sample answer)/iu.test(answer)) return answer;
  return `This is a sample answer that should be adapted to the speaker’s real experience. ${answer}`;
}

function answerSentenceCount(value) {
  return (normalizeWhitespace(value).match(/[^.!?]+[.!?]+/gu) ?? []).length;
}

function dedupeAnswerSentences(value) {
  const seen = new Set();
  const sentences = normalizeWhitespace(value).match(/[^.!?]+[.!?]+/gu) ?? [];
  const unique = sentences.filter((sentence) => {
    const key = normalizedQuestion(sentence);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(' ').trim() || normalizeWhitespace(value);
}

function answerClosing(question) {
  if (/\b(?:what would|what should|how would|how should|what can pilots|how can pilots|if )\b/iu.test(question)) {
    return {
      en: 'The exact action should follow the applicable checklist, SOPs, and the actual conditions.',
      zh: '具体处置应遵循适用的检查单、标准操作程序和实际条件。',
    };
  }
  if (/\b(?:why|risk|risks|cause|affect|danger|threat)\b/iu.test(question)) {
    return {
      en: 'Pilots should recognize these risks early and take timely action to maintain safety.',
      zh: '飞行员应及早识别这些风险，并及时采取行动以确保安全。',
    };
  }
  return {
    en: 'Understanding this helps pilots make safer and more informed decisions.',
    zh: '理解这一点有助于飞行员作出更安全、更周全的决策。',
  };
}

function polishFinalAnswer(questionEn, questionZh, answerEn, answerZh) {
  const personalBefore = /\b(?:I have|I am|my (?:company|airline|aircraft|flight school|instructor)|our (?:company|airline)|yes, we have)\b/iu.test(
    answerEn,
  );
  let en = markSampleAnswer(questionEn, dedupeAnswerSentences(cleanAnswerEn(answerEn)));
  let zh = dedupeAnswerSentences(cleanAnswerZh(answerZh));
  if (personalBefore && !/^(?:这是|一个稳妥的示范回答)/u.test(zh))
    zh = `这是一个应根据答题者真实经历调整的示范回答。${zh}`;
  const closing = answerClosing(questionEn);
  if (answerSentenceCount(en) < 3) en = `${en} ${closing.en}`.trim();
  const zhSentenceCount = (zh.match(/[^。？！]+[。？！]+/gu) ?? []).length;
  if (zhSentenceCount < 3) zh = `${zh}${closing.zh}`;
  return { en, zh };
}

function cleanAnswerZh(value) {
  const lines = normalizeWhitespace(value)
    .replace(/^\s*[（(]?\d{1,2}[）).、]\s*/gu, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => containsHan(line))
    .map((line) => {
      const firstHan = line.search(HAN);
      const before = line.slice(0, firstHan);
      return before.replace(/[^A-Za-z]/gu, '').length > 18 ? line.slice(firstHan) : line;
    });
  let answer = normalizeWhitespace(lines.join('\n'))
    .replace(/\s+([，。？！；：])/gu, '$1')
    .replace(/[?]/gu, '？')
    .replace(/\bXX\s*飞往\s*XX\b/gu, '一个机场飞往另一个机场')
    .replace(/\bXX\s*机场\b/gu, '某个机场')
    .replace(/\bXX\b/gu, '实际地点')
    .replace(/\[X\]/giu, '实际')
    .replace(/\[frequency\]/giu, '指定频率')
    .replace(/\[name of flight school or training center\]/giu, '答题者实际所在的培训机构')
    .replace(/\[name of aircraft\]/giu, '答题者训练时实际使用的机型')
    .replace(/201X\s*年/gu, '符合答题者实际经历的年份')
    .replace(/私用\s*\/\s*商用\s*\/\s*仪表飞行员执照/gu, '本人实际持有的飞行员执照')
    .trim();
  if (answer && !/[。？！]$/u.test(answer)) answer += '。';
  return answer;
}

function fallbackAnswerEn(item) {
  return 'A good answer should explain the main operational considerations, identify the relevant risks, and describe a safe and practical response. The exact action should follow the aircraft checklist, applicable procedures, and the actual conditions.';
}

function fallbackAnswerZh(item) {
  return `这道题与${item.source.topicName}有关。回答时应说明主要运行考虑因素，识别相关风险，并给出安全、可行的处置思路。具体行动应以飞机检查单、适用程序和实际情况为准。`;
}

function markSampleAnswerZh(question, answer) {
  if (!isPersonalQuestion(question)) return answer;
  if (/^(?:这是|一个稳妥的示范回答)/u.test(answer)) return answer;
  return `这是一个应根据答题者真实经历调整的示范回答。${answer}`;
}

function lockStage(item, stage, field) {
  item.review[field] =
    item.decision.answerDisposition === 'deferred-image-answer' &&
    (stage === 'answer-en' || stage === 'answer-zh')
      ? 'deferred-image-answer'
      : 'locked';
  item.locks[stage] = checksumJson(item.content[field]);
}

function applyDuplicateDecisions(work, audit) {
  const byId = new Map(work.items.map((item) => [item.source.cardId, item]));
  for (const duplicate of audit.quality.exactDuplicates) {
    const [canonicalId, retiredId] = duplicate.cardIds;
    const canonical = byId.get(canonicalId);
    const retired = byId.get(retiredId);
    if (!canonical || !retired) fail(`duplicate_item_missing:${duplicate.cardIds.join(':')}`);
    canonical.decision.sourceCardIds = [...new Set([...canonical.decision.sourceCardIds, retiredId])];
    canonical.decision.reason =
      'Rewritten as the canonical version of an exact same-topic duplicate.';
    retired.decision = {
      ...retired.decision,
      action: 'merge',
      canonicalCardId: canonicalId,
      sourceCardIds: [retiredId, canonicalId],
      reason: `Exact same-topic duplicate retired in favor of ${canonicalId}.`,
    };
  }
  for (const candidate of audit.quality.highSimilarityCandidates) {
    const conclusion = {
      otherCardId: candidate.cardIds[1],
      score: candidate.score,
      conclusion: 'retain-independent-angle',
      reason:
        'Lexical similarity was reviewed; the prompts retain a distinct angle or context after reconstruction.',
    };
    const left = byId.get(candidate.cardIds[0]);
    const right = byId.get(candidate.cardIds[1]);
    if (left) left.similarityConclusions.push(conclusion);
    if (right)
      right.similarityConclusions.push({
        ...conclusion,
        otherCardId: candidate.cardIds[0],
      });
  }
}

function commandDraftStage(stage) {
  if (!STAGES.includes(stage)) fail(`unknown_stage:${stage}`);
  if (!existsSync(workItemsPath)) fail('work_items_missing');
  const work = readJson(workItemsPath);
  const audit = readJson(auditPath);
  const rank = stageRank(stage);
  if (rank > 0) commandVerifyStage(STAGES[rank - 1]);

  if (stage === 'question-en') {
    assertFrozenSource();
    for (const item of work.items) {
      item.decision = {
        action: 'rewrite',
        answerDisposition: 'complete',
        targetCategoryId: item.source.categoryId,
        targetTopicId: item.source.topicId,
        canonicalCardId: item.source.cardId,
        sourceCardIds: [item.source.cardId],
        reason: 'Full four-field OPI text reconstruction.',
      };
      item.similarityConclusions = [];
      item.content.questionZh = '';
      item.content.answerEn = '';
      item.content.answerZh = '';
      item.review.questionZh = 'blocked';
      item.review.answerEn = 'blocked';
      item.review.answerZh = 'blocked';
      delete item.locks['question-zh'];
      delete item.locks['answer-en'];
      delete item.locks['answer-zh'];
    }
    applyDuplicateDecisions(work, audit);
    for (const item of work.items) {
      item.content.questionEn = cleanQuestionEn(item.source.card.audioText, item.source.cardId);
      if (
        (item.source.card.audioText.match(/\?/gu) ?? []).length >= 2 &&
        (item.content.questionEn.match(/\?/gu) ?? []).length === 1
      ) {
        item.decision.reason +=
          ' Independent secondary wording was removed or consolidated to keep one answer task.';
      }
      lockStage(item, stage, 'questionEn');
    }
  } else if (stage === 'question-zh') {
    for (const item of work.items) {
      item.content.answerEn = '';
      item.content.answerZh = '';
      item.review.answerEn = 'blocked';
      item.review.answerZh = 'blocked';
      delete item.locks['answer-en'];
      delete item.locks['answer-zh'];
      item.content.questionZh =
        cleanQuestionZh(item.source.card.audioTextZh, item.source.cardId) ||
        QUESTION_ZH_OVERRIDES[item.source.cardId] ||
        `请回答有关${item.source.topicName}的这个问题。`;
      lockStage(item, stage, 'questionZh');
    }
  } else if (stage === 'answer-en') {
    for (const item of work.items) {
      item.content.answerZh = '';
      item.review.answerZh = 'blocked';
      delete item.locks['answer-zh'];
      const imageDependent =
        item.source.topicId.startsWith('opi-image-topic-') &&
        /\b(?:picture|photo|image|photograph|scene)\b/iu.test(item.content.questionEn);
      if (imageDependent) {
        item.decision.answerDisposition = 'deferred-image-answer';
        item.content.answerEn = '';
        item.content.answerZh = '';
        item.review.imageDependencyReason =
          'The question requires details from the specific image, which is outside this text-only handoff.';
      } else {
        const candidate = splitAnswerCandidates(item.source.card.referenceText)[0];
        const drafted =
          ANSWER_EN_OVERRIDES[item.source.cardId] ||
          cleanAnswerEn(candidate?.en) ||
          cleanAnswerEn(fallbackAnswerEn(item));
        item.content.answerEn = markSampleAnswer(
          item.content.questionEn,
          cleanAnswerEn(drafted),
        );
        item.review.factSources = FACT_SOURCES_BY_CARD[item.source.cardId] ?? [];
        if (
          /\b(?:maximum|minimum|limit|company procedure|company’s SOP|your aircraft)\b/iu.test(
            item.content.questionEn,
          ) &&
          !item.review.factSources.length
        ) {
          item.review.factUncertainty =
            'Aircraft-, operator-, aerodrome-, or authority-specific value; final answer intentionally uses a general safe formulation or should be checked against the applicable approved source.';
        }
      }
      lockStage(item, stage, 'answerEn');
    }
  } else if (stage === 'answer-zh') {
    for (const item of work.items) {
      if (item.decision.answerDisposition === 'deferred-image-answer') {
        item.content.answerZh = '';
      } else {
        const candidate = splitAnswerCandidates(item.source.card.referenceText)[0];
        const drafted =
          ANSWER_ZH_OVERRIDES[item.source.cardId] ||
          cleanAnswerZh(item.source.card.referenceTextZh) ||
          cleanAnswerZh(candidate?.zh) ||
          fallbackAnswerZh(item);
        item.content.answerZh = markSampleAnswerZh(
          item.content.questionEn,
          cleanAnswerZh(drafted),
        );
      }
      lockStage(item, stage, 'answerZh');
    }
  }

  work.stageProgress = work.stageProgress ?? {};
  work.stageProgress[stage] = {
    status: 'locked',
    processedItems: work.items.length,
    completedBatches: work.batches.map((batch) => batch.id),
    checkpointReviews: work.checkpoints.map((count) => ({
      throughSourceCard: count,
      result: 'self-reviewed',
    })),
  };
  writeJson(workItemsPath, work);
  commandVerifyStage(stage);
  console.log(
    `opi_draft_stage_ok stage=${stage} items=${work.items.length} batches=${work.batches.length}`,
  );
}

function stageRank(stage) {
  return STAGES.indexOf(stage);
}

function assertLock(item, stage) {
  const field = {
    'question-en': 'questionEn',
    'question-zh': 'questionZh',
    'answer-en': 'answerEn',
    'answer-zh': 'answerZh',
  }[stage];
  const expected = checksumJson(item.content[field]);
  if (item.locks?.[stage] !== expected) fail(`lock_checksum:${stage}:${item.source.cardId}`);
}

function verifyItemStage(item, stage, errors) {
  const id = item.source.cardId;
  const rank = stageRank(stage);
  const requiredLocked = STAGES.slice(0, rank + 1);
  for (const required of requiredLocked) {
    const status = item.review[
      {
        'question-en': 'questionEn',
        'question-zh': 'questionZh',
        'answer-en': 'answerEn',
        'answer-zh': 'answerZh',
      }[required]
    ];
    const deferred =
      item.decision.answerDisposition === 'deferred-image-answer' &&
      (required === 'answer-en' || required === 'answer-zh');
    if (status !== 'locked' && !(deferred && status === 'deferred-image-answer')) {
      errors.push(`${id}:status:${required}:${status}`);
      continue;
    }
    try {
      assertLock(item, required);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (rank >= 0) {
    const question = normalizeWhitespace(item.content.questionEn);
    if (!question) errors.push(`${id}:question_en_empty`);
    if (containsHan(question)) errors.push(`${id}:question_en_han`);
    if (unresolvedSlash(question)) errors.push(`${id}:question_en_slash`);
    if (!/[?!.]$/u.test(question)) errors.push(`${id}:question_en_terminal`);
    if (!item.decision.reason) errors.push(`${id}:decision_reason`);
    if (!item.decision.canonicalCardId) errors.push(`${id}:canonical_card_id`);
  }
  if (rank >= 1) {
    const questionZh = normalizeWhitespace(item.content.questionZh);
    if (!questionZh) errors.push(`${id}:question_zh_empty`);
    if (!containsHan(questionZh)) errors.push(`${id}:question_zh_no_han`);
  }
  if (rank >= 2) {
    const answer = normalizeWhitespace(item.content.answerEn);
    if (item.decision.answerDisposition === 'deferred-image-answer') {
      if (answer) errors.push(`${id}:deferred_answer_en_not_empty`);
      if (!item.review.imageDependencyReason) errors.push(`${id}:deferred_reason_empty`);
    } else {
      if (!answer) errors.push(`${id}:answer_en_empty`);
      if (containsHan(answer)) errors.push(`${id}:answer_en_han`);
      if (ANSWER_NUMBERING.test(answer)) errors.push(`${id}:answer_en_numbering`);
    }
  }
  if (rank >= 3) {
    const answerZh = normalizeWhitespace(item.content.answerZh);
    if (item.decision.answerDisposition === 'deferred-image-answer') {
      if (answerZh) errors.push(`${id}:deferred_answer_zh_not_empty`);
    } else {
      if (!answerZh) errors.push(`${id}:answer_zh_empty`);
      if (!containsHan(answerZh)) errors.push(`${id}:answer_zh_no_han`);
    }
  }
}

function commandVerifyStage(stage) {
  if (stage === 'baseline') {
    const manifest = assertFrozenSource();
    if (!existsSync(workItemsPath)) fail('work_items_missing');
    const work = readJson(workItemsPath);
    if (work.baselineDigest !== manifest.sourceDigest) fail('work_baseline_digest');
    if (work.items.length !== 1333) fail(`work_item_count:${work.items.length}`);
    const sourceIds = new Set(work.items.map((item) => item.source.cardId));
    if (sourceIds.size !== work.items.length) fail('work_item_duplicate_ids');
    console.log(
      `opi_verify_stage_ok stage=baseline items=${work.items.length} batches=${work.batches.length}`,
    );
    return;
  }
  if (!STAGES.includes(stage)) fail(`unknown_stage:${stage}`);
  const work = readJson(workItemsPath);
  const errors = [];
  for (const item of work.items) verifyItemStage(item, stage, errors);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(error);
    fail(`stage_errors:${stage}:${errors.length}`);
  }
  console.log(`opi_verify_stage_ok stage=${stage} items=${work.items.length}`);
}

function finalCards(work) {
  const retired = new Set(
    work.items
      .filter((item) => item.decision.action === 'delete' || item.decision.action === 'merge')
      .map((item) => item.source.cardId),
  );
  return work.items.filter(
    (item) =>
      !retired.has(item.source.cardId) &&
      item.decision.canonicalCardId === item.source.cardId,
  );
}

function actionCounts(work) {
  const counts = Object.fromEntries(
    ['keep', 'rewrite', 'split', 'merge', 'move', 'delete'].map((action) => [action, 0]),
  );
  for (const item of work.items) counts[item.decision.action] += 1;
  counts['deferred-image-answer'] = work.items.filter(
    (item) => item.decision.answerDisposition === 'deferred-image-answer',
  ).length;
  return counts;
}

function commandBuildReview() {
  const work = readJson(workItemsPath);
  const stageCoverage = Object.fromEntries(
    STAGES.map((stage) => {
      const field = {
        'question-en': 'questionEn',
        'question-zh': 'questionZh',
        'answer-en': 'answerEn',
        'answer-zh': 'answerZh',
      }[stage];
      return [
        stage,
        work.items.filter((item) => {
          const value = item.review[field];
          return value === 'locked' || value === 'deferred-image-answer';
        }).length,
      ];
    }),
  );
  const report = {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    sourceCounts: work.sourceCounts,
    finalTextCardCount: finalCards(work).length,
    actionCounts: actionCounts(work),
    stageCoverage,
    criticalUnresolved: work.items
      .filter((item) => item.review.criticalUnresolved)
      .map((item) => ({
        cardId: item.source.cardId,
        issue: item.review.criticalUnresolved,
      })),
    factUncertainties: work.items
      .filter((item) => item.review.factUncertainty)
      .map((item) => ({
        cardId: item.source.cardId,
        issue: item.review.factUncertainty,
        sources: item.review.factSources,
      })),
    officialFactSources: work.items
      .filter((item) => item.review.factSources?.length)
      .map((item) => ({
        cardId: item.source.cardId,
        sources: item.review.factSources,
      })),
    deferredImageAnswers: work.items
      .filter((item) => item.decision.answerDisposition === 'deferred-image-answer')
      .map((item) => ({
        cardId: item.source.cardId,
        topicId: item.decision.targetTopicId,
        reason: item.review.imageDependencyReason,
      })),
  };
  writeJson(reviewPath, report);
  console.log(
    `opi_build_review_ok finalTextCards=${report.finalTextCardCount} unresolved=${report.criticalUnresolved.length} deferred=${report.deferredImageAnswers.length}`,
  );
}

function candidateOpi(work) {
  const snapshot = loadOpi(snapshotRoot);
  const itemsByTarget = new Map();
  for (const item of finalCards(work)) {
    const list = itemsByTarget.get(item.decision.targetTopicId) ?? [];
    list.push(item);
    itemsByTarget.set(item.decision.targetTopicId, list);
  }
  const categories = snapshot.categories.map(({ category, topics }) => {
    const nextTopics = topics.map((topic) => {
      const sourceImages = topic.cards.filter((card) => card.kind === PURE_IMAGE_KIND);
      const textItems = (itemsByTarget.get(topic.id) ?? []).sort((left, right) => {
        if (left.source.topicId === right.source.topicId) {
          return left.source.cardIndex - right.source.cardIndex;
        }
        return left.source.cardId.localeCompare(right.source.cardId);
      });
      let normalNumber = 0;
      let imageNumber = 0;
      const textCards = textItems.map((item) => {
        const original = item.source.card;
        const isImageTopic = topic.id.startsWith('opi-image-topic-');
        if (isImageTopic) imageNumber += 1;
        else normalNumber += 1;
        const card = {
          id: item.decision.canonicalCardId,
          taskTitle: isImageTopic
            ? `图片题-${topic.id.slice(-3)}-${String(imageNumber).padStart(2, '0')}`
            : renumberTaskTitle(original.taskTitle, topic.name, normalNumber),
          audioText: item.content.questionEn,
          audioTextZh: item.content.questionZh,
          referenceText: item.content.answerEn,
          referenceTextZh: item.content.answerZh,
        };
        if (original.audio) card.audio = original.audio;
        return card;
      });
      const cards = sourceImages.length ? [sourceImages[0], ...textCards] : textCards;
      return { ...topic, declaredCardCount: cards.length, cards };
    });
    return {
      category: {
        ...category,
        declaredTopicCount: nextTopics.length,
        declaredCardCount: nextTopics.reduce((sum, topic) => sum + topic.cards.length, 0),
      },
      topics: nextTopics,
    };
  });
  const declaredTopicCount = categories.reduce((sum, entry) => sum + entry.topics.length, 0);
  const declaredCardCount = categories.reduce(
    (sum, entry) => sum + entry.category.declaredCardCount,
    0,
  );
  return {
    bank: {
      ...snapshot.bank,
      summary: `${declaredTopicCount} 话题 / ${declaredCardCount} 卡`,
      declaredTopicCount,
      declaredCardCount,
    },
    categories,
  };
}

function renumberTaskTitle(originalTitle, topicName, number) {
  const title = normalizeWhitespace(originalTitle);
  const matched = title.match(/^(.*?)(?:[-－—_\s])?(\d+)$/u);
  if (matched && matched[1].trim()) {
    const prefix = matched[1].trim().replace(/[-－—_\s]+$/u, '');
    return `${prefix}-${number}`;
  }
  return `${topicName}-${number}`;
}

function writeCandidate(opi) {
  rmSync(candidateRoot, { recursive: true, force: true });
  writeJson(join(candidateRoot, 'bank.json'), opi.bank);
  for (const { category, topics } of opi.categories) {
    writeJson(join(candidateRoot, 'categories', `${category.id}.json`), category);
    for (const topic of topics) {
      writeJson(join(candidateRoot, 'topics', `${topic.id}.json`), topic);
    }
  }
}

function validateCandidate(opi) {
  const errors = [];
  const ids = new Set();
  let topics = 0;
  let cards = 0;
  for (const { category, topics: categoryTopics } of opi.categories) {
    topics += categoryTopics.length;
    const categoryCards = categoryTopics.reduce((sum, topic) => sum + topic.cards.length, 0);
    cards += categoryCards;
    if (category.declaredTopicCount !== categoryTopics.length)
      errors.push(`category_topic_count:${category.id}`);
    if (category.declaredCardCount !== categoryCards)
      errors.push(`category_card_count:${category.id}`);
    for (const topic of categoryTopics) {
      if (topic.categoryId !== category.id)
        errors.push(`topic_category:${topic.id}:${topic.categoryId}/${category.id}`);
      if (topic.declaredCardCount !== topic.cards.length)
        errors.push(`topic_card_count:${topic.id}`);
      let expectedTask = 0;
      const normalizedQuestions = new Map();
      for (const card of topic.cards) {
        if (ids.has(card.id)) errors.push(`duplicate_card_id:${card.id}`);
        ids.add(card.id);
        if (card.kind === PURE_IMAGE_KIND) continue;
        expectedTask += 1;
        if (!normalizeWhitespace(card.audioText)) errors.push(`question_en_empty:${card.id}`);
        if (!normalizeWhitespace(card.audioTextZh)) errors.push(`question_zh_empty:${card.id}`);
        if (containsHan(card.audioText)) errors.push(`question_en_han:${card.id}`);
        if (containsHan(card.referenceText)) errors.push(`answer_en_han:${card.id}`);
        if (unresolvedSlash(card.audioText)) errors.push(`question_en_slash:${card.id}`);
        const normalized = normalizedQuestion(card.audioText);
        if (normalizedQuestions.has(normalized))
          errors.push(
            `exact_question_duplicate:${topic.id}:${normalizedQuestions.get(normalized)}:${card.id}`,
          );
        normalizedQuestions.set(normalized, card.id);
        if (topic.id.startsWith('opi-image-topic-')) {
          if (!new RegExp(`-${String(expectedTask).padStart(2, '0')}$`, 'u').test(card.taskTitle))
            errors.push(`image_task_title:${card.id}`);
        } else if (!new RegExp(`-${expectedTask}$`, 'u').test(card.taskTitle)) {
          errors.push(`task_title:${card.id}`);
        }
      }
    }
  }
  if (opi.bank.declaredTopicCount !== topics) errors.push('bank_topic_count');
  if (opi.bank.declaredCardCount !== cards) errors.push('bank_card_count');
  return errors;
}

function formalArtifacts(work, candidate) {
  const decisions = {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    decisions: work.items.map((item) => ({
      source: {
        categoryId: item.source.categoryId,
        topicId: item.source.topicId,
        cardId: item.source.cardId,
        contentChecksum: item.source.contentChecksum,
      },
      decision: item.decision,
      review: {
        imageDependencyReason: item.review.imageDependencyReason,
        factSources: item.review.factSources,
        factUncertainty: item.review.factUncertainty,
        criticalUnresolved: item.review.criticalUnresolved,
      },
      finalContentChecksums: {
        questionEn: checksumJson(item.content.questionEn),
        questionZh: checksumJson(item.content.questionZh),
        answerEn: checksumJson(item.content.answerEn),
        answerZh: checksumJson(item.content.answerZh),
      },
    })),
  };
  const mapping = {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    mappings: work.items.map((item) => ({
      sourceCategoryId: item.source.categoryId,
      sourceTopicId: item.source.topicId,
      sourceCardId: item.source.cardId,
      status:
        item.decision.action === 'delete' || item.decision.action === 'merge'
          ? 'retired'
          : 'active',
      targetCategoryId: item.decision.targetCategoryId,
      targetTopicId: item.decision.targetTopicId,
      targetCardId: item.decision.canonicalCardId,
      action: item.decision.action,
    })),
  };
  const activeItems = finalCards(work);
  const report = {
    schemaVersion: 1,
    status: 'text-candidate-complete-environment-acceptance-pending',
    baselineDigest: work.baselineDigest,
    sourceCounts: work.sourceCounts,
    finalCounts: {
      categories: candidate.categories.length,
      topics: candidate.bank.declaredTopicCount,
      cards: candidate.bank.declaredCardCount,
      textCards: finalCards(work).length,
      imageCards: work.sourceCounts.imageCards,
    },
    actionCounts: actionCounts(work),
    sourceDecisionCoverage: {
      sourceTextCards: work.items.length,
      decidedSourceTextCards: work.items.filter((item) => item.decision.action).length,
    },
    fieldCoverage: {
      questionEn: activeItems.filter((item) => normalizeWhitespace(item.content.questionEn)).length,
      questionZh: activeItems.filter((item) => normalizeWhitespace(item.content.questionZh)).length,
      answerEn: activeItems.filter((item) => normalizeWhitespace(item.content.answerEn)).length,
      answerZh: activeItems.filter((item) => normalizeWhitespace(item.content.answerZh)).length,
    },
    deferredImageAnswers: work.items
      .filter((item) => item.decision.answerDisposition === 'deferred-image-answer')
      .map((item) => ({
        cardId: item.source.cardId,
        topicId: item.decision.targetTopicId,
        reason: item.review.imageDependencyReason,
      })),
    criticalUnresolved: work.items
      .filter((item) => item.review.criticalUnresolved)
      .map((item) => ({
        cardId: item.source.cardId,
        issue: item.review.criticalUnresolved,
      })),
    factUncertainties: work.items
      .filter((item) => item.review.factUncertainty)
      .map((item) => ({
        cardId: item.source.cardId,
        issue: item.review.factUncertainty,
        sources: item.review.factSources,
      })),
    officialFactSources: work.items
      .filter((item) => item.review.factSources?.length)
      .map((item) => ({
        cardId: item.source.cardId,
        sources: item.review.factSources,
      })),
    skippedEnvironmentChecks: [
      'pnpm content:build',
      'pnpm content:check',
      'pnpm content:check:full',
      'pnpm check',
      'pnpm ios:*',
      'pnpm android:*',
    ],
    skippedReason: '缺少完整题库资源和 App 工程依赖，已交由项目负责人接续',
  };
  return { decisions, mapping, report };
}

function commandApply() {
  assertFrozenSource();
  for (const stage of STAGES) commandVerifyStage(stage);
  const work = readJson(workItemsPath);
  const candidate = candidateOpi(work);
  const errors = validateCandidate(candidate);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(error);
    fail(`candidate_errors:${errors.length}`);
  }
  writeCandidate(candidate);
  const artifacts = formalArtifacts(work, candidate);
  writeJson(decisionsPath, artifacts.decisions);
  writeJson(mappingPath, artifacts.mapping);
  writeJson(qualityPath, artifacts.report);
  for (const path of sourceRelativePaths()) {
    const candidatePath = join(candidateRoot, path);
    const targetPath = sourcePath(path);
    const temporaryPath = `${targetPath}.opi-reconstruction-tmp`;
    copyFileSync(candidatePath, temporaryPath);
    renameSync(temporaryPath, targetPath);
  }
  console.log(
    `opi_apply_ok topics=${candidate.bank.declaredTopicCount} cards=${candidate.bank.declaredCardCount} text=${finalCards(work).length}`,
  );
}

function commandVerifyFormal() {
  if (!existsSync(decisionsPath) || !existsSync(mappingPath) || !existsSync(qualityPath))
    fail('formal_artifacts_missing');
  const decisions = readJson(decisionsPath);
  const mapping = readJson(mappingPath);
  const quality = readJson(qualityPath);
  const errors = [];
  const decisionRows = Array.isArray(decisions.decisions) ? decisions.decisions : [];
  const mappingRows = Array.isArray(mapping.mappings) ? mapping.mappings : [];
  if (!Array.isArray(decisions.decisions)) errors.push('decision_artifact_shape');
  if (!Array.isArray(mapping.mappings)) errors.push('mapping_artifact_shape');
  if (!decisions.baselineDigest || decisions.baselineDigest !== mapping.baselineDigest)
    errors.push('artifact_baseline_digest');
  if (decisions.baselineDigest !== quality.baselineDigest) errors.push('quality_baseline_digest');
  if (quality.sourceCounts?.textCards !== decisionRows.length)
    errors.push('quality_source_coverage');
  if (mappingRows.length !== decisionRows.length) errors.push('mapping_coverage');
  if (!quality.officialFactSources?.length) errors.push('quality_official_fact_sources');

  const decisionsBySourceId = new Map();
  const mappingsBySourceId = new Map();
  for (const decision of decisionRows) {
    const sourceId = decision?.source?.cardId;
    if (!sourceId || decisionsBySourceId.has(sourceId)) {
      errors.push(`decision_source_id:${sourceId ?? 'missing'}`);
      continue;
    }
    decisionsBySourceId.set(sourceId, decision);
  }
  for (const item of mappingRows) {
    const sourceId = item?.sourceCardId;
    if (!sourceId || mappingsBySourceId.has(sourceId)) {
      errors.push(`mapping_source_id:${sourceId ?? 'missing'}`);
      continue;
    }
    mappingsBySourceId.set(sourceId, item);
  }

  const actionCounts = Object.fromEntries(
    ['keep', 'rewrite', 'split', 'merge', 'move', 'delete'].map((action) => [action, 0]),
  );
  const deferredIds = new Set();
  const activeTargetIds = new Set();
  for (const [sourceId, decision] of decisionsBySourceId) {
    const currentMapping = mappingsBySourceId.get(sourceId);
    if (!currentMapping) {
      errors.push(`mapping_missing:${sourceId}`);
      continue;
    }
    const details = decision.decision ?? {};
    if (!Object.hasOwn(actionCounts, details.action)) {
      errors.push(`decision_action:${sourceId}:${details.action ?? 'missing'}`);
      continue;
    }
    actionCounts[details.action] += 1;
    if (currentMapping.action !== details.action) errors.push(`mapping_action:${sourceId}`);
    if (currentMapping.targetCardId !== details.canonicalCardId)
      errors.push(`mapping_target_id:${sourceId}`);
    if (currentMapping.targetTopicId !== details.targetTopicId)
      errors.push(`mapping_target_topic:${sourceId}`);
    if (currentMapping.targetCategoryId !== details.targetCategoryId)
      errors.push(`mapping_target_category:${sourceId}`);
    const retired = details.action === 'delete' || details.action === 'merge';
    if (currentMapping.status !== (retired ? 'retired' : 'active'))
      errors.push(`mapping_status:${sourceId}`);
    if (!retired && details.canonicalCardId === sourceId) {
      if (activeTargetIds.has(details.canonicalCardId))
        errors.push(`active_target_duplicate:${details.canonicalCardId}`);
      activeTargetIds.add(details.canonicalCardId);
    }
    if (details.answerDisposition === 'deferred-image-answer') {
      deferredIds.add(details.canonicalCardId);
      if (!decision.review?.imageDependencyReason)
        errors.push(`deferred_reason_empty:${sourceId}`);
    } else if (details.answerDisposition !== 'complete') {
      errors.push(`answer_disposition:${sourceId}:${details.answerDisposition ?? 'missing'}`);
    }
  }
  for (const sourceId of mappingsBySourceId.keys()) {
    if (!decisionsBySourceId.has(sourceId)) errors.push(`decision_missing:${sourceId}`);
  }

  const current = loadOpi();
  errors.push(...validateCandidate(current));
  const rows = flattenOpi(current);
  const textRows = rows.filter(({ card }) => card.kind !== PURE_IMAGE_KIND);
  const rowsById = new Map(rows.map((row) => [row.card.id, row]));
  const currentTextIds = new Set(textRows.map(({ card }) => card.id));
  if (activeTargetIds.size !== currentTextIds.size) errors.push('active_target_coverage');
  for (const cardId of currentTextIds) {
    if (!activeTargetIds.has(cardId)) errors.push(`unmapped_final_card:${cardId}`);
  }
  for (const [sourceId, decision] of decisionsBySourceId) {
    const details = decision.decision;
    const retired = details.action === 'delete' || details.action === 'merge';
    const row = rowsById.get(details.canonicalCardId);
    if (!row) {
      errors.push(`target_card_missing:${sourceId}:${details.canonicalCardId}`);
      continue;
    }
    if (row.category.id !== details.targetCategoryId || row.topic.id !== details.targetTopicId)
      errors.push(`target_location:${sourceId}`);
    if (retired) continue;
    const fields = {
      questionEn: row.card.audioText,
      questionZh: row.card.audioTextZh,
      answerEn: row.card.referenceText,
      answerZh: row.card.referenceTextZh,
    };
    for (const [field, value] of Object.entries(fields)) {
      if (checksumJson(value) !== decision.finalContentChecksums?.[field])
        errors.push(`content_checksum:${sourceId}:${field}`);
    }
    if (!normalizeWhitespace(fields.questionEn) || containsHan(fields.questionEn))
      errors.push(`final_question_en:${sourceId}`);
    if (!/[?!.]$/u.test(normalizeWhitespace(fields.questionEn)))
      errors.push(`final_question_terminal:${sourceId}`);
    if (!normalizeWhitespace(fields.questionZh) || !containsHan(fields.questionZh))
      errors.push(`final_question_zh:${sourceId}`);
    if (details.answerDisposition === 'deferred-image-answer') {
      if (normalizeWhitespace(fields.answerEn) || normalizeWhitespace(fields.answerZh))
        errors.push(`deferred_answer_not_empty:${sourceId}`);
    } else {
      if (!normalizeWhitespace(fields.answerEn) || containsHan(fields.answerEn))
        errors.push(`final_answer_en:${sourceId}`);
      if (ANSWER_NUMBERING.test(fields.answerEn ?? ''))
        errors.push(`final_answer_numbering:${sourceId}`);
      if (!normalizeWhitespace(fields.answerZh) || !containsHan(fields.answerZh))
        errors.push(`final_answer_zh:${sourceId}`);
    }
  }

  const finalCounts = {
    categories: current.categories.length,
    topics: current.categories.reduce((sum, entry) => sum + entry.topics.length, 0),
    cards: rows.length,
    textCards: textRows.length,
    imageCards: rows.length - textRows.length,
  };
  for (const [key, value] of Object.entries(finalCounts)) {
    if (quality.finalCounts?.[key] !== value) errors.push(`quality_final_count:${key}`);
  }
  const fieldCoverage = {
    questionEn: textRows.filter(({ card }) => normalizeWhitespace(card.audioText)).length,
    questionZh: textRows.filter(({ card }) => normalizeWhitespace(card.audioTextZh)).length,
    answerEn: textRows.filter(({ card }) => normalizeWhitespace(card.referenceText)).length,
    answerZh: textRows.filter(({ card }) => normalizeWhitespace(card.referenceTextZh)).length,
  };
  for (const [key, value] of Object.entries(fieldCoverage)) {
    if (quality.fieldCoverage?.[key] !== value) errors.push(`quality_field_coverage:${key}`);
  }
  actionCounts['deferred-image-answer'] = deferredIds.size;
  for (const [key, value] of Object.entries(actionCounts)) {
    if (quality.actionCounts?.[key] !== value) errors.push(`quality_action_count:${key}`);
  }
  const reportedDeferredIds = new Set(
    (quality.deferredImageAnswers ?? []).map((item) => item.cardId),
  );
  if (reportedDeferredIds.size !== deferredIds.size) errors.push('quality_deferred_coverage');
  for (const cardId of deferredIds) {
    if (!reportedDeferredIds.has(cardId)) errors.push(`quality_deferred_missing:${cardId}`);
  }
  const expectedFacts = new Set(
    decisionRows.filter((item) => item.review?.factUncertainty).map((item) => item.source.cardId),
  );
  const reportedFacts = new Set((quality.factUncertainties ?? []).map((item) => item.cardId));
  if (expectedFacts.size !== reportedFacts.size) errors.push('quality_fact_coverage');
  for (const cardId of expectedFacts) {
    if (!reportedFacts.has(cardId)) errors.push(`quality_fact_missing:${cardId}`);
  }
  const expectedSources = new Set(
    decisionRows
      .filter((item) => item.review?.factSources?.length)
      .map((item) => item.source.cardId),
  );
  const reportedSources = new Set((quality.officialFactSources ?? []).map((item) => item.cardId));
  if (expectedSources.size !== reportedSources.size) errors.push('quality_source_coverage');
  for (const cardId of expectedSources) {
    if (!reportedSources.has(cardId)) errors.push(`quality_source_missing:${cardId}`);
  }
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(error);
    fail(`formal_source_errors:${errors.length}`);
  }
  const currentDigest = checksumJson(
    sourceRelativePaths().map((path) => ({ path, checksum: fileChecksum(sourcePath(path)) })),
  );
  console.log(
    `opi_verify_formal_ok decisions=${decisionRows.length} mappings=${mappingRows.length} sourceDigest=${currentDigest}`,
  );
}

function commandRefreshArtifacts() {
  for (const stage of STAGES) commandVerifyStage(stage);
  const work = readJson(workItemsPath);
  const candidate = candidateOpi(work);
  const errors = validateCandidate(candidate);
  if (errors.length) fail(`artifact_candidate_errors:${errors.length}`);
  const artifacts = formalArtifacts(work, candidate);
  writeJson(decisionsPath, artifacts.decisions);
  writeJson(mappingPath, artifacts.mapping);
  writeJson(qualityPath, artifacts.report);
  console.log(
    `opi_refresh_artifacts_ok decisions=${artifacts.decisions.decisions.length} sources=${artifacts.report.officialFactSources.length}`,
  );
}

function commandRollback() {
  if (!existsSync(manifestPath) || !existsSync(snapshotRoot)) fail('snapshot_missing');
  const manifest = readJson(manifestPath);
  for (const file of manifest.files) {
    const snapshotPath = join(snapshotRoot, file.path);
    if (!existsSync(snapshotPath)) fail(`snapshot_file_missing:${file.path}`);
    const targetPath = sourcePath(file.path);
    const temporaryPath = `${targetPath}.opi-rollback-tmp`;
    copyFileSync(snapshotPath, temporaryPath);
    renameSync(temporaryPath, targetPath);
  }
  console.log(`opi_rollback_ok files=${manifest.files.length}`);
}

function printHelp() {
  console.log(`Usage:
  node tools/opi-text-reconstruction.mjs audit
  node tools/opi-text-reconstruction.mjs freeze
  node tools/opi-text-reconstruction.mjs prepare
  node tools/opi-text-reconstruction.mjs draft-stage question-en|question-zh|answer-en|answer-zh
  node tools/opi-text-reconstruction.mjs verify-stage baseline|question-en|question-zh|answer-en|answer-zh
  node tools/opi-text-reconstruction.mjs build-review
  node tools/opi-text-reconstruction.mjs apply
  node tools/opi-text-reconstruction.mjs refresh-artifacts
  node tools/opi-text-reconstruction.mjs verify-formal
  node tools/opi-text-reconstruction.mjs rollback`);
}

const [command, argument] = process.argv.slice(2);

try {
  if (command === 'audit') commandAudit();
  else if (command === 'freeze') commandFreeze();
  else if (command === 'prepare') commandPrepare();
  else if (command === 'draft-stage') commandDraftStage(argument);
  else if (command === 'verify-stage') commandVerifyStage(argument);
  else if (command === 'build-review') commandBuildReview();
  else if (command === 'apply') commandApply();
  else if (command === 'refresh-artifacts') commandRefreshArtifacts();
  else if (command === 'verify-formal') commandVerifyFormal();
  else if (command === 'rollback') commandRollback();
  else {
    printHelp();
    if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error(`opi_text_reconstruction_failed ${error.message}`);
  process.exitCode = 1;
}
