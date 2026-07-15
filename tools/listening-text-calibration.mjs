import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const topicRoot = join(root, 'content/question-banks/banks/listening/topics');
const banksRoot = join(root, 'content/question-banks/banks');
const embeddedPath = join(root, 'src/features/question-bank/data/question-bank.json');
const workstreamRoot = join(root, 'docs/workstreams/listening-text-calibration-v1');
const generatedRoot = join(root, '.generated/listening-text-calibration-v1');
const rawAsrRoot = join(generatedRoot, 'whisper-json');
const snapshotPath = join(workstreamRoot, 'source-snapshot.json');
const reportPath = join(workstreamRoot, 'candidate-report.json');
const reportMarkdownPath = join(workstreamRoot, 'candidate-report.md');
const pilotManifestPath = join(workstreamRoot, 'pilot-manifest.json');
const transcriptPath = join(workstreamRoot, 'whisper-transcripts.json');
const decisionsPath = join(workstreamRoot, 'decisions.json');
const pilotReportPath = join(workstreamRoot, 'pilot-report.md');

const targetFields = ['audioText', 'audioTextZh', 'choices', 'correctChoiceIndex', 'referenceText'];
const textFields = ['audioText', 'audioTextZh', 'referenceText'];
const expectedTopicCounts = {
  'listening-topic-01.json': 245,
  'listening-topic-02.json': 114,
  'listening-topic-03.json': 95,
  'listening-topic-04.json': 177,
};
const externalAudioRoot = '/Users/zhouyide/Desktop/icao设计稿/public/question-bank-assets/audio/listening/main';
const patchedAudioRoot = join(root, 'content/question-banks/resources/audio/listening/main');
const legacyPaths = [
  'tools/listening-audio-mapping-audit.mjs',
  'docs/workstreams/listening-audio-mapping-audit/full-audit.json',
  'docs/workstreams/listening-audio-mapping-audit/problems.csv',
  'docs/workstreams/listening-audio-mapping-audit/report.md',
  'docs/workstreams/audio-text-calibration-15/manifest.json',
  'docs/workstreams/audio-text-calibration-15/comparison.json',
  'docs/workstreams/audio-text-calibration-15/review.json',
  'docs/workstreams/audio-text-calibration-15/report.md',
];

const airlineAliases = [
  ['Greater Bay Airlines', 'HGB'], ['Singapore Airlines', 'SIA'], ['United Airlines', 'UAL'],
  ['British Airways', 'BAW'], ['Karun Airlines', 'KRU'], ['Korean Air', 'KAL'],
  ['Scandinavian', 'SAS'], ['Boliviana', 'BOV'], ['Southwest', 'SWA'], ['Alaska', 'ASA'], ['Iran', 'IRA'],
  ['China Southern', 'CSN'], ['China Eastern', 'CES'], ['Japan Airlines', 'JAL'],
  ['Japan Airline', 'JAL'], ['Air France', 'AFR'], ['Air Canada', 'ACA'],
  ['Air China', 'CCA'], ['Japan Air', 'JAL'], ['Gulf Air', 'GFA'],
  ['Dragonair', 'HDA'], ['Northwest', 'NWA'], ['Lufthansa', 'DLH'],
  ['Speedbird', 'BAW'], ['Singapore', 'SIA'], ['Qantas', 'QFA'],
  ['Southern', 'CSN'], ['United', 'UAL'], ['Danair', 'DAN'], ['Eastern', 'EAL'],
  ['France', 'AFR'], ['Japan', 'JAL'], ['Delta', 'DAL'],
];
const chineseAirlineAliases = [
  ['大湾区航空', 'HGB'], ['新加坡航空公司', 'SIA'], ['新加坡航空', 'SIA'],
  ['日本航空公司', 'JAL'],
  ['联合航空公司', 'UAL'], ['美国联合航空', 'UAL'], ['联合航空', 'UAL'],
  ['英国航空公司', 'BAW'], ['英国航空', 'BAW'], ['中国国际航空', 'CCA'],
  ['中国南方航空', 'CSN'], ['中国东方航空', 'CES'], ['加拿大航空', 'ACA'],
  ['法国航空', 'AFR'], ['日本航空', 'JAL'], ['西北航空', 'NWA'],
  ['德国汉莎航空', 'DLH'], ['汉莎航空', 'DLH'], ['大韩航空', 'KAL'],
  ['港龙航空', 'HDA'], ['海湾航空', 'GFA'], ['荷兰皇家航空', 'KLM'],
  ['澳洲航空', 'QFA'], ['达美航空', 'DAL'], ['东方航空', 'EAL'],
  ['新加坡', 'SIA'],
  ['南方航空', 'CSN'], ['丹麦航空', 'DAN'], ['国航', 'CCA'], ['东航', 'CES'],
  ['日航', 'JAL'], ['新航', 'SIA'], ['南航', 'CSN'], ['美联航', 'UAL'],
  ['法航', 'AFR'], ['伊朗航空', 'IRA'],
  ['斯堪的纳维亚航空', 'SAS'], ['玻利维亚航空', 'BOV'], ['西南航空', 'SWA'],
  ['中国南方', 'CSN'], ['中国东方', 'CES'], ['中国国际', 'CCA'], ['南方', 'CSN'],
];
const airlineCodes = [...new Set([...airlineAliases.map((entry) => entry[1]), 'KLM', 'CES', 'GBA', 'GWL', 'TWA'])];
const callsignCodeAliases = new Map([['GBA', 'HGB'], ['HAD', 'HDA'], ['NW', 'NWA']]);
const unresolvedAirlineAliases = [
  { alias: 'Pacific 28', cardId: 'listening-main-552', decision: 'reviewed-keep-current', rationale: '人工复听确认音频为 Pacific 28，且无可靠三字代码，不猜测替换。' },
];
const ordinaryPhoneticHomographs = new Set([
  'listening-main-151:mike', 'listening-main-185:hotel', 'listening-main-206:november',
  'listening-main-241:hotel', 'listening-main-286:mike', 'listening-main-286:november',
  'listening-main-325:victor', 'listening-main-404:delta',
]);
const digitWords = new Map([
  ['zero', '0'], ['oh', '0'], ['one', '1'], ['two', '2'], ['three', '3'],
  ['four', '4'], ['five', '5'], ['six', '6'], ['seven', '7'], ['eight', '8'],
  ['nine', '9'], ['niner', '9'],
]);
const digitWordPattern = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|niner)';
const callsignNumberPattern = `(?:\\d{1,4}|${digitWordPattern}(?:\\s+${digitWordPattern}){0,3})`;
const phoneticEntries = [
  ['Alpha', 'A'], ['Bravo', 'B'], ['Charlie', 'C'], ['Delta', 'D'], ['Echo', 'E'],
  ['Foxtrot', 'F'], ['Golf', 'G'], ['Hotel', 'H'], ['India', 'I'], ['Juliett?', 'J'],
  ['Kilo', 'K'], ['Lima', 'L'], ['Mike', 'M'], ['November', 'N'], ['Oscar', 'O'],
  ['Papa', 'P'], ['Quebec', 'Q'], ['Romeo', 'R'], ['Sierra', 'S'], ['Tango', 'T'],
  ['Uniform', 'U'], ['Victor', 'V'], ['Whiskey', 'W'], ['X[- ]?Ray', 'X'], ['Yankee', 'Y'], ['Zulu', 'Z'],
];
const phoneticWordPattern = `(?:${phoneticEntries.map(([pattern]) => pattern).join('|')})`;
const phoneticMultiPattern = `${phoneticWordPattern}(?:\\s+${phoneticWordPattern})+`;

const manualAnswerOverrides = {
  'listening-main-003': {
    correctChoiceIndex: 0,
    rationale: '音频和原文明确给出低空通场不得低于 45 米，A 为唯一正确答案。',
  },
  'listening-main-076': {
    choices: { 2: 'The rudder was jammed.' },
    rationale: '原文列出右外副翼损伤、液压问题和方向舵卡阻；修正第三个事实选项后保留 D。',
  },
  'listening-main-098': {
    correctChoiceIndex: 2,
    rationale: '不能开车的直接原因是跑道正在清理，C 为唯一正确答案。',
  },
  'listening-main-440': {
    correctChoiceIndex: 0,
    rationale: '原文问题询问最初机动，机组请求并执行下降，A 为唯一正确答案。',
  },
};

