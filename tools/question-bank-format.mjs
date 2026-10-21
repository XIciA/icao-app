import { createHash } from 'node:crypto';

// Scope: the user-approved October 2026 formatting pass. No lexical corrections.
const terms = [
  ['Traffic Alert and Collision Avoidance System', '空中交通告警和防撞系统', 'TCAS'],
  ['foreign object ingestion', '外来物吸入', 'FOI'],
  ['cockpit voice recorder', '驾驶舱话音记录器', 'CVR'],
  ['flight data recorder', '飞行数据记录器', 'FDR'],
  ['radiotelephony', '无线电话通信', 'RTF'],
  ['evidence-based training', '循证训练', 'EBT'],
  ['Flight Crew Training Manual', '飞行机组训练手册', 'FCTM'],
  ['cost index', '成本指数', 'CI'],
  ['Enhanced Ground Proximity Warning System', '增强型近地警告系统', 'EGPWS'],
  ['Ground Proximity Warning System', '近地警告系统', 'GPWS'],
  ['quick access recorder', '快速存取记录器', 'QAR'],
  ['runway visual range', '跑道视程', 'RVR'],
  ['Global Positioning System', '全球定位系统', 'GPS'],
  ['Controlled Flight into Terrain', '可控飞行撞地', 'CFIT'],
  ['electronic flight instrument system', '电子飞行仪表系统', 'EFIS'],
  ['primary flight display', '主飞行显示器', 'PFD'],
  ['visual approach slope indicator', '目视进近坡度指示器', 'VASI'],
  ['precision approach path indicator', '精密进近航道指示器', 'PAPI'],
  ['Controller-Pilot Data Link Communications', '管制员—飞行员数据链通信', 'CPDLC'],
  ['high-frequency', '高频', 'HF'],
  ['foreign object debris', '外来物', 'FOD'],
  ['Continuous Descent Final Approach', '连续下降最后进近', 'CDFA'],
  ['Global Navigation Satellite System', '全球导航卫星系统', 'GNSS'],
  ['electronic flight bag', '电子飞行包', 'EFB'],
  ['Automatic Terminal Information Service', '自动终端情报服务', 'ATIS'],
  ['Reduced Vertical Separation Minimum', '缩小垂直间隔标准', 'RVSM'],
  ['head-up display', '平视显示器', 'HUD'],
  ['clear-air turbulence', '晴空颠簸', 'CAT'],
  ['Quick Reference Handbook', '快速检查单', 'QRH'],
  ['Minimum Equipment List', '最低设备清单', 'MEL'],
  ['passenger announcement', '旅客广播', 'PA'],
  ['performance-based navigation', '基于性能的导航', 'PBN'],
  ['required navigation performance', '所需导航性能', 'RNP'],
  ['area navigation', '区域导航', 'RNAV'],
];
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const textFields = ['taskTitle', 'audioText', 'audioTextZh', 'referenceText', 'referenceTextZh', 'choices', 'choicesZh', 'imageAlt'];

export function simplifyPrompt(text, chinese = false) {
  let next = text;
  for (const [english, zh, acronym] of terms) {
    const full = chinese ? escape(zh) : `(?:\\b(?:a|an|the)\\s+)?\\b${escape(english)}`;
    next = next.replace(new RegExp(`${full}\\s*[（(]${acronym}[）)]`, chinese ? 'gu' : 'giu'), acronym);
  }
  return next;
}

export function withoutRedundancy(text, { bankId, field }) {
  let next = text;
  // Only complete attribution lines, never substrings in a learning sentence.
  next = next.split(/\r?\n/u).filter(line => !/^\s*(?:(?:copyright|版权所有|版权声明|资料来源|题库来源|整理来源|来源|整理者|编者)\s*[:：©]|©|第[\d一二三四五六七八九十百]+套(?:题|试题)(?:\s|$)|(?:匪心之意|飞行之翼|树袋熊)\s*$)/iu.test(line)).join('\n');
  if (['audioText', 'audioTextZh'].includes(field)) {
    next = next.replace(/^\s*\d{1,4}[.、．]\s+(?=[A-Za-z\p{Script=Han}])/u, '');
  }
  if (bankId === 'storytelling' && field === 'audioText') {
    next = next.replace(/\s*[（(]?\s*\d+\s+words?\s*[）)]?\s*$/iu, '');
  }
  if (bankId === 'opi' && ['audioText', 'audioTextZh'].includes(field)) next = simplifyPrompt(next, field.endsWith('Zh'));
  return next;
}

export function countStoryWords(text) {
  // Whitespace-delimited written words; internal apostrophes/hyphens and callsigns
  // stay one word, numeric tokens count, standalone punctuation does not.
  return text.split(/\s+/u).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
}

