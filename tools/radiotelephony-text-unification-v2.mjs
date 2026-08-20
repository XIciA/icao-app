import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const topicRoot = join(root, 'content/question-banks/banks/radiotelephony/topics');
const embeddedPath = join(root, 'src/features/question-bank/data/question-bank.json');
const workstreamRoot = join(root, 'docs/records/workstreams/radiotelephony-text-unification-v2');
const snapshotPath = join(workstreamRoot, 'source-snapshot.json');
const reportPath = join(workstreamRoot, 'candidate-report.json');
const reportMarkdownPath = join(workstreamRoot, 'candidate-report.md');

const targetFields = ['audioText', 'audioTextZh', 'referenceText', 'referenceTextZh'];
const airlineCodes = ['QFA', 'SIA', 'AFR', 'BAW', 'UAL', 'KLM', 'JAL', 'ACA', 'CCA', 'CSN', 'CES'];
const airlineAliases = [
  ['British Airways', 'BAW'],
  ['United Airlines', 'UAL'],
  ['Japan Airlines', 'JAL'],
  ['Singapore Airlines', 'SIA'],
  ['China Southern', 'CSN'],
  ['China Eastern', 'CES'],
  ['Air France', 'AFR'],
  ['Air Canada', 'ACA'],
  ['Air China', 'CCA'],
  ['Japan Air', 'JAL'],
  ['Qantas', 'QFA'],
  ['Singapore', 'SIA'],
  ['Speedbird', 'BAW'],
  ['United', 'UAL'],
];

const phoneticEntries = [
  ['Alpha', 'A'], ['Bravo', 'B'], ['Charlie', 'C'], ['Delta', 'D'], ['Echo', 'E'],
  ['Foxtrot', 'F'], ['Golf', 'G'], ['Hotel', 'H'], ['India', 'I'], ['Juliett?', 'J'],
  ['Kilo', 'K'], ['Lima', 'L'], ['Mike', 'M'], ['November', 'N'], ['Oscar', 'O'],
  ['Papa', 'P'], ['Quebec', 'Q'], ['Romeo', 'R'], ['Sierra', 'S'], ['Tango', 'T'],
  ['Uniform', 'U'], ['Victor', 'V'], ['Whiskey', 'W'], ['X[- ]?Ray', 'X'], ['Yankee', 'Y'], ['Zulu', 'Z'],
];
const phoneticWordPattern = `(?:${phoneticEntries.map(([pattern]) => pattern).join('|')})`;
const phoneticSequencePattern = `${phoneticWordPattern}(?:\\s+${phoneticWordPattern})*`;
const legacyPaths = [
  'tools/radiotelephony-text-correction.mjs',
  'docs/records/workstreams/radiotelephony-text-correction/source-snapshot.json',
  'docs/records/workstreams/radiotelephony-text-correction/candidate-report.json',
  'docs/records/workstreams/radiotelephony-text-correction/candidate-report.md',
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
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
}

function fileHash(path) {
  return hash(readFileSync(path));
}

function stripTargetFields(value) {
  if (Array.isArray(value)) return value.map(stripTargetFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !targetFields.includes(key))
    .map(([key, child]) => [key, stripTargetFields(child)]));
}

function loadTopics() {
  return readdirSync(topicRoot)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ name, path: join(topicRoot, name), topic: readJson(join(topicRoot, name)) }));
}

function phoneticCode(value) {
  const matches = value.match(new RegExp(phoneticWordPattern, 'gi')) ?? [];
  return matches.map((word) => {
    const normalized = word.toLowerCase().replace(/[- ]/g, '');
    if (normalized.startsWith('juliet')) return 'J';
    if (normalized === 'xray') return 'X';
    const entry = phoneticEntries.find(([pattern]) => new RegExp(`^(?:${pattern})$`, 'i').test(word));
    if (!entry) fail(`unknown_phonetic_word:${word}`);
    return entry[1];
  }).join('');
}

function collectKnownPhoneticCodes(topics) {
  const codes = new Set();
  const pattern = new RegExp(`\\b${phoneticSequencePattern}\\b`, 'gi');
  for (const { topic } of topics) {
    for (const card of topic.cards) {
      for (const field of targetFields) {
        for (const match of card[field].matchAll(pattern)) codes.add(phoneticCode(match[0]));
      }
    }
  }
  return codes;
}

