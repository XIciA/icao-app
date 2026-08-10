import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = join(root, 'content/question-banks');
const bankRoot = join(contentRoot, 'banks/radiotelephony');
const topicRoot = join(bankRoot, 'topics');
const registryPath = join(contentRoot, 'registry.json');
const bankPath = join(bankRoot, 'bank.json');
const jalCategoryPath = join(bankRoot, 'categories/atc-jal.json');
const embeddedPath = join(root, 'src/features/question-bank/data/question-bank.json');
const embeddedReleasePath = join(root, 'src/features/question-bank/data/question-bank-release.json');
const releaseRoot = join(root, 'dist/question-bank-release');
const releaseManifestPath = join(releaseRoot, 'manifest.json');
const releaseBankPath = join(releaseRoot, 'banks/radiotelephony.json');
const releaseResourceManifestPath = join(releaseRoot, 'resources/manifest.json');
const reportPath = join(
  root,
  'docs/workstreams/web-question-bank-content-migration/reports/radiotelephony-callsign-correction-review.md',
);
const ledgerPath = join(
  root,
  'docs/workstreams/web-question-bank-content-migration/reports/radiotelephony-callsign-correction-ledger.json',
);

const baselineReleaseVersion = 10;
const targetReleaseVersion = 11;
const baselineRadiotelephonyChecksum = 'bde49b9b44e2c3b5bc562d816748888e467cd54490114f3780807cab513f2547';
const expectedResourceManifestChecksum = '94525c1fd882667345b733d2e26885c2f761e725b0f3b454b4e4c914e3533693';
const expectedResourceFiles = 6081;
const expectedResourceBytes = 814518693;
const textFields = ['taskTitle', 'audioText', 'audioTextZh', 'referenceText', 'referenceTextZh'];

const mappings = [
  { number: '0014', to: 'SIA 334', variants: { 'SIA 1334': 31 } },
  { number: '0024', to: 'AFR 939', variants: { 'AFR 9939': 49 } },
  { number: '0031', to: 'BAW 352', variants: { 'BAW 2352': 58 } },
  { number: '0068', to: 'CCA 301', variants: { 'CCA 1301': 61 } },
  { number: '0069', to: 'CCA 432', variants: { 'CCA 1432': 46 } },
  { number: '0070', to: 'CCA 368', variants: { 'CCA 1368': 49 } },
  { number: '0077', to: 'CSN 102', variants: { 'CSN 3102': 46 } },
  { number: '0078', to: 'CSN 109', variants: { 'CSN 3109': 49 } },
  { number: '0079', to: 'CSN 310', variants: { 'CSN 1310': 52 } },
  { number: '0080', to: 'CSN 202', variants: { 'CSN 6202': 64 } },
  { number: '0081', to: 'CSN 353', variants: { 'CSN 7353': 49 } },
  { number: '0082', to: 'CSN 311', variants: { 'CSN 3112': 58, 'CSN 112': 22, 'CSN 7112': 6 } },
  { number: '0083', to: 'CSN 102', variants: { 'CSN 3102': 58 } },
  { number: '0084', to: 'CSN 001', variants: { 'CSN 3001': 52, 'CSN 7001': 2 } },
  { number: '0085', to: 'CSN 102', variants: { 'CSN 3102': 64, 'CSN 7102': 2 } },
  { number: '0086', to: 'CSN 235', variants: { 'CSN 3235': 46 } },
  { number: '0087', to: 'CSN 682', variants: { 'CSN 6682': 52 } },
  { number: '0088', to: 'CSN 302', variants: { 'CSN 9302': 58 } },
  { number: '0095', to: 'CES 151', variants: { 'CES 2151': 46 } },
  { number: '0096', to: 'CES 102', variants: { 'CES 5102': 55 } },
  { number: '0097', to: 'CES 325', variants: { 'CES 5325': 70 } },
  { number: '0099', to: 'CES 277', variants: { 'CES 5277': 49 } },
  { number: '0102', to: 'CSN 426', variants: { 'CSN 3426': 34 } },
  { number: '0124', to: 'BAW 352', variants: { 'BAW 2352': 20 } },
  { number: '0160', to: 'CSN 302', variants: { 'CSN 9302': 82, 'CSN 3902': 2 } },
  { number: '0165', to: 'AFR 939', variants: { 'AFR 9939': 37 } },
].map((mapping) => ({ ...mapping, topicId: `atc-scenario-${mapping.number}` }));

