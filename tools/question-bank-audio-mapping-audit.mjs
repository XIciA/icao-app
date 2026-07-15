import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const embeddedPath = join(root, 'src/features/question-bank/data/question-bank.json');
const audioIndexPath = join(root, 'src/features/question-bank/data/audio-index.json');
const contentRoot = join(root, 'content/question-banks');
const banksRoot = join(contentRoot, 'banks');
const resourceManifestPath = join(contentRoot, 'resources/manifest.source.json');
const localAudioOverlayRoot = join(contentRoot, 'resources/audio');
const registryPath = join(contentRoot, 'registry.json');
const upstreamRoot = resolve(process.env.QUESTION_BANK_UPSTREAM_ROOT
  ?? '/Users/zhouyide/Desktop/icao项目/feizhuicu');
const sourceDataRoot = join(upstreamRoot, 'public/data/question-bank/mini-v1');
const sourceAudioRoot = join(upstreamRoot, 'public/question-bank');
const canonicalAudioRoot = resolve(process.env.QUESTION_BANK_CURRENT_AUDIO_ROOT
  ?? '/Users/zhouyide/Desktop/icao设计稿/public/question-bank-assets/audio');
const outputRoot = join(root, 'docs/workstreams/question-bank-audio-mapping-audit');
const applyReportPath = join(outputRoot, 'apply-report.json');
const audioPrefix = '/question-bank-assets/audio/';
const localAudioBankIds = ['listening', 'sentences900', 'radiotelephony', 'storytelling'];
const expectedBankCounts = { listening: 631, sentences900: 900, radiotelephony: 1851, storytelling: 296, opi: 1356 };
const expectedInitialAffected = 3269;
const restoredListeningPath = '/question-bank-assets/audio/listening/main/454.mp3';
const retainedListeningPath = '/question-bank-assets/audio/listening/main/595.mp3';
const restoredListeningChecksum = 'a0722b82f2d5a22cba9a0fad0f8b7f06d98eab8d596691eedcbde6e74f20067f';
const restoredListeningSize = 128300;
const hashCache = new Map();

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

function hashFile(path) {
  if (!hashCache.has(path)) hashCache.set(path, createHash('sha256').update(readFileSync(path)).digest('hex'));
  return hashCache.get(path);
}

function hashValue(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stripAudio(value) {
  if (Array.isArray(value)) return value.map(stripAudio);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'audio')
    .map(([key, child]) => [key, stripAudio(child)]));
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function stablePublicPath(bankId, cardId) {
  let match;
  if (bankId === 'listening' && (match = cardId.match(/^listening-main-(\d{3})$/))) {
    return `${audioPrefix}listening/main/${match[1]}.mp3`;
  }
  if (bankId === 'sentences900' && (match = cardId.match(/^sentence900-main-(\d{3})$/))) {
    return `${audioPrefix}sentence900/main/${match[1]}.mp3`;
  }
  if (bankId === 'radiotelephony' && (match = cardId.match(/^atc-scenario-\d{4}-card-main-(\d{3,4})$/))) {
    return `${audioPrefix}radiotelephony/main/${match[1]}.mp3`;
  }
  if (bankId === 'storytelling' && (match = cardId.match(/^story-(koala|kongguan|wing)-(\d{3})$/))) {
    return `${audioPrefix}storytelling/${match[1]}/${match[2]}.mp3`;
  }
  fail(`unsupported_stable_audio_id:${bankId}:${cardId}`);
}