function normalizeCallsigns(value, categoryId) {
  let output = value;
  for (const [alias, code] of airlineAliases) {
    output = output.replace(new RegExp(`\\b${alias.replaceAll(' ', '\\s+')}\\s*(\\d{2,4})\\b`, 'gi'), (_match, number) => `${code} ${number}`);
  }
  if (categoryId === 'atc-csn') output = output.replace(/(?<!Air |Southern |Eastern )\bChina\s*(\d{2,4})\b/gi, (_match, number) => `CSN ${number}`);
  const codePattern = airlineCodes.join('|');
  return output.replace(new RegExp(`\\b(${codePattern})\\s*(\\d{2,4})\\b`, 'gi'), (_match, code, number) => `${code.toUpperCase()} ${number}`);
}

function normalizePhonetics(value) {
  let output = value;
  output = output.replace(
    new RegExp(`\\b(${phoneticSequencePattern})\\s+(\\d+)(?:\\s+(${phoneticSequencePattern}))?\\b`, 'gi'),
    (_match, prefix, number, suffix = '') => `${phoneticCode(prefix)}${number}${suffix ? phoneticCode(suffix) : ''}`,
  );
  output = output.replace(
    new RegExp(`\\b(\\d+)\\s+(${phoneticSequencePattern})\\b`, 'gi'),
    (_match, number, suffix) => `${number}${phoneticCode(suffix)}`,
  );
  output = output.replace(
    new RegExp(`\\b(${phoneticSequencePattern})\\b`, 'gi'),
    (_match, sequence) => phoneticCode(sequence),
  );

  return output;
}

function normalizeProcedures(value) {
  let output = value;
  output = output.replace(
    /\b([A-Z]{2,8})\s*-?\s*(\d{1,2})([A-Z]?)\s*(arrival|departure)\b/gi,
    (_match, code, number, suffix, term) => `${code.toUpperCase()}-${number}${suffix.toUpperCase()} ${term.toLowerCase()}`,
  );
  output = output.replace(
    /\b([A-Z]{2,8})\s*-?\s*(\d{1,2})([A-Z]?)\s*(进场|离场)/g,
    (_match, code, number, suffix, term) => `${code}-${number}${suffix} ${term}`,
  );
  return output;
}

function normalizeRunwayCase(value) {
  return value
    .replace(/\brunway\b/gi, 'runway')
    .replace(/\brunway(?=\s+\d{1,2}(?:[LRC])?\b)/g, 'Runway');
}

function transformField(value, categoryId) {
  let text = value;
  const transformations = [];
  const apply = (ruleId, description, transform) => {
    const before = text;
    text = transform(text);
    if (text !== before) transformations.push({ ruleId, description });
  };
  apply('CALLSIGN-V2-001', 'Normalize airline callsigns to ICAO code, one space, and the original number.', (input) => normalizeCallsigns(input, categoryId));
  apply('ICAO-V2-001', 'Convert ICAO phonetic alphabet words to compact aviation letter codes.', normalizePhonetics);
  apply('PROCEDURE-V2-001', 'Normalize arrival and departure designators with a hyphen and preserved digits.', normalizeProcedures);
  apply('RUNWAY-V2-001', 'Capitalize Runway only when it directly precedes a runway designator.', normalizeRunwayCase);
  return { text, transformations };
}

function analyze() {
  const topics = loadTopics();
  const knownCodes = collectKnownPhoneticCodes(topics);
  const changes = [];
  const currentById = {};
  const expectedById = {};
  const categoryById = {};
  let cardCount = 0;
  for (const entry of topics) {
    for (const card of entry.topic.cards) {
      cardCount += 1;
      if (currentById[card.id]) fail(`duplicate_card_id:${card.id}`);
      categoryById[card.id] = entry.topic.categoryId;
      currentById[card.id] = Object.fromEntries(targetFields.map((field) => [field, card[field]]));
      expectedById[card.id] = {};
      for (const field of targetFields) {
        const transformed = transformField(card[field], entry.topic.categoryId);
        expectedById[card.id][field] = transformed.text;
        if (transformed.text !== card[field]) changes.push({
          after: transformed.text,
          before: card[field],
          cardId: card.id,
          field,
          topicFile: entry.name,
          transformations: transformed.transformations,
        });
      }
    }
  }
  if (cardCount !== 1851) fail(`unexpected_card_count:${cardCount}`);
  return { cardCount, categoryById, changes, currentById, expectedById, knownCodes: [...knownCodes].sort(), topics };
}