const manualTextOverrides = {
  'listening-main-121': {
    audioText: 'If significant engine vibration occurs due to ice accumulation on the blades, the engine should be accelerated to a minimum of 70% N1 for approximately 15 seconds.\nQuestion: What causes the vibration?',
    audioTextZh: '如果叶片积冰导致发动机明显振动，应把发动机加速至至少70% N1，并保持约15秒。\n问题：是什么造成了发动机振动？',
    rationale: '人工复听确认时间为 15 seconds；Whisper 的 1.5 seconds 候选不采纳。保留音频中的 ice accumulation。',
  },
  'listening-main-128': {
    audioText: 'AFR 145 is currently en route from Paris to London Heathrow. The aircraft is descending to 3000 ft and requesting direct routing TLA. ATC is unable to grant the request due to conflicting traffic at 3000 ft.\nQuestion: Why did Air Traffic Control deny the request of AFR 145?',
    audioTextZh: 'AFR 145目前正在从巴黎飞往伦敦希思罗的航路上。飞机正下降至3000英尺，并请求直飞TLA。由于3000英尺处有冲突航空器，空中交通管制无法批准该请求。\n问题：空中交通管制为什么拒绝AFR 145的请求？',
    rationale: '音频为 requesting direct routing TLA，不是请求备降。',
  },
  'listening-main-148': {
    audioText: 'A runway strip, including a precision approach runway, shall, wherever practicable, extend laterally to a distance of at least 150 meters from the runway centerline where the code number is 3 or 4, and at least 75 meters where the code number is 1 or 2.\nQuestion: How does the runway strip of a precision runway extend from the runway centerline?',
    rationale: '按音频补回 wherever practicable，并修正句法。',
  },
  'listening-main-151': { replacements: [['233', '223']], rationale: '音频两次呼号均明确为 Speedbird 223。' },
  'listening-main-161': {
    audioText: 'Because an airplane is heavier than air, the wings must do something to the surrounding air to make the air support the weight of the airplane.\nQuestion: What is the man mainly talking about?',
    rationale: '现有 thrust the air 并非音频原话，按清晰音频恢复。',
  },
  'listening-main-173': {
    audioText: 'P: Tower, CCA 1452, ready for departure. C: CCA 1452, cleared for takeoff. Maintain runway heading until 1800 m, then turn right en route. Contact 126.25. P: Runway heading, 1800 m, then turn right en route. Contact 126.25, cleared for takeoff, CCA 1452.\nQuestion: What is NOT mentioned in the exchange?',
    audioTextZh: '飞行员：塔台，CCA 1452，准备离场。管制员：CCA 1452，许可起飞。保持跑道航向至1800米，然后右转加入航路，联系126.25。飞行员：跑道航向至1800米，然后右转加入航路，联系126.25，许可起飞，CCA 1452。\n问题：这段通话中没有提到什么？',
    rationale: '音频明确包含 cleared for takeoff 和 until 1800 m，原文漏记起飞许可。',
  },
  'listening-main-177': {
    audioText: 'C: AFR 201, cancel landing clearance Runway 23L due to disabled aircraft. Change to Runway 23R, cleared to land Runway 23R. P: AFR 201, unable to land Runway 23R due to a braking problem. We need the longer runway. C: AFR 201, go around immediately. Turn left heading 140 for vectors to ILS Runway 23L. Climb and maintain 4000 ft. The runway will be available in five minutes.\nQuestion: Why can’t they land on Runway 23R?',
    audioTextZh: '管制员：AFR 201，由于有故障航空器，取消23L跑道着陆许可，改用23R跑道，许可在23R跑道着陆。飞行员：AFR 201，由于制动问题，无法在23R跑道着陆。我们需要更长的跑道。管制员：AFR 201，立即复飞。左转航向140，雷达引导至23L跑道ILS，爬升并保持4000英尺。该跑道将在五分钟后可用。\n问题：他们为什么不能在23R跑道着陆？',
    rationale: '音频在机组拒绝23R后仍有完整复飞、航向、高度和五分钟可用指令，原文漏句。',
  },
  'listening-main-179': {
    audioText: 'P: Tower, Qantas 332, we are approaching the holding point. C: Qantas 332, taxi into position and hold. Caution wake turbulence of the departing aircraft. Stand by for departure. P: Taxi into position and hold.\nQuestion: What should the pilot be careful about?',
    rationale: '删除音频中不存在的 caution 释义注记。',
  },
  'listening-main-189': {
    audioText: 'An aircraft has just taken off. The crew expects to turn right and proceed to waypoint YB, which is the exit point on the SID. As they pass 600 m, Departure Control instructs them to turn right and proceed direct to VINI, a waypoint that the crew does not understand or recognize. So the crew decides to contact Departure Control.\nQuestion: Why does the crew need to contact Departure Control?',
    rationale: '修正 ex-point 等明显错听，并按音频恢复 exit point 和 direct。',
  },
  'listening-main-196': {
    audioText: 'C: CES 147, do you want medical personnel to meet you at the gate or on a taxiway after you exit the runway? P: CES 147, we’ll exit onto N. We’d like the medical personnel to meet us there.\nQuestion: Where does CES 147 want the medical personnel to meet them?',
    rationale: '按音频恢复 after you exit the runway 与 exit onto N。',
  },
  'listening-main-198': { replacements: [['heading now 230', 'heading now 320'], ['航向230', '航向320']], rationale: '音频明确逐位读作 heading three two zero。' },
  'listening-main-206': {
    audioText: 'A British Airways Boeing 737 skidded off the runway at Orly Airport in Paris on November 16, 2006, while landing in bad weather. There were no fatalities, although ten passengers and two crew members were injured. The airplane sustained minor undercarriage damage.\nQuestion: How many people died in the accident in Paris?',
    audioTextZh: '2006年11月16日，一架英国航空波音737在恶劣天气中着陆时冲出巴黎奥利机场跑道。事故没有造成人员死亡，但10名乘客和2名机组成员受伤，飞机起落架受到轻微损伤。\n问题：巴黎的这起事故中有多少人死亡？',
    rationale: '人工复听确认开头为 A British Airways Boeing 737；普通叙述中的航司名称不按呼号代码替换。Orly Airport 和 minor undercarriage damage 保持音频事实。',
  },
  'listening-main-326': {
    audioText: 'Good morning, ladies and gentlemen, from the flight deck. Welcome aboard Transworld Airlines Flight 455 to St. Louis. We have leveled off and are cruising at 35000ft. We are turning off the fasten-seat-belt signs now, but for your safety, please keep your seat belts fastened while in your seat.\nQuestion: Which of the following is Flight 455 now doing?',
    audioTextZh: '女士们、先生们，早上好，这里是驾驶舱广播。欢迎乘坐环球航空455号航班前往圣路易斯。我们已经改平，正在35000英尺巡航。现在将关闭安全带指示灯，但为了安全，请在座位上时继续系好安全带。\n问题：455号航班目前正在做什么？',
    rationale: '人工复听确认客舱广播中的航司名称为 Transworld Airlines，不是 Tristar Airlines；同步规范 Flight 455 的空格。',
  },
  'listening-main-132': {
    audioText: 'P: Tower, CSN 348, ready for approach. C: CSN 348, roger. Exit hold and proceed direct to IKUBA, cleared IKUBA-01A, Runway 04. P: Exit hold and proceed direct to IKUBA, cleared IKUBA-01A, Runway 04, CSN 348.\nQuestion: What should CSN 348 do?',
    audioTextZh: '飞行员：塔台，CSN 348，已准备好进近。\n管制员：CSN 348，收到。离开等待，直飞IKUBA，允许执行IKUBA-01A 进场，使用04号跑道。\n飞行员：离开等待，直飞IKUBA，执行IKUBA-01A 进场，使用04号跑道，CSN 348。\n问题：CSN 348应该做什么？',
    rationale: '人工复听确认航路点为 IKUBA，进场代号为 IKUBA-01A；英文原文补齐进场代号短线。',
  },
  'listening-main-609': {
    audioText: 'P: Hong Kong Tower, AFR 985, long final. C: AFR 985, Hong Kong Tower, number 2, wind calm. P: Number 2, AFR 985.\nQuestion: what is the landing sequence for AFR 985?',
    audioTextZh: '飞行员（P）：香港塔台，AFR 985，长五边。\n管制员（C）：AFR 985，香港塔台，（你是）第二个（降落），静风。\n飞行员（P）：明白是第二个（降落），AFR 985。\n问题：AFR 985的降落顺序是什么？',
    rationale: '人工复听确认风况为 wind calm，不是 wind come；中文同步改为“静风”。',
  },
  'listening-main-220': {
    audioText: 'C: ATC clears NWA 146 via flight-planned track to destination Orange County, VORTEX-1 departure, Runway 23R, squawk 2512. Call radar 125.6 when airborne.\nQuestion: What is the squawk code?',
    audioTextZh: '管制员：空中交通管制许可NWA 146按飞行计划航路飞往目的地Orange County，执行VORTEX-1离场，使用23R跑道，应答机编码2512。离地后在125.6联系雷达管制。\n问题：应答机编码是多少？',
    rationale: '音频为 Orange County 和 Vortex 1 departure，删除错误的 Arch County Standard。',
  },
  'listening-main-228': {
    audioText: 'Precision approach runway CAT IIIA is intended for operations down to an RVR of the order of 200 m, with no decision height being applicable, using visual aids during the final phase of landing. CAT IIIB is intended down to an RVR of the order of 50 m, with no decision height being applicable, using visual aids for taxiing.\nQuestion: What is the minimum standard for CAT IIIA operation?',
    audioTextZh: '精密进近CAT IIIA跑道适用于RVR约200米、不设决断高，并在着陆最后阶段使用目视助航设备的运行。CAT IIIB适用于RVR约50米、不设决断高，并在滑行时使用目视助航设备的运行。\n问题：CAT IIIA运行的最低标准是什么？',
    rationale: '音频明确CAT IIIB为50米，原文误写15米，并修复整句错听。',
  },
  'listening-main-229': {
    audioText: 'The major refueling hazard is the possible combustion of the fuel by a spark that causes fumes to ignite. The most probable cause of a spark is static electricity discharged between the refueling equipment and the aircraft.\nQuestion: What may cause a spark when refueling?',
    rationale: '按音频补回 spark causes fumes to ignite。',
  },
  'listening-main-236': {
    audioText: 'P: Shanghai, CES 324, good evening, maintaining 9500 m, squawk 3426. C: CES 324, roger, offset right 3 miles. P: Negative offset. We are a B737-500 with no automatic offset tracking capability, CES 324. C: CES 324, roger, fly flight-planned route.\nQuestion: Why did CES 324 not fly the offset?',
    audioTextZh: '飞行员：上海，CES 324，晚上好，保持9500米，应答机编码3426。管制员：CES 324，收到，向右偏置3海里。飞行员：无法偏置，我们是B737-500，没有自动偏置航迹跟踪能力，CES 324。管制员：CES 324，收到，按飞行计划航路飞行。\n问题：CES 324为什么没有偏置飞行？',
    rationale: '音频明确为 offset right 3 miles，原文误记为 to L。',
  },
  'listening-main-238': { replacements: [['B737', 'B747'], ['波音737', '波音747']], rationale: '音频明确冲突飞机为 Boeing 747。' },
  'listening-main-246': {
    audioText: 'Federal regulations specify when you must use supplemental oxygen. If you are planning a flight with a cruise altitude over 12,000 ft, you should consult these regulations. As a general rule, consider using supplemental oxygen when you fly above 10,000 ft during the day or above 5,000 ft at night.\nQuestion: When, generally speaking, should supplemental oxygen be used?',
    rationale: '修正 a1titudeof 等错字并按音频恢复完整句法。',
  },
  'listening-main-247': {
    audioText: 'The safety investigation showed that the flight was under time pressure because of duty time limits for the crew. Fog was rolling in, and visibility was near or below the minimum for legal takeoff. If they did not take off soon, they would have to return to the gate and delay the flight for another day, so the captain decided to take off immediately.\nQuestion: Why did the captain decide to take off in poor conditions?',
    rationale: '音频为 time pressure because of duty time limits，修正 tired pressure 等明显错听。',
  },
  'listening-main-250': {
    audioText: 'Forecast conditions in the Shanghai area this morning: expect ceiling 900 m broken with 3000 m overcast, visibility 4000 m reducing to 1000 m in heavy rain showers, wind 320 degrees at 10 m/s, gusting to 15 m/s.\nQuestion: Which statement is not correct?',
    audioTextZh: '今天上午上海地区预报：云底高900米，多云；3000米，阴天。能见度4000米，在强阵雨中降低至1000米。风向320度，风速每秒10米，阵风每秒15米。\n问题：以下哪项说法不正确？',
    rationale: '音频明确为 heavy rain showers。',
  },
  'listening-main-266': {
    audioText: 'Aircraft manufacturers are using lighter materials to construct aircraft and reduce fuel costs. However, some newer aircraft may not be as effective at surviving lightning strikes as older aircraft built with aluminum, a good conductor. The carbon-fiber wingtips of some regional planes are an example. In a recent incident, the wingtip of a CRJ was reportedly damaged by lightning.\nQuestion: What safety problem may new aircraft have due to lighter-weight materials?',
    audioTextZh: '飞机制造商正在使用更轻的材料制造飞机，以降低燃油成本。然而，与使用铝材这种良好导体制造的老式飞机相比，一些新飞机抵御雷击的能力可能较弱。一些支线飞机的碳纤维翼尖就是例子。近期事件中曾报告一架CRJ的翼尖遭雷击受损。\n问题：由于采用轻质材料，新飞机可能面临什么安全问题？',
    rationale: '音频为 carbon-fiber wingtips of some regional planes，修正 cargo/original planes。',
  },
  'listening-main-273': { replacements: [['NWA 40', 'NWA 14'], ['NWA40', 'NWA 14'], ['西北航空40', 'NWA 14']], rationale: '音频两次呼号均为 Northwest 14 Heavy。' },
  'listening-main-277': { replacements: [['3248', '3428']], rationale: '管制员复诵的呼号同样为ACA 3428，原文把中间两位颠倒。' },
  'listening-main-278': {
    audioText: 'P1: Take the next right. P2: Are you sure? This is a runway. We must have missed the turn. Tell Ground we are holding for instructions. C: CCA 001, I was just about to call you. You missed T. You may proceed down Runway 5L; it is not active. Turn left on E, then right on S to the runway. Try not to miss S, or you will be on the active runway.\nQuestion: What did the crew do wrong?',
    audioTextZh: '飞行员1：在下一个路口右转。飞行员2：你确定吗？这是跑道。我们一定错过转弯了。告诉地面管制，我们正在等待指令。管制员：CCA 001，我正要呼叫你。你们错过了T滑行道，可以沿当前未使用的5L跑道继续，左转进入E滑行道，再右转进入S滑行道前往跑道。不要再错过S滑行道，否则你们将进入正在使用的跑道。\n问题：机组做错了什么？',
    rationale: '按音频修正错句并确认呼号CCA 001、T/E/S滑行道和5L跑道。',
  },
  'listening-main-286': {
    audioText: 'P1: Did you hear what Captain Michael said? There was something about the date when our flight plan reports would be due. P2: Yes. He said we could hand the flight plan reports in whenever we had finished the filing, but they must be in on November 13, if not before.\nQuestion: When would the flight plan reports be given to the captain?',
    audioTextZh: '男1：你听到Michael机长说什么了吗？他说到了飞行计划报告的截止日期。男2：听到了。他说完成填写后随时可以上交，但最迟必须在11月13日提交。\n问题：飞行计划报告什么时候交给机长？',
    rationale: '音频为 Captain Michael、reports would be due 和 must be in，修正原文错听。',
  },
  'listening-main-306': {
    audioText: 'Last week, while we were preparing to push back, I got a call from the purser. One of the passengers was yelling at another passenger. I immediately called for security to come onto the plane and take the passenger off. The passenger was very big and heavy, so there was quite a struggle. But eventually he was taken off, and we were able to be on our way.\nQuestion: Why did security have to come onto the plane?',
    audioTextZh: '上周我们准备推出时，我接到乘务长电话，说有一名乘客正对另一名乘客大喊大叫。我立即呼叫安保人员登机，将该乘客带下飞机。那名乘客身材高大、体重很重，带离过程相当费力。但他最终被带下飞机，我们得以继续行程。\n问题：安保人员为什么必须登机？',
    rationale: '按音频补回最终带离乘客并继续行程的结尾。',
  },
  'listening-main-307': {
    audioText: 'The localizer transmitter is situated on the extended runway centerline beyond the stop end. The localizer beam normally defines the runway centerline and extends along the approach path for 25 miles, with 40 ILS channels in the frequency range from 108.10 to 111.95 MHz, to provide pilots with course guidance.\nQuestion: What is the localizer used for?',
    audioTextZh: '航向台发射机位于跑道停止端之外的跑道中线延长线上。航向道波束通常确定跑道中线，并沿进近航迹延伸25海里；ILS共有40个频道，频率范围为108.10至111.95 MHz，为飞行员提供航向引导。\n问题：航向道有什么用途？',
    rationale: '音频明确为40个频道和108.10至111.95 MHz。',
  },
  'listening-main-314': { replacements: [['B737', 'B747'], ['波音737', '波音747']], rationale: '音频明确冲突飞机为 United 747。' },
  'listening-main-318': { replacements: [['29\\.1', '29.81']], rationale: '音频清晰读作QNH 29.81。' },
  'listening-main-348': {
    audioText: 'M1: Have you heard the ATC broadcast that RVSM operations will begin in 30 minutes? M2: Yes. All aircraft departing from or entering China’s sovereign airspace need to fly a level between 8900 m and 12500 m inclusive, in accordance with the China RVSM level allocation.\nQuestion: What was the conversation about?',
    audioTextZh: '男1：你听到空中交通管制广播说，RVSM运行将在30分钟后开始吗？男2：听到了。按照中国RVSM高度层分配，所有离开或进入中国主权空域的航空器都需要使用8900米至12500米（含）之间的高度层。\n问题：这段对话谈论的是什么？',
    rationale: '音频明确为 departing from or entering China’s sovereign airspace，最高12500米。',
  },
  'listening-main-354': { replacements: [['5469', '6549']], rationale: '音频呼号逐位读作 six five four niner。' },
  'listening-main-357': {
    audioText: 'P: Ground, AFR 121, stand Z4, information F, ready for pushback and startup. C: AFR 121, the tug AB assigned to push you back has malfunctioned. I am working on sending another tug. Stand by. P: Wilco, AFR 121.\nQuestion: Why does the controller ask AFR 121 to wait?',
    rationale: '音频为指定的tug AB，并非泛指blue tug。',
  },
  'listening-main-370': {
    audioText: 'The FT does not include levels within 1500 ft of the station elevation, and temperatures are not forecast for the 3000-foot level or for a level within 2500 ft of the station elevation. At Denver, for example, the forecast for the lower two levels is omitted because the station elevation is over 5000 ft.\nQuestion: Which of the following is the elevation of Denver Airport?',
    rationale: '按音频恢复Denver示例中 lower two levels is omitted。',
  },
  'listening-main-379': { replacements: [['one minute ago', 'ten minutes ago'], ['一分钟前', '十分钟前']], rationale: '音频明确逐位读作 one zero minutes ago。' },
  'listening-main-390': {
    audioText: 'In a serious emergency situation, pilots may make a MAYDAY call requiring immediate assistance. In other serious situations, pilots make PAN PAN calls. PAN means possible assistance needed. This is used when there is a state of urgency, but the danger is not life-threatening right now. The pilot may request advice and take necessary steps to fix the problem.\nQuestion: What does the PAN PAN abbreviation P.A.N. mean?',
    rationale: '按音频恢复state of urgency与request advice，删除自由改写。',
  },
  'listening-main-396': { replacements: [['(?<!7)306', '7306']], rationale: '音频全部呼号均逐位读作 seven three zero six；裸China按上下文统一为CSN。' },
  'listening-main-412': { replacements: [['heading 150', 'heading 050'], ['航向150', '航向050']], rationale: '音频明确为heading zero five zero，且选项A与该事实一致。' },
  'listening-main-416': {
    audioText: 'P: Tower, AFR 973, we rejected takeoff because red lights on the panel came on before V1. Request vacating the runway immediately, and we’ll figure out what is going on. C: AFR 973, vacate the runway at your first convenient intersection. Taxi via B6 to Number 2 apron.\nQuestion: What caused AFR 973 to abort takeoff?',
    audioTextZh: '飞行员：塔台，AFR 973，V1前仪表板上的红色警告灯亮起，因此我们中断了起飞。请求立即脱离跑道并查明原因。管制员：AFR 973，从第一个合适的交叉口脱离，经B6滑往2号停机坪。\n问题：什么原因导致AFR 973中断起飞？',
    rationale: '音频为we’ll figure out what is going on，并补全vacate runway。',
  },
  'listening-main-432': {
    audioText: 'P: Tianjin Tower, CCA 996, we have found some rubber on the runway. Have you heard any reports from aircraft that have departed from this runway recently? C: CCA 996, negative. You are the first reporter. Where exactly have you found the debris?\nQuestion: What did the pilot report?',
    audioTextZh: '飞行员：天津塔台，CCA 996，我们发现跑道上有一些橡胶碎片。最近是否有从该跑道离场的航空器报告过情况？管制员：CCA 996，没有，你们是第一个报告者。你们具体在哪里发现这些碎片？\n问题：飞行员报告了什么？',
    rationale: '音频在first reporter后仍有询问碎片具体位置的完整句，原文漏记。',
  },
  'listening-main-434': { replacements: [['26L', '36L'], ['26L跑道', '36L跑道']], rationale: '音频明确逐位读作Runway 36L。' },
  'listening-main-443': {
    audioText: 'During the ground roll, the airplane’s direction of movement may be changed by carefully applying pressure on one brake or uneven pressure on each brake in the desired direction.\nQuestion: How should you control the direction with brakes during ground roll?',
    rationale: '修正careful plan of pressure等明显错听，按音频恢复完整操作描述。',
  },
  'listening-main-448': { replacements: [['785', '782']], rationale: '音频全部呼号均明确为Japan Air 782。' },
  'listening-main-485': {
    audioText: 'Single-engine aircraft will normally reject any takeoff after an engine failure, regardless of speed, as there is no power available to continue the takeoff. Even if the airplane is already airborne, if sufficient runway remains, an attempt to land straight ahead on the runway may be made. This may also apply to some light twin-engine airplanes.\nQuestion: What will a single-engine aircraft do when an engine fails in the phase of takeoff?',
    rationale: '删除runway way等错字，并按音频恢复phase of takeoff。',
  },
  'listening-main-584': {
    audioText: 'Oklahoma City, Oklahoma City radar report, 35 observation. A line of eight-tenths coverage thunderstorms with heavy rain showers is extending from 40 to 60 south-southeast to 115 south-southwest of Oklahoma City, 15 miles wide, line moving northeast at 25, max top 57,000, 65 southeast of Oklahoma City.\nQuestion: What is the position of the thunderstorms?',
    rationale: '音频明确为max top 57,000，修正原文断裂的5, 7000，并整理方位连字符。',
  },
  'listening-main-623': {
    audioText: 'CCA 101, cleared to WG 042 radial, 20 kilometers DME. Hold on the 042 radial of the WG VOR at 20 kilometers DME. Maintain 3000 meters, inbound track 222, left-hand pattern. Expect further clearance at 1325.\nQuestion: On which radial of WG VOR should the aircraft hold?',
    rationale: '音频为radial而非radio，并修正等待指令断句。',
  },
};