function publicToSourceRelative(publicPath) {
  return publicPath.replace(audioPrefix, '')
    .replace(/^radiotelephony\//, 'atc/')
    .replace(/^storytelling\//, 'story/');
}

function resolveCanonicalAsset(publicPath) {
  const relative = publicPath.replace(audioPrefix, '');
  const overlay = join(localAudioOverlayRoot, relative);
  if (existsSync(overlay)) return overlay;
  return join(canonicalAudioRoot, relative);
}

function loadUpstreamCards() {
  const listening = readJson(join(sourceDataRoot, 'listening/questions.json')).questions
    .map((item) => ({ bankId: 'listening', id: item.id, mediaAudio: item.media?.audio }));
  const sentences900 = readJson(join(sourceDataRoot, 'sentence900/questions.json')).questions
    .map((item) => ({ bankId: 'sentences900', id: item.id, mediaAudio: item.media?.audio }));
  const radiotelephony = readJson(join(sourceDataRoot, 'atc/scenarios.json')).scenarios
    .flatMap((scenario) => scenario.cards.map((item) => ({ bankId: 'radiotelephony', id: item.id, mediaAudio: item.media?.audio })));
  const storytelling = readJson(join(sourceDataRoot, 'story/questions.json')).questions
    .map((item) => ({ bankId: 'storytelling', id: item.id, mediaAudio: item.media?.audio }));
  const cards = [...listening, ...sentences900, ...radiotelephony, ...storytelling];
  if (new Set(cards.map((card) => card.id)).size !== cards.length) fail('duplicate_upstream_card_id');
  return cards;
}

function flattenEmbedded() {
  return readJson(embeddedPath).flatMap((bank) => bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards.map((card) => ({
    audio: card.audio,
    audioText: card.audioText,
    bankId: bank.id,
    cardId: card.id,
    taskTitle: card.taskTitle,
    topicId: topic.id,
  })))));
}

function countByStatus(items) {
  const result = {};
  for (const item of items) result[item.status] = (result[item.status] ?? 0) + 1;
  return result;
}

function analyze() {
  hashCache.clear();
  const currentCards = flattenEmbedded();
  const upstreamCards = loadUpstreamCards();
  const upstreamById = new Map(upstreamCards.map((card) => [card.id, card]));
  const sourceIdsByAudio = new Map();
  for (const card of upstreamCards) {
    if (!card.mediaAudio) continue;
    const group = sourceIdsByAudio.get(card.mediaAudio) ?? [];
    group.push(card.id);
    sourceIdsByAudio.set(card.mediaAudio, group);
  }

  const audits = currentCards.map((card) => {
    if (card.bankId === 'opi') return { ...card, currentAudio: card.audio ?? null, status: card.audio ? 'unexpected-opi-audio' : 'generated-audio' };
    const canonicalAudio = stablePublicPath(card.bankId, card.cardId);
    const expectedSourceAudio = publicToSourceRelative(canonicalAudio);
    const expectedSourcePath = join(sourceAudioRoot, expectedSourceAudio);
    const canonicalAssetPath = resolveCanonicalAsset(canonicalAudio);
    const upstream = upstreamById.get(card.cardId);
    const upstreamCanonicalAudio = upstream?.mediaAudio
      ? `${audioPrefix}${upstream.mediaAudio.replace(/^atc\//, 'radiotelephony/').replace(/^story\//, 'storytelling/')}`
      : null;
    let status = 'correct';
    if (!existsSync(expectedSourcePath)) status = 'missing-upstream-audio-file';
    else if (upstreamCanonicalAudio && upstreamCanonicalAudio !== canonicalAudio) status = 'upstream-path-disagrees';
    else if (!existsSync(canonicalAssetPath)) status = 'missing-canonical-asset';
    const expectedHash = existsSync(expectedSourcePath) ? hashFile(expectedSourcePath) : null;
    const canonicalHash = existsSync(canonicalAssetPath) ? hashFile(canonicalAssetPath) : null;
    if (status === 'correct' && canonicalHash !== expectedHash) status = 'canonical-copy-mismatch';
    else if (status === 'correct' && card.audio !== canonicalAudio) status = 'mismatch';
    const currentSourceRelative = card.audio?.startsWith(audioPrefix) ? publicToSourceRelative(card.audio) : null;
    return {
      ...card,
      actualSourceCardIds: currentSourceRelative ? (sourceIdsByAudio.get(currentSourceRelative) ?? []) : [],
      canonicalAssetPath,
      canonicalAudio,
      canonicalHash,
      currentAudio: card.audio ?? null,
      expectedHash,
      expectedSourceAudio,
      expectedSourcePath,
      mappingOrigin: upstream ? 'mini-v1' : 'stable-id',
      pathAligned: card.audio === canonicalAudio,
      status,
    };
  });

  const bankIds = [...localAudioBankIds, 'opi'];
  const byBank = Object.fromEntries(bankIds.map((bankId) => {
    const items = audits.filter((audit) => audit.bankId === bankId);
    return [bankId, { cards: items.length, pathAligned: items.filter((item) => item.pathAligned).length, statusCounts: countByStatus(items) }];
  }));
  const summary = {
    affectedLocalAudioCards: audits.filter((audit) => audit.bankId !== 'opi' && audit.status !== 'correct').length,
    auditedLocalAudioCards: audits.filter((audit) => audit.bankId !== 'opi').length,
    byBank,
    currentCardCount: currentCards.length,
    stableIdOnlyMappings: audits.filter((audit) => audit.mappingOrigin === 'stable-id').length,
  };
  return { audits, summary };
}

