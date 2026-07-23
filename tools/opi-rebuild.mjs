import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const opiRoot = join(projectRoot, 'content/question-banks/banks/opi');
const registryPath = join(projectRoot, 'content/question-banks/registry.json');
const generatedRoot = join(projectRoot, '.generated/opi-rebuild');
const snapshotRoot = join(generatedRoot, 'snapshot');
const snapshotSourceRoot = join(snapshotRoot, 'source');
const snapshotRegistryPath = join(snapshotRoot, 'registry.json');
const manifestPath = join(generatedRoot, 'baseline-manifest.json');
const auditPath = join(generatedRoot, 'baseline-audit.json');
const workItemsPath = join(generatedRoot, 'work-items.json');
const candidateIndexPath = join(generatedRoot, 'candidate-index.json');
const candidateRoot = join(generatedRoot, 'formal-candidate');
const candidateSourceRoot = join(candidateRoot, 'source');
const candidateRegistryPath = join(candidateRoot, 'registry.json');
const candidateArtifactRoot = join(candidateRoot, 'artifacts');
const questionEnPreviewReleaseRoot = join(generatedRoot, 'question-en-preview-release');
const reviewRoot = join(generatedRoot, 'reviews');
const batchManifestRoot = join(generatedRoot, 'batch-manifests');
const invalidatedBatchManifestRoot = join(generatedRoot, 'invalidated-batch-manifests');
const batchRoot = join(generatedRoot, 'batches');
const batchInputManifestRoot = join(generatedRoot, 'batch-input-manifests');
const artifactRoot = join(
  projectRoot,
  'docs/workstreams/opi-question-bank-text-reconstruction/artifacts',
);
const groundedWorkstreamRoot = join(
  projectRoot,
  'docs/workstreams/opi-english-answer-v1-grounded-reconstruction',
);
const groundedArtifactRoot = join(groundedWorkstreamRoot, 'artifacts');
const groundedGeneratedRoot = join(projectRoot, '.generated/opi-answer-v1-grounded');
const groundedCorpusPath = join(groundedGeneratedRoot, 'legacy-corpus.json');
const groundedWorkItemsPath = join(groundedGeneratedRoot, 'work-items.json');
const groundedCalibrationInputPath = join(groundedGeneratedRoot, 'calibration-input.json');
const groundedAnswerBatchInputRoot = join(groundedGeneratedRoot, 'answer-batch-inputs');
const groundedAnswerBatchRoot = join(groundedGeneratedRoot, 'answer-batches');
const groundedAnswerReviewRoot = join(groundedGeneratedRoot, 'answer-reviews');
const groundedAnswerPreviewReleaseRoot = join(
  groundedGeneratedRoot,
  'answer-en-preview-release',
);
const groundedBaselineArtifactPath = join(groundedArtifactRoot, 'baseline-manifest.json');
const groundedSourceMapArtifactPath = join(groundedArtifactRoot, 'source-map.json');
const groundedCalibrationArtifactPath = join(groundedArtifactRoot, 'calibration-batch.json');
const groundedCalibrationMachineReportPath = join(
  groundedArtifactRoot,
  'calibration-machine-report.json',
);
const groundedCalibrationReviewerReportPath = join(
  groundedArtifactRoot,
  'calibration-independent-review.json',
);
const groundedCalibrationAdjudicationPath = join(
  groundedArtifactRoot,
  'calibration-adjudication.json',
);
const groundedCalibrationComparisonPath = join(
  groundedArtifactRoot,
  'calibration-comparison.md',
);
const groundedBatchPlanArtifactPath = join(groundedArtifactRoot, 'answer-batch-plan.json');
const groundedAnswerPreviewArtifactPath = join(
  groundedArtifactRoot,
  'answer-en-preview-release.json',
);
const groundedAnswerFinalPreviewArtifactPath = join(
  groundedArtifactRoot,
  'answer-en-final-preview-release.json',
);
const groundedFinalAnswerAuditPath = join(groundedArtifactRoot, 'final-answer-audit.json');
const groundedFinalQualityReportPath = join(groundedArtifactRoot, 'final-quality-report.md');
const groundedCrossBatchAuditPath = join(
  groundedArtifactRoot,
  'cross-batch-consistency-audit.json',
);
const groundedMappingArtifactPath = join(
  projectRoot,
  'docs/workstreams/opi-question-bank-text-reconstruction/artifacts/card-target-mapping.json',
);
const groundedDeferredArtifactPath = join(
  projectRoot,
  'docs/workstreams/opi-question-bank-text-reconstruction/artifacts/deferred-image-answers.json',
);
const groundedProductionV8ArtifactPath = join(
  projectRoot,
  'docs/workstreams/opi-question-bank-text-reconstruction/artifacts/production-release-v8.json',
);

const GROUNDED_SCHEMA_VERSION = 1;
const GROUNDED_RULE_VERSION = 'opi-answer-v1-grounded-2026-07-23';
const GROUNDED_SOURCES = [
  {
    key: 'v1-categories-01-07',
    commit: 'd32f10f',
    releaseVersion: 1,
    categoryIds: [
      'opi-category-01',
      'opi-category-02',
      'opi-category-03',
      'opi-category-04',
      'opi-category-05',
      'opi-category-06',
      'opi-category-07',
    ],
  },
  {
    key: 'v2-category-08-images',
    commit: 'b95d541',
    releaseVersion: 2,
    categoryIds: ['opi-category-08'],
  },
];

const WORK_SCHEMA_VERSION = 2;
const MANIFEST_SCHEMA_VERSION = 2;
const RULE_VERSION = 'opi-text-reconstruction-2026-07-18';
const BATCH_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const HAN = /[\u3400-\u9fff]/u;
const ENGLISH_SENTENCE = /(?:\b[A-Za-z][A-Za-z'-]*\s+){5,}[A-Za-z][A-Za-z'-]*\b/u;
const DISALLOWED_GENERATION_MARKERS = /ollama|qwen|local-ollama|openai-api|external-model/iu;
const ACTIVE_ACTIONS = new Set(['keep', 'rewrite', 'split', 'move']);
const RETIRED_ACTIONS = new Set(['merge', 'delete']);
const ALL_ACTIONS = new Set([...ACTIVE_ACTIONS, ...RETIRED_ACTIONS]);
const CONTENT_STAGES = ['question-en', 'question-zh', 'answer-en', 'answer-zh'];
const STAGE_FIELDS = {
  'question-en': 'questionEn',
  'question-zh': 'questionZh',
  'answer-en': 'answerEn',
  'answer-zh': 'answerZh',
};
const FULL_INDEPENDENT_REVIEW = 'full-independent';
const RISK_STRATIFIED_SAMPLE_REVIEW = 'risk-stratified-sample';
const TRANSLATION_STAGES = new Set(['question-zh', 'answer-zh']);

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(value) {
  return String(value ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+/gu, ' ')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function isValidBatchId(value) {
  return value !== 'all' && BATCH_ID.test(value ?? '');
}

function isNonEmptyUniqueStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) => typeof entry === 'string' && normalize(entry) && entry === normalize(entry),
    ) &&
    new Set(value).size === value.length
  );
}

function hashBuffer(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileHash(path) {
  return hashBuffer(readFileSync(path));
}

function valueHash(value) {
  return hashBuffer(JSON.stringify(value));
}

function sourceFiles(root = opiRoot) {
  return [
    join(root, 'bank.json'),
    ...readdirSync(join(root, 'categories'))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(root, 'categories', name)),
    ...readdirSync(join(root, 'topics'))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => join(root, 'topics', name)),
  ];
}

function sourceFileEntries(root = opiRoot) {
  return sourceFiles(root).map((path) => ({
    path: relative(root, path),
    hash: fileHash(path),
    bytes: statSync(path).size,
  }));
}

function sourceDigest(root = opiRoot) {
  return valueHash(sourceFileEntries(root).map(({ path, hash }) => ({ path, hash })));
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

function auditSource(root = opiRoot) {
  const source = loadSource(root);
  const textRows = source.rows.filter(({ card }) => card.kind !== 'image');
  const imageRows = source.rows.filter(({ card }) => card.kind === 'image');
  const imageTopicIds = new Set(
    source.topics.filter((topic) => topic.cards.some((card) => card.kind === 'image')).map((topic) => topic.id),
  );
  const seenIds = new Set();
  const duplicateCardIds = [];
  for (const { card } of source.rows) {
    if (seenIds.has(card.id)) duplicateCardIds.push(card.id);
    seenIds.add(card.id);
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
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceDigest: sourceDigest(root),
    counts: {
      sourceFiles: sourceFiles(root).length,
      categories: source.categories.length,
      topics: source.topics.length,
      ordinaryTopics: source.topics.length - imageTopicIds.size,
      imageTopics: imageTopicIds.size,
      cards: source.rows.length,
      textCards: textRows.length,
      imageCards: imageRows.length,
      imageTopicTextCards: textRows.filter(({ topic }) => imageTopicIds.has(topic.id)).length,
    },
    declarations: {
      bankTopicCount: source.bank.declaredTopicCount,
      bankCardCount: source.bank.declaredCardCount,
      categoryErrors: categoryDeclarationErrors,
      topicErrors: topicDeclarationErrors,
    },
    identity: {
      uniqueCardIds: seenIds.size,
      duplicateCardIds,
    },
    quality: {
      missingQuestionEn: textRows.filter(({ card }) => !normalize(card.audioText)).map(({ card }) => card.id),
      missingQuestionZh: textRows.filter(({ card }) => !normalize(card.audioTextZh)).map(({ card }) => card.id),
      missingAnswerEn: textRows.filter(({ card }) => !normalize(card.referenceText)).map(({ card }) => card.id),
      missingAnswerZh: textRows.filter(({ card }) => !normalize(card.referenceTextZh)).map(({ card }) => card.id),
      hanInQuestionEn: textRows.filter(({ card }) => HAN.test(normalize(card.audioText))).map(({ card }) => card.id),
      hanInAnswerEn: textRows.filter(({ card }) => HAN.test(normalize(card.referenceText))).map(({ card }) => card.id),
    },
  };
}

function compactAudit(audit) {
  return {
    sourceDigest: audit.sourceDigest,
    counts: audit.counts,
    declarations: {
      bankTopicCount: audit.declarations.bankTopicCount,
      bankCardCount: audit.declarations.bankCardCount,
      categoryErrorCount: audit.declarations.categoryErrors.length,
      topicErrorCount: audit.declarations.topicErrors.length,
    },
    identity: {
      uniqueCardIds: audit.identity.uniqueCardIds,
      duplicateCardIdCount: audit.identity.duplicateCardIds.length,
    },
    missing: {
      questionEn: audit.quality.missingQuestionEn.length,
      questionZh: audit.quality.missingQuestionZh.length,
      answerEn: audit.quality.missingAnswerEn.length,
      answerZh: audit.quality.missingAnswerZh.length,
    },
  };
}

function commandAudit() {
  console.log(JSON.stringify(compactAudit(auditSource()), null, 2));
}

function commandFreeze() {
  if (existsSync(generatedRoot)) fail('generated_root_exists: clean it explicitly before freezing a new baseline');
  const audit = auditSource();
  const entries = sourceFileEntries();
  mkdirSync(snapshotSourceRoot, { recursive: true });
  for (const entry of entries) {
    const sourcePath = join(opiRoot, entry.path);
    const targetPath = join(snapshotSourceRoot, entry.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
  copyFileSync(registryPath, snapshotRegistryPath);
  const manifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    frozenAt: new Date().toISOString(),
    ruleVersion: RULE_VERSION,
    sourceRoot: 'content/question-banks/banks/opi',
    sourceDigest: audit.sourceDigest,
    sourceFileCount: entries.length,
    sourceCounts: audit.counts,
    files: entries,
    registry: {
      path: 'content/question-banks/registry.json',
      hash: fileHash(registryPath),
      snapshotPath: 'snapshot/registry.json',
    },
  };
  writeJson(auditPath, audit);
  writeJson(manifestPath, manifest);
  console.log(
    'opi_rebuild_freeze_ok files=' + entries.length +
      ' cards=' + audit.counts.cards +
      ' text=' + audit.counts.textCards +
      ' digest=' + audit.sourceDigest,
  );
}

function riskCandidatesFor(row) {
  const question = normalize(row.card.audioText);
  const answer = normalize(row.card.referenceText);
  const combined = question + ' ' + answer;
  const risks = [];
  if (row.topic.cards.some((card) => card.kind === 'image')) risks.push('image-topic');
  if (/\b(?:your|you|have you|company|airline|employer|experience|first solo|hometown|favorite)\b/iu.test(question))
    risks.push('personal-or-company');
  if (/\b(?:procedure|checklist|SOP|should|must|emergency|failure|fire|evacuation|rejected takeoff|go-around)\b/iu.test(combined))
    risks.push('aviation-procedure');
  if (/\b\d+(?:\.\d+)?\b/u.test(combined)) risks.push('number-or-limit');
  if ((question.match(/\?/gu) ?? []).length > 1) risks.push('multiple-question-marks');
  if (question.includes('/') || /\n/u.test(question)) risks.push('format-or-alternative');
  return [...new Set(risks)];
}

function blankItem(row) {
  const originalContent = {
    questionEn: normalize(row.card.audioText),
    questionZh: normalize(row.card.audioTextZh),
    answerEn: normalize(row.card.referenceText),
    answerZh: normalize(row.card.referenceTextZh),
  };
  return {
    itemId: row.card.id,
    source: {
      categoryId: row.topic.categoryId,
      topicId: row.topic.id,
      topicName: row.topic.name,
      cardId: row.card.id,
      topicIndex: row.topicIndex,
      cardIndex: row.cardIndex,
      derivationIndex: 0,
      isDerived: false,
      contentChecksum: valueHash(row.card),
      originalCard: clone(row.card),
      originalContent,
    },
    riskCandidates: riskCandidatesFor(row),
    decision: {
      action: null,
      answerDisposition: null,
      targetCategoryId: null,
      targetTopicId: null,
      canonicalCardId: null,
      sourceCardIds: [row.card.id],
      targetOrder: null,
      reason: '',
    },
    content: {
      questionEn: '',
      questionZh: '',
      answerEn: null,
      answerZh: null,
    },
    provenance: {
      producer: null,
      producerContextId: null,
      batchId: null,
      stages: {},
    },
    review: {
      decision: 'pending',
      questionEn: 'pending',
      questionZh: 'blocked',
      answerEn: 'blocked',
      answerZh: 'blocked',
      imageDependencyReason: '',
      factSources: [],
      factUncertainty: '',
    },
    reviewRecords: {},
    locks: {},
  };
}

function commandPrepare() {
  verifySourceAgainstBaseline();
  if (existsSync(workItemsPath) || existsSync(candidateIndexPath))
    fail('prepared_files_exist: do not overwrite reconstruction work');
  const manifest = readJson(manifestPath);
  const source = loadSource();
  const rows = source.rows.filter(({ card }) => card.kind !== 'image');
  const items = rows.map(blankItem);
  const work = {
    schemaVersion: WORK_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    ruleVersion: RULE_VERSION,
    baselineDigest: manifest.sourceDigest,
    sourceCounts: manifest.sourceCounts,
    stageState: {
      baseline: 'locked',
      questionEn: 'pending',
      questionZh: 'blocked',
      answerEn: 'blocked',
      answerZh: 'blocked',
      finalReview: 'blocked',
    },
    finalReview: {
      status: 'blocked',
      lock: null,
      lockedBy: null,
      lockedAt: null,
      reason: '',
      checks: [],
    },
    stageClosures: {},
    items,
  };
  const candidateIndex = {
    schemaVersion: 1,
    createdAt: work.createdAt,
    ruleVersion: RULE_VERSION,
    baselineDigest: manifest.sourceDigest,
    instructions: {
      calibrationOriginalCardRange: [30, 50],
      regularOriginalCardRange: [40, 60],
      checkpointOriginalCardRange: [200, 300],
      topicBoundaryRequired: true,
      contentIncluded: false,
    },
    topics: source.topics.map((topic) => {
      const topicItems = items.filter((item) => item.source.topicId === topic.id);
      return {
        categoryId: topic.categoryId,
        topicId: topic.id,
        topicName: topic.name,
        sourceTextCardCount: topicItems.length,
        sourceCardIds: topicItems.map((item) => item.source.cardId),
        riskCandidateCounts: Object.fromEntries(
          [...new Set(topicItems.flatMap((item) => item.riskCandidates))].sort().map((risk) => [
            risk,
            topicItems.filter((item) => item.riskCandidates.includes(risk)).length,
          ]),
        ),
      };
    }),
  };
  writeJson(workItemsPath, work);
  writeJson(candidateIndexPath, candidateIndex);
  console.log('opi_rebuild_prepare_ok items=' + items.length + ' content=blank locks=0');
}

function requireManifest() {
  if (!existsSync(manifestPath)) fail('baseline_manifest_missing');
  return readJson(manifestPath);
}

function verifySourceAgainstBaseline() {
  const manifest = requireManifest();
  const errors = [];
  const currentEntries = sourceFileEntries();
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) errors.push('manifest:schema_version');
  if (manifest.ruleVersion !== RULE_VERSION) errors.push('manifest:rule_version');
  if (manifest.sourceFileCount !== currentEntries.length)
    errors.push('manifest:file_count:' + manifest.sourceFileCount + '/' + currentEntries.length);
  const currentByPath = new Map(currentEntries.map((entry) => [entry.path, entry]));
  for (const entry of manifest.files) {
    const current = currentByPath.get(entry.path);
    if (!current) errors.push(entry.path + ':source_missing');
    else if (current.hash !== entry.hash) errors.push(entry.path + ':source_hash');
    const snapshotPath = join(snapshotSourceRoot, entry.path);
    if (!existsSync(snapshotPath)) errors.push(entry.path + ':snapshot_missing');
    else if (fileHash(snapshotPath) !== entry.hash) errors.push(entry.path + ':snapshot_hash');
  }
  if (sourceDigest() !== manifest.sourceDigest) errors.push('source:combined_digest');
  if (!existsSync(snapshotRegistryPath)) errors.push('registry:snapshot_missing');
  else if (fileHash(snapshotRegistryPath) !== manifest.registry.hash) errors.push('registry:snapshot_hash');
  if (fileHash(registryPath) !== manifest.registry.hash) errors.push('registry:current_hash');
  if (errors.length) fail('baseline_invalid\n' + errors.join('\n'));
  return manifest;
}

function loadWork() {
  if (!existsSync(workItemsPath)) fail('work_items_missing: run prepare');
  const work = readJson(workItemsPath);
  if (work.schemaVersion !== WORK_SCHEMA_VERSION) fail('work_items_schema_version');
  if (work.ruleVersion !== RULE_VERSION) fail('work_items_rule_version');
  return work;
}

function contentStageLifecycle(work) {
  if (work.stageState?.baseline !== 'locked') fail('stage_state_baseline_not_locked');
  let lockedCount = 0;
  while (
    lockedCount < CONTENT_STAGES.length &&
    work.stageState?.[STAGE_FIELDS[CONTENT_STAGES[lockedCount]]] === 'locked'
  )
    lockedCount += 1;
  const currentStage = CONTENT_STAGES[lockedCount] ?? null;
  if (currentStage && work.stageState?.[STAGE_FIELDS[currentStage]] !== 'pending')
    fail(
      'stage_state_current_not_pending:' +
        currentStage +
        ':' +
        work.stageState?.[STAGE_FIELDS[currentStage]],
    );
  for (const laterStage of CONTENT_STAGES.slice(lockedCount + (currentStage ? 1 : 0))) {
    if (work.stageState?.[STAGE_FIELDS[laterStage]] !== 'blocked')
      fail(
        'stage_state_future_not_blocked:' +
          laterStage +
          ':' +
          work.stageState?.[STAGE_FIELDS[laterStage]],
      );
  }
  const completedStages = CONTENT_STAGES.slice(0, lockedCount);
  const closureStages = Object.keys(work.stageClosures ?? {}).filter((stage) =>
    CONTENT_STAGES.includes(stage),
  );
  if (valueHash(closureStages.sort()) !== valueHash([...completedStages].sort()))
    fail(
      'stage_closure_sequence:' +
        closureStages.sort().join(',') +
        '/' +
        completedStages.join(','),
    );
  const expectedFinalReviewState = currentStage ? 'blocked' : null;
  if (
    expectedFinalReviewState &&
    work.stageState?.finalReview !== expectedFinalReviewState
  )
    fail('stage_state_final_review:' + work.stageState?.finalReview + '/' + expectedFinalReviewState);
  if (
    !currentStage &&
    !['pending', 'locked'].includes(work.stageState?.finalReview)
  )
    fail('stage_state_final_review_after_content:' + work.stageState?.finalReview);
  return { currentStage, completedStages };
}

function requireCurrentContentStage(work, stage, operation) {
  if (!CONTENT_STAGES.includes(stage)) fail(operation + '_unknown_stage:' + stage);
  const lifecycle = contentStageLifecycle(work);
  if (lifecycle.currentStage !== stage)
    fail(
      operation +
        '_stage_not_current:' +
        stage +
        ':current=' +
        (lifecycle.currentStage ?? 'none'),
    );
  return lifecycle;
}

function stageStatusSnapshot(work) {
  const lifecycle = contentStageLifecycle(work);
  const currentField = lifecycle.currentStage ? STAGE_FIELDS[lifecycle.currentStage] : null;
  const activeItems = work.items.filter(isActive);
  const completedItems = currentField
    ? activeItems.filter((item) => Boolean(item.locks?.[currentField])).length
    : activeItems.length;
  const batchIds = [...new Set(work.items.map((item) => item.provenance.batchId).filter(Boolean))].sort();
  const sealedBatches = lifecycle.currentStage
    ? batchIds.filter((batchId) =>
        existsSync(join(batchManifestRoot, batchId + '.' + lifecycle.currentStage + '.json')),
      ).length
    : 0;
  return {
    baselineDigest: work.baselineDigest,
    currentStage: lifecycle.currentStage,
    completedStages: lifecycle.completedStages,
    stageState: work.stageState,
    counts: {
      originalItems: work.items.filter((item) => !item.source.isDerived).length,
      activeItems: activeItems.length,
      currentStageCompletedItems: completedItems,
      batches: batchIds.length,
      currentStageSealedBatches: sealedBatches,
    },
  };
}

function commandStageStatus() {
  verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  console.log(JSON.stringify(stageStatusSnapshot(work), null, 2));
}

function commandPreflightStage(stage) {
  verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  requireCurrentContentStage(work, stage, 'preflight_stage');
  console.log(
    JSON.stringify(
      {
        ok: true,
        requestedStage: stage,
        ...stageStatusSnapshot(work),
      },
      null,
      2,
    ),
  );
}

function originalRowsFromSnapshot() {
  return loadSource(snapshotSourceRoot).rows.filter(({ card }) => card.kind !== 'image');
}

function verifyWorkOrigins(work) {
  const manifest = requireManifest();
  const errors = [];
  if (work.baselineDigest !== manifest.sourceDigest) errors.push('work:baseline_digest');
  if (DISALLOWED_GENERATION_MARKERS.test(JSON.stringify(work)))
    errors.push('work:disallowed_generation_marker');
  const originalRows = originalRowsFromSnapshot();
  const originals = work.items.filter((item) => !item.source.isDerived);
  if (originals.length !== originalRows.length)
    errors.push('work:original_count:' + originals.length + '/' + originalRows.length);
  const rowById = new Map(originalRows.map((row) => [row.card.id, row]));
  const seenOriginals = new Set();
  const seenItemIds = new Set();
  for (const item of work.items) {
    if (!item.itemId) errors.push('work:item_without_id');
    if (seenItemIds.has(item.itemId)) errors.push(item.itemId + ':duplicate_item_id');
    seenItemIds.add(item.itemId);
    const row = rowById.get(item.source.cardId);
    if (!row) {
      errors.push(item.itemId + ':unknown_source_card');
      continue;
    }
    if (!item.source.isDerived) {
      if (seenOriginals.has(item.source.cardId)) errors.push(item.source.cardId + ':duplicate_original');
      seenOriginals.add(item.source.cardId);
      if (item.itemId !== item.source.cardId) errors.push(item.itemId + ':original_item_id');
      if (item.source.derivationIndex !== 0) errors.push(item.itemId + ':original_derivation_index');
    } else if (!Number.isInteger(item.source.derivationIndex) || item.source.derivationIndex < 1) {
      errors.push(item.itemId + ':derived_index');
    }
    if (item.source.contentChecksum !== valueHash(row.card))
      errors.push(item.itemId + ':source_content_checksum');
    if (valueHash(item.source.originalCard) !== valueHash(row.card))
      errors.push(item.itemId + ':source_original_card');
    const expectedOriginal = {
      questionEn: normalize(row.card.audioText),
      questionZh: normalize(row.card.audioTextZh),
      answerEn: normalize(row.card.referenceText),
      answerZh: normalize(row.card.referenceTextZh),
    };
    if (valueHash(item.source.originalContent) !== valueHash(expectedOriginal))
      errors.push(item.itemId + ':source_original_content');
  }
  if (errors.length) fail('work_origin_invalid\n' + errors.join('\n'));
}

function commandVerifyBaseline() {
  const manifest = verifySourceAgainstBaseline();
  const audit = auditSource();
  const errors = [];
  const expected = {
    sourceFiles: 153,
    categories: 8,
    topics: 144,
    ordinaryTopics: 121,
    imageTopics: 23,
    cards: 1356,
    textCards: 1333,
    imageCards: 23,
    imageTopicTextCards: 64,
  };
  for (const [field, count] of Object.entries(expected)) {
    if (audit.counts[field] !== count) errors.push('counts:' + field + ':' + audit.counts[field] + '/' + count);
  }
  if (audit.identity.duplicateCardIds.length) errors.push('identity:duplicate_card_ids');
  if (audit.declarations.categoryErrors.length) errors.push('declarations:categories');
  if (audit.declarations.topicErrors.length) errors.push('declarations:topics');
  if (
    audit.declarations.bankTopicCount !== audit.counts.topics ||
    audit.declarations.bankCardCount !== audit.counts.cards
  )
    errors.push('declarations:bank');
  if (existsSync(workItemsPath)) verifyWorkOrigins(loadWork());
  if (errors.length) fail('baseline_counts_invalid\n' + errors.join('\n'));
  console.log(
    'opi_rebuild_verify_baseline_ok files=' + manifest.sourceFileCount +
      ' categories=' + audit.counts.categories +
      ' topics=' + audit.counts.topics +
      ' cards=' + audit.counts.cards +
      ' text=' + audit.counts.textCards +
      ' image=' + audit.counts.imageCards +
      ' image_topic_text=' + audit.counts.imageTopicTextCards +
      ' digest=' + manifest.sourceDigest,
  );
}

function isActive(item) {
  return ACTIVE_ACTIONS.has(item.decision.action);
}

function expectedDecisionLock(item) {
  return valueHash({
    stage: 'question-en-decision',
    action: item.decision.action,
    targetCategoryId: item.decision.targetCategoryId,
    targetTopicId: item.decision.targetTopicId,
    canonicalCardId: item.decision.canonicalCardId,
    sourceCardIds: item.decision.sourceCardIds,
    reason: normalize(item.decision.reason),
  });
}

function expectedContentLock(item, stage) {
  if (stage === 'question-en')
    return valueHash({
      stage,
      decision: item.locks.decision,
      value: normalize(item.content.questionEn),
    });
  if (stage === 'question-zh')
    return valueHash({
      stage,
      questionEn: item.locks.questionEn,
      value: normalize(item.content.questionZh),
    });
  if (stage === 'answer-en')
    return valueHash({
      stage,
      questionEn: item.locks.questionEn,
      questionZh: item.locks.questionZh,
      disposition: item.decision.answerDisposition,
      imageDependencyReason: normalize(item.review.imageDependencyReason),
      factSources: item.review.factSources,
      factUncertainty: normalize(item.review.factUncertainty),
      value: item.content.answerEn === null ? null : normalize(item.content.answerEn),
    });
  return valueHash({
    stage,
    questionEn: item.locks.questionEn,
    questionZh: item.locks.questionZh,
    answerEn: item.locks.answerEn,
    disposition: item.decision.answerDisposition,
    value: item.content.answerZh === null ? null : normalize(item.content.answerZh),
  });
}

function verifyReviewRecord(item, field, errors) {
  const record = item.reviewRecords?.[field];
  if (!record) {
    errors.push(item.itemId + ':' + field + ':review_record');
    return;
  }
  const reviewMode =
    record.reviewMode === undefined ? FULL_INDEPENDENT_REVIEW : record.reviewMode;
  const independentlyReviewed =
    record.independentlyReviewed === undefined
      ? reviewMode === FULL_INDEPENDENT_REVIEW
      : record.independentlyReviewed;
  if (![FULL_INDEPENDENT_REVIEW, RISK_STRATIFIED_SAMPLE_REVIEW].includes(reviewMode))
    errors.push(item.itemId + ':' + field + ':review_mode');
  if (reviewMode === RISK_STRATIFIED_SAMPLE_REVIEW && !['questionZh', 'answerZh'].includes(field))
    errors.push(item.itemId + ':' + field + ':sample_review_not_allowed');
  if (reviewMode === RISK_STRATIFIED_SAMPLE_REVIEW && typeof record.independentlyReviewed !== 'boolean')
    errors.push(item.itemId + ':' + field + ':independent_review_flag');
  if (record.independentlyReviewed !== undefined && typeof record.independentlyReviewed !== 'boolean')
    errors.push(item.itemId + ':' + field + ':independent_review_flag_type');
  if (reviewMode === FULL_INDEPENDENT_REVIEW && independentlyReviewed !== true)
    errors.push(item.itemId + ':' + field + ':full_review_not_independent');
  if (!['codex-main', 'codex-subagent'].includes(record.lockedBy))
    errors.push(item.itemId + ':' + field + ':locked_by');
  if (independentlyReviewed) {
    if (!['codex-main', 'codex-subagent'].includes(record.reviewer))
      errors.push(item.itemId + ':' + field + ':reviewer');
    if (!normalize(record.reviewerContextId))
      errors.push(item.itemId + ':' + field + ':reviewer_context');
    if (record.reviewerContextId === stageProducer(item, field).producerContextId)
      errors.push(item.itemId + ':' + field + ':reviewer_not_independent');
  } else {
    if (record.lockedBy !== 'codex-main')
      errors.push(item.itemId + ':' + field + ':sample_unreviewed_locked_by');
    if (record.reviewer !== null || record.reviewerContextId !== null)
      errors.push(item.itemId + ':' + field + ':sample_unreviewed_fake_reviewer');
    if ((record.additionalReviewers ?? []).length)
      errors.push(item.itemId + ':' + field + ':sample_unreviewed_additional_reviewer');
    if (!record.checks?.includes('producer-inline-check'))
      errors.push(item.itemId + ':' + field + ':producer_inline_check');
  }
  if (!normalize(record.reason)) errors.push(item.itemId + ':' + field + ':review_reason');
  if (!Array.isArray(record.checks) || record.checks.length === 0)
    errors.push(item.itemId + ':' + field + ':review_checks');
  if (!normalize(record.lockedAt)) errors.push(item.itemId + ':' + field + ':locked_at');
}

function stageProducer(item, field) {
  return item.provenance.stages?.[field] ?? {
    producer: item.provenance.producer,
    producerContextId: item.provenance.producerContextId,
  };
}

function verifyProducer(item, field, errors) {
  const producer = stageProducer(item, field);
  if (!['codex-main', 'codex-subagent', 'codex-script'].includes(producer.producer))
    errors.push(item.itemId + ':' + field + ':producer');
  if (!normalize(producer.producerContextId))
    errors.push(item.itemId + ':' + field + ':producer_context');
  if (!isValidBatchId(item.provenance.batchId)) errors.push(item.itemId + ':batch_id');
}

function verifyQuestionText(value, language, item, errors) {
  const text = normalize(value);
  if (!text) errors.push(item.itemId + ':question_' + language + ':empty');
  if (/\n/u.test(text)) errors.push(item.itemId + ':question_' + language + ':linebreak');
  if (!/[?？]$/u.test(text)) errors.push(item.itemId + ':question_' + language + ':ending');
  if (language === 'en' && HAN.test(text)) errors.push(item.itemId + ':question_en:han');
  if (language === 'zh' && !HAN.test(text)) errors.push(item.itemId + ':question_zh:no_han');
}

function verifyAnswerText(value, language, item, errors) {
  const text = normalize(value);
  if (!text) errors.push(item.itemId + ':answer_' + language + ':empty');
  if (/^(?:answer|version|option)\s*\d|(?:^|\n)\s*(?:[-*•]|\d+[.)、])\s+/imu.test(text))
    errors.push(item.itemId + ':answer_' + language + ':numbered_or_bulleted');
  if (language === 'en' && HAN.test(text)) errors.push(item.itemId + ':answer_en:han');
  if (language === 'zh') {
    if (!HAN.test(text)) errors.push(item.itemId + ':answer_zh:no_han');
    if (ENGLISH_SENTENCE.test(text)) errors.push(item.itemId + ':answer_zh:english_sentence');
  }
}