function createSnapshot(result) {
  const embedded = readJson(embeddedPath);
  const radiotelephony = embedded.find((bank) => bank.id === 'radiotelephony');
  if (!radiotelephony) fail('missing_embedded_radiotelephony');
  return {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    cardCount: result.cardCount,
    fields: result.currentById,
    categoryById: result.categoryById,
    sourceTopicNonTargetChecksums: Object.fromEntries(result.topics.map((entry) => [entry.name, hash(stripTargetFields(entry.topic))])),
    embeddedRadiotelephonyNonTargetChecksum: hash(stripTargetFields(radiotelephony)),
    embeddedOtherBanksChecksum: hash(embedded.filter((bank) => bank.id !== 'radiotelephony')),
    legacyArtifactChecksums: Object.fromEntries(legacyPaths.map((path) => [path, fileHash(join(root, path))])),
  };
}

function expectedFromReport(snapshot, report) {
  const expected = structuredClone(snapshot.fields);
  for (const change of report.changes) {
    if (expected[change.cardId]?.[change.field] !== change.before) fail(`report_snapshot_mismatch:${change.cardId}:${change.field}`);
    expected[change.cardId][change.field] = change.after;
  }
  return expected;
}

function summarize(changes) {
  const cards = new Set();
  const byField = {};
  const byRule = {};
  for (const change of changes) {
    cards.add(change.cardId);
    byField[change.field] = (byField[change.field] ?? 0) + 1;
    for (const transformation of change.transformations) byRule[transformation.ruleId] = (byRule[transformation.ruleId] ?? 0) + 1;
  }
  return { changedCards: cards.size, changedFields: changes.length, byField, byRule };
}

function residualsForText(text, categoryId) {
  const residuals = [];
  const phonetics = text.match(new RegExp(`\\b${phoneticWordPattern}\\b`, 'gi')) ?? [];
  if (phonetics.length) residuals.push(`phonetic:${phonetics[0]}`);
  for (const [alias] of airlineAliases) {
    const match = text.match(new RegExp(`\\b${alias.replaceAll(' ', '\\s+')}\\s*\\d{2,4}\\b`, 'i'));
    if (match) residuals.push(`airline_alias:${match[0]}`);
  }
  const bareChina = text.match(/(?<!Air |Southern |Eastern )\bChina\s*\d{2,4}\b/i);
  if (bareChina && categoryId === 'atc-csn') residuals.push(`bare_china:${bareChina[0]}`);
  const attachedCallsign = text.match(new RegExp(`\\b(?:${airlineCodes.join('|')})\\d{2,4}\\b`));
  if (attachedCallsign) residuals.push(`attached_callsign:${attachedCallsign[0]}`);
  const procedure = text.match(/\b[A-Z]{2,8}\s*-?\s*\d{1,2}[A-Z]?\s*(?:arrival|departure|进场|离场)\b/);
  if (procedure && !/^[A-Z]{2,8}-\d{1,2}[A-Z]? (?:arrival|departure|进场|离场)$/.test(procedure[0])) residuals.push(`procedure:${procedure[0]}`);
  const lowerRunway = text.match(/\brunway\s+\d{1,2}(?:[LRC])?\b/);
  if (lowerRunway) residuals.push(`lower_runway_designator:${lowerRunway[0]}`);
  const strayRunway = text.match(/\bRunway\b(?!\s+\d{1,2}(?:[LRC])?\b)/);
  if (strayRunway) residuals.push(`stray_Runway:${strayRunway[0]}`);
  return residuals;
}

function collectResiduals(expectedById, categoryById) {
  const residuals = [];
  for (const [cardId, fields] of Object.entries(expectedById)) {
    for (const field of targetFields) {
      for (const issue of residualsForText(fields[field], categoryById[cardId])) residuals.push({ cardId, field, issue });
    }
  }
  return residuals;
}