function writeAudit(result, name = 'full-audit.json', { includeAudits = false } = {}) {
  mkdirSync(outputRoot, { recursive: true });
  writeJson(join(outputRoot, name), {
    ...(includeAudits ? result : { summary: result.summary }),
    generatedAt: new Date().toISOString(),
    roots: { canonicalAudioRoot, embeddedPath, localAudioOverlayRoot, sourceAudioRoot, sourceDataRoot },
    schemaVersion: 2,
  });
  if (includeAudits) {
    const problems = result.audits.filter((audit) => !['correct', 'generated-audio'].includes(audit.status));
    const columns = ['bankId', 'cardId', 'taskTitle', 'status', 'currentAudio', 'canonicalAudio', 'actualSourceCardIds', 'expectedSourceAudio', 'mappingOrigin', 'pathAligned', 'canonicalHash', 'expectedHash'];
    writeFileSync(join(outputRoot, 'problems.csv'), `${columns.join(',')}\n${problems.map((item) => columns.map((column) => csvCell(item[column])).join(',')).join('\n')}\n`);
  }
}

function topicFiles(bankId) {
  const rootPath = join(banksRoot, bankId, 'topics');
  return readdirSync(rootPath).filter((name) => name.endsWith('.json')).sort().map((name) => join(rootPath, name));
}

function sourceTopicState() {
  return localAudioBankIds.flatMap((bankId) => topicFiles(bankId).map((path) => ({ path, value: readJson(path) })));
}

function sourceNonAudioDigest() {
  return hashValue(sourceTopicState().map(({ path, value }) => ({ path: path.replace(`${root}/`, ''), value: stripAudio(value) })));
}

function embeddedNonAudioDigest() {
  return hashValue(stripAudio(readJson(embeddedPath)));
}

function rewriteTopicSources() {
  let changed = 0;
  let seen = 0;
  const beforeDigest = sourceNonAudioDigest();
  for (const { path, value } of sourceTopicState()) {
    let fileChanged = false;
    const bankId = path.split('/banks/')[1].split('/')[0];
    for (const card of value.cards) {
      const expected = stablePublicPath(bankId, card.id);
      seen += 1;
      if (card.audio === expected) continue;
      card.audio = expected;
      changed += 1;
      fileChanged = true;
    }
    if (fileChanged) writeJson(path, value);
  }
  if (seen !== 3678) fail(`unexpected_source_audio_card_count:${seen}`);
  const afterDigest = sourceNonAudioDigest();
  if (beforeDigest !== afterDigest) fail('source_non_audio_fields_changed');
  return { changed, digest: afterDigest };
}