function verifyDecisionAndQuestionEn(work, { partial = false, mergeTargetById = new Map() } = {}) {
  const errors = [];
  const source = loadSource(snapshotSourceRoot);
  const topicById = new Map(source.topics.map((topic) => [topic.id, topic]));
  const categoryById = new Map(source.categories.map((category) => [category.id, category]));
  const publishedIds = new Set(source.rows.map(({ card }) => card.id));
  const activeIds = new Set();
  const activeCanonicalById = new Map();
  const activeByTopic = new Map();
  for (const item of work.items) {
    const action = item.decision.action;
    if (!ALL_ACTIONS.has(action)) {
      errors.push(item.itemId + ':decision_action');
      continue;
    }
    if (item.review.decision !== 'locked') errors.push(item.itemId + ':decision_status');
    if (!normalize(item.decision.reason)) errors.push(item.itemId + ':decision_reason');
    if (!Array.isArray(item.decision.sourceCardIds) || item.decision.sourceCardIds.length === 0)
      errors.push(item.itemId + ':source_card_ids');
    else if (!item.decision.sourceCardIds.includes(item.source.cardId))
      errors.push(item.itemId + ':source_card_ids_missing_origin');
    verifyProducer(item, 'questionEn', errors);
    if (item.locks.decision !== expectedDecisionLock(item))
      errors.push(item.itemId + ':decision_lock');
    verifyReviewRecord(item, 'decision', errors);
    if (isActive(item)) {
      const topic = topicById.get(item.decision.targetTopicId);
      const category = categoryById.get(item.decision.targetCategoryId);
      if (!topic) errors.push(item.itemId + ':target_topic');
      if (!category) errors.push(item.itemId + ':target_category');
      if (topic && topic.categoryId !== item.decision.targetCategoryId)
        errors.push(item.itemId + ':target_category_topic_mismatch');
      if (!normalize(item.decision.canonicalCardId)) errors.push(item.itemId + ':canonical_card_id');
      else if (activeIds.has(item.decision.canonicalCardId))
        errors.push(item.itemId + ':duplicate_canonical_card_id');
      activeIds.add(item.decision.canonicalCardId);
      activeCanonicalById.set(item.decision.canonicalCardId, {
        categoryId: item.decision.targetCategoryId,
        topicId: item.decision.targetTopicId,
        state: 'active',
      });
      if (item.source.isDerived) {
        if (item.decision.action !== 'split') errors.push(item.itemId + ':derived_action');
        if (item.decision.canonicalCardId !== item.itemId)
          errors.push(item.itemId + ':derived_canonical_card_id');
        if (publishedIds.has(item.decision.canonicalCardId))
          errors.push(item.itemId + ':derived_reuses_published_id');
      } else if (item.decision.canonicalCardId !== item.source.cardId) {
        errors.push(item.itemId + ':published_card_id_changed');
      }
      if (item.decision.action === 'move') {
        if (item.decision.targetTopicId === item.source.topicId)
          errors.push(item.itemId + ':move_without_topic_change');
      } else if (
        ['keep', 'rewrite'].includes(item.decision.action) &&
        item.decision.targetTopicId !== item.source.topicId
      ) {
        errors.push(item.itemId + ':topic_change_requires_move_action');
      }
      if (
        item.decision.action === 'keep' &&
        normalize(item.content.questionEn) !== normalize(item.source.originalContent.questionEn)
      )
        errors.push(item.itemId + ':keep_changed_question_en');
      if (!Number.isInteger(item.decision.targetOrder) || item.decision.targetOrder < 1)
        errors.push(item.itemId + ':target_order');
      const topicItems = activeByTopic.get(item.decision.targetTopicId) ?? [];
      topicItems.push(item);
      activeByTopic.set(item.decision.targetTopicId, topicItems);
      verifyQuestionText(item.content.questionEn, 'en', item, errors);
      if (item.review.questionEn !== 'locked') errors.push(item.itemId + ':question_en_status');
      if (item.locks.questionEn !== expectedContentLock(item, 'question-en'))
        errors.push(item.itemId + ':question_en_lock');
      verifyReviewRecord(item, 'questionEn', errors);
    } else {
      if (item.source.isDerived) errors.push(item.itemId + ':retired_derived_item');
      if (item.review.questionEn !== 'retired') errors.push(item.itemId + ':retired_question_en_status');
      if (normalize(item.content.questionEn)) errors.push(item.itemId + ':retired_question_en_content');
      if (item.locks.questionEn) errors.push(item.itemId + ':retired_question_en_lock');
      if (action === 'merge') {
        if (!normalize(item.decision.canonicalCardId)) errors.push(item.itemId + ':merge_target');
      } else if (item.decision.canonicalCardId !== null) {
        errors.push(item.itemId + ':delete_canonical_card_id');
      }
    }
  }
  const splitGroups = new Map();
  for (const item of work.items.filter((entry) => entry.decision.action === 'split')) {
    const entries = splitGroups.get(item.source.cardId) ?? [];
    entries.push(item);
    splitGroups.set(item.source.cardId, entries);
  }
  for (const [sourceCardId, items] of splitGroups) {
    if (items.length < 2) errors.push(sourceCardId + ':split_without_derived_item');
    const indexes = items.map((item) => item.source.derivationIndex).sort((a, b) => a - b);
    for (const [index, value] of indexes.entries()) {
      if (value !== index) errors.push(sourceCardId + ':split_derivation_sequence');
    }
  }
  for (const [topicId, items] of activeByTopic) {
    const orders = items.map((item) => item.decision.targetOrder).sort((a, b) => a - b);
    if (!partial)
      for (const [index, order] of orders.entries()) {
        if (order !== index + 1) errors.push(topicId + ':target_order_sequence');
      }
    const exact = new Map();
    for (const item of items) {
      const key = normalize(item.content.questionEn).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      if (exact.has(key)) errors.push(item.itemId + ':same_topic_exact_duplicate:' + exact.get(key));
      else exact.set(key, item.itemId);
    }
  }
  for (const item of work.items.filter((entry) => entry.decision.action === 'merge')) {
    const target =
      activeCanonicalById.get(item.decision.canonicalCardId) ??
      mergeTargetById.get(item.decision.canonicalCardId);
    if (!target) {
      errors.push(item.itemId + ':merge_target_not_active');
      continue;
    }
    if (
      item.decision.targetCategoryId !== target.categoryId ||
      item.decision.targetTopicId !== target.topicId
    )
      errors.push(item.itemId + ':merge_target_ownership');
  }
  if (errors.length) fail('question_en_invalid\n' + errors.join('\n'));
}

function verifyQuestionZh(work) {
  const errors = [];
  for (const item of work.items.filter(isActive)) {
    verifyProducer(item, 'questionZh', errors);
    verifyQuestionText(item.content.questionZh, 'zh', item, errors);
    if (item.review.questionZh !== 'locked') errors.push(item.itemId + ':question_zh_status');
    if (item.locks.questionZh !== expectedContentLock(item, 'question-zh'))
      errors.push(item.itemId + ':question_zh_lock');
    verifyReviewRecord(item, 'questionZh', errors);
    if (item.locks.questionEn !== expectedContentLock(item, 'question-en'))
      errors.push(item.itemId + ':question_en_dependency');
  }
  if (errors.length) fail('question_zh_invalid\n' + errors.join('\n'));
}

function verifyAnswerEn(work) {
  const errors = [];
  for (const item of work.items.filter(isActive)) {
    verifyProducer(item, 'answerEn', errors);
    if (!['complete', 'deferred-image-answer'].includes(item.decision.answerDisposition))
      errors.push(item.itemId + ':answer_disposition');
    if (item.decision.answerDisposition === 'deferred-image-answer') {
      const targetTopic = loadSource(snapshotSourceRoot).topics.find(
        (topic) => topic.id === item.decision.targetTopicId,
      );
      if (!targetTopic?.cards.some((card) => card.kind === 'image'))
        errors.push(item.itemId + ':deferred_outside_image_topic');
      if (item.content.answerEn !== null) errors.push(item.itemId + ':deferred_answer_en_content');
      if (item.review.answerEn !== 'deferred-image-answer')
        errors.push(item.itemId + ':deferred_answer_en_status');
      if (!normalize(item.review.imageDependencyReason))
        errors.push(item.itemId + ':deferred_image_reason');
    } else {
      verifyAnswerText(item.content.answerEn, 'en', item, errors);
      if (item.review.answerEn !== 'locked') errors.push(item.itemId + ':answer_en_status');
      if (normalize(item.review.imageDependencyReason))
        errors.push(item.itemId + ':unexpected_image_dependency_reason');
    }
    if (item.locks.answerEn !== expectedContentLock(item, 'answer-en'))
      errors.push(item.itemId + ':answer_en_lock');
    verifyReviewRecord(item, 'answerEn', errors);
    if (item.locks.questionEn !== expectedContentLock(item, 'question-en'))
      errors.push(item.itemId + ':question_en_dependency');
    if (item.locks.questionZh !== expectedContentLock(item, 'question-zh'))
      errors.push(item.itemId + ':question_zh_dependency');
  }
  if (errors.length) fail('answer_en_invalid\n' + errors.join('\n'));
}

function verifyAnswerZh(work) {
  const errors = [];
  for (const item of work.items.filter(isActive)) {
    verifyProducer(item, 'answerZh', errors);
    if (item.decision.answerDisposition === 'deferred-image-answer') {
      if (item.content.answerZh !== null) errors.push(item.itemId + ':deferred_answer_zh_content');
      if (item.review.answerZh !== 'deferred-image-answer')
        errors.push(item.itemId + ':deferred_answer_zh_status');
    } else {
      verifyAnswerText(item.content.answerZh, 'zh', item, errors);
      if (item.review.answerZh !== 'locked') errors.push(item.itemId + ':answer_zh_status');
      const enParagraphs = normalize(item.content.answerEn).split(/\n\n/u).length;
      const zhParagraphs = normalize(item.content.answerZh).split(/\n\n/u).length;
      if (enParagraphs !== zhParagraphs)
        errors.push(item.itemId + ':answer_paragraph_mismatch:' + enParagraphs + '/' + zhParagraphs);
    }
    if (item.locks.answerZh !== expectedContentLock(item, 'answer-zh'))
      errors.push(item.itemId + ':answer_zh_lock');
    verifyReviewRecord(item, 'answerZh', errors);
    if (item.locks.answerEn !== expectedContentLock(item, 'answer-en'))
      errors.push(item.itemId + ':answer_en_dependency');
  }
  if (errors.length) fail('answer_zh_invalid\n' + errors.join('\n'));
}

function verifyFutureStageIsolation(work, stage) {
  const errors = [];
  const futureFields = {
    'question-en': ['questionZh', 'answerEn', 'answerZh'],
    'question-zh': ['answerEn', 'answerZh'],
    'answer-en': ['answerZh'],
    'answer-zh': [],
  }[stage];
  for (const item of work.items) {
    if (!isActive(item)) {
      if (
        normalize(item.content.questionZh) ||
        item.content.answerEn !== null ||
        item.content.answerZh !== null
      )
        errors.push(item.itemId + ':retired_future_content');
      for (const field of ['questionZh', 'answerEn', 'answerZh']) {
        if (item.review[field] !== 'retired') errors.push(item.itemId + ':retired_' + field + '_status');
        if (item.locks[field]) errors.push(item.itemId + ':retired_' + field + '_lock');
        if (item.reviewRecords?.[field]) errors.push(item.itemId + ':retired_' + field + '_review');
        if (item.provenance.stages?.[field]) errors.push(item.itemId + ':retired_' + field + '_producer');
      }
      if (
        item.decision.answerDisposition !== null ||
        normalize(item.review.imageDependencyReason) ||
        item.review.factSources.length ||
        normalize(item.review.factUncertainty)
      )
        errors.push(item.itemId + ':retired_answer_metadata');
      continue;
    }
    for (const field of futureFields) {
      const contentValue = item.content[field];
      if (field === 'questionZh' ? normalize(contentValue) : contentValue !== null)
        errors.push(item.itemId + ':' + field + ':future_content');
      if (item.locks[field]) errors.push(item.itemId + ':' + field + ':future_lock');
      if (item.reviewRecords?.[field]) errors.push(item.itemId + ':' + field + ':future_review');
      if (item.provenance.stages?.[field]) errors.push(item.itemId + ':' + field + ':future_producer');
    }
    if (stage === 'question-en') {
      if (
        item.review.questionZh !== 'pending' ||
        item.review.answerEn !== 'blocked' ||
        item.review.answerZh !== 'blocked'
      )
        errors.push(item.itemId + ':question_en_future_status');
    } else if (stage === 'question-zh') {
      if (item.review.answerEn !== 'pending' || item.review.answerZh !== 'blocked')
        errors.push(item.itemId + ':question_zh_future_status');
    } else if (stage === 'answer-en') {
      const expected =
        item.decision.answerDisposition === 'deferred-image-answer'
          ? 'deferred-image-answer'
          : 'pending';
      if (item.review.answerZh !== expected) errors.push(item.itemId + ':answer_en_future_status');
    }
    if (['question-en', 'question-zh'].includes(stage)) {
      if (
        item.decision.answerDisposition !== null ||
        normalize(item.review.imageDependencyReason) ||
        item.review.factSources.length ||
        normalize(item.review.factUncertainty)
      )
        errors.push(item.itemId + ':future_answer_metadata');
    }
  }
  if (errors.length) fail('future_stage_isolation_invalid\n' + errors.join('\n'));
}

function batchSealPayload(work, batchId, stage) {
  const field = STAGE_FIELDS[stage];
  const items = work.items.filter(
    (item) =>
      item.provenance.batchId === batchId && (stage === 'question-en' || isActive(item)),
  );
  return {
    schemaVersion: 1,
    ruleVersion: work.ruleVersion,
    baselineDigest: work.baselineDigest,
    batchId,
    stage,
    inputManifest: readJson(join(batchInputManifestRoot, batchId + '.' + stage + '.json')),
    items: items.map((item) => ({
      itemId: item.itemId,
      sourceChecksum: item.source.contentChecksum,
      action: item.decision.action,
      canonicalCardId: item.decision.canonicalCardId,
      targetTopicId: item.decision.targetTopicId,
      producer: stageProducer(item, field).producer,
      producerContextId: stageProducer(item, field).producerContextId,
      reviewer: (item.reviewRecords?.[field] ?? item.reviewRecords?.decision)?.reviewer ?? null,
      reviewerContextId:
        (item.reviewRecords?.[field] ?? item.reviewRecords?.decision)?.reviewerContextId ?? null,
      decisionReviewRecord: item.reviewRecords?.decision ?? null,
      stageReviewRecord: item.reviewRecords?.[field] ?? null,
      imageDependencyReason: item.review.imageDependencyReason,
      factSources: item.review.factSources,
      factUncertainty: item.review.factUncertainty,
      decisionLock: item.locks.decision ?? null,
      stageLock: item.locks[field] ?? item.locks.decision ?? null,
    })),
  };
}

function verifyRequiredSeals(work, stage) {
  const errors = [];
  const batchIds = [...new Set(work.items.map((item) => item.provenance.batchId).filter(Boolean))].sort();
  for (const batchId of batchIds) {
    const path = join(batchManifestRoot, batchId + '.' + stage + '.json');
    if (!existsSync(path)) {
      errors.push(batchId + ':' + stage + ':seal_missing');
      continue;
    }
    const seal = readJson(path);
    const payload = batchSealPayload(work, batchId, stage);
    if (seal.manifestHash !== valueHash(payload)) errors.push(batchId + ':' + stage + ':seal_hash');
    if (valueHash(seal.payload) !== valueHash(payload)) errors.push(batchId + ':' + stage + ':seal_payload');
  }
  if (errors.length) fail('batch_seals_invalid\n' + errors.join('\n'));
}

function expectedStageClosureLock(work, stage, closure) {
  const field = STAGE_FIELDS[stage];
  const batchIds = [...new Set(work.items.map((item) => item.provenance.batchId).filter(Boolean))].sort();
  return valueHash({
    stage,
    authorization: {
      lockedBy: closure.lockedBy,
      lockedAt: closure.lockedAt,
      reason: normalize(closure.reason),
      checks: closure.checks,
    },
    itemLocks: work.items.map((item) => ({
      itemId: item.itemId,
      decision: item.locks.decision,
      stage: item.locks[field] ?? null,
      action: item.decision.action,
      canonicalCardId: item.decision.canonicalCardId,
      targetTopicId: item.decision.targetTopicId,
      targetOrder: item.decision.targetOrder,
    })),
    batchManifests: batchIds.map((batchId) => {
      const seal = readJson(join(batchManifestRoot, batchId + '.' + stage + '.json'));
      return { batchId, manifestHash: seal.manifestHash };
    }),
  });
}

function commandVerifyStage(stage, requireSeals) {
  commandVerifyBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  if (stage === 'baseline') {
    const errors = [];
    if (work.items.some((item) => item.decision.action !== null)) errors.push('prepared:decision_not_blank');
    if (
      work.items.some(
        (item) =>
          normalize(item.content.questionEn) ||
          normalize(item.content.questionZh) ||
          item.content.answerEn !== null ||
          item.content.answerZh !== null,
      )
    )
      errors.push('prepared:content_not_blank');
    if (work.items.some((item) => Object.keys(item.locks).length !== 0)) errors.push('prepared:locks_present');
    if (
      work.items.some(
        (item) =>
          item.decision.answerDisposition !== null ||
          item.decision.targetCategoryId !== null ||
          item.decision.targetTopicId !== null ||
          item.decision.canonicalCardId !== null ||
          item.decision.targetOrder !== null ||
          normalize(item.decision.reason) ||
          valueHash(item.decision.sourceCardIds) !== valueHash([item.source.cardId]),
      )
    )
      errors.push('prepared:decision_fields_not_blank');
    if (
      work.items.some(
        (item) =>
          item.provenance.producer !== null ||
          item.provenance.producerContextId !== null ||
          item.provenance.batchId !== null ||
          Object.keys(item.provenance.stages ?? {}).length !== 0,
      )
    )
      errors.push('prepared:provenance_present');
    if (work.items.some((item) => Object.keys(item.reviewRecords ?? {}).length !== 0))
      errors.push('prepared:review_records_present');
    if (
      work.items.some(
        (item) =>
          normalize(item.review.imageDependencyReason) ||
          item.review.factSources.length ||
          normalize(item.review.factUncertainty),
      )
    )
      errors.push('prepared:review_metadata_present');
    if (
      work.items.some(
        (item) =>
          item.review.decision !== 'pending' ||
          item.review.questionEn !== 'pending' ||
          item.review.questionZh !== 'blocked' ||
          item.review.answerEn !== 'blocked' ||
          item.review.answerZh !== 'blocked',
      )
    )
      errors.push('prepared:review_status');
    if (Object.keys(work.stageClosures ?? {}).length !== 0)
      errors.push('prepared:stage_closures_present');
    if (
      work.finalReview?.status !== 'blocked' ||
      work.finalReview?.lock !== null ||
      work.finalReview?.lockedBy !== null ||
      work.finalReview?.lockedAt !== null ||
      normalize(work.finalReview?.reason) ||
      work.finalReview?.checks?.length
    )
      errors.push('prepared:final_review_state');
    if (!existsSync(candidateIndexPath)) errors.push('prepared:candidate_index_missing');
    else {
      const candidateIndex = readJson(candidateIndexPath);
      const originalItems = work.items.filter((item) => !item.source.isDerived);
      const indexedIds = candidateIndex.topics.flatMap((topic) => topic.sourceCardIds);
      if (
        candidateIndex.baselineDigest !== work.baselineDigest ||
        candidateIndex.ruleVersion !== work.ruleVersion ||
        candidateIndex.instructions?.contentIncluded !== false ||
        candidateIndex.topics.length !== 144 ||
        valueHash(indexedIds) !== valueHash(originalItems.map((item) => item.source.cardId))
      )
        errors.push('prepared:candidate_index_contract');
    }
    if (errors.length) fail('prepared_baseline_invalid\n' + errors.join('\n'));
    console.log('opi_rebuild_verify_stage_ok stage=baseline items=' + work.items.length + ' content=blank');
    return;
  }
  if (!CONTENT_STAGES.includes(stage)) fail('unknown_stage:' + stage);
  verifyDecisionAndQuestionEn(work);
  if (stage !== 'question-en') verifyQuestionZh(work);
  if (['answer-en', 'answer-zh'].includes(stage)) verifyAnswerEn(work);
  if (stage === 'answer-zh') verifyAnswerZh(work);
  verifyFutureStageIsolation(work, stage);
  const expectedStageState = {
    'question-en': {
      questionEn: 'locked',
      questionZh: 'pending',
      answerEn: 'blocked',
      answerZh: 'blocked',
      finalReview: 'blocked',
    },
    'question-zh': {
      questionEn: 'locked',
      questionZh: 'locked',
      answerEn: 'pending',
      answerZh: 'blocked',
      finalReview: 'blocked',
    },
    'answer-en': {
      questionEn: 'locked',
      questionZh: 'locked',
      answerEn: 'locked',
      answerZh: 'pending',
      finalReview: 'blocked',
    },
    'answer-zh': {
      questionEn: 'locked',
      questionZh: 'locked',
      answerEn: 'locked',
      answerZh: 'locked',
      finalReview: 'pending',
    },
  }[stage];
  const stageStateErrors = Object.entries(expectedStageState)
    .filter(([field, value]) => work.stageState?.[field] !== value)
    .map(([field, value]) => 'stage_state:' + field + ':' + work.stageState?.[field] + '/' + value);
  if (stageStateErrors.length) fail('stage_state_invalid\n' + stageStateErrors.join('\n'));
  const closure = work.stageClosures?.[stage];
  if (
    !closure ||
    !['codex-main', 'codex-subagent'].includes(closure.lockedBy) ||
    !normalize(closure.lockedAt) ||
    !normalize(closure.reason) ||
    !Array.isArray(closure.checks) ||
    !closure.checks.length ||
    closure.lock !== expectedStageClosureLock(work, stage, closure)
  )
    fail('stage_closure_invalid:' + stage);
  if (requireSeals) verifyRequiredSeals(work, stage);
  console.log(
    'opi_rebuild_verify_stage_ok stage=' + stage +
      ' original=' + work.items.filter((item) => !item.source.isDerived).length +
      ' active=' + work.items.filter(isActive).length +
      ' retired=' + work.items.filter((item) => RETIRED_ACTIONS.has(item.decision.action)).length +
      ' seals=' + (requireSeals ? 'required' : 'not-required'),
  );
}

function commandSealBatch(batchId, stage) {
  if (!isValidBatchId(batchId)) fail('seal_batch_invalid_batch_id');
  if (!CONTENT_STAGES.includes(stage)) fail('seal_batch_unknown_stage:' + stage);
  const work = loadWork();
  verifySourceAgainstBaseline();
  verifyWorkOrigins(work);
  requireCurrentContentStage(work, stage, 'seal_batch');
  const items = work.items.filter((item) => item.provenance.batchId === batchId);
  if (!items.length) fail('seal_batch_empty:' + batchId);
  verifyBatchSubset(work, batchId, stage);
  const payload = batchSealPayload(work, batchId, stage);
  const manifestHash = valueHash(payload);
  const path = join(batchManifestRoot, batchId + '.' + stage + '.json');
  if (existsSync(path)) {
    const current = readJson(path);
    if (current.manifestHash !== manifestHash || valueHash(current.payload) !== valueHash(payload))
      fail('immutable_batch_manifest_conflict:' + batchId + ':' + stage);
    console.log('opi_rebuild_seal_batch_ok existing=true batch=' + batchId + ' stage=' + stage);
    return;
  }
  writeJson(path, {
    sealedAt: new Date().toISOString(),
    manifestHash,
    payload,
  });
  console.log(
    'opi_rebuild_seal_batch_ok existing=false batch=' + batchId +
      ' stage=' + stage +
      ' items=' + items.length +
      ' hash=' + manifestHash,
  );
}