function escapeMarkdown(value) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function writeReport(result, snapshot) {
  const summary = summarize(result.changes);
  const residualsAfter = collectResiduals(result.expectedById, result.categoryById);
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    snapshotChecksum: hash(snapshot),
    cardCount: result.cardCount,
    targetFields,
    rules: [
      { id: 'CALLSIGN-V2-001', description: 'Airline callsign codes and spacing; preserve the original number.' },
      { id: 'ICAO-V2-001', description: 'ICAO phonetic alphabet words to compact aviation letter codes.' },
      { id: 'PROCEDURE-V2-001', description: 'Arrival/departure designator hyphen; preserve digit width and suffix.' },
      { id: 'RUNWAY-V2-001', description: 'Runway is capitalized only before a numeric runway designator.' },
    ],
    knownPhoneticCodes: result.knownCodes,
    summary,
    residualsAfter,
    changes: result.changes,
  };
  writeJson(reportPath, report);
  const ruleRows = report.rules.map((rule) => `| ${rule.id} | ${summary.byRule[rule.id] ?? 0} | ${rule.description} |`).join('\n');
  const fieldRows = targetFields.map((field) => `| ${field} | ${summary.byField[field] ?? 0} |`).join('\n');
  const sampleRows = result.changes.slice(0, 120).map((change) => `| ${change.cardId} | ${change.field} | ${change.transformations.map((item) => item.ruleId).join(', ')} | ${escapeMarkdown(change.before)} | ${escapeMarkdown(change.after)} |`).join('\n');
  const residualRows = residualsAfter.length ? residualsAfter.slice(0, 80).map((item) => `| ${item.cardId} | ${item.field} | ${escapeMarkdown(item.issue)} |`).join('\n') : '| - | - | 0 |';
  writeFileSync(reportMarkdownPath, `# 陆空通话文本第二轮统一候选报告\n\n- 总卡片：${result.cardCount}\n- 目标字段：${targetFields.join(', ')}\n- 候选修改卡片：${summary.changedCards}\n- 候选修改字段：${summary.changedFields}\n- 预期残留问题：${residualsAfter.length}\n- 本轮只执行新增规则；首轮工具、快照和报告由校验值保护。\n\n## 规则统计\n\n| 规则 | 修改字段 | 说明 |\n| --- | ---: | --- |\n${ruleRows}\n\n## 字段统计\n\n| 字段 | 修改数 |\n| --- | ---: |\n${fieldRows}\n\n## 预期残留\n\n| 卡片 | 字段 | 问题 |\n| --- | --- | --- |\n${residualRows}\n\n## 前 120 条候选\n\n| 卡片 | 字段 | 规则 | 修改前 | 修改后 |\n| --- | --- | --- | --- | --- |\n${sampleRows}\n`);
  return report;
}

function assertLegacyArtifacts(snapshot) {
  for (const [path, checksum] of Object.entries(snapshot.legacyArtifactChecksums)) {
    if (!existsSync(join(root, path)) || fileHash(join(root, path)) !== checksum) fail(`legacy_artifact_changed:${path}`);
  }
}

function assertNonTargetState(result, snapshot) {
  for (const entry of result.topics) {
    if (hash(stripTargetFields(entry.topic)) !== snapshot.sourceTopicNonTargetChecksums[entry.name]) fail(`source_non_target_changed:${entry.name}`);
  }
  const embedded = readJson(embeddedPath);
  const radiotelephony = embedded.find((bank) => bank.id === 'radiotelephony');
  if (!radiotelephony) fail('missing_embedded_radiotelephony');
  if (hash(stripTargetFields(radiotelephony)) !== snapshot.embeddedRadiotelephonyNonTargetChecksum) fail('embedded_radiotelephony_non_target_changed');
  if (hash(embedded.filter((bank) => bank.id !== 'radiotelephony')) !== snapshot.embeddedOtherBanksChecksum) fail('embedded_other_banks_changed');
  assertLegacyArtifacts(snapshot);
}

function fieldsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cardFieldMapsEqual(left, right) {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  if (!fieldsEqual(leftIds, rightIds)) return false;
  return leftIds.every((cardId) => targetFields.every((field) => left[cardId][field] === right[cardId][field]));
}

function syncEmbedded(expectedById) {
  const embedded = readJson(embeddedPath);
  const bank = embedded.find((item) => item.id === 'radiotelephony');
  if (!bank) fail('missing_embedded_radiotelephony');
  let count = 0;
  for (const category of bank.categories) {
    for (const topic of category.topics) {
      for (const card of topic.cards) {
        const expected = expectedById[card.id];
        if (!expected) fail(`missing_expected_embedded_card:${card.id}`);
        for (const field of targetFields) card[field] = expected[field];
        count += 1;
      }
    }
  }
  if (count !== 1851) fail(`embedded_sync_count:${count}`);
  writeJson(embeddedPath, embedded);
}

function selfTest() {
  const cases = [
    ['Qantas 432', 'atc-qfa', 'QFA 432'],
    ['Hotel Zulu 01 departure', 'atc-qfa', 'HZ-01 departure'],
    ['Zulu Foxtrot 01 Alpha arrival', 'atc-qfa', 'ZF-01A arrival'],
    ['Lima Kilo Oscar 2 Alpha arrival', 'atc-qfa', 'LKO-2A arrival'],
    ['Alpha 3, Alpha Alpha 443, 35 Lima', 'atc-qfa', 'A3, AA443, 35L'],
    ['runway in use runway 26; runway condition', 'atc-qfa', 'runway in use Runway 26; runway condition'],
  ];
  for (const [input, categoryId, expected] of cases) {
    const actual = transformField(input, categoryId).text;
    if (actual !== expected) fail(`self_test_failed:${input}:${actual}:${expected}`);
  }
}