function rewriteEmbedded() {
  const embedded = readJson(embeddedPath);
  const beforeDigest = hashValue(stripAudio(embedded));
  let changed = 0;
  let seen = 0;
  for (const bank of embedded) {
    if (bank.id === 'opi') continue;
    for (const category of bank.categories) for (const topic of category.topics) for (const card of topic.cards) {
      const expected = stablePublicPath(bank.id, card.id);
      seen += 1;
      if (card.audio === expected) continue;
      card.audio = expected;
      changed += 1;
    }
  }
  if (seen !== 3678) fail(`unexpected_embedded_audio_card_count:${seen}`);
  if (beforeDigest !== hashValue(stripAudio(embedded))) fail('embedded_non_audio_fields_changed');
  writeJson(embeddedPath, embedded);
  return { changed, digest: beforeDigest };
}

function ensureRestoredResource() {
  const overlayPath = join(localAudioOverlayRoot, 'listening/main/454.mp3');
  if (!existsSync(overlayPath)) fail(`missing_restored_audio_overlay:${overlayPath}`);
  if (statSync(overlayPath).size !== restoredListeningSize) fail('restored_audio_size_mismatch');
  if (hashFile(overlayPath) !== restoredListeningChecksum) fail('restored_audio_checksum_mismatch');

  const audioIndex = readJson(audioIndexPath);
  const entries = audioIndex.modules.listening.main;
  if (!entries.some((entry) => entry.file === restoredListeningPath)) {
    entries.push({
      module: 'listening',
      group: 'main',
      order: 454,
      sourceOrder: 454,
      file: restoredListeningPath,
      source: join(sourceAudioRoot, 'listening/main/454.mp3'),
      extension: 'mp3',
      sizeBytes: restoredListeningSize,
    });
  }
  entries.sort((left, right) => left.order - right.order);
  audioIndex.generatedAt = new Date().toISOString();
  audioIndex.totals.files = Object.values(audioIndex.modules).reduce((total, module) => {
    const groups = module.groups ?? module;
    return total + Object.values(groups).reduce((count, group) => count + (Array.isArray(group) ? group.length : 0), 0);
  }, 0);
  audioIndex.totals.sizeBytes = Object.values(audioIndex.modules).reduce((total, module) => {
    const groups = module.groups ?? module;
    return total + Object.values(groups).reduce((bytes, group) => bytes + (Array.isArray(group) ? group.reduce((sum, entry) => sum + entry.sizeBytes, 0) : 0), 0);
  }, 0);
  writeJson(audioIndexPath, audioIndex);

  const manifest = readJson(resourceManifestPath);
  if (!manifest.files.some((file) => file.publicPath === restoredListeningPath)) {
    manifest.files.push({
      objectKey: 'v1/audio/listening/main/454.mp3',
      bankId: 'listening',
      sourceRelativePath: 'audio/listening/main/454.mp3',
      publicPath: restoredListeningPath,
      sizeBytes: restoredListeningSize,
      mimeType: 'audio/mpeg',
      checksum: restoredListeningChecksum,
      status: 'ready',
    });
  }
  manifest.files.sort((left, right) => left.objectKey.localeCompare(right.objectKey));
  writeJson(resourceManifestPath, manifest);
}

function updateReleaseTimestamp() {
  const registry = readJson(registryPath);
  registry.releasedAt = new Date().toISOString();
  writeJson(registryPath, registry);
}

function verifySourceEmbeddedSync() {
  const embeddedById = new Map(flattenEmbedded().map((card) => [card.cardId, card]));
  let compared = 0;
  for (const { path, value } of sourceTopicState()) {
    const bankId = path.split('/banks/')[1].split('/')[0];
    for (const card of value.cards) {
      const embedded = embeddedById.get(card.id);
      if (!embedded) fail(`embedded_card_missing:${card.id}`);
      const expected = stablePublicPath(bankId, card.id);
      if (card.audio !== expected || embedded.audio !== expected) fail(`source_embedded_audio_mismatch:${card.id}`);
      compared += 1;
    }
  }
  if (compared !== 3678) fail(`source_embedded_compare_count:${compared}`);
  return compared;
}

