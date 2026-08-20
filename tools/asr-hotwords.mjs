import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const questionBankRoot = join(root, 'content/question-banks');
const banksRoot = join(questionBankRoot, 'banks');
const generatedRoot = join(root, '.generated/ai-asr');
const assetRoot = join(root, 'docs/resources/ai/assets');
const hotwordPath = join(assetRoot, 'asr-hotwords.json');
const reviewPath = join(assetRoot, 'asr-hotword-candidate-review.json');
const candidatePath = join(assetRoot, 'asr-hotword-candidates.json');
const inventoryPath = join(assetRoot, 'asr-hotword-inventory.md');
const deploymentPath = join(assetRoot, 'asr-hotwords-deployment.json');
const rawCandidatePath = join(generatedRoot, 'hotword-candidate-statistics.json');

const sourceSpecs = [
  { bankId: 'sentences900', field: 'audioText', label: '900 sentences audio transcript' },
  { bankId: 'radiotelephony', field: 'referenceText', label: 'radiotelephony reference answer' },
  { bankId: 'opi', field: 'referenceText', label: 'OPI reference answer' },
  { bankId: 'storytelling', field: 'audioText', label: 'story retelling audio transcript' },
];
const allowedCategories = new Set([
  'air-traffic-control',
  'airport-operations',
  'aircraft-systems',
  'communications',
  'emergency',
  'meteorology',
  'navigation',
  'procedure',
]);
const allowedKinds = new Set(['abbreviation', 'callsign', 'proper-name', 'term', 'phrase']);
const assessmentValues = new Set(['low', 'medium', 'high']);
const stopWords = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because',
  'been', 'before', 'being', 'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'during', 'each', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'him', 'his', 'how', 'i', 'if',
  'in', 'into', 'is', 'it', 'its', 'may', 'me', 'more', 'most', 'my', 'no', 'not', 'of', 'on', 'only', 'or',
  'other', 'our', 'out', 'over', 'please', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'up', 'us',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with',
  'would', 'you', 'your',
]);

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