const deletionTargets = [
  {
    topicId: 'atc-scenario-0044',
    cardId: 'atc-scenario-0044-card-main-747',
    taskTitle: 'JAL 220-2',
    audio: '/question-bank-assets/audio/radiotelephony/main/747.mp3',
  },
  {
    topicId: 'atc-scenario-0182',
    cardId: 'atc-scenario-0182-card-main-3132',
    taskTitle: 'JAL 220-2',
    audio: '/question-bank-assets/audio/radiotelephony/web-v6/pepec-radiotelephony-083-jal220-q02.mp3',
  },
];

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileChecksum(path) {
  return sha256(readFileSync(path));
}

function relativePath(path) {
  return relative(root, path);
}

function topicPath(topicId) {
  return join(topicRoot, `${topicId}.json`);
}

function allTargetSourcePaths() {
  return [
    registryPath,
    bankPath,
    jalCategoryPath,
    ...new Set([...mappings.map((mapping) => topicPath(mapping.topicId)), ...deletionTargets.map((target) => topicPath(target.topicId))]),
  ].sort();
}

function sourceFingerprint(paths = allTargetSourcePaths()) {
  const hash = createHash('sha256');
  const files = {};
  for (const path of paths) {
    const bytes = readFileSync(path);
    const name = relativePath(path);
    files[name] = sha256(bytes);
    hash.update(name);
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return { checksum: hash.digest('hex'), files };
}

function stringSlots(topic) {
  const slots = [{ entityType: 'topic', entityId: topic.id, field: 'name', owner: topic }];
  for (const card of topic.cards) {
    for (const field of textFields) {
      if (typeof card[field] === 'string') {
        slots.push({ entityType: 'card', entityId: card.id, field, owner: card });
      }
    }
  }
  return slots;
}

function occurrences(value, literal) {
  if (!literal) return 0;
  return value.split(literal).length - 1;
}

function callsignFromTitle(value) {
  const match = value.match(/\b(QFA|SIA|AFR|BAW|UAL|KLM|JAL|ACA|CCA|CSN|CES)\s+(\d{1,4})\b/u);
  return match ? `${match[1]} ${match[2]}` : null;
}

function loadFullBankGraph() {
  const bank = readJson(bankPath);
  const categories = bank.categoryIds.map((categoryId) => {
    const category = readJson(join(bankRoot, 'categories', `${categoryId}.json`));
    return {
      ...category,
      topics: category.topicIds.map((topicId) => readJson(topicPath(topicId))),
    };
  });
  return { ...bank, categories };
}

function countGraph(graph) {
  let topics = 0;
  let cards = 0;
  for (const category of graph.categories) {
    topics += category.topics.length;
    cards += category.topics.reduce((sum, topic) => sum + topic.cards.length, 0);
  }
  return { categories: graph.categories.length, topics, cards };
}

function mappingCounts(mapping, topic) {
  const counts = Object.fromEntries(Object.keys(mapping.variants).map((variant) => [variant, 0]));
  for (const slot of stringSlots(topic)) {
    for (const variant of Object.keys(mapping.variants)) {
      counts[variant] += occurrences(slot.owner[slot.field], variant);
    }
  }
  return counts;
}

function assertBaseline() {
  const registry = readJson(registryPath);
  if (registry.releaseVersion !== baselineReleaseVersion) {
    fail(`baseline_release_version:${registry.releaseVersion}/${baselineReleaseVersion}`);
  }
  const graph = loadFullBankGraph();
  const counts = countGraph(graph);
  if (counts.categories !== 11 || counts.topics !== 186 || counts.cards !== 3218) {
    fail(`baseline_counts:${JSON.stringify(counts)}`);
  }

  let replacements = 0;
  for (const mapping of mappings) {
    const topic = readJson(topicPath(mapping.topicId));
    const actual = mappingCounts(mapping, topic);
    for (const [variant, expected] of Object.entries(mapping.variants)) {
      if (actual[variant] !== expected) {
        fail(`baseline_variant_count:${mapping.topicId}:${variant}:${actual[variant]}/${expected}`);
      }
      replacements += actual[variant];
    }
  }
  if (replacements !== 1369) fail(`baseline_replacement_count:${replacements}/1369`);

  for (const target of deletionTargets) {
    const topic = readJson(topicPath(target.topicId));
    const card = topic.cards.find((candidate) => candidate.id === target.cardId);
    if (!card || card.taskTitle !== target.taskTitle || card.audio !== target.audio) {
      fail(`baseline_deletion_target:${target.cardId}`);
    }
  }

  if (!existsSync(releaseManifestPath) || !existsSync(releaseBankPath)) fail('baseline_release_missing');
  const releaseManifest = readJson(releaseManifestPath);
  const bankEntry = releaseManifest.banks.find((bank) => bank.id === 'radiotelephony');
  if (
    releaseManifest.releaseVersion !== baselineReleaseVersion
    || bankEntry?.checksum !== baselineRadiotelephonyChecksum
    || fileChecksum(releaseBankPath) !== baselineRadiotelephonyChecksum
  ) {
    fail('baseline_release_checksum');
  }
  return { counts, replacements };
}

function replaceMapping(mapping, topic, sourceFile, fieldChanges) {
  const actual = Object.fromEntries(Object.keys(mapping.variants).map((variant) => [variant, 0]));
  for (const slot of stringSlots(topic)) {
    const before = slot.owner[slot.field];
    let after = before;
    const replacements = {};
    for (const variant of Object.keys(mapping.variants).sort((left, right) => right.length - left.length)) {
      const count = occurrences(after, variant);
      if (!count) continue;
      after = after.split(variant).join(mapping.to);
      actual[variant] += count;
      replacements[variant] = count;
    }
    if (after !== before) {
      slot.owner[slot.field] = after;
      fieldChanges.push({
        sourceFile,
        topicId: mapping.topicId,
        entityType: slot.entityType,
        entityId: slot.entityId,
        field: slot.field,
        before,
        after,
        replacements,
      });
    }
  }
  for (const [variant, expected] of Object.entries(mapping.variants)) {
    if (actual[variant] !== expected) {
      fail(`apply_variant_count:${mapping.topicId}:${variant}:${actual[variant]}/${expected}`);
    }
  }
  return actual;
}

function updateValue(owner, field, value, change) {
  if (owner[field] === value) return;
  change.before = owner[field];
  change.after = value;
  owner[field] = value;
}

function renderReport(ledger) {
  const lines = [
    '# 陆空通话呼号修正测试应用复核清单',
    '',
    '> 定位格式：航司分类 → 修正后场景名 → 场景 ID → 任务标题。勾选项仅用于人工页面抽查，正式修正结论已按用户统计锁定。',
    '',
    '## 发布候选',
    '',
    `- 本地题库版本：v${ledger.release.to}`,
    `- 陆空通话：${ledger.result.radiotelephony.topics} 场景 / ${ledger.result.radiotelephony.cards} 卡`,
    `- 陆空通话 checksum：${ledger.build?.radiotelephonyChecksum ? `\`${ledger.build.radiotelephonyChecksum}\`` : '等待本地构建'}`,
    `- 资源 manifest：${ledger.build?.resourceManifestChecksum ? `\`${ledger.build.resourceManifestChecksum}\`` : '等待本地构建'}；资源不变`,
    '',
    '## A. 已删除的跨场景错误题',
    '',
    '| 复核 | 航司 | 场景 | 原任务标题 | 卡 ID | 原音频路径 |',
    '|---|---|---|---|---|---|',
    ...ledger.deletions.map((item) =>
      `| □ | JAL | ${item.topicId} · ${item.topicName} | ${item.taskTitle} | \`${item.cardId}\` | \`${item.audio}\` |`),
    '',
    '删除后两个场景均按页面连续显示 `JAL 220-1` 至 `JAL 220-14`；原音频文件保留，不重新映射。',
    '',
    '## B/C. 已统一的场景呼号',
    '',
    '| 复核 | 航司 | 场景 ID | 修正后场景名 | 原错误呼号 | 最终呼号 | 任务标题范围 |',
    '|---|---|---|---|---|---|---|',
    ...ledger.mappings.map((item) => {
      const carrier = item.finalCallsign.split(' ')[0];
      const range = `\`${item.finalCallsign}-1\` 至 \`${item.finalCallsign}-${item.cards}\``;
      return `| □ | ${carrier} | ${item.topicId} | ${item.finalSceneName} | ${item.oldCallsigns.map((value) => `\`${value}\``).join('、')} | \`${item.finalCallsign}\` | ${range} |`;
    }),
    '',
    '## D. 语境串题候选',
    '',
    '- 本轮不处理；继续保留在完整音频原文语境审查报告中。',
    '',
    '## 自动检查结论',
    '',
    `- 场景级错误呼号替换：${ledger.result.replacements} 处。`,
    `- 删除错误卡：${ledger.deletions.length} 张。`,
    `- 非目标卡 ID、音频路径和资源 manifest：${ledger.build ? '已验证未变化' : '等待本地构建验证'}。`,
  ];
  return `${lines.join('\n')}\n`;
}