function audit() {
  selfTest();
  const result = analyze();
  let snapshot;
  if (!existsSync(snapshotPath)) {
    snapshot = createSnapshot(result);
    writeJson(snapshotPath, snapshot);
  } else snapshot = readJson(snapshotPath);
  assertNonTargetState(result, snapshot);
  if (!fieldsEqual(result.currentById, snapshot.fields)) {
    if (!existsSync(reportPath)) fail('audit_state_drift_without_report');
    const report = readJson(reportPath);
    const expected = expectedFromReport(snapshot, report);
    if (!fieldsEqual(result.currentById, expected)) fail('audit_state_drift');
    process.stdout.write(`radiotelephony_text_v2_audit_already_applied ${JSON.stringify(report.summary)}\n`);
    return;
  }
  const report = writeReport(result, snapshot);
  process.stdout.write(`radiotelephony_text_v2_audit ${JSON.stringify({ ...report.summary, residualsAfter: report.residualsAfter.length })}\n`);
}

function apply() {
  selfTest();
  if (!existsSync(snapshotPath) || !existsSync(reportPath)) fail('run_audit_before_apply');
  const snapshot = readJson(snapshotPath);
  const report = readJson(reportPath);
  if (report.snapshotChecksum !== hash(snapshot)) fail('report_snapshot_checksum_mismatch');
  if (report.residualsAfter.length) fail(`unresolved_candidates:${report.residualsAfter.length}`);
  const result = analyze();
  assertNonTargetState(result, snapshot);
  const expected = expectedFromReport(snapshot, report);
  if (fieldsEqual(result.currentById, expected)) {
    process.stdout.write(`radiotelephony_text_v2_apply_already_done ${JSON.stringify(report.summary)}\n`);
    return;
  }
  if (!fieldsEqual(result.currentById, snapshot.fields)) fail('apply_source_drift');
  if (!fieldsEqual(result.expectedById, expected)) fail('apply_report_drift');
  for (const entry of result.topics) {
    for (const card of entry.topic.cards) for (const field of targetFields) card[field] = expected[card.id][field];
    writeJson(entry.path, entry.topic);
  }
  syncEmbedded(expected);
  process.stdout.write(`radiotelephony_text_v2_applied ${JSON.stringify(report.summary)}\n`);
}

function verify() {
  selfTest();
  if (!existsSync(snapshotPath) || !existsSync(reportPath)) fail('missing_v2_audit_artifacts');
  const snapshot = readJson(snapshotPath);
  const report = readJson(reportPath);
  if (report.snapshotChecksum !== hash(snapshot)) fail('report_snapshot_checksum_mismatch');
  const result = analyze();
  const expected = expectedFromReport(snapshot, report);
  if (!fieldsEqual(result.currentById, expected)) fail('source_expected_mismatch');
  if (result.changes.length !== 0) fail(`non_idempotent_v2_corrections:${result.changes.length}`);
  assertNonTargetState(result, snapshot);
  const residuals = collectResiduals(result.currentById, result.categoryById);
  if (residuals.length) fail(`residual_v2_issues:${JSON.stringify(residuals.slice(0, 10))}`);
  const embedded = readJson(embeddedPath).find((bank) => bank.id === 'radiotelephony');
  const embeddedFields = {};
  for (const category of embedded.categories) for (const topic of category.topics) for (const card of topic.cards) embeddedFields[card.id] = Object.fromEntries(targetFields.map((field) => [field, card[field]]));
  if (!cardFieldMapsEqual(embeddedFields, expected)) fail('embedded_expected_mismatch');
  process.stdout.write(`radiotelephony_text_v2_verified ${JSON.stringify({ cardCount: result.cardCount, embeddedCount: Object.keys(embeddedFields).length, changedCards: report.summary.changedCards, changedFields: report.summary.changedFields, residuals: 0 })}\n`);
}

const command = process.argv[2];
if (command === 'audit') audit();
else if (command === 'apply') apply();
else if (command === 'verify') verify();
else fail('usage: node tools/radiotelephony-text-unification-v2.mjs <audit|apply|verify>');