function commandInvalidateBatch(batchId, stage, authorizationPathArg) {
  if (!isValidBatchId(batchId)) fail('invalidate_batch_invalid_batch_id');
  if (!CONTENT_STAGES.includes(stage)) fail('invalidate_batch_unknown_stage:' + stage);
  const sealPath = join(batchManifestRoot, batchId + '.' + stage + '.json');
  const requestedAuthorizationPath = resolve(projectRoot, authorizationPathArg ?? '');
  if (!authorizationPathArg || !existsSync(requestedAuthorizationPath))
    fail('invalidate_batch_authorization_missing');
  const authorizationPath = realpathSync(requestedAuthorizationPath);
  const realProjectRoot = realpathSync(projectRoot);
  const authorizationRelativePath = relative(projectRoot, authorizationPath);
  const realAuthorizationRelativePath = relative(realProjectRoot, authorizationPath);
  if (
    !authorizationRelativePath ||
    authorizationRelativePath.startsWith('..') ||
    realAuthorizationRelativePath.startsWith('..')
  )
    fail('invalidate_batch_authorization_outside_project');
  const authorization = readJson(authorizationPath);
  const isoTimestamp = (value) => {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) ||
      !Number.isFinite(Date.parse(value))
    )
      return false;
    const canonical = new Date(value).toISOString();
    return value.includes('.') ? value === canonical : value === canonical.replace('.000Z', 'Z');
  };
  const stringArray = (value) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (entry) => typeof entry === 'string' && normalize(entry) && entry === normalize(entry),
    ) &&
    new Set(value.map(normalize)).size === value.length;
  if (
    authorization.schemaVersion !== 1 ||
    authorization.batchId !== batchId ||
    authorization.stage !== stage ||
    !['codex-main', 'codex-subagent'].includes(authorization.invalidatedBy) ||
    !isoTimestamp(authorization.invalidatedAt) ||
    !normalize(authorization.reason) ||
    !/^[0-9a-f]{64}$/u.test(authorization.expectedManifestHash ?? '') ||
    !stringArray(authorization.affectedCardIds) ||
    !stringArray(authorization.checks)
  )
    fail('invalidate_batch_authorization_invalid');
  verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  const allCardIds = new Set(
    work.items.flatMap((item) => [item.itemId, item.source.cardId]),
  );
  if (authorization.affectedCardIds.some((cardId) => !allCardIds.has(cardId)))
    fail('invalidate_batch_unknown_affected_card');
  if (
    !authorization.affectedCardIds.some((cardId) =>
      work.items.some(
        (item) =>
          item.provenance.batchId === batchId &&
          (item.itemId === cardId || item.source.cardId === cardId),
      ),
    )
  )
    fail('invalidate_batch_no_affected_card_in_seal');
  const archiveBase = batchId + '.' + stage + '.' + authorization.expectedManifestHash;
  const archivedSealPath = join(invalidatedBatchManifestRoot, archiveBase + '.seal.json');
  const invalidationRecordPath = join(
    invalidatedBatchManifestRoot,
    archiveBase + '.invalidation.json',
  );
  const temporaryRecordPath = invalidationRecordPath + '.tmp';
  const validateSeal = (seal, sealFilePath, requireCurrentProjection) => {
    if (
      seal.manifestHash !== authorization.expectedManifestHash ||
      !/^[0-9a-f]{64}$/u.test(seal.manifestHash) ||
      seal.payload?.schemaVersion !== 1 ||
      seal.payload?.batchId !== batchId ||
      seal.payload?.stage !== stage ||
      seal.manifestHash !== valueHash(seal.payload) ||
      !isoTimestamp(seal.sealedAt)
    )
      fail('invalidate_batch_seal_invalid');
    if (
      requireCurrentProjection &&
      valueHash(seal.payload) !== valueHash(batchSealPayload(work, batchId, stage))
    )
      fail('invalidate_batch_seal_not_current_work_projection');
    return fileHash(sealFilePath);
  };
  const expectedRecord = (archivedSealFileHash) => ({
    ...authorization,
    previousManifestHash: authorization.expectedManifestHash,
    archivedSealPath: relative(projectRoot, archivedSealPath),
    archivedSealFileHash,
    authorizationPath: authorizationRelativePath,
    authorizationHash: fileHash(authorizationPath),
  });
  if (!existsSync(sealPath)) {
    if (existsSync(archivedSealPath) && existsSync(invalidationRecordPath)) {
      const archivedSeal = readJson(archivedSealPath);
      validateSeal(archivedSeal, archivedSealPath, false);
      const record = readJson(invalidationRecordPath);
      if (valueHash(record) !== valueHash(expectedRecord(fileHash(archivedSealPath))))
        fail('invalidate_batch_existing_record_mismatch');
      console.log(
        'opi_rebuild_invalidate_batch_ok existing=true batch=' + batchId +
          ' stage=' + stage +
          ' previous_hash=' + authorization.expectedManifestHash,
      );
      return;
    }
    if (
      existsSync(archivedSealPath) &&
      existsSync(temporaryRecordPath) &&
      !existsSync(invalidationRecordPath)
    ) {
      const archivedSeal = readJson(archivedSealPath);
      validateSeal(archivedSeal, archivedSealPath, false);
      const record = readJson(temporaryRecordPath);
      if (valueHash(record) !== valueHash(expectedRecord(fileHash(archivedSealPath))))
        fail('invalidate_batch_resume_record_mismatch');
      renameSync(temporaryRecordPath, invalidationRecordPath);
      console.log(
        'opi_rebuild_invalidate_batch_ok resumed=true batch=' + batchId +
          ' stage=' + stage +
          ' previous_hash=' + authorization.expectedManifestHash,
      );
      return;
    }
    fail('invalidate_batch_incomplete_or_missing_seal:' + batchId + ':' + stage);
  }
  if (existsSync(archivedSealPath) || existsSync(invalidationRecordPath))
    fail('invalidate_batch_archive_exists:' + archiveBase);
  if (existsSync(temporaryRecordPath)) rmSync(temporaryRecordPath, { force: true });
  const seal = readJson(sealPath);
  const archivedSealFileHash = validateSeal(seal, sealPath, true);
  mkdirSync(invalidatedBatchManifestRoot, { recursive: true });
  const record = expectedRecord(archivedSealFileHash);
  try {
    writeFileSync(temporaryRecordPath, JSON.stringify(record, null, 2) + '\n');
    const temporaryRecordFd = openSync(temporaryRecordPath, 'r');
    try {
      fsyncSync(temporaryRecordFd);
    } finally {
      closeSync(temporaryRecordFd);
    }
    renameSync(sealPath, archivedSealPath);
    renameSync(temporaryRecordPath, invalidationRecordPath);
  } catch (error) {
    if (existsSync(invalidationRecordPath)) rmSync(invalidationRecordPath, { force: true });
    if (!existsSync(sealPath) && existsSync(archivedSealPath))
      renameSync(archivedSealPath, sealPath);
    if (existsSync(temporaryRecordPath)) rmSync(temporaryRecordPath, { force: true });
    throw error;
  }
  console.log(
    'opi_rebuild_invalidate_batch_ok batch=' + batchId +
      ' stage=' + stage +
      ' previous_hash=' + seal.manifestHash,
  );
}

function tokenSet(value) {
  return new Set(
    normalize(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/u)
      .filter((token) => token.length > 1),
  );
}

function jaccard(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function phrase(value, edge) {
  const words = normalize(value).replace(/\n+/gu, ' ').split(/\s+/u).filter(Boolean);
  const selected = edge === 'start' ? words.slice(0, 6) : words.slice(-6);
  return selected.join(' ').toLowerCase();
}

function frequency(values) {
  const counts = new Map();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 30)
    .map(([value, count]) => ({ value, count }));
}

function commandBuildReview(stage = 'question-en', scope = 'all') {
  if (!CONTENT_STAGES.includes(stage)) fail('build_review_unknown_stage:' + stage);
  if (scope !== 'all' && !isValidBatchId(scope)) fail('build_review_invalid_scope:' + scope);
  const work = loadWork();
  verifyWorkOrigins(work);
  const active = work.items.filter(isActive);
  const scoped = scope === 'all' ? active : active.filter((item) => item.provenance.batchId === scope);
  if (!scoped.length) fail('build_review_empty_scope:' + scope);
  const exactDuplicates = [];
  const highSimilarity = [];
  const byTopic = new Map();
  for (const item of scoped) {
    const entries = byTopic.get(item.decision.targetTopicId) ?? [];
    entries.push(item);
    byTopic.set(item.decision.targetTopicId, entries);
  }
  for (const [topicId, items] of byTopic) {
    for (let left = 0; left < items.length; left += 1) {
      for (let right = left + 1; right < items.length; right += 1) {
        const a = items[left];
        const b = items[right];
        const similarity = jaccard(a.content.questionEn, b.content.questionEn);
        if (normalize(a.content.questionEn).toLowerCase() === normalize(b.content.questionEn).toLowerCase())
          exactDuplicates.push({ topicId, left: a.itemId, right: b.itemId });
        else if (similarity >= 0.78)
          highSimilarity.push({
            topicId,
            left: a.itemId,
            right: b.itemId,
            similarity: Number(similarity.toFixed(3)),
          });
      }
    }
  }
  const answerItems = scoped.filter((item) => normalize(item.content.answerEn));
  const answerMetrics = answerItems.map((item) => {
    const en = normalize(item.content.answerEn);
    const zh = normalize(item.content.answerZh);
    return {
      itemId: item.itemId,
      batchId: item.provenance.batchId,
      sentences: (en.match(/[.!?](?:\s|$)/gu) ?? []).length,
      paragraphs: en.split(/\n\n/u).length,
      words: en.split(/\s+/u).filter(Boolean).length,
      bilingualParagraphMatch: !zh || en.split(/\n\n/u).length === zh.split(/\n\n/u).length,
      opening: phrase(en, 'start'),
      ending: phrase(en, 'end'),
    };
  });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ruleVersion: work.ruleVersion,
    baselineDigest: work.baselineDigest,
    stage,
    scope,
    counts: {
      items: scoped.length,
      originalItems: scoped.filter((item) => !item.source.isDerived).length,
      highRiskCandidates: scoped.filter((item) => item.riskCandidates.length).length,
      exactQuestionDuplicates: exactDuplicates.length,
      highSimilarityQuestionPairs: highSimilarity.length,
      answerItems: answerItems.length,
    },
    decisions: Object.fromEntries(
      [...ALL_ACTIONS].sort().map((action) => [
        action,
        scoped.filter((item) => item.decision.action === action).length,
      ]),
    ),
    alarms: {
      exactQuestionDuplicates: exactDuplicates,
      highSimilarityQuestionPairs: highSimilarity,
      answerLengthOutliers: answerMetrics.filter(
        (metric) => metric.sentences < 2 || metric.sentences > 10 || metric.words < 18 || metric.words > 220,
      ),
      bilingualParagraphMismatches: answerMetrics.filter((metric) => !metric.bilingualParagraphMatch),
      commonAnswerOpenings: frequency(answerMetrics.map((metric) => metric.opening)),
      commonAnswerEndings: frequency(answerMetrics.map((metric) => metric.ending)),
    },
    note: 'These are machine alarms only. Codex must decide every content or rework outcome.',
  };
  const safeScope = scope.replace(/[^A-Za-z0-9._-]+/gu, '_');
  const path = join(reviewRoot, stage + '.' + safeScope + '.json');
  writeJson(path, report);
  console.log(
    'opi_rebuild_build_review_ok stage=' + stage +
      ' scope=' + scope +
      ' items=' + scoped.length +
      ' exact=' + exactDuplicates.length +
      ' similar=' + highSimilarity.length +
      ' path=' + relative(projectRoot, path),
  );
}

function batchPath(batchId, stage) {
  return join(batchRoot, batchId + '.' + stage + '.json');
}

function batchInputProjection(payload) {
  return {
    schemaVersion: payload.schemaVersion,
    ruleVersion: payload.ruleVersion,
    baselineDigest: payload.baselineDigest,
    batchId: payload.batchId,
    stage: payload.stage,
    topicIds: payload.topicIds,
    items: payload.items.map((item) =>
      payload.stage === 'question-en'
        ? {
            sourceCardId: item.sourceCardId,
            sourceTopicId: item.sourceTopicId,
            sourceTopicName: item.sourceTopicName,
            riskCandidates: item.riskCandidates,
            input: item.input,
          }
        : {
            itemId: item.itemId,
            sourceCardId: item.sourceCardId,
            targetTopicId: item.targetTopicId,
            riskCandidates: item.riskCandidates,
            inputLocks: item.inputLocks,
            input: item.input,
          },
    ),
  };
}

function commandCreateBatch(batchId, stage, topicIds) {
  verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  if (!isValidBatchId(batchId)) fail('create_batch_invalid_batch_id');
  if (!CONTENT_STAGES.includes(stage)) fail('create_batch_unknown_stage:' + stage);
  requireCurrentContentStage(work, stage, 'create_batch');
  const path = batchPath(batchId, stage);
  if (existsSync(path)) fail('batch_file_exists:' + relative(projectRoot, path));
  if (existsSync(join(batchInputManifestRoot, batchId + '.' + stage + '.json')))
    fail('batch_input_manifest_exists:' + batchId + ':' + stage);
  const source = loadSource(snapshotSourceRoot);
  let items;
  let resolvedTopicIds;
  if (stage === 'question-en') {
    if (!topicIds.length) fail('question_en_batch_requires_topic_ids');
    const knownTopicIds = new Set(source.topics.map((topic) => topic.id));
    for (const topicId of topicIds) if (!knownTopicIds.has(topicId)) fail('unknown_topic_id:' + topicId);
    const uniqueTopicIds = [...new Set(topicIds)];
    if (uniqueTopicIds.length !== topicIds.length) fail('duplicate_topic_id');
    const alreadyAssigned = work.items.filter(
      (item) => !item.source.isDerived && uniqueTopicIds.includes(item.source.topicId) && item.provenance.batchId,
    );
    if (alreadyAssigned.length) fail('topic_already_assigned:' + alreadyAssigned[0].source.topicId);
    resolvedTopicIds = uniqueTopicIds;
    items = work.items
      .filter((item) => !item.source.isDerived && resolvedTopicIds.includes(item.source.topicId))
      .sort(
        (left, right) =>
          left.source.topicIndex - right.source.topicIndex ||
          left.source.cardIndex - right.source.cardIndex,
      )
      .map((item) => ({
        sourceCardId: item.source.cardId,
        sourceTopicId: item.source.topicId,
        sourceTopicName: item.source.topicName,
        riskCandidates: item.riskCandidates,
        input: {
          sourceChecksum: item.source.contentChecksum,
          questionEn: item.source.originalContent.questionEn,
        },
        outputs: [
          {
            itemId: item.source.cardId,
            derivationIndex: 0,
            action: null,
            targetCategoryId: item.source.categoryId,
            targetTopicId: item.source.topicId,
            canonicalCardId: item.source.cardId,
            sourceCardIds: [item.source.cardId],
            targetOrder: null,
            reason: '',
            questionEn: '',
            reviewBasis: '',
          },
        ],
      }));
  } else {
    const prerequisite = {
      'question-zh': 'questionEn',
      'answer-en': 'questionZh',
      'answer-zh': 'answerEn',
    }[stage];
    if (work.stageState?.[prerequisite] !== 'locked')
      fail('stage_prerequisite_not_locked:' + prerequisite);
    const active = work.items
      .filter((item) => isActive(item) && item.provenance.batchId === batchId)
      .sort(
        (left, right) =>
          left.source.topicIndex - right.source.topicIndex ||
          left.decision.targetOrder - right.decision.targetOrder,
      );
    if (!active.length) fail('batch_id_not_found_in_work:' + batchId);
    resolvedTopicIds = [...new Set(active.map((item) => item.decision.targetTopicId))];
    const field = STAGE_FIELDS[stage];
    items = active.map((item) => {
      const input =
        stage === 'question-zh'
          ? { questionEn: item.content.questionEn }
          : stage === 'answer-en'
            ? { questionEn: item.content.questionEn, questionZh: item.content.questionZh }
            : {
                answerEn: item.content.answerEn,
                answerDisposition: item.decision.answerDisposition,
              };
      const output =
        stage === 'answer-en'
          ? {
              answerDisposition: null,
              answerEn: null,
              imageDependencyReason: '',
              factSources: [],
              factUncertainty: '',
              reviewBasis: '',
            }
          : { [field]: '', reviewBasis: '' };
      if (stage === 'answer-zh' && item.decision.answerDisposition === 'deferred-image-answer')
        output.answerZh = null;
      return {
        itemId: item.itemId,
        sourceCardId: item.source.cardId,
        targetTopicId: item.decision.targetTopicId,
        riskCandidates: item.riskCandidates,
        inputLocks:
          stage === 'question-zh'
            ? { questionEn: item.locks.questionEn }
            : stage === 'answer-en'
              ? { questionEn: item.locks.questionEn, questionZh: item.locks.questionZh }
              : { answerEn: item.locks.answerEn },
        input,
        output,
      };
    });
  }
  const payload = {
    schemaVersion: 1,
    ruleVersion: work.ruleVersion,
    baselineDigest: work.baselineDigest,
    batchId,
    stage,
    topicIds: resolvedTopicIds,
    producer: {
      producer: null,
      producerContextId: null,
      producedAt: null,
    },
    authorization: {
      reviewMode: FULL_INDEPENDENT_REVIEW,
      reviewedItemIds: [],
      reviewer: null,
      reviewerContextId: null,
      reviewedAt: null,
      reviewReason: '',
      reviewChecks: [],
      lockedBy: null,
      lockedAt: null,
      lockReason: '',
      lockChecks: [],
    },
    items,
  };
  payload.inputHash = valueHash(batchInputProjection(payload));
  writeJson(join(batchInputManifestRoot, batchId + '.' + stage + '.json'), {
    schemaVersion: 1,
    ruleVersion: payload.ruleVersion,
    baselineDigest: payload.baselineDigest,
    batchId,
    stage,
    topicIds: resolvedTopicIds,
    itemIds: items.map((item) => item.sourceCardId ?? item.itemId),
    inputHash: payload.inputHash,
  });
  writeJson(path, payload);
  console.log(
    'opi_rebuild_create_batch_ok batch=' + batchId +
      ' stage=' + stage +
      ' topics=' + resolvedTopicIds.length +
      ' items=' + items.length +
      ' path=' + relative(projectRoot, path),
  );
}

function validateBatchAuthorization(payload) {
  const producer = payload.producer ?? {};
  const authorization = payload.authorization ?? {};
  const reviewMode =
    authorization.reviewMode === undefined
      ? FULL_INDEPENDENT_REVIEW
      : authorization.reviewMode;
  if (!['codex-main', 'codex-subagent', 'codex-script'].includes(producer.producer))
    fail('batch_producer');
  if (!normalize(producer.producerContextId) || !normalize(producer.producedAt))
    fail('batch_producer_record');
  if (![FULL_INDEPENDENT_REVIEW, RISK_STRATIFIED_SAMPLE_REVIEW].includes(reviewMode))
    fail('batch_review_mode');
  if (!TRANSLATION_STAGES.has(payload.stage) && reviewMode !== FULL_INDEPENDENT_REVIEW)
    fail('batch_stage_requires_full_independent_review:' + payload.stage);
  if (
    reviewMode === FULL_INDEPENDENT_REVIEW &&
    authorization.reviewedItemIds !== undefined &&
    (!Array.isArray(authorization.reviewedItemIds) || authorization.reviewedItemIds.length !== 0)
  )
    fail('batch_full_review_reviewed_item_ids');
  if (reviewMode === RISK_STRATIFIED_SAMPLE_REVIEW) {
    if (!isNonEmptyUniqueStringArray(authorization.reviewedItemIds))
      fail('batch_sample_reviewed_item_ids');
    const itemIds = new Set(payload.items.map((item) => item.itemId));
    if (authorization.reviewedItemIds.some((itemId) => !itemIds.has(itemId)))
      fail('batch_sample_unknown_reviewed_item');
    if (
      authorization.reviewedItemIds.length < payload.items.length &&
      authorization.lockedBy !== 'codex-main'
    )
      fail('batch_sample_unreviewed_requires_main_lock');
  }
  if (!['codex-main', 'codex-subagent'].includes(authorization.reviewer))
    fail('batch_reviewer');
  if (!normalize(authorization.reviewerContextId) || !normalize(authorization.reviewedAt))
    fail('batch_reviewer_record');
  if (authorization.reviewerContextId === producer.producerContextId)
    fail('batch_reviewer_not_independent');
  if (!normalize(authorization.reviewReason) || !authorization.reviewChecks?.length)
    fail('batch_review_evidence');
  if (
    authorization.additionalReviewers &&
    (!Array.isArray(authorization.additionalReviewers) ||
      authorization.additionalReviewers.some(
        (reviewer) =>
          !['codex-main', 'codex-subagent'].includes(reviewer.reviewer) ||
          !normalize(reviewer.reviewerContextId) ||
          !normalize(reviewer.reviewedAt) ||
          reviewer.reviewerContextId === producer.producerContextId,
      ))
  )
    fail('batch_additional_reviewers');
  if (!['codex-main', 'codex-subagent'].includes(authorization.lockedBy))
    fail('batch_locked_by');
  if (!normalize(authorization.lockedAt) || !normalize(authorization.lockReason))
    fail('batch_lock_record');
  if (!authorization.lockChecks?.length) fail('batch_lock_checks');
}

function batchReviewRecord(payload, output, field, itemId) {
  const reviewMode =
    payload.authorization.reviewMode === undefined
      ? FULL_INDEPENDENT_REVIEW
      : payload.authorization.reviewMode;
  const independentlyReviewed =
    reviewMode === FULL_INDEPENDENT_REVIEW ||
    payload.authorization.reviewedItemIds.includes(itemId);
  return {
    reviewMode,
    independentlyReviewed,
    lockedBy: payload.authorization.lockedBy,
    lockedAt: payload.authorization.lockedAt,
    reviewer: independentlyReviewed ? payload.authorization.reviewer : null,
    reviewerContextId: independentlyReviewed ? payload.authorization.reviewerContextId : null,
    additionalReviewers: independentlyReviewed
      ? payload.authorization.additionalReviewers ?? []
      : [],
    reason:
      (independentlyReviewed
        ? normalize(payload.authorization.reviewReason)
        : 'Producer inline check; not independently sampled.') +
      ' ' +
      normalize(payload.authorization.lockReason) +
      ' ' +
      normalize(output.reviewBasis),
    checks: [
      ...(independentlyReviewed
        ? payload.authorization.reviewChecks
        : ['producer-inline-check']),
      ...payload.authorization.lockChecks,
      field + (independentlyReviewed ? ':item-review-complete' : ':item-lock-complete'),
    ],
  };
}

function setStageProducer(item, field, payload) {
  item.provenance.stages ??= {};
  item.provenance.stages[field] = {
    producer: payload.producer.producer,
    producerContextId: payload.producer.producerContextId,
    producedAt: payload.producer.producedAt,
  };
}

function verifyBatchSubset(work, batchId, stage) {
  const items = work.items.filter((item) => item.provenance.batchId === batchId);
  if (!items.length) fail('batch_subset_empty:' + batchId);
  const batchWork = { ...work, items };
  const mergeTargetById = new Map();
  for (const item of work.items) {
    if (isActive(item)) {
      mergeTargetById.set(item.decision.canonicalCardId, {
        categoryId: item.decision.targetCategoryId,
        topicId: item.decision.targetTopicId,
        state: 'active',
      });
    } else if (!item.source.isDerived && item.decision.action === null) {
      mergeTargetById.set(item.source.cardId, {
        categoryId: item.source.categoryId,
        topicId: item.source.topicId,
        state: 'pending',
      });
    }
  }
  verifyDecisionAndQuestionEn(batchWork, { partial: true, mergeTargetById });
  if (stage !== 'question-en') verifyQuestionZh(batchWork);
  if (['answer-en', 'answer-zh'].includes(stage)) verifyAnswerEn(batchWork);
  if (stage === 'answer-zh') verifyAnswerZh(batchWork);
  verifyFutureStageIsolation(batchWork, stage);
}

function ingestQuestionEnBatch(work, payload) {
  const source = loadSource(snapshotSourceRoot);
  const topicIds = payload.topicIds;
  if (!Array.isArray(topicIds) || !topicIds.length) fail('batch_topic_ids');
  const provisionalOrderByTopic = new Map();
  for (const item of work.items.filter(isActive)) {
    if (!Number.isInteger(item.decision.targetOrder) || item.decision.targetOrder < 1) continue;
    provisionalOrderByTopic.set(
      item.decision.targetTopicId,
      Math.max(provisionalOrderByTopic.get(item.decision.targetTopicId) ?? 0, item.decision.targetOrder),
    );
  }
  for (const entry of payload.items)
    for (const output of entry.outputs ?? [])
      if (
        ACTIVE_ACTIONS.has(output.action) &&
        Number.isInteger(output.targetOrder) &&
        output.targetOrder > 0
      )
        provisionalOrderByTopic.set(
          output.targetTopicId,
          Math.max(provisionalOrderByTopic.get(output.targetTopicId) ?? 0, output.targetOrder),
        );
  let provisionalOrdersAssigned = 0;
  const resolvedTargetOrder = (output) => {
    if (!ACTIVE_ACTIONS.has(output.action)) return output.targetOrder;
    if (Number.isInteger(output.targetOrder) && output.targetOrder > 0) return output.targetOrder;
    if (output.targetOrder !== null) fail('batch_target_order_invalid:' + output.itemId);
    const nextOrder = (provisionalOrderByTopic.get(output.targetTopicId) ?? 0) + 1;
    provisionalOrderByTopic.set(output.targetTopicId, nextOrder);
    provisionalOrdersAssigned += 1;
    return nextOrder;
  };
  const expectedOriginals = work.items.filter(
    (item) => !item.source.isDerived && topicIds.includes(item.source.topicId),
  );
  const itemBySource = new Map();
  for (const entry of payload.items) {
    if (itemBySource.has(entry.sourceCardId)) fail('batch_duplicate_source:' + entry.sourceCardId);
    itemBySource.set(entry.sourceCardId, entry);
  }
  if (itemBySource.size !== expectedOriginals.length)
    fail('batch_source_coverage:' + itemBySource.size + '/' + expectedOriginals.length);
  const replacements = new Map();
  for (const original of expectedOriginals) {
    const entry = itemBySource.get(original.source.cardId);
    if (!entry) fail('batch_missing_source:' + original.source.cardId);
    if (!Array.isArray(entry.outputs) || !entry.outputs.length)
      fail('batch_outputs_empty:' + original.source.cardId);
    if (
      entry.sourceTopicId !== original.source.topicId ||
      entry.sourceTopicName !== original.source.topicName ||
      valueHash(entry.riskCandidates) !== valueHash(original.riskCandidates) ||
      entry.input?.sourceChecksum !== original.source.contentChecksum ||
      entry.input?.questionEn !== original.source.originalContent.questionEn
    )
      fail('batch_input_mismatch:' + original.source.cardId);
    const outputs = entry.outputs.map((output, index) => {
      if (!normalize(output.reviewBasis)) fail('batch_review_basis:' + original.source.cardId);
      const item = clone(original);
      item.itemId = output.itemId;
      item.source.isDerived = index > 0;
      item.source.derivationIndex = output.derivationIndex;
      item.decision = {
        action: output.action,
        answerDisposition: null,
        targetCategoryId: output.targetCategoryId,
        targetTopicId: output.targetTopicId,
        canonicalCardId: output.canonicalCardId,
        sourceCardIds: output.sourceCardIds,
        targetOrder: resolvedTargetOrder(output),
        reason: normalize(output.reason),
      };
      item.content = {
        questionEn: isActive(item) ? normalize(output.questionEn) : '',
        questionZh: '',
        answerEn: null,
        answerZh: null,
      };
      item.provenance = {
        producer: payload.producer.producer,
        producerContextId: payload.producer.producerContextId,
        batchId: payload.batchId,
        stages: {},
      };
      setStageProducer(item, 'questionEn', payload);
      item.review = {
        decision: 'locked',
        questionEn: isActive(item) ? 'locked' : 'retired',
        questionZh: isActive(item) ? 'pending' : 'retired',
        answerEn: isActive(item) ? 'blocked' : 'retired',
        answerZh: isActive(item) ? 'blocked' : 'retired',
        imageDependencyReason: '',
        factSources: [],
        factUncertainty: '',
      };
      item.reviewRecords = {
        decision: batchReviewRecord(payload, output, 'decision', item.itemId),
      };
      item.locks = {};
      item.locks.decision = expectedDecisionLock(item);
      if (isActive(item)) {
        item.reviewRecords.questionEn = batchReviewRecord(
          payload,
          output,
          'questionEn',
          item.itemId,
        );
        item.locks.questionEn = expectedContentLock(item, 'question-en');
      }
      return item;
    });
    replacements.set(original.source.cardId, outputs);
  }
  const nextItems = [];
  for (const item of work.items) {
    if (item.source.isDerived && replacements.has(item.source.cardId)) continue;
    if (!item.source.isDerived && replacements.has(item.source.cardId)) {
      nextItems.push(...replacements.get(item.source.cardId));
    } else {
      nextItems.push(item);
    }
  }
  work.items = nextItems;
  const targetTopicIds = new Set(source.topics.map((topic) => topic.id));
  for (const item of work.items.filter((entry) => entry.provenance.batchId === payload.batchId)) {
    if (!targetTopicIds.has(item.decision.targetTopicId) && isActive(item))
      fail('batch_unknown_target_topic:' + item.itemId);
  }
  return provisionalOrdersAssigned;
}