function applyCorrection(releasedAtArgument) {
  const registry = readJson(registryPath);
  if (registry.releaseVersion >= targetReleaseVersion) {
    assertCorrectedState({ exactRelease: false });
    process.stdout.write(`radiotelephony_callsign_correction_noop release=${registry.releaseVersion}\n`);
    return;
  }
  const baseline = assertBaseline();
  const releasedAt = releasedAtArgument ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(releasedAt))) fail(`released_at_invalid:${releasedAt}`);
  const input = sourceFingerprint();
  const fieldChanges = [];
  const metadataChanges = [];
  const mappingResults = [];

  for (const mapping of mappings) {
    const path = topicPath(mapping.topicId);
    const topic = readJson(path);
    const originalName = topic.name;
    const counts = replaceMapping(mapping, topic, relativePath(path), fieldChanges);
    if (callsignFromTitle(topic.name) !== mapping.to) {
      fail(`topic_callsign_after:${mapping.topicId}:${callsignFromTitle(topic.name)}/${mapping.to}`);
    }
    for (const card of topic.cards) {
      if (callsignFromTitle(card.taskTitle) !== mapping.to) {
        fail(`task_callsign_after:${card.id}:${callsignFromTitle(card.taskTitle)}/${mapping.to}`);
      }
    }
    writeJson(path, topic);
    mappingResults.push({
      topicId: mapping.topicId,
      categoryId: topic.categoryId,
      originalSceneName: originalName,
      finalSceneName: topic.name,
      oldCallsigns: Object.keys(mapping.variants),
      finalCallsign: mapping.to,
      replacements: Object.values(counts).reduce((sum, count) => sum + count, 0),
      cards: topic.cards.length,
    });
  }

  const deletions = [];
  const renumberings = [];
  for (const target of deletionTargets) {
    const path = topicPath(target.topicId);
    const topic = readJson(path);
    const index = topic.cards.findIndex((card) => card.id === target.cardId);
    if (index < 0) fail(`deletion_target_missing:${target.cardId}`);
    const [removed] = topic.cards.splice(index, 1);
    deletions.push({
      topicId: topic.id,
      topicName: topic.name,
      cardId: removed.id,
      taskTitle: removed.taskTitle,
      audio: removed.audio,
      card: removed,
    });
    for (let cardIndex = 0; cardIndex < topic.cards.length; cardIndex += 1) {
      const card = topic.cards[cardIndex];
      const expectedTitle = `JAL 220-${cardIndex + 1}`;
      if (card.taskTitle !== expectedTitle) {
        renumberings.push({
          sourceFile: relativePath(path),
          topicId: topic.id,
          cardId: card.id,
          before: card.taskTitle,
          after: expectedTitle,
        });
        card.taskTitle = expectedTitle;
      }
    }
    const declaredBefore = topic.declaredCardCount;
    topic.declaredCardCount = topic.cards.length;
    metadataChanges.push({
      sourceFile: relativePath(path),
      entityId: topic.id,
      field: 'declaredCardCount',
      before: declaredBefore,
      after: topic.declaredCardCount,
    });
    writeJson(path, topic);
  }

  const jalCategory = readJson(jalCategoryPath);
  updateValue(jalCategory, 'declaredCardCount', 58, {
    sourceFile: relativePath(jalCategoryPath),
    entityId: jalCategory.id,
    field: 'declaredCardCount',
  });
  metadataChanges.push({
    sourceFile: relativePath(jalCategoryPath),
    entityId: jalCategory.id,
    field: 'declaredCardCount',
    before: 60,
    after: 58,
  });
  writeJson(jalCategoryPath, jalCategory);

  const bank = readJson(bankPath);
  metadataChanges.push({
    sourceFile: relativePath(bankPath),
    entityId: bank.id,
    field: 'declaredCardCount',
    before: bank.declaredCardCount,
    after: 3216,
  });
  metadataChanges.push({
    sourceFile: relativePath(bankPath),
    entityId: bank.id,
    field: 'summary',
    before: bank.summary,
    after: '186 场景 / 3216 卡',
  });
  bank.declaredCardCount = 3216;
  bank.summary = '186 场景 / 3216 卡';
  writeJson(bankPath, bank);

  metadataChanges.push({
    sourceFile: relativePath(registryPath),
    entityId: 'question-bank-registry',
    field: 'releaseVersion',
    before: registry.releaseVersion,
    after: targetReleaseVersion,
  });
  metadataChanges.push({
    sourceFile: relativePath(registryPath),
    entityId: 'question-bank-registry',
    field: 'releasedAt',
    before: registry.releasedAt,
    after: releasedAt,
  });
  registry.releaseVersion = targetReleaseVersion;
  registry.releasedAt = releasedAt;
  writeJson(registryPath, registry);

  const output = sourceFingerprint();
  const ledger = {
    schemaVersion: 1,
    status: 'applied-awaiting-build',
    release: {
      from: baselineReleaseVersion,
      to: targetReleaseVersion,
      releasedAt,
    },
    baseline: {
      ...baseline,
      radiotelephonyChecksum: baselineRadiotelephonyChecksum,
      sourceFingerprint: input.checksum,
      files: input.files,
    },
    result: {
      replacements: mappingResults.reduce((sum, item) => sum + item.replacements, 0),
      deletedCards: deletions.length,
      radiotelephony: { categories: 11, topics: 186, cards: 3216 },
      allBanks: { banks: 5, topics: 341, cards: 6865 },
      sourceFingerprint: output.checksum,
      files: output.files,
    },
    mappings: mappingResults,
    fieldChanges,
    deletions,
    renumberings,
    metadataChanges,
    build: null,
    verification: null,
  };
  if (ledger.result.replacements !== 1369) fail(`result_replacements:${ledger.result.replacements}/1369`);
  writeJson(ledgerPath, ledger);
  writeFileSync(reportPath, renderReport(ledger));
  assertCorrectedState({ exactRelease: true });
  process.stdout.write(
    `radiotelephony_callsign_correction_applied ${JSON.stringify({
      releaseVersion: targetReleaseVersion,
      topics: mappings.length,
      replacements: ledger.result.replacements,
      deletedCards: deletions.length,
      cards: 3216,
      sourceFingerprint: output.checksum,
    })}\n`,
  );
}