function normalizeText(value) {
  return value
    .normalize('NFKC')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\\/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensFor(value) {
  return normalizeText(value).match(/[A-Za-z]+(?:[-'][A-Za-z]+)*|[A-Za-z]+\d+[A-Za-z0-9-]*|\d+[A-Za-z]+[A-Za-z0-9-]*/g) ?? [];
}

function normalizedKey(value) {
  return tokensFor(value).map((token) => token.toLocaleLowerCase()).join(' ');
}

function loadSourceRecords() {
  const registry = readJson(join(questionBankRoot, 'registry.json'));
  const records = [];
  const sources = [];
  for (const spec of sourceSpecs) {
    const topicsRoot = join(banksRoot, spec.bankId, 'topics');
    let totalCards = 0;
    let missingText = 0;
    let validText = 0;
    for (const file of readdirSync(topicsRoot).filter((entry) => entry.endsWith('.json')).sort()) {
      const topic = readJson(join(topicsRoot, file));
      for (const card of topic.cards ?? []) {
        totalCards += 1;
        const raw = card[spec.field];
        const text = typeof raw === 'string' ? normalizeText(raw) : '';
        if (!text) {
          missingText += 1;
          continue;
        }
        validText += 1;
        records.push({
          bankId: spec.bankId,
          cardId: card.id,
          field: spec.field,
          text,
          tokens: tokensFor(text),
        });
      }
    }
    sources.push({ ...spec, totalCards, validText, missingText });
  }
  return { registry, records, sources };
}

function recordRaw(map, form, record) {
  const key = normalizedKey(form);
  if (!key) return;
  const current = map.get(key) ?? {
    forms: new Map(),
    cards: new Set(),
    banks: new Set(),
    occurrences: 0,
  };
  current.forms.set(form, (current.forms.get(form) ?? 0) + 1);
  current.cards.add(`${record.bankId}:${record.cardId}`);
  current.banks.add(record.bankId);
  current.occurrences += 1;
  map.set(key, current);
}

function preferredForm(forms) {
  return [...forms.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
}

function rawCandidatesFrom(map, minimumCards, maximum) {
  return [...map.values()]
    .filter((entry) => entry.cards.size >= minimumCards)
    .map((entry) => ({
      text: preferredForm(entry.forms),
      questionCount: entry.cards.size,
      totalOccurrences: entry.occurrences,
      bankCount: entry.banks.size,
      exampleCardIds: [...entry.cards].sort().slice(0, 12),
    }))
    .sort((left, right) => right.questionCount - left.questionCount
      || right.totalOccurrences - left.totalOccurrences
      || left.text.localeCompare(right.text))
    .slice(0, maximum);
}

function rawCandidateOutput() {
  const { registry, records, sources } = loadSourceRecords();
  const acronyms = new Map();
  const words = new Map();
  const phrases = new Map();
  for (const record of records) {
    const originalTokens = record.tokens;
    const lowerTokens = originalTokens.map((token) => token.toLocaleLowerCase());
    for (const token of originalTokens) {
      if (/^(?=.*[A-Z])[A-Z0-9][A-Z0-9-]{1,14}$/.test(token) && !/^\d+$/.test(token)) {
        recordRaw(acronyms, token, record);
      }
      const lower = token.toLocaleLowerCase();
      if (/^[a-z][a-z'-]{2,}$/.test(lower) && !stopWords.has(lower)) recordRaw(words, lower, record);
    }
    for (const length of [2, 3, 4]) {
      for (let index = 0; index <= lowerTokens.length - length; index += 1) {
        const slice = lowerTokens.slice(index, index + length);
        if (slice.some((token) => !/^[a-z][a-z'-]*$/.test(token))) continue;
        if (stopWords.has(slice[0]) || stopWords.has(slice.at(-1))) continue;
        if (slice.every((token) => stopWords.has(token))) continue;
        recordRaw(phrases, slice.join(' '), record);
      }
    }
  }
  return {
    schemaVersion: 1,
    source: {
      registryReleaseVersion: registry.releaseVersion,
      registryReleasedAt: registry.releasedAt,
      records: records.length,
      specs: sources,
    },
    thresholds: { acronymQuestionCount: 2, wordQuestionCount: 3, phraseQuestionCount: 3 },
    candidates: {
      acronyms: rawCandidatesFrom(acronyms, 2, 1_000),
      words: rawCandidatesFrom(words, 3, 2_000),
      phrases: rawCandidatesFrom(phrases, 3, 2_000),
    },
  };
}

function generateRawCandidates() {
  const output = rawCandidateOutput();
  writeJson(rawCandidatePath, output);
  console.log(`asr_hotword_candidate_statistics_ok records=${output.source.records} acronyms=${output.candidates.acronyms.length} words=${output.candidates.words.length} phrases=${output.candidates.phrases.length}`);
  return output;
}

function occurrencesFor(records, text) {
  const target = normalizedKey(text).split(' ').filter(Boolean);
  const sourceMap = new Map();
  const matchingQuestions = new Set();
  for (const record of records) {
    const tokens = record.tokens.map((token) => token.toLocaleLowerCase());
    let occurrences = 0;
    for (let index = 0; index <= tokens.length - target.length; index += 1) {
      if (target.every((token, offset) => tokens[index + offset] === token)) occurrences += 1;
    }
    if (!occurrences) continue;
    matchingQuestions.add(`${record.bankId}:${record.cardId}`);
    const key = `${record.bankId}:${record.field}`;
    const current = sourceMap.get(key) ?? {
      bankId: record.bankId,
      field: record.field,
      questionIds: new Set(),
      occurrences: 0,
    };
    current.questionIds.add(record.cardId);
    current.occurrences += occurrences;
    sourceMap.set(key, current);
  }
  const sources = [...sourceMap.values()]
    .map((source) => ({
      bankId: source.bankId,
      field: source.field,
      questionCount: source.questionIds.size,
      totalOccurrences: source.occurrences,
      exampleCardIds: [...source.questionIds].sort().slice(0, 12),
    }))
    .sort((left, right) => left.bankId.localeCompare(right.bankId) || left.field.localeCompare(right.field));
  return {
    questionCount: matchingQuestions.size,
    totalOccurrences: sources.reduce((total, source) => total + source.totalOccurrences, 0),
    sourceCount: sources.length,
    sources,
  };
}

function validateReviewEntry(entry, index, profiles) {
  if (!entry || typeof entry !== 'object') fail(`invalid_candidate_review_entry:${index}`);
  if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text !== entry.text.trim()) fail(`invalid_candidate_review_text:${index}`);
  if (typeof entry.profile !== 'string' || !profiles[entry.profile]) fail(`invalid_candidate_review_profile:${entry.text}`);
  const resolved = { ...profiles[entry.profile], ...entry };
  if (!allowedKinds.has(resolved.kind)) fail(`invalid_candidate_review_kind:${entry.text}`);
  if (!allowedCategories.has(resolved.category)) fail(`invalid_candidate_review_category:${entry.text}`);
  for (const field of ['domainSpecificity', 'recognitionDifficulty', 'ambiguityRisk', 'semanticImportance']) {
    if (!assessmentValues.has(resolved[field])) fail(`invalid_candidate_review_${field}:${entry.text}`);
  }
  if (typeof resolved.rationale !== 'string' || resolved.rationale.trim().length < 12) fail(`invalid_candidate_review_rationale:${entry.text}`);
  if (entry.text.split(/\s+/).length > 7 || /[^\x00-\x7F]/.test(entry.text)) fail(`invalid_candidate_review_form:${entry.text}`);
  return resolved;
}

function buildCandidateOutput() {
  if (!existsSync(reviewPath)) fail('missing_asr_hotword_candidate_review');
  const review = readJson(reviewPath);
  if (review.schemaVersion !== 1 || !/^aviation-hotword-candidate-review:v\d+$/.test(review.version)
    || !review.profiles || typeof review.profiles !== 'object' || !Array.isArray(review.entries)) {
    fail('invalid_asr_hotword_candidate_review');
  }
  const { registry, records, sources } = loadSourceRecords();
  const seen = new Set();
  const entries = review.entries.map((entry, index) => {
    const resolved = validateReviewEntry(entry, index, review.profiles);
    const key = normalizedKey(entry.text);
    if (seen.has(key)) fail(`duplicate_candidate_review_text:${entry.text}`);
    seen.add(key);
    const evidence = occurrencesFor(records, entry.text);
    if (!evidence.totalOccurrences) fail(`candidate_not_found_in_fixed_sources:${entry.text}`);
    return {
      text: entry.text,
      kind: resolved.kind,
      category: resolved.category,
      evidence,
      assessment: {
        domainSpecificity: resolved.domainSpecificity,
        recognitionDifficulty: resolved.recognitionDifficulty,
        ambiguityRisk: resolved.ambiguityRisk,
        semanticImportance: resolved.semanticImportance,
      },
      rationale: resolved.rationale,
    };
  }).sort((left, right) => left.category.localeCompare(right.category) || left.text.localeCompare(right.text));
  return {
    schemaVersion: 1,
    version: 'aviation-hotword-candidates:v1',
    source: {
      registryReleaseVersion: registry.releaseVersion,
      registryReleasedAt: registry.releasedAt,
      reviewVersion: review.version,
      recordCount: records.length,
      specs: sources,
    },
    entries,
  };
}

function validateHotwordAsset(asset) {
  if (asset.schemaVersion !== 1) fail('invalid_schema_version');
  if (!/^aviation-hotwords:v\d+$/.test(asset.version)) fail('invalid_asset_version');
  if (asset.targetModel !== 'fun-asr-2025-11-07') fail('invalid_target_model');
  if (asset.language !== 'en') fail('invalid_language');
  if (!Array.isArray(asset.entries) || asset.entries.length > 1_000) fail('invalid_entries');
  const seen = new Set();
  for (const [index, entry] of asset.entries.entries()) {
    if (!entry || typeof entry !== 'object') fail(`invalid_entry:${index}`);
    if (typeof entry.text !== 'string' || !entry.text.trim() || entry.text !== entry.text.trim()) fail(`invalid_text:${index}`);
    if (/待补充|待核实|\r|\n/.test(entry.text) || /[^\x00-\x7F]/.test(entry.text)) fail(`invalid_text:${index}`);
    if (entry.text.split(/\s+/).length > 7) fail(`too_many_words:${index}`);
    const key = normalizedKey(entry.text);
    if (seen.has(key)) fail(`duplicate_text:${entry.text}`);
    seen.add(key);
    if (!Number.isInteger(entry.weight) || entry.weight < 1 || entry.weight > 5) fail(`invalid_weight:${entry.text}`);
    if (!allowedCategories.has(entry.category)) fail(`invalid_category:${entry.text}`);
    if (typeof entry.source !== 'string' || !/^question-bank:release-\d+$/.test(entry.source)) fail(`invalid_source:${entry.text}`);
  }
}

function loadDeployment() {
  if (!existsSync(deploymentPath)) return {
    schemaVersion: 1,
    environment: 'production',
    status: 'not-recorded',
    model: null,
    hotwordsVersion: null,
    verifiedAt: null,
    entries: [],
  };
  const deployment = readJson(deploymentPath);
  if (deployment.schemaVersion !== 1 || deployment.environment !== 'production' || !Array.isArray(deployment.entries)) {
    fail('invalid_asr_hotword_deployment_record');
  }
  if (deployment.status === 'verified-none' && (deployment.mode !== 'none' || deployment.entries.length !== 0)) {
    fail('invalid_asr_hotword_verified_none_record');
  }
  const seen = new Set();
  for (const entry of deployment.entries) {
    const key = normalizedKey(entry.text ?? '');
    if (!key || seen.has(key) || !Number.isInteger(entry.weight) || entry.weight < 1 || entry.weight > 5 || entry.lang !== 'en') {
      fail('invalid_asr_hotword_deployment_entry');
    }
    seen.add(key);
  }
  const canonicalEntries = [...deployment.entries]
    .map((entry) => ({ text: String(entry.text), weight: Number(entry.weight), lang: String(entry.lang) }))
    .sort((left, right) => left.text.toLocaleLowerCase().localeCompare(right.text.toLocaleLowerCase()));
  const deploymentSha256 = createHash('sha256').update(JSON.stringify(canonicalEntries)).digest('hex');
  if (deployment.providerEntriesSha256 !== deploymentSha256) fail('asr_hotword_deployment_sha256_mismatch');
  return deployment;
}

function inventoryFor(candidates, hotwords, deployment) {
  const selected = new Map(hotwords.entries.map((entry) => [normalizedKey(entry.text), entry]));
  const deployed = new Map(deployment.entries.map((entry) => [normalizedKey(entry.text), entry]));
  const synchronized = ['verified', 'verified-none'].includes(deployment.status)
    && hotwords.version === deployment.hotwordsVersion
    && selected.size === deployed.size
    && [...selected].every(([key, entry]) => deployed.get(key)?.weight === entry.weight);
  const lines = [
    '# ASR 热词候选总览',
    '',
    '> 本文件由 `pnpm ai:asr:candidates` 确定性生成，请勿手工修改。',
    '',
    `- 候选数据库：\`${candidates.version}\``,
    `- 候选总数：${candidates.entries.length}`,
    `- 仓库正式热词：\`${hotwords.version}\`，${selected.size} 条`,
    `- 线上已验证热词：\`${deployment.hotwordsVersion ?? '未记录'}\`，${deployed.size} 条`,
    `- 仓库与线上：${synchronized ? '已同步' : '未同步'}`,
    '',
    '| 候选 | 类别 | 类型 | 题目数 | 出现数 | 状态 | 收录理由 |',
    '| --- | --- | --- | ---: | ---: | --- | --- |',
  ];
  for (const entry of candidates.entries) {
    const key = normalizedKey(entry.text);
    const states = [];
    if (selected.has(key)) states.push('仓库已选');
    if (deployed.has(key)) states.push('线上已部署');
    if (!states.length) states.push('仅候选');
    lines.push(`| ${entry.text.replace(/\|/g, '\\|')} | ${entry.category} | ${entry.kind} | ${entry.evidence.questionCount} | ${entry.evidence.totalOccurrences} | ${states.join('、')} | ${entry.rationale.replace(/\|/g, '\\|')} |`);
  }
  const legacyDeployed = [...deployed.values()].filter((entry) => !candidates.entries.some((candidate) => normalizedKey(candidate.text) === normalizedKey(entry.text)));
  if (legacyDeployed.length) {
    lines.push('', '## 线上遗留但不在新候选库', '');
    lines.push('这些词来自暂时保留的历史 v1。它们不满足“新候选库仅使用四个固定文本来源”的边界，替换 v1 时不得自动迁入新版本。', '');
    lines.push('| 线上词条 | 权重 | 状态 |', '| --- | ---: | --- |');
    for (const entry of legacyDeployed.sort((left, right) => left.text.localeCompare(right.text))) {
      lines.push(`| ${entry.text.replace(/\|/g, '\\|')} | ${entry.weight} | 线上遗留、非新候选 |`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function buildFormalAssets() {
  const candidates = buildCandidateOutput();
  const hotwords = readJson(hotwordPath);
  validateHotwordAsset(hotwords);
  const candidateKeys = new Set(candidates.entries.map((entry) => normalizedKey(entry.text)));
  for (const entry of hotwords.entries) {
    if (!candidateKeys.has(normalizedKey(entry.text))) fail(`formal_hotword_not_in_candidate_database:${entry.text}`);
  }
  const deployment = loadDeployment();
  writeJson(candidatePath, candidates);
  writeFileSync(inventoryPath, inventoryFor(candidates, hotwords, deployment));
  console.log(`asr_hotword_candidate_database_ok version=${candidates.version} candidates=${candidates.entries.length} selected=${hotwords.entries.length} deployed=${deployment.entries.length}`);
}

function validateAssets() {
  if (!existsSync(hotwordPath)) fail('missing_asr_hotword_asset');
  if (!existsSync(candidatePath)) fail('missing_asr_hotword_candidate_database');
  if (!existsSync(inventoryPath)) fail('missing_asr_hotword_inventory');
  const hotwords = readJson(hotwordPath);
  validateHotwordAsset(hotwords);
  const candidates = readJson(candidatePath);
  const expectedCandidates = buildCandidateOutput();
  if (JSON.stringify(candidates) !== JSON.stringify(expectedCandidates)) fail('stale_asr_hotword_candidate_database');
  const candidateKeys = new Set(candidates.entries.map((entry) => normalizedKey(entry.text)));
  for (const entry of hotwords.entries) {
    if (!candidateKeys.has(normalizedKey(entry.text))) fail(`formal_hotword_not_in_candidate_database:${entry.text}`);
  }
  const deployment = loadDeployment();
  if (readFileSync(inventoryPath, 'utf8') !== inventoryFor(candidates, hotwords, deployment)) fail('stale_asr_hotword_inventory');
  const digest = createHash('sha256').update(`${JSON.stringify(hotwords)}\n`).digest('hex');
  console.log(`asr_hotword_assets_ok version=${hotwords.version} entries=${hotwords.entries.length} candidates=${candidates.entries.length} sha256=${digest}`);
}

const command = process.argv[2] ?? 'check';
if (command === 'candidates') {
  generateRawCandidates();
  if (existsSync(reviewPath)) buildFormalAssets();
} else if (command === 'build') {
  buildFormalAssets();
} else if (command === 'check') {
  validateAssets();
} else {
  fail(`unsupported_command:${command}`);
}