function ingestLaterStageBatch(work, payload) {
  const stage = payload.stage;
  const field = STAGE_FIELDS[stage];
  const expected = work.items.filter(
    (item) => isActive(item) && item.provenance.batchId === payload.batchId,
  );
  const byItemId = new Map();
  for (const entry of payload.items) {
    if (byItemId.has(entry.itemId)) fail('batch_duplicate_item:' + entry.itemId);
    byItemId.set(entry.itemId, entry);
  }
  if (byItemId.size !== expected.length)
    fail('batch_item_coverage:' + byItemId.size + '/' + expected.length);
  for (const item of expected) {
    const entry = byItemId.get(item.itemId);
    if (!entry) fail('batch_missing_item:' + item.itemId);
    const output = entry.output ?? {};
    if (!normalize(output.reviewBasis)) fail('batch_review_basis:' + item.itemId);
    const expectedInput =
      stage === 'question-zh'
        ? {
            locks: { questionEn: item.locks.questionEn },
            input: { questionEn: item.content.questionEn },
          }
        : stage === 'answer-en'
          ? {
              locks: { questionEn: item.locks.questionEn, questionZh: item.locks.questionZh },
              input: { questionEn: item.content.questionEn, questionZh: item.content.questionZh },
            }
          : {
              locks: { answerEn: item.locks.answerEn },
              input: {
                answerEn: item.content.answerEn,
                answerDisposition: item.decision.answerDisposition,
              },
            };
    if (
      entry.sourceCardId !== item.source.cardId ||
      entry.targetTopicId !== item.decision.targetTopicId ||
      valueHash(entry.riskCandidates) !== valueHash(item.riskCandidates) ||
      valueHash(entry.inputLocks) !== valueHash(expectedInput.locks) ||
      valueHash(entry.input) !== valueHash(expectedInput.input)
    )
      fail('batch_input_mismatch:' + item.itemId);
    setStageProducer(item, field, payload);
    item.reviewRecords[field] = batchReviewRecord(payload, output, field, item.itemId);
    if (stage === 'question-zh') {
      item.content.questionZh = normalize(output.questionZh);
      item.review.questionZh = 'locked';
      item.review.answerEn = 'pending';
      item.locks.questionZh = expectedContentLock(item, stage);
    } else if (stage === 'answer-en') {
      item.decision.answerDisposition = output.answerDisposition;
      item.review.imageDependencyReason = normalize(output.imageDependencyReason);
      item.review.factSources = Array.isArray(output.factSources) ? output.factSources : [];
      item.review.factUncertainty = normalize(output.factUncertainty);
      item.content.answerEn =
        output.answerDisposition === 'deferred-image-answer' ? null : normalize(output.answerEn);
      item.review.answerEn =
        output.answerDisposition === 'deferred-image-answer' ? 'deferred-image-answer' : 'locked';
      item.review.answerZh =
        output.answerDisposition === 'deferred-image-answer' ? 'deferred-image-answer' : 'pending';
      item.locks.answerEn = expectedContentLock(item, stage);
    } else {
      item.content.answerZh =
        item.decision.answerDisposition === 'deferred-image-answer' ? null : normalize(output.answerZh);
      item.review.answerZh =
        item.decision.answerDisposition === 'deferred-image-answer'
          ? 'deferred-image-answer'
          : 'locked';
      item.locks.answerZh = expectedContentLock(item, stage);
    }
  }
}

function commandIngestReviewedBatch(pathArg) {
  verifySourceAgainstBaseline();
  const path = resolve(projectRoot, pathArg ?? '');
  if (!pathArg || !existsSync(path)) fail('reviewed_batch_file_missing');
  const payload = readJson(path);
  const work = loadWork();
  verifyWorkOrigins(work);
  if (!CONTENT_STAGES.includes(payload.stage)) fail('batch_stage');
  requireCurrentContentStage(work, payload.stage, 'ingest_reviewed_batch');
  if (
    payload.schemaVersion !== 1 ||
    payload.ruleVersion !== work.ruleVersion ||
    payload.baselineDigest !== work.baselineDigest
  )
    fail('batch_header');
  if (!isValidBatchId(payload.batchId)) fail('batch_invalid_batch_id');
  if (payload.inputHash !== valueHash(batchInputProjection(payload)))
    fail('batch_input_hash');
  const inputManifestPath = join(
    batchInputManifestRoot,
    payload.batchId + '.' + payload.stage + '.json',
  );
  if (!existsSync(inputManifestPath)) fail('batch_input_manifest_missing');
  const inputManifest = readJson(inputManifestPath);
  if (
    inputManifest.ruleVersion !== payload.ruleVersion ||
    inputManifest.baselineDigest !== payload.baselineDigest ||
    inputManifest.batchId !== payload.batchId ||
    inputManifest.stage !== payload.stage ||
    valueHash(inputManifest.topicIds) !== valueHash(payload.topicIds) ||
    valueHash(inputManifest.itemIds) !==
      valueHash(payload.items.map((item) => item.sourceCardId ?? item.itemId)) ||
    inputManifest.inputHash !== payload.inputHash
  )
    fail('batch_input_manifest_mismatch');
  if (path !== batchPath(payload.batchId, payload.stage))
    fail('batch_path_contract:' + relative(projectRoot, batchPath(payload.batchId, payload.stage)));
  if (existsSync(join(batchManifestRoot, payload.batchId + '.' + payload.stage + '.json')))
    fail('sealed_batch_cannot_be_ingested');
  validateBatchAuthorization(payload);
  const nextWork = clone(work);
  const provisionalOrdersAssigned =
    payload.stage === 'question-en' ? ingestQuestionEnBatch(nextWork, payload) : 0;
  if (payload.stage !== 'question-en') ingestLaterStageBatch(nextWork, payload);
  verifyWorkOrigins(nextWork);
  verifyBatchSubset(nextWork, payload.batchId, payload.stage);
  writeJson(workItemsPath, nextWork);
  console.log(
    'opi_rebuild_ingest_reviewed_batch_ok batch=' + payload.batchId +
      ' stage=' + payload.stage +
      ' items=' + payload.items.length +
      ' provisional_orders=' + provisionalOrdersAssigned,
  );
}

function commandCloseStage(stage, authorizationPathArg) {
  if (!CONTENT_STAGES.includes(stage)) fail('close_stage_unknown_stage:' + stage);
  verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  requireCurrentContentStage(work, stage, 'close_stage');
  const authorizationPath = resolve(projectRoot, authorizationPathArg ?? '');
  if (!authorizationPathArg || !existsSync(authorizationPath))
    fail('close_stage_authorization_missing');
  const authorization = readJson(authorizationPath);
  if (!['codex-main', 'codex-subagent'].includes(authorization.lockedBy))
    fail('close_stage_locked_by');
  if (
    !normalize(authorization.lockedAt) ||
    !normalize(authorization.reason) ||
    !Array.isArray(authorization.checks) ||
    !authorization.checks.length
  )
    fail('close_stage_authorization_record');
  verifyDecisionAndQuestionEn(work);
  if (stage !== 'question-en') verifyQuestionZh(work);
  if (['answer-en', 'answer-zh'].includes(stage)) verifyAnswerEn(work);
  if (stage === 'answer-zh') verifyAnswerZh(work);
  verifyFutureStageIsolation(work, stage);
  verifyRequiredSeals(work, stage);
  const state = {
    'question-en': {
      questionEn: 'locked',
      questionZh: 'pending',
      answerEn: 'blocked',
      answerZh: 'blocked',
      finalReview: 'blocked',
    },
    'question-zh': {
      questionEn: 'locked',
      questionZh: 'locked',
      answerEn: 'pending',
      answerZh: 'blocked',
      finalReview: 'blocked',
    },
    'answer-en': {
      questionEn: 'locked',
      questionZh: 'locked',
      answerEn: 'locked',
      answerZh: 'pending',
      finalReview: 'blocked',
    },
    'answer-zh': {
      questionEn: 'locked',
      questionZh: 'locked',
      answerEn: 'locked',
      answerZh: 'locked',
      finalReview: 'pending',
    },
  }[stage];
  work.stageState = { baseline: 'locked', ...state };
  work.stageClosures ??= {};
  work.stageClosures[stage] = {
    ...authorization,
    lock: null,
  };
  work.stageClosures[stage].lock = expectedStageClosureLock(
    work,
    stage,
    work.stageClosures[stage],
  );
  writeJson(workItemsPath, work);
  commandVerifyStage(stage, true);
  console.log('opi_rebuild_close_stage_ok stage=' + stage + ' batches=' + new Set(work.items.map((item) => item.provenance.batchId)).size);
}

function commandLockFinalReview(authorizationPathArg) {
  verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  const lifecycle = contentStageLifecycle(work);
  if (lifecycle.currentStage !== null || lifecycle.completedStages.length !== CONTENT_STAGES.length)
    fail('final_review_content_stages_not_locked');
  if (work.stageState?.finalReview !== 'pending')
    fail('final_review_not_pending:' + work.stageState?.finalReview);
  const authorizationPath = resolve(projectRoot, authorizationPathArg ?? '');
  if (!authorizationPathArg || !existsSync(authorizationPath))
    fail('final_review_authorization_missing');
  const authorization = readJson(authorizationPath);
  if (authorization.lockedBy !== 'codex-main') fail('final_review_locked_by');
  if (
    !normalize(authorization.lockedAt) ||
    !normalize(authorization.reason) ||
    !Array.isArray(authorization.checks) ||
    !authorization.checks.length
  )
    fail('final_review_authorization_record');
  verifyDecisionAndQuestionEn(work);
  verifyQuestionZh(work);
  verifyAnswerEn(work);
  verifyAnswerZh(work);
  const batchIds = [
    ...new Set(work.items.map((item) => item.provenance.batchId).filter(Boolean)),
  ].sort();
  for (const stage of CONTENT_STAGES) {
    const closure = work.stageClosures?.[stage];
    if (!closure || closure.lock !== expectedStageClosureLock(work, stage, closure))
      fail('stage_closure_invalid:' + stage);
    for (const batchId of batchIds) {
      const sealPath = join(batchManifestRoot, batchId + '.' + stage + '.json');
      if (!existsSync(sealPath)) fail('batch_seal_missing:' + batchId + ':' + stage);
      const seal = readJson(sealPath);
      if (
        seal.payload?.batchId !== batchId ||
        seal.payload?.stage !== stage ||
        seal.manifestHash !== valueHash(seal.payload)
      )
        fail('batch_seal_stored_payload_invalid:' + batchId + ':' + stage);
    }
  }
  verifyRequiredSeals(work, 'answer-zh');
  work.finalReview = {
    status: 'locked',
    lockedBy: authorization.lockedBy,
    lockedAt: authorization.lockedAt,
    reason: normalize(authorization.reason),
    checks: authorization.checks,
    lock: null,
  };
  work.finalReview.lock = expectedFinalReviewLock(work, work.finalReview);
  work.stageState.finalReview = 'locked';
  writeJson(workItemsPath, work);
  requireFinalReview(work);
  console.log('opi_rebuild_lock_final_review_ok items=' + work.items.length);
}

function commandFinalizeQuestionEnOrder(authorizationPathArg) {
  const authorizationPath = resolve(projectRoot, authorizationPathArg ?? '');
  if (!authorizationPathArg || !existsSync(authorizationPath))
    fail('finalize_order_authorization_missing');
  const authorization = readJson(authorizationPath);
  if (authorization.lockedBy !== 'codex-main') fail('finalize_order_locked_by');
  if (
    !normalize(authorization.lockedAt) ||
    !normalize(authorization.reason) ||
    !Array.isArray(authorization.checks) ||
    !authorization.checks.length
  )
    fail('finalize_order_authorization_record');
  if (
    authorization.topicOrderOverrides !== undefined &&
    (authorization.topicOrderOverrides === null ||
      Array.isArray(authorization.topicOrderOverrides) ||
      typeof authorization.topicOrderOverrides !== 'object')
  )
    fail('finalize_order_overrides');

  verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  if (work.stageState?.questionEn !== 'pending' || work.stageClosures?.['question-en'])
    fail('finalize_order_requires_pending_question_en');
  verifyDecisionAndQuestionEn(work, { partial: true });
  verifyRequiredSeals(work, 'question-en');

  const activeByTopic = new Map();
  for (const item of work.items.filter(isActive)) {
    const entries = activeByTopic.get(item.decision.targetTopicId) ?? [];
    entries.push(item);
    activeByTopic.set(item.decision.targetTopicId, entries);
  }
  const topicSequences = {};
  for (const [topicId, items] of activeByTopic) {
    const sourceGroups = new Map();
    for (const item of items) {
      const entries = sourceGroups.get(item.source.cardId) ?? [];
      entries.push(item);
      sourceGroups.set(item.source.cardId, entries);
    }
    const orderedGroups = [...sourceGroups.values()].sort((left, right) => {
      const leftOrder = Math.min(...left.map((item) => item.decision.targetOrder));
      const rightOrder = Math.min(...right.map((item) => item.decision.targetOrder));
      const leftSource = left[0].source;
      const rightSource = right[0].source;
      return (
        leftOrder - rightOrder ||
        leftSource.topicIndex - rightSource.topicIndex ||
        leftSource.cardIndex - rightSource.cardIndex ||
        leftSource.cardId.localeCompare(rightSource.cardId)
      );
    });
    let ordered = orderedGroups.flatMap((group) =>
      [...group].sort(
        (left, right) =>
          left.source.derivationIndex - right.source.derivationIndex ||
          left.itemId.localeCompare(right.itemId),
      ),
    );
    const override = authorization.topicOrderOverrides?.[topicId];
    if (override !== undefined) {
      if (!Array.isArray(override) || override.some((itemId) => !normalize(itemId)))
        fail('finalize_order_override_format:' + topicId);
      const expected = items.map((item) => item.itemId).sort();
      const supplied = [...override].sort();
      if (valueHash(expected) !== valueHash(supplied))
        fail('finalize_order_override_membership:' + topicId);
      const itemById = new Map(items.map((item) => [item.itemId, item]));
      ordered = override.map((itemId) => itemById.get(itemId));
    }
    topicSequences[topicId] = ordered.map((item) => item.itemId);
  }
  for (const topicId of Object.keys(authorization.topicOrderOverrides ?? {}))
    if (!activeByTopic.has(topicId)) fail('finalize_order_override_topic:' + topicId);

  const beforeHash = valueHash(
    work.items.map((item) => ({ itemId: item.itemId, targetOrder: item.decision.targetOrder })),
  );
  let changedItems = 0;
  for (const [topicId, itemIds] of Object.entries(topicSequences)) {
    const itemById = new Map(
      activeByTopic.get(topicId).map((item) => [item.itemId, item]),
    );
    for (const [index, itemId] of itemIds.entries()) {
      const item = itemById.get(itemId);
      if (item.decision.targetOrder !== index + 1) changedItems += 1;
      item.decision.targetOrder = index + 1;
    }
  }
  const afterHash = valueHash(
    work.items.map((item) => ({ itemId: item.itemId, targetOrder: item.decision.targetOrder })),
  );
  verifyDecisionAndQuestionEn(work);
  writeJson(workItemsPath, work);
  writeJson(join(reviewRoot, 'question-en.order-finalization.json'), {
    schemaVersion: 1,
    stage: 'question-en',
    authorization: {
      lockedBy: authorization.lockedBy,
      lockedAt: authorization.lockedAt,
      reason: authorization.reason,
      checks: authorization.checks,
    },
    beforeHash,
    afterHash,
    changedItems,
    topicCount: activeByTopic.size,
    activeItemCount: work.items.filter(isActive).length,
    topicSequences,
  });
  console.log(
    'opi_rebuild_finalize_question_en_order_ok topics=' + activeByTopic.size +
      ' active=' + work.items.filter(isActive).length +
      ' changed=' + changedItems +
      ' hash=' + afterHash,
  );
}

function taskTitleFor(topic, index) {
  const first = topic.cards.find((card) => card.kind !== 'image')?.taskTitle;
  const match = String(first ?? '').match(/^(.*?)(\d+)$/u);
  if (!match) return String(first ?? topic.name) + '-' + String(index).padStart(2, '0');
  return match[1] + String(index).padStart(match[2].length, '0');
}

function finalCardFromItem(item, topic, index) {
  const card = clone(item.source.originalCard);
  card.id = item.decision.canonicalCardId;
  card.taskTitle = taskTitleFor(topic, index);
  card.audioText = normalize(item.content.questionEn);
  card.audioTextZh = normalize(item.content.questionZh);
  if (item.decision.answerDisposition === 'deferred-image-answer') {
    delete card.referenceText;
    delete card.referenceTextZh;
  } else {
    card.referenceText = normalize(item.content.answerEn);
    card.referenceTextZh = normalize(item.content.answerZh);
  }
  delete card.audio;
  delete card.audioDurationSeconds;
  return card;
}

function buildFinalSource(work) {
  const source = loadSource(snapshotSourceRoot);
  const activeByTopic = new Map();
  for (const item of work.items.filter(isActive)) {
    const entries = activeByTopic.get(item.decision.targetTopicId) ?? [];
    entries.push(item);
    activeByTopic.set(item.decision.targetTopicId, entries);
  }
  const topics = source.topics.map((topic) => {
    const images = topic.cards.filter((card) => card.kind === 'image').map(clone);
    const active = (activeByTopic.get(topic.id) ?? []).sort(
      (left, right) => left.decision.targetOrder - right.decision.targetOrder,
    );
    const cards = [
      ...images,
      ...active.map((item, index) => finalCardFromItem(item, topic, index + 1)),
    ];
    return { ...topic, declaredCardCount: cards.length, cards };
  });
  const categories = source.categories.map((category) => {
    const categoryTopics = topics.filter((topic) => topic.categoryId === category.id);
    return {
      ...category,
      declaredTopicCount: categoryTopics.length,
      declaredCardCount: categoryTopics.reduce((sum, topic) => sum + topic.cards.length, 0),
    };
  });
  const cardCount = topics.reduce((sum, topic) => sum + topic.cards.length, 0);
  const bank = {
    ...source.bank,
    summary: topics.length + ' 话题 / ' + cardCount + ' 卡',
    declaredTopicCount: topics.length,
    declaredCardCount: cardCount,
  };
  return { bank, categories, topics };
}

function questionEnPreviewCardFromItem(item, topic, index) {
  const card = clone(item.source.originalCard);
  card.id = item.decision.canonicalCardId;
  card.taskTitle = taskTitleFor(topic, index);
  card.audioText = normalize(item.content.questionEn);
  delete card.audioTextZh;
  delete card.referenceText;
  delete card.referenceTextZh;
  delete card.audio;
  delete card.audioDurationSeconds;
  return card;
}

function buildQuestionEnPreviewSource(work) {
  const source = loadSource(snapshotSourceRoot);
  const activeByTopic = new Map();
  for (const item of work.items.filter(isActive)) {
    const entries = activeByTopic.get(item.decision.targetTopicId) ?? [];
    entries.push(item);
    activeByTopic.set(item.decision.targetTopicId, entries);
  }
  const topics = source.topics.map((topic) => {
    const images = topic.cards.filter((card) => card.kind === 'image').map(clone);
    const active = (activeByTopic.get(topic.id) ?? []).sort(
      (left, right) => left.decision.targetOrder - right.decision.targetOrder,
    );
    const cards = [
      ...images,
      ...active.map((item, index) => questionEnPreviewCardFromItem(item, topic, index + 1)),
    ];
    return { ...topic, declaredCardCount: cards.length, cards };
  });
  const categories = source.categories.map((category) => {
    const categoryTopics = topics.filter((topic) => topic.categoryId === category.id);
    return {
      ...category,
      declaredTopicCount: categoryTopics.length,
      declaredCardCount: categoryTopics.reduce((sum, topic) => sum + topic.cards.length, 0),
    };
  });
  const cardCount = topics.reduce((sum, topic) => sum + topic.cards.length, 0);
  const bank = {
    ...source.bank,
    description: '阶段 1 英文问题真机验收；中文问题和参考答案暂未发布',
    summary: topics.length + ' 话题 / ' + cardCount + ' 卡',
    statusLabel: '英文问题验收版',
    declaredTopicCount: topics.length,
    declaredCardCount: cardCount,
    study: {
      ...source.bank.study,
      copy: {
        ...source.bank.study.copy,
        transcriptLabel: '英文问题',
      },
    },
  };
  return { bank, categories, topics };
}

function runtimeDatasetFromSource(source) {
  const categoryById = new Map(source.categories.map((category) => [category.id, category]));
  const topicById = new Map(source.topics.map((topic) => [topic.id, topic]));
  const { categoryIds, ...bank } = source.bank;
  return {
    ...bank,
    categories: categoryIds.map((categoryId) => {
      const category = categoryById.get(categoryId);
      if (!category) fail('preview_category_missing:' + categoryId);
      const { topicIds, ...runtimeCategory } = category;
      return {
        ...runtimeCategory,
        topics: topicIds.map((topicId) => {
          const topic = topicById.get(topicId);
          if (!topic || topic.categoryId !== categoryId)
            fail('preview_topic_missing_or_mismatched:' + topicId);
          const { categoryId: _categoryId, ...runtimeTopic } = topic;
          return runtimeTopic;
        }),
      };
    }),
  };
}

function verifyQuestionEnPreviewDataset(dataset, work) {
  const errors = [];
  const rows = dataset.categories.flatMap((category) =>
    category.topics.flatMap((topic) => topic.cards.map((card) => ({ category, topic, card }))),
  );
  const textRows = rows.filter(({ card }) => card.kind !== 'image');
  const imageRows = rows.filter(({ card }) => card.kind === 'image');
  if (dataset.id !== 'opi') errors.push('preview:bank_id');
  if (dataset.declaredTopicCount !== 144) errors.push('preview:topic_count');
  if (dataset.declaredCardCount !== rows.length) errors.push('preview:card_count');
  if (textRows.length !== work.items.filter(isActive).length) errors.push('preview:text_count');
  if (imageRows.length !== work.sourceCounts.imageCards) errors.push('preview:image_count');
  if (new Set(rows.map(({ card }) => card.id)).size !== rows.length)
    errors.push('preview:duplicate_card_ids');
  const cardById = new Map(textRows.map(({ topic, card }) => [card.id, { topic, card }]));
  for (const item of work.items.filter(isActive)) {
    const published = cardById.get(item.decision.canonicalCardId);
    if (!published) {
      errors.push(item.itemId + ':preview_missing');
      continue;
    }
    if (published.topic.id !== item.decision.targetTopicId)
      errors.push(item.itemId + ':preview_topic');
    if (published.card.audioText !== normalize(item.content.questionEn))
      errors.push(item.itemId + ':preview_question_en');
    for (const field of ['audioTextZh', 'referenceText', 'referenceTextZh', 'audio'])
      if (field in published.card) errors.push(item.itemId + ':preview_unfinished_or_old_field:' + field);
  }
  for (const category of dataset.categories) {
    if (category.topics.length !== category.declaredTopicCount)
      errors.push(category.id + ':preview_declared_topic_count');
    const categoryCards = category.topics.reduce((sum, topic) => sum + topic.cards.length, 0);
    if (categoryCards !== category.declaredCardCount)
      errors.push(category.id + ':preview_declared_card_count');
    for (const topic of category.topics) {
      if (topic.cards.length !== topic.declaredCardCount)
        errors.push(topic.id + ':preview_declared_card_count');
    }
  }
  if (errors.length) fail('question_en_preview_invalid\n' + errors.join('\n'));
  return { cards: rows.length, textCards: textRows.length, imageCards: imageRows.length };
}

function commandBuildQuestionEnPreview(releaseVersionArg, releasedAtArg) {
  verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  verifyDecisionAndQuestionEn(work);
  verifyFutureStageIsolation(work, 'question-en');
  verifyRequiredSeals(work, 'question-en');
  if (work.stageState?.questionEn !== 'locked' || !work.stageClosures?.['question-en']?.lock)
    fail('question_en_preview_requires_locked_stage');
  const releaseVersion = Number(releaseVersionArg);
  if (!Number.isInteger(releaseVersion) || releaseVersion < 1)
    fail('question_en_preview_release_version');
  const releasedAt = normalize(releasedAtArg);
  if (!releasedAt || Number.isNaN(Date.parse(releasedAt)))
    fail('question_en_preview_released_at');

  const source = buildQuestionEnPreviewSource(work);
  const dataset = runtimeDatasetFromSource(source);
  const counts = verifyQuestionEnPreviewDataset(dataset, work);
  const stageLockArtifact = {
    schemaVersion: 1,
    stage: 'question-en',
    baselineDigest: work.baselineDigest,
    stageClosureLock: work.stageClosures['question-en'].lock,
    counts: {
      sourceCards: work.items.filter((item) => !item.source.isDerived).length,
      workItems: work.items.length,
      activeCards: work.items.filter(isActive).length,
      retiredWorkItems: work.items.filter((item) => !isActive(item)).length,
    },
    activeCards: work.items.filter(isActive).map((item) => ({
      cardId: item.decision.canonicalCardId,
      sourceCardIds: item.decision.sourceCardIds,
      targetCategoryId: item.decision.targetCategoryId,
      targetTopicId: item.decision.targetTopicId,
      targetOrder: item.decision.targetOrder,
      questionEn: item.content.questionEn,
      questionEnLock: item.locks.questionEn,
      batchId: item.provenance.batchId,
    })),
    retiredCards: work.items.filter((item) => !isActive(item)).map((item) => ({
      sourceCardId: item.source.cardId,
      sourceTopicId: item.source.topicId,
      action: item.decision.action,
      canonicalCardId: item.decision.canonicalCardId,
      targetTopicId: item.decision.targetTopicId,
      decisionLock: item.locks.decision,
      batchId: item.provenance.batchId,
    })),
  };
  writeJson(join(artifactRoot, 'question-en-stage1-lock.json'), stageLockArtifact);
  const stageLockArtifactHash = fileHash(join(artifactRoot, 'question-en-stage1-lock.json'));

  rmSync(questionEnPreviewReleaseRoot, { recursive: true, force: true });
  const bankPath = join(questionEnPreviewReleaseRoot, 'banks/opi.json');
  const resourcePath = join(questionEnPreviewReleaseRoot, 'resources/manifest.json');
  writeJson(bankPath, dataset);
  const resourceVersion = readJson(
    join(projectRoot, 'content/question-banks/resources/manifest.source.json'),
  ).version;
  writeJson(resourcePath, { schemaVersion: 1, version: resourceVersion, files: [] });
  const bankChecksum = fileHash(bankPath);
  const resourceChecksum = fileHash(resourcePath);
  const manifest = {
    schemaVersion: 1,
    releaseVersion,
    releasedAt,
    banks: [
      {
        id: 'opi',
        version: releaseVersion,
        file: 'banks/opi.json',
        checksum: bankChecksum,
        categories: dataset.categories.length,
        topics: dataset.declaredTopicCount,
        cards: dataset.declaredCardCount,
      },
    ],
    resources: {
      version: resourceVersion,
      file: 'resources/manifest.json',
      checksum: resourceChecksum,
      files: 0,
      sizeBytes: 0,
    },
  };
  writeJson(join(questionEnPreviewReleaseRoot, 'manifest.json'), manifest);
  writeJson(join(questionEnPreviewReleaseRoot, 'change-report.json'), {
    schemaVersion: 1,
    releaseKind: 'question-en-stage1-preview',
    releaseVersion,
    baselineVersion: 2,
    bankId: 'opi',
    counts,
    unfinishedFields: ['audioTextZh', 'referenceText', 'referenceTextZh'],
    oldQuestionAudioMappingsRemoved: true,
    stageLockArtifactHash,
  });
  writeJson(join(artifactRoot, 'question-en-preview-release.json'), {
    schemaVersion: 1,
    releaseKind: 'question-en-stage1-preview',
    releaseVersion,
    releasedAt,
    baselineDigest: work.baselineDigest,
    stageClosureLock: work.stageClosures['question-en'].lock,
    stageLockArtifact: 'question-en-stage1-lock.json',
    stageLockArtifactHash,
    bankChecksum,
    releaseManifestChecksum: fileHash(join(questionEnPreviewReleaseRoot, 'manifest.json')),
    counts,
    fields: {
      questionEn: 'locked-and-published',
      questionZh: 'empty',
      answerEn: 'empty',
      answerZh: 'empty',
    },
    rollback: {
      previousOnlineOpiVersion: 2,
      action: 'reactivate-opi-v2-and-deactivate-preview-release',
    },
  });
  console.log(
    'opi_rebuild_build_question_en_preview_ok version=' + releaseVersion +
      ' cards=' + counts.cards +
      ' text=' + counts.textCards +
      ' image=' + counts.imageCards +
      ' checksum=' + bankChecksum,
  );
}