function assertCorrectedState({ exactRelease = false } = {}) {
  const registry = readJson(registryPath);
  if (
    (exactRelease && registry.releaseVersion !== targetReleaseVersion)
    || (!exactRelease && registry.releaseVersion < targetReleaseVersion)
  ) {
    fail(`corrected_release_version:${registry.releaseVersion}`);
  }
  const graph = loadFullBankGraph();
  const counts = countGraph(graph);
  if (counts.categories !== 11 || counts.topics !== 186 || counts.cards !== 3216) {
    fail(`corrected_counts:${JSON.stringify(counts)}`);
  }
  if (graph.declaredTopicCount !== 186 || graph.declaredCardCount !== 3216 || graph.summary !== '186 场景 / 3216 卡') {
    fail('corrected_bank_metadata');
  }

  for (const mapping of mappings) {
    const topic = readJson(topicPath(mapping.topicId));
    if (callsignFromTitle(topic.name) !== mapping.to) {
      fail(`corrected_topic_callsign:${mapping.topicId}`);
    }
    const remaining = mappingCounts(mapping, topic);
    for (const [variant, count] of Object.entries(remaining)) {
      if (count !== 0) fail(`corrected_variant_remaining:${mapping.topicId}:${variant}:${count}`);
    }
    for (const card of topic.cards) {
      if (callsignFromTitle(card.taskTitle) !== mapping.to) {
        fail(`corrected_task_callsign:${card.id}`);
      }
    }
  }

  for (const target of deletionTargets) {
    const topic = readJson(topicPath(target.topicId));
    if (topic.cards.some((card) => card.id === target.cardId)) fail(`corrected_deleted_card_present:${target.cardId}`);
    if (topic.cards.length !== 14 || topic.declaredCardCount !== 14) fail(`corrected_jal_count:${target.topicId}`);
    const titles = topic.cards.map((card) => card.taskTitle);
    const expected = Array.from({ length: 14 }, (_, index) => `JAL 220-${index + 1}`);
    if (JSON.stringify(titles) !== JSON.stringify(expected)) fail(`corrected_jal_titles:${target.topicId}`);
  }

  const jalCategory = readJson(jalCategoryPath);
  if (jalCategory.declaredCardCount !== 58) fail(`corrected_jal_category_count:${jalCategory.declaredCardCount}`);
  return { registry, counts };
}

