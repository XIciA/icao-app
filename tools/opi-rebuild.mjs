import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opiRoot = join(projectRoot, 'content/question-banks/banks/opi');
const generatedRoot = join(projectRoot, '.generated/opi-rebuild');
const snapshotRoot = join(generatedRoot, 'snapshot');
const manifestPath = join(generatedRoot, 'baseline-manifest.json');
const auditPath = join(generatedRoot, 'baseline-audit.json');
const workItemsPath = join(generatedRoot, 'work-items.json');
const HAN = /[\u3400-\u9fff]/u;
const QUESTION_OVERRIDES = {
  'opi-image-006-q01': 'What pre-takeoff preparations should you make in this situation?',
  'opi-image-007-q01': 'What is a high-elevation airport?',
  'opi-image-010-q01': 'What happened to this aircraft?',
  'opi-image-014-q01': 'What are the main advantages of these cockpits compared with traditional instrument cockpits?',
  'opi-core-035': 'What is wind shear?',
  'opi-core-114': 'What is a cockpit voice recorder (CVR)?',
  'opi-core-232': 'What does SOP stand for?',
  'opi-core-310': 'What is a quick access recorder (QAR)?',
  'opi-core-313': 'What is runway visual range (RVR)?',
  'opi-core-318': 'What are the functions of engine oil?',
  'opi-core-229-part-2': 'Do you feel prepared to handle a bird strike?',
  'opi-core-236-part-2': 'What training does your company provide to improve compliance with SOPs?',
  'opi-core-267-part-2': 'What fuel requirements apply to your aircraft?',
  'opi-core-276-part-2': 'What is your company’s fuel policy?',
  'opi-core-289-part-2': 'Could you describe your aircraft’s fuel-dumping procedure?',
  'opi-core-337-part-2': 'Have you heard of any mid-air collision accidents?',
  'opi-core-372-part-2': 'How can pilots improve communication with ATC?',
  'opi-core-378-part-2': 'How can pilots avoid misunderstandings when communicating with ATC?',
  'opi-core-438-part-2': 'How can pilots avoid turbulence, clear-air turbulence, and other hazardous weather?',
  'opi-core-568-part-2': 'How can airport security screening be improved?',
  'opi-core-730-part-2': 'Did you receive training on handling a bomb threat on board?',
  'opi-core-732-part-2': 'Did you receive training on handling suspicious items?',
  'opi-extra-015-part-2': 'What can cause a diversion?',
  'opi-extra-096-part-2': 'Did you receive training on handling a hijacking?',
  'opi-extra-118-part-2': 'What is the stall-recovery procedure?',
  'opi-extra-275-part-2': 'What situations can cause structural damage?',
  'opi-core-052': 'If low-level wind shear is expected during takeoff, what would you do?',
  'opi-core-128': 'Why is the CVR an important part of an aircraft’s flight-recorder system?',
  'opi-core-460': 'What does RVSM stand for, and what is its purpose?',
  'opi-core-741': 'What is your opinion of red-eye flights?',
  'opi-extra-123': 'What was the most memorable part of your first solo flight?',
  'opi-extra-156': 'Could you introduce your hometown?',
  'opi-extra-185': 'What is your favorite book, and why do you like it?',
  'opi-extra-186': 'What is your favorite sport, and how often do you do it?',
  'opi-extra-188': 'What type of music do you like best?',
  'opi-core-136': 'How should pilots communicate effectively with ATC?',
  'opi-core-137': 'How should a captain communicate effectively with the first officer?',
  'opi-core-138': 'How should pilots communicate effectively with the cabin crew?',
  'opi-core-139': 'How should pilots cooperate effectively with ATC?',
  'opi-core-142': 'What can pilots do to improve radiotelephony communication?',
  'opi-core-144': 'How should pilots cooperate effectively in the cockpit?',
  'opi-core-145': 'How should pilots cooperate effectively with the cabin crew?',
  'opi-core-261': 'Does your airline operate at any complex airports?',
  'opi-core-520': 'What is an enhanced ground proximity warning system (EGPWS)?',
  'opi-core-555': 'What are the possible causes of flight delays?',
  'opi-core-774': 'What can cause a crew member to become incapacitated?',
  'opi-extra-003': 'How would you help passengers who become anxious during a long delay?',
  'opi-extra-004': 'How would you handle a passenger complaint about a diversion?',
  'opi-extra-005': 'How would you respond if a passenger became ill, suffered a heart attack, or was injured by turbulence?',
  'opi-extra-006': 'How would you handle a drunk or unruly passenger during flight?',
  'opi-extra-007': 'How would you respond to a fight between passengers?',
  'opi-extra-008': 'How would you handle a passenger who refused to check oversized baggage or turn off a mobile phone?',
  'opi-extra-074-part-2': 'Have you received any training in English?',
  'opi-extra-107-part-2': 'What is the standard procedure for an emergency evacuation on the runway?',
  'opi-core-629': 'What does FCTM stand for?',
  'opi-extra-083': 'When may authorized personnel enter the cockpit?',
};
const NO_SPLIT_QUESTION_IDS = new Set(['opi-core-855', 'opi-extra-325']);
const FORCE_SPLIT_QUESTIONS = {
  'opi-core-454': [
    'What procedures should pilots follow for a rejected takeoff?',
    'What should pilots do if a serious problem occurs after V1?',
  ],
  'opi-core-628': ['What can cause CFIT?', 'How can pilots prevent CFIT?'],
  'opi-core-751': [
    'What is your opinion of flight discipline?',
    'How can pilots develop good flight discipline?',
  ],
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

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function valueHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalize(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function sentenceCase(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function normalizeQuestionKey(value) {
  return normalize(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function cleanQuestionEn(value, cardId) {
  if (QUESTION_OVERRIDES[cardId]) return QUESTION_OVERRIDES[cardId];
  let question = normalize(value)
    .replace(/\n+/gu, ' ')
    .replace(/^\s*\d+[.)、]\s*/u, '')
    .replace(/[？]/gu, '?')
    .replace(/[！]/gu, '!')
    .replace(/[。]/gu, '.')
    .replace(/[“”"']/gu, '')
    .replace(/\bA\/C\b/giu, 'aircraft')
    .replace(/\bAC\b/gu, 'aircraft')
    .replace(/\babout\s*\/\s*concerning\s*\/\s*regarding\b/giu, 'about')
    .replace(/\breceive\s*\/\s*get\s*\/\s*have\b/giu, 'receive')
    .replace(/\bdeal with\s*\/\s*handling\b/giu, 'handle')
    .replace(/\bC172\s*\/\s*CJ-?1\s*\/\s*A320\s*\/\s*B73\b/giu, 'your aircraft type')
    .replace(/\s*\/\s*/gu, ' or ')
    .replace(/\bpre\s*-\s*takeoff\b/giu, 'pre-takeoff')
    .replace(/\bhigh\s*-\s*elevation\b/giu, 'high-elevation')
    .replace(/\bmid\s*-\s*air\b/giu, 'mid-air')
    .replace(/\bwind\s*shear\b/giu, 'wind shear')
    .replace(/\bicing condition\b/giu, 'icing conditions')
    .replace(/\bWhat happen of (?:that|this) aircraft\b/giu, 'What happened to this aircraft')
    .replace(/\bWhat the function of\b/giu, 'What are the functions of')
    .replace(/\bWhat are the function of\b/giu, 'What are the functions of')
    .replace(/\bWhat is the high-elevation airport\b/giu, 'What is a high-elevation airport')
    .replace(/\bthat cockpits\b/giu, 'those cockpits')
    .replace(/\bcompanys\b/giu, 'company’s')
    .replace(/\bWhats\b/giu, 'What is')
    .replace(/^How to\b/iu, 'How can pilots')
    .replace(/\bban smoke policy\b/giu, 'no-smoking policy')
    .replace(/\bcrews incapacity\b/giu, 'crew incapacitation')
    .replace(/\bhazards attitudes\b/giu, 'hazardous attitudes')
    .replace(/\bprevent hijack\b/giu, 'prevent hijacking')
    .replace(/\baircrafts\b/giu, 'aircraft’s')
    .replace(/\btake\s*-\s*off\b/giu, 'takeoff')
    .replace(/\bpre\s*-\s*flight\b/giu, 'preflight')
    .replace(/\bred\s*-\s*eye\b/giu, 'red-eye')
    .replace(/\bdecision\s*-\s*making\b/giu, 'decision-making')
    .replace(/\bWhat type of aircraft are you flying now\b/giu, 'What type of aircraft do you fly')
    .replace(/\bWhat damages may\b/giu, 'What damage may')
    .replace(/\bditch on the sea\b/giu, 'ditch at sea')
    .replace(/\bnight landing on such terrain airports\b/giu, 'a night landing at this type of terrain-critical airport')
    .replace(/\s+([?!.])/gu, '$1')
    .replace(/([?!.])(?=[A-Za-z])/gu, '$1 ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
  const firstHan = question.search(HAN);
  if (firstHan >= 0) question = question.slice(0, firstHan).trim();
  question = sentenceCase(question);
  if (!/[?!.]$/u.test(question)) question += '?';
  return question;
}

function splitQuestionEn(value, cardId) {
  if (FORCE_SPLIT_QUESTIONS[cardId]) return FORCE_SPLIT_QUESTIONS[cardId];
  const cleaned = cleanQuestionEn(value, cardId);
  if (NO_SPLIT_QUESTION_IDS.has(cardId)) return [cleaned];
  const parts = cleaned
    .split(/(?<=[?])\s+|\n+/gu)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return [cleaned];
  const first = parts[0];
  const second = parts[1];
  const standalone = (part) => {
    const words = part.match(/[A-Za-z]+(?:-[A-Za-z]+)?/gu) ?? [];
    if (words.length < 6) return false;
    if (!/^(?:what|which|who|when|where|how|why|do|does|did|have|has|had|is|are|was|were|can|could|would|will|should|tell me|describe)\b/iu.test(part))
      return false;
    if (/^(?:why\??|why not\??|if\b|how do (?:they|you)\b|where are they\b|can you (?:name|give)\b|what (?:could|might) be (?:the )?(?:possible )?(?:reasons|causes|consequences)\b)/iu.test(part))
      return false;
    if (/\b(?:this|that|these|those|they|them|it|such)\b/iu.test(part)) return false;
    return true;
  };
  if (!standalone(first) || !standalone(second)) return [cleaned];
  return [first, second].map((part, index) =>
    cleanQuestionEn(part, index === 0 ? cardId : `${cardId}-part-${index + 1}`),
  );
}

function sourceFiles() {
  return [
    join(opiRoot, 'bank.json'),
    ...readdirSync(join(opiRoot, 'categories'))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(opiRoot, 'categories', name)),
    ...readdirSync(join(opiRoot, 'topics'))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(opiRoot, 'topics', name)),
  ];
}

function loadSource(root = opiRoot) {
  const bank = readJson(join(root, 'bank.json'));
  const categories = readdirSync(join(root, 'categories'))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson(join(root, 'categories', name)));
  const topics = readdirSync(join(root, 'topics'))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson(join(root, 'topics', name)));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const rows = topics.flatMap((topic, topicIndex) =>
    topic.cards.map((card, cardIndex) => ({
      category: categoriesById.get(topic.categoryId),
      topic,
      topicIndex,
      card,
      cardIndex,
    })),
  );
  return { bank, categories, topics, rows };
}

function sourceDigest(files = sourceFiles()) {
  return valueHash(
    files.map((path) => ({
      path: relative(opiRoot, path),
      hash: fileHash(path),
    })),
  );
}

function auditSource() {
  const source = loadSource();
  const textRows = source.rows.filter(({ card }) => card.kind !== 'image');
  const imageRows = source.rows.filter(({ card }) => card.kind === 'image');
  const ids = new Set();
  const duplicateIds = [];
  for (const { card } of source.rows) {
    if (ids.has(card.id)) duplicateIds.push(card.id);
    ids.add(card.id);
  }
  const topicDeclarationErrors = source.topics
    .filter((topic) => topic.declaredCardCount !== topic.cards.length)
    .map((topic) => topic.id);
  const categoryDeclarationErrors = source.categories
    .filter((category) => {
      const topics = source.topics.filter((topic) => topic.categoryId === category.id);
      return (
        category.declaredTopicCount !== topics.length ||
        category.declaredCardCount !== topics.reduce((sum, topic) => sum + topic.cards.length, 0)
      );
    })
    .map((category) => category.id);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceDigest: sourceDigest(),
    counts: {
      categories: source.categories.length,
      topics: source.topics.length,
      cards: source.rows.length,
      textCards: textRows.length,
      imageCards: imageRows.length,
      imageTopicTextCards: textRows.filter(({ topic }) =>
        topic.id.startsWith('opi-image-topic-'),
      ).length,
    },
    declarations: {
      bankTopicCount: source.bank.declaredTopicCount,
      bankCardCount: source.bank.declaredCardCount,
      categoryErrors: categoryDeclarationErrors,
      topicErrors: topicDeclarationErrors,
    },
    identity: { uniqueCardIds: ids.size, duplicateCardIds: duplicateIds },
    quality: {
      missingQuestionEn: textRows.filter(({ card }) => !normalize(card.audioText)).map(({ card }) => card.id),
      missingQuestionZh: textRows.filter(({ card }) => !normalize(card.audioTextZh)).map(({ card }) => card.id),
      missingAnswerEn: textRows.filter(({ card }) => !normalize(card.referenceText)).map(({ card }) => card.id),
      missingAnswerZh: textRows.filter(({ card }) => !normalize(card.referenceTextZh)).map(({ card }) => card.id),
      questionEnHasHan: textRows.filter(({ card }) => HAN.test(card.audioText ?? '')).map(({ card }) => card.id),
      answerEnHasHan: textRows.filter(({ card }) => HAN.test(card.referenceText ?? '')).map(({ card }) => card.id),
      multipleQuestionMarks: textRows
        .filter(({ card }) => (String(card.audioText ?? '').match(/\?/gu) ?? []).length > 1)
        .map(({ card }) => card.id),
    },
  };
}

function assertBaseline(audit) {
  const expected = { categories: 8, topics: 144, cards: 1356, textCards: 1333, imageCards: 23 };
  for (const [field, value] of Object.entries(expected)) {
    if (audit.counts[field] !== value)
      fail(`baseline_count:${field}:${audit.counts[field]}/${value}`);
  }
  if (audit.declarations.bankTopicCount !== audit.counts.topics) fail('bank_topic_count');
  if (audit.declarations.bankCardCount !== audit.counts.cards) fail('bank_card_count');
  if (audit.declarations.categoryErrors.length) fail('category_declarations');
  if (audit.declarations.topicErrors.length) fail('topic_declarations');
  if (audit.identity.duplicateCardIds.length) fail('duplicate_card_ids');
}

function commandAudit() {
  const audit = auditSource();
  assertBaseline(audit);
  writeJson(auditPath, audit);
  console.log(
    `opi_rebuild_audit_ok categories=${audit.counts.categories} topics=${audit.counts.topics} cards=${audit.counts.cards} text=${audit.counts.textCards} images=${audit.counts.imageCards}`,
  );
}

function commandFreeze() {
  const audit = auditSource();
  assertBaseline(audit);
  rmSync(snapshotRoot, { recursive: true, force: true });
  const files = sourceFiles().map((path) => {
    const relativePath = relative(opiRoot, path);
    const target = join(snapshotRoot, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(path, target);
    return { path: relativePath, hash: fileHash(path), bytes: readFileSync(path).length };
  });
  const source = loadSource();
  const items = source.rows
    .filter(({ card }) => card.kind !== 'image')
    .map(({ category, topic, topicIndex, card, cardIndex }) => ({
      source: {
        categoryId: category.id,
        topicId: topic.id,
        topicName: topic.name,
        topicIndex,
        cardId: card.id,
        cardIndex,
        contentHash: valueHash(card),
        card,
      },
      decision: {
        action: null,
        targetCategoryId: category.id,
        targetTopicId: topic.id,
        canonicalCardId: card.id,
        reason: '',
        answerDisposition: 'complete',
      },
      content: { questionEn: '', questionZh: '', answerEn: null, answerZh: null },
      review: {
        questionEn: 'pending',
        questionZh: 'blocked',
        answerEn: 'blocked',
        answerZh: 'blocked',
        factSources: [],
        factUncertainty: '',
        imageDependencyReason: '',
      },
    }));
  const manifest = {
    schemaVersion: 1,
    frozenAt: new Date().toISOString(),
    sourceDigest: audit.sourceDigest,
    counts: audit.counts,
    files,
  };
  writeJson(auditPath, audit);
  writeJson(manifestPath, manifest);
  writeJson(workItemsPath, {
    schemaVersion: 1,
    baselineDigest: manifest.sourceDigest,
    sourceCounts: manifest.counts,
    checkpoints: [40, 250, 500, 750, 1000, 1250, 1333],
    items,
  });
  console.log(`opi_rebuild_freeze_ok files=${files.length} items=${items.length} digest=${manifest.sourceDigest}`);
}

function commandVerifyBaseline() {
  if (!existsSync(manifestPath) || !existsSync(workItemsPath)) fail('baseline_not_frozen');
  const manifest = readJson(manifestPath);
  const work = readJson(workItemsPath);
  if (manifest.sourceDigest !== sourceDigest()) fail('source_changed_after_freeze');
  if (work.baselineDigest !== manifest.sourceDigest) fail('work_baseline_digest');
  if (work.items.length !== manifest.counts.textCards) fail('work_item_count');
  const ids = new Set(work.items.map((item) => item.source.cardId));
  if (ids.size !== work.items.length) fail('work_item_ids');
  for (const file of manifest.files) {
    const snapshot = join(snapshotRoot, file.path);
    if (!existsSync(snapshot) || fileHash(snapshot) !== file.hash)
      fail(`snapshot_file:${file.path}`);
  }
  console.log(`opi_rebuild_verify_baseline_ok items=${work.items.length} digest=${manifest.sourceDigest}`);
}

function commandDraftQuestionEn() {
  commandVerifyBaseline();
  const work = readJson(workItemsPath);
  const rebuilt = [];
  for (const item of work.items.filter((entry) => !entry.source.isDerived)) {
    const questions = splitQuestionEn(item.source.card.audioText, item.source.cardId);
    for (const [index, question] of questions.entries()) {
      const next = JSON.parse(JSON.stringify(item));
      if (index > 0) {
        next.source.originalCardId = item.source.cardId;
        next.source.isDerived = true;
        next.source.derivationIndex = index + 1;
        next.source.cardId = `${item.source.cardId}-part-${index + 1}`;
        next.decision.canonicalCardId = next.source.cardId;
      }
      next.decision.action = questions.length > 1 ? 'split' : 'rewrite';
      next.decision.reason =
        questions.length > 1
          ? 'The source contained independently answerable questions; each final card contains one question.'
          : 'English question rebuilt for grammar, punctuation, wording, and one-question scope.';
      next.content.questionEn = question;
      next.review.questionEn = 'locked';
      next.locks = { questionEn: valueHash(question) };
      rebuilt.push(next);
    }
  }
  const byTopicAndQuestion = new Map();
  for (const item of rebuilt) {
    const key = `${item.decision.targetTopicId}::${normalizeQuestionKey(item.content.questionEn)}`;
    const canonical = byTopicAndQuestion.get(key);
    if (!canonical) {
      byTopicAndQuestion.set(key, item);
      continue;
    }
    item.decision.action = 'merge';
    item.decision.canonicalCardId = canonical.decision.canonicalCardId;
    item.decision.reason = `Exact same-topic question merged into ${canonical.decision.canonicalCardId}.`;
  }
  work.items = rebuilt;
  work.stageProgress = {
    ...(work.stageProgress ?? {}),
    questionEn: {
      status: 'locked',
      originalItems: 1333,
      finalWorkItems: rebuilt.length,
      splitDerivedItems: rebuilt.filter((item) => item.source.isDerived).length,
      mergedItems: rebuilt.filter((item) => item.decision.action === 'merge').length,
    },
  };
  writeJson(workItemsPath, work);
  commandVerifyQuestionEn();
  console.log(
    `opi_rebuild_question_en_ok items=${rebuilt.length} derived=${work.stageProgress.questionEn.splitDerivedItems} merged=${work.stageProgress.questionEn.mergedItems}`,
  );
}

function commandVerifyQuestionEn() {
  const work = readJson(workItemsPath);
  const errors = [];
  const activeIds = new Set();
  const activeQuestions = new Set();
  for (const item of work.items) {
    const question = normalize(item.content.questionEn);
    if (!question) errors.push(`${item.source.cardId}:empty`);
    if (HAN.test(question)) errors.push(`${item.source.cardId}:han`);
    if (!/[?!.]$/u.test(question)) errors.push(`${item.source.cardId}:terminal`);
    if (item.review.questionEn !== 'locked') errors.push(`${item.source.cardId}:status`);
    if (item.locks?.questionEn !== valueHash(question)) errors.push(`${item.source.cardId}:lock`);
    if (item.decision.action !== 'merge') {
      if (activeIds.has(item.decision.canonicalCardId))
        errors.push(`${item.source.cardId}:duplicate_target_id`);
      activeIds.add(item.decision.canonicalCardId);
      const key = `${item.decision.targetTopicId}::${normalizeQuestionKey(question)}`;
      if (activeQuestions.has(key)) errors.push(`${item.source.cardId}:duplicate_question`);
      activeQuestions.add(key);
    }
  }
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(error);
    fail(`question_en_errors:${errors.length}`);
  }
  console.log(`opi_rebuild_verify_question_en_ok active=${activeIds.size} total=${work.items.length}`);
}

const [command] = process.argv.slice(2);
try {
  if (command === 'audit') commandAudit();
  else if (command === 'freeze') commandFreeze();
  else if (command === 'verify-baseline') commandVerifyBaseline();
  else if (command === 'draft-question-en') commandDraftQuestionEn();
  else if (command === 'verify-question-en') commandVerifyQuestionEn();
  else {
    console.log('Usage: node tools/opi-rebuild.mjs audit|freeze|verify-baseline|draft-question-en|verify-question-en');
    if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error(`opi_rebuild_failed ${error.message}`);
  process.exitCode = 1;
}
