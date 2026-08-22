import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const topicRoot = join(root, 'content/question-banks/banks/storytelling/topics');
const bankPath = join(root, 'content/question-banks/banks/storytelling/bank.json');
const embeddedPath = join(root, 'src/features/question-bank/data/question-bank.json');
const workstreamRoot = join(root, 'docs/records/workstreams/storytelling-text-format-normalization');
const boundariesPath = join(workstreamRoot, 'approved-word-boundaries.json');
const snapshotPath = join(workstreamRoot, 'source-snapshot.json');
const reportPath = join(workstreamRoot, 'candidate-report.json');
const reportMarkdownPath = join(workstreamRoot, 'report.md');
const targetFields = ['audioText', 'audioTextZh', 'referenceText', 'consoleTabs'];

const leadingLabels = {
  'story-kongguan-044': { en: 'Passage One', zh: '短文一。' },
  'story-kongguan-045': { en: 'Passage Two', zh: '短文二。' },
  'story-kongguan-046': { en: 'Passage Three', zh: '短文三。' },
  'story-kongguan-047': { en: 'Passage Four', zh: '短文四。' },
  'story-kongguan-048': { en: 'Passage Five', zh: '短文五。' },
  'story-kongguan-049': { en: 'Passage Six', zh: '短文六。' },
  'story-kongguan-050': { en: 'Passage Seven', zh: '短文七。' },
  'story-kongguan-051': { en: 'Passage Eight', zh: '短文八。' },
  'story-kongguan-052': { en: 'Passage Nine', zh: '短文九。' },
  'story-kongguan-053': { en: 'Passage Ten', zh: '短文十。' },
  'story-kongguan-054': { en: 'Passage Eelven', zh: '短文十一。' },
  'story-kongguan-055': { en: 'Passage Twelve', zh: '短文十二。' },
};

const trailingLabels = {
  'story-koala-004': '2005', 'story-koala-010': '1986', 'story-koala-016': 'John',
  'story-koala-021': '1998', 'story-koala-025': '2001', 'story-wing-001': 'AFR123',
  'story-wing-006': '523', 'story-wing-025': '60', 'story-wing-028': '08',
  'story-wing-031': 'QFA67', 'story-wing-049': '2005', 'story-wing-055': '1986',
  'story-wing-062': 'John', 'story-wing-066': '1998', 'story-wing-070': '2001',
  'story-wing-074': '2002', 'story-wing-075': '145',
};

const reviewOnlyTokens = [
  '10l', '190O', '20O', '9o', 'ATc', 'aftmost', 'autothrust',
  'ButunfortunatelyFortunately', 'caabin', 'climbout', 'creW', 'familv', 'flapless',
  'glideslope', 'lceland', 'levelled', 'levelling', 'livina', 'marshalled',
  'misoperation', 'O3L', 'performingfligInt', 'programmes', 'readback', 'upsthe',
  'windshear', 'z03L',
];