function buildEvidence() {
  const { registry } = assertCorrectedState({ exactRelease: true });
  if (!existsSync(releaseManifestPath) || !existsSync(releaseBankPath) || !existsSync(releaseResourceManifestPath)) {
    fail('build_artifacts_missing');
  }
  const manifestBytes = readFileSync(releaseManifestPath);
  const manifest = JSON.parse(manifestBytes);
  const bankBytes = readFileSync(releaseBankPath);
  const resourceBytes = readFileSync(releaseResourceManifestPath);
  const bankEntry = manifest.banks.find((bank) => bank.id === 'radiotelephony');
  if (
    manifest.releaseVersion !== targetReleaseVersion
    || manifest.releasedAt !== registry.releasedAt
    || bankEntry?.cards !== 3216
    || bankEntry?.topics !== 186
    || bankEntry?.checksum !== sha256(bankBytes)
  ) {
    fail('build_radiotelephony_manifest');
  }
  if (
    manifest.banks.reduce((sum, bank) => sum + bank.cards, 0) !== 6865
    || manifest.banks.reduce((sum, bank) => sum + bank.topics, 0) !== 341
  ) {
    fail('build_global_counts');
  }
  const resourceChecksum = sha256(resourceBytes);
  if (
    resourceChecksum !== expectedResourceManifestChecksum
    || manifest.resources.checksum !== expectedResourceManifestChecksum
    || manifest.resources.files !== expectedResourceFiles
    || manifest.resources.sizeBytes !== expectedResourceBytes
  ) {
    fail('build_resource_manifest_changed');
  }
  const embeddedRelease = readJson(embeddedReleasePath);
  if (
    embeddedRelease.releaseVersion !== targetReleaseVersion
    || embeddedRelease.releasedAt !== registry.releasedAt
  ) {
    fail('build_embedded_release');
  }
  const embeddedBank = readJson(embeddedPath).find((bank) => bank.id === 'radiotelephony');
  if (!embeddedBank || JSON.stringify(embeddedBank) !== JSON.stringify(JSON.parse(bankBytes))) {
    fail('build_embedded_bank_drift');
  }
  return {
    manifestChecksum: sha256(manifestBytes),
    radiotelephonyChecksum: bankEntry.checksum,
    resourceManifestChecksum: resourceChecksum,
    resources: {
      files: manifest.resources.files,
      sizeBytes: manifest.resources.sizeBytes,
    },
    counts: {
      banks: manifest.banks.length,
      topics: manifest.banks.reduce((sum, bank) => sum + bank.topics, 0),
      cards: manifest.banks.reduce((sum, bank) => sum + bank.cards, 0),
      radiotelephonyTopics: bankEntry.topics,
      radiotelephonyCards: bankEntry.cards,
    },
  };
}

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