// These corrections were confirmed by a human after the v1 candidate report was frozen.
// Keep the historical report intact, but layer the confirmed values onto its expected state
// so verify/apply cannot restore the superseded Whisper-based decisions.
const postCalibrationCorrectionIds = [
  'listening-main-121', 'listening-main-206', 'listening-main-326',
  'listening-main-132', 'listening-main-609',
];

const duplicateDecisions = [
  { cardIds: ['listening-main-085', 'listening-main-144'], decision: 'keep', rationale: '不同音频文件、相同考点，选项顺序不同且答案均指向机长。' },
  { cardIds: ['listening-main-129', 'listening-main-430'], decision: 'keep', rationale: '不同音频文件、相同题文和答案，作为独立题保留。' },
  { cardIds: ['listening-main-147', 'listening-main-387'], decision: 'keep', rationale: '不同音频文件、相同题文和答案，作为独立题保留。' },
  { cardIds: ['listening-main-140', 'listening-main-440'], decision: 'keep-and-fix-answer', rationale: '不同音频文件、相同题文；440 的答案索引修正为下降。' },
  { cardIds: ['listening-main-146', 'listening-main-386'], decision: 'keep', rationale: '不同音频文件、相同题文和答案，作为独立题保留。' },
  { cardIds: ['listening-main-057', 'listening-main-086'], decision: 'keep', rationale: '中文相同但英文存在轻微措辞差异，两个音频文件独立。' },
];

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