function writeSource(root, finalSource) {
  writeJson(join(root, 'bank.json'), finalSource.bank);
  for (const category of finalSource.categories)
    writeJson(join(root, 'categories', category.id + '.json'), category);
  for (const topic of finalSource.topics) writeJson(join(root, 'topics', topic.id + '.json'), topic);
}

function verifyFinalSource(finalSource, work) {
  const errors = [];
  const rows = finalSource.topics.flatMap((topic) =>
    topic.cards.map((card) => ({ topic, card })),
  );
  const ids = rows.map(({ card }) => card.id);
  if (new Set(ids).size !== ids.length) errors.push('final:duplicate_card_ids');
  if (finalSource.bank.declaredTopicCount !== finalSource.topics.length)
    errors.push('final:bank_topic_count');
  if (finalSource.bank.declaredCardCount !== rows.length) errors.push('final:bank_card_count');
  const snapshot = loadSource(snapshotSourceRoot);
  if (valueHash(finalSource.bank.categoryIds) !== valueHash(snapshot.bank.categoryIds))
    errors.push('final:bank_category_ids');
  for (const category of finalSource.categories) {
    const categoryTopics = finalSource.topics.filter((topic) => topic.categoryId === category.id);
    if (category.declaredTopicCount !== categoryTopics.length)
      errors.push(category.id + ':declared_topic_count');
    if (
      category.declaredCardCount !==
      categoryTopics.reduce((sum, topic) => sum + topic.cards.length, 0)
    )
      errors.push(category.id + ':declared_card_count');
    if (valueHash(category.topicIds) !== valueHash(categoryTopics.map((topic) => topic.id)))
      errors.push(category.id + ':topic_ids');
  }
  for (const topic of finalSource.topics) {
    if (!finalSource.categories.some((category) => category.id === topic.categoryId))
      errors.push(topic.id + ':unknown_category');
  }
  const expectedIds = new Set([
    ...work.items.filter(isActive).map((item) => item.decision.canonicalCardId),
    ...snapshot.rows.filter(({ card }) => card.kind === 'image').map(({ card }) => card.id),
  ]);
  const actualIds = new Set(ids);
  for (const id of expectedIds) if (!actualIds.has(id)) errors.push(id + ':final_set_missing');
  for (const id of actualIds) if (!expectedIds.has(id)) errors.push(id + ':final_set_extra');
  for (const topic of finalSource.topics) {
    if (topic.declaredCardCount !== topic.cards.length) errors.push(topic.id + ':declared_card_count');
    const textCards = topic.cards.filter((card) => card.kind !== 'image');
    for (const [index, card] of textCards.entries()) {
      if (card.taskTitle !== taskTitleFor(topic, index + 1))
        errors.push(card.id + ':task_title_sequence');
    }
  }
  const cardById = new Map(rows.map(({ card, topic }) => [card.id, { card, topic }]));
  for (const item of work.items.filter(isActive)) {
    const formal = cardById.get(item.decision.canonicalCardId);
    if (!formal) {
      errors.push(item.itemId + ':final_card_missing');
      continue;
    }
    if (formal.topic.id !== item.decision.targetTopicId) errors.push(item.itemId + ':final_topic');
    if (
      formal.card.audioText !== normalize(item.content.questionEn) ||
      formal.card.audioTextZh !== normalize(item.content.questionZh)
    )
      errors.push(item.itemId + ':final_question');
    if (item.decision.answerDisposition === 'complete') {
      if (
        formal.card.referenceText !== normalize(item.content.answerEn) ||
        formal.card.referenceTextZh !== normalize(item.content.answerZh)
      )
        errors.push(item.itemId + ':final_answer');
    } else if ('referenceText' in formal.card || 'referenceTextZh' in formal.card) {
      errors.push(item.itemId + ':final_deferred_answer_present');
    }
  }
  for (const topic of snapshot.topics) {
    const before = topic.cards.filter((card) => card.kind === 'image');
    const after = finalSource.topics.find((entry) => entry.id === topic.id)?.cards.filter(
      (card) => card.kind === 'image',
    );
    if (valueHash(before) !== valueHash(after)) errors.push(topic.id + ':image_cards_changed');
  }
  if (errors.length) fail('final_source_invalid\n' + errors.join('\n'));
}

function expectedFinalReviewLock(work, finalReview) {
  return valueHash({
    stage: 'final-review',
    authorization: {
      lockedBy: finalReview.lockedBy,
      lockedAt: finalReview.lockedAt,
      reason: normalize(finalReview.reason),
      checks: finalReview.checks,
    },
    stageClosures: CONTENT_STAGES.map((stage) => ({
      stage,
      lock: work.stageClosures?.[stage]?.lock ?? null,
    })),
    itemLocks: work.items.map((item) => ({
      itemId: item.itemId,
      decision: item.locks.decision,
      questionEn: item.locks.questionEn ?? null,
      questionZh: item.locks.questionZh ?? null,
      answerEn: item.locks.answerEn ?? null,
      answerZh: item.locks.answerZh ?? null,
    })),
  });
}

function requireFinalReview(work) {
  const finalReview = work.finalReview;
  if (finalReview?.status !== 'locked') fail('final_review_not_locked');
  if (!['codex-main', 'codex-subagent'].includes(finalReview.lockedBy))
    fail('final_review_locked_by');
  if (
    !normalize(finalReview.lockedAt) ||
    !normalize(finalReview.reason) ||
    !Array.isArray(finalReview.checks) ||
    !finalReview.checks.length
  )
    fail('final_review_record');
  const expected = expectedFinalReviewLock(work, finalReview);
  if (finalReview.lock !== expected) fail('final_review_lock');
}

function readJsonFiles(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson(join(root, name)));
}

function writeArtifacts(outputRoot, work, finalSource, releaseVersion, releasedAt) {
  const active = work.items.filter(isActive);
  const finalIds = new Set(active.map((item) => item.decision.canonicalCardId));
  const originalItems = work.items.filter((item) => !item.source.isDerived);
  const finalDecisions = work.items.map((item) => ({
    itemId: item.itemId,
    sourceCardId: item.source.cardId,
    sourceTopicId: item.source.topicId,
    targetTopicId: item.decision.targetTopicId,
    canonicalCardId: item.decision.canonicalCardId,
    targetOrder: item.decision.targetOrder,
    action: item.decision.action,
    reason: item.decision.reason,
    answerDisposition: item.decision.answerDisposition,
    imageDependencyReason: item.review.imageDependencyReason,
    riskCandidates: item.riskCandidates,
    locks: item.locks,
  }));
  const mappings = originalItems.map((original) => {
    const related = work.items.filter((item) => item.source.cardId === original.source.cardId);
    const targets = related
      .filter((item) => isActive(item) && finalIds.has(item.decision.canonicalCardId))
      .sort((left, right) => left.source.derivationIndex - right.source.derivationIndex)
      .map((item) => item.decision.canonicalCardId);
    const merge = related.find((item) => item.decision.action === 'merge');
    return {
      sourceCardId: original.source.cardId,
      sourceTopicId: original.source.topicId,
      status: targets.length > 1 ? 'split' : targets.length === 1 ? 'active' : merge ? 'merged' : 'deleted',
      targetCardIds: targets.length ? targets : merge ? [merge.decision.canonicalCardId] : [],
    };
  });
  const structuralActions = finalDecisions.filter(
    (decision) =>
      !['keep', 'rewrite'].includes(decision.action) ||
      decision.sourceTopicId !== decision.targetTopicId,
  );
  const deferred = active
    .filter((item) => item.decision.answerDisposition === 'deferred-image-answer')
    .map((item) => ({
      cardId: item.decision.canonicalCardId,
      topicId: item.decision.targetTopicId,
      reason: item.review.imageDependencyReason,
    }));
  const factSources = active
    .filter((item) => item.review.factSources.length || normalize(item.review.factUncertainty))
    .map((item) => ({
      cardId: item.decision.canonicalCardId,
      sources: item.review.factSources,
      uncertainty: item.review.factUncertainty,
    }));
  const stageLocks = work.items.map((item) => ({
    itemId: item.itemId,
    batchId: item.provenance.batchId,
    locks: item.locks,
    reviewRecords: item.reviewRecords,
  }));
  const seals = readJsonFiles(batchManifestRoot);
  const checkpoints = readJsonFiles(reviewRoot);
  const actionCounts = Object.fromEntries(
    [...ALL_ACTIONS].sort().map((action) => [
      action,
      work.items.filter((item) => item.decision.action === action).length,
    ]),
  );
  const counts = {
    sourceTextCards: originalItems.length,
    finalTextCards: active.length,
    finalImageCards: finalSource.topics
      .flatMap((topic) => topic.cards)
      .filter((card) => card.kind === 'image').length,
    finalCards: finalSource.topics.reduce((sum, topic) => sum + topic.cards.length, 0),
    deferredImageAnswers: deferred.length,
    actions: actionCounts,
    topics: Object.fromEntries(
      finalSource.topics.map((topic) => [topic.id, topic.cards.length]),
    ),
  };
  writeJson(join(outputRoot, 'final-card-decisions.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    counts,
    decisions: finalDecisions,
  });
  writeJson(join(outputRoot, 'card-target-mapping.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    mappings,
  });
  writeJson(join(outputRoot, 'structural-actions.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    actions: structuralActions,
  });
  writeJson(join(outputRoot, 'deferred-image-answers.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    cards: deferred,
  });
  writeJson(join(outputRoot, 'fact-sources.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    cards: factSources,
  });
  writeJson(join(outputRoot, 'stage-locks.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    finalReview: work.finalReview,
    items: stageLocks,
    batchManifests: seals,
  });
  writeJson(join(outputRoot, 'quality-checkpoints.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    checkpoints,
  });
  writeJson(join(outputRoot, 'final-quality-report.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    releaseVersion,
    releasedAt,
    counts,
    finalReview: work.finalReview,
    note: 'Machine validation and Codex content review are recorded separately.',
  });
  writeJson(join(outputRoot, 'rollback-record.json'), {
    schemaVersion: 1,
    baselineDigest: work.baselineDigest,
    baselineRegistryHash: requireManifest().registry.hash,
    rollbackCommand: 'node tools/opi-rebuild.mjs rollback',
    verificationCommand: 'node tools/opi-rebuild.mjs verify-rollback',
    restores: {
      opiSourceFiles: requireManifest().sourceFileCount,
      registry: true,
    },
  });
}

function commandApply(releaseVersionArg, releasedAtArg) {
  const manifest = verifySourceAgainstBaseline();
  const work = loadWork();
  verifyWorkOrigins(work);
  verifyDecisionAndQuestionEn(work);
  verifyQuestionZh(work);
  verifyAnswerEn(work);
  verifyAnswerZh(work);
  const batchIds = [
    ...new Set(work.items.map((item) => item.provenance.batchId).filter(Boolean)),
  ].sort();
  for (const stage of CONTENT_STAGES) {
    const closure = work.stageClosures?.[stage];
    if (!closure || closure.lock !== expectedStageClosureLock(work, stage, closure))
      fail('stage_closure_invalid:' + stage);
    for (const batchId of batchIds) {
      const sealPath = join(batchManifestRoot, batchId + '.' + stage + '.json');
      if (!existsSync(sealPath)) fail('batch_seal_missing:' + batchId + ':' + stage);
      const seal = readJson(sealPath);
      if (
        seal.payload?.batchId !== batchId ||
        seal.payload?.stage !== stage ||
        seal.manifestHash !== valueHash(seal.payload)
      )
        fail('batch_seal_stored_payload_invalid:' + batchId + ':' + stage);
    }
  }
  verifyRequiredSeals(work, 'answer-zh');
  requireFinalReview(work);
  const oldRegistry = readJson(registryPath);
  if (fileHash(registryPath) !== manifest.registry.hash) fail('registry_changed_since_freeze');
  const releaseVersion = Number(releaseVersionArg);
  if (!Number.isInteger(releaseVersion) || releaseVersion <= oldRegistry.releaseVersion)
    fail('apply_requires_new_integer_release_version_above_' + oldRegistry.releaseVersion);
  const releasedAt = normalize(releasedAtArg);
  if (!releasedAt || Number.isNaN(Date.parse(releasedAt))) fail('apply_requires_iso_released_at');
  const finalSource = buildFinalSource(work);
  verifyFinalSource(finalSource, work);
  rmSync(candidateRoot, { recursive: true, force: true });
  writeSource(candidateSourceRoot, finalSource);
  const candidateAudit = auditSource(candidateSourceRoot);
  if (
    candidateAudit.declarations.categoryErrors.length ||
    candidateAudit.declarations.topicErrors.length ||
    candidateAudit.identity.duplicateCardIds.length
  )
    fail('formal_candidate_audit_failed');
  const candidateRegistry = {
    ...oldRegistry,
    releaseVersion,
    releasedAt,
  };
  writeJson(candidateRegistryPath, candidateRegistry);
  writeArtifacts(candidateArtifactRoot, work, finalSource, releaseVersion, releasedAt);
  if (existsSync(artifactRoot)) {
    for (const name of readdirSync(artifactRoot).filter((entry) => entry.endsWith('.json'))) {
      const candidatePath = join(candidateArtifactRoot, name);
      if (!existsSync(candidatePath)) copyFileSync(join(artifactRoot, name), candidatePath);
    }
  }
  const preApplySourceRoot = join(generatedRoot, 'pre-apply-formal-source');
  const preApplyArtifactRoot = join(generatedRoot, 'pre-apply-formal-artifacts');
  const preApplyRegistryPath = join(generatedRoot, 'pre-apply-registry.json');
  if (existsSync(preApplySourceRoot)) fail('pre_apply_recovery_directory_exists');
  if (existsSync(preApplyArtifactRoot)) fail('pre_apply_artifact_recovery_directory_exists');
  if (existsSync(preApplyRegistryPath)) fail('pre_apply_registry_recovery_exists');
  const stagedRegistryPath = registryPath + '.opi-rebuild-next';
  copyFileSync(registryPath, preApplyRegistryPath);
  copyFileSync(candidateRegistryPath, stagedRegistryPath);
  let installedCandidateSource = false;
  let installedCandidateArtifacts = false;
  let movedPreviousArtifacts = false;
  try {
    renameSync(opiRoot, preApplySourceRoot);
    renameSync(candidateSourceRoot, opiRoot);
    installedCandidateSource = true;
    renameSync(stagedRegistryPath, registryPath);
    if (existsSync(artifactRoot)) {
      renameSync(artifactRoot, preApplyArtifactRoot);
      movedPreviousArtifacts = true;
    }
    renameSync(candidateArtifactRoot, artifactRoot);
    installedCandidateArtifacts = true;
  } catch (error) {
    if (installedCandidateArtifacts && existsSync(artifactRoot)) {
      const failedArtifactRoot = join(generatedRoot, 'failed-apply-artifacts');
      if (existsSync(failedArtifactRoot)) rmSync(failedArtifactRoot, { recursive: true, force: true });
      renameSync(artifactRoot, failedArtifactRoot);
    }
    if (movedPreviousArtifacts && existsSync(preApplyArtifactRoot) && !existsSync(artifactRoot))
      renameSync(preApplyArtifactRoot, artifactRoot);
    const recoveryRegistryPath = registryPath + '.opi-rebuild-recovery';
    copyFileSync(preApplyRegistryPath, recoveryRegistryPath);
    renameSync(recoveryRegistryPath, registryPath);
    if (installedCandidateSource && existsSync(opiRoot)) {
      const failedCandidateRoot = join(generatedRoot, 'failed-apply-candidate-source');
      if (existsSync(failedCandidateRoot)) rmSync(failedCandidateRoot, { recursive: true, force: true });
      renameSync(opiRoot, failedCandidateRoot);
    }
    if (!existsSync(opiRoot) && existsSync(preApplySourceRoot))
      renameSync(preApplySourceRoot, opiRoot);
    if (existsSync(stagedRegistryPath)) rmSync(stagedRegistryPath, { force: true });
    throw error;
  }
  console.log(
    'opi_rebuild_apply_ok release=' + releaseVersion +
      ' topics=' + finalSource.topics.length +
      ' cards=' + candidateAudit.counts.cards +
      ' text=' + candidateAudit.counts.textCards,
  );
}

function commandVerifyFormal() {
  const work = loadWork();
  verifyWorkOrigins(work);
  requireFinalReview(work);
  const formal = loadSource();
  verifyFinalSource(formal, work);
  const expected = buildFinalSource(work);
  if (
    valueHash({
      bank: formal.bank,
      categories: formal.categories,
      topics: formal.topics,
    }) !==
    valueHash({
      bank: expected.bank,
      categories: expected.categories,
      topics: expected.topics,
    })
  )
    fail('formal_source_not_exact_work_projection');
  const artifactNames = [
    'final-card-decisions.json',
    'card-target-mapping.json',
    'structural-actions.json',
    'deferred-image-answers.json',
    'fact-sources.json',
    'stage-locks.json',
    'quality-checkpoints.json',
    'final-quality-report.json',
    'rollback-record.json',
  ];
  const missing = artifactNames.filter((name) => !existsSync(join(artifactRoot, name)));
  if (missing.length) fail('formal_artifacts_missing\n' + missing.join('\n'));
  const report = readJson(join(artifactRoot, 'final-quality-report.json'));
  const registry = readJson(registryPath);
  if (report.releaseVersion !== registry.releaseVersion) fail('formal_registry_release_mismatch');
  console.log(
    'opi_rebuild_verify_formal_ok release=' + registry.releaseVersion +
      ' topics=' + formal.topics.length +
      ' cards=' + formal.rows.length +
      ' text=' + work.items.filter(isActive).length,
  );
}

function buildRollbackCandidate(manifest, rollbackCandidateRoot) {
  rmSync(rollbackCandidateRoot, { recursive: true, force: true });
  for (const entry of manifest.files) {
    const target = join(rollbackCandidateRoot, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(snapshotSourceRoot, entry.path), target);
  }
}

function commandVerifyRollback() {
  const manifest = requireManifest();
  const rollbackCandidateRoot = join(generatedRoot, 'rollback-candidate');
  buildRollbackCandidate(manifest, rollbackCandidateRoot);
  const audit = auditSource(rollbackCandidateRoot);
  if (audit.sourceDigest !== manifest.sourceDigest) fail('rollback_candidate_digest');
  if (
    audit.declarations.categoryErrors.length ||
    audit.declarations.topicErrors.length ||
    audit.identity.duplicateCardIds.length
  )
    fail('rollback_candidate_structure');
  if (fileHash(snapshotRegistryPath) !== manifest.registry.hash) fail('rollback_registry_snapshot');
  rmSync(rollbackCandidateRoot, { recursive: true, force: true });
  console.log(
    'opi_rebuild_verify_rollback_ok files=' + manifest.sourceFileCount +
      ' cards=' + audit.counts.cards +
      ' digest=' + audit.sourceDigest,
  );
}

function commandRollback() {
  const manifest = requireManifest();
  commandVerifyRollback();
  const rollbackCandidateRoot = join(generatedRoot, 'rollback-candidate');
  buildRollbackCandidate(manifest, rollbackCandidateRoot);
  const preRollbackSourceRoot = join(generatedRoot, 'pre-rollback-formal-source');
  const preRollbackRegistryPath = join(generatedRoot, 'pre-rollback-registry.json');
  if (existsSync(preRollbackSourceRoot)) fail('pre_rollback_recovery_directory_exists');
  if (existsSync(preRollbackRegistryPath)) fail('pre_rollback_registry_recovery_exists');
  copyFileSync(registryPath, preRollbackRegistryPath);
  const stagedRegistryPath = registryPath + '.opi-rebuild-rollback';
  copyFileSync(snapshotRegistryPath, stagedRegistryPath);
  let installedRollbackSource = false;
  try {
    renameSync(opiRoot, preRollbackSourceRoot);
    renameSync(rollbackCandidateRoot, opiRoot);
    installedRollbackSource = true;
    renameSync(stagedRegistryPath, registryPath);
  } catch (error) {
    const recoveryRegistryPath = registryPath + '.opi-rebuild-rollback-recovery';
    copyFileSync(preRollbackRegistryPath, recoveryRegistryPath);
    renameSync(recoveryRegistryPath, registryPath);
    if (installedRollbackSource && existsSync(opiRoot)) {
      const failedRollbackSourceRoot = join(generatedRoot, 'failed-rollback-source');
      if (existsSync(failedRollbackSourceRoot))
        rmSync(failedRollbackSourceRoot, { recursive: true, force: true });
      renameSync(opiRoot, failedRollbackSourceRoot);
    }
    if (!existsSync(opiRoot) && existsSync(preRollbackSourceRoot))
      renameSync(preRollbackSourceRoot, opiRoot);
    if (existsSync(stagedRegistryPath)) rmSync(stagedRegistryPath, { force: true });
    throw error;
  }
  if (sourceDigest() !== manifest.sourceDigest) fail('rollback_post_digest');
  if (fileHash(registryPath) !== manifest.registry.hash) fail('rollback_post_registry_hash');
  console.log('opi_rebuild_rollback_ok files=' + manifest.sourceFileCount + ' registry=true');
}

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  }).trim();
}

function gitJson(commit, path) {
  return JSON.parse(gitOutput(['show', commit + ':' + path]));
}

function gitPaths(commit, root) {
  return gitOutput(['ls-tree', '-r', '--name-only', commit, root])
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
}

