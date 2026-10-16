import { createHash } from 'node:crypto';

export const contentChecksum = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const contentJsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const banksAllowed = new Set(['listening', 'sentences900', 'radiotelephony', 'opi', 'storytelling']);
const supportedMime = new Set(['audio/mpeg', 'image/jpeg', 'image/png']);

/** Consumes the existing generated release, but never rewrites its sources or Web artifacts. */
export function prepareNativeContentRelease(manifest, resources, datasets, version) {
  if (manifest.schemaVersion !== 1 || resources.schemaVersion !== 1 || !Number.isSafeInteger(version) || version < 1) throw new Error('invalid_native_content_release');
  if (manifest.banks.length !== 5 || new Set(manifest.banks.map((bank) => bank.id)).size !== 5) throw new Error('invalid_native_content_banks');
  const paths = new Map();
  const files = resources.files.map((file) => {
    if (file.status !== 'ready' || !banksAllowed.has(file.bankId) || !supportedMime.has(file.mimeType) || !/^[a-f0-9]{64}$/.test(file.checksum)
      || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1 || file.sizeBytes > 52_428_800
      || !file.publicPath.startsWith('/question-bank-assets/') || /[?#\\]/.test(file.publicPath)
      || file.publicPath.split('/').some((part) => part === '..' || part === '.')) throw new Error('invalid_native_resource');
    const relative = file.publicPath.slice('/question-bank-assets/'.length);
    const prefix = `revisions/${file.bankId}/${file.checksum}/`;
    const objectKey = relative.startsWith(prefix) ? relative : `${prefix}${relative}`;
    const publicPath = `/question-bank-assets/${objectKey}`;
    if (paths.has(file.publicPath)) throw new Error('duplicate_native_resource');
    paths.set(file.publicPath, publicPath);
    return { ...file, objectKey, publicPath, sourcePublicPath: file.publicPath };
  });
  const replace = (value) => {
    if (typeof value === 'string' && value.startsWith('/question-bank-assets/')) {
      if (!paths.has(value)) throw new Error('native_resource_reference_missing');
      return paths.get(value);
    }
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  const banks = manifest.banks.map((bank) => {
    const dataset = datasets.get(bank.id);
    if (!banksAllowed.has(bank.id) || dataset?.id !== bank.id || !Array.isArray(dataset.categories)) throw new Error('invalid_native_bank');
    const payload = replace(dataset);
    return { id: bank.id, version, checksum: contentChecksum(contentJsonBytes(payload)), payload };
  });
  return { version, banks, files };
}

export function assertImmutableRelease(existing, wanted) {
  if (existing && existing.checksum !== wanted.checksum) throw new Error('content_release_version_immutable');
}

/** Content-addressed banks retain their existing version when unchanged.
 * Plan again under the publication lock so retries never repeat a history reset. */
export function planNativeContentPublication(release, existing, resetHistory = false) {
  if (resetHistory && release.banks.length !== 5) throw new Error('history_reset_requires_complete_release');
  let fresh = 0;
  let alreadyPublished = 0;
  const banks = release.banks.map((bank) => {
    const priorVersion = existing.find((row) => row.bank_id === bank.id && Number(row.version) === bank.version);
    assertImmutableRelease(priorVersion, bank);
    if (priorVersion) alreadyPublished += 1;
    const sameContent = existing.find((row) => row.bank_id === bank.id && row.checksum === bank.checksum);
    if (!sameContent) fresh += 1;
    return sameContent ? { ...bank, version: Number(sameContent.version) } : bank;
  });
  if (resetHistory && fresh > 0 && alreadyPublished > 0) throw new Error('history_reset_partial_version');
  return { banks, resetHistory: resetHistory && fresh > 0 };
}

export function assertHotspotReferences(hotspots, opi) {
  if (!opi || opi.id !== 'opi' || !Array.isArray(opi.categories)) throw new Error('opi_release_required');
  const topics = new Map(opi.categories.flatMap((category) => category.topics.map((topic) => [topic.id, new Set(topic.cards.map((card) => card.id))])));
  for (const brief of hotspots.briefs) for (const topic of brief.topics) {
    const cards = topics.get(topic.topicId);
    if (!cards) throw new Error('hotspot_topic_missing');
    if (!topic.cardIds.every((id) => cards.has(id))) throw new Error('hotspot_card_missing');
  }
}

/** Publish a subset without advancing unrelated bank versions or uploading their media. */
export function selectNativeContentBanks(release, bankIds) {
  if (!bankIds.length || new Set(bankIds).size !== bankIds.length || bankIds.some((id) => !banksAllowed.has(id))) throw new Error('invalid_selected_banks');
  const banks = release.banks.filter((bank) => bankIds.includes(bank.id));
  if (banks.length !== bankIds.length) throw new Error('selected_bank_missing');
  const references = new Set();
  function visit(value) {
    if (typeof value === 'string' && value.startsWith('/question-bank-assets/')) references.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  banks.forEach((bank) => visit(bank.payload));
  const files = release.files.filter((file) => references.has(file.publicPath));
  if (files.length !== references.size) throw new Error('selected_resource_missing');
  return { ...release, banks, files };
}

/** History and annotations refer to this complete tuple. Retire in place instead
 * of deleting/rekeying/moving; old release snapshots and resources stay immutable. */
export function assertQuestionIdentitiesPreserved(previous, next) {
  const identities = bank => new Map(bank.categories.flatMap(category => category.topics.flatMap(topic => topic.cards.map(card => [card.id, `${category.id}/${topic.id}`]))));
  const before = identities(previous), after = identities(next);
  if (previous.id !== next.id) throw new Error('existing_bank_identity_must_be_preserved');
  for (const [id, parent] of before) if (after.get(id) !== parent) throw new Error('existing_question_identity_must_be_preserved');
}