function hash(value) {
  const input = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);
  return createHash('sha256').update(input).digest('hex');
}

function fileHash(path) {
  return hash(readFileSync(path));
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripTargetFields(value) {
  if (Array.isArray(value)) return value.map(stripTargetFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !targetFields.includes(key))
    .map(([key, child]) => [key, stripTargetFields(child)]));
}

function directoryJsonHash(path) {
  const files = [];
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const child = join(current, name);
      if (statSync(child).isDirectory()) walk(child);
      else if (name.endsWith('.json')) files.push([child.slice(path.length + 1), fileHash(child)]);
    }
  };
  walk(path);
  return hash(files);
}

function loadTopics() {
  return readdirSync(topicRoot).filter((name) => name.endsWith('.json')).sort().map((name) => ({
    name,
    path: join(topicRoot, name),
    topic: readJson(join(topicRoot, name)),
  }));
}

function audioPathForCard(card) {
  const filename = basename(card.audio);
  const patched = join(patchedAudioRoot, filename);
  const external = join(externalAudioRoot, filename);
  if (existsSync(patched)) return patched;
  if (existsSync(external)) return external;
  fail(`missing_audio:${card.id}:${filename}`);
}

function parseCallsignNumber(value) {
  if (/^\d+$/.test(value)) return value;
  return value.trim().split(/\s+/).map((word) => digitWords.get(word.toLowerCase())).join('');
}

function normalizeCallsigns(value) {
  let output = value;
  for (const [alias, code] of airlineAliases) {
    const pattern = new RegExp(`\\b${escapeRegex(alias).replaceAll(' ', '\\s+')}\\s*,?\\s*(${callsignNumberPattern})\\b`, 'gi');
    output = output.replace(pattern, (_match, number) => `${code} ${parseCallsignNumber(number)}`);
  }
  for (const [alias, code] of chineseAirlineAliases) {
    output = output.replace(new RegExp(`${escapeRegex(alias)}\\s*(\\d{1,4})`, 'g'), (_match, number) => `${code} ${number}`);
  }
  const codePattern = airlineCodes.join('|');
  output = output.replace(new RegExp(`\\b(${codePattern})\\s*,?\\s*(${callsignNumberPattern})\\b`, 'g'), (_match, code, number) => {
    const canonicalCode = code.toUpperCase() === 'GBA' ? 'HGB' : code.toUpperCase();
    return `${canonicalCode} ${parseCallsignNumber(number)}`;
  });
  for (const [alias, code] of callsignCodeAliases) {
    output = output.replace(new RegExp(`\\b${alias}\\s*,?\\s*(${callsignNumberPattern})\\b`, 'g'), (_match, number) => `${code} ${parseCallsignNumber(number)}`);
  }
  output = output.replace(/西南\s*346/g, 'SWA 346');
  return output;
}