function extractLegacyEnglishSegments(rawAnswer, sourceKey, sourceCardId) {
  const prepared = String(rawAnswer ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(
      /[（(][^（）()\n]*\p{Script=Han}[^（）()\n]*[）)](?=[.．。]?[A-Za-z])/gu,
      '',
    )
    .replace(/([（(]\s*\d+\s*[）)])/gu, '\n$1');
  const segments = [];
  let currentLines = [];
  let variant = null;

  function flush() {
    const text = normalize(currentLines.join('\n'));
    currentLines = [];
    if (!text || !/[A-Za-z]/u.test(text)) return;
    const ordinal = segments.length + 1;
    const textHash = valueHash(text);
    segments.push({
      segmentId:
        sourceKey + ':' + sourceCardId + ':s' + String(ordinal).padStart(2, '0') + ':' + textHash.slice(0, 12),
      ordinal,
      variant,
      text,
      textHash,
    });
  }

  for (const originalLine of prepared.split('\n')) {
    let line = originalLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const marker = line.match(/^[（(]\s*(\d+)\s*[）)]\s*/u);
    if (marker) {
      flush();
      variant = Number(marker[1]);
      line = line.slice(marker[0].length).trim();
      if (!line) continue;
    }
    if (HAN.test(line[0] ?? '')) {
      flush();
      continue;
    }
    const firstHan = line.search(HAN);
    const englishPrefix = (firstHan >= 0 ? line.slice(0, firstHan) : line).trim();
    if (englishPrefix && /[A-Za-z]/u.test(englishPrefix)) currentLines.push(englishPrefix);
    if (firstHan >= 0) flush();
  }
  flush();
  return segments;
}

function loadGroundedLegacySource(config) {
  const fullCommit = gitOutput(['rev-parse', config.commit + '^{commit}']);
  const registry = gitJson(config.commit, 'content/question-banks/registry.json');
  if (registry.releaseVersion !== config.releaseVersion)
    fail(config.key + ':unexpected_release_version:' + registry.releaseVersion);
  const topicPaths = gitPaths(
    config.commit,
    'content/question-banks/banks/opi/topics',
  ).filter((path) => path.endsWith('.json'));
  const records = [];
  for (const path of topicPaths) {
    const topic = gitJson(config.commit, path);
    if (!config.categoryIds.includes(topic.categoryId)) continue;
    for (const card of topic.cards) {
      if (card.kind === 'image') continue;
      const rawAnswer = String(card.referenceText ?? '').replace(/\r\n?/gu, '\n').trim();
      const segments = extractLegacyEnglishSegments(rawAnswer, config.key, card.id);
      records.push({
        corpusKey: config.key + ':' + card.id,
        sourceKey: config.key,
        commit: fullCommit,
        releaseVersion: config.releaseVersion,
        sourceCategoryId: topic.categoryId,
        sourceTopicId: topic.id,
        sourceTopicName: topic.name,
        sourceCardId: card.id,
        sourceQuestionEn: normalize(card.audioText),
        rawAnswer,
        rawAnswerHash: valueHash(rawAnswer),
        segments,
      });
    }
  }
  records.sort((left, right) =>
    left.sourceTopicId.localeCompare(right.sourceTopicId) ||
    left.sourceCardId.localeCompare(right.sourceCardId),
  );
  return {
    key: config.key,
    requestedCommit: config.commit,
    commit: fullCommit,
    releaseVersion: config.releaseVersion,
    categoryIds: config.categoryIds,
    registryHash: valueHash(registry),
    recordCount: records.length,
    segmentCount: records.reduce((sum, record) => sum + record.segments.length, 0),
    records,
  };
}

function groundedQuestionRows() {
  return loadSource().rows
    .filter(({ card }) => card.kind !== 'image')
    .map(({ category, topic, topicIndex, card, cardIndex }) => {
      const row = {
        categoryId: category.id,
        categoryName: category.name,
        topicId: topic.id,
        topicName: topic.name,
        topicIndex,
        cardId: card.id,
        cardIndex,
        taskTitle: card.taskTitle,
        questionEn: normalize(card.audioText),
        questionZh: normalize(card.audioTextZh),
      };
      return { ...row, questionHash: valueHash(row) };
    });
}

function groundedQuestionLock(rows) {
  return valueHash(rows.map(({ questionHash, ...row }) => ({ ...row, questionHash })));
}

function withoutGeneratedAt(value) {
  const result = clone(value);
  delete result.generatedAt;
  return result;
}

function collectGroundedAnswerBaseline() {
  const current = loadSource();
  const currentRegistry = readJson(registryPath);
  const questionRows = groundedQuestionRows();
  const questionLockHash = groundedQuestionLock(questionRows);
  const imageRows = current.rows.filter(({ card }) => card.kind === 'image');
  const legacySources = GROUNDED_SOURCES.map(loadGroundedLegacySource);
  const corpusRecords = legacySources.flatMap((source) => source.records);
  const corpusByKey = new Map(corpusRecords.map((record) => [record.corpusKey, record]));
  if (corpusByKey.size !== corpusRecords.length) fail('grounded_duplicate_corpus_key');

  const mappingArtifact = readJson(groundedMappingArtifactPath);
  const reverseMapping = new Map();
  for (const mapping of mappingArtifact.mappings) {
    for (const targetCardId of mapping.targetCardIds ?? []) {
      const rows = reverseMapping.get(targetCardId) ?? [];
      rows.push({
        sourceCardId: mapping.sourceCardId,
        sourceTopicId: mapping.sourceTopicId,
        sourceStatus: mapping.status,
      });
      reverseMapping.set(targetCardId, rows);
    }
  }
  const deferredArtifact = readJson(groundedDeferredArtifactPath);
  const deferredById = new Map(deferredArtifact.cards.map((entry) => [entry.cardId, entry]));
  const targetIds = new Set(questionRows.map((row) => row.cardId));
  for (const cardId of deferredById.keys()) {
    if (!targetIds.has(cardId)) fail('grounded_unknown_deferred_card:' + cardId);
  }

  const structuralSourceCountDistribution = {};
  const usableSourceCountDistribution = {};
  const sourceMapCards = [];
  const workItems = [];
  for (const row of questionRows) {
    const sourceConfig = GROUNDED_SOURCES.find((entry) => entry.categoryIds.includes(row.categoryId));
    if (!sourceConfig) fail(row.cardId + ':grounded_source_policy_missing');
    const mappings = reverseMapping.get(row.cardId) ?? [];
    if (!mappings.length) fail(row.cardId + ':grounded_source_mapping_missing');
    const excludedMappings = [];
    const sourcePool = mappings.flatMap((mapping) => {
      const corpusKey = sourceConfig.key + ':' + mapping.sourceCardId;
      const record = corpusByKey.get(corpusKey);
      if (!record) {
        excludedMappings.push({
          ...mapping,
          sourcePolicy: sourceConfig.key,
          reason: 'source-card-not-present-in-authorized-release',
        });
        return [];
      }
      return [{
        corpusKey,
        sourceKey: sourceConfig.key,
        releaseVersion: sourceConfig.releaseVersion,
        commit: record.commit,
        sourceCategoryId: record.sourceCategoryId,
        sourceTopicId: record.sourceTopicId,
        sourceTopicName: record.sourceTopicName,
        sourceCardId: record.sourceCardId,
        sourceQuestionEn: record.sourceQuestionEn,
        rawAnswerHash: record.rawAnswerHash,
        segments: record.segments.map(({ segmentId, ordinal, variant, textHash }) => ({
          segmentId,
          ordinal,
          variant,
          textHash,
        })),
      }];
    });
    if (!sourcePool.length) fail(row.cardId + ':grounded_usable_source_pool_empty');
    sourcePool.sort((left, right) => left.corpusKey.localeCompare(right.corpusKey));
    const structuralCountKey = String(mappings.length);
    structuralSourceCountDistribution[structuralCountKey] =
      (structuralSourceCountDistribution[structuralCountKey] ?? 0) + 1;
    const usableCountKey = String(sourcePool.length);
    usableSourceCountDistribution[usableCountKey] =
      (usableSourceCountDistribution[usableCountKey] ?? 0) + 1;
    const deferred = deferredById.get(row.cardId);
    sourceMapCards.push({
      cardId: row.cardId,
      categoryId: row.categoryId,
      topicId: row.topicId,
      sourcePolicy: sourceConfig.key,
      structuralSourceCount: mappings.length,
      sources: sourcePool,
      excludedMappings,
    });
    workItems.push({
      cardId: row.cardId,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      topicId: row.topicId,
      topicName: row.topicName,
      taskTitle: row.taskTitle,
      questionEn: row.questionEn,
      questionZh: row.questionZh,
      questionHash: row.questionHash,
      sourcePolicy: sourceConfig.key,
      sourcePool,
      excludedMappings,
      decision: {
        status: deferred ? 'deferred-image-answer' : 'pending',
        answerEn: null,
        selectedSegmentIds: [],
        editActions: [],
        sourceAssessment: deferred ? 'image-dependent' : null,
        riskAssessment: deferred?.reason ?? null,
        producer: null,
        review: 'pending',
      },
    });
  }

  const sourceMap = {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    questionLockHash,
    counts: {
      targetTextCards: questionRows.length,
      mappedTextCards: sourceMapCards.length,
      v1Targets: sourceMapCards.filter((card) => card.sourcePolicy === 'v1-categories-01-07').length,
      v2ImageTargets: sourceMapCards.filter((card) => card.sourcePolicy === 'v2-category-08-images').length,
      structuralSourceCountDistribution,
      usableSourceCountDistribution,
      excludedStructuralMappings: sourceMapCards.reduce(
        (sum, card) => sum + card.excludedMappings.length,
        0,
      ),
    },
    cards: sourceMapCards,
  };
  const corpus = {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    sources: legacySources.map(({ records: _records, ...source }) => source),
    corpusDigest: valueHash(
      corpusRecords.map((record) => ({
        corpusKey: record.corpusKey,
        rawAnswerHash: record.rawAnswerHash,
        segmentHashes: record.segments.map((segment) => segment.textHash),
      })),
    ),
    records: corpusRecords,
  };
  const productionV8 = readJson(groundedProductionV8ArtifactPath);
  const baseline = {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    generatedAt: new Date().toISOString(),
    branch: gitOutput(['branch', '--show-current']),
    baselineCommit: gitOutput(['rev-parse', 'HEAD']),
    originMainCommit: gitOutput(['rev-parse', 'origin/main']),
    currentReleaseVersion: currentRegistry.releaseVersion,
    currentFormalSourceDigest: sourceDigest(),
    questionLockHash,
    corpusDigest: corpus.corpusDigest,
    onlineV8Evidence: {
      sourceArtifact: relative(projectRoot, groundedProductionV8ArtifactPath),
      version: productionV8.release.version,
      checksum: productionV8.release.checksum,
      result: productionV8.result,
    },
    rollbackPoints: {
      formalSourceCommit: productionV8.release.sourceCommit,
      contentVersion: productionV8.rollback.contentVersion,
      contentBackup: productionV8.backups.content,
      databaseBackup: productionV8.backups.database,
    },
    counts: {
      categories: current.categories.length,
      topics: current.topics.length,
      cards: current.rows.length,
      textCards: questionRows.length,
      imageCards: imageRows.length,
      category01To07TextCards: questionRows.filter((row) => row.categoryId !== 'opi-category-08').length,
      imageTopicTextCards: questionRows.filter((row) => row.categoryId === 'opi-category-08').length,
      deferredImageAnswers: deferredById.size,
      targetAnswers: questionRows.length - deferredById.size,
    },
    historicalSources: legacySources.map((source) => ({
      key: source.key,
      requestedCommit: source.requestedCommit,
      commit: source.commit,
      releaseVersion: source.releaseVersion,
      categoryIds: source.categoryIds,
      registryHash: source.registryHash,
      recordCount: source.recordCount,
      segmentCount: source.segmentCount,
    })),
    sourceMapping: sourceMap.counts,
    immutableQuestionFields: [
      'cardId',
      'categoryId',
      'topicId',
      'taskTitle',
      'questionEn',
      'questionZh',
    ],
    excludedProductionSources: ['current-v8-answer-en', 'current-v8-answer-zh'],
  };
  const work = {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    questionLockHash,
    corpusDigest: corpus.corpusDigest,
    items: workItems,
  };
  return { baseline, corpus, sourceMap, work };
}

function commandBuildGroundedAnswerBaseline() {
  if (existsSync(groundedGeneratedRoot))
    fail('grounded_generated_root_exists: clean it explicitly before rebuilding');
  const { baseline, corpus, sourceMap, work } = collectGroundedAnswerBaseline();
  writeJson(groundedCorpusPath, corpus);
  writeJson(groundedWorkItemsPath, work);
  writeJson(groundedBaselineArtifactPath, baseline);
  writeJson(groundedSourceMapArtifactPath, sourceMap);
  console.log(
    'opi_grounded_answer_baseline_ok text=' + baseline.counts.textCards +
      ' v1=' + baseline.counts.category01To07TextCards +
      ' v2_image=' + baseline.counts.imageTopicTextCards +
      ' target_answers=' + baseline.counts.targetAnswers +
      ' question_lock=' + baseline.questionLockHash,
  );
}

function commandRefreshGroundedAnswerBaseline() {
  if (!existsSync(groundedGeneratedRoot))
    fail('grounded_generated_root_missing: build the baseline first');
  const previousBaseline = readJson(groundedBaselineArtifactPath);
  const { baseline, corpus, sourceMap, work } = collectGroundedAnswerBaseline();
  if (baseline.questionLockHash !== previousBaseline.questionLockHash)
    fail('grounded_refresh_question_lock_changed');
  if (baseline.counts.textCards !== previousBaseline.counts.textCards)
    fail('grounded_refresh_text_count_changed');
  writeJson(groundedCorpusPath, corpus);
  writeJson(groundedWorkItemsPath, work);
  writeJson(groundedBaselineArtifactPath, baseline);
  writeJson(groundedSourceMapArtifactPath, sourceMap);
  console.log(
    'opi_grounded_answer_baseline_refresh_ok text=' + baseline.counts.textCards +
      ' corpus=' + baseline.corpusDigest,
  );
}

function commandVerifyGroundedQuestionLock() {
  const baseline = readJson(groundedBaselineArtifactPath);
  const rows = groundedQuestionRows();
  const actual = groundedQuestionLock(rows);
  if (actual !== baseline.questionLockHash)
    fail('grounded_question_lock_changed expected=' + baseline.questionLockHash + ' actual=' + actual);
  if (rows.length !== baseline.counts.textCards)
    fail('grounded_question_count_changed:' + rows.length);
  console.log('opi_grounded_question_lock_ok text=' + rows.length + ' hash=' + actual);
}

function commandVerifyGroundedAnswerBaseline() {
  if (!existsSync(groundedCorpusPath) || !existsSync(groundedWorkItemsPath))
    fail('grounded_generated_baseline_missing');
  const expected = collectGroundedAnswerBaseline();
  const actualBaseline = readJson(groundedBaselineArtifactPath);
  const actualCorpus = readJson(groundedCorpusPath);
  const actualSourceMap = readJson(groundedSourceMapArtifactPath);
  const actualWork = readJson(groundedWorkItemsPath);
  if (valueHash(withoutGeneratedAt(actualBaseline)) !== valueHash(withoutGeneratedAt(expected.baseline)))
    fail('grounded_baseline_manifest_mismatch');
  if (valueHash(actualCorpus) !== valueHash(expected.corpus)) fail('grounded_corpus_mismatch');
  if (valueHash(actualSourceMap) !== valueHash(expected.sourceMap)) fail('grounded_source_map_mismatch');
  if (valueHash(actualWork) !== valueHash(expected.work)) fail('grounded_work_items_mismatch');
  commandVerifyGroundedQuestionLock();
  console.log(
    'opi_grounded_answer_baseline_verify_ok mapped=' + actualSourceMap.counts.mappedTextCards +
      ' corpus=' + actualCorpus.records.length +
      ' digest=' + actualCorpus.corpusDigest,
  );
}

function commandCreateGroundedAnswerCalibration(cardIds) {
  if (!isNonEmptyUniqueStringArray(cardIds)) fail('grounded_calibration_card_ids_invalid');
  if (cardIds.length < 30 || cardIds.length > 50)
    fail('grounded_calibration_size_must_be_30_to_50:' + cardIds.length);
  commandVerifyGroundedQuestionLock();
  const work = readJson(groundedWorkItemsPath);
  const corpus = readJson(groundedCorpusPath);
  const itemById = new Map(work.items.map((item) => [item.cardId, item]));
  const corpusByKey = new Map(corpus.records.map((record) => [record.corpusKey, record]));
  const items = cardIds.map((cardId) => {
    const item = itemById.get(cardId);
    if (!item) fail('grounded_calibration_unknown_card:' + cardId);
    return {
      cardId: item.cardId,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      topicId: item.topicId,
      topicName: item.topicName,
      taskTitle: item.taskTitle,
      questionEn: item.questionEn,
      questionZh: item.questionZh,
      questionHash: item.questionHash,
      sourcePolicy: item.sourcePolicy,
      initialDisposition: item.decision.status,
      initialRiskReason: item.decision.riskAssessment,
      excludedMappings: item.excludedMappings,
      sources: item.sourcePool.map((source) => {
        const record = corpusByKey.get(source.corpusKey);
        if (!record) fail(cardId + ':grounded_calibration_corpus_missing:' + source.corpusKey);
        return {
          corpusKey: record.corpusKey,
          sourceKey: record.sourceKey,
          releaseVersion: record.releaseVersion,
          commit: record.commit,
          sourceCategoryId: record.sourceCategoryId,
          sourceTopicId: record.sourceTopicId,
          sourceTopicName: record.sourceTopicName,
          sourceCardId: record.sourceCardId,
          sourceQuestionEn: record.sourceQuestionEn,
          rawAnswer: record.rawAnswer,
          rawAnswerHash: record.rawAnswerHash,
          segments: record.segments,
        };
      }),
    };
  });
  writeJson(groundedCalibrationInputPath, {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    questionLockHash: work.questionLockHash,
    corpusDigest: work.corpusDigest,
    selectedBy: 'codex-main',
    count: items.length,
    items,
  });
  console.log(
    'opi_grounded_answer_calibration_input_ok count=' + items.length +
      ' path=' + relative(projectRoot, groundedCalibrationInputPath),
  );
}

function groundedAnswerRiskCandidates(item) {
  const question = item.questionEn.toLowerCase();
  const risks = [];
  if (/have you ever|your experience|what happened|do you currently|did you/iu.test(question))
    risks.push('personal-experience');
  if (/your company|your airline|company require|company provide|company promote/iu.test(question))
    risks.push('company-policy-or-procedure');
  if (/aircraft type|aircraft you fly|your aircraft|type ratings?/iu.test(question))
    risks.push('aircraft-type');
  if (/how many|how much|maximum|minimum|lower and upper|limit|distance|altitude|speed|hours?|minutes?|feet|degrees/iu.test(question))
    risks.push('numerical-or-limit');
  if (/what should|how should|how would|what procedure|what actions?|how do you respond|what measures/iu.test(question))
    risks.push('procedure-or-safety-action');
  if (item.categoryId === 'opi-category-08') risks.push('image-topic');
  if (item.cardId.includes('-part-')) risks.push('split-card');
  if (item.sourcePool.length > 1) risks.push('multi-source');
  if (item.decision.status === 'deferred-image-answer') risks.push('deferred-image-answer');
  return risks;
}

function groundedAnswerBatchInput(item, corpusByKey) {
  return {
    cardId: item.cardId,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    topicId: item.topicId,
    topicName: item.topicName,
    taskTitle: item.taskTitle,
    questionEn: item.questionEn,
    questionZh: item.questionZh,
    questionHash: item.questionHash,
    sourcePolicy: item.sourcePolicy,
    initialDisposition: item.decision.status,
    initialRiskReason: item.decision.riskAssessment,
    riskCandidates: groundedAnswerRiskCandidates(item),
    excludedMappings: item.excludedMappings,
    sources: item.sourcePool.map((source) => {
      const record = corpusByKey.get(source.corpusKey);
      if (!record) fail(item.cardId + ':grounded_batch_corpus_missing:' + source.corpusKey);
      return {
        corpusKey: record.corpusKey,
        sourceKey: record.sourceKey,
        releaseVersion: record.releaseVersion,
        commit: record.commit,
        sourceCategoryId: record.sourceCategoryId,
        sourceTopicId: record.sourceTopicId,
        sourceTopicName: record.sourceTopicName,
        sourceCardId: record.sourceCardId,
        sourceQuestionEn: record.sourceQuestionEn,
        rawAnswer: record.rawAnswer,
        rawAnswerHash: record.rawAnswerHash,
        segments: record.segments,
      };
    }),
  };
}

function collectGroundedAnswerBatchPlan() {
  commandVerifyGroundedQuestionLock();
  const calibration = readJson(groundedCalibrationArtifactPath);
  const adjudication = readJson(groundedCalibrationAdjudicationPath);
  if (calibration.reviewStatus !== 'locked-user-approved')
    fail('grounded_calibration_not_user_approved');
  if (adjudication.userApproval?.status !== 'approved')
    fail('grounded_calibration_approval_record_missing');
  const calibrationIds = new Set(calibration.items.map((item) => item.cardId));
  const work = readJson(groundedWorkItemsPath);
  const corpus = readJson(groundedCorpusPath);
  const corpusByKey = new Map(corpus.records.map((record) => [record.corpusKey, record]));
  const remaining = work.items.filter((item) => !calibrationIds.has(item.cardId));
  const batchCount = Math.ceil(remaining.length / 28);
  const minimumSize = Math.floor(remaining.length / batchCount);
  const largerBatchCount = remaining.length - minimumSize * batchCount;
  const sizes = Array.from(
    { length: batchCount },
    (_, index) => minimumSize + (index < largerBatchCount ? 1 : 0),
  );
  const batches = [];
  let offset = 0;
  for (const [index, size] of sizes.entries()) {
    const batchId = 'ans-' + String(index + 1).padStart(3, '0');
    const items = remaining
      .slice(offset, offset + size)
      .map((item) => groundedAnswerBatchInput(item, corpusByKey));
    offset += size;
    const input = {
      schemaVersion: GROUNDED_SCHEMA_VERSION,
      ruleVersion: GROUNDED_RULE_VERSION,
      batchId,
      questionLockHash: work.questionLockHash,
      corpusDigest: work.corpusDigest,
      producer: 'codex-main',
      reviewer: 'codex-independent',
      count: items.length,
      items,
    };
    batches.push({
      batchId,
      count: items.length,
      topicIds: [...new Set(items.map((item) => item.topicId))],
      cardIds: items.map((item) => item.cardId),
      inputHash: valueHash(input),
      input,
    });
  }
  if (offset !== remaining.length) fail('grounded_batch_plan_offset');
  const plan = {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    generatedAt: new Date().toISOString(),
    questionLockHash: work.questionLockHash,
    corpusDigest: work.corpusDigest,
    calibration: {
      batchId: calibration.batchId,
      count: calibration.items.length,
      hash: readJson(groundedCalibrationMachineReportPath).calibrationHash,
      userApproved: true,
    },
    counts: {
      allTextCards: work.items.length,
      calibrationCards: calibration.items.length,
      remainingCards: remaining.length,
      productionBatches: batches.length,
      minimumBatchSize: Math.min(...batches.map((batch) => batch.count)),
      maximumBatchSize: Math.max(...batches.map((batch) => batch.count)),
    },
    batches: batches.map(({ input: _input, ...batch }) => batch),
  };
  return { plan, batches };
}

function commandPlanGroundedAnswerBatches() {
  if (existsSync(groundedAnswerBatchInputRoot))
    fail('grounded_answer_batch_input_root_exists');
  const { plan, batches } = collectGroundedAnswerBatchPlan();
  for (const batch of batches)
    writeJson(join(groundedAnswerBatchInputRoot, batch.batchId + '.json'), batch.input);
  mkdirSync(groundedAnswerBatchRoot, { recursive: true });
  mkdirSync(groundedAnswerReviewRoot, { recursive: true });
  writeJson(groundedBatchPlanArtifactPath, plan);
  console.log(
    'opi_grounded_answer_batch_plan_ok remaining=' + plan.counts.remainingCards +
      ' batches=' + plan.counts.productionBatches +
      ' size=' + plan.counts.minimumBatchSize + '-' + plan.counts.maximumBatchSize,
  );
}

function commandRefreshGroundedAnswerBatchPlan() {
  if (!existsSync(groundedAnswerBatchInputRoot))
    fail('grounded_answer_batch_input_root_missing: plan batches first');
  const previousPlan = readJson(groundedBatchPlanArtifactPath);
  const { plan, batches } = collectGroundedAnswerBatchPlan();
  if (plan.questionLockHash !== previousPlan.questionLockHash)
    fail('grounded_batch_refresh_question_lock_changed');
  if (
    valueHash(plan.batches.map(({ batchId, cardIds }) => ({ batchId, cardIds }))) !==
    valueHash(previousPlan.batches.map(({ batchId, cardIds }) => ({ batchId, cardIds })))
  )
    fail('grounded_batch_refresh_card_allocation_changed');
  for (const batch of batches)
    writeJson(join(groundedAnswerBatchInputRoot, batch.batchId + '.json'), batch.input);
  writeJson(groundedBatchPlanArtifactPath, plan);
  console.log(
    'opi_grounded_answer_batch_plan_refresh_ok remaining=' + plan.counts.remainingCards +
      ' batches=' + plan.counts.productionBatches,
  );
}

function commandVerifyGroundedAnswerBatchPlan() {
  const expected = collectGroundedAnswerBatchPlan();
  const actualPlan = readJson(groundedBatchPlanArtifactPath);
  if (valueHash(withoutGeneratedAt(actualPlan)) !== valueHash(withoutGeneratedAt(expected.plan)))
    fail('grounded_answer_batch_plan_mismatch');
  for (const batch of expected.batches) {
    const path = join(groundedAnswerBatchInputRoot, batch.batchId + '.json');
    if (!existsSync(path)) fail('grounded_answer_batch_input_missing:' + batch.batchId);
    if (valueHash(readJson(path)) !== valueHash(batch.input))
      fail('grounded_answer_batch_input_mismatch:' + batch.batchId);
  }
  console.log(
    'opi_grounded_answer_batch_plan_verify_ok remaining=' + actualPlan.counts.remainingCards +
      ' batches=' + actualPlan.counts.productionBatches,
  );
}

function commandVerifyGroundedAnswerBatch(batchId) {
  if (!isValidBatchId(batchId) || !/^ans-\d{3}$/u.test(batchId))
    fail('grounded_answer_batch_id_invalid:' + batchId);
  commandVerifyGroundedQuestionLock();
  const inputPath = join(groundedAnswerBatchInputRoot, batchId + '.json');
  const outputPath = join(groundedAnswerBatchRoot, batchId + '.json');
  if (!existsSync(inputPath)) fail('grounded_answer_batch_input_missing:' + batchId);
  if (!existsSync(outputPath)) fail('grounded_answer_batch_output_missing:' + batchId);
  const input = readJson(inputPath);
  const batch = readJson(outputPath);
  const errors = [];
  const warnings = [];
  if (batch.schemaVersion !== GROUNDED_SCHEMA_VERSION) errors.push('batch:schema_version');
  if (batch.ruleVersion !== GROUNDED_RULE_VERSION) errors.push('batch:rule_version');
  if (batch.batchId !== batchId || input.batchId !== batchId) errors.push('batch:batch_id');
  if (batch.inputHash !== valueHash(input)) errors.push('batch:input_hash');
  if (batch.questionLockHash !== input.questionLockHash) errors.push('batch:question_lock');
  if (batch.corpusDigest !== input.corpusDigest) errors.push('batch:corpus_digest');
  if (batch.producer !== 'codex-main') errors.push('batch:producer');
  if (!Array.isArray(batch.items) || batch.items.length !== input.items.length)
    errors.push('batch:item_count');
  const inputById = new Map(input.items.map((item) => [item.cardId, item]));
  const ids = batch.items?.map((item) => item.cardId) ?? [];
  if (new Set(ids).size !== ids.length) errors.push('batch:duplicate_card_id');
  if (valueHash([...ids].sort()) !== valueHash(input.items.map((item) => item.cardId).sort()))
    errors.push('batch:card_set');

  const existingAnswers = new Map();
  const calibration = readJson(groundedCalibrationArtifactPath);
  for (const item of calibration.items.filter((item) => item.disposition === 'complete'))
    existingAnswers.set(normalize(item.answerEn).toLowerCase(), item.cardId);
  if (existsSync(groundedAnswerBatchRoot)) {
    for (const name of readdirSync(groundedAnswerBatchRoot).filter((name) => name.endsWith('.json')).sort()) {
      if (name === batchId + '.json') continue;
      const other = readJson(join(groundedAnswerBatchRoot, name));
      for (const item of other.items ?? []) {
        if (item.disposition === 'complete' && normalize(item.answerEn))
          existingAnswers.set(normalize(item.answerEn).toLowerCase(), item.cardId);
      }
    }
  }

  const allowedGrammarTokens = new Set(
    'a an the and or but so if then than that this these those it its they them their we our i my he she his her would should could can may might must is are was were be been being have has had do does did to of in on at for from with without as by before after during until while when where which who what how no not only also first second however therefore because again any every all one two three four zero more most relevant required applicable immediately closely currently instead according main possible carefully clear safely safe unsafe reduced increased higher lower longer greater less better early further very flight takeoff landing aircraft pilot pilots crew'.split(' '),
  );
  const itemReports = [];
  const batchAnswers = [];
  for (const item of batch.items ?? []) {
    const source = inputById.get(item.cardId);
    if (!source) {
      errors.push(item.cardId + ':not_in_batch_input');
      continue;
    }
    if (item.questionEn !== source.questionEn) errors.push(item.cardId + ':question_changed');
    if (!Array.isArray(item.riskTags) || !item.riskTags.length)
      errors.push(item.cardId + ':risk_tags');
    if (!['complete', 'source-insufficient', 'deferred-image-answer'].includes(item.disposition))
      errors.push(item.cardId + ':disposition');
    const segmentById = new Map(
      source.sources.flatMap((entry) => entry.segments).map((segment) => [segment.segmentId, segment]),
    );
    for (const segmentId of [...(item.selectedSegmentIds ?? []), ...(item.consideredSegmentIds ?? [])])
      if (!segmentById.has(segmentId)) errors.push(item.cardId + ':segment_outside_source_pool:' + segmentId);
    if (!Array.isArray(item.editActions) || !item.editActions.length)
      errors.push(item.cardId + ':edit_actions');
    if (!normalize(item.riskAssessment)) errors.push(item.cardId + ':risk_assessment');
    const answer = item.answerEn == null ? null : normalize(item.answerEn);
    if (item.disposition === 'complete') {
      if (!answer) errors.push(item.cardId + ':answer_missing');
      if (!(item.selectedSegmentIds ?? []).length)
        errors.push(item.cardId + ':selected_segments_missing');
      if (item.sourceAssessment !== 'sufficient') errors.push(item.cardId + ':source_assessment');
    } else {
      if (answer) errors.push(item.cardId + ':answer_must_be_null');
      if ((item.selectedSegmentIds ?? []).length)
        errors.push(item.cardId + ':selected_segments_must_be_empty');
      if (segmentById.size > 0 && !(item.consideredSegmentIds ?? []).length)
        errors.push(item.cardId + ':considered_segments_missing');
    }
    if (item.disposition === 'deferred-image-answer') {
      if (source.initialDisposition !== 'deferred-image-answer')
        errors.push(item.cardId + ':unapproved_image_deferral');
      if (item.sourceAssessment !== 'image-dependent')
        errors.push(item.cardId + ':deferred_source_assessment');
    }
    if (item.disposition === 'source-insufficient' && item.sourceAssessment !== 'insufficient')
      errors.push(item.cardId + ':insufficient_source_assessment');

    let wordCount = 0;
    let sentenceCount = 0;
    let paragraphCount = 0;
    let novelTokens = [];
    if (answer) {
      if (HAN.test(answer)) errors.push(item.cardId + ':han_in_answer');
      if (/^(?:\s*(?:\d+[.)]|[-*•])\s+)/mu.test(answer)) errors.push(item.cardId + ':list_format');
      if (/a suitable example|learners should|replace this answer|one adjustable example|example would be/iu.test(answer))
        errors.push(item.cardId + ':banned_instruction_or_template');
      if (/\n{3,}/u.test(answer)) errors.push(item.cardId + ':abnormal_newlines');
      if (answer !== item.answerEn) errors.push(item.cardId + ':answer_not_normalized');
      const normalizedAnswer = answer.toLowerCase();
      const duplicateOwner = existingAnswers.get(normalizedAnswer);
      if (duplicateOwner) errors.push(item.cardId + ':duplicate_answer:' + duplicateOwner);
      existingAnswers.set(normalizedAnswer, item.cardId);
      wordCount = englishTokens(answer).length;
      sentenceCount = (answer.match(/[.!?](?:\s|$)/gu) ?? []).length;
      paragraphCount = answer.split(/\n\s*\n/gu).length;
      if (sentenceCount < 1 || sentenceCount > 7)
        warnings.push(item.cardId + ':sentence_count:' + sentenceCount);
      if (wordCount < 5 || wordCount > 140) warnings.push(item.cardId + ':word_count:' + wordCount);
      if (paragraphCount > 2) warnings.push(item.cardId + ':paragraph_count:' + paragraphCount);
      const sourceTokens = new Set([
        ...englishTokens(source.questionEn),
        ...(item.selectedSegmentIds ?? []).flatMap((segmentId) =>
          englishTokens(segmentById.get(segmentId)?.text),
        ),
      ]);
      novelTokens = [...new Set(englishTokens(answer))]
        .filter((token) => !sourceTokens.has(token) && !allowedGrammarTokens.has(token))
        .sort();
      batchAnswers.push({ cardId: item.cardId, answer });
    }
    itemReports.push({
      cardId: item.cardId,
      disposition: item.disposition,
      answerHash: answer ? valueHash(answer) : null,
      wordCount,
      sentenceCount,
      paragraphCount,
      selectedSegmentCount: (item.selectedSegmentIds ?? []).length,
      novelTokenCandidates: novelTokens,
    });
  }
  const similarityCandidates = [];
  for (let leftIndex = 0; leftIndex < batchAnswers.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < batchAnswers.length; rightIndex += 1) {
      const left = batchAnswers[leftIndex];
      const right = batchAnswers[rightIndex];
      const score = jaccard(left.answer, right.answer);
      if (score >= 0.82)
        similarityCandidates.push({ left: left.cardId, right: right.cardId, score });
    }
  }
  const dispositions = Object.fromEntries(
    ['complete', 'source-insufficient', 'deferred-image-answer'].map((status) => [
      status,
      (batch.items ?? []).filter((item) => item.disposition === status).length,
    ]),
  );
  const report = {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    batchId,
    inputHash: batch.inputHash,
    questionLockHash: batch.questionLockHash,
    batchHash: valueHash({
      inputHash: batch.inputHash,
      questionLockHash: batch.questionLockHash,
      corpusDigest: batch.corpusDigest,
      items: batch.items,
    }),
    counts: {
      items: batch.items?.length ?? 0,
      dispositions,
      errors: errors.length,
      warnings: warnings.length,
      novelTokenCandidates: itemReports.reduce(
        (sum, item) => sum + item.novelTokenCandidates.length,
        0,
      ),
      similarityCandidates: similarityCandidates.length,
    },
    errors,
    warnings,
    similarityCandidates,
    items: itemReports,
  };
  writeJson(join(groundedAnswerReviewRoot, batchId + '.machine.json'), report);
  if (errors.length) fail('grounded_answer_batch_invalid\n' + errors.join('\n'));
  console.log(
    'opi_grounded_answer_batch_verify_ok batch=' + batchId +
      ' items=' + report.counts.items +
      ' complete=' + dispositions.complete +
      ' insufficient=' + dispositions['source-insufficient'] +
      ' deferred=' + dispositions['deferred-image-answer'] +
      ' warnings=' + warnings.length +
      ' similar=' + similarityCandidates.length +
      ' hash=' + report.batchHash,
  );
}

