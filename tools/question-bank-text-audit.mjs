import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = join(root, 'content/question-banks');
const bankRoot = join(contentRoot, 'banks');
const generatedRoot = join(root, '.generated/question-bank-text-audit');
const workstreamRoot = join(root, 'docs/records/workstreams/question-bank-text-quality-audit');
const artifactRoot = join(workstreamRoot, 'artifacts');
const correctionsPath = join(artifactRoot, 'corrections.json');
const reviewDecisionsPath = join(artifactRoot, 'review-decisions.json');
const coveragePath = join(artifactRoot, 'coverage.json');
const wordLookupDatasetPath = join(root, 'content/word-lookup/dataset.json');
// Exact-value approval for the user's September 900-sentence source replacement.
// It supersedes historical wording corrections, not validation of later edits.
const accepted900 = JSON.parse(readFileSync(join(root, 'docs/records/workstreams/sentences900-opi-resource-update/accepted-text.json'), 'utf8')).fields;
function isAccepted900(record) {
  return record.bankId === 'sentences900' && accepted900[`${record.cardId}#${record.field}`] === sha256(record.text);
}


const bankTextFields = [
  'title',
  'nameEn',
  'description',
  'summary',
  'statusLabel',
  'categoryUnit',
  'topicUnit',
  'cardUnit',
];
const categoryTextFields = ['name', 'nameEn'];
const topicTextFields = ['name', 'nameEn'];
const cardTextFields = [
  'taskTitle',
  'audioText',
  'audioTextZh',
  'referenceText',
  'referenceTextZh',
  'choices',
  'choicesZh',
  'imageAlt',
];
const repeatedWordAllowlist = new Set([
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet',
  'kilo',
  'lima',
  'mike',
  'november',
  'oscar',
  'papa',
  'quebec',
  'romeo',
  'sierra',
  'tango',
  'uniform',
  'victor',
  'whiskey',
  'xray',
  'yankee',
  'zulu',
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'niner',
  'mayday',
  'pan',
  'panpan',
  'break',
  'had',
  'in',
  'very',
]);
const lexicalSuspectAllowlist = new Set([
  'anrat',
  'beatle',
  'blueyard',
  'isgod',
  'kru',
  'mapt',
  'myat',
]);
const repeatedFragmentRecordAllowlist = new Set([
  'atc-scenario-0148-card-main-2556#referenceText',
  'atc-scenario-0149-card-main-2576#referenceText',
]);
const repeatedSentenceRecordAllowlist = new Set([
  'story-pepec-0167#audioText',
]);
const knownTypoReplacements = new Map([
  ['aabout', 'about'],
  ['accicdent', 'accident'],
  ['achievea', 'achieve a'],
  ['afaster', 'a faster'],
  ['afterchecking', 'after checking'],
  ['aiebus', 'airbus'],
  ['aïr', 'air'],
  ["aircraftdidn't", "aircraft didn't"],
  ['aircrafts', "aircraft's"],
  ['allthe', 'all the'],
  ['alnd', 'and'],
  ['aot', 'got'],
  ['andautothrust', 'and autothrust'],
  ['andthe', 'and the'],
  ['announved', 'announced'],
  ['anythirng', 'anything'],
  ['apha', 'alpha'],
  ['aproach', 'approach'],
  ['arepaired', 'a repaired'],
  ['ascheduled', 'a scheduled'],
  ['asouthwest', 'a southwest'],
  ['assumingthe', 'assuming the'],
  ['atention', 'attention'],
  ['attempteed', 'attempted'],
  ['attempte', 'attempted'],
  ['autolmatic', 'automatic'],
  ['auxilary', 'auxiliary'],
  ['backand', 'back and'],
  ['begines', 'begins'],
  ['betaken', 'be taken'],
  ['blownout', 'blown out'],
  ['boarddetermined', 'board determined'],
  ['bothpilots', 'both pilots'],
  ['caabin', 'cabin'],
  ['caockpit', 'cockpit'],
  ['cessnapilot', 'cessna pilot'],
  ["chitagong's", "chittagong's"],
  ['clarance', 'clearance'],
  ['commaander', 'commander'],
  ['confort', 'comfort'],
  ['corporationsaircraft', 'corporation aircraft'],
  ['crelw', 'crew'],
  ['defibrilator', 'defibrillator'],
  ['defi', 'defibrillator'],
  ['desend', 'descend'],
  ['devimal', 'decimal'],
  ["didn'tdevelop", "didn't develop"],
  ['didnt', "didn't"],
  ['didn t', "didn't"],
  ['drealmlifter', 'dreamlifter'],
  ['duely', 'duly'],
  ['duringlanding', 'during landing'],
  ['edinburg', 'edinburgh'],
  ['eecho', 'echo'],
  ['egde', 'edge'],
  ['ergine', 'engine'],
  ['eftand', 'left and'],
  ['etimating', 'estimating'],
  ['faiure', 'failure'],
  ['familv', 'family'],
  ['feelingsomething', 'feeling something'],
  ['fight level', 'flight level'],
  ['fix-wing', 'fixed-wing'],
  ['follovved', 'followed'],
  ['foraircrafit', 'for aircraft'],
  ['fourpassengers', 'four passengers'],
  ['frorn', 'from'],
  ['guangzho', 'guangzhou'],
  ['heathrew', 'heathrow'],
  ['hobartto', 'hobart to'],
  ['hudnerd', 'hundred'],
  ['hudnred', 'hundred'],
  ['hunderd', 'hundred'],
  ['hundredmeters', 'hundred meters'],
  ['indicationss', 'indications'],
  ['inefficent', 'inefficient'],
  ['instrumentmeteorological', 'instrument meteorological'],
  ['intensions', 'intentions'],
  ['internationalairport', 'international airport'],
  ['itsubsequently', 'it subsequently'],
  ['ifl', 'if I'],
  ['is till', 'I still'],
  ['johntook', 'john took'],
  ['kilogrames', 'kilograms'],
  ['kilomiters', 'kilometers'],
  ['livina', 'living'],
  ['kincgston', 'kingston'],
  ['kingstonto', 'kingston to'],
  ['londonto', 'london to'],
  ['maniford', 'manifold'],
  ['mcconnel', 'mcconnell'],
  ['mbeyond', 'm beyond'],
  ['melborne', 'melbourne'],
  ['memohis', 'memphis'],
  ['meterson', 'meters on'],
  ['novenmber', 'november'],
  ['ninder', 'niner'],
  ['odern', 'modern'],
  ['oilot', 'pilot'],
  ['parameedics', 'paramedics'],
  ['passegers', 'passengers'],
  ['pathes', 'patches'],
  ['peerth', 'perth'],
  ['performingfligint', 'performing flight'],
  ['performirng', 'performing'],
  ['perfornning', 'performing'],
  ["perth'srunway", "perth's runway"],
  ['procdedure', 'procedure'],
  ['prololems', 'problems'],
  ['rejecteed', 'rejected'],
  ['reponse', 'response'],
  ['requset', 'request'],
  ['rlapid', 'rapid'],
  ['rlunway', 'runway'],
  ['pull-upsthe', 'pull-ups the'],
  ['roer', 'roger'],
  ['situatior', 'situation'],
  ['situtatonal', 'situational'],
  ['soonthe', 'soon the'],
  ['sothe', 'so the'],
  ['surveillence', 'surveillance'],
  ['swithed', 'switched'],
  ['sydeny', 'sydney'],
  ['symotomsof', 'symptoms of'],
  ['taipeiand', 'taipei and'],
  ['theaircraft', 'the aircraft'],
  ['theairplane', 'the airplane'],
  ['thecaptain', 'the captain'],
  ['thecrew', 'the crew'],
  ['theexamination', 'the examination'],
  ['theflight', 'the flight'],
  ['theglideslope', 'the glideslope'],
  ['theinvestigation', 'the investigation'],
  ['thenthe', 'then the'],
  ['threelandings', 'three landings'],
  ['theprobable', 'the probable'],
  ['thetailwind', 'the tailwind'],
  ['theymissed', 'they missed'],
  ['thounsand', 'thousand'],
  ['thousan', 'thousand'],
  ['thoudand', 'thousand'],
  ['tlhe', 'the'],
  ['ther it', 'Then it'],
  ['tgwo', 'two'],
  ['tocounter', 'to counter'],
  ['towercontroller', 'tower controller'],
  ['traffc', 'traffic'],
  ['trasnportation', 'transportation'],
  ['tremmendous', 'tremendous'],
  ['personnels', 'personnel'],
  ['practiceable', 'practicable'],
  ['stopend', 'stop end'],
  ['usafe', 'unsafe'],
  ['wasn’tcoming', 'wasn’t coming'],
  ["wasn'tcoming", "wasn't coming"],
  ['couldn t', "couldn't"],
  ['weathel', 'weather'],
  ['wewere', 'we were'],
  ['whenan', 'when an'],
  ['whenpassengers', 'when passengers'],
  ['whenthe', 'when the'],
  ['winshare', 'windshear'],
  ['zerozero', 'zero zero'],
]);
const fixedCaseTypoReplacements = new Map([
  ['AirusA319', 'Airbus A319'],
  ['a1titude', 'altitude'],
  ['altitude600m', 'altitude 600m'],
  ['co2ordination', 'coordination'],
  ['creW', 'crew'],
  ['Dlta', 'Delta'],
  ['ERJ-190O', 'ERJ-190'],
  ['Is_suing', 'Issuing'],
  ['lceland', 'Iceland'],
  ['Leftwas', 'Left was'],
  ['occurrencè', 'occurrence'],
  ['Schipol', 'Schiphol'],
  ['Aradabil', 'Ardabil'],
  ['TACS', 'TCAS'],
  ["National Airlines's", "National Airlines'"],
  ['atFL', 'at FL'],
  ['maintainFL', 'maintain FL'],
  ['heading270', 'heading 270'],
  ['and2.6', 'and 2.6'],
  ['whenQF', 'when QF'],
  ['taxiwayJ2', 'taxiway J2'],
  ['runway z03L', 'runway 03L'],
  ['runway O3L', 'runway 03L'],
]);
const reviewedFragmentReplacements = new Map([
  ['familv reunion The', 'family reunion. The'],
  ['fo restraining', 'for restraining'],
  ["when it's nose sharply rose", 'when its nose sharply rose'],
  ['stop160 m', 'stop 160 m'],
  ['route of fight', 'route of flight'],
  ['fight crew', 'flight crew'],
  ['fight 456', 'Flight 456'],
  ['fight planned route', 'flight planned route'],
  ['due to crack windshield', 'due to a cracked windshield'],
  ['.The fight was flying', 'The flight was flying'],
  ['hold ata level', 'hold at a level'],
  ['复飞乐', '复飞了'],
  ['Under that circumstances', 'Under those circumstances'],
  ['right engine and tight main gear', 'right engine and right main gear'],
  ['Flight 10l', 'Flight 101'],
  ["A320s takeoff clearance", "A320's takeoff clearance"],
  ['separation reduced to O feet', 'separation reduced to 0 feet'],
  ['along distance flight', 'a long-distance flight'],
  ['9 crews was', '9 crew members was'],
  ['suggested the pilot diver to', 'suggested that the pilot divert to'],
  ['suggested the pilot to divert to', 'suggested that the pilot divert to'],
  ['suggested the crew to divert to', 'suggested that the crew divert to'],
  ['flight.lt was already', 'flight. It was already'],
  ['15R.United 83', '15R. United 83'],
  ['initiated ago around', 'initiated a go-around'],
  ['CSN 7353, CSN 353 cargo', 'CSN 7353, cargo'],
  ['CSN 7353，CSN 353，货', 'CSN 7353，货'],
  ['CSN 7353, CSN 353 Gate', 'CSN 7353, Gate'],
  ['CSN 7353，CSN 353，23', 'CSN 7353，23'],
  ['CSN 7353. CSN 353.', 'CSN 7353.'],
  ['CSN 7353。CSN 353。', 'CSN 7353。'],
  ['CSN 7353 CSN 353.', 'CSN 7353.'],
  ['CSN 7353，CSN 353。', 'CSN 7353。'],
  ['CSN 7353, CSN 353 visibility', 'CSN 7353, visibility'],
  ['CSN 7353，CSN 353，能见度', 'CSN 7353，能见度'],
]);

function recordOverrideKey(record) {
  const index = ['choices', 'choicesZh'].includes(record.field) ? `[${record.jsonPath.at(-1)}]` : '';
  return `${record.cardId ?? record.topicId ?? record.bankId}#${record.field}${index}`;
}