export function formatText(text, context) {
  const { bankId, field } = context;
  let next = withoutRedundancy(text, context)
    .replace(/[\uFEFF\u200B-\u200D\u2060]/gu, '')
    .replace(/\r\n?/gu, '\n').replace(/[\t\u00a0\u3000]/gu, ' ');
  const chinese = field.endsWith('Zh') || /\p{Script=Han}/u.test(next);
  const trimmed = next.trim();
  if (trimmed.length > 20 && !/unintelligible|无线电干扰/iu.test(trimmed)) {
    if (/^\[[^\[\]]*\]$/su.test(trimmed) || /^【[^【】]*】$/su.test(trimmed)) next = trimmed.slice(1, -1);
  }
  next = next.replace(/([!?。，；：])\1+/gu, '$1').replace(/\.{4,}/gu, '...');
  if (!chinese) {
    const punctuation = { '，': ',', '。': '.', '；': ';', '：': ':', '！': '!', '？': '?', '（': '(', '）': ')', '’': "'", '‘': "'", '“': '"', '”': '"' };
    next = next.replace(/[，。；：！？（）’‘“”]/gu, char => punctuation[char])
      .replace(/[^\S\n]+([,;:!?]|\.(?![.\d]))/gu, '$1')
      .replace(/([,;:!?])(?=[A-Za-z])/gu, '$1 ')
      .replace(/(?<=[a-z0-9])\.(?=[A-Z])/gu, '. ')
      .replace(/\b(Flight|Runway|Gate|Taxiway)(\d)/giu, '$1 $2')
      .replace(/(?<=[A-Za-z0-9])\((?=[A-Za-z]{2})/gu, ' (')
      .replace(/\)(?=[A-Za-z0-9])/gu, ') ')
      .replace(/\( +/gu, '(').replace(/ +\)/gu, ')');
  } else {
    next = next.replace(/(?<=\p{Script=Han}) +(?=\p{Script=Han})/gu, '')
      .replace(/(?<=[\p{Script=Han}”])[,;:!?]/gu, char => ({ ',': '，', ';': '；', ':': '：', '!': '！', '?': '？' })[char])
      .replace(/,(?=\p{Script=Han})/gu, '，')
      .replace(/(?<=\p{Script=Han})\.(?!\d)/gu, '。')
      .replace(/[!?](?=\s*$)/gu, char => char === '?' ? '？' : '！')
      .replace(/ +([，。；：！？、）】])/gu, '$1')
      .replace(/([，。；：！？、（【]) +/gu, '$1');
  }
  next = next.split('\n').map(line => line.trim().replace(/ {2,}/gu, ' ')).join('\n').replace(/\n{3,}/gu, '\n\n').trim();
  if (field === 'choices' || field === 'choicesZh') {
    next = next.replace(/^[A-D][.、:：]\s*/u, '').replace(/\s*\n\s*/gu, ' ');
    if (bankId === 'listening' && !/[.!?。！？…]["”')）]?$/u.test(next)) next += chinese ? '。' : '.';
  }
  if (bankId === 'storytelling' && ['audioText', 'audioTextZh', 'referenceText', 'referenceTextZh'].includes(field)) {
    next = next.replace(/\s*\n\s*/gu, chinese ? '' : ' ').replace(/\s+/gu, ' ');
    if (field.endsWith('Zh')) next = next.replace(/(?<=\p{Script=Han}) +(?=\p{Script=Han})/gu, '');
    if (field === 'audioText') next += `\n\n${countStoryWords(next)} words`;
  } else if (['audioText', 'audioTextZh'].includes(field) && bankId !== 'radiotelephony' && !/(?:^|\n)[A-Z][：:]/u.test(next)) {
    next = next.replace(/\s*\n\s*/gu, chinese ? '' : ' ');
  }
  return next;
}

// Sort whole objects. A fixed hash permutation is reproducible across machines.
// Rotate away any fixed positions: every item in a group of >1 changes position.
export function reorder(items, groupKey) {
  if (items.length < 2) return [...items];
  const id = item => typeof item === 'string' ? item : item.id;
  const hash = item => createHash('sha256').update(`20261022-format-v1:${groupKey}:${id(item)}`).digest('hex');
  const ordered = [...items].sort((a, b) => hash(a).localeCompare(hash(b)));
  const positions = new Map(items.map((item, index) => [id(item), index]));
  const fixed = ordered.flatMap((item, index) => positions.get(id(item)) === index ? [index] : []);
  if (fixed.length === 1) {
    const a = fixed[0], b = (a + 1) % ordered.length;
    [ordered[a], ordered[b]] = [ordered[b], ordered[a]];
  } else if (fixed.length > 1) {
    const values = fixed.map(index => ordered[index]);
    fixed.forEach((index, i) => { ordered[index] = values[(i + 1) % values.length]; });
  }
  return ordered;
}

export function lexicalSignature(text, context) {
  return withoutRedundancy(text, context).replace(/[\p{P}\p{Z}\p{C}\p{S}]/gu, '');
}