function readGroundedSealedAnswerDecisions() {
  commandVerifyGroundedAnswerBaseline();
  commandVerifyGroundedAnswerBatchPlan();
  commandVerifyGroundedAnswerCalibration();
  commandBuildGroundedAnswerCalibrationReview();

  const calibration = readJson(groundedCalibrationArtifactPath);
  if (calibration.reviewStatus !== 'locked-user-approved')
    fail('grounded_preview_calibration_not_user_approved');
  const decisions = [...calibration.items];
  const batchFiles = readdirSync(groundedAnswerBatchRoot)
    .filter((name) => /^ans-\d{3}\.json$/u.test(name))
    .sort();
  if (!batchFiles.length) fail('grounded_preview_no_sealed_batches');

  for (const name of batchFiles) {
    const batchId = name.slice(0, -'.json'.length);
    commandVerifyGroundedAnswerBatch(batchId);
    const batch = readJson(join(groundedAnswerBatchRoot, name));
    const machine = readJson(join(groundedAnswerReviewRoot, batchId + '.machine.json'));
    const independent = readJson(join(groundedAnswerReviewRoot, batchId + '.independent.json'));
    const adjudication = readJson(join(groundedAnswerReviewRoot, batchId + '.adjudication.json'));
    const cardIds = batch.items.map((item) => item.cardId);
    const cardIdHash = valueHash([...cardIds].sort());
    if (batch.reviewStatus !== 'sealed-independent-review-closed')
      fail('grounded_preview_batch_not_sealed:' + batchId);
    if (batch.batchHash !== machine.batchHash)
      fail('grounded_preview_batch_hash_mismatch:' + batchId);
    if (
      independent.batchId !== batchId ||
      independent.reviewer !== 'codex-independent' ||
      independent.mode !== 'full-read-only-no-production-writing' ||
      independent.coverage?.read !== cardIds.length ||
      independent.coverage?.total !== cardIds.length ||
      (Array.isArray(independent.readCardIds) &&
        valueHash([...independent.readCardIds].sort()) !== cardIdHash)
    )
      fail('grounded_preview_independent_review_invalid:' + batchId);
    const findingIds = (independent.findings ?? []).map((finding) => finding.findingId);
    const adjudicatedIds = (adjudication.findings ?? []).map((finding) => finding.findingId);
    if (
      adjudication.batchId !== batchId ||
      adjudication.adjudicator !== 'codex-main' ||
      adjudication.status !== 'closed' ||
      adjudication.finalBatchHash !== batch.batchHash ||
      valueHash([...findingIds].sort()) !== valueHash([...adjudicatedIds].sort()) ||
      (adjudication.machineReview?.candidateCount ?? adjudication.machineReview?.novelTokenCandidates) !==
        machine.counts.novelTokenCandidates
    )
      fail('grounded_preview_adjudication_invalid:' + batchId);
    decisions.push(...batch.items);
  }

  const decisionByCardId = new Map();
  for (const decision of decisions) {
    if (!decision.cardId || decisionByCardId.has(decision.cardId))
      fail('grounded_preview_duplicate_decision:' + decision.cardId);
    if (!['complete', 'source-insufficient', 'deferred-image-answer'].includes(decision.disposition))
      fail('grounded_preview_disposition:' + decision.cardId);
    if (decision.disposition === 'complete' && !normalize(decision.answerEn))
      fail('grounded_preview_complete_answer_missing:' + decision.cardId);
    if (decision.disposition !== 'complete' && normalize(decision.answerEn))
      fail('grounded_preview_noncomplete_answer_present:' + decision.cardId);
    decisionByCardId.set(decision.cardId, decision);
  }
  const counts = Object.fromEntries(
    ['complete', 'source-insufficient', 'deferred-image-answer'].map((status) => [
      status,
      decisions.filter((decision) => decision.disposition === status).length,
    ]),
  );
  return { decisions, decisionByCardId, batchFiles: batchFiles.map((name) => name.slice(0, -5)), counts };
}

function commandApplyGroundedAnswerCrossBatchAudit() {
  const audit = readJson(groundedCrossBatchAuditPath);
  if (!['approved-by-codex-main', 'applied'].includes(audit.status))
    fail('grounded_cross_batch_audit_not_approved');
  if (audit.reviewer !== 'codex-independent' || audit.adjudicator !== 'codex-main')
    fail('grounded_cross_batch_audit_identity');
  const findingsByBatch = new Map();
  for (const finding of audit.findings ?? []) {
    if (!finding.batchId || !finding.cardId || !normalize(finding.evidence))
      fail('grounded_cross_batch_audit_finding_invalid');
    const rows = findingsByBatch.get(finding.batchId) ?? [];
    rows.push(finding);
    findingsByBatch.set(finding.batchId, rows);
  }
  if ((audit.findings ?? []).length !== 40)
    fail('grounded_cross_batch_audit_finding_count:' + (audit.findings ?? []).length);

  const applyFinding = (item, finding) => {
    if (item.disposition === 'source-insufficient') return false;
    if (item.disposition !== 'complete')
      fail('grounded_cross_batch_audit_disposition:' + finding.cardId + ':' + item.disposition);
    item.riskTags = [...new Set([...(item.riskTags ?? []), 'persona-consistency', 'source-insufficient'])];
    item.disposition = 'source-insufficient';
    item.consideredSegmentIds = [
      ...new Set([...(item.consideredSegmentIds ?? []), ...(item.selectedSegmentIds ?? [])]),
    ];
    item.selectedSegmentIds = [];
    item.editActions = [
      ...(item.editActions ?? []),
      'cross-batch persona audit rejected the answer because it conflicts with the locked student-pilot and no-current-airline background',
    ];
    item.answerEn = null;
    item.sourceAssessment = 'insufficient';
    item.riskAssessment =
      finding.evidence + ' This conflicts with the locked student-pilot and no-current-airline background.';
    return true;
  };

  const beforeCalibration = readJson(groundedCalibrationMachineReportPath).counts.dispositions;
  const calibration = readJson(groundedCalibrationArtifactPath);
  for (const finding of findingsByBatch.get('cal-001') ?? []) {
    const item = calibration.items.find((candidate) => candidate.cardId === finding.cardId);
    if (!item) fail('grounded_cross_batch_calibration_card_missing:' + finding.cardId);
    applyFinding(item, finding);
  }
  writeJson(groundedCalibrationArtifactPath, calibration);
  commandVerifyGroundedAnswerCalibration();
  const calibrationMachine = readJson(groundedCalibrationMachineReportPath);
  const calibrationAdjudication = readJson(groundedCalibrationAdjudicationPath);
  calibrationAdjudication.machineReview.candidateCount =
    calibrationMachine.counts.novelTokenCandidates;
  calibrationAdjudication.crossBatchConsistencyAudit = {
    auditId: audit.auditId,
    file: relative(projectRoot, groundedCrossBatchAuditPath),
    cardIds: (findingsByBatch.get('cal-001') ?? []).map((finding) => finding.cardId),
  };
  calibrationAdjudication.counts = {
    items: calibration.items.length,
    complete: calibrationMachine.counts.dispositions.complete,
    sourceInsufficient: calibrationMachine.counts.dispositions['source-insufficient'],
    deferredImageAnswer: calibrationMachine.counts.dispositions['deferred-image-answer'],
  };
  writeJson(groundedCalibrationAdjudicationPath, calibrationAdjudication);
  commandBuildGroundedAnswerCalibrationReview();
  commandRefreshGroundedAnswerBatchPlan();

  const changedBatches = [];
  for (const [batchId, findings] of findingsByBatch) {
    if (batchId === 'cal-001') continue;
    const batchPath = join(groundedAnswerBatchRoot, batchId + '.json');
    if (!existsSync(batchPath)) fail('grounded_cross_batch_batch_missing:' + batchId);
    const batch = readJson(batchPath);
    for (const finding of findings) {
      const item = batch.items.find((candidate) => candidate.cardId === finding.cardId);
      if (!item) fail('grounded_cross_batch_card_missing:' + batchId + ':' + finding.cardId);
      applyFinding(item, finding);
    }
    batch.reviewStatus = 'producer-complete-pending-cross-batch-reseal';
    batch.batchHash = null;
    writeJson(batchPath, batch);
    commandVerifyGroundedAnswerBatch(batchId);
    const machine = readJson(join(groundedAnswerReviewRoot, batchId + '.machine.json'));
    batch.reviewStatus = 'sealed-independent-review-closed';
    batch.batchHash = machine.batchHash;
    writeJson(batchPath, batch);
    const adjudicationPath = join(groundedAnswerReviewRoot, batchId + '.adjudication.json');
    const adjudication = readJson(adjudicationPath);
    adjudication.finalBatchHash = machine.batchHash;
    adjudication.machineReview = {
      ...(adjudication.machineReview ?? {}),
      status: 'reviewed',
      candidateCount: machine.counts.novelTokenCandidates,
      errors: machine.counts.errors,
      warnings: machine.counts.warnings,
      similarityCandidates: machine.counts.similarityCandidates,
    };
    adjudication.crossBatchConsistencyAudit = {
      auditId: audit.auditId,
      file: relative(projectRoot, groundedCrossBatchAuditPath),
      cardIds: findings.map((finding) => finding.cardId),
      decision: 'accepted',
    };
    adjudication.counts = {
      items: batch.items.length,
      complete: machine.counts.dispositions.complete,
      sourceInsufficient: machine.counts.dispositions['source-insufficient'],
      deferredImageAnswer: machine.counts.dispositions['deferred-image-answer'],
    };
    writeJson(adjudicationPath, adjudication);
    commandVerifyGroundedAnswerBatch(batchId);
    changedBatches.push({
      batchId,
      cardIds: findings.map((finding) => finding.cardId),
      finalBatchHash: machine.batchHash,
    });
  }
  const allItems = [
    ...calibration.items,
    ...readdirSync(groundedAnswerBatchRoot)
      .filter((name) => /^ans-\d{3}\.json$/u.test(name))
      .sort()
      .flatMap((name) => readJson(join(groundedAnswerBatchRoot, name)).items),
  ];
  audit.status = 'applied';
  audit.appliedAt = new Date().toISOString();
  audit.result = {
    beforeCalibration,
    changedBatches,
    counts: {
      items: allItems.length,
      complete: allItems.filter((item) => item.disposition === 'complete').length,
      sourceInsufficient: allItems.filter((item) => item.disposition === 'source-insufficient').length,
      deferredImageAnswer: allItems.filter((item) => item.disposition === 'deferred-image-answer').length,
    },
  };
  writeJson(groundedCrossBatchAuditPath, audit);
  console.log(
    'opi_grounded_cross_batch_audit_applied findings=' + audit.findings.length +
      ' complete=' + audit.result.counts.complete +
      ' insufficient=' + audit.result.counts.sourceInsufficient +
      ' deferred=' + audit.result.counts.deferredImageAnswer,
  );
}

function commandBuildGroundedAnswerFinalAudit() {
  const sealed = readGroundedSealedAnswerDecisions();
  if (sealed.decisions.length !== 1067)
    fail('grounded_final_audit_decision_count:' + sealed.decisions.length);
  const workItems = readJson(groundedWorkItemsPath);
  const corpus = readJson(groundedCorpusPath);
  const workItemById = new Map(workItems.items.map((item) => [item.cardId, item]));
  const segmentById = new Map();
  for (const record of corpus.records) {
    for (const segment of record.segments) {
      segmentById.set(segment.segmentId, {
        sourceKey: record.sourceKey,
        releaseVersion: record.releaseVersion,
        commit: record.commit,
        sourceCategoryId: record.sourceCategoryId,
        sourceTopicId: record.sourceTopicId,
        sourceTopicName: record.sourceTopicName,
        sourceCardId: record.sourceCardId,
        sourceQuestionEn: record.sourceQuestionEn,
        rawAnswerHash: record.rawAnswerHash,
        ...segment,
      });
    }
  }
  const ownerById = new Map(
    readJson(groundedCalibrationArtifactPath).items.map((item) => [item.cardId, 'cal-001']),
  );
  const batches = sealed.batchFiles.map((batchId) => {
    const batchPath = join(groundedAnswerBatchRoot, batchId + '.json');
    const machinePath = join(groundedAnswerReviewRoot, batchId + '.machine.json');
    const independentPath = join(groundedAnswerReviewRoot, batchId + '.independent.json');
    const adjudicationPath = join(groundedAnswerReviewRoot, batchId + '.adjudication.json');
    const batch = readJson(batchPath);
    const machine = readJson(machinePath);
    const independent = readJson(independentPath);
    const adjudication = readJson(adjudicationPath);
    for (const item of batch.items) ownerById.set(item.cardId, batchId);
    return {
      batchId,
      inputHash: batch.inputHash,
      batchHash: batch.batchHash,
      reviewStatus: batch.reviewStatus,
      counts: machine.counts,
      independentCoverage: independent.coverage,
      independentFindingCount: independent.findings?.length ?? 0,
      adjudicationStatus: adjudication.status,
      evidenceHashes: {
        batch: fileHash(batchPath),
        machine: fileHash(machinePath),
        independent: fileHash(independentPath),
        adjudication: fileHash(adjudicationPath),
      },
    };
  });
  const resolveSegments = (ids, cardId) =>
    (ids ?? []).map((segmentId) => {
      const segment = segmentById.get(segmentId);
      if (!segment) fail('grounded_final_audit_segment_missing:' + cardId + ':' + segmentId);
      return segment;
    });
  const cards = sealed.decisions.map((decision) => {
    const workItem = workItemById.get(decision.cardId);
    if (!workItem) fail('grounded_final_audit_work_item_missing:' + decision.cardId);
    return {
      cardId: decision.cardId,
      categoryId: workItem.categoryId,
      categoryName: workItem.categoryName,
      topicId: workItem.topicId,
      topicName: workItem.topicName,
      taskTitle: workItem.taskTitle,
      questionEn: workItem.questionEn,
      questionZh: workItem.questionZh,
      questionHash: workItem.questionHash,
      sourcePolicy: workItem.sourcePolicy,
      decisionOwner: ownerById.get(decision.cardId),
      disposition: decision.disposition,
      answerEn: decision.answerEn ?? null,
      selectedSources: resolveSegments(decision.selectedSegmentIds, decision.cardId),
      consideredSources: resolveSegments(decision.consideredSegmentIds, decision.cardId),
      editActions: decision.editActions,
      sourceAssessment: decision.sourceAssessment,
      riskAssessment: decision.riskAssessment,
      riskTags: decision.riskTags,
    };
  });
  if (new Set(cards.map((card) => card.cardId)).size !== cards.length)
    fail('grounded_final_audit_duplicate_cards');
  const completeCards = cards.filter((card) => card.disposition === 'complete');
  const exactAnswerOwners = new Map();
  const exactDuplicateCandidates = [];
  for (const card of completeCards) {
    const key = normalize(card.answerEn).toLowerCase();
    const previous = exactAnswerOwners.get(key);
    if (previous) exactDuplicateCandidates.push({ left: previous, right: card.cardId });
    else exactAnswerOwners.set(key, card.cardId);
  }
  const globalSimilarityCandidates = [];
  for (let leftIndex = 0; leftIndex < completeCards.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < completeCards.length; rightIndex += 1) {
      const left = completeCards[leftIndex];
      const right = completeCards[rightIndex];
      const score = jaccard(left.answerEn, right.answerEn);
      if (score >= 0.82)
        globalSimilarityCandidates.push({ left: left.cardId, right: right.cardId, score });
    }
  }
  const styleCounts = new Map();
  for (const card of completeCards) {
    const tokens = englishTokens(card.answerEn);
    const opening = tokens.slice(0, 4).join(' ');
    if (opening) styleCounts.set(opening, (styleCounts.get(opening) ?? 0) + 1);
  }
  const commonOpenings = [...styleCounts.entries()]
    .filter(([, count]) => count >= 4)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([opening, count]) => ({ opening, count }));
  const wordCounts = completeCards.map((card) => englishTokens(card.answerEn).length);
  const globalTextReview = {
    exactDuplicateCandidates,
    similarityThreshold: 0.82,
    similarityCandidates: globalSimilarityCandidates,
    wordCount: {
      minimum: Math.min(...wordCounts),
      maximum: Math.max(...wordCounts),
      average: Number(
        (wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length).toFixed(2),
      ),
    },
    commonOpenings,
  };
  const machineTotals = batches.reduce(
    (total, batch) => ({
      errors: total.errors + batch.counts.errors,
      warnings: total.warnings + batch.counts.warnings,
      similarityCandidates: total.similarityCandidates + batch.counts.similarityCandidates,
      novelTokenCandidates: total.novelTokenCandidates + batch.counts.novelTokenCandidates,
    }),
    { errors: 0, warnings: 0, similarityCandidates: 0, novelTokenCandidates: 0 },
  );
  const summary = {
    textCards: cards.length,
    complete: cards.filter((card) => card.disposition === 'complete').length,
    sourceInsufficient: cards.filter((card) => card.disposition === 'source-insufficient').length,
    deferredImageAnswer: cards.filter((card) => card.disposition === 'deferred-image-answer').length,
    calibrationCards: 40,
    batches: batches.length,
    batchCards: cards.length - 40,
    machineTotals,
    globalTextReview: {
      exactDuplicateCandidates: exactDuplicateCandidates.length,
      similarityCandidates: globalSimilarityCandidates.length,
      commonOpenings: commonOpenings.length,
      wordCount: globalTextReview.wordCount,
    },
  };
  const finalDecisionHash = valueHash(
    cards.map((card) => ({
      cardId: card.cardId,
      questionHash: card.questionHash,
      disposition: card.disposition,
      answerEn: card.answerEn,
      selectedSegmentIds: card.selectedSources.map((source) => source.segmentId),
      consideredSegmentIds: card.consideredSources.map((source) => source.segmentId),
    })),
  );
  const audit = {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    generatedAt: new Date().toISOString(),
    questionLockHash: workItems.questionLockHash,
    corpusDigest: corpus.corpusDigest,
    finalDecisionHash,
    summary,
    sourceBoundaries: corpus.sources,
    calibration: {
      batchId: 'cal-001',
      reviewStatus: readJson(groundedCalibrationArtifactPath).reviewStatus,
      batchHash: readJson(groundedCalibrationArtifactPath).batchHash,
    },
    batches,
    crossBatchConsistencyAudit: existsSync(groundedCrossBatchAuditPath)
      ? {
          file: relative(projectRoot, groundedCrossBatchAuditPath),
          hash: fileHash(groundedCrossBatchAuditPath),
        }
      : null,
    sourceInsufficientCardIds: cards
      .filter((card) => card.disposition === 'source-insufficient')
      .map((card) => card.cardId),
    deferredImageAnswerCardIds: cards
      .filter((card) => card.disposition === 'deferred-image-answer')
      .map((card) => card.cardId),
    globalTextReview,
    cards,
  };
  writeJson(groundedFinalAnswerAuditPath, audit);
  const warnings = batches.flatMap((batch) =>
    readJson(join(groundedAnswerReviewRoot, batch.batchId + '.machine.json')).warnings
      .map((warning) => batch.batchId + ':' + warning),
  );
  const similarities = batches.flatMap((batch) =>
    readJson(join(groundedAnswerReviewRoot, batch.batchId + '.machine.json'))
      .similarityCandidates.map((candidate) => ({ batchId: batch.batchId, ...candidate })),
  );
  const qualityLines = [
    '# OPI 英文答案 v1 语料约束二次重建最终质量报告',
    '',
    '生成时间：' + audit.generatedAt,
    '',
    '## 锁定摘要',
    '',
    '- 问题锁：`' + audit.questionLockHash + '`',
    '- 语料摘要：`' + audit.corpusDigest + '`',
    '- 最终决定摘要：`' + finalDecisionHash + '`',
    '- 文本卡：' + summary.textCards,
    '- 完成英文答案：' + summary.complete,
    '- 来源不足：' + summary.sourceInsufficient,
    '- 图片依赖延期：' + summary.deferredImageAnswer,
    '- 校准批：40 张；正式批：' + summary.batches + ' 批、' + summary.batchCards + ' 张',
    '',
    '## 质量门禁',
    '',
    '- 所有正式批均完成主 Codex 生产、独立 Codex 全量只读复核、主 Codex 裁决和机器复验。',
    '- 机器错误：' + machineTotals.errors,
    '- 机器警告：' + machineTotals.warnings,
    '- 批内相似度候选：' + machineTotals.similarityCandidates,
    '- 全局完全重复候选：' + exactDuplicateCandidates.length,
    '- 全局相似度候选：' + globalSimilarityCandidates.length,
    '- novel-token 人工审查候选总数：' + machineTotals.novelTokenCandidates,
    '- 所有正常答案均引用批准的 v1/v2 片段；来源不足和图片延期均不写答案。',
    '- 当前中英文问题、卡片 ID、话题和排序继续受问题锁保护。',
    '',
    '## 机器警告',
    '',
    ...(warnings.length ? warnings.map((warning) => '- ' + warning) : ['- 无']),
    '',
    '## 相似度候选',
    '',
    ...(similarities.length
      ? similarities.map(
          (candidate) =>
            '- ' + candidate.batchId + ': ' + candidate.left + ' / ' +
            candidate.right + ' = ' + candidate.score,
        )
      : ['- 无']),
    '',
    '## 全局重复与风格候选',
    '',
    '- 完全重复：' + exactDuplicateCandidates.length,
    '- Jaccard ≥ 0.82：' + globalSimilarityCandidates.length,
    '- 高频四词开头：' + commonOpenings.length,
    '',
    '## 审计入口',
    '',
    '- 逐卡来源、摘取片段、编辑动作、风险决定和批次归属：`artifacts/final-answer-audit.json`',
    '- 跨批人物与内容一致性：`artifacts/cross-batch-consistency-audit.json`',
    '- 每批独立复核、主裁决和机器报告：`.generated/opi-answer-v1-grounded/answer-reviews/`',
    '',
  ];
  writeFileSync(groundedFinalQualityReportPath, qualityLines.join('\n'), 'utf8');
  console.log(
    'opi_grounded_final_audit_ok decisions=' + cards.length +
      ' complete=' + summary.complete +
      ' insufficient=' + summary.sourceInsufficient +
      ' deferred=' + summary.deferredImageAnswer +
      ' hash=' + finalDecisionHash,
  );
}

function readGroundedFinalAuditDecisions() {
  if (!existsSync(groundedFinalAnswerAuditPath))
    fail('grounded_final_audit_missing');
  commandVerifyGroundedQuestionLock();
  const audit = readJson(groundedFinalAnswerAuditPath);
  const currentRows = groundedQuestionRows();
  const currentById = new Map(currentRows.map((row) => [row.cardId, row]));
  if (
    audit.schemaVersion !== GROUNDED_SCHEMA_VERSION ||
    audit.ruleVersion !== GROUNDED_RULE_VERSION ||
    audit.questionLockHash !== groundedQuestionLock(currentRows) ||
    !Array.isArray(audit.cards) ||
    audit.cards.length !== currentRows.length
  )
    fail('grounded_final_audit_lock_invalid');
  const allowedSourceByCategory = new Map(
    GROUNDED_SOURCES.flatMap((source) =>
      source.categoryIds.map((categoryId) => [
        categoryId,
        { key: source.key, releaseVersion: source.releaseVersion },
      ]),
    ),
  );
  const decisions = audit.cards.map((card) => {
    const current = currentById.get(card.cardId);
    if (
      !current ||
      card.questionHash !== current.questionHash ||
      card.questionEn !== current.questionEn ||
      card.questionZh !== current.questionZh ||
      card.categoryId !== current.categoryId ||
      card.topicId !== current.topicId ||
      card.taskTitle !== current.taskTitle
    )
      fail('grounded_final_audit_question_changed:' + card.cardId);
    if (!['complete', 'source-insufficient', 'deferred-image-answer'].includes(card.disposition))
      fail('grounded_final_audit_disposition:' + card.cardId);
    const answerEn = card.answerEn == null ? null : normalize(card.answerEn);
    if (card.disposition === 'complete' ? !answerEn : Boolean(answerEn))
      fail('grounded_final_audit_answer_state:' + card.cardId);
    if (card.disposition === 'complete' && !(card.selectedSources?.length))
      fail('grounded_final_audit_selected_source_missing:' + card.cardId);
    const allowedSource = allowedSourceByCategory.get(card.categoryId);
    for (const source of [...(card.selectedSources ?? []), ...(card.consideredSources ?? [])]) {
      if (
        source.sourceKey !== allowedSource?.key ||
        source.releaseVersion !== allowedSource.releaseVersion ||
        !normalize(source.segmentId) ||
        !normalize(source.text) ||
        source.textHash !== valueHash(source.text)
      )
        fail('grounded_final_audit_source_invalid:' + card.cardId);
    }
    return {
      cardId: card.cardId,
      questionEn: card.questionEn,
      disposition: card.disposition,
      answerEn,
      selectedSegmentIds: (card.selectedSources ?? []).map((source) => source.segmentId),
      consideredSegmentIds: (card.consideredSources ?? []).map((source) => source.segmentId),
      editActions: card.editActions,
      sourceAssessment: card.sourceAssessment,
      riskAssessment: card.riskAssessment,
      riskTags: card.riskTags,
    };
  });
  const finalDecisionHash = valueHash(
    audit.cards.map((card) => ({
      cardId: card.cardId,
      questionHash: card.questionHash,
      disposition: card.disposition,
      answerEn: card.answerEn,
      selectedSegmentIds: (card.selectedSources ?? []).map((source) => source.segmentId),
      consideredSegmentIds: (card.consideredSources ?? []).map((source) => source.segmentId),
    })),
  );
  if (finalDecisionHash !== audit.finalDecisionHash)
    fail('grounded_final_audit_decision_hash');
  const decisionByCardId = new Map(decisions.map((decision) => [decision.cardId, decision]));
  if (decisionByCardId.size !== decisions.length)
    fail('grounded_final_audit_duplicate_card');
  const counts = Object.fromEntries(
    ['complete', 'source-insufficient', 'deferred-image-answer'].map((disposition) => [
      disposition,
      decisions.filter((decision) => decision.disposition === disposition).length,
    ]),
  );
  if (
    counts.complete !== audit.summary?.complete ||
    counts['source-insufficient'] !== audit.summary?.sourceInsufficient ||
    counts['deferred-image-answer'] !== audit.summary?.deferredImageAnswer
  )
    fail('grounded_final_audit_count_mismatch');
  return {
    decisions,
    decisionByCardId,
    counts,
    batchFiles: (audit.batches ?? []).map((batch) => batch.batchId),
    finalDecisionHash,
  };
}

function buildGroundedAnswerPreviewSource(decisionByCardId) {
  const source = loadSource();
  const topics = source.topics.map((topic) => ({
    ...clone(topic),
    cards: topic.cards.map((card) => {
      const next = clone(card);
      if (next.kind === 'image') return next;
      const decision = decisionByCardId.get(next.id);
      delete next.referenceText;
      delete next.referenceTextZh;
      if (decision?.disposition === 'complete') next.referenceText = normalize(decision.answerEn);
      return next;
    }),
  }));
  const bank = {
    ...clone(source.bank),
    description: '英文答案验收预览；中文参考答案尚未发布',
    statusLabel: '英文答案验收版',
    study: {
      ...clone(source.bank.study),
      copy: {
        ...clone(source.bank.study.copy),
        transcriptLabel: '英文问题',
        referenceLabel: '英文参考答案',
      },
    },
  };
  return { bank, categories: clone(source.categories), topics };
}