const reviewedRecordReplacements = new Map([
  ['story-pepec-0043#audioText', [
    ['defibrillatorbrillatorbrillator', 'defibrillator'],
    ['defibrillatorbrillator', 'defibrillator'],
  ]],
  ['listening-main-043#audioText', [
    ['Why cannot the pilots startup?', 'Why can’t the pilots start up?'],
  ]],
  ['listening-main-1152#referenceText', [
    ['正确答案：D. D. Maintain altitude', '正确答案：D. Maintain altitude'],
  ]],
  ['listening-main-925#referenceText', [
    ['正确答案：A. A. Vortex.', '正确答案：A. Vortex.'],
  ]],
  ['listening-main-926#referenceText', [
    ['正确答案：A. A.Conflicting Traffic', '正确答案：A. Conflicting Traffic'],
  ]],
  ['listening-main-927#referenceText', [
    ['正确答案：A. A. a fuel tank explosion', '正确答案：A. a fuel tank explosion'],
  ]],
  ['listening-main-1002#referenceText', [
    [
      '正确答案：B. B.To ensure there is sufficient fuel for the planned flight and that the fuel is clean and free of contaminants.',
      '正确答案：B. To ensure there is sufficient fuel for the planned flight and that the fuel is clean and free of contaminants.',
    ],
  ]],
  ['listening-main-1041#referenceText', [
    ['正确答案：A. A. Poor visibility.', '正确答案：A. Poor visibility.'],
  ]],
  ['listening-main-075#audioText', [
    ['Every body on board', 'Everybody on board'],
  ]],
  ['listening-main-243#audioText', [
    ['the captain make a decision', 'the captain made a decision'],
  ]],
  ['listening-main-364#choices[0]', [
    ["An Aircrafts undercarriage", "An aircraft's undercarriage"],
  ]],
  ['listening-main-077#audioText', [
    ['The engine has sever damage', 'The engine has severe damage'],
  ]],
  ['listening-main-055#audioText', [
    ['maintaining 5100 meters..', 'maintaining 5100 meters.'],
  ]],
  ['listening-main-009#audioText', [
    ["What is the controllers taxiing instructions?", "What are the controller's taxi instructions?"],
  ]],
  ['listening-main-028#audioText', [
    ['What information are included in the controller’s instructions?', 'What information is included in the controller’s instructions?'],
  ]],
  ['listening-main-474#choices[0]', [
    ['For communication faiure.', 'Because of communication failure.'],
  ]],
  ['listening-main-475#audioText', [
    ['Question: Why use the ILS approach ?', 'Question: Why did they use the ILS approach?'],
  ]],
  ['listening-main-265#audioText', [
    [
      'Checklists are only used to verify that the critical (=significant/important) ) items affect the safety have been completed.',
      'Checklists are used to verify that critical (= significant/important) items affecting safety have been completed.',
    ],
  ]],
  ['listening-main-448#audioText', [
    [
      'the ground mechanics reported that  two white navigational light and one stroke light below APU exhaust off.',
      'the ground mechanics reported that two white navigation lights and one strobe light below the APU exhaust were off.',
    ],
  ]],
  ['listening-main-452#audioText', [
    [
      'B: There is no Scan pattern that works for all pilots ，professional instrument pilot scan all the instruments with the attitude indicator getting up to two thirds of the scan  time',
      'B: There is no scan pattern that works for all pilots. Professional instrument pilots scan all the instruments, with the attitude indicator taking up to two thirds of the scan time.',
    ],
  ]],
  ['listening-main-477#choices[3]', [
    ['Due published procdedure.', 'Due to the published procedure.'],
  ]],
  ['listening-main-486#audioText', [
    ['For the takeoff roll is started', 'Before the takeoff roll is started'],
    ['if the throttle was reduced', 'if the throttle is reduced'],
  ]],
  ['listening-main-630#audioText', [
    ['Alternative is nine thousand six hundred meters, advice?', 'Alternative is nine thousand six hundred meters, advise?'],
  ]],
  ['listening-main-675#audioText', [
    ['the the aircraft', 'the aircraft'],
  ]],
  ['listening-main-833#audioText', [
    [
      'Question: When is wake turbulence is most dangerous to following aircraft ​',
      'Question: When is wake turbulence most dangerous to following aircraft?',
    ],
  ]],
  ['listening-main-927#audioText', [
    ['a very scare accident', 'a very scary accident'],
    ['as the plane climbing', 'as the plane was climbing'],
    ['the engines throttles back', 'the engines throttled back'],
  ]],
  ['listening-main-099#audioText', [
    ['report passing HZ..', 'report passing HZ.'],
  ]],
  ['listening-main-1024#audioText', [
    [
      'Clearway is defined area on the ground or water under control of appropriate authority, the length of clearway should not exceed 50% of the length takeoff runway available(TORA).',
      'A clearway is a defined area on the ground or water under the control of the appropriate authority. The length of the clearway should not exceed 50% of the takeoff runway available (TORA).',
    ],
  ]],
  ['listening-main-1031#audioText', [
    ['a very scare accident', 'a very scary accident'],
    ['as the plane climbing', 'as the plane was climbing'],
    ['the engines throttles back', 'the engines throttled back'],
  ]],
  ['listening-main-1090#audioText', [
    ['Runway 13is', 'Runway 13 is'],
    [
      '\nA. The runway direction changed.\nB. RVR increased. RVR\nC. The runway is only 600m long.\nD. Visibility is reducing.',
      '',
    ],
  ]],
  ['listening-main-166#choicesZh[1]', [
    ['海里', '海上英里（Sea miles）'],
  ]],
  ['listening-main-166#choicesZh[2]', [
    ['海里', '海里（Nautical miles）'],
  ]],
  ['listening-main-734#choices[3]', [
    ['Flight route must be below the flight line.', 'Flight route must follow the highest features.'],
  ]],
  ['listening-main-734#choicesZh[3]', [
    ['飞行航路必须低于飞行航线', '飞行航路必须沿最高地物飞行'],
  ]],
  ['listening-main-1029#choices[3]', [
    ['Replace the engine, airframe, and systems', 'Repair the engine, airframe, and systems'],
  ]],
  ['listening-main-1029#choicesZh[3]', [
    ['更换发动机、机体和各系统', '修理发动机、机体和各系统'],
  ]],
  ['listening-main-1124#choices[3]', [
    [
      'Taxi to the holding point Runway 08via taxiway B2, B3',
      'Taxi to the holding point Runway 08 via taxiway B2, B1',
    ],
  ]],
  ['listening-main-1124#choicesZh[3]', [
    ['经B2、B3滑行道滑行至08跑道等待点', '经B2、B1滑行道滑行至08跑道等待点'],
  ]],
  ['listening-main-1128#choices[1]', [
    ['They may have encountered adverse weather', 'They may have encountered a bird strike'],
  ]],
  ['listening-main-1128#choicesZh[1]', [
    ['他们可能遭遇恶劣天气', '他们可能遭遇鸟击'],
  ]],
  ['listening-main-1189#choicesZh[0]', [
    ['引导车', '跟随引导车'],
  ]],
  ['listening-main-1189#choicesZh[3]', [
    ['引导车', '前导车'],
  ]],
  ['listening-main-1218#choices[1]', [
    ['Glass Cockpit Layout', 'Hybrid Cockpit Layout'],
  ]],
  ['listening-main-1218#choicesZh[1]', [
    ['玻璃驾驶舱布局', '混合式驾驶舱布局'],
  ]],
  ['listening-main-339#choicesZh[0]', [
    ['引导车', '跟随引导车'],
  ]],
  ['listening-main-339#choicesZh[3]', [
    ['引导车', '前导车'],
  ]],
  ['listening-main-252#audioText', [
    ['CCA981requested', 'CCA 981 requested'],
  ]],
  ['atc-scenario-0014-card-main-234#audioText', [
    ['fight level #%$@*^#....', 'flight level [unintelligible due to radio interference]'],
  ]],
  ['atc-scenario-0014-card-main-234#audioTextZh', [
    ['高度 #%$@*^#……', '高度 ［无线电干扰，内容不清］'],
  ]],
  ['atc-scenario-0057-card-main-976#referenceText', [
    ['CCA 124', 'CCA 101'],
  ]],
  ['atc-scenario-0057-card-main-976#referenceTextZh', [
    ['CCA 124', 'CCA 101'],
  ]],
  ['atc-scenario-0031-card-main-535#referenceText', [
    ['is our alternate airport Hefei is available', 'is our alternate airport Hefei available'],
  ]],
  ['atc-scenario-0048-card-main-834#referenceText', [
    [
      'can you repeat the ATIS ? being unable to pick up on the radio.',
      'can you repeat the ATIS? We are unable to pick it up on the radio.',
    ],
  ]],
  ['atc-scenario-0066-card-main-1140#referenceText', [
    ['Roger，Which', 'Roger, which'],
  ]],
  ['atc-scenario-0087-card-main-1495#referenceText', [
    ['1，2，3，4，5', '1, 2, 3, 4, 5'],
  ]],
  ['atc-scenario-0110-card-main-1896#referenceText', [
    [
      'Guangzhou Control, UAL 403, roger, request climb to 2003 hudnred meters due turbulence. request climb to 2003 hudnred meters due turbulence, UAL 403.',
      'Guangzhou Control, UAL 403, roger, request climb to 11,300 meters due turbulence.',
    ],
  ]],
  ['atc-scenario-0110-card-main-1896#referenceTextZh', [
    [
      '广州管制，UAL 403，收到，因颠簸请求爬升至 2003 hudnred 米。因颠簸请求爬升至 2003 hudnred 米，UAL 403。',
      '广州管制，UAL 403，收到，因颠簸请求爬升至 11,300 米。',
    ],
  ]],
  ['atc-scenario-0112-card-main-1924#referenceText', [
    ['1002 hudnred meters', '1,200 meters'],
  ]],
  ['atc-scenario-0112-card-main-1924#referenceTextZh', [
    ['1002 hudnred 米', '1,200 米'],
  ]],
  ['atc-scenario-0113-card-main-1953#referenceText', [
    ['1002 hundredmeters', '1,200 meters'],
  ]],
  ['atc-scenario-0113-card-main-1953#referenceTextZh', [
    ['1002 hundredmeters', '1,200 米'],
  ]],
  ['atc-scenario-0117-card-main-2027#referenceText', [
    ['2004 hunderd meters', '2,400 meters'],
  ]],
  ['atc-scenario-0117-card-main-2027#referenceTextZh', [
    ['2004 hunderd 米', '2,400 米'],
  ]],
  ['atc-scenario-0118-card-main-2032#referenceText', [
    ['119 devimal 45', '119.45'],
  ]],
  ['atc-scenario-0118-card-main-2032#referenceTextZh', [
    ['119 devimal 45', '119.45'],
  ]],
  ['atc-scenario-0122-card-main-2109#referenceText', [
    ['four thounsand 500 meters', '4,500 meters'],
  ]],
  ['atc-scenario-0122-card-main-2109#referenceTextZh', [
    ['four thounsand 500 米', '4,500 米'],
  ]],
  ['atc-scenario-0123-card-main-2120#referenceText', [
    ['1005 hudnred meters', '1,500 meters'],
    ['cruising level 1700 meters', 'cruising level 10,700 meters'],
  ]],
  ['atc-scenario-0123-card-main-2120#referenceTextZh', [
    ['1005 hudnred 米', '1,500 米'],
    ['巡航高度 1700 米', '巡航高度 10,700 米'],
  ]],
  ['atc-scenario-0124-card-main-2136#referenceText', [
    ['9002 hudnred meters', '9,200 meters'],
  ]],
  ['atc-scenario-0124-card-main-2136#referenceTextZh', [
    ['9002 hudnred 米', '9,200 米'],
  ]],
  ['atc-scenario-0124-card-main-2144#referenceText', [
    ['11 ninder decimal six', '119.6'],
  ]],
  ['atc-scenario-0124-card-main-2144#referenceTextZh', [
    ['11 ninder decimal six', '119.6'],
  ]],
  ['atc-scenario-0133-card-main-2289#referenceText', [
    ['Gate two tgwo seven', 'Gate 227'],
  ]],
  ['atc-scenario-0133-card-main-2289#referenceTextZh', [
    ['two tgwo seven 登机口', '227 登机口'],
  ]],
  ['atc-scenario-0133-card-main-2306#audioText', [
    ['niner hudnred meters', '900 meters'],
  ]],
  ['atc-scenario-0133-card-main-2306#audioTextZh', [
    ['niner hudnred 米', '900 米'],
  ]],
  ['atc-scenario-0134-card-main-2308#audioText', [
    ['9008 hunderd meters', '9,800 meters'],
  ]],
  ['atc-scenario-0134-card-main-2308#audioTextZh', [
    ['9008 hunderd 米', '9,800 米'],
  ]],
  ['atc-scenario-0135-card-main-2331#referenceText', [
    ['11006 hunderd meters', '11,600 meters'],
  ]],
  ['atc-scenario-0135-card-main-2331#referenceTextZh', [
    ['11006 hunderd 米', '11,600 米'],
  ]],
  ['atc-scenario-0138-card-main-2391#referenceText', [
    [
      'cruising level 1400 meters, 10004 hudnred meters the rest unchanged',
      'cruising level 10,400 meters, the rest unchanged',
    ],
  ]],
  ['atc-scenario-0138-card-main-2391#referenceTextZh', [
    ['巡航高度 1400 米，10004 hudnred 米，其余不变', '巡航高度 10,400 米，其余不变'],
  ]],
  ['atc-scenario-0154-card-main-2656#referenceText', [
    ['one thousan 200 meters', '1,200 meters'],
    ['niner thousan 800 meters', '9,800 meters'],
  ]],
  ['atc-scenario-0155-card-main-2671#referenceText', [
    ['4005 hunderd meters', '4,500 meters'],
    ['squawking 3215', 'squawking 3125'],
  ]],
  ['atc-scenario-0155-card-main-2671#referenceTextZh', [
    ['4005 hunderd 米', '4,500 米'],
    ['应答机 3215', '应答机 3125'],
  ]],
  ['atc-scenario-0157-card-main-2704#referenceText', [
    ['CSN 3001', 'CSN 1310'],
  ]],
  ['atc-scenario-0157-card-main-2704#referenceTextZh', [
    ['CSN 3001', 'CSN 1310'],
  ]],
  ['atc-scenario-0157-card-main-2708#referenceText', [
    ['CSN 3001', 'CSN 1310'],
  ]],
  ['atc-scenario-0157-card-main-2708#referenceTextZh', [
    ['CSN 3001', 'CSN 1310'],
  ]],
  ['atc-scenario-0157-card-main-2710#referenceText', [
    ['CSN 3001', 'CSN 1310'],
  ]],
  ['atc-scenario-0157-card-main-2710#referenceTextZh', [
    ['CSN 3001', 'CSN 1310'],
  ]],
  ['atc-scenario-0158-card-main-2721#referenceText', [
    ['9002 hudnred meters', '9,200 meters'],
  ]],
  ['atc-scenario-0158-card-main-2721#referenceTextZh', [
    ['9002 百米', '9,200 米'],
  ]],
  ['atc-scenario-0161-card-main-2775#referenceText', [
    ['request descend to 1700 meters, AFR 896, .', 'request descend to 10,700 meters, AFR 896.'],
  ]],
  ['atc-scenario-0161-card-main-2775#referenceTextZh', [
    ['请求下降至 1700 米', '请求下降至 10,700 米'],
  ]],
  ['atc-scenario-0161-card-main-2777#referenceText', [
    ['1007 hudnred meters', '10,700 meters'],
    ['request climb to 2300 meters', 'request climb to 11,300 meters'],
  ]],
  ['atc-scenario-0161-card-main-2777#referenceTextZh', [
    ['1007 hudnred 米', '10,700 米'],
    ['请求爬升至 2300 米', '请求爬升至 11,300 米'],
  ]],
  ['atc-scenario-0166-card-main-2865#referenceText', [
    ['1007 hudnred meters', '10,700 meters'],
  ]],
  ['atc-scenario-0166-card-main-2865#referenceTextZh', [
    ['1007 hudnred 米', '10,700 米'],
  ]],
  ['atc-scenario-0166-card-main-2873#referenceText', [
    ['AFR 10 one1', 'AFR 101'],
  ]],
  ['atc-scenario-0167-card-main-2888#referenceText', [
    ['2004 hudnred meters', '2,400 meters'],
    ['crossing from left right', 'crossing from left to right'],
  ]],
  ['atc-scenario-0168-card-main-2899#referenceText', [
    ['Runway 04via', 'Runway 04 via'],
    ['UAL 83 one1', 'UAL 831'],
  ]],
  ['atc-scenario-0174-card-main-2999#referenceText', [
    ['11 thoudand 300 meters', '11,300 meters'],
  ]],
  ['atc-scenario-0174-card-main-3000#referenceText', [
    ['4001 hudnred due performance', '13,100 meters due to performance'],
  ]],
  ['atc-scenario-0174-card-main-3000#referenceTextZh', [
    ['4001 hudnred', '13,100 米'],
  ]],
  ['atc-scenario-0176-card-main-3040#referenceText', [
    ['UAL 221', 'UAL 813'],
  ]],
  ['atc-scenario-0176-card-main-3040#referenceTextZh', [
    ['UAL 221', 'UAL 813'],
  ]],
  ['atc-scenario-0178-card-main-3064#referenceText', [
    ['10 thounsand 400 meters', '10,400 meters'],
  ]],
  ['atc-scenario-0180-card-main-3097#referenceText', [
    ['six hunderd meters', '600 meters'],
  ]],
  ['atc-scenario-0180-card-main-3111#referenceText', [
    ['1002 hudnred meters', '1,200 meters'],
  ]],
  ['atc-scenario-0180-card-main-3111#referenceTextZh', [
    ['1002 百米', '1,200 米'],
  ]],
  ['atc-scenario-0115-card-main-1991#referenceText', [
    ['maintain maintain', 'maintain'],
  ]],
  ['story-koala-001#audioText', [
    ['157°and', '157° and'],
    [
      'The pilot responded, "Wilco. When they captured, they reported to the ATC, but the ATC said"! told you, do not capture LOC course. "Both the pilots',
      'The pilot responded, "Wilco." When they captured the localizer, they reported it to ATC, but ATC said, "I told you, do not capture the LOC course." Both pilots',
    ],
    ['discussed about the ATC instruction', 'discussed the ATC instruction'],
  ]],
  ['story-koala-004#audioText', [
    ['familv reunion The', 'family reunion. The'],
  ]],
  ['story-koala-016#audioText', [
    ['Under that circumstances', 'Under those circumstances'],
  ]],
  ['story-koala-018#audioText', [
    ['Air force2', 'Air Force 2'],
  ]],
  ['story-koala-020#audioText', [
    ['Whenpassengers was boarding', 'When passengers were boarding'],
  ]],
  ['story-koala-034#audioText', [
    [
      'When an American Flight 815 was approaching the terminal area of its destination, the flight crew contacted the Approach Control and requested ILS Whenan American Flight 815 was approaching the terminal area of its destination, the flight crew contacted the Approach Control and requested ILS approach for runway 12.',
      'When American Flight 815 was approaching the terminal area of its destination, the flight crew contacted Approach Control and requested an ILS approach for Runway 12.',
    ],
  ]],
  ['story-koala-034#audioTextZh', [
    [
      '当美国815航班接近其目的地的终端区域时，飞行机组人员联系了进近管制部门，并请求使用仪表着陆系统（ILS）进行进近。当时，美国815航班接近其目的地的终端区域，飞行机组人员联系了进近管制部门，并请求使用仪表着陆系统（ILS）对12号跑道进行进近。',
      '当美国815航班接近目的地终端区时，飞行机组联系进近管制，并请求对12号跑道实施仪表着陆系统（ILS）进近。',
    ],
  ]],
  ['story-koala-055#audioTextZh', [
    [
      '523号航班的机组人员在靠近拉门（LAMEN）区域，在294飞行高度层（FL 294）上通过空中交通防撞系统（TCAS）发现，在前方20英里处、290飞行高度层（FL 290）上有一架飞行器。',
      '523号航班机组在LAMEN附近以FL290飞行时，通过TCAS发现飞机正前方20海里处有一架位于FL294的航空器。',
    ],
  ]],
  ['story-koala-053#audioText', [
    ['The ATc said', 'The ATC said'],
    ['l am still alive', 'I am still alive'],
    ['after the operation"', 'after the operation."'],
  ]],
  ['story-koala-069#audioText', [
    ['pull-upsthe', 'pull-ups, the'],
  ]],
  ['story-koala-086#audioText', [
    ['and begun the descent', 'and began the descent'],
  ]],
  ['story-pepec-0080#audioText', [
    ['the R A T deployed).', 'the R A T deployed.'],
  ]],
  ['story-pepec-0057#audioText', [
    [
      "operated by Qantas-one of the world's largest airlines-departed",
      "operated by Qantas, one of the world's largest airlines, departed",
    ],
  ]],
]);
const reviewedSecondPassReplacements = new Map([
  ['atc-scenario-0004-card-main-066#audioText', [
    ['another 1', 'another one'],
  ]],
  ['atc-scenario-0004-card-main-066#audioTextZh', [
    ['推出期间，拖把弯曲，你必须等待另一个。', '推出期间，牵引杆弯曲，你必须等待另一根。'],
  ]],
  ['atc-scenario-0004-card-main-066#referenceText', [
    ['another 1', 'another one'],
  ]],
  ['atc-scenario-0004-card-main-066#referenceTextZh', [
    ['拖把弯曲，我们必须等待另一个。', '牵引杆弯曲，我们必须等待另一根。'],
  ]],
  ['atc-scenario-0107-card-main-1846#referenceText', [
    [
      'but luggage loading has not completed due a slow moving loader, please inform the ground handling to send another 1 as quickly as possible.',
      'but luggage loading has not been completed due to a slow-moving loader. Please inform the ground handling to send another one as quickly as possible.',
    ],
  ]],
  ['atc-scenario-0109-card-main-1877#referenceText', [
    [
      'Tower, SIA 123, the tailwind exceeds our takeoff limit, request change to Runway 18L. the tailwind exceeds our takeoff limit, request change to Runway 18L, SIA 123.',
      'Tower, SIA 123, the tailwind exceeds our takeoff limit, request change to Runway 18L.',
    ],
  ]],
  ['atc-scenario-0109-card-main-1877#referenceTextZh', [
    [
      '塔台，SIA 123，顺风超过我们的起飞限制，请求更换至 Runway 18L。顺风超过我们的起飞限制，请求更换至 Runway 18L，SIA 123。',
      '塔台，SIA 123，顺风超过我们的起飞限制，请求更换至 Runway 18L。',
    ],
  ]],
  ['atc-scenario-0121-card-main-2099#referenceText', [
    [
      'request a tug to tow us back to the apron, SIA 852. Wuhan Tower, SIA 852, request a tug to tow us back to the apron.',
      'Wuhan Tower, SIA 852, request a tug to tow us back to the apron.',
    ],
  ]],
  ['atc-scenario-0121-card-main-2099#referenceTextZh', [
    [
      '请求一辆牵引车将我们拖回机坪，SIA 852。武汉塔台，SIA 852，请求一辆牵引车将我们拖回机坪。',
      '武汉塔台，SIA 852，请求一辆牵引车将我们拖回机坪。',
    ],
  ]],
  ['atc-scenario-0126-card-main-2174#referenceText', [
    [
      'Wuhan Tower, BAW 817, the tailwind exceeds our takeoff limit, request change to Runway 22. the tailwind exceeds our takeoff limit, request change to Runway 22, BAW 817.',
      'Wuhan Tower, BAW 817, the tailwind exceeds our takeoff limit, request change to Runway 22.',
    ],
  ]],
  ['atc-scenario-0126-card-main-2174#referenceTextZh', [
    [
      '武汉塔台，BAW 817，顺风超过我们的起飞限制，请求更换至 Runway 22。顺风超过我们的起飞限制，请求更换至 Runway 22，BAW 817。',
      '武汉塔台，BAW 817，顺风超过我们的起飞限制，请求更换至 Runway 22。',
    ],
  ]],
  ['atc-scenario-0129-card-main-2235#referenceText', [
    [
      'Wuhan Control, ACA 452, we need one minute to perform the checklist and will advise. we need one minute to perform the checklist and will advise, ACA 452.',
      'Wuhan Control, ACA 452, we need one minute to perform the checklist and will advise.',
    ],
  ]],
  ['atc-scenario-0129-card-main-2235#referenceTextZh', [
    [
      '武汉管制，ACA 452，我们需要一分钟执行检查单，稍后报告。我们需要一分钟执行检查单，稍后报告，ACA 452。',
      '武汉管制，ACA 452，我们需要一分钟执行检查单，稍后报告。',
    ],
  ]],
  ['atc-scenario-0136-card-main-2354#referenceText', [
    [
      'Wuhan Tower, CES 2151, request change to Runway 18L due tail wind exceeds takeoff limits. request change to Runway 18L due tail wind exceeds takeoff limits, CES 2151.',
      'Wuhan Tower, CES 2151, the tailwind exceeds our takeoff limits, request change to Runway 18L.',
    ],
  ]],
  ['atc-scenario-0136-card-main-2354#referenceTextZh', [
    [
      '武汉塔台，CES 2151，因顺风超过起飞限制，请求更换至 Runway 18L。因顺风超过起飞限制，请求更换至 Runway 18L，CES 2151。',
      '武汉塔台，CES 2151，因顺风超过起飞限制，请求更换至 Runway 18L。',
    ],
  ]],
  ['atc-scenario-0137-card-main-2380#referenceText', [
    [
      'Wuhan Tower, CES 5118, affirm, we can accept intersection departure from E one. affirm, we can accept intersection departure from E one, CES 5118.',
      'Wuhan Tower, CES 5118, affirm, we can accept an intersection departure from E1.',
    ],
  ]],
  ['atc-scenario-0137-card-main-2380#referenceTextZh', [
    [
      '武汉塔台，CES 5118，可以，我们可以接受从 E1 交叉口离场。可以，我们可以接受从 E1 交叉口离场，CES 5118。',
      '武汉塔台，CES 5118，可以，我们可以接受从 E1 交叉口离场。',
    ],
  ]],
  ['atc-scenario-0137-card-main-2381#referenceText', [
    [
      'Wuhan Tower, CES 5118, line up and wait via taxiway E one, but the aircraft in front of us is blocking E one. the aircraft in front of us is blocking E one, CES 5118.',
      'Wuhan Tower, CES 5118, line up and wait via Taxiway E1, but the aircraft in front of us is blocking E1.',
    ],
  ]],
  ['atc-scenario-0137-card-main-2381#referenceTextZh', [
    [
      '武汉塔台，CES 5118，经 E1 滑行道进入跑道等待，但我们前方的航空器挡住了 E1。我们前方的航空器挡住了 E1，CES 5118。',
      '武汉塔台，CES 5118，经 E1 滑行道进入跑道等待，但我们前方的航空器挡住了 E1。',
    ],
  ]],
  ['atc-scenario-0143-card-main-2475#referenceText', [
    [
      'Wuhan Tower, CCA 725, request a tug to tow us back to the terminal. request a tug to tow us back to the terminal, CCA 725',
      'Wuhan Tower, CCA 725, request a tug to tow us back to the terminal.',
    ],
  ]],
  ['atc-scenario-0143-card-main-2475#referenceTextZh', [
    [
      '武汉塔台，CCA 725，请求一辆牵引车将我们拖回航站楼。请求一辆牵引车将我们拖回航站楼，CCA 725。',
      '武汉塔台，CCA 725，请求一辆牵引车将我们拖回航站楼。',
    ],
  ]],
  ['atc-scenario-0144-card-main-2483#referenceText', [
    [
      'Wuhan Ground, CCA 985, request taxi back to Gate 221 for maintenance check. request taxi back to Gate 221 for maintenance check, CCA 985.',
      'Wuhan Ground, CCA 985, request taxi back to Gate 221 for a maintenance check.',
    ],
  ]],
  ['atc-scenario-0144-card-main-2483#referenceTextZh', [
    [
      '武汉地面，CCA 985，请求滑回 221 登机口进行维修检查。请求滑回 221 登机口进行维修检查，CCA 985。',
      '武汉地面，CCA 985，请求滑回 221 登机口进行维修检查。',
    ],
  ]],
  ['atc-scenario-0169-card-main-2927#referenceText', [
    [
      'London Control, UAL 182, request land at the nearest airport due the running engine is not stable. request land at the nearest airport due the running engine is not stable, UAL 182',
      'London Control, UAL 182, request landing at the nearest airport because the operating engine is unstable.',
    ],
  ]],
  ['atc-scenario-0169-card-main-2927#referenceTextZh', [
    [
      '伦敦管制，UAL 182，由于仍在运转的发动机不稳定，请求在最近的机场着陆。由于仍在运转的发动机不稳定，请求在最近的机场着陆，UAL 182。',
      '伦敦管制，UAL 182，由于仍在运转的发动机不稳定，请求在最近的机场着陆。',
    ],
  ]],
  ['atc-scenario-0169-card-main-2928#referenceText', [
    [
      'London Control, UAL 182, continue descent to 9000 feet, we are not familiar with Beatle airport. Request airport information. continue descent to 9000 feet, we are not familiar with Beatle airport, UAL 182.',
      'London Control, UAL 182, continue descent to 9000 feet. We are not familiar with Beatle Airport; request airport information.',
    ],
  ]],
  ['atc-scenario-0169-card-main-2928#referenceTextZh', [
    [
      '伦敦管制，UAL 182，继续下降至 9,000 英尺，我们不熟悉 Beatle Airport，请求机场资料。继续下降至 9,000 英尺，我们不熟悉 Beatle Airport，UAL 182。',
      '伦敦管制，UAL 182，继续下降至 9,000 英尺。我们不熟悉 Beatle Airport，请求机场资料。',
    ],
  ]],
  ['story-koala-028#audioText', [
    [
      'Getting lost as an airplane flying is a potentially dangerous situation, especially when low on fuel. If a pilot becomes lost, there are some good Getting lost as an airplane flying is a potentially dangerous situation, especially when low on fuel. If a pilot becomes lost, there are some good common sense procedures to follow.',
      'Getting lost while flying is a potentially dangerous situation, especially when low on fuel. If a pilot becomes lost, there are some good common-sense procedures to follow.',
    ],
  ]],
  ['story-koala-032#audioText', [
    [
      'Flight 145 nearly collided with Flight 101 at the intersection of runway 16 and runway22. There were no injuries and no damage to either aircraft. But it was Flight 145 nearly collided with Flight 101 at the intersection of runway 16 and runway 22. There were no injuries and no damage to either aircraft. But it was regarded',
      'Flight 145 nearly collided with Flight 101 at the intersection of Runway 16 and Runway 22. There were no injuries and no damage to either aircraft, but it was regarded',
    ],
  ]],
  ['story-koala-033#audioText', [
    [
      'One day, Flight 456, a B737 carrying 152 passengers and 9 crews was flying to land at Tokyo International Airport. One day, Flight 456 a B737 carrying 152 passengers and 9 crews was flying to land at Tokyo International Airport.',
      'One day, Flight 456, a B737 carrying 152 passengers and 9 crew members, was flying to land at Tokyo International Airport.',
    ],
  ]],
  ['story-koala-033#audioTextZh', [
    [
      '一天，456号航班，一架载有152名乘客和9名机组人员的B737，正在飞往东京国际机场着陆。一天，456号航班，一架载有152名乘客和9名机组人员的B737，正在飞往东京国际机场着陆。',
      '一天，456号航班，一架载有152名乘客和9名机组人员的B737，正在飞往东京国际机场着陆。',
    ],
  ]],
  ['story-wing-016#audioText', [
    [
      'At the same the active runway 36R.Unfortunately, the two aircraft collided, all people on board died. (114 words)',
      'At the same time, the Tower controller cleared Flight 626 for takeoff. When Flight 626 was rolling on the runway, the Cessna crossed the runway holding sign and entered the active Runway 36R. Unfortunately, the two aircraft collided, and all people on board died. (114 words)',
    ],
  ]],
  ['story-wing-038#audioText', [
    [
      'when the flight crew donned their oxygen masks.declared PAN PAN, reporting excessive cabin altitude and initiated an emergency descent',
      'when the flight crew donned their oxygen masks and declared PAN PAN, reporting excessive cabin altitude, and initiated an emergency descent',
    ],
  ]],
  ['story-koala-098#audioText', [
    [
      'when the flight crew donned their oxygen masks. Declared PAN PAN, reporting excessive cabin altitude and initiated an emergency descent',
      'when the flight crew donned their oxygen masks and declared PAN PAN, reporting excessive cabin altitude, and initiated an emergency descent',
    ],
  ]],
  ['listening-main-724#audioText', [
    [
      'communication across different regions."',
      'communication across different regions.',
    ],
  ]],
  ['story-wing-032#audioTextZh', [
    ['塔台困惑地回答“稍等",然后', '塔台困惑地回答“稍等”，然后'],
    ['塔台更困惑的回答："证实你降落在A机场?"', '塔台更困惑地回答：“证实你降落在A机场？”'],
  ]],
  ['story-koala-002#audioText', [
    ['157°and altitude', '157° and altitude'],
    [
      'The pilot responded, "Wilco. When they captured, they reported to the ATC, but the ATC said"! told you, do not capture LOC course. "Both the pilots',
      'The pilot responded, "Wilco." When they captured the LOC course, they reported to ATC, but ATC said, "I told you, do not capture the LOC course." Both pilots',
    ],
  ]],
  ['story-koala-002#audioTextZh', [
    [
      '管制员给出指令：“航向130°，切入跑道16航道。“但完成指令后，TCAS显示几个活动目标。然后ATC给出另一指令：不要穿过航道，保持间隔。“飞行员回复：“照办。“飞机截获航道时',
      '管制员给出指令：“航向130°，切入跑道16航道。”但完成指令后，TCAS显示几个活动目标。然后ATC给出另一指令：“不要穿过航道，保持间隔。”飞行员回复：“照办。”飞机截获航道时',
    ],
  ]],
  ['story-wing-047#audioText', [
    ['157°and altitude', '157° and altitude'],
    [
      'The pilot responded, "Wilco". When they captured, they reported to the ATC, but the ATC said "I told you, do not capture LOC course. "Both the pilots',
      'The pilot responded, "Wilco." When they captured the LOC course, they reported to ATC, but ATC said, "I told you, do not capture the LOC course." Both pilots',
    ],
  ]],
  ['story-koala-011#audioTextZh', [
    [
      '飞行员问他:"Keith，我们将在萨克拉门托停留一小时，你想下飞机活动一下吗?“',
      '飞行员问他：“Keith，我们将在萨克拉门托停留一小时，你想下飞机活动一下吗？”',
    ],
    ['并计大家冷静下来', '并让大家冷静下来'],
  ]],
  ['story-koala-012#audioTextZh', [
    ['大叫:＂不！我是想将包裹放进去！＂', '大叫：“不！我是想将包裹放进去！”'],
  ]],
  ['story-wing-056#audioText', [
    [
      'Would you like to get off and stretch your legs? The blind man said no',
      'Would you like to get off and stretch your legs?" The blind man said no',
    ],
  ]],
  ['story-koala-017#audioText', [
    [
      'we contacted them successfully, "UAL320, CCA830, Beijing Approach cleared you ILS straight in approach runway 16R, you are number one, ambulance and first aid will be ready for you. "Roger, thank you very much", the UAL320 replied.',
      'we contacted them successfully, "UAL320, CCA830, Beijing Approach cleared you ILS straight in approach runway 16R, you are number one, ambulance and first aid will be ready for you." "Roger, thank you very much," UAL320 replied.',
    ],
  ]],
  ['story-koala-017#audioTextZh', [
    [
      '幸运的是，我们与美联航320成功建立联系，＂美联航320，国航830，北京进近同意直接盲降进近跑道16右，你是第一个，救护车和急救已就位。＂收到，非常感谢。＂美联航320这样回复我们。',
      '幸运的是，我们与美联航320成功建立联系：“美联航320，国航830，北京进近同意直接盲降进近跑道16右，你是第一个，救护车和急救已就位。”“收到，非常感谢。”美联航320这样回复我们。',
    ],
  ]],
  ['story-koala-020#audioTextZh', [
    ['回复：＂不会英语。＂', '回复：“不会英语。”'],
  ]],
  ['story-wing-063#audioTextZh', [
    [
      '幸运的是，我们与美联航320成功建立联系，"美联航320,国航830,北京进近同意直接盲降进近跑道16右，你是第一个，救护车和急救已就位。""收到，非常感谢。”美联航320这样回复我们。',
      '幸运的是，我们与美联航320成功建立联系：“美联航320，国航830，北京进近同意直接盲降进近跑道16右，你是第一个，救护车和急救已就位。”“收到，非常感谢。”美联航320这样回复我们。',
    ],
  ]],
  ['story-koala-019#audioTextZh', [
    ['她向乘务员要求换座位。乘务员询问换座位的原因，这让她更加烦躁："', '她向乘务员要求换座位。乘务员询问换座位的原因，这让她更加烦躁：“'],
    ['给我换个座位!"乘务员', '给我换个座位！”乘务员'],
    ['被迫坐在讨厌的人身边。“然后', '被迫坐在讨厌的人身边。”然后'],
    ['我们已为您准备好座位。"周围', '我们已为您准备好座位。”周围'],
  ]],
  ['story-wing-057#audioTextZh', [
    ['给我换个座位!"乘务员', '给我换个座位！”乘务员'],
    ['被迫坐在讨厌的人身边。"然后', '被迫坐在讨厌的人身边。”然后'],
    ['我们已为您准备好座位。"周围', '我们已为您准备好座位。”周围'],
  ]],
  ['story-koala-064#audioText', [
    [
      'said, "Ground, Japan air 4421 with you on taxiway yankee for gate 35. " The ground controller',
      'said, "Ground, Japan Air 4421 with you on Taxiway Yankee for Gate 35." The ground controller',
    ],
    [
      'responded, " Japan air 4421, Los Angeles tower, taxi via taxiway echo to the gate. Ten seconds later',
      'responded, "Japan Air 4421, Los Angeles Tower, taxi via Taxiway Echo to the gate." Ten seconds later',
    ],
  ]],
  ['story-koala-096#audioText', [
    [
      'because the Captain of the Aircraft misidentified and the runway. he made',
      'because the captain of the aircraft misidentified the runway. He made',
    ],
  ]],
  ['atc-scenario-0110-card-main-1888#referenceText', [
    [
      'Wuhan Ground, UAL 403, request de-icing on taxiway Z four. request de-icing on taxiway Z four, UAL 403',
      'Wuhan Ground, UAL 403, request de-icing on Taxiway Z4.',
    ],
  ]],
  ['atc-scenario-0110-card-main-1888#referenceTextZh', [
    [
      '武汉地面，UAL 403，请求在 Z4 滑行道除冰。请求在 Z4 滑行道除冰，UAL 403。',
      '武汉地面，UAL 403，请求在 Z4 滑行道除冰。',
    ],
  ]],
  ['atc-scenario-0110-card-main-1893#referenceText', [
    [
      'Guangzhou Control, UAL 403, request climb to 1700 meters. request climb to 1700 meters, UAL 403.',
      'Guangzhou Control, UAL 403, request climb to 10,700 meters.',
    ],
  ]],
  ['atc-scenario-0110-card-main-1893#referenceTextZh', [
    [
      '广州管制，UAL 403，请求爬升至 1700 米。请求爬升至 1700 米，UAL 403。',
      '广州管制，UAL 403，请求爬升至 10,700 米。',
    ],
  ]],
  ['atc-scenario-0110-card-main-1894#referenceText', [
    [
      'Guangzhou Control, UAL 403, we are running into some turbulence. we are running into some turbulence, UAL 403.',
      'Guangzhou Control, UAL 403, we are running into some turbulence.',
    ],
  ]],
  ['atc-scenario-0110-card-main-1894#referenceTextZh', [
    [
      '广州管制，UAL 403，我们正遭遇一些颠簸。我们正遭遇一些颠簸，UAL 403。',
      '广州管制，UAL 403，我们正遭遇一些颠簸。',
    ],
  ]],
  ['atc-scenario-0126-card-main-2176#referenceText', [
    [
      'Wuhan Departure, BAW 817, request dump fuel and return to land. request dump fuel and return to land, BAW 817.',
      'Wuhan Departure, BAW 817, request fuel dumping and return to land.',
    ],
  ]],
  ['atc-scenario-0126-card-main-2176#referenceTextZh', [
    [
      '武汉离场，BAW 817，请求放油并返场落地。请求放油并返场落地，BAW 817。',
      '武汉离场，BAW 817，请求放油并返场落地。',
    ],
  ]],
  ['atc-scenario-0126-card-main-2180#referenceText', [
    [
      'BAW 817, we need about 25 minutes. We need about 25 minutes, BAW 817.',
      'BAW 817, we need about 25 minutes.',
    ],
  ]],
  ['atc-scenario-0126-card-main-2180#referenceTextZh', [
    [
      'BAW 817，我们大约需要 25 分钟。我们大约需要 25 分钟，BAW 817。',
      'BAW 817，我们大约需要 25 分钟。',
    ],
  ]],
  ['atc-scenario-0129-card-main-2239#referenceText', [
    [
      'Wuhan Control, ACA 452, request maintain 8400 meters and divert to Beijing. request maintain 8100 meters and divert to Beijing, ACA 452.',
      'Wuhan Control, ACA 452, request maintain 8,100 meters and divert to Beijing.',
    ],
  ]],
  ['atc-scenario-0129-card-main-2239#referenceTextZh', [
    [
      '武汉管制，ACA 452，请求保持 8400 米并备降北京。请求保持 8100 米并备降北京，ACA 452。',
      '武汉管制，ACA 452，请求保持 8,100 米并备降北京。',
    ],
  ]],
  ['atc-scenario-0134-card-main-2315#referenceText', [
    [
      'Wuhan Control, CES 728, is 1400 meters available? Is there is any turbulence reported by preceding aircraft on that level?',
      'Wuhan Control, CES 728, is 10,400 meters available? Is there any turbulence reported by preceding aircraft at that level?',
    ],
  ]],
  ['atc-scenario-0134-card-main-2315#referenceTextZh', [
    ['武汉管制，CES 728，1400 米是否可用？前机是否在该高度报告过颠簸？', '武汉管制，CES 728，10,400 米是否可用？前机是否在该高度报告过颠簸？'],
  ]],
  ['atc-scenario-0134-card-main-2316#referenceText', [
    [
      'Wuhan Control, CES 728, request climb to 1400 meters. request climb to 1400 meters, CES 728.',
      'Wuhan Control, CES 728, request climb to 10,400 meters.',
    ],
  ]],
  ['atc-scenario-0134-card-main-2316#referenceTextZh', [
    [
      '武汉管制，CES 728，请求爬升至 1400 米。请求爬升至 1400 米，CES 728。',
      '武汉管制，CES 728，请求爬升至 10,400 米。',
    ],
  ]],
  ['atc-scenario-0135-card-main-2327#referenceText', [
    ['between 6000 meters and 1400 meters, request climb.', 'between 6,000 meters and 10,400 meters, request climb.'],
  ]],
  ['atc-scenario-0135-card-main-2327#referenceTextZh', [
    ['6000 米至 1400 米之间', '6,000 米至 10,400 米之间'],
  ]],
  ['atc-scenario-0135-card-main-2328#referenceText', [
    [
      'Shanghai Control, CES 556, we can accept 2600 meters. we can accept 2600 meters, CES 556.',
      'Shanghai Control, CES 556, we can accept 11,600 meters.',
    ],
  ]],
  ['atc-scenario-0135-card-main-2328#referenceTextZh', [
    [
      '上海管制，CES 556，我们可以接受 2600 米。我们可以接受 2600 米，CES 556。',
      '上海管制，CES 556，我们可以接受 11,600 米。',
    ],
  ]],
  ['atc-scenario-0137-card-main-2369#referenceText', [
    ['roger, 101.8, CES 5118.', 'roger, 121.8, CES 5118.'],
  ]],
  ['atc-scenario-0137-card-main-2369#referenceTextZh', [
    ['收到，101.8，CES 5118。', '收到，121.8，CES 5118。'],
  ]],
  ['atc-scenario-0137-card-main-2374#referenceText', [
    [
      "Wuhan Ground, CES 5118, we need to open cabin door for adding passenger's food and drinks due long delays, we need another five minutes for catering. we need another 5 minutes for catering, CES 5118.",
      "Wuhan Ground, CES 5118, we need to open the cabin door to add passengers' food and drinks due to the long delay. We need another five minutes for catering.",
    ],
  ]],
  ['atc-scenario-0137-card-main-2374#referenceTextZh', [
    [
      '武汉地面，CES 5118，由于长时间延误，我们需要打开舱门补充乘客的餐食和饮料，还需要五分钟进行配餐。我们还需要 5 分钟进行配餐，CES 5118。',
      '武汉地面，CES 5118，由于长时间延误，我们需要打开舱门补充乘客的餐食和饮料，还需要五分钟进行配餐。',
    ],
  ]],
  ['atc-scenario-0139-card-main-2399#referenceText', [
    ['maintaining 8400 meters,.', 'maintaining 8,400 meters.'],
  ]],
  ['atc-scenario-0139-card-main-2400#referenceText', [
    [
      'climb to 10400 meters, CES 529. climb to 1400 meters, CES 529.',
      'climb to 10,400 meters, CES 529.',
    ],
  ]],
  ['atc-scenario-0139-card-main-2400#referenceTextZh', [
    [
      '爬升至 10400 米，CES 529。爬升至 1400 米，CES 529。',
      '爬升至 10,400 米，CES 529。',
    ],
  ]],
  ['atc-scenario-0139-card-main-2401#referenceText', [
    [
      'maintaining 1400 meters, 10400 meters our instruments indicate left pack has malfunctioned',
      'maintaining 10,400 meters, our instruments indicate the left pack has malfunctioned',
    ],
  ]],
  ['atc-scenario-0139-card-main-2401#referenceTextZh', [
    ['正保持 1400 米，10400 米，我们的仪表显示左组件故障', '正保持 10,400 米，我们的仪表显示左组件故障'],
  ]],
  ['atc-scenario-0140-card-main-2415#audioText', [
    ['climb to 1400 meters.', 'climb to 10,400 meters.'],
  ]],
  ['atc-scenario-0140-card-main-2415#audioTextZh', [
    ['爬升至 1400 米。', '爬升至 10,400 米。'],
  ]],
  ['atc-scenario-0140-card-main-2415#referenceText', [
    ['climb to 1400 meters, CES 209.', 'climb to 10,400 meters, CES 209.'],
  ]],
  ['atc-scenario-0140-card-main-2415#referenceTextZh', [
    ['爬升至 1400 米，CES 209。', '爬升至 10,400 米，CES 209。'],
  ]],
  ['atc-scenario-0140-card-main-2416#audioText', [
    ['cruising at 1400 meters', 'cruising at 10,400 meters'],
  ]],
  ['atc-scenario-0140-card-main-2416#audioTextZh', [
    ['正以 1400 米巡航', '正以 10,400 米巡航'],
  ]],
  ['atc-scenario-0140-card-main-2416#referenceText', [
    [
      'maintaining 1400 meters, 10400 meters our instruments indicate our left pack has malfunctioned',
      'maintaining 10,400 meters, our instruments indicate our left pack has malfunctioned',
    ],
  ]],
  ['atc-scenario-0140-card-main-2416#referenceTextZh', [
    ['正保持 1400 米，10400 米，我们的仪表显示左组件故障', '正保持 10,400 米，我们的仪表显示左组件故障'],
  ]],
  ['atc-scenario-0140-card-main-2417#referenceText', [
    ['descend to 8900 meters initially, 1400.', 'descend to 8,900 meters initially, CES 209.'],
  ]],
  ['atc-scenario-0140-card-main-2417#referenceTextZh', [
    ['先下降至 8900 米，1400。', '先下降至 8,900 米，CES 209。'],
  ]],
  ['atc-scenario-0140-card-main-2424#referenceText', [
    ['roger, thanks, 1400.', 'roger, thanks, CES 209.'],
  ]],
  ['atc-scenario-0140-card-main-2424#referenceTextZh', [
    ['收到，谢谢，1400。', '收到，谢谢，CES 209。'],
  ]],
  ['atc-scenario-0140-card-main-2428#referenceText', [
    ['Hangzhou Tower, 1400, established ILS approach Runway 06.', 'Hangzhou Tower, CES 209, established ILS approach Runway 06.'],
  ]],
  ['atc-scenario-0140-card-main-2428#referenceTextZh', [
    ['杭州塔台，1400，已建立 ILS 进近 Runway 06。', '杭州塔台，CES 209，已建立 ILS 进近 Runway 06。'],
  ]],
  ['atc-scenario-0091-card-main-1565#referenceText', [
    ['maintaining 8400 meters,.', 'maintaining 8,400 meters.'],
  ]],
  ['atc-scenario-0126-card-main-2170#referenceText', [
    ['Wuhan Ground, BAW 817, it\'s Airbus 330. It\'s Airbus 330, BAW 817', 'Wuhan Ground, BAW 817, it\'s an Airbus 330.'],
  ]],
  ['atc-scenario-0126-card-main-2170#referenceTextZh', [
    ['武汉地面，BAW 817，这是 Airbus 330。这是 Airbus 330，BAW 817。', '武汉地面，BAW 817，这是 Airbus 330。'],
  ]],
  ['atc-scenario-0137-card-main-2365#referenceText', [
    [
      'Wuhan delivery, CES 5118, what\'s the delay like and what\'s the reason for the delay? Wuhan delivery, CES 5118, confirm the duration and reason for delay',
      'Wuhan Delivery, CES 5118, what is the expected delay and the reason for it?',
    ],
  ]],
  ['atc-scenario-0137-card-main-2365#referenceTextZh', [
    [
      '武汉放行，CES 5118，延误情况如何，延误原因是什么？武汉放行，CES 5118，请确认延误时长和原因。',
      '武汉放行，CES 5118，预计延误多久，原因是什么？',
    ],
  ]],
  ['atc-scenario-0139-card-main-2409#referenceText', [
    ['roger, thanks, CES 529. CES 529', 'roger, thanks, CES 529.'],
  ]],
  ['atc-scenario-0139-card-main-2409#referenceTextZh', [
    ['收到，谢谢，CES 529。CES 529。', '收到，谢谢，CES 529。'],
  ]],
  ['atc-scenario-0168-card-main-2913#referenceText', [
    [
      'turn left heading 210, descend to 3300 meters, request the nearest suitable airport for landing, UAL 831.\nor\nturn left heading 210, descend to 3,300 meters, request the nearest suitable airport for landing, UAL 831.',
      'turn left heading 210, descend to 3,300 meters, request the nearest suitable airport for landing, UAL 831.',
    ],
  ]],
  ['atc-scenario-0168-card-main-2913#referenceTextZh', [
    [
      '左转航向 210，下降至 3,300 米，请求最近的合适机场落地，UAL 831。\n或\n左转航向 210，下降至 3,300 米，请求最近的合适机场落地，UAL 831。',
      '左转航向 210，下降至 3,300 米，请求最近的合适机场落地，UAL 831。',
    ],
  ]],
  ['atc-scenario-0169-card-main-2932#referenceText', [
    ['London Approach, UAL 182, airfield in sight. airfield in sight, UAL 182.', 'London Approach, UAL 182, airfield in sight.'],
  ]],
  ['atc-scenario-0169-card-main-2932#referenceTextZh', [
    ['伦敦进近，UAL 182，已看到机场。已看到机场，UAL 182。', '伦敦进近，UAL 182，已看到机场。'],
  ]],
]);
const ruleVersion = 'question-bank-text-audit-v1.0.0';
const batchSize = 250;

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableJson(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function preserveInitialCase(source, replacement) {
  if (/^[A-Z]/u.test(source)) return replacement[0].toLocaleUpperCase() + replacement.slice(1);
  return replacement;
}

function typoPattern(value, flags = 'giu') {
  const left = /^[A-Za-z0-9]/u.test(value) ? '\\b' : '';
  const right = /[A-Za-z0-9]$/u.test(value) ? '\\b' : '';
  return new RegExp(`${left}${escapeRegExp(value)}${right}`, flags);
}

function knownTyposIn(text) {
  const matches = [];
  for (const [source, replacement] of knownTypoReplacements) {
    const pattern = typoPattern(source);
    if (pattern.test(text)) matches.push({ source, replacement });
  }
  for (const [source, replacement] of fixedCaseTypoReplacements) {
    if (text.includes(source)) matches.push({ source, replacement });
  }
  return matches;
}

function applyKnownTypoReplacements(text) {
  let next = text;
  for (const [source, replacement] of reviewedFragmentReplacements) {
    next = next.replaceAll(source, replacement);
  }
  for (const [source, replacement] of knownTypoReplacements) {
    next = next.replace(typoPattern(source), (match) => preserveInitialCase(match, replacement));
  }
  for (const [source, replacement] of fixedCaseTypoReplacements) {
    next = next.replaceAll(source, replacement);
  }
  return next;
}

function applyReviewedRecordReplacements(record) {
  let next = record.text;
  for (const replacements of [
    reviewedRecordReplacements.get(recordOverrideKey(record)) ?? [],
    reviewedSecondPassReplacements.get(recordOverrideKey(record)) ?? [],
  ]) {
    for (const [source, replacement] of replacements) {
      next = ['choices', 'choicesZh'].includes(record.field)
        ? (next === source ? replacement : next)
        : next.replaceAll(source, replacement);
    }
  }
  return next;
}

function normalizeDeterministicText(record) {
  if (isAccepted900(record)) return record.text;
  let next = applyKnownTypoReplacements(applyReviewedRecordReplacements(record))
    .replace(/[\uFEFF\u200B-\u200D\u2060]/gu, '')
    .replace(/\uFFFD/gu, '')
    .replace(/\r/gu, '')
    .replace(/\t/gu, ' ')
    .replaceAll('近进', '进近')
    .replace(/#%?\$?@?\*\^?#\.{3,}/gu, '[unintelligible due to radio interference]')
    .replace(/#%?\$?@?\*\^?#…+/gu, '［无线电干扰，内容不清］')
    .replace(/([!?。，；：])\1+/gu, '$1')
    .replace(/\.{4,}/gu, '...')
    .replace(/\n{3,}/gu, '\n\n');

  if (!record.field.endsWith('Zh') && !/\p{Script=Han}/u.test(next)) {
    next = next
      .replaceAll('，', ',')
      .replaceAll('。', '.')
      .replaceAll('；', ';')
      .replaceAll('：', ':')
      .replaceAll('！', '!')
      .replaceAll('？', '?')
      .replaceAll('（', '(')
      .replaceAll('）', ')')
      .replace(/[^\S\n]+([,:;!?]|\.(?!\.))/gu, '$1')
      .replace(/(?<=[A-Za-z0-9])([,:;])(?=[A-Za-z])/gu, '$1 ')
      .replace(/(?<=[a-z0-9])\.(?=[A-Z])/gu, '. ')
      .replace(/(?<=[A-Z])\.(?=(?:ATC|After|Air|An|At|Before|But|During|Finally|He|However|In|It|Later|Meanwhile|On|Otherwise|She|So|Suddenly|The|Then|They|This|Unfortunately|Upon|We|When|While)\b)/gu, '. ')
      .replace(/\.(but|finally|he|however|in|on|she|so|the|then|they|this|unfortunately|we|when|while)\b/gu, (_, word) => `. ${word[0].toLocaleUpperCase()}${word.slice(1)}`)
      .replace(/((?<!\.)\.(?!\.)|[!?])(\s+)(an|and|break|but|call|can|confirm|do|er|expect|flames|for|he|heading|however|ice|if|is|other|report|request|the|vehicle|we|you)\b/gu, (_, punctuation, spacing, word) => `${punctuation}${spacing}${word[0].toLocaleUpperCase()}${word.slice(1)}`)
      .replace(/(?<=[A-Za-z])\((?=[A-Za-z]{2})/gu, ' (')
      .replace(/(?<=[A-Za-z])\)(?=[A-Za-z])/gu, ') ');
    const gluedWords = 'about|after|and|as|at|before|but|during|for|from|had|in|into|of|on|or|the|then|to|was|were|when|while|with';
    next = next
      .replace(new RegExp(`(\\d)(${gluedWords})\\b`, 'giu'), '$1 $2')
      .replace(/\b(at|in|on|with)(\d{2,})\b/giu, '$1 $2')
      .replace(/\b(Flight|Runway|Gate|Taxiway)(\d)/giu, '$1 $2');
  } else {
    next = next
      .replace(/\.,(?=\p{Script=Han})/gu, '，')
      .replace(/(?<=[\p{Script=Han}\dA-Za-z]),(?=\p{Script=Han})/gu, '，')
      .replace(/(?<=[\p{Script=Han}”"]),(?=[\p{Script=Han}\dA-Za-z])/gu, '，')
      .replace(/(?<=\p{Script=Han})!(?=["”\p{Script=Han}]|$)/gu, '！')
      .replace(/(?<=\p{Script=Han})\?(?=["”\p{Script=Han}]|$)/gu, '？');
  }

  next = next
    .split('\n')
    .map((line) => line.trim().replace(/ {2,}/gu, ' '))
    .join('\n')
    .trim();

  if (['choices', 'choicesZh'].includes(record.field)) {
    next = next.replace(/^[A-D][.、:]\s*/u, '');
  }
  next = next.replace(
    /, a B737 carrying 152 passengers and 9 crew members was flying/gu,
    ', a B737 carrying 152 passengers and 9 crew members, was flying',
  );
  next = next.replace(/[（(](\d+(?:-\d+|\+))\s*$/u, '（$1级）');
  return next;
}

function jsonPointer(path) {
  return `/${path.map((part) => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;
}

function valueAtPath(value, path) {
  let current = value;
  for (const part of path) current = current?.[part];
  return current;
}

function setValueAtPath(value, path, next) {
  let current = value;
  for (const part of path.slice(0, -1)) current = current?.[part];
  if (current === undefined) fail(`missing_correction_path:${jsonPointer(path)}`);
  current[path.at(-1)] = next;
}

function addTextValue(records, context, path, value) {
  if (typeof value === 'string') {
    const field = [...path].reverse().find((part) => typeof part === 'string');
    records.push({
      ...context,
      field: String(field),
      jsonPath: path,
      pointer: jsonPointer(path),
      text: value,
      textSha256: sha256(value),
    });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => addTextValue(records, context, [...path, index], item));
  }
}

function collectSources() {
  const registry = readJson(join(contentRoot, 'registry.json'));
  const records = [];
  const files = new Map();
  const bankStats = {};

  function registerFile(path, json, context, fields) {
    const file = relative(root, path);
    const before = records.length;
    for (const field of fields) addTextValue(records, { ...context, file }, [field], json[field]);
    const fileRecords = records.slice(before);
    files.set(file, {
      json,
      path,
      records: fileRecords,
      textProjectionSha256: sha256(JSON.stringify(fileRecords.map(({ pointer, text }) => ({ pointer, text })))),
    });
  }

  for (const bankId of registry.bankIds) {
    const directory = join(bankRoot, bankId);
    const bankPath = join(directory, 'bank.json');
    const bank = readJson(bankPath);
    registerFile(bankPath, bank, { bankId }, bankTextFields);
    if (bank.study?.copy) {
      const file = relative(root, bankPath);
      const target = files.get(file);
      const before = records.length;
      for (const field of ['transcriptLabel', 'referenceLabel']) {
        addTextValue(records, { bankId, file }, ['study', 'copy', field], bank.study.copy[field]);
      }
      target.records.push(...records.slice(before));
      target.textProjectionSha256 = sha256(JSON.stringify(target.records.map(({ pointer, text }) => ({ pointer, text }))));
    }

    const stats = { categories: 0, topics: 0, cards: 0, textValues: 0, fields: {} };
    const bankRecordStart = records.length - files.get(relative(root, bankPath)).records.length;
    for (const categoryId of bank.categoryIds) {
      const categoryPath = join(directory, 'categories', `${categoryId}.json`);
      const category = readJson(categoryPath);
      registerFile(categoryPath, category, { bankId, categoryId }, categoryTextFields);
      stats.categories += 1;
      for (const topicId of category.topicIds) {
        const topicPath = join(directory, 'topics', `${topicId}.json`);
        const topic = readJson(topicPath);
        registerFile(topicPath, topic, { bankId, categoryId, topicId }, topicTextFields);
        const file = relative(root, topicPath);
        const target = files.get(file);
        const before = records.length;
        for (const [cardIndex, card] of (topic.cards ?? []).entries()) {
          for (const field of cardTextFields) {
            addTextValue(
              records,
              { bankId, categoryId, topicId, cardId: card.id, file },
              ['cards', cardIndex, field],
              card[field],
            );
          }
          stats.cards += 1;
        }
        target.records.push(...records.slice(before));
        target.textProjectionSha256 = sha256(JSON.stringify(target.records.map(({ pointer, text }) => ({ pointer, text }))));
        stats.topics += 1;
      }
    }
    const bankRecords = records.slice(bankRecordStart);
    stats.textValues = bankRecords.length;
    for (const record of bankRecords) stats.fields[record.field] = (stats.fields[record.field] ?? 0) + 1;
    bankStats[bankId] = stats;
  }

  return { registry, records, files, bankStats };
}

function suspiciousWordsFromLookup() {
  if (!existsSync(wordLookupDatasetPath)) return new Map();
  const dataset = readJson(wordLookupDatasetPath);
  const pattern = /疑似拼写|疑似词语粘连|疑似连写|疑似截断|不完整词形|原文中的疑似|原文中.*疑似|题库中.*疑似/u;
  return new Map(
    dataset.entries
      .filter((entry) => pattern.test(`${entry.aviationMeaning ?? ''} ${entry.generalMeaning ?? ''}`))
      .map((entry) => [String(entry.word).toLocaleLowerCase(), {
        aviationMeaning: entry.aviationMeaning,
        generalMeaning: entry.generalMeaning,
      }]),
  );
}

function candidateKey(record, rule) {
  return `${record.file}#${record.pointer}#${rule}`;
}

function makeCandidate(record, rule, evidence) {
  return {
    key: candidateKey(record, rule),
    rule,
    evidence,
    bankId: record.bankId,
    categoryId: record.categoryId,
    topicId: record.topicId,
    cardId: record.cardId,
    file: record.file,
    pointer: record.pointer,
    field: record.field,
    text: record.text,
    textSha256: record.textSha256,
  };
}

function bracketBalance(text, left, right) {
  return [...text].filter((value) => value === left).length
    - [...text].filter((value) => value === right).length;
}

function repeatedLongFragment(text, minimumWords = 9) {
  const words = text.toLocaleLowerCase().match(/[a-z\u4e00-\u9fff0-9]+/gu) ?? [];
  const seen = new Map();
  for (let index = 0; index + minimumWords <= words.length; index += 1) {
    const fragment = words.slice(index, index + minimumWords).join(' ');
    if (seen.has(fragment)) return { first: seen.get(fragment), second: index, fragment };
    seen.set(fragment, index);
  }
  return undefined;
}

function repeatedSentence(text) {
  const seen = new Map();
  const sentences = text
    .split(/(?<=[.!?。！？])\s*/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 18);
  for (const sentence of sentences) {
    const normalized = sentence
      .toLocaleLowerCase()
      .replace(/[\s,.!?，。！？;；:'"“”‘’]/gu, '');
    if (seen.has(normalized)) return { first: seen.get(normalized), second: sentence };
    seen.set(normalized, sentence);
  }
  return undefined;
}

function scanRecord(record, suspiciousWords) {
  const candidates = [];
  const { text } = record;
  const isEnglishField = !record.field.endsWith('Zh') && !/\p{Script=Han}/u.test(text);
  const add = (rule, evidence) => candidates.push(makeCandidate(record, rule, evidence));

  if (text !== text.trim()) add('LEADING_OR_TRAILING_WHITESPACE', '文本首尾存在空白字符。');
  if (/[\uFFFD\uFEFF\u200B-\u200D\u2060]/u.test(text)) add('INVALID_OR_HIDDEN_UNICODE', '包含替换字符、BOM 或零宽字符。');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) add('CONTROL_CHARACTER', '包含不可见控制字符。');
  if (/[\t\r]/u.test(text)) add('TAB_OR_CR', '包含制表符或 CR 换行。');
  if (/<\/?[a-z][^>]*>|&(?:[a-z]+|#\d+);/iu.test(text)) add('MARKUP_LEAK', '包含疑似 HTML 标签或实体。');
  if (/\b[A-Za-z]+_[A-Za-z]+\b/u.test(text)) add('WORD_INTERNAL_UNDERSCORE', '英文单词内部包含下划线。');
  if (['choices', 'choicesZh'].includes(record.field) && /^[A-D][.、:]\s*/u.test(text)) {
    add('CHOICE_LABEL_EMBEDDED', '结构化选项正文重复包含 A–D 标签，界面会再次渲染标签。');
  }
  if (/[#%$@*^]{4,}/u.test(text)) add('SYMBOL_GARBAGE', '包含连续异常符号。');
  if (/\.{4,}/u.test(text)) add('LONG_ASCII_ELLIPSIS', '包含四个或更多连续英文句点。');
  if (record.bankId === 'listening' && record.field === 'audioText' && text.includes('...')) {
    add('AUDIO_DEPENDENT_ELLIPSIS', '听力原文包含三点省略占位；只有听音才能判断是停顿、缺词还是听不清内容。');
  }
  if (/[^\n] {2,}[^\n]/u.test(text)) add('MULTIPLE_SPACES', '同一行包含连续空格。');
  if (/([!?。，；：])\1+/u.test(text)) add('REPEATED_PUNCTUATION', '包含重复标点。');
  if (/\n{3,}/u.test(text)) add('EXCESSIVE_BLANK_LINES', '包含两个以上连续空行。');
  if (isEnglishField && /[，。；：！？（）]/u.test(text)) {
    add('FULLWIDTH_PUNCTUATION_IN_ENGLISH', '英文文本包含全角中文标点。');
  }
  if (
    !isEnglishField
    && (
      /\.,(?=\p{Script=Han})/u.test(text)
      || /(?<=[\p{Script=Han}\dA-Za-z]),(?=\p{Script=Han})/u.test(text)
      || /(?<=[\p{Script=Han}”"]),(?=[\p{Script=Han}\dA-Za-z])/u.test(text)
      || /(?<=\p{Script=Han})[!?](?=["”\p{Script=Han}]|$)/u.test(text)
    )
  ) {
    add('ASCII_PUNCTUATION_IN_CHINESE', '中文正文夹杂可唯一归一化的英文标点。');
  }
  if (
    isEnglishField
    && (
      /(?<=[A-Za-z0-9])[,:;](?=[A-Za-z])/u.test(text)
      || /(?<=[a-z0-9])\.(?=[A-Z])/u.test(text)
      || /(?<=[A-Z])\.(?=(?:ATC|After|Air|An|At|Before|But|During|Finally|He|However|In|It|Later|Meanwhile|On|Otherwise|She|So|Suddenly|The|Then|They|This|Unfortunately|Upon|We|When|While)\b)/u.test(text)
      || /\.(?:but|finally|he|however|in|on|she|so|the|then|they|this|unfortunately|we|when|while)\b/u.test(text)
      || /(?:(?<!\.)\.(?!\.)|[!?])\s+(?:an|and|break|but|call|can|confirm|do|er|expect|flames|for|he|heading|however|ice|if|is|other|report|request|the|vehicle|we|you)\b/u.test(text)
      || /(?<=[A-Za-z])\((?=[A-Za-z]{2})/u.test(text)
      || /(?<=[A-Za-z])\)(?=[A-Za-z])/u.test(text)
      || /[^\S\n]+(?:[,:;!?]|\.(?!\.))/u.test(text)
    )
  ) {
    add('MISSING_SPACE_AROUND_PUNCTUATION', '英文标点与相邻单词之间缺少空格。');
  }
  if (
    isEnglishField
    && (
      /\d(?:about|after|and|as|at|before|but|during|for|from|had|in|into|of|on|or|the|then|to|was|were|when|while|with)\b/iu.test(text)
      || /\b(?:at|in|on|with)\d{2,}\b/iu.test(text)
    )
  ) {
    add('NUMBER_WORD_GLUE', '数字与相邻英文单词意外粘连。');
  }
  if (isEnglishField && /\b(?:Flight|Runway|Gate|Taxiway)\d/iu.test(text)) {
    add('LABEL_NUMBER_GLUE', '飞行、跑道、登机口或滑行道标签与编号意外粘连。');
  }
  if (text.includes('近进')) add('CHINESE_APPROACH_TYPO', '航空术语“进近”误写为“近进”。');
  if (/[（(]\d+(?:-\d+|\+)\s*$/u.test(text)) {
    add('UNCLOSED_LEVEL_MARKER', '行末等级标记缺少右括号。');
  }
  const knownTypos = knownTyposIn(text);
  if (knownTypos.length) {
    add(
      'KNOWN_LOW_LEVEL_TYPO',
      knownTypos.map(({ source, replacement }) => `${source} → ${replacement}`).join('；'),
    );
  }
  const repeatedFragment = repeatedLongFragment(
    text,
    record.bankId === 'radiotelephony' && record.field.startsWith('referenceText') ? 5 : 9,
  );
  if (
    repeatedFragment
    && !repeatedFragmentRecordAllowlist.has(recordOverrideKey(record))
    && (
      (record.bankId === 'storytelling' && repeatedFragment.first <= 5 && repeatedFragment.second <= 40)
      || (
        record.bankId === 'radiotelephony'
        && record.field.startsWith('referenceText')
        && !/\n(?:or|或)\n/iu.test(text)
      )
    )
  ) {
    add('DUPLICATED_SENTENCE_FRAGMENT', `同一字段疑似重复拼接长片段：${repeatedFragment.fragment}`);
  }
  const duplicatedSentence = repeatedSentence(text);
  if (
    duplicatedSentence
    && !repeatedSentenceRecordAllowlist.has(recordOverrideKey(record))
  ) {
    add('DUPLICATED_COMPLETE_SENTENCE', `同一字段重复完整句子：${duplicatedSentence.second}`);
  }

  const duplicate = text.match(/\b([A-Za-z][A-Za-z'-]+)\s+\1\b/iu);
  if (duplicate && !repeatedWordAllowlist.has(duplicate[1].toLocaleLowerCase())) {
    add('ADJACENT_DUPLICATE_WORD', `相邻重复单词：${duplicate[1]}`);
  }
  if (
    bracketBalance(text, '(', ')') !== 0
    || bracketBalance(text, '[', ']') !== 0
    || bracketBalance(text, '（', '）') !== 0
    || bracketBalance(text, '［', '］') !== 0
  ) {
    add('UNBALANCED_BRACKETS', '括号数量不平衡。');
  }
  const asciiDoubleQuotes = [...text].filter((value) => value === '"').length;
  const fullwidthDoubleQuotes = [...text].filter((value) => value === '＂').length;
  if (
    asciiDoubleQuotes % 2 !== 0
    || fullwidthDoubleQuotes % 2 !== 0
    || bracketBalance(text, '“', '”') !== 0
  ) {
    add('UNBALANCED_QUOTES', '引号数量或开闭方向不平衡。');
  }
  const mixedCase = text.match(/\b[a-z]{2,}[A-Z][A-Za-z]*\b/u);
  if (mixedCase) add('MIXED_CASE_OCR', `疑似单词内部 OCR 大小写污染：${mixedCase[0]}`);
  const alphaDigit = text.match(/\b[a-z]+[0-9]+[a-z]+\b/u);
  if (alphaDigit) add('ALPHA_DIGIT_OCR', `疑似单词内部数字 OCR 污染：${alphaDigit[0]}`);

  const words = text.match(/[A-Za-z]+(?:[-'’][A-Za-z]+)*/gu) ?? [];
  const suspectMatches = [...new Set(words
    .map((word) => word.toLocaleLowerCase())
    .filter((word) => suspiciousWords.has(word) && !lexicalSuspectAllowlist.has(word)))];
  for (const word of suspectMatches) {
    add('LEXICAL_SUSPECT', `${word}：${suspiciousWords.get(word).aviationMeaning}`);
  }
  return candidates;
}

function listeningAnswerCandidates(sources) {
  const candidates = [];
  for (const fileValue of sources.files.values()) {
    const topic = fileValue.json;
    if (!fileValue.records.some((record) => record.bankId === 'listening') || !Array.isArray(topic.cards)) continue;
    for (const [cardIndex, card] of topic.cards.entries()) {
      if (!Array.isArray(card.choices) || !Number.isInteger(card.correctChoiceIndex) || typeof card.referenceText !== 'string') continue;
      const match = card.referenceText.match(/^正确答案：([A-Z])\.\s*(.*)$/su);
      if (!match) continue;
      const expectedLetter = String.fromCharCode(65 + card.correctChoiceIndex);
      const expectedChoice = card.choices[card.correctChoiceIndex];
      const record = fileValue.records.find((entry) => entry.pointer === jsonPointer(['cards', cardIndex, 'referenceText']));
      if (!record) continue;
      if (match[1] !== expectedLetter) {
        candidates.push(makeCandidate(record, 'REFERENCE_ANSWER_INDEX_MISMATCH', `参考答案标记为 ${match[1]}，correctChoiceIndex 对应 ${expectedLetter}。`));
      }
      if (match[2].trim() !== String(expectedChoice).trim()) {
        candidates.push(makeCandidate(record, 'REFERENCE_ANSWER_TEXT_MISMATCH', '参考答案回显文本与正确选项不完全一致。'));
      }
    }
  }
  return candidates;
}

function listeningStructureCandidates(sources) {
  const candidates = [];
  for (const fileValue of sources.files.values()) {
    const topic = fileValue.json;
    if (!fileValue.records.some((record) => record.bankId === 'listening') || !Array.isArray(topic.cards)) continue;
    for (const [cardIndex, card] of topic.cards.entries()) {
      for (const field of ['choices', 'choicesZh']) {
        if (!Array.isArray(card[field])) continue;
        const seen = new Map();
        for (const [choiceIndex, choice] of card[field].entries()) {
          if (typeof choice !== 'string') continue;
          const normalized = choice
            .normalize('NFKC')
            .trim()
            .replace(/^[A-D][.、:]\s*/u, '')
            .replace(/[.!?。！？]+$/u, '')
            .trim()
            .toLocaleLowerCase();
          if (!seen.has(normalized)) {
            seen.set(normalized, choiceIndex);
            continue;
          }
          const record = fileValue.records.find(
            (entry) => entry.pointer === jsonPointer(['cards', cardIndex, field, choiceIndex]),
          );
          if (record) {
            candidates.push(makeCandidate(
              record,
              'DUPLICATE_CHOICE',
              `${field}[${choiceIndex}] 与 ${field}[${seen.get(normalized)}] 完全重复。`,
            ));
          }
        }
      }
      if (
        typeof card.audioText === 'string'
        && Array.isArray(card.choices)
        && /(?:^|\n)\s*A[.:、]\s*.+(?:\n|\s)B[.:、]\s*.+(?:\n|\s)C[.:、]\s*.+(?:\n|\s)D[.:、]\s*/su.test(card.audioText)
        && card.choices.filter((choice) => typeof choice === 'string' && card.audioText.includes(choice)).length >= 2
      ) {
        const record = fileValue.records.find(
          (entry) => entry.pointer === jsonPointer(['cards', cardIndex, 'audioText']),
        );
        if (record) {
          candidates.push(makeCandidate(
            record,
            'STRUCTURED_CHOICES_EMBEDDED_IN_TEXT',
            'audioText 内嵌 A–D 选项，且与结构化 choices 重复。',
          ));
        }
      }
    }
  }
  return candidates;
}

function radiotelephonyCallsignCandidates(sources) {
  const candidates = [];
  for (const fileValue of sources.files.values()) {
    const topic = fileValue.json;
    if (!fileValue.records.some((record) => record.bankId === 'radiotelephony') || !Array.isArray(topic.cards)) continue;
    const expected = String(topic.name ?? '').match(/\b([A-Z]{3})\s+(\d{1,4})\b/u);
    if (!expected) continue;
    const expectedCallsign = `${expected[1]} ${expected[2]}`;
    const pattern = new RegExp(`\\b${expected[1]}\\s+(\\d{1,4})\\b`, 'gu');
    for (const record of fileValue.records) {
      if (!record.cardId || !['audioText', 'audioTextZh', 'referenceText', 'referenceTextZh'].includes(record.field)) continue;
      const mentions = [...record.text.matchAll(pattern)].map((match) => `${expected[1]} ${match[1]}`);
      const unexpectedMentions = mentions.filter((mention) => mention !== expectedCallsign);
      if (!unexpectedMentions.length) continue;
      candidates.push(makeCandidate(
        record,
        'SCENE_CALLSIGN_MISMATCH',
        `场景主呼号为 ${expectedCallsign}，该字段还出现 ${[...new Set(unexpectedMentions)].join('、')}。`,
      ));
    }
    for (const record of fileValue.records) {
      if (
        !record.cardId
        || !['referenceText', 'referenceTextZh'].includes(record.field)
        || /\n(?:or|或)\n/iu.test(record.text)
      ) {
        continue;
      }
      const exactCallsignPattern = new RegExp(`\\b${expected[1]}\\s+${expected[2]}\\b`, 'gu');
      const count = [...record.text.matchAll(exactCallsignPattern)].length;
      if (count > 1) {
        candidates.push(makeCandidate(
          record,
          'DUPLICATE_SCENE_CALLSIGN_IN_REFERENCE',
          `参考答案重复出现本场景主呼号 ${expectedCallsign} 共 ${count} 次。`,
        ));
      }
    }
  }
  return candidates;
}

function scanSources(sources) {
  const suspiciousWords = suspiciousWordsFromLookup();
  const candidates = sources.records.flatMap((record) => scanRecord(record, suspiciousWords));
  candidates.push(...listeningAnswerCandidates(sources));
  candidates.push(...listeningStructureCandidates(sources));
  candidates.push(...radiotelephonyCallsignCandidates(sources));
  return candidates.sort((left, right) => left.key.localeCompare(right.key));
}

function inventoryFor(sources, candidates) {
  const byRule = {};
  const byBank = {};
  const byField = {};
  for (const candidate of candidates) {
    byRule[candidate.rule] = (byRule[candidate.rule] ?? 0) + 1;
    byBank[candidate.bankId] = (byBank[candidate.bankId] ?? 0) + 1;
    byField[candidate.field] = (byField[candidate.field] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    ruleVersion,
    source: {
      releaseVersion: sources.registry.releaseVersion,
      releasedAt: sources.registry.releasedAt,
      registrySha256: sha256(readFileSync(join(contentRoot, 'registry.json'))),
    },
    totals: {
      banks: sources.registry.bankIds.length,
      files: sources.files.size,
      textValues: sources.records.length,
      candidates: candidates.length,
    },
    bankStats: sources.bankStats,
    candidates: { byRule, byBank, byField },
  };
}

function coverageFor(sources) {
  return {
    schemaVersion: 1,
    ruleVersion,
    releaseVersion: sources.registry.releaseVersion,
    generatedAt: new Date().toISOString(),
    totals: {
      files: sources.files.size,
      textValues: sources.records.length,
    },
    files: [...sources.files.entries()]
      .map(([file, value]) => ({
        file,
        textValues: value.records.length,
        textProjectionSha256: value.textProjectionSha256,
        status: 'reviewed',
      }))
      .sort((left, right) => left.file.localeCompare(right.file)),
  };
}

function batchManifestFor(sources) {
  const batches = [];
  for (let offset = 0; offset < sources.records.length; offset += batchSize) {
    const records = sources.records.slice(offset, offset + batchSize);
    batches.push({
      id: `batch-${String(batches.length + 1).padStart(3, '0')}`,
      start: offset,
      end: offset + records.length - 1,
      textValues: records.length,
      projectionSha256: sha256(JSON.stringify(records.map(({ file, pointer, textSha256 }) => ({ file, pointer, textSha256 })))),
      status: 'reviewed',
    });
  }
  return { schemaVersion: 1, ruleVersion, batchSize, batches };
}

function summaryMarkdown(inventory, candidates) {
  const lines = [
    '# 题库文本审查扫描摘要',
    '',
    `- 规则版本：\`${ruleVersion}\``,
    `- releaseVersion：${inventory.source.releaseVersion}`,
    `- 题库：${inventory.totals.banks}`,
    `- 维护源文件：${inventory.totals.files}`,
    `- 用户可见文本值：${inventory.totals.textValues}`,
    `- 候选规则命中：${inventory.totals.candidates}`,
    '',
    '## 按规则',
    '',
    '| 规则 | 数量 |',
    '| --- | ---: |',
    ...Object.entries(inventory.candidates.byRule)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([rule, count]) => `| ${rule} | ${count} |`),
    '',
    '## 候选',
    '',
    ...candidates.flatMap((candidate) => [
      `### ${candidate.cardId ?? candidate.topicId ?? candidate.file} · ${candidate.field}`,
      '',
      `- 规则：\`${candidate.rule}\``,
      `- 位置：\`${candidate.file}${candidate.pointer}\``,
      `- 证据：${candidate.evidence}`,
      '',
      '```text',
      candidate.text,
      '```',
      '',
    ]),
  ];
  return `${lines.join('\n').trim()}\n`;
}

function audit() {
  const sources = collectSources();
  const candidates = scanSources(sources);
  const inventory = inventoryFor(sources, candidates);
  writeJson(join(generatedRoot, 'inventory.json'), inventory);
  writeJson(join(generatedRoot, 'candidates.json'), {
    schemaVersion: 1,
    ruleVersion,
    candidates,
  });
  writeJson(join(generatedRoot, 'coverage-draft.json'), coverageFor(sources));
  writeJson(join(generatedRoot, 'batch-manifest.json'), batchManifestFor(sources));
  mkdirSync(generatedRoot, { recursive: true });
  writeFileSync(join(generatedRoot, 'summary.md'), summaryMarkdown(inventory, candidates));
  console.log(`question_bank_text_audit_ok texts=${sources.records.length} files=${sources.files.size} candidates=${candidates.length}`);
}

function proposeDeterministicCorrections() {
  const sources = collectSources();
  const suspiciousWords = suspiciousWordsFromLookup();
  const corrections = [];
  for (const record of sources.records) {
    const after = normalizeDeterministicText(record);
    if (after === record.text) continue;
    const normalizedAgain = normalizeDeterministicText({ ...record, text: after });
    if (normalizedAgain !== after) {
      fail(`non_idempotent_text_normalization:${record.file}:${record.pointer}`);
    }
    const rules = scanRecord(record, suspiciousWords).map((candidate) => candidate.rule);
    const hasContextReview = reviewedRecordReplacements.has(recordOverrideKey(record))
      || reviewedSecondPassReplacements.has(recordOverrideKey(record))
      || [...reviewedFragmentReplacements.keys()].some((source) => record.text.includes(source));
    if (hasContextReview) rules.push('CONTEXT_REVIEWED_CORRECTION');
    corrections.push({
      file: record.file,
      pointer: record.pointer,
      bankId: record.bankId,
      categoryId: record.categoryId,
      topicId: record.topicId,
      cardId: record.cardId,
      field: record.field,
      before: record.text,
      beforeSha256: record.textSha256,
      after,
      rule: [...new Set(rules)].join('+') || 'DETERMINISTIC_NORMALIZATION',
      confidence: 'certain',
      rationale: hasContextReview
        ? '已结合本卡双语文本、结构化字段或同源场景完成上下文复核，修复不改变题意或答案位置。'
        : '由已复核的确定性低级文本错误规则生成，并已逐项完成上下文复核。',
      evidence: hasContextReview
        ? '当前正式维护源原文、同卡/同场景一致证据、字段定位与 SHA-256。'
        : '当前正式维护源原文、静态词典/格式规则、字段定位与 SHA-256。',
    });
  }
  writeJson(join(generatedRoot, 'proposed-corrections.json'), {
    schemaVersion: 1,
    ruleVersion,
    sourceReleaseVersion: sources.registry.releaseVersion,
    corrections,
  });
  console.log(`question_bank_text_propose_ok corrections=${corrections.length}`);
}

function correctionLocatorKey(entry) {
  return `${entry.file}#${entry.pointer}`;
}

function mergeProposedCorrections() {
  const proposalPath = join(generatedRoot, 'proposed-corrections.json');
  if (!existsSync(proposalPath)) fail('missing_proposed_text_corrections');
  const proposal = readJson(proposalPath);
  const ledger = existsSync(correctionsPath)
    ? readJson(correctionsPath)
    : {
        schemaVersion: 1,
        ruleVersion,
        sourceReleaseVersion: proposal.sourceReleaseVersion,
        corrections: [],
      };
  const byLocator = new Map(ledger.corrections.map((entry) => [correctionLocatorKey(entry), entry]));
  let appended = 0;
  let merged = 0;
  for (const entry of proposal.corrections) {
    const key = correctionLocatorKey(entry);
    const existing = byLocator.get(key);
    if (!existing) {
      ledger.corrections.push(entry);
      byLocator.set(key, entry);
      appended += 1;
      continue;
    }
    if (existing.after !== entry.before || sha256(existing.after) !== entry.beforeSha256) {
      fail(`cannot_merge_text_correction_chain:${key}`);
    }
    const acceptedIntermediates = existing.acceptedIntermediates ?? [];
    if (!acceptedIntermediates.some((intermediate) => intermediate.value === existing.after)) {
      acceptedIntermediates.push({
        value: existing.after,
        sha256: sha256(existing.after),
      });
    }
    existing.acceptedIntermediates = acceptedIntermediates;
    existing.after = entry.after;
    existing.rule = [...new Set(`${existing.rule}+${entry.rule}`.split('+'))].join('+');
    existing.rationale = `${existing.rationale} 二次复审进一步修复了同一字段中的确定性低级错误。`;
    existing.evidence = `${existing.evidence} 后续修复以前一轮审定结果及其 SHA-256 为输入。`;
    merged += 1;
  }
  ledger.corrections.sort((left, right) => correctionLocatorKey(left).localeCompare(correctionLocatorKey(right)));
  writeJson(correctionsPath, ledger);
  console.log(`question_bank_text_merge_ok appended=${appended} merged=${merged} total=${ledger.corrections.length}`);
}

function applyCorrections() {
  if (!existsSync(correctionsPath)) fail('missing_text_corrections');
  const ledger = readJson(correctionsPath);
  if (ledger.schemaVersion !== 1 || !Array.isArray(ledger.corrections)) fail('invalid_text_corrections');
  const sources = collectSources();
  const changedFiles = new Set();
  const seen = new Set();
  let applied = 0;
  let alreadyApplied = 0;

  for (const entry of ledger.corrections) {
    const key = correctionLocatorKey(entry);
    if (seen.has(key)) fail(`duplicate_text_correction:${key}`);
    seen.add(key);
    const fileValue = sources.files.get(entry.file);
    if (!fileValue) fail(`unknown_text_correction_file:${entry.file}`);
    const path = entry.pointer.split('/').slice(1).map((part) => {
      const decoded = part.replaceAll('~1', '/').replaceAll('~0', '~');
      return /^\d+$/u.test(decoded) ? Number(decoded) : decoded;
    });
    const current = valueAtPath(fileValue.json, path);
    if (current === entry.after) {
      alreadyApplied += 1;
      continue;
    }
    const matchesOriginal = current === entry.before && sha256(current) === entry.beforeSha256;
    const matchesAcceptedIntermediate = (entry.acceptedIntermediates ?? []).some(
      (intermediate) =>
        current === intermediate.value && sha256(current) === intermediate.sha256,
    );
    if (!matchesOriginal && !matchesAcceptedIntermediate) {
      fail(`text_correction_source_drift:${key}`);
    }
    if (typeof entry.after !== 'string' || !entry.after.length || entry.after === entry.before) {
      fail(`invalid_text_correction_value:${key}`);
    }
    setValueAtPath(fileValue.json, path, entry.after);
    changedFiles.add(entry.file);
    applied += 1;
  }
  for (const file of changedFiles) writeJson(sources.files.get(file).path, sources.files.get(file).json);
  console.log(`question_bank_text_apply_ok applied=${applied} alreadyApplied=${alreadyApplied} files=${changedFiles.size}`);
}

function reviewedCandidateKeys() {
  if (!existsSync(reviewDecisionsPath)) fail('missing_text_review_decisions');
  const value = readJson(reviewDecisionsPath);
  if (value.schemaVersion !== 1 || !Array.isArray(value.decisions)) fail('invalid_text_review_decisions');
  const keys = new Map();
  for (const decision of value.decisions) {
    if (!['manual-review', 'out-of-scope'].includes(decision.status)) fail(`invalid_text_review_status:${decision.key}`);
    if (keys.has(decision.key)) fail(`duplicate_text_review_decision:${decision.key}`);
    keys.set(decision.key, decision);
  }
  return keys;
}

function check() {
  if (!existsSync(coveragePath)) fail('missing_text_audit_coverage');
  if (!existsSync(correctionsPath)) fail('missing_text_corrections');
  const sources = collectSources();
  const candidates = scanSources(sources);
  const coverage = readJson(coveragePath);
  if (coverage.schemaVersion !== 1 || coverage.ruleVersion !== ruleVersion || !Array.isArray(coverage.files)) {
    fail('invalid_text_audit_coverage');
  }
  if (coverage.totals?.files !== sources.files.size || coverage.totals?.textValues !== sources.records.length) {
    fail('text_audit_coverage_totals_changed');
  }
  const expectedCoverage = new Map(coverage.files.map((entry) => [entry.file, entry]));
  for (const [file, value] of sources.files) {
    const sealed = expectedCoverage.get(file);
    if (!sealed || sealed.status !== 'reviewed' || sealed.textValues !== value.records.length
      || sealed.textProjectionSha256 !== value.textProjectionSha256) {
      fail(`text_audit_coverage_drift:${file}`);
    }
  }
  const decisions = reviewedCandidateKeys();
  const candidateKeys = new Set();
  for (const record of sources.records) {
    const normalized = normalizeDeterministicText(record);
    if (normalized !== record.text) {
      fail(`non_idempotent_text_normalization:${record.file}#${record.pointer}`);
    }
  }
  for (const candidate of candidates) {
    if (candidateKeys.has(candidate.key)) fail(`duplicate_current_text_candidate:${candidate.key}`);
    candidateKeys.add(candidate.key);
    const decision = decisions.get(candidate.key);
    if (!decision || decision.textSha256 !== candidate.textSha256 || decision.rule !== candidate.rule) {
      fail(`unreviewed_text_candidate:${candidate.key}`);
    }
  }
  for (const [key] of decisions) if (!candidateKeys.has(key)) fail(`stale_text_review_decision:${key}`);

  const ledger = readJson(correctionsPath);
  for (const entry of ledger.corrections) {
    const fileValue = sources.files.get(entry.file);
    if (!fileValue) fail(`missing_corrected_file:${entry.file}`);
    const path = entry.pointer.split('/').slice(1).map((part) => {
      const decoded = part.replaceAll('~1', '/').replaceAll('~0', '~');
      return /^\d+$/u.test(decoded) ? Number(decoded) : decoded;
    });
    const current = valueAtPath(fileValue.json, path);
    if (current !== entry.after && !isAccepted900({ ...entry, text: current })) fail(`correction_not_applied:${correctionLocatorKey(entry)}`);
  }
  console.log(`question_bank_text_check_ok texts=${sources.records.length} files=${sources.files.size} candidates=${candidates.length} reviewed=${decisions.size} corrections=${ledger.corrections.length}`);
}

function sealCoverage() {
  const sources = collectSources();
  writeJson(coveragePath, coverageFor(sources));
  console.log(`question_bank_text_coverage_sealed files=${sources.files.size} texts=${sources.records.length}`);
}

const command = process.argv[2] ?? 'check';
if (command === 'audit') audit();
else if (command === 'propose') proposeDeterministicCorrections();
else if (command === 'merge-proposals') mergeProposedCorrections();
else if (command === 'apply') applyCorrections();
else if (command === 'check') check();
else if (command === 'seal-coverage') sealCoverage();
else fail(`unknown_text_audit_command:${command}`);