function phoneticCode(value) {
  const matches = value.match(new RegExp(phoneticWordPattern, 'gi')) ?? [];
  return matches.map((word) => {
    const normalized = word.toLowerCase().replace(/[- ]/g, '');
    if (normalized.startsWith('juliet')) return 'J';
    if (normalized === 'xray') return 'X';
    const entry = phoneticEntries.find(([pattern]) => new RegExp(`^(?:${pattern})$`, 'i').test(word));
    if (!entry) fail(`unknown_phonetic:${word}`);
    return entry[1];
  }).join('');
}

function derivedCodeNumbers(value) {
  const derived = [];
  const pattern = new RegExp(`\\b(${phoneticMultiPattern})\\s+(\\d+)(?:\\s+(${phoneticWordPattern}))?\\b`, 'gi');
  for (const match of value.matchAll(pattern)) derived.push({ code: phoneticCode(match[1]), number: match[2], suffix: match[3] ? phoneticCode(match[3]) : '' });
  return derived;
}

function normalizePhonetics(value, derived) {
  let output = value;
  output = output.replace(
    new RegExp(`\\b(stand)\\s+(${phoneticWordPattern})\\s+(${digitWordPattern}(?:\\s+${digitWordPattern}){0,3})\\b`, 'gi'),
    (_match, context, word, number) => `${context} ${phoneticCode(word)}${parseCallsignNumber(number)}`,
  );
  output = output.replace(
    new RegExp(`\\b(${phoneticMultiPattern})\\s+(\\d+)(?:\\s+(${phoneticWordPattern}))?\\b`, 'gi'),
    (_match, prefix, number, suffix = '') => `${phoneticCode(prefix)}${number}${suffix ? phoneticCode(suffix) : ''}`,
  );
  output = output.replace(
    new RegExp(`\\b(${phoneticWordPattern})\\s+(\\d+)(?:\\s+(${phoneticWordPattern}))?\\b`, 'gi'),
    (match, prefix, number, suffix = '') => {
      if (/^November$/i.test(prefix) && Number(number) >= 1 && Number(number) <= 31 && !suffix) return match;
      if (/^Delta$/i.test(prefix) && !suffix) return match;
      return `${phoneticCode(prefix)}${number}${suffix ? phoneticCode(suffix) : ''}`;
    },
  );
  output = output.replace(
    new RegExp(`\\b(\\d+)\\s+(${phoneticWordPattern})\\b`, 'gi'),
    (_match, number, suffix) => `${number}${phoneticCode(suffix)}`,
  );
  output = output.replace(new RegExp(`\\b(${phoneticMultiPattern})\\b`, 'gi'), (_match, sequence) => phoneticCode(sequence));
  output = output.replace(
    new RegExp(`\\b(information|at|via|over|passing|taxiway|intersection|point|onto|missed)\\s+(${phoneticWordPattern})\\b`, 'gi'),
    (_match, context, word) => `${context} ${phoneticCode(word)}`,
  );
  output = output.replace(new RegExp(`\\b(${phoneticWordPattern})\\s+(outer|inner)\\b`, 'gi'), (_match, word, context) => `${phoneticCode(word)} ${context}`);
  output = output.replace(new RegExp(`\\b(${phoneticWordPattern})\\s*(滑行道|情报|导航台)`, 'gi'), (_match, word, context) => `${phoneticCode(word)}${context}`);
  output = output.replace(new RegExp(`(滑行道|情报|导航台|经)\\s*(${phoneticWordPattern})(?=\\s|滑|计|航|[，。；、])`, 'gi'), (_match, context, word) => `${context}${phoneticCode(word)}`);
  output = output.replace(new RegExp(`\\b(${phoneticWordPattern})(?=\\s*计划航线)`, 'gi'), (_match, word) => phoneticCode(word));
  output = output.replace(
    new RegExp(`滑行道(${phoneticWordPattern})\\s*与\\s*(${phoneticWordPattern})(?=交汇)`, 'gi'),
    (_match, left, right) => `滑行道${phoneticCode(left)}与${phoneticCode(right)}`,
  );
  output = output.replace(
    new RegExp(`\\b(intersection\\s+of\\s+taxiway\\s+[A-Z])\\s+and\\s+(${phoneticWordPattern})\\b`, 'gi'),
    (_match, context, word) => `${context} and ${phoneticCode(word)}`,
  );
  for (const item of derived) {
    output = output.replace(new RegExp(`\\b${item.code}\\s+${item.number}${item.suffix}\\b`, 'g'), `${item.code}${item.number}${item.suffix}`);
  }
  return output;
}

function normalizeProcedures(value) {
  let output = value.replace(
    new RegExp(`\\b(?!number\\b|runway\\b)([A-Za-z]{1,12})\\s+(${digitWordPattern})\\s+(arrival|departure)\\b`, 'gi'),
    (_match, code, number, term) => `${code.toUpperCase()}-${parseCallsignNumber(number)} ${term.toLowerCase()}`,
  );
  output = output.replace(
    /\b(?!number\b|runway\b)([A-Za-z]{1,12})\s*-?\s*(\d{1,2})([A-Za-z]?)\s+(arrival|departure)\b/gi,
    (_match, code, number, suffix, term) => `${code.toUpperCase()}-${number}${suffix.toUpperCase()} ${term.toLowerCase()}`,
  );
  output = output.replace(
    /\b([A-Za-z]{1,12})\s*-?\s*(\d{1,2})([A-Za-z]?)\s*号?\s*(进场|离场)/g,
    (_match, code, number, suffix, term) => `${code.toUpperCase()}-${number}${suffix.toUpperCase()} ${term}`,
  );
  output = output.replace(/悉尼\s*1\s*号?\s*离场/g, 'SYDNEY-1 离场');
  return output;
}

function normalizeRunway(value) {
  return value
    .replace(/\brunway\s+(\d{1,2})\s+(left|right|center|centre)\b/gi, (_match, number, side) => {
      const suffix = /^left$/i.test(side) ? 'L' : /^right$/i.test(side) ? 'R' : 'C';
      return `runway ${number}${suffix}`;
    })
    .replace(/\brunway\b/gi, 'runway')
    .replace(/\brunway(?=\s+\d{1,2}(?:[LRC])?\b)/g, 'Runway');
}

function normalizeEnglishStructure(value) {
  let output = value
    .replace(/(^|[\n ])PIL\s*[：:]\s*/g, '$1P: ')
    .replace(/(^|[\n ])(P|C|CTL|APP|GND|DIS|FO|M|W|B|ATC)\s*[：:]\s*/g, '$1$2: ')
    .trim();
  const matches = [...output.matchAll(/\bQuestion\b/gi)];
  if (matches.length) {
    const index = matches.at(-1).index;
    const before = output.slice(0, index).trimEnd();
    const question = output.slice(index + matches.at(-1)[0].length).replace(/^\s*[:：.]?\s*/, '').trim();
    output = `${before}\nQuestion: ${question}`;
  }
  return output;
}

function normalizeChineseStructure(value) {
  const markedMatches = [...value.matchAll(/问题\s*[:：]/g)];
  const matches = markedMatches.length ? markedMatches : [...value.matchAll(/问题/g)];
  if (!matches.length) return value.trim();
  const index = markedMatches.length ? matches[0].index : matches.at(-1).index;
  const before = value.slice(0, index).trimEnd();
  const question = value.slice(index + matches.find((match) => match.index === index)[0].length).replace(/^\s*[:：.]?\s*/, '').trim();
  return `${before}\n问题：${question}`;
}

function transformString(value, field, derived) {
  let text = value;
  const transformations = [];
  const apply = (ruleId, transform) => {
    const before = text;
    text = transform(text);
    if (text !== before) transformations.push(ruleId);
  };
  apply('ICAO-LISTENING-001', (input) => normalizePhonetics(input, derived));
  apply('CALLSIGN-LISTENING-001', normalizeCallsigns);
  apply('PROCEDURE-LISTENING-001', normalizeProcedures);
  apply('RUNWAY-LISTENING-001', normalizeRunway);
  if (field === 'audioText') apply('STRUCTURE-LISTENING-001', normalizeEnglishStructure);
  if (field === 'audioTextZh') apply('STRUCTURE-LISTENING-002', normalizeChineseStructure);
  return { text, transformations };
}