function verifyHandoff() {
  if (!existsSync(ledgerPath)) fail('ledger_missing');
  const ledger = readJson(ledgerPath);
  if (ledger.release?.to !== targetReleaseVersion || ledger.result?.replacements !== 1369) {
    fail('ledger_invalid');
  }
  run('pnpm', ['content:build']);
  run('pnpm', ['content:check:full']);
  run('pnpm', ['content:radiotelephony:text-audit']);
  run('pnpm', ['content:radiotelephony:text-audit:check']);
  run(process.execPath, ['tools/radiotelephony-audio-text-context-audit.mjs', '--self-test']);
  const auditReport = readFileSync(
    join(root, 'docs/workstreams/web-question-bank-content-migration/reports/radiotelephony-audio-text-context-audit.md'),
    'utf8',
  );
  if (!/候选卡：\d+（P0 0、P1 0、P2 \d+、P3 \d+）。/u.test(auditReport)) {
    fail('audit_p0_p1_not_cleared');
  }
  const build = buildEvidence();
  const verified = {
    ...ledger,
    status: 'local-v11-verified',
    build,
    verification: {
      verifiedAt: ledger.release.releasedAt,
      commands: [
        'pnpm content:build',
        'pnpm content:check:full',
        'pnpm content:radiotelephony:text-audit',
        'pnpm content:radiotelephony:text-audit:check',
        'node tools/radiotelephony-audio-text-context-audit.mjs --self-test',
        'pnpm content:radiotelephony:callsign:check',
      ],
      p0: 0,
      p1: 0,
      result: 'pass',
    },
  };
  writeJson(ledgerPath, verified);
  writeFileSync(reportPath, renderReport(verified));
  process.stdout.write(
    `radiotelephony_callsign_handoff_verified ${JSON.stringify({
      releaseVersion: targetReleaseVersion,
      radiotelephonyChecksum: build.radiotelephonyChecksum,
      resourceManifestChecksum: build.resourceManifestChecksum,
      cards: build.counts.cards,
      radiotelephonyCards: build.counts.radiotelephonyCards,
    })}\n`,
  );
}