function fail(message) { throw new Error(message); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
function hash(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
}
function stripTargetFields(value) {
  if (Array.isArray(value)) return value.map(stripTargetFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !targetFields.includes(key))
    .map(([key, child]) => [key, stripTargetFields(child)]));
}
function loadTopics() {
  return readdirSync(topicRoot).filter((name) => name.endsWith('.json')).sort()
    .map((name) => ({ name, path: join(topicRoot, name), topic: readJson(join(topicRoot, name)) }));
}
function embeddedCards(bank) {
  return bank.categories.flatMap((category) => category.topics).flatMap((topic) => topic.cards);
}
function fieldState(cards) {
  return Object.fromEntries([...cards].sort((a, b) => a.id.localeCompare(b.id)).map((card) => [card.id, {
    audioText: card.audioText,
    audioTextZh: card.audioTextZh,
    hasReferenceText: Object.hasOwn(card, 'referenceText'),
    referenceText: card.referenceText,
  }]));
}
function lexicalSignature(value) {
  return (value.match(/[\p{L}\p{N}]/gu) ?? []).join('');
}
function removeExactLeading(value, label, cardId, language) {
  if (!label) return value;
  const trimmed = value.trimStart();
  return trimmed.startsWith(label) ? trimmed.slice(label.length) : value;
}
function removeExactTrailing(value, label, cardId) {
  if (!label) return value;
  const trimmed = value.trimEnd();
  return trimmed.endsWith(label) ? trimmed.slice(0, -label.length) : value;
}
function punctuationToAscii(value) {
  return value
    .replaceAll('，', ',').replaceAll('。', '.').replaceAll('；', ';').replaceAll('：', ':')
    .replaceAll('！', '!').replaceAll('？', '?').replace(/[＂“”]/g, '"')
    .replace(/[＇‘’]/g, "'").replaceAll('（', '(').replaceAll('）', ')');
}
function applyWordBoundaries(value, replacements) {
  let output = value;
  for (const [token, replacement] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`(?<![\\p{L}\\p{N}])${token}(?![\\p{L}\\p{N}])`, 'gu'), replacement);
  }
  return output;
}
function normalizeEnglish(value, cardId, replacements) {
  const withoutLabels = removeExactTrailing(
    removeExactLeading(value, leadingLabels[cardId]?.en, cardId, 'en'),
    trailingLabels[cardId], cardId,
  );
  let text = punctuationToAscii(withoutLabels);
  text = applyWordBoundaries(text, replacements);
  text = text.replace(/[\t\r\n ]+/g, ' ').trim();
  text = text.replace(/\s+([,.;:!?])/g, '$1');
  text = text.replace(/([,;!?])(?![\s,.;:!?"')\]])(?=[\p{L}\p{N}(])/gu, '$1 ');
  text = text.replace(/:(?!\d)(?=[\p{L}\p{N}(])/gu, ': ');
  text = text.replace(/([a-z0-9)"'])\.([A-Z"])/g, '$1. $2');
  text = text.replace(/([,;:])"(?=[\p{L}\p{N}])/gu, '$1 "');
  text = text.replace(/([\p{L}\p{N}])"(?=[\p{L}\p{N}])/gu, '$1 "');
  text = text.replace(/([.!?])"(?=[\p{L}\p{N}])/gu, '$1" ');
  text = text.replace(/([a-z]s)'(?=[a-z]{2})/g, "$1' ");
  text = text.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  return text.replace(/ {2,}/g, ' ').trim();
}
function normalizeChinese(value, cardId) {
  let text = removeExactLeading(value, leadingLabels[cardId]?.zh, cardId, 'zh');
  text = text.replace(/[\t\r\n ]+/g, ' ').trim();
  const hanOrCjkPunctuation = '\\p{Script=Han}，。；：！？、“”‘’（）《》【】';
  text = text.replace(new RegExp(`(?<=[${hanOrCjkPunctuation}]) +| +(?=[${hanOrCjkPunctuation}])`, 'gu'), '');
  return text.replace(/ {2,}/g, ' ').trim();
}
function expectedCard(card, replacements) {
  const audioText = normalizeEnglish(card.audioText, card.id, replacements);
  const audioTextZh = normalizeChinese(card.audioTextZh, card.id);
  const originalEnglishWithoutLabels = removeExactTrailing(
    removeExactLeading(card.audioText, leadingLabels[card.id]?.en, card.id, 'en'),
    trailingLabels[card.id], card.id,
  );
  const originalChineseWithoutLabels = removeExactLeading(card.audioTextZh, leadingLabels[card.id]?.zh, card.id, 'zh');
  const originalEnglishSignature = lexicalSignature(originalEnglishWithoutLabels);
  const finalEnglishSignature = lexicalSignature(audioText);
  if (originalEnglishSignature !== finalEnglishSignature) {
    let index = 0;
    while (originalEnglishSignature[index] === finalEnglishSignature[index]) index += 1;
    fail(`english_lexical_change:${card.id}:${index}:${originalEnglishSignature.slice(index, index + 30)}:${finalEnglishSignature.slice(index, index + 30)}`);
  }
  const originalChineseSignature = lexicalSignature(originalChineseWithoutLabels);
  const finalChineseSignature = lexicalSignature(audioTextZh);
  if (originalChineseSignature !== finalChineseSignature) fail(`chinese_lexical_change:${card.id}`);
  return { audioText, audioTextZh };
}
function duplicateSentenceCandidates(cardId, field, text) {
  const sentences = text.split(/(?<=[.!?。！？])\s*/u).map((part) => part.trim()).filter((part) => part.length >= 25);
  const seen = new Set();
  return sentences.filter((sentence) => {
    const key = sentence.toLocaleLowerCase().replace(/[\s\p{P}]/gu, '');
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  }).map((sentence) => ({ cardId, field, sentence }));
}
function analyze() {
  const topics = loadTopics();
  const replacements = readJson(boundariesPath).replacements;
  const cards = topics.flatMap(({ topic }) => topic.cards);
  if (cards.length !== 296) fail(`unexpected_card_count:${cards.length}`);
  const expectedById = {};
  const changes = [];
  const reviewOnly = [];
  const duplicates = [];
  for (const card of cards) {
    if (expectedById[card.id]) fail(`duplicate_card_id:${card.id}`);
    if (leadingLabels[card.id]?.en && !card.audioText.trimStart().startsWith(leadingLabels[card.id].en)) fail(`approved_leading_label_missing:${card.id}:en`);
    if (leadingLabels[card.id]?.zh && !card.audioTextZh.trimStart().startsWith(leadingLabels[card.id].zh)) fail(`approved_leading_label_missing:${card.id}:zh`);
    if (trailingLabels[card.id] && !card.audioText.trimEnd().endsWith(trailingLabels[card.id])) fail(`approved_trailing_label_missing:${card.id}`);
    expectedById[card.id] = expectedCard(card, replacements);
    for (const field of ['audioText', 'audioTextZh']) {
      const after = expectedById[card.id][field];
      if (card[field] !== after) changes.push({ cardId: card.id, field, before: card[field], after });
      duplicates.push(...duplicateSentenceCandidates(card.id, field, after));
    }
    for (const token of reviewOnlyTokens) if (card.audioText.includes(token)) reviewOnly.push({ cardId: card.id, token });
  }
  return { cards, changes, duplicates, expectedById, replacements, reviewOnly, topics };
}
function createSnapshot(result) {
  const embedded = readJson(embeddedPath);
  const storytelling = embedded.find((bank) => bank.id === 'storytelling');
  if (!storytelling) fail('missing_embedded_storytelling');
  const sourceState = fieldState(result.cards);
  const embeddedState = fieldState(embeddedCards(storytelling));
  if (hash(sourceState) !== hash(embeddedState)) fail('source_embedded_target_fields_differ');
  return {
    schemaVersion: 1, createdAt: new Date().toISOString(), cardCount: result.cards.length,
    approvedBoundaryChecksum: hash(result.replacements), originalFieldsById: sourceState,
    sourceTopicNonTargetChecksums: Object.fromEntries(result.topics.map((entry) => [entry.name, hash(stripTargetFields(entry.topic))])),
    sourceBankNonStudyChecksum: hash(Object.fromEntries(Object.entries(readJson(bankPath)).filter(([key]) => key !== 'study'))),
    embeddedStoryNonTargetChecksum: hash(stripTargetFields(storytelling)),
    embeddedOtherBanksChecksum: hash(embedded.filter((bank) => bank.id !== 'storytelling')),
  };
}
function createReport(result) {
  const externalLabelChanges = [];
  for (const [cardId, labels] of Object.entries(leadingLabels)) externalLabelChanges.push({ cardId, position: 'leading', ...labels });
  for (const [cardId, en] of Object.entries(trailingLabels)) externalLabelChanges.push({ cardId, position: 'trailing', en });
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), cardCount: result.cards.length,
    summary: {
      changedCards: new Set(result.changes.map((change) => change.cardId)).size,
      changedFields: result.changes.length,
      audioTextChanges: result.changes.filter((change) => change.field === 'audioText').length,
      audioTextZhChanges: result.changes.filter((change) => change.field === 'audioTextZh').length,
      referenceTextPropertiesRemoved: result.cards.filter((card) => Object.hasOwn(card, 'referenceText')).length,
      nonEmptyReferenceTextsRemoved: result.cards.filter((card) => String(card.referenceText ?? '').trim()).length,
      approvedWordBoundaries: Object.keys(result.replacements).length,
      approvedExternalLabels: externalLabelChanges.length,
    },
    externalLabelChanges, reviewOnly: result.reviewOnly, duplicateSentenceCandidates: result.duplicates,
    changes: result.changes,
  };
}
function markdownReport(report) {
  const rows = report.externalLabelChanges.map((item) => `| ${item.cardId} | ${item.position === 'leading' ? '开头' : '结尾'} | ${item.en}${item.zh ? ` / ${item.zh}` : ''} |`).join('\n');
  const review = report.reviewOnly.length ? report.reviewOnly.map((item) => `- ${item.cardId}: \`${item.token}\``).join('\n') : '- 无';
  const duplicates = report.duplicateSentenceCandidates.length ? report.duplicateSentenceCandidates.map((item) => `- ${item.cardId} / ${item.field}: ${item.sentence}`).join('\n') : '- 未发现完全相同的内部重复句。';
  return `# 故事复诵文本格式清理报告\n\n## 结果摘要\n\n- 卡片：${report.cardCount}\n- 英文原文有格式变化：${report.summary.audioTextChanges}\n- 中文译文有格式变化：${report.summary.audioTextZhChanges}\n- 删除 referenceText 属性：${report.summary.referenceTextPropertiesRemoved}（其中非空 ${report.summary.nonEmptyReferenceTextsRemoved}）\n- 逐词确认的粘词拆分：${report.summary.approvedWordBoundaries}\n- 逐卡确认的首尾标签：${report.summary.approvedExternalLabels}\n\n## 已批准删除的首尾标签\n\n| 卡片 | 位置 | 标签 |\n| --- | --- | --- |\n${rows}\n\n## 仅报告、不改写的疑似 OCR 或既有用词\n\n${review}\n\n## 内部完全重复句候选\n\n${duplicates}\n`;
}
function expectedState(snapshot, report) {
  const expected = structuredClone(snapshot.originalFieldsById);
  for (const change of report.changes) expected[change.cardId][change.field] = change.after;
  for (const value of Object.values(expected)) {
    value.hasReferenceText = false;
    delete value.referenceText;
  }
  return expected;
}
function apply() {
  const snapshot = readJson(snapshotPath);
  const report = readJson(reportPath);
  const expected = expectedState(snapshot, report);
  const currentTopics = loadTopics();
  const currentCards = currentTopics.flatMap(({ topic }) => topic.cards);
  const currentState = fieldState(currentCards);
  const lexicalMatch = currentCards.every((card) => expected[card.id]
    && lexicalSignature(card.audioText) === lexicalSignature(expected[card.id].audioText)
    && lexicalSignature(card.audioTextZh) === lexicalSignature(expected[card.id].audioTextZh));
  if (hash(currentState) !== hash(snapshot.originalFieldsById) && hash(currentState) !== hash(expected) && !lexicalMatch) fail('source_changed_after_audit');
  for (const entry of currentTopics) {
    for (const card of entry.topic.cards) {
      card.audioText = expected[card.id].audioText;
      card.audioTextZh = expected[card.id].audioTextZh;
      delete card.referenceText;
    }
    writeJson(entry.path, entry.topic);
  }
  const bank = readJson(bankPath);
  bank.study.consoleTabs = ['mine', 'notes'];
  writeJson(bankPath, bank);
  const embedded = readJson(embeddedPath);
  const storytelling = embedded.find((item) => item.id === 'storytelling');
  if (!storytelling) fail('missing_embedded_storytelling');
  for (const card of embeddedCards(storytelling)) {
    card.audioText = expected[card.id].audioText;
    card.audioTextZh = expected[card.id].audioTextZh;
    delete card.referenceText;
  }
  storytelling.study.consoleTabs = ['mine', 'notes'];
  writeJson(embeddedPath, embedded);
}
function verify() {
  const snapshot = readJson(snapshotPath);
  const report = readJson(reportPath);
  const expected = expectedState(snapshot, report);
  const topics = loadTopics();
  const cards = topics.flatMap(({ topic }) => topic.cards);
  if (cards.length !== 296) fail(`unexpected_card_count:${cards.length}`);
  if (hash(fieldState(cards)) !== hash(expected)) fail('source_target_fields_do_not_match_report');
  for (const entry of topics) if (hash(stripTargetFields(entry.topic)) !== snapshot.sourceTopicNonTargetChecksums[entry.name]) fail(`source_non_target_changed:${entry.name}`);
  for (const card of cards) {
    for (const field of ['audioText', 'audioTextZh']) {
      const text = card[field];
      if (text !== text.trim() || /[\r\n\t]/.test(text) || / {2,}/.test(text)) fail(`invalid_whitespace:${card.id}:${field}`);
    }
    if (Object.hasOwn(card, 'referenceText')) fail(`reference_text_remains:${card.id}`);
  }
  if (cards.find((card) => card.id === 'story-wing-001')?.audioText.endsWith('AFR123')) fail('story_wing_001_trailing_AFR123');
  const bank = readJson(bankPath);
  if (JSON.stringify(bank.study.consoleTabs) !== JSON.stringify(['mine', 'notes'])) fail('source_console_tabs_invalid');
  if (hash(Object.fromEntries(Object.entries(bank).filter(([key]) => key !== 'study'))) !== snapshot.sourceBankNonStudyChecksum) fail('source_bank_non_study_changed');
  const embedded = readJson(embeddedPath);
  const storytelling = embedded.find((item) => item.id === 'storytelling');
  if (!storytelling) fail('missing_embedded_storytelling');
  if (hash(fieldState(embeddedCards(storytelling))) !== hash(expected)) fail('embedded_target_fields_invalid');
  if (hash(stripTargetFields(storytelling)) !== snapshot.embeddedStoryNonTargetChecksum) fail('embedded_story_non_target_changed');
  if (hash(embedded.filter((item) => item.id !== 'storytelling')) !== snapshot.embeddedOtherBanksChecksum) fail('embedded_other_banks_changed');
  if (JSON.stringify(storytelling.study.consoleTabs) !== JSON.stringify(['mine', 'notes'])) fail('embedded_console_tabs_invalid');
  const replacements = readJson(boundariesPath).replacements;
  for (const card of cards) {
    if (normalizeEnglish(card.audioText, card.id, replacements) !== card.audioText) fail(`not_idempotent:${card.id}:audioText`);
    if (normalizeChinese(card.audioTextZh, card.id) !== card.audioTextZh) fail(`not_idempotent:${card.id}:audioTextZh`);
  }
  console.log(JSON.stringify({ ok: true, cards: cards.length, consoleTabs: bank.study.consoleTabs, referenceTextProperties: 0, otherBanksProtected: true, idempotent: true }, null, 2));
}

function refreshReportFromSnapshot() {
  const snapshot = readJson(snapshotPath);
  const replacements = readJson(boundariesPath).replacements;
  const cards = Object.entries(snapshot.originalFieldsById).map(([id, fields]) => ({ id, ...fields }));
  const changes = [];
  const reviewOnly = [];
  const duplicates = [];
  for (const card of cards) {
    const expected = expectedCard(card, replacements);
    for (const field of ['audioText', 'audioTextZh']) {
      if (card[field] !== expected[field]) changes.push({ cardId: card.id, field, before: card[field], after: expected[field] });
      duplicates.push(...duplicateSentenceCandidates(card.id, field, expected[field]));
    }
    for (const token of reviewOnlyTokens) if (card.audioText.includes(token)) reviewOnly.push({ cardId: card.id, token });
  }
  const report = createReport({ cards, changes, replacements, reviewOnly, duplicates });
  snapshot.approvedBoundaryChecksum = hash(replacements);
  writeJson(snapshotPath, snapshot);
  writeJson(reportPath, report);
  writeFileSync(reportMarkdownPath, markdownReport(report));
  console.log(JSON.stringify(report.summary, null, 2));
}

const command = process.argv[2];
if (command === 'audit') {
  const result = analyze();
  const snapshot = createSnapshot(result);
  const report = createReport(result);
  writeJson(snapshotPath, snapshot);
  writeJson(reportPath, report);
  writeFileSync(reportMarkdownPath, markdownReport(report));
  console.log(JSON.stringify(report.summary, null, 2));
} else if (command === 'apply') {
  apply();
  verify();
} else if (command === 'refresh-report') {
  refreshReportFromSnapshot();
} else if (command === 'verify') verify();
else fail('usage: node tools/storytelling-text-format-normalization.mjs <audit|refresh-report|apply|verify>');