function transformCard(card) {
  const manualText = manualTextOverrides[card.id];
  const base = {
    audioText: manualText?.audioText ?? card.audioText,
    audioTextZh: manualText?.audioTextZh ?? card.audioTextZh,
    choices: structuredClone(card.choices),
  };
  for (const [pattern, replacement] of manualText?.replacements ?? []) {
    const replace = (value) => value.replace(new RegExp(pattern, 'g'), replacement);
    base.audioText = replace(base.audioText);
    base.audioTextZh = replace(base.audioTextZh);
    base.choices = base.choices.map(replace);
  }
  const derived = derivedCodeNumbers(base.audioText);
  const transformed = {};
  const rulesByField = {};
  for (const field of textFields.slice(0, 2)) {
    const result = transformString(base[field], field, derived);
    transformed[field] = result.text;
    rulesByField[field] = [...(base[field] === card[field] ? [] : ['AUDIO-EVIDENCED-LISTENING-001']), ...result.transformations];
  }
  transformed.choices = base.choices.map((choice) => transformString(choice, 'choice', derived).text);
  rulesByField.choices = [
    ...(JSON.stringify(base.choices) === JSON.stringify(card.choices) ? [] : ['AUDIO-EVIDENCED-LISTENING-001']),
    ...new Set(base.choices.flatMap((choice) => transformString(choice, 'choice', derived).transformations)),
  ];
  transformed.correctChoiceIndex = card.correctChoiceIndex;
  rulesByField.correctChoiceIndex = [];
  const override = manualAnswerOverrides[card.id];
  if (override?.choices) {
    for (const [index, value] of Object.entries(override.choices)) transformed.choices[Number(index)] = value;
    rulesByField.choices.push('ANSWER-LISTENING-001');
  }
  if (override?.correctChoiceIndex !== undefined) {
    transformed.correctChoiceIndex = override.correctChoiceIndex;
    rulesByField.correctChoiceIndex.push('ANSWER-LISTENING-001');
  }
  const letter = String.fromCharCode(65 + transformed.correctChoiceIndex);
  transformed.referenceText = `正确答案：${letter}. ${transformed.choices[transformed.correctChoiceIndex]}`;
  rulesByField.referenceText = transformed.referenceText === card.referenceText ? [] : ['ANSWER-LISTENING-002'];
  return { transformed, rulesByField };
}

function loadState() {
  const topics = loadTopics();
  const currentById = {};
  const expectedById = {};
  const metadataById = {};
  const changes = [];
  for (const entry of topics) {
    if (entry.topic.cards.length !== expectedTopicCounts[entry.name]) fail(`unexpected_topic_count:${entry.name}:${entry.topic.cards.length}`);
    for (const card of entry.topic.cards) {
      if (currentById[card.id]) fail(`duplicate_card:${card.id}`);
      if (!Array.isArray(card.choices) || card.choices.length !== 4) fail(`invalid_choices:${card.id}`);
      if (!Number.isInteger(card.correctChoiceIndex) || card.correctChoiceIndex < 0 || card.correctChoiceIndex > 3) fail(`invalid_index:${card.id}`);
      const number = card.id.match(/^listening-main-(\d{3})$/)?.[1];
      if (!number || card.audio !== `/question-bank-assets/audio/listening/main/${number}.mp3`) fail(`noncanonical_audio:${card.id}:${card.audio}`);
      const localAudioPath = audioPathForCard(card);
      currentById[card.id] = Object.fromEntries(targetFields.map((field) => [field, structuredClone(card[field])]));
      const result = transformCard(card);
      expectedById[card.id] = result.transformed;
      metadataById[card.id] = {
        audio: card.audio,
        categoryId: entry.topic.categoryId,
        localAudioPath,
        taskTitle: card.taskTitle,
        topicFile: entry.name,
        topicId: entry.topic.id,
      };
      for (const field of targetFields) {
        if (JSON.stringify(card[field]) !== JSON.stringify(result.transformed[field])) changes.push({
          after: result.transformed[field],
          before: card[field],
          cardId: card.id,
          field,
          rules: result.rulesByField[field],
          topicFile: entry.name,
        });
      }
    }
  }
  if (Object.keys(currentById).length !== 631) fail(`unexpected_card_count:${Object.keys(currentById).length}`);
  return { changes, currentById, expectedById, metadataById, topics };
}

function createSnapshot(state) {
  const embedded = readJson(embeddedPath);
  const listening = embedded.find((bank) => bank.id === 'listening');
  if (!listening) fail('missing_embedded_listening');
  const otherBankDirs = readdirSync(banksRoot).filter((name) => name !== 'listening').sort().map((name) => join(banksRoot, name));
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    cardCount: 631,
    fields: state.currentById,
    metadataById: state.metadataById,
    audioChecksums: Object.fromEntries(Object.entries(state.metadataById).map(([id, item]) => [id, fileHash(item.localAudioPath)])),
    sourceTopicNonTargetChecksums: Object.fromEntries(state.topics.map((entry) => [entry.name, hash(stripTargetFields(entry.topic))])),
    embeddedListeningNonTargetChecksum: hash(stripTargetFields(listening)),
    embeddedOtherBanksChecksum: hash(embedded.filter((bank) => bank.id !== 'listening')),
    otherSourceBanksChecksum: hash(otherBankDirs.map((path) => [basename(path), directoryJsonHash(path)])),
    legacyArtifactChecksums: Object.fromEntries(legacyPaths.map((path) => [path, fileHash(join(root, path))])),
  };
}

function selectPilot(state) {
  const selected = [];
  for (const topicName of Object.keys(expectedTopicCounts)) {
    const cards = Object.entries(state.metadataById).filter(([, metadata]) => metadata.topicFile === topicName).map(([id]) => id);
    const thirds = [cards.slice(0, Math.floor(cards.length / 3)), cards.slice(Math.floor(cards.length / 3), Math.floor(cards.length * 2 / 3)), cards.slice(Math.floor(cards.length * 2 / 3))];
    for (const group of thirds) {
      selected.push(...group.map((id, index) => {
        const fields = state.currentById[id];
        const text = `${fields.audioText}\n${fields.audioTextZh}\n${fields.choices.join('\n')}`;
        const score = (new RegExp(phoneticWordPattern, 'i').test(text) ? 4 : 0)
          + (airlineAliases.some(([alias]) => new RegExp(`${escapeRegex(alias)}\\s*(?:\\d|${digitWordPattern})`, 'i').test(text)) ? 4 : 0)
          + (/runway/i.test(text) ? 3 : 0)
          + (/(arrival|departure|进场|离场)/i.test(text) ? 2 : 0)
          + (/P\s*[：:]|C\s*[：:]/.test(text) ? 1 : 0)
          + (index === 0 || index === group.length - 1 ? 1 : 0);
        return { id, score, index };
      }).sort((left, right) => right.score - left.score || left.index - right.index).slice(0, 10).map((item) => item.id));
    }
  }
  if (selected.length !== 120 || new Set(selected).size !== 120) fail(`invalid_pilot_selection:${selected.length}:${new Set(selected).size}`);
  return selected;
}

function loadRawTranscripts(state) {
  const transcripts = {};
  for (const [cardId, metadata] of Object.entries(state.metadataById)) {
    const rawPath = join(rawAsrRoot, `${basename(metadata.localAudioPath, '.mp3')}.json`);
    if (!existsSync(rawPath)) continue;
    const raw = readJson(rawPath);
    const mappedSegments = (raw.segments ?? []).map((segment) => ({
      avgLogprob: segment.avg_logprob,
      end: segment.end,
      noSpeechProb: segment.no_speech_prob,
      start: segment.start,
      text: segment.text?.trim(),
    }));
    const currentQuestion = state.currentById[cardId].audioText.split(/\nQuestion:\s*/i).at(-1) ?? '';
    const questionLead = normalizedWords(currentQuestion).slice(0, 4).join(' ');
    const explicitQuestionIndex = mappedSegments.findIndex((segment) => /\bquestion\b/i.test(segment.text ?? ''));
    const matchedQuestionIndex = mappedSegments.findLastIndex((segment) => {
      const normalized = normalizedWords(segment.text ?? '').join(' ');
      return questionLead && normalized.includes(questionLead) && (segment.avgLogprob ?? 0) > -1;
    });
    const questionSegmentIndex = explicitQuestionIndex >= 0 ? explicitQuestionIndex : matchedQuestionIndex;
    const reviewedSegments = questionSegmentIndex >= 0 ? mappedSegments.slice(0, questionSegmentIndex + 1) : mappedSegments;
    transcripts[cardId] = {
      audio: metadata.audio,
      language: raw.language ?? 'en',
      rawText: raw.text?.trim() ?? '',
      segments: reviewedSegments,
      text: reviewedSegments.map((segment) => segment.text).filter(Boolean).join(' ').trim(),
    };
  }
  return transcripts;
}

