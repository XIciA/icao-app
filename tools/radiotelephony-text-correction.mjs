import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const topicRoot = join(root, 'content/question-banks/banks/radiotelephony/topics');
const embeddedPath = join(root, 'src/features/question-bank/data/question-bank.json');
const workstreamRoot = join(root, 'docs/workstreams/radiotelephony-text-correction');
const snapshotPath = join(workstreamRoot, 'source-snapshot.json');
const reportPath = join(workstreamRoot, 'candidate-report.json');
const reportMarkdownPath = join(workstreamRoot, 'candidate-report.md');

const replace = (pattern, replacement) => (value) => value.replace(pattern, replacement);

const rules = [
  { id: 'SPELL-001', category: 'transcription', confidence: 'A', description: 'Correct call sigh/callsigh to call sign.', apply: replace(/\bcall\s*sigh\b|\bcallsigh\b/gi, 'call sign') },
  { id: 'SPELL-002', category: 'transcription', confidence: 'A', description: 'Correct runaway to runway in aviation contexts.', apply: replace(/\brunaway\b/gi, 'runway') },
  { id: 'SPELL-003', category: 'transcription', confidence: 'A', description: 'Correct Lima killer Oscars ASR output.', apply: replace(/\bLima\s+killer\s+Oscars?\b/gi, 'Lima Kilo Oscar') },
  { id: 'SPELL-004', category: 'transcription', confidence: 'A', description: 'Correct obvious single-word ASR spelling errors.', apply: (value) => value
    .replace(/\bdesabled\b/gi, 'disabled')
    .replace(/\bresticted\b/gi, 'restricted')
    .replace(/\bnagative\b/gi, 'negative')
    .replace(/\bmaintaine\b/gi, 'maintain')
    .replace(/\binforme\b/gi, 'inform')
    .replace(/\bineffect\b/gi, 'in effect')
    .replace(/\bintension\b/gi, 'intention')
    .replace(/\btheinstruction\b/gi, 'the instruction') },
  { id: 'SPELL-005', category: 'transcription', confidence: 'A', description: 'Correct readback only where it is used as a verb.', apply: (value) => value
    .replace(/\bReadback(?=\s+(?:the|an?|this|that|your|ATC)\b)/g, 'Read back')
    .replace(/\breadback(?=\s+(?:the|an?|this|that|your|ATC)\b)/g, 'read back') },
  { id: 'SPELL-006', category: 'transcription', confidence: 'A', description: 'Correct advice used as the verb advise while preserving sentence case.', apply: (value) => value
    .replace(/\bAdvice\b/g, 'Advise')
    .replace(/\badvice\b/g, 'advise') },
  { id: 'SPELL-007', category: 'transcription', confidence: 'A', description: 'Correct aircraft and altitude number ASR remnants.', apply: (value) => value
    .replace(/\bAirbus\s+3\s+thirty\b/gi, 'Airbus 330')
    .replace(/\b1\s+taosand\s+800\s+meters\b/gi, '1800 meters')
    .replace(/\bno\s+1\s+else\b/gi, 'no one else') },
  { id: 'SPELL-008', category: 'transcription', confidence: 'A', description: 'Correct obvious missing or substituted words in fixed aviation expressions.', apply: (value) => value
    .replace(/\bfight planned route\b/gi, 'flight planned route')
    .replace(/\bYou call sign\b/g, 'Your call sign')
    .replace(/\byou call sign\b/g, 'your call sign')
    .replace(/\bmaximum breaks\b/gi, 'maximum brakes')
    .replace(/\bparking breaks\b/gi, 'parking brakes') },
  { id: 'TERM-001', category: 'terminology', confidence: 'A', description: 'Correct work in progress phraseology.', apply: replace(/\bworking progress\b/gi, 'work in progress') },
  { id: 'TERM-002', category: 'terminology', confidence: 'A', description: 'Correct taxiing spelling in taxi contexts.', apply: replace(/\btaxing\b/gi, 'taxiing') },
  { id: 'TERM-003', category: 'terminology', confidence: 'A', description: 'Correct braking action terminology.', apply: replace(/\bbreaking action\b/gi, 'braking action') },
  { id: 'TERM-004', category: 'terminology', confidence: 'A', description: 'Correct radial inbound terminology.', apply: replace(/\bradio inbound\b/gi, 'radial inbound') },
  { id: 'TERM-005', category: 'terminology', confidence: 'A', description: 'Correct be advised phraseology.', apply: replace(/\bbe advise\b/gi, 'be advised') },
  { id: 'TERM-006', category: 'terminology', confidence: 'A', description: 'Correct foam spray term.', apply: replace(/\bfoam-spay\b/gi, 'foam spray') },
  { id: 'PHRASE-001', category: 'phraseology', confidence: 'B', description: 'Normalize ready for takeoff phrase.', apply: replace(/\bready to takeoff\b/gi, 'ready for takeoff') },
  { id: 'PHRASE-002', category: 'phraseology', confidence: 'B', description: 'Correct de-ice verb form.', apply: (value) => value
    .replace(/\bwant to de-icing\b/gi, 'want to de-ice')
    .replace(/\bneed to de-icing\b/gi, 'need to de-ice') },
  { id: 'PHRASE-003', category: 'phraseology', confidence: 'B', description: 'Correct descent word forms.', apply: (value) => value
    .replace(/\bcontinue descend and maintain\b/gi, 'continue descent to')
    .replace(/\bcontinue descend to\b/gi, 'continue descent to')
    .replace(/\bduring descending\b/gi, 'during descent')
    .replace(/\binitiated descend\b/gi, 'initiated descent') },
  { id: 'PHRASE-004', category: 'phraseology', confidence: 'B', description: 'Normalize initial climb wording in departure clearances.', apply: replace(/\binitially climb(?:\s+to)?(?=\s+\d)/gi, 'initial climb') },
  { id: 'PHRASE-005', category: 'phraseology', confidence: 'B', description: 'Normalize request wording where intent is explicit.', apply: (value) => value
    .replace(/\brequest fly lower\b/gi, 'request further descent')
    .replace(/\brequest divert to\b/gi, 'request diversion to')
    .replace(/\brequest for a higher level\b/gi, 'request a higher level') },
  { id: 'FORMAT-001', category: 'canonicalization', confidence: 'A', description: 'Normalize metres to meters.', apply: replace(/\bmetres\b/gi, 'meters') },
  { id: 'FORMAT-002', category: 'canonicalization', confidence: 'A', description: 'Normalize flight level numeric notation.', apply: replace(/\bflight\s+level\s+(\d{2,3})\b/gi, 'FL$1') },
  { id: 'FORMAT-003', category: 'canonicalization', confidence: 'A', description: 'Normalize runway side suffixes.', apply: (value) => value.replace(/\brunway(\s+in\s+use)?\s+(\d{2})\s+(left|right|center|centre)\b/gi, (_match, inUse = '', runway, side) => {
    const suffix = /^left$/i.test(side) ? 'L' : /^right$/i.test(side) ? 'R' : 'C';
    return `runway${inUse} ${runway}${suffix}`;
  }) },
  { id: 'FORMAT-004', category: 'canonicalization', confidence: 'A', description: 'Normalize operator and unit capitalization.', apply: (value) => value
    .replace(/\bAir france\b/g, 'Air France')
    .replace(/\bChina southern\b/g, 'China Southern')
    .replace(/\bWuhan control\b/g, 'Wuhan Control')
    .replace(/\bWuhan approach\b/g, 'Wuhan Approach')
    .replace(/\bBeijing control\b/g, 'Beijing Control')
    .replace(/\bZhengzhou control\b/g, 'Zhengzhou Control')
    .replace(/\bmach(?=\s+(?:point\s+)?\d)/gi, 'Mach') },
  { id: 'FORMAT-005', category: 'canonicalization', confidence: 'A', description: 'Normalize distress and aviation acronym casing.', apply: (value) => value
    .replace(/\bqnh\b/gi, 'QNH')
    .replace(/\bqfe\b/gi, 'QFE')
    .replace(/\bils\b/gi, 'ILS')
    .replace(/\bvor\b/gi, 'VOR')
    .replace(/\bndb\b/gi, 'NDB')
    .replace(/\brvr\b/gi, 'RVR')
    .replace(/\brvsm\b/gi, 'RVSM')
    .replace(/\bselcal\b/gi, 'SELCAL')
    .replace(/\bnotam\b/gi, 'NOTAM')
    .replace(/\bads[-\s]?b\b/gi, 'ADS-B')
    .replace(/\btcas\b/gi, 'TCAS')
    .replace(/\bmayday\b/gi, 'MAYDAY')
    .replace(/\bpanpan\b/gi, 'PAN PAN') },
  { id: 'TEXT-001', category: 'surface', confidence: 'A', description: 'Normalize horizontal spacing and punctuation spacing.', apply: (value) => value
    .replace(/[，]/g, ',')
    .replace(/[。]/g, '.')
    .replace(/[；]/g, ';')
    .replace(/[：]/g, ':')
    .replace(/[！]/g, '!')
    .replace(/[？]/g, '?')
    .replace(/[ \t]+([,.;?!])/g, '$1')
    .replace(/,([^\s\d])/g, ', $1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^(B|C):\s+/gm, '$1: ') },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function loadTopics() {
  return readdirSync(topicRoot).filter((name) => name.endsWith('.json')).sort().map((name) => ({ name, path: join(topicRoot, name), topic: readJson(join(topicRoot, name)) }));
}

function correctText(input) {
  let value = input;
  const transformations = [];
  for (const rule of rules) {
    const before = value;
    value = rule.apply(value);
    if (value !== before) transformations.push({
      after: value,
      before,
      category: rule.category,
      confidence: rule.confidence,
      description: rule.description,
      ruleId: rule.id,
    });
  }
  return { text: value, transformations };
}

function analyze() {
  const topics = loadTopics();
  const original = {};
  const changes = [];
  let cardCount = 0;
  for (const { name, topic } of topics) {
    for (const card of topic.cards) {
      cardCount += 1;
      if (original[card.id] !== undefined) throw new Error(`duplicate_card_id:${card.id}`);
      original[card.id] = card.audioText;
      const corrected = correctText(card.audioText);
      if (corrected.text !== card.audioText) changes.push({
        after: corrected.text,
        before: card.audioText,
        cardId: card.id,
        topicFile: name,
        transformations: corrected.transformations,
      });
    }
  }
  if (cardCount !== 1851) throw new Error(`unexpected_card_count:${cardCount}`);
  return { cardCount, changes, original, topics };
}

function summaryFor(changes) {
  const byRule = {};
  const byConfidence = {};
  const byCategory = {};
  for (const change of changes) {
    for (const transformation of change.transformations) {
      byRule[transformation.ruleId] = (byRule[transformation.ruleId] ?? 0) + 1;
      byConfidence[transformation.confidence] = (byConfidence[transformation.confidence] ?? 0) + 1;
      byCategory[transformation.category] = (byCategory[transformation.category] ?? 0) + 1;
    }
  }
  return { byCategory, byConfidence, byRule, changedCards: changes.length };
}

function writeReport(result) {
  const generatedAt = new Date().toISOString();
  const summary = summaryFor(result.changes);
  if (!existsSync(snapshotPath)) writeJson(snapshotPath, { cardCount: result.cardCount, createdAt: generatedAt, schemaVersion: 1, texts: result.original });
  writeJson(reportPath, { cardCount: result.cardCount, changes: result.changes, generatedAt, rules: rules.map(({ apply: _apply, ...rule }) => rule), schemaVersion: 1, summary });
  const ruleRows = rules.map((rule) => `| ${rule.id} | ${rule.confidence} | ${rule.category} | ${summary.byRule[rule.id] ?? 0} | ${rule.description} |`).join('\n');
  const sampleRows = result.changes.slice(0, 80).map((change) => `| ${change.cardId} | ${change.transformations.map((item) => item.ruleId).join(', ')} | ${change.before.replace(/\n/g, '<br>')} | ${change.after.replace(/\n/g, '<br>')} |`).join('\n');
  writeFileSync(reportMarkdownPath, `# 陆空通话文本规范化候选报告\n\n- 总卡片：${result.cardCount}\n- 候选修改卡片：${summary.changedCards}\n- A 级规则命中：${summary.byConfidence.A ?? 0}\n- B 级规则命中：${summary.byConfidence.B ?? 0}\n- 本流程不听音频、不调用 ASR 或外部 API。\n\n## 规则统计\n\n| 规则 | 置信度 | 类别 | 命中卡片 | 说明 |\n| --- | --- | --- | ---: | --- |\n${ruleRows}\n\n## 前 80 条候选\n\n| 卡片 | 规则 | 修改前 | 修改后 |\n| --- | --- | --- | --- |\n${sampleRows}\n`);
  return summary;
}

function syncEmbedded(correctedById) {
  const embedded = readJson(embeddedPath);
  const bank = embedded.find((item) => item.id === 'radiotelephony');
  if (!bank) throw new Error('missing_embedded_radiotelephony');
  let synced = 0;
  for (const category of bank.categories) {
    for (const topic of category.topics) {
      for (const card of topic.cards) {
        const corrected = correctedById.get(card.id);
        if (corrected === undefined) throw new Error(`missing_corrected_card:${card.id}`);
        card.audioText = corrected;
        synced += 1;
      }
    }
  }
  if (synced !== 1851) throw new Error(`embedded_sync_count:${synced}`);
  writeJson(embeddedPath, embedded);
}

function apply() {
  const result = analyze();
  const correctedById = new Map();
  for (const entry of result.topics) {
    for (const card of entry.topic.cards) {
      card.audioText = correctText(card.audioText).text;
      correctedById.set(card.id, card.audioText);
    }
    writeJson(entry.path, entry.topic);
  }
  syncEmbedded(correctedById);
  const summary = writeReport(result);
  process.stdout.write(`radiotelephony_text_applied ${JSON.stringify(summary)}\n`);
}

function verify() {
  const result = analyze();
  if (result.changes.length !== 0) throw new Error(`non_idempotent_corrections:${result.changes.length}`);

  const report = readJson(reportPath);
  const snapshot = readJson(snapshotPath);
  if (report.cardCount !== 1851 || snapshot.cardCount !== 1851) throw new Error('invalid_audit_card_count');
  const reportedById = new Map(report.changes.map((change) => [change.cardId, change]));
  if (reportedById.size !== report.changes.length) throw new Error('duplicate_report_card_id');

  for (const [cardId, currentText] of Object.entries(result.original)) {
    const reported = reportedById.get(cardId);
    const expectedText = reported?.after ?? snapshot.texts[cardId];
    if (snapshot.texts[cardId] === undefined) throw new Error(`missing_snapshot_card:${cardId}`);
    if (reported && reported.before !== snapshot.texts[cardId]) throw new Error(`report_snapshot_mismatch:${cardId}`);
    if (currentText !== expectedText) throw new Error(`source_report_mismatch:${cardId}`);
  }

  const embedded = readJson(embeddedPath);
  const bank = embedded.find((item) => item.id === 'radiotelephony');
  if (!bank) throw new Error('missing_embedded_radiotelephony');
  let embeddedCount = 0;
  for (const category of bank.categories) {
    for (const topic of category.topics) {
      for (const card of topic.cards) {
        if (result.original[card.id] === undefined) throw new Error(`embedded_extra_card:${card.id}`);
        if (card.audioText !== result.original[card.id]) throw new Error(`embedded_source_mismatch:${card.id}`);
        embeddedCount += 1;
      }
    }
  }
  if (embeddedCount !== 1851) throw new Error(`embedded_verify_count:${embeddedCount}`);
  process.stdout.write(`radiotelephony_text_verified ${JSON.stringify({ cardCount: 1851, changedCards: report.changes.length, embeddedCount, residualCorrections: 0 })}\n`);
}

const command = process.argv[2];
if (command === 'audit') {
  const result = analyze();
  process.stdout.write(`radiotelephony_text_audit ${JSON.stringify(writeReport(result))}\n`);
} else if (command === 'apply') apply();
else if (command === 'verify') verify();
else throw new Error('usage: node tools/radiotelephony-text-correction.mjs <audit|apply|verify>');