function verifyGroundedAnswerPreviewDataset(dataset, decisions) {
  const source = runtimeDatasetFromSource(loadSource());
  const sourceRows = source.categories.flatMap((category) =>
    category.topics.flatMap((topic) => topic.cards.map((card) => ({ category, topic, card }))),
  );
  const rows = dataset.categories.flatMap((category) =>
    category.topics.flatMap((topic) => topic.cards.map((card) => ({ category, topic, card }))),
  );
  const errors = [];
  if (dataset.id !== 'opi') errors.push('preview:bank_id');
  if (dataset.declaredTopicCount !== 144) errors.push('preview:topic_count');
  if (dataset.declaredCardCount !== 1090 || rows.length !== 1090) errors.push('preview:card_count');
  if (sourceRows.length !== rows.length) errors.push('preview:source_card_count');
  const sourceById = new Map(sourceRows.map((row) => [row.card.id, row]));
  const seen = new Set();
  let textCards = 0;
  let imageCards = 0;
  let publishedAnswers = 0;
  for (const row of rows) {
    const original = sourceById.get(row.card.id);
    if (!original || seen.has(row.card.id)) {
      errors.push('preview:card_identity:' + row.card.id);
      continue;
    }
    seen.add(row.card.id);
    if (row.category.id !== original.category.id || row.topic.id !== original.topic.id)
      errors.push('preview:card_location:' + row.card.id);
    if (row.card.kind === 'image') {
      imageCards += 1;
      if (valueHash(row.card) !== valueHash(original.card))
        errors.push('preview:image_changed:' + row.card.id);
      continue;
    }
    textCards += 1;
    if (
      row.card.taskTitle !== original.card.taskTitle ||
      row.card.audioText !== original.card.audioText ||
      row.card.audioTextZh !== original.card.audioTextZh
    )
      errors.push('preview:question_changed:' + row.card.id);
    if (Object.hasOwn(row.card, 'referenceTextZh'))
      errors.push('preview:answer_zh_present:' + row.card.id);
    const decision = decisions.decisionByCardId.get(row.card.id);
    const expectedAnswer = decision?.disposition === 'complete' ? normalize(decision.answerEn) : undefined;
    if (row.card.referenceText !== expectedAnswer) {
      errors.push('preview:answer_projection:' + row.card.id);
    } else if (expectedAnswer) {
      publishedAnswers += 1;
    }
  }
  if (seen.size !== sourceRows.length) errors.push('preview:missing_cards');
  if (textCards !== 1067 || imageCards !== 23) errors.push('preview:kind_count');
  if (publishedAnswers !== decisions.counts.complete) errors.push('preview:published_answer_count');
  if (errors.length) fail('grounded_answer_preview_invalid\n' + errors.join('\n'));
  return {
    cards: rows.length,
    textCards,
    imageCards,
    sealedDecisions: decisions.decisions.length,
    completeAnswers: decisions.counts.complete,
    sourceInsufficient: decisions.counts['source-insufficient'],
    deferredImageAnswers: decisions.counts['deferred-image-answer'],
    unfinishedTextAnswers: textCards - decisions.decisions.length,
    emptyAnswerFields: textCards - decisions.counts.complete,
  };
}

function commandBuildGroundedAnswerPreview(releaseVersionArg, releasedAtArg) {
  const releaseVersion = Number(releaseVersionArg);
  if (!Number.isInteger(releaseVersion) || releaseVersion < 1)
    fail('grounded_answer_preview_release_version');
  const releasedAt = normalize(releasedAtArg);
  if (!releasedAt || Number.isNaN(Date.parse(releasedAt)))
    fail('grounded_answer_preview_released_at');
  const currentRegistry = readJson(registryPath);
  if (releaseVersion <= currentRegistry.releaseVersion)
    fail('grounded_answer_preview_release_not_above_formal:' + currentRegistry.releaseVersion);
  const decisions = readGroundedFinalAuditDecisions();
  const source = buildGroundedAnswerPreviewSource(decisions.decisionByCardId);
  const dataset = runtimeDatasetFromSource(source);
  const counts = verifyGroundedAnswerPreviewDataset(dataset, decisions);
  const releaseKind =
    counts.unfinishedTextAnswers === 0
      ? 'answer-en-final-preview'
      : 'answer-en-partial-preview';
  const previewArtifactPath =
    counts.unfinishedTextAnswers === 0
      ? groundedAnswerFinalPreviewArtifactPath
      : groundedAnswerPreviewArtifactPath;

  rmSync(groundedAnswerPreviewReleaseRoot, { recursive: true, force: true });
  const bankPath = join(groundedAnswerPreviewReleaseRoot, 'banks/opi.json');
  const resourcesPath = join(groundedAnswerPreviewReleaseRoot, 'resources/manifest.json');
  writeJson(bankPath, dataset);
  const resourceVersion = readJson(
    join(projectRoot, 'content/question-banks/resources/manifest.source.json'),
  ).version;
  writeJson(resourcesPath, { schemaVersion: 1, version: resourceVersion, files: [] });
  const manifest = {
    schemaVersion: 1,
    releaseVersion,
    releasedAt,
    banks: [{
      id: 'opi',
      version: releaseVersion,
      file: 'banks/opi.json',
      checksum: fileHash(bankPath),
      categories: dataset.categories.length,
      topics: dataset.declaredTopicCount,
      cards: dataset.declaredCardCount,
    }],
    resources: {
      version: resourceVersion,
      file: 'resources/manifest.json',
      checksum: fileHash(resourcesPath),
      files: 0,
      sizeBytes: 0,
    },
  };
  writeJson(join(groundedAnswerPreviewReleaseRoot, 'manifest.json'), manifest);
  writeJson(join(groundedAnswerPreviewReleaseRoot, 'change-report.json'), {
    schemaVersion: 1,
    releaseKind,
    releaseVersion,
    questionLockHash: readJson(groundedBaselineArtifactPath).questionLockHash,
    corpusDigest: readJson(groundedBaselineArtifactPath).corpusDigest,
    finalDecisionHash: decisions.finalDecisionHash,
    batchIds: decisions.batchFiles,
    counts,
    fields: {
      questionEn: 'v8-locked-and-preserved',
      questionZh: 'v8-locked-and-preserved',
      answerEn: 'sealed-complete-only',
      answerZh: 'omitted-for-all-text-cards',
    },
  });
  writeJson(previewArtifactPath, {
    schemaVersion: 1,
    releaseKind,
    releaseVersion,
    releasedAt,
    questionLockHash: readJson(groundedBaselineArtifactPath).questionLockHash,
    corpusDigest: readJson(groundedBaselineArtifactPath).corpusDigest,
    finalDecisionHash: decisions.finalDecisionHash,
    releaseRoot: relative(projectRoot, groundedAnswerPreviewReleaseRoot),
    bankChecksum: manifest.banks[0].checksum,
    releaseManifestChecksum: fileHash(join(groundedAnswerPreviewReleaseRoot, 'manifest.json')),
    batchIds: decisions.batchFiles,
    counts,
    rollback: {
      activeProductionVersion: currentRegistry.releaseVersion,
      action:
        'delete-preview-release-and-reactivate-opi-v' + currentRegistry.releaseVersion,
    },
  });
  console.log(
    'opi_grounded_answer_preview_ok version=' + releaseVersion +
      ' complete=' + counts.completeAnswers +
      ' insufficient=' + counts.sourceInsufficient +
      ' deferred=' + counts.deferredImageAnswers +
      ' unfinished=' + counts.unfinishedTextAnswers +
      ' checksum=' + manifest.banks[0].checksum,
  );
}

function englishTokens(value) {
  return (String(value ?? '').toLowerCase().match(/[a-z]+(?:[-'][a-z]+)*/gu) ?? []);
}

function commandVerifyGroundedAnswerCalibration(pathArg) {
  commandVerifyGroundedQuestionLock();
  const calibrationPath = pathArg ? resolve(projectRoot, pathArg) : groundedCalibrationArtifactPath;
  const batch = readJson(calibrationPath);
  const input = readJson(groundedCalibrationInputPath);
  const inputById = new Map(input.items.map((item) => [item.cardId, item]));
  const errors = [];
  const warnings = [];
  if (batch.schemaVersion !== GROUNDED_SCHEMA_VERSION) errors.push('batch:schema_version');
  if (batch.ruleVersion !== GROUNDED_RULE_VERSION) errors.push('batch:rule_version');
  if (batch.questionLockHash !== input.questionLockHash) errors.push('batch:question_lock');
  if (batch.corpusDigest !== input.corpusDigest) errors.push('batch:corpus_digest');
  if (batch.producer !== 'codex-main') errors.push('batch:producer');
  if (!Array.isArray(batch.items) || batch.items.length !== input.items.length)
    errors.push('batch:item_count');
  const ids = batch.items?.map((item) => item.cardId) ?? [];
  if (new Set(ids).size !== ids.length) errors.push('batch:duplicate_card_id');
  if (valueHash([...ids].sort()) !== valueHash(input.items.map((item) => item.cardId).sort()))
    errors.push('batch:card_set');

  const allowedGrammarTokens = new Set(
    'a an the and or but so if then than that this these those it its they them their we our i my he she his her would should could can may might must is are was were be been being have has had do does did to of in on at for from with without as by before after during until while when where which who what how no not only also first second however therefore because again any every all one two three four zero more most relevant required applicable immediately closely currently instead'.split(' '),
  );
  const answerOwners = new Map();
  const itemReports = [];
  for (const item of batch.items ?? []) {
    const source = inputById.get(item.cardId);
    if (!source) {
      errors.push(item.cardId + ':not_in_calibration_input');
      continue;
    }
    if (item.questionEn !== source.questionEn) errors.push(item.cardId + ':question_changed');
    if (!Array.isArray(item.riskTags) || !item.riskTags.length)
      errors.push(item.cardId + ':risk_tags');
    if (!['complete', 'source-insufficient', 'deferred-image-answer'].includes(item.disposition))
      errors.push(item.cardId + ':disposition');
    const segmentById = new Map(
      source.sources.flatMap((entry) => entry.segments).map((segment) => [segment.segmentId, segment]),
    );
    for (const segmentId of [...(item.selectedSegmentIds ?? []), ...(item.consideredSegmentIds ?? [])])
      if (!segmentById.has(segmentId)) errors.push(item.cardId + ':segment_outside_source_pool:' + segmentId);
    if (!Array.isArray(item.editActions) || !item.editActions.length)
      errors.push(item.cardId + ':edit_actions');
    if (!normalize(item.riskAssessment)) errors.push(item.cardId + ':risk_assessment');

    const answer = item.answerEn == null ? null : normalize(item.answerEn);
    if (item.disposition === 'complete') {
      if (!answer) errors.push(item.cardId + ':answer_missing');
      if (!Array.isArray(item.selectedSegmentIds) || !item.selectedSegmentIds.length)
        errors.push(item.cardId + ':selected_segments_missing');
      if (item.sourceAssessment !== 'sufficient') errors.push(item.cardId + ':source_assessment');
    } else {
      if (answer) errors.push(item.cardId + ':answer_must_be_null');
      if ((item.selectedSegmentIds ?? []).length) errors.push(item.cardId + ':selected_segments_must_be_empty');
      if (!(item.consideredSegmentIds ?? []).length) errors.push(item.cardId + ':considered_segments_missing');
    }
    if (item.disposition === 'deferred-image-answer') {
      if (source.initialDisposition !== 'deferred-image-answer')
        errors.push(item.cardId + ':unapproved_image_deferral');
      if (item.sourceAssessment !== 'image-dependent')
        errors.push(item.cardId + ':deferred_source_assessment');
    }
    if (item.disposition === 'source-insufficient' && item.sourceAssessment !== 'insufficient')
      errors.push(item.cardId + ':insufficient_source_assessment');

    let wordCount = 0;
    let sentenceCount = 0;
    let paragraphCount = 0;
    let novelTokens = [];
    if (answer) {
      if (HAN.test(answer)) errors.push(item.cardId + ':han_in_answer');
      if (/^(?:\s*(?:\d+[.)]|[-*•])\s+)/mu.test(answer)) errors.push(item.cardId + ':list_format');
      if (/a suitable example|learners should|replace this answer|one adjustable example|example would be/iu.test(answer))
        errors.push(item.cardId + ':banned_instruction_or_template');
      if (/\n{3,}/u.test(answer)) errors.push(item.cardId + ':abnormal_newlines');
      if (answer !== item.answerEn) errors.push(item.cardId + ':answer_not_normalized');
      const normalizedAnswer = answer.toLowerCase();
      const duplicateOwner = answerOwners.get(normalizedAnswer);
      if (duplicateOwner) errors.push(item.cardId + ':duplicate_answer:' + duplicateOwner);
      answerOwners.set(normalizedAnswer, item.cardId);
      wordCount = englishTokens(answer).length;
      sentenceCount = (answer.match(/[.!?](?:\s|$)/gu) ?? []).length;
      paragraphCount = answer.split(/\n\s*\n/gu).length;
      if (sentenceCount < 1 || sentenceCount > 7)
        warnings.push(item.cardId + ':sentence_count:' + sentenceCount);
      if (wordCount < 5 || wordCount > 140) warnings.push(item.cardId + ':word_count:' + wordCount);
      if (paragraphCount > 2) warnings.push(item.cardId + ':paragraph_count:' + paragraphCount);
      const sourceTokens = new Set([
        ...englishTokens(source.questionEn),
        ...(item.selectedSegmentIds ?? []).flatMap((segmentId) =>
          englishTokens(segmentById.get(segmentId)?.text),
        ),
      ]);
      novelTokens = [...new Set(englishTokens(answer))]
        .filter((token) => !sourceTokens.has(token) && !allowedGrammarTokens.has(token))
        .sort();
    }
    itemReports.push({
      cardId: item.cardId,
      disposition: item.disposition,
      answerHash: answer ? valueHash(answer) : null,
      wordCount,
      sentenceCount,
      paragraphCount,
      selectedSegmentCount: (item.selectedSegmentIds ?? []).length,
      novelTokenCandidates: novelTokens,
    });
  }
  const dispositions = Object.fromEntries(
    ['complete', 'source-insufficient', 'deferred-image-answer'].map((status) => [
      status,
      (batch.items ?? []).filter((item) => item.disposition === status).length,
    ]),
  );
  const report = {
    schemaVersion: GROUNDED_SCHEMA_VERSION,
    ruleVersion: GROUNDED_RULE_VERSION,
    batchId: batch.batchId,
    questionLockHash: batch.questionLockHash,
    calibrationHash: valueHash({
      questionLockHash: batch.questionLockHash,
      corpusDigest: batch.corpusDigest,
      items: batch.items,
    }),
    counts: {
      items: batch.items?.length ?? 0,
      dispositions,
      errors: errors.length,
      warnings: warnings.length,
      novelTokenCandidates: itemReports.reduce(
        (sum, item) => sum + item.novelTokenCandidates.length,
        0,
      ),
    },
    errors,
    warnings,
    items: itemReports,
  };
  writeJson(groundedCalibrationMachineReportPath, report);
  if (errors.length) fail('grounded_calibration_invalid\n' + errors.join('\n'));
  console.log(
    'opi_grounded_answer_calibration_verify_ok items=' + report.counts.items +
      ' complete=' + dispositions.complete +
      ' insufficient=' + dispositions['source-insufficient'] +
      ' deferred=' + dispositions['deferred-image-answer'] +
      ' warnings=' + warnings.length +
      ' hash=' + report.calibrationHash,
  );
}

function markdownQuote(value) {
  return normalize(value)
    .split('\n')
    .map((line) => '> ' + line)
    .join('\n');
}

function commandBuildGroundedAnswerCalibrationReview() {
  commandVerifyGroundedAnswerCalibration();
  const batch = readJson(groundedCalibrationArtifactPath);
  const input = readJson(groundedCalibrationInputPath);
  const machine = readJson(groundedCalibrationMachineReportPath);
  const reviewer = readJson(groundedCalibrationReviewerReportPath);
  const adjudication = readJson(groundedCalibrationAdjudicationPath);
  const expectedIds = batch.items.map((item) => item.cardId);
  const expectedIdHash = valueHash([...expectedIds].sort());
  if (reviewer.batchId !== batch.batchId) fail('grounded_reviewer_batch_id');
  if (reviewer.reviewer !== 'codex-independent') fail('grounded_reviewer_identity');
  if (reviewer.coverage?.read !== expectedIds.length || reviewer.coverage?.total !== expectedIds.length)
    fail('grounded_reviewer_coverage_count');
  if (valueHash([...(reviewer.readCardIds ?? [])].sort()) !== expectedIdHash)
    fail('grounded_reviewer_coverage_set');
  const findingIds = (reviewer.findings ?? []).map((finding) => finding.findingId);
  if (new Set(findingIds).size !== findingIds.length) fail('grounded_reviewer_duplicate_finding_id');
  for (const finding of reviewer.findings ?? []) {
    if (!expectedIds.includes(finding.cardId)) fail('grounded_reviewer_unknown_card:' + finding.cardId);
    if (!['blocker', 'major', 'minor'].includes(finding.severity))
      fail('grounded_reviewer_severity:' + finding.findingId);
    if (!normalize(finding.dimension) || !normalize(finding.evidence) || !normalize(finding.issue))
      fail('grounded_reviewer_finding_incomplete:' + finding.findingId);
  }
  if (adjudication.batchId !== batch.batchId || adjudication.status !== 'closed')
    fail('grounded_adjudication_not_closed');
  const adjudicationIds = (adjudication.findings ?? []).map((finding) => finding.findingId);
  if (valueHash([...adjudicationIds].sort()) !== valueHash([...findingIds].sort()))
    fail('grounded_adjudication_finding_set');
  if (adjudication.machineReview?.status !== 'reviewed')
    fail('grounded_machine_candidates_not_adjudicated');
  if (adjudication.machineReview?.candidateCount !== machine.counts.novelTokenCandidates)
    fail('grounded_machine_candidate_count');

  const inputById = new Map(input.items.map((item) => [item.cardId, item]));
  const findingByCard = new Map();
  for (const finding of reviewer.findings ?? []) {
    const rows = findingByCard.get(finding.cardId) ?? [];
    rows.push(finding);
    findingByCard.set(finding.cardId, rows);
  }
  const adjudicationByFinding = new Map(
    (adjudication.findings ?? []).map((finding) => [finding.findingId, finding]),
  );
  const lines = [
    '# OPI 英文答案 v1/v2 来源约束校准批对照',
    '',
    '批次：`' + batch.batchId + '`',
    '',
    '问题锁：`' + batch.questionLockHash + '`',
    '',
    '校准 hash：`' + machine.calibrationHash + '`',
    '',
    '结果：' + machine.counts.dispositions.complete + ' 个完成答案，' +
      machine.counts.dispositions['source-insufficient'] + ' 个来源不足，' +
      machine.counts.dispositions['deferred-image-answer'] + ' 个图片延期。独立 Codex 已全量阅读 ' +
      reviewer.coverage.read + '/' + reviewer.coverage.total + '，发现 ' +
      reviewer.findings.length + ' 项问题，主 Codex 已逐项裁决关闭。',
    '',
    '说明：下列“来源片段”是从固定历史提交原始答案中确定性抽出的英文原文；工具只负责展示，选择、删减、最小修订和最终答案均由主 Codex 完成。',
    '',
  ];
  for (const [index, item] of batch.items.entries()) {
    const source = inputById.get(item.cardId);
    const segmentById = new Map(
      source.sources.flatMap((entry) =>
        entry.segments.map((segment) => [segment.segmentId, { ...segment, source: entry }]),
      ),
    );
    lines.push('## ' + String(index + 1).padStart(2, '0') + '. `' + item.cardId + '` · ' + source.topicName);
    lines.push('');
    lines.push('- 风险：' + item.riskTags.join('、'));
    lines.push('- 决定：`' + item.disposition + '`');
    lines.push('- 来源策略：`' + source.sourcePolicy + '`');
    lines.push('');
    lines.push('当前英文问题：');
    lines.push('');
    lines.push(markdownQuote(item.questionEn));
    lines.push('');
    lines.push('历史来源卡：');
    lines.push('');
    for (const entry of source.sources) {
      lines.push(
        '- `' + entry.sourceCardId + '`（release ' + entry.releaseVersion +
          '，`' + entry.commit.slice(0, 12) + '`）：' + entry.sourceQuestionEn,
      );
    }
    if (source.excludedMappings.length) {
      lines.push(
        '- 已排除映射：' + source.excludedMappings.map((entry) =>
          '`' + entry.sourceCardId + '`（' + entry.reason + '）').join('；'),
      );
    }
    lines.push('');
    const excerptIds = item.disposition === 'complete'
      ? item.selectedSegmentIds
      : item.consideredSegmentIds;
    lines.push(item.disposition === 'complete' ? '选用来源片段：' : '已审查但未采用的来源片段：');
    lines.push('');
    for (const segmentId of excerptIds) {
      const segment = segmentById.get(segmentId);
      lines.push('- `' + segmentId + '`，源卡 `' + segment.source.sourceCardId + '`');
      lines.push('');
      lines.push(markdownQuote(segment.text));
      lines.push('');
    }
    lines.push('编辑动作：' + item.editActions.join('；') + '。');
    lines.push('');
    lines.push('最终英文答案：');
    lines.push('');
    lines.push(item.answerEn ? markdownQuote(item.answerEn) : '> （留空）');
    lines.push('');
    lines.push('来源与风险结论：' + item.riskAssessment);
    lines.push('');
    const findings = findingByCard.get(item.cardId) ?? [];
    if (!findings.length) {
      lines.push('独立复核：通过。');
    } else {
      lines.push('独立复核与主裁决：');
      lines.push('');
      for (const finding of findings) {
        const decision = adjudicationByFinding.get(finding.findingId);
        lines.push(
          '- `' + finding.findingId + '` ' + finding.severity + '/' + finding.dimension +
            '：' + finding.issue + '；主裁决：' + decision.decision + '，' + decision.action,
        );
      }
    }
    lines.push('');
  }
  writeFileSync(groundedCalibrationComparisonPath, lines.join('\n') + '\n');
  console.log(
    'opi_grounded_answer_calibration_review_ok items=' + batch.items.length +
      ' findings=' + reviewer.findings.length +
      ' path=' + relative(projectRoot, groundedCalibrationComparisonPath),
  );
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node tools/opi-rebuild.mjs audit',
      '  node tools/opi-rebuild.mjs freeze',
      '  node tools/opi-rebuild.mjs prepare',
      '  node tools/opi-rebuild.mjs verify-baseline',
      '  node tools/opi-rebuild.mjs stage-status',
      '  node tools/opi-rebuild.mjs preflight-stage question-en|question-zh|answer-en|answer-zh',
      '  node tools/opi-rebuild.mjs verify-stage baseline|question-en|question-zh|answer-en|answer-zh [--require-seals]',
      '  node tools/opi-rebuild.mjs seal-batch <batch-id> <stage>',
      '  node tools/opi-rebuild.mjs invalidate-batch <batch-id> <stage> <authorization-file>',
      '  node tools/opi-rebuild.mjs build-review <stage> [all|batch-id]',
      '  node tools/opi-rebuild.mjs create-batch <batch-id> <stage> [topic-id...]',
      '  node tools/opi-rebuild.mjs ingest-reviewed-batch <batch-file>',
      '  node tools/opi-rebuild.mjs finalize-question-en-order <authorization-file>',
      '  node tools/opi-rebuild.mjs close-stage <stage> <authorization-file>',
      '  node tools/opi-rebuild.mjs lock-final-review <authorization-file>',
      '  node tools/opi-rebuild.mjs build-question-en-preview <release-version> <released-at-iso>',
      '  node tools/opi-rebuild.mjs apply <new-release-version> <released-at-iso>',
      '  node tools/opi-rebuild.mjs verify-formal',
      '  node tools/opi-rebuild.mjs verify-rollback',
      '  node tools/opi-rebuild.mjs rollback',
      '  node tools/opi-rebuild.mjs build-grounded-answer-baseline',
      '  node tools/opi-rebuild.mjs refresh-grounded-answer-baseline',
      '  node tools/opi-rebuild.mjs verify-grounded-answer-baseline',
      '  node tools/opi-rebuild.mjs verify-grounded-question-lock',
      '  node tools/opi-rebuild.mjs create-grounded-answer-calibration <card-id...>',
      '  node tools/opi-rebuild.mjs verify-grounded-answer-calibration [calibration-file]',
      '  node tools/opi-rebuild.mjs build-grounded-answer-calibration-review',
      '  node tools/opi-rebuild.mjs plan-grounded-answer-batches',
      '  node tools/opi-rebuild.mjs refresh-grounded-answer-batch-plan',
      '  node tools/opi-rebuild.mjs verify-grounded-answer-batch-plan',
      '  node tools/opi-rebuild.mjs verify-grounded-answer-batch <batch-id>',
      '  node tools/opi-rebuild.mjs apply-grounded-answer-cross-batch-audit',
      '  node tools/opi-rebuild.mjs build-grounded-answer-final-audit',
      '  node tools/opi-rebuild.mjs build-grounded-answer-preview <release-version> <released-at-iso>',
    ].join('\n'),
  );
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'audit') commandAudit();
  else if (command === 'freeze') commandFreeze();
  else if (command === 'prepare') commandPrepare();
  else if (command === 'verify-baseline') commandVerifyBaseline();
  else if (command === 'stage-status') commandStageStatus();
  else if (command === 'preflight-stage') commandPreflightStage(args[0]);
  else if (command === 'verify-stage') commandVerifyStage(args[0], args.includes('--require-seals'));
  else if (command === 'seal-batch') commandSealBatch(args[0], args[1]);
  else if (command === 'invalidate-batch') commandInvalidateBatch(args[0], args[1], args[2]);
  else if (command === 'build-review') commandBuildReview(args[0], args[1] ?? 'all');
  else if (command === 'create-batch') commandCreateBatch(args[0], args[1], args.slice(2));
  else if (command === 'ingest-reviewed-batch') commandIngestReviewedBatch(args[0]);
  else if (command === 'finalize-question-en-order') commandFinalizeQuestionEnOrder(args[0]);
  else if (command === 'close-stage') commandCloseStage(args[0], args[1]);
  else if (command === 'lock-final-review') commandLockFinalReview(args[0]);
  else if (command === 'build-question-en-preview') commandBuildQuestionEnPreview(args[0], args[1]);
  else if (command === 'apply') commandApply(args[0], args[1]);
  else if (command === 'verify-formal') commandVerifyFormal();
  else if (command === 'verify-rollback') commandVerifyRollback();
  else if (command === 'rollback') commandRollback();
  else if (command === 'build-grounded-answer-baseline') commandBuildGroundedAnswerBaseline();
  else if (command === 'refresh-grounded-answer-baseline') commandRefreshGroundedAnswerBaseline();
  else if (command === 'verify-grounded-answer-baseline') commandVerifyGroundedAnswerBaseline();
  else if (command === 'verify-grounded-question-lock') commandVerifyGroundedQuestionLock();
  else if (command === 'create-grounded-answer-calibration')
    commandCreateGroundedAnswerCalibration(args);
  else if (command === 'verify-grounded-answer-calibration')
    commandVerifyGroundedAnswerCalibration(args[0]);
  else if (command === 'build-grounded-answer-calibration-review')
    commandBuildGroundedAnswerCalibrationReview();
  else if (command === 'plan-grounded-answer-batches') commandPlanGroundedAnswerBatches();
  else if (command === 'refresh-grounded-answer-batch-plan')
    commandRefreshGroundedAnswerBatchPlan();
  else if (command === 'verify-grounded-answer-batch-plan')
    commandVerifyGroundedAnswerBatchPlan();
  else if (command === 'verify-grounded-answer-batch')
    commandVerifyGroundedAnswerBatch(args[0]);
  else if (command === 'apply-grounded-answer-cross-batch-audit')
    commandApplyGroundedAnswerCrossBatchAudit();
  else if (command === 'build-grounded-answer-final-audit')
    commandBuildGroundedAnswerFinalAudit();
  else if (command === 'build-grounded-answer-preview')
    commandBuildGroundedAnswerPreview(args[0], args[1]);
  else {
    printUsage();
    if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error('opi_rebuild_failed ' + error.message);
  process.exitCode = 1;
}
