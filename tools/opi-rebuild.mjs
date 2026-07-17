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

const [command] = process.argv.slice(2);
try {
  if (command === 'audit') commandAudit();
  else if (command === 'freeze') commandFreeze();
  else if (command === 'verify-baseline') commandVerifyBaseline();
  else {
    console.log('Usage: node tools/opi-rebuild.mjs audit|freeze|verify-baseline');
    if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error(`opi_rebuild_failed ${error.message}`);
  process.exitCode = 1;
}