function assertSummary(result, expectedAffected) {
  if (result.summary.currentCardCount !== 5034) fail(`unexpected_card_count:${result.summary.currentCardCount}`);
  if (result.summary.auditedLocalAudioCards !== 3678) fail(`unexpected_local_audio_count:${result.summary.auditedLocalAudioCards}`);
  if (result.summary.affectedLocalAudioCards !== expectedAffected) fail(`unexpected_affected_count:${result.summary.affectedLocalAudioCards}`);
  for (const [bankId, expected] of Object.entries(expectedBankCounts)) {
    if (result.summary.byBank[bankId]?.cards !== expected) fail(`unexpected_bank_count:${bankId}`);
  }
}

function apply() {
  const before = analyze();
  if (![expectedInitialAffected, 0].includes(before.summary.affectedLocalAudioCards)) {
    fail(`unexpected_pre_repair_affected:${before.summary.affectedLocalAudioCards}`);
  }
  writeAudit(before, 'pre-repair-summary.json');
  ensureRestoredResource();
  const source = rewriteTopicSources();
  const embedded = rewriteEmbedded();
  if (source.changed !== embedded.changed) fail(`source_embedded_changed_count:${source.changed}:${embedded.changed}`);
  updateReleaseTimestamp();
  const after = analyze();
  assertSummary(after, 0);
  const synced = verifySourceEmbeddedSync();
  const report = {
    appliedAt: new Date().toISOString(),
    before: before.summary,
    after: after.summary,
    changedAudioFields: embedded.changed,
    embeddedNonAudioDigest: embedded.digest,
    resourcePatch: { checksum: restoredListeningChecksum, publicPath: restoredListeningPath, sizeBytes: restoredListeningSize },
    sourceNonAudioDigest: source.digest,
    sourceEmbeddedCardsCompared: synced,
  };
  writeJson(applyReportPath, report);
  writeAudit(after, 'post-repair-summary.json');
  process.stdout.write(`question_bank_audio_mapping_apply ${JSON.stringify(report)}\n`);
}

function verify() {
  const result = analyze();
  assertSummary(result, 0);
  const report = readJson(applyReportPath);
  if (!report.sourceNonAudioDigest || !report.embeddedNonAudioDigest) fail('historical_non_audio_digest_missing');
  const compared = verifySourceEmbeddedSync();
  const audioIndex = readJson(audioIndexPath);
  const manifest = readJson(resourceManifestPath);
  if (audioIndex.totals.files !== 3895 || audioIndex.totals.sizeBytes !== 579274343) fail('audio_index_totals_mismatch');
  if (!audioIndex.modules.listening.main.some((entry) => entry.file === restoredListeningPath && entry.sizeBytes === restoredListeningSize)) fail('audio_index_454_missing');
  if (!audioIndex.modules.listening.main.some((entry) => entry.file === retainedListeningPath)) fail('audio_index_595_not_retained');
  if (manifest.files.length !== 3982) fail(`resource_manifest_count:${manifest.files.length}`);
  if (!manifest.files.some((file) => file.publicPath === restoredListeningPath && file.checksum === restoredListeningChecksum)) fail('resource_manifest_454_missing');
  if (!manifest.files.some((file) => file.publicPath === retainedListeningPath)) fail('resource_manifest_595_not_retained');
  if (result.audits.some((audit) => audit.currentAudio === retainedListeningPath)) fail('orphan_595_still_referenced');
  writeAudit(result, 'verification-report.json');
  process.stdout.write(`question_bank_audio_mapping_verify ${JSON.stringify({ ...result.summary, sourceEmbeddedCardsCompared: compared })}\n`);
}

const [command = 'audit'] = process.argv.slice(2);
if (command === 'audit') {
  const result = analyze();
  writeAudit(result, 'full-audit.json', { includeAudits: true });
  process.stdout.write(`question_bank_audio_mapping_audit ${JSON.stringify(result.summary)}\n`);
} else if (command === 'apply') apply();
else if (command === 'verify') verify();
else fail('usage: node tools/question-bank-audio-mapping-audit.mjs <audit|apply|verify>');