function checkCorrection() {
  const { registry, counts } = assertCorrectedState({ exactRelease: false });
  const ledger = readJson(ledgerPath);
  if (
    ledger.schemaVersion !== 1
    || ledger.release?.to !== targetReleaseVersion
    || ledger.result?.replacements !== 1369
    || ledger.result?.deletedCards !== 2
  ) {
    fail('correction_ledger_invalid');
  }
  if (registry.releaseVersion === targetReleaseVersion) {
    const fingerprint = sourceFingerprint();
    if (fingerprint.checksum !== ledger.result.sourceFingerprint) {
      fail(`correction_source_fingerprint:${fingerprint.checksum}/${ledger.result.sourceFingerprint}`);
    }
    if (ledger.status === 'local-v11-verified') {
      const build = buildEvidence();
      if (JSON.stringify(build) !== JSON.stringify(ledger.build)) fail('correction_build_evidence_drift');
    }
  }
  if (!existsSync(reportPath) || readFileSync(reportPath, 'utf8') !== renderReport(ledger)) {
    fail('correction_report_out_of_date');
  }
  process.stdout.write(
    `radiotelephony_callsign_correction_ok ${JSON.stringify({
      releaseVersion: registry.releaseVersion,
      topics: counts.topics,
      cards: counts.cards,
      replacements: ledger.result.replacements,
      deletedCards: ledger.result.deletedCards,
      status: ledger.status,
    })}\n`,
  );
}

function runSelfTest() {
  if (mappings.length !== 26) fail(`self_test_mapping_count:${mappings.length}`);
  const replacements = mappings.reduce(
    (sum, mapping) => sum + Object.values(mapping.variants).reduce((mappingSum, count) => mappingSum + count, 0),
    0,
  );
  if (replacements !== 1369) fail(`self_test_replacement_count:${replacements}`);
  if (new Set(mappings.map((mapping) => mapping.topicId)).size !== mappings.length) fail('self_test_topic_uniqueness');
  process.stdout.write('radiotelephony_callsign_correction_self_test_ok\n');
}

const [command, ...args] = process.argv.slice(2);
const releasedAtIndex = args.indexOf('--released-at');
const releasedAt = releasedAtIndex >= 0 ? args[releasedAtIndex + 1] : undefined;
const allowedArguments = new Set(['--released-at', releasedAt]);
if (args.some((argument) => !allowedArguments.has(argument))) {
  fail('usage: radiotelephony-callsign-correction.mjs <apply|check|verify-handoff|self-test> [--released-at ISO]');
}

if (command === 'apply') applyCorrection(releasedAt);
else if (command === 'check') checkCorrection();
else if (command === 'verify-handoff') verifyHandoff();
else if (command === 'self-test') runSelfTest();
else fail('usage: radiotelephony-callsign-correction.mjs <apply|check|verify-handoff|self-test> [--released-at ISO]');