function normalizedWords(value) {
  return normalizeRunway(normalizeCallsigns(value)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[right.length];
}

function compareTranscript(currentText, transcript) {
  const current = normalizedWords(currentText);
  const candidate = normalizedWords(transcript);
  const wer = current.length ? editDistance(current, candidate) / current.length : 1;
  return { classification: wer <= 0.08 ? 'same-content' : wer <= 0.25 ? 'minor-difference' : 'reviewed-keep-current', wer: Number(wer.toFixed(4)) };
}

function summarizeChanges(changes) {
  const cards = new Set();
  const byField = {};
  const byRule = {};
  for (const change of changes) {
    cards.add(change.cardId);
    byField[change.field] = (byField[change.field] ?? 0) + 1;
    for (const rule of change.rules) byRule[rule] = (byRule[rule] ?? 0) + 1;
  }
  return { changedCards: cards.size, changedFields: changes.length, byField, byRule };
}

function collectResiduals(expectedById) {
  const residuals = [];
  const aliasPattern = new RegExp(`\\b(?:${airlineAliases.map(([alias]) => escapeRegex(alias).replaceAll(' ', '\\s+')).join('|')})\\s*,?\\s*(?:${callsignNumberPattern})\\b`, 'i');
  const chineseAliasPattern = new RegExp(`(?:${chineseAirlineAliases.map(([alias]) => escapeRegex(alias)).join('|')})\\s*\\d{1,4}`);
  const chineseAirlineLikePattern = /[\u4e00-\u9fff]{1,12}(?:航空(?:公司)?|航)\s*\d{1,4}/g;
  const attachedPattern = new RegExp(`\\b(?:${[...airlineCodes, ...callsignCodeAliases.keys()].join('|')})\\d{1,4}\\b`);
  const multiPhonetic = new RegExp(`\\b${phoneticMultiPattern}\\b`, 'i');
  const singlePhonetic = new RegExp(`\\b${phoneticWordPattern}\\b`, 'gi');
  for (const [cardId, fields] of Object.entries(expectedById)) {
    const textSurfaces = [
      ['audioText', fields.audioText],
      ['audioTextZh', fields.audioTextZh],
      ['referenceText', fields.referenceText],
      ...fields.choices.map((choice, index) => [`choices[${index}]`, choice]),
    ];
    for (const [field, text] of textSurfaces) {
      if (aliasPattern.test(text)) residuals.push({ cardId, field, issue: 'airline_alias' });
      if (chineseAliasPattern.test(text)) residuals.push({ cardId, field, issue: 'chinese_airline_alias' });
      for (const match of text.matchAll(chineseAirlineLikePattern)) {
        if (!['listening-main-326', 'listening-main-552'].includes(cardId)) residuals.push({ cardId, field, issue: `unmapped_chinese_airline:${match[0]}` });
      }
      if (attachedPattern.test(text)) residuals.push({ cardId, field, issue: 'attached_callsign' });
      if (multiPhonetic.test(text)) residuals.push({ cardId, field, issue: 'multi_phonetic' });
      for (const match of text.matchAll(singlePhonetic)) {
        if (!ordinaryPhoneticHomographs.has(`${cardId}:${match[0].toLowerCase()}`)) residuals.push({ cardId, field, issue: `single_phonetic:${match[0]}` });
      }
      if (/\brunway\s+\d{1,2}(?:[LRC])?\b/.test(text)) residuals.push({ cardId, field, issue: 'lower_runway_designator' });
      if (/\bRunway\b(?!\s+\d{1,2}(?:[LRC])?\b)/.test(text)) residuals.push({ cardId, field, issue: 'stray_Runway' });
      const procedure = text.match(/\b[A-Z]{1,12}\s+\d{1,2}[A-Z]?\s+(?:arrival|departure)\b/i);
      if (procedure) residuals.push({ cardId, field, issue: `procedure:${procedure[0]}` });
    }
    if ((fields.audioText.match(/\nQuestion: /g) ?? []).length !== 1) residuals.push({ cardId, field: 'audioText', issue: 'question_structure' });
    if ((fields.audioTextZh.match(/\n问题：/g) ?? []).length !== 1) residuals.push({ cardId, field: 'audioTextZh', issue: 'question_zh_structure' });
    if (!Array.isArray(fields.choices) || fields.choices.length !== 4) residuals.push({ cardId, field: 'choices', issue: 'choice_count' });
    const letter = String.fromCharCode(65 + fields.correctChoiceIndex);
    if (fields.referenceText !== `正确答案：${letter}. ${fields.choices[fields.correctChoiceIndex]}`) residuals.push({ cardId, field: 'referenceText', issue: 'answer_chain' });
  }
  return residuals;
}

function buildReport(state, snapshot) {
  const transcripts = loadRawTranscripts(state);
  const pilotIds = selectPilot(state);
  const comparisons = Object.fromEntries(Object.keys(state.currentById).map((cardId) => {
    const transcript = transcripts[cardId];
    return [cardId, transcript ? compareTranscript(state.currentById[cardId].audioText, transcript.text) : { classification: 'pending-asr', wer: null }];
  }));
  const decisions = Object.keys(state.currentById).map((cardId) => ({
    cardId,
    audioDecision: !transcripts[cardId]
      ? 'pending-asr'
      : manualTextOverrides[cardId]
        ? 'reviewed-audio-evidenced-fix'
        : comparisons[cardId].wer <= 0.25
          ? 'reviewed-format-or-semantic-equivalent'
          : 'reviewed-keep-current-no-unique-audio-evidence',
    audioRationale: manualTextOverrides[cardId]?.rationale
      ?? (comparisons[cardId].wer <= 0.25
        ? 'ASR与现有内容仅有格式或轻微措辞差异，不改写事实文本。'
        : '已检查高差异候选；差异不能形成唯一可靠音频证据，保留现有内容。'),
    asrClassification: comparisons[cardId].classification,
    asrWer: comparisons[cardId].wer,
    answerDecision: manualAnswerOverrides[cardId] ? 'manual-audio-evidenced-fix' : 'keep-current-answer',
    answerRationale: manualAnswerOverrides[cardId]?.rationale ?? null,
    formatRules: [...new Set(state.changes.filter((change) => change.cardId === cardId).flatMap((change) => change.rules))],
    pilot: pilotIds.includes(cardId),
  }));
  const pending = decisions.filter((decision) => decision.audioDecision === 'pending-asr').length;
  const highDifference = decisions.filter((decision) => decision.asrWer !== null && decision.asrWer > 0.6).length;
  const digitChanges = state.changes.filter((change) => change.field !== 'correctChoiceIndex').filter((change) => {
    const before = JSON.stringify(change.before).match(/\d+/g) ?? [];
    const after = JSON.stringify(change.after).match(/\d+/g) ?? [];
    return JSON.stringify(before) !== JSON.stringify(after);
  }).map((change) => ({ cardId: change.cardId, field: change.field, before: change.before, after: change.after, rules: change.rules }));
  for (const change of digitChanges) {
    const callsignFormatting = change.rules.includes('CALLSIGN-LISTENING-001');
    const evidencedAnswerFix = Boolean(manualAnswerOverrides[change.cardId]) && change.rules.some((rule) => rule.startsWith('ANSWER-LISTENING-'));
    const evidencedTextFix = Boolean(manualTextOverrides[change.cardId]);
    if (!callsignFormatting && !evidencedAnswerFix && !evidencedTextFix) fail(`unapproved_digit_change:${change.cardId}:${change.field}`);
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    snapshotChecksum: hash(snapshot),
    cardCount: 631,
    targetFields,
    pilotIds,
    summary: summarizeChanges(state.changes),
    asrSummary: { completed: Object.keys(transcripts).length, pending, highDifference },
    residualsAfter: collectResiduals(state.expectedById),
    digitChanges,
    manualTextOverrides: Object.fromEntries(Object.entries(manualTextOverrides).map(([id, item]) => [id, { rationale: item.rationale }])),
    manualAnswerOverrides,
    duplicateDecisions,
    unresolvedAirlineAliases,
    comparisons,
    changes: state.changes,
  };
  writeJson(reportPath, report);
  writeJson(transcriptPath, { schemaVersion: 1, model: 'turbo', collectedAt: new Date().toISOString(), transcripts });
  writeJson(decisionsPath, { schemaVersion: 1, generatedAt: new Date().toISOString(), duplicateDecisions, decisions });
  writeJson(pilotManifestPath, {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    sampleCount: pilotIds.length,
    samples: pilotIds.map((cardId) => ({ cardId, ...state.metadataById[cardId] })),
  });
  const fieldRows = targetFields.map((field) => `| ${field} | ${report.summary.byField[field] ?? 0} |`).join('\n');
  const ruleRows = Object.entries(report.summary.byRule).map(([rule, count]) => `| ${rule} | ${count} |`).join('\n');
  const sampleRows = state.changes.slice(0, 120).map((change) => `| ${change.cardId} | ${change.field} | ${change.rules.join(', ')} | ${String(JSON.stringify(change.before)).replaceAll('|', '\\|')} | ${String(JSON.stringify(change.after)).replaceAll('|', '\\|')} |`).join('\n');
  const audioEvidenceRows = Object.entries(manualTextOverrides).map(([id, item]) => `- ${id}：${item.rationale}`).join('\n');
  writeFileSync(reportMarkdownPath, `# 听力题库全量校准候选报告\n\n- 卡片：631\n- 候选修改卡片：${report.summary.changedCards}\n- 候选修改字段：${report.summary.changedFields}\n- ASR 已完成：${report.asrSummary.completed}\n- ASR 待完成：${report.asrSummary.pending}\n- WER > 60%：${report.asrSummary.highDifference}\n- 规则残留：${report.residualsAfter.length}\n- 数字序列变化：${report.digitChanges.length}（须有呼号规则或逐题音频证据）\n\n## 字段统计\n\n| 字段 | 修改数 |\n| --- | ---: |\n${fieldRows}\n\n## 规则统计\n\n| 规则 | 修改字段 |\n| --- | ---: |\n${ruleRows}\n\n## 人工答案修正\n\n${Object.entries(manualAnswerOverrides).map(([id, item]) => `- ${id}：${item.rationale}`).join('\n')}\n\n## 音频证据修正\n\n${audioEvidenceRows}\n\n## 前 120 条候选\n\n| 卡片 | 字段 | 规则 | 修改前 | 修改后 |\n| --- | --- | --- | --- | --- |\n${sampleRows}\n`);
  const pilotComparisons = pilotIds.filter((id) => transcripts[id]).sort((left, right) => comparisons[right].wer - comparisons[left].wer);
  writeFileSync(pilotReportPath, `# 听力题库 120 题试校准报告\n\n- 四类各 30 题，共 120 题。\n- 已完成 ASR：${pilotComparisons.length}/120。\n- ASR 只作为候选；正式文本以现有原文、确定性规则和音频证据为准。\n\n## 高差异样本\n\n| 卡片 | WER | 分类 |\n| --- | ---: | --- |\n${pilotComparisons.slice(0, 60).map((id) => `| ${id} | ${(comparisons[id].wer * 100).toFixed(1)}% | ${comparisons[id].classification} |`).join('\n')}\n`);
  return report;
}

function assertProtectedState(state, snapshot) {
  for (const entry of state.topics) {
    if (hash(stripTargetFields(entry.topic)) !== snapshot.sourceTopicNonTargetChecksums[entry.name]) fail(`source_non_target_changed:${entry.name}`);
  }
  for (const [id, metadata] of Object.entries(state.metadataById)) {
    if (fileHash(metadata.localAudioPath) !== snapshot.audioChecksums[id]) fail(`audio_changed:${id}`);
  }
  const embedded = readJson(embeddedPath);
  const listening = embedded.find((bank) => bank.id === 'listening');
  if (hash(stripTargetFields(listening)) !== snapshot.embeddedListeningNonTargetChecksum) fail('embedded_listening_non_target_changed');
  if (hash(embedded.filter((bank) => bank.id !== 'listening')) !== snapshot.embeddedOtherBanksChecksum) fail('embedded_other_banks_changed');
  const otherBankDirs = readdirSync(banksRoot).filter((name) => name !== 'listening').sort().map((name) => join(banksRoot, name));
  if (hash(otherBankDirs.map((path) => [basename(path), directoryJsonHash(path)])) !== snapshot.otherSourceBanksChecksum) fail('other_source_banks_changed');
  for (const [path, checksum] of Object.entries(snapshot.legacyArtifactChecksums)) {
    if (fileHash(join(root, path)) !== checksum) fail(`legacy_artifact_changed:${path}`);
  }
}

function cardMapsEqual(left, right) {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  return JSON.stringify(leftIds) === JSON.stringify(rightIds)
    && leftIds.every((id) => targetFields.every((field) => JSON.stringify(left[id][field]) === JSON.stringify(right[id][field])));
}

function expectedFromReport(snapshot, report) {
  const expected = structuredClone(snapshot.fields);
  for (const change of report.changes) {
    if (JSON.stringify(expected[change.cardId][change.field]) !== JSON.stringify(change.before)) fail(`report_snapshot_mismatch:${change.cardId}:${change.field}`);
    expected[change.cardId][change.field] = change.after;
  }
  for (const cardId of postCalibrationCorrectionIds) {
    const correction = manualTextOverrides[cardId];
    for (const field of ['audioText', 'audioTextZh']) expected[cardId][field] = correction[field];
  }
  return expected;
}

function audit() {
  const state = loadState();
  let snapshot;
  if (!existsSync(snapshotPath)) {
    snapshot = createSnapshot(state);
    writeJson(snapshotPath, snapshot);
  } else snapshot = readJson(snapshotPath);
  assertProtectedState(state, snapshot);
  if (!cardMapsEqual(state.currentById, snapshot.fields)) {
    if (!existsSync(reportPath)) fail('state_drift_without_report');
    const report = readJson(reportPath);
    const expected = expectedFromReport(snapshot, report);
    if (!cardMapsEqual(state.currentById, expected)) fail('state_drift');
    process.stdout.write(`listening_text_audit_already_applied ${JSON.stringify(report.summary)}\n`);
    return report;
  }
  const report = buildReport(state, snapshot);
  process.stdout.write(`listening_text_audit ${JSON.stringify({ ...report.summary, ...report.asrSummary, residualsAfter: report.residualsAfter.length })}\n`);
  return report;
}

function pilot(all = false) {
  audit();
  const state = loadState();
  const pilotIds = selectPilot(state);
  const ids = all ? Object.keys(state.currentById) : pilotIds;
  mkdirSync(rawAsrRoot, { recursive: true });
  const pendingPaths = ids.map((id) => state.metadataById[id].localAudioPath).filter((path) => !existsSync(join(rawAsrRoot, `${basename(path, '.mp3')}.json`)));
  if (pendingPaths.length) {
    const args = [
      ...pendingPaths,
      '--model', 'turbo', '--device', 'cpu', '--language', 'en',
      '--output_dir', rawAsrRoot, '--output_format', 'json', '--verbose', 'False', '--fp16', 'False',
    ];
    const result = spawnSync('whisper', args, { stdio: 'inherit' });
    if (result.status !== 0) fail(`whisper_failed:${result.status}`);
  }
  const report = audit();
  process.stdout.write(`listening_text_pilot ${JSON.stringify({ scope: all ? 'all' : 'pilot', requested: ids.length, completed: report.asrSummary.completed, pending: report.asrSummary.pending })}\n`);
}

function syncEmbedded(expected) {
  const embedded = readJson(embeddedPath);
  const bank = embedded.find((item) => item.id === 'listening');
  if (!bank) fail('missing_embedded_listening');
  let count = 0;
  for (const category of bank.categories) for (const topic of category.topics) for (const card of topic.cards) {
    if (!expected[card.id]) fail(`missing_embedded_expected:${card.id}`);
    for (const field of targetFields) card[field] = structuredClone(expected[card.id][field]);
    count += 1;
  }
  if (count !== 631) fail(`embedded_count:${count}`);
  writeJson(embeddedPath, embedded);
}

function applyChanges() {
  if (!existsSync(snapshotPath) || !existsSync(reportPath)) fail('run_audit_first');
  const snapshot = readJson(snapshotPath);
  const report = readJson(reportPath);
  if (report.snapshotChecksum !== hash(snapshot)) fail('snapshot_checksum_mismatch');
  if (report.asrSummary.pending !== 0) fail(`pending_asr:${report.asrSummary.pending}`);
  if (report.residualsAfter.length) fail(`candidate_residuals:${report.residualsAfter.length}`);
  const state = loadState();
  assertProtectedState(state, snapshot);
  const expected = expectedFromReport(snapshot, report);
  if (cardMapsEqual(state.currentById, expected)) {
    process.stdout.write(`listening_text_apply_already_done ${JSON.stringify(report.summary)}\n`);
    return;
  }
  if (!cardMapsEqual(state.currentById, snapshot.fields)) fail('source_drift_before_apply');
  if (!cardMapsEqual(state.expectedById, expected)) fail('report_transform_drift');
  for (const entry of state.topics) {
    for (const card of entry.topic.cards) for (const field of targetFields) card[field] = structuredClone(expected[card.id][field]);
    writeJson(entry.path, entry.topic);
  }
  syncEmbedded(expected);
  process.stdout.write(`listening_text_applied ${JSON.stringify(report.summary)}\n`);
}

function verify() {
  if (!existsSync(snapshotPath) || !existsSync(reportPath)) fail('missing_audit_artifacts');
  const snapshot = readJson(snapshotPath);
  const report = readJson(reportPath);
  if (report.snapshotChecksum !== hash(snapshot)) fail('snapshot_checksum_mismatch');
  if (report.asrSummary.pending !== 0) fail(`pending_asr:${report.asrSummary.pending}`);
  const state = loadState();
  const expected = expectedFromReport(snapshot, report);
  if (!cardMapsEqual(state.currentById, expected)) fail('source_expected_mismatch');
  if (state.changes.length) fail(`non_idempotent_changes:${JSON.stringify(state.changes.slice(0, 20))}`);
  assertProtectedState(state, snapshot);
  const residuals = collectResiduals(state.currentById);
  if (residuals.length) fail(`residuals:${JSON.stringify(residuals.slice(0, 20))}`);
  const embedded = readJson(embeddedPath).find((bank) => bank.id === 'listening');
  const embeddedFields = {};
  for (const category of embedded.categories) for (const topic of category.topics) for (const card of topic.cards) embeddedFields[card.id] = Object.fromEntries(targetFields.map((field) => [field, card[field]]));
  if (!cardMapsEqual(embeddedFields, expected)) fail('embedded_expected_mismatch');
  if (Object.values(state.metadataById).some((item) => item.audio.endsWith('/595.mp3'))) fail('historical_595_referenced');
  process.stdout.write(`listening_text_verified ${JSON.stringify({ cards: 631, embeddedCards: Object.keys(embeddedFields).length, changedCards: report.summary.changedCards, changedFields: report.summary.changedFields, asrCompleted: report.asrSummary.completed, residuals: 0 })}\n`);
}

const command = process.argv[2];
if (command === 'audit') audit();
else if (command === 'pilot') pilot(process.argv.includes('--all'));
else if (command === 'apply') applyChanges();
else if (command === 'verify') verify();
else fail('usage: node tools/listening-text-calibration.mjs <audit|pilot [--all]|apply|verify>');
