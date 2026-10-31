import {
  AESKeySize,
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  CryptoDigestAlgorithm,
  digestStringAsync,
  digest,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';
import { createDownloadResumable } from 'expo-file-system/legacy';
import Storage from '@/platform/storage';
import { validContentScopeId, type CommerceEnvironment, type ContentAccessCredential, type ContentAccessScope } from '@icao/contracts';

import {
  getNativeCommerceEnvironment,
  nativeCommerceEnvironmentSnapshot,
} from '@/features/native-commercial-testflight/commerce-environment';
import type { QuestionBankTopic } from '../types';
import {
  inspectContentAccessCredential,
  verifyContentAccessCredential,
} from './content-credential-verifier.native';

const LEGACY_DEVICE_ID_KEY = 'icao.content.device.v1';
const LEGACY_CREDENTIAL_KEY_PREFIX = 'icao.content.credential.v1.';
const LEGACY_CREDENTIAL_INDEX_PREFIX = 'icao.content.credential-index.v1.';
const LEGACY_TOPIC_CACHE_PREFIX = 'icao.content.member-topic.v1.';
const LEGACY_RESOURCE_INDEX_PREFIX = 'icao.content.member-resource.v1.';
const ACCOUNT_KEY_PREFIX = 'icao.content.key.v1.';
const CREDENTIAL_KEY_PREFIX = 'icao.content.credential.v2.';
const CREDENTIAL_INDEX_PREFIX = 'icao.content.credential-index.v2.';
const TOPIC_CACHE_PREFIX = 'icao.content.member-topic.v2.';
const RESOURCE_INDEX_PREFIX = 'icao.content.member-resource.v2.';

type EncryptedTopic = {
  schemaVersion: 2;
  accountId: string;
  environment: ContentAccessCredential['environment'];
  scope: ContentAccessScope;
  ciphertext: string;
};

let activeAccountId: string | undefined;
let activeAccountGeneration = 0;
let legacyCleanupPromise: Promise<void> | undefined;
const accountOperationTails = new Map<string, Promise<void>>();
type ResourceDownload = { promise: Promise<string | undefined>; consumers: Set<() => boolean> };
const resourceDownloads = new Map<string, ResourceDownload>();
const temporaryResourceUses = new Map<string, number>();
let lastTemporaryResourceUse = 0;
let resourceDownloadSequence = 0;
let activeResourceTransfers = 0;
const MAX_RESOURCE_TRANSFERS = 4;
const TEMPORARY_RESOURCE_MAX_FILES = 8;
const TEMPORARY_RESOURCE_MAX_BYTES = 64 * 1_024 * 1_024;
const TEMPORARY_RESOURCE_MAX_FILE_BYTES = 16 * 1_024 * 1_024;

type MemberContentContext = {
  accountId: string;
  accountGeneration: number;
  environment: ContentAccessCredential['environment'];
  environmentSnapshot: string;
};

function memberContentContext(accountId: string): MemberContentContext {
  return {
    accountId,
    accountGeneration: activeAccountGeneration,
    environment: getNativeCommerceEnvironment(),
    environmentSnapshot: nativeCommerceEnvironmentSnapshot(),
  };
}

function assertMemberContentContextCurrent(context: MemberContentContext) {
  if (
    activeAccountId !== context.accountId
    || activeAccountGeneration !== context.accountGeneration
    || getNativeCommerceEnvironment() !== context.environment
    || nativeCommerceEnvironmentSnapshot() !== context.environmentSnapshot
  ) throw new Error('content_account_changed');
}

async function withAccountContentLock<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
  const previous = accountOperationTails.get(accountId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  accountOperationTails.set(accountId, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (accountOperationTails.get(accountId) === tail) accountOperationTails.delete(accountId);
  }
}

function secureOptions() {
  return { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
}

function scopeIdentity(scope: ContentAccessScope) {
  return `${scope.bankId}/${scope.categoryId}/${scope.topicId}`;
}

function topicCacheKey(accountId: string, environment: ContentAccessCredential['environment'], scope: ContentAccessScope) {
  return `${TOPIC_CACHE_PREFIX}${accountId}.${environment}.${scope.bankId}.${scope.categoryId}.${scope.topicId}`;
}

function validSecureStoreKey(key: unknown): key is string {
  return typeof key === 'string' && /^[\w.-]+$/.test(key);
}

function credentialKey(accountId: string, environment: ContentAccessCredential['environment'], scope: ContentAccessScope) {
  const legacy = `${CREDENTIAL_KEY_PREFIX}${accountId}.${environment}.${scope.bankId}.${scope.categoryId}.${scope.topicId}`;
  // Keep existing valid keys readable. Unicode scope IDs are valid content IDs,
  // but cannot be used directly as native SecureStore keys. A separate prefix
  // plus an injective UTF-8 encoding avoids collisions with legacy ASCII keys.
  if (validSecureStoreKey(legacy)) return legacy;
  const identity = JSON.stringify([accountId, environment, scope.bankId, scope.categoryId, scope.topicId]);
  const encoded = Array.from(new TextEncoder().encode(identity), byte => byte.toString(16).padStart(2, '0')).join('');
  return `icao.content.credential.v3.${encoded}`;
}

function credentialIndexKey(accountId: string) {
  return `${CREDENTIAL_INDEX_PREFIX}${accountId}`;
}

function resourceIndexKey(accountId: string, environment: ContentAccessCredential['environment'], publicPath: string) {
  return `${RESOURCE_INDEX_PREFIX}${accountId}.${environment}.${encodeURIComponent(publicPath)}`;
}

function memberResourceAccountDirectory(accountId: string) {
  return new Directory(Paths.document, 'icao-member-content', accountId);
}

function temporaryResourceAccountDirectory(accountId: string) {
  return new Directory(Paths.cache, 'icao-authorized-content', accountId);
}

function touchTemporaryResource(file: File) {
  lastTemporaryResourceUse = Math.max(Date.now(), lastTemporaryResourceUse + 1);
  temporaryResourceUses.set(file.uri, lastTemporaryResourceUse);
}

function pruneTemporaryResources(directory: Directory) {
  const files = directory.list().filter((entry): entry is File => entry instanceof File)
    .sort((a, b) => (temporaryResourceUses.get(b.uri) ?? b.modificationTime ?? 0)
      - (temporaryResourceUses.get(a.uri) ?? a.modificationTime ?? 0));
  let size = 0;
  files.forEach((file, index) => {
    size += file.size;
    if (index >= TEMPORARY_RESOURCE_MAX_FILES || size > TEMPORARY_RESOURCE_MAX_BYTES) {
      temporaryResourceUses.delete(file.uri);
      file.delete();
    }
  });
}

function memberResourceDirectory(accountId: string, environment: ContentAccessCredential['environment']) {
  return new Directory(memberResourceAccountDirectory(accountId), environment);
}

async function memberResourceFile(
  accountId: string,
  environment: ContentAccessCredential['environment'],
  publicPath: string,
  checksum?: string,
) {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${publicPath}#${checksum ?? 'legacy'}`);
  const extension = /\.[A-Za-z0-9]{1,8}$/u.exec(publicPath)?.[0] ?? '.bin';
  return new File(memberResourceDirectory(accountId, environment), `${digest}${extension}.sealed`);
}

function accountKeyName(accountId: string) {
  return `${ACCOUNT_KEY_PREFIX}${accountId}`;
}

function aad(accountId: string, environment: ContentAccessCredential['environment'], scope: ContentAccessScope) {
  return new TextEncoder().encode(`icao-member-topic-v2\0${accountId}\0${environment}\0${scopeIdentity(scope)}`);
}

async function contentKey(accountId: string, create: boolean) {
  const name = accountKeyName(accountId);
  const encoded = await SecureStore.getItemAsync(name);
  if (encoded) return AESEncryptionKey.import(encoded, 'base64');
  if (!create) return undefined;
  const key = await AESEncryptionKey.generate(AESKeySize.AES256);
  await SecureStore.setItemAsync(name, await key.encoded('base64'), secureOptions());
  return key;
}

async function registerCredentialKey(accountId: string, key: string) {
  const indexKey = credentialIndexKey(accountId);
  const value = await Storage.getItem(indexKey);
  let keys: string[] = [];
  try {
    keys = value ? JSON.parse(value) as string[] : [];
  } catch {
    keys = [];
  }
  if (!keys.includes(key)) await Storage.setItem(indexKey, JSON.stringify([...keys, key]));
}

function legacyCacheOwner(key: string, prefix: string) {
  const suffix = key.slice(prefix.length);
  for (const environment of ['production', 'sandbox'] as const) {
    const marker = `.${environment}.`;
    const markerIndex = suffix.indexOf(marker);
    if (markerIndex <= 0) continue;
    const accountId = suffix.slice(0, markerIndex);
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(accountId)) return undefined;
    return { accountId, environment, suffix };
  }
  return undefined;
}

function isStoredContentScope(value: unknown): value is ContentAccessScope {
  if (!value || typeof value !== 'object') return false;
  const scope = value as Partial<ContentAccessScope>;
  return [scope.bankId, scope.categoryId, scope.topicId].every((part) => (
    validContentScopeId(part) || typeof part === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(part)
  ));
}

async function removeLegacyDeviceBoundMemberContent() {
  // Transfers are process-local and never valid offline resources after restart.
  const abandonedTransfers = new Directory(Paths.cache, 'icao-content-transfers');
  if (abandonedTransfers.exists) abandonedTransfers.delete();
  await SecureStore.deleteItemAsync(LEGACY_DEVICE_ID_KEY);
  const storageKeys = await Storage.getAllKeys();
  const indexKeys = storageKeys.filter((key) => key.startsWith(LEGACY_CREDENTIAL_INDEX_PREFIX));
  const cacheKeys = storageKeys.filter((key) => (
    key.startsWith(LEGACY_TOPIC_CACHE_PREFIX) || key.startsWith(LEGACY_RESOURCE_INDEX_PREFIX)
  ));
  const accountIds = new Set<string>();
  const credentialKeys = new Set<string>();
  for (const indexKey of indexKeys) {
    const accountId = indexKey.slice(LEGACY_CREDENTIAL_INDEX_PREFIX.length);
    if (/^[A-Za-z0-9_-]{1,128}$/u.test(accountId)) accountIds.add(accountId);
    const indexValue = await Storage.getItem(indexKey);
    try {
      const parsed = indexValue ? JSON.parse(indexValue) as unknown : [];
      if (Array.isArray(parsed)) {
        parsed.filter((key): key is string => (
          typeof key === 'string' && key.startsWith(LEGACY_CREDENTIAL_KEY_PREFIX)
        )).forEach((key) => credentialKeys.add(key));
      }
    } catch {
      // Topic and resource cache metadata below provide an independent cleanup path.
    }
  }
  for (const cacheKey of cacheKeys) {
    if (cacheKey.startsWith(LEGACY_TOPIC_CACHE_PREFIX)) {
      const owner = legacyCacheOwner(cacheKey, LEGACY_TOPIC_CACHE_PREFIX);
      if (!owner) continue;
      accountIds.add(owner.accountId);
      credentialKeys.add(`${LEGACY_CREDENTIAL_KEY_PREFIX}${owner.suffix}`);
      continue;
    }
    const owner = legacyCacheOwner(cacheKey, LEGACY_RESOURCE_INDEX_PREFIX);
    if (!owner) continue;
    accountIds.add(owner.accountId);
    const value = await Storage.getItem(cacheKey);
    try {
      const scope = value ? JSON.parse(value) as unknown : undefined;
      if (isStoredContentScope(scope)) {
        credentialKeys.add(
          `${LEGACY_CREDENTIAL_KEY_PREFIX}${owner.accountId}.${owner.environment}`
          + `.${scope.bankId}.${scope.categoryId}.${scope.topicId}`,
        );
      }
    } catch {
      // The matching topic cache or credential index remains the authoritative fallback.
    }
  }
  await Promise.all([
    ...[...credentialKeys].filter(validSecureStoreKey).map((key) => SecureStore.deleteItemAsync(key)),
    ...[...accountIds].map((accountId) => SecureStore.deleteItemAsync(accountKeyName(accountId))),
  ]);
  for (const accountId of accountIds) {
    const directory = memberResourceAccountDirectory(accountId);
    if (directory.exists) directory.delete();
  }
  if (indexKeys.length > 0 || cacheKeys.length > 0) {
    await Storage.multiRemove([...indexKeys, ...cacheKeys]);
  }
}

function ensureLegacyDeviceBoundContentCleanup() {
  if (legacyCleanupPromise) return legacyCleanupPromise;
  const cleanup = removeLegacyDeviceBoundMemberContent();
  legacyCleanupPromise = cleanup;
  void cleanup.catch(() => {
    if (legacyCleanupPromise === cleanup) legacyCleanupPromise = undefined;
  });
  return cleanup;
}

export function currentQuestionBankContentAccountId() {
  return activeAccountId;
}

export function questionBankContentAccountGeneration() {
  return activeAccountGeneration;
}

export async function activateQuestionBankContentAccount(accountId: string | undefined) {
  const legacyCleanup = ensureLegacyDeviceBoundContentCleanup();
  const previous = activeAccountId;
  activeAccountId = accountId;
  activeAccountGeneration += 1;
  await legacyCleanup;
  if (previous && previous !== accountId) await clearQuestionBankMemberContent(previous);
}

export async function writeMemberTopicCache(
  accountId: string,
  scope: ContentAccessScope,
  topic: QuestionBankTopic,
  credential: ContentAccessCredential,
  { preserveInvalid = false }: { preserveInvalid?: boolean } = {},
) {
  await ensureLegacyDeviceBoundContentCleanup();
  const context = memberContentContext(accountId);
  const { environment } = context;
  if (
    !verifyContentAccessCredential({ accountId, credential, environment, scope })
  ) throw new Error('invalid_content_credential');
  await withAccountContentLock(accountId, async () => {
    assertMemberContentContextCurrent(context);
    const key = await contentKey(accountId, true);
    assertMemberContentContextCurrent(context);
    const encrypted = await aesEncryptAsync(new TextEncoder().encode(JSON.stringify(topic)), key!, {
      additionalData: aad(accountId, environment, scope),
    });
    assertMemberContentContextCurrent(context);
    const record: EncryptedTopic = {
      schemaVersion: 2,
      accountId,
      environment,
      scope,
      ciphertext: await encrypted.combined('base64'),
    };
    const secureCredentialKey = credentialKey(accountId, environment, scope);
    await Storage.setItem(topicCacheKey(accountId, environment, scope), JSON.stringify(record));
    assertMemberContentContextCurrent(context);
    await SecureStore.setItemAsync(secureCredentialKey, JSON.stringify(credential), secureOptions());
    assertMemberContentContextCurrent(context);
    await registerCredentialKey(accountId, secureCredentialKey);
    if (!preserveInvalid) await Storage.removeItem(`${topicCacheKey(accountId, environment, scope)}.invalid`);
    assertMemberContentContextCurrent(context);
    const resourcePaths = topic.cards.flatMap((card) => card.kind === 'image'
      ? [card.image]
      : [card.audio].filter((path): path is string => Boolean(path)));
    for (const path of resourcePaths) {
      const indexKey = resourceIndexKey(accountId, environment, path);
      const previous = await Storage.getItem(indexKey);
      let scopes: ContentAccessScope[] = [];
      try { const parsed = previous ? JSON.parse(previous) : []; scopes = (Array.isArray(parsed) ? parsed : [parsed]).filter(isStoredContentScope); } catch { /* Replace damaged index only. */ }
      if (!scopes.some(item => scopeIdentity(item) === scopeIdentity(scope))) scopes.push(scope);
      await Storage.setItem(indexKey, JSON.stringify(scopes));
      assertMemberContentContextCurrent(context);
    }
  });
}

export async function readMemberTopicCache(accountId: string, scope: ContentAccessScope) {
  await ensureLegacyDeviceBoundContentCleanup();
  const context = memberContentContext(accountId);
  const { environment } = context;
  const invalid = await Storage.getItem(`${topicCacheKey(accountId, environment, scope)}.invalid`);
  if (invalid === '1') return undefined;
  const secureCredentialKey = credentialKey(accountId, environment, scope);
  const [credentialValue, recordValue, key] = await Promise.all([
    SecureStore.getItemAsync(secureCredentialKey),
    Storage.getItem(topicCacheKey(accountId, environment, scope)),
    contentKey(accountId, false),
  ]);
  assertMemberContentContextCurrent(context);
  if (!credentialValue || !recordValue || !key) return undefined;
  try {
    const credential = JSON.parse(credentialValue) as ContentAccessCredential;
    const record = JSON.parse(recordValue) as EncryptedTopic;
    if (
      !verifyContentAccessCredential({ accountId, credential, environment, scope })
      || record.schemaVersion !== 2
      || record.accountId !== accountId
      || record.environment !== environment
      || scopeIdentity(record.scope) !== scopeIdentity(scope)
    ) return undefined;
    const decrypted = await aesDecryptAsync(
      AESSealedData.fromCombined(record.ciphertext),
      key,
      { additionalData: aad(accountId, environment, scope) },
    );
    assertMemberContentContextCurrent(context);
    const topic = JSON.parse(new TextDecoder().decode(decrypted)) as QuestionBankTopic;
    assertMemberContentContextCurrent(context);
    if (invalid) {
      const ids = new Set<string>(JSON.parse(invalid));
      return { ...topic, cards: topic.cards.filter(card => !ids.has(card.id)) };
    }
    return topic;
  } catch {
    return undefined;
  }
}

export type OfflineMemberTopicAccess = 'missing' | 'valid' | 'expired' | 'invalid';

export async function inspectOfflineMemberTopicAccess(
  scope: ContentAccessScope,
  now = Date.now(),
): Promise<OfflineMemberTopicAccess> {
  await ensureLegacyDeviceBoundContentCleanup();
  const accountId = activeAccountId;
  if (!accountId) return 'missing';
  const context = memberContentContext(accountId);
  const { environment } = context;
  const [credentialValue, recordValue] = await Promise.all([
    SecureStore.getItemAsync(credentialKey(accountId, environment, scope)),
    Storage.getItem(topicCacheKey(accountId, environment, scope)),
  ]);
  assertMemberContentContextCurrent(context);
  if (!credentialValue || !recordValue) return 'missing';
  try {
    const credential = JSON.parse(credentialValue) as ContentAccessCredential;
    const record = JSON.parse(recordValue) as EncryptedTopic;
    if (
      record.schemaVersion !== 2
      || record.accountId !== accountId
      || record.environment !== environment
      || scopeIdentity(record.scope) !== scopeIdentity(scope)
    ) return 'invalid';
    const inspection = inspectContentAccessCredential({
      accountId,
      credential,
      environment,
      now,
      scope,
    });
    return inspection.status;
  } catch {
    return 'invalid';
  }
}

export async function clearQuestionBankMemberContent(accountId?: string) {
  if (!accountId) return;
  if (activeAccountId === accountId) activeAccountGeneration += 1;
  await withAccountContentLock(accountId, async () => {
    const indexKey = credentialIndexKey(accountId);
    const indexValue = await Storage.getItem(indexKey);
    let credentialKeys: string[] = [];
    try {
      credentialKeys = indexValue ? JSON.parse(indexValue) as string[] : [];
    } catch {
      credentialKeys = [];
    }
    await Promise.all([
      ...credentialKeys.filter(validSecureStoreKey).map((key) => SecureStore.deleteItemAsync(key)),
      SecureStore.deleteItemAsync(accountKeyName(accountId)),
    ]);
    const downloadKeys = (await Storage.getAllKeys()).filter(key => key.startsWith(`icao.downloads.v1.${accountId}.`));
    if (downloadKeys.length) await Storage.multiRemove(downloadKeys);
    const topicPrefix = `${TOPIC_CACHE_PREFIX}${accountId}.`;
    const resourcePrefix = `${RESOURCE_INDEX_PREFIX}${accountId}.`;
    const cacheKeys = (await Storage.getAllKeys()).filter((key) => key.startsWith(topicPrefix) || key.startsWith(resourcePrefix));
    await Storage.multiRemove([...cacheKeys, indexKey]);
    const directory = memberResourceAccountDirectory(accountId);
    if (directory.exists) directory.delete();
    const temporaryDirectory = temporaryResourceAccountDirectory(accountId);
    if (temporaryDirectory.exists) temporaryDirectory.delete();
    for (const uri of temporaryResourceUses.keys()) {
      if (uri.startsWith(`${temporaryDirectory.uri}/`)) temporaryResourceUses.delete(uri);
    }
  });
}

export async function clearAllQuestionBankMemberContent() {
  await ensureLegacyDeviceBoundContentCleanup();
  const keys = await Storage.getAllKeys();
  const indexes = keys.filter((key) => key.startsWith(CREDENTIAL_INDEX_PREFIX));
  const accountIds = new Set(indexes.map((index) => index.slice(CREDENTIAL_INDEX_PREFIX.length)));
  if (activeAccountId) accountIds.add(activeAccountId);
  for (const accountId of accountIds) {
    await clearQuestionBankMemberContent(accountId);
  }
  activeAccountId = undefined;
  activeAccountGeneration += 1;
}

async function memberResourceScope(accountId: string, publicPath: string) {
  const value = await Storage.getItem(resourceIndexKey(accountId, getNativeCommerceEnvironment(), publicPath));
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    const scopes: ContentAccessScope[] = (Array.isArray(parsed) ? parsed : [parsed]).filter(isStoredContentScope);
    for (const scope of scopes) if (await readMemberTopicCache(accountId, scope)) return scope;
    return scopes[0];
  } catch {
    return undefined;
  }
}

const isPublicPronunciation = (path: string) => /^\/pronunciation-assets\/[a-f0-9]{64}\.mp3$/.test(path);
async function hasPublicDownload(accountId: string, environment: CommerceEnvironment, path: string) {
  return isPublicPronunciation(path) && await Storage.getItem(`${resourceIndexKey(accountId, environment, path)}.public`) === '1';
}

export async function resolveOfflineMemberResource(publicPath: string) {
  const accountId = activeAccountId;
  if (!accountId) return undefined;
  const context = memberContentContext(accountId);
  const { environment } = context;
  const scope = await memberResourceScope(accountId, publicPath);
  assertMemberContentContextCurrent(context);
  if (!await hasPublicDownload(accountId, environment, publicPath) && (!scope || !await readMemberTopicCache(accountId, scope))) return undefined;
  assertMemberContentContextCurrent(context);
  if (await Storage.getItem(`${resourceIndexKey(accountId, environment, publicPath)}.invalid`)) return undefined;
  const checksum = await Storage.getItem(`${resourceIndexKey(accountId, environment, publicPath)}.checksum`);
  if (!checksum || !/^[a-f0-9]{64}$/.test(checksum)) return undefined;
  const file = await memberResourceFile(accountId, environment, publicPath, checksum);
  assertMemberContentContextCurrent(context);
  if (!file.exists) return undefined;
  const key = await contentKey(accountId, false);
  if (!key) return undefined;
  try {
    const bytes = await aesDecryptAsync(AESSealedData.fromCombined(await file.bytes()), key,
      { additionalData: new TextEncoder().encode(`${accountId}/${environment}/${publicPath}/${checksum}`) });
    assertMemberContentContextCurrent(context);
    const directory = new Directory(temporaryResourceAccountDirectory(accountId), environment);
    directory.create({ intermediates: true, idempotent: true });
    const playable = new File(directory, file.name.replace(/\.sealed$/, ''));
    playable.write(new Uint8Array(bytes));
    touchTemporaryResource(playable);
    pruneTemporaryResources(directory);
    return playable.uri;
  } catch { await invalidateOfflineResource(publicPath); return undefined; }
}

export async function hasValidOfflineMemberResourceAccess(publicPath: string) {
  const accountId = activeAccountId;
  if (!accountId) return false;
  const context = memberContentContext(accountId);
  const scope = await memberResourceScope(accountId, publicPath);
  assertMemberContentContextCurrent(context);
  const valid = await hasPublicDownload(accountId, context.environment, publicPath) || Boolean(scope && await readMemberTopicCache(accountId, scope));
  assertMemberContentContextCurrent(context);
  return valid;
}

export async function cacheMemberResource(
  publicPath: string,
  signedUrl: string,
  expected?: { checksum: string; sizeBytes: number },
  { temporary = false, publicDownload = false, isCurrent = () => true, required = false, onProgress }: { publicDownload?: boolean; temporary?: boolean; isCurrent?: () => boolean; required?: boolean; onProgress?: (fraction: number) => void } = {},
) {
  if (!expected || !/^[a-f0-9]{64}$/.test(expected.checksum) || expected.sizeBytes <= 0 || expected.sizeBytes > 52_428_800) return undefined;
  if (temporary && expected.sizeBytes > TEMPORARY_RESOURCE_MAX_FILE_BYTES) return undefined;
  const accountId = activeAccountId;
  if (!accountId) return undefined;
  const context = memberContentContext(accountId);
  const { environment } = context;
  // Temporary playback copies are only requested after the resource API has
  // authorized this request. They never grant offline member access.
  await ensureLegacyDeviceBoundContentCleanup();
  assertMemberContentContextCurrent(context);
  if (publicDownload && !isPublicPronunciation(publicPath)) throw new Error('invalid_public_download_path');
  const scope = temporary || publicDownload ? undefined : await memberResourceScope(accountId, publicPath);
  assertMemberContentContextCurrent(context);
  if (!temporary && !publicDownload && (!scope || !await readMemberTopicCache(accountId, scope))) return undefined;
  assertMemberContentContextCurrent(context);
  if (!isCurrent()) return undefined;
  const downloadKey = JSON.stringify([context, publicPath, expected.checksum, expected.sizeBytes, temporary, publicDownload]);
  const existing = resourceDownloads.get(downloadKey);
  if (existing) {
    existing.consumers.add(isCurrent);
    try {
      const result = await existing.promise;
      return isCurrent() ? result : undefined;
    } finally { existing.consumers.delete(isCurrent); }
  }
  // Subscribers share bytes, not cancellation ownership: an obsolete prefetch
  // must not reject a current selection waiting for the same resource.
  const consumers = new Set([isCurrent]);
  const hasCurrentConsumer = () => [...consumers].some((current) => current());
  const downloading = (async () => {
    const persistentFile = await memberResourceFile(accountId, environment, publicPath, expected.checksum);
    const directory = temporary
      ? new Directory(temporaryResourceAccountDirectory(accountId), environment)
      : memberResourceDirectory(accountId, environment);
    const file = temporary ? new File(directory, persistentFile.name.replace(/\.sealed$/, '')) : persistentFile;
    // Network I/O must not hold the account lock: signing out and other tracks
    // remain responsive even when one transfer stalls. A unique staging file
    // prevents a late old-account download from overwriting a new session.
    const stagingDirectory = new Directory(Paths.cache, 'icao-content-transfers');
    const staging = new File(stagingDirectory, `${Date.now()}-${++resourceDownloadSequence}.part`);
    const stagingUri = staging.uri;
    const checksumKey = `${resourceIndexKey(accountId, environment, publicPath)}.checksum`;
    const cached = await withAccountContentLock(accountId, async () => {
      assertMemberContentContextCurrent(context);
      if (!hasCurrentConsumer()) return undefined;
      const checksum = temporary ? undefined : await Storage.getItem(checksumKey);
      assertMemberContentContextCurrent(context);
      if (!hasCurrentConsumer()) return undefined;
      if (!await Storage.getItem(`${resourceIndexKey(accountId, environment, publicPath)}.invalid`) && file.exists && (temporary ? file.size === expected.sizeBytes : file.size > expected.sizeBytes)
        && (temporary ? temporaryResourceUses.has(file.uri) : checksum === expected.checksum)) {
        if (temporary) touchTemporaryResource(file);
        return file.uri;
      }
      return undefined;
    });
    assertMemberContentContextCurrent(context);
    if (!hasCurrentConsumer()) return undefined;
    if (cached) return cached;
    // Optional caching must not enqueue unlimited native transfers when users
    // rapidly change tracks. Callers can continue with the authorized stream.
    while (required && activeResourceTransfers >= MAX_RESOURCE_TRANSFERS && hasCurrentConsumer()) {
      await new Promise(resolve => setTimeout(resolve, 100));
      assertMemberContentContextCurrent(context);
    }
    if (!hasCurrentConsumer() || activeResourceTransfers >= MAX_RESOURCE_TRANSFERS) return undefined;
    activeResourceTransfers += 1;
    try {
      stagingDirectory.create({ idempotent: true, intermediates: true });
      if (required) {
        const task = createDownloadResumable(signedUrl, staging.uri, {}, progress => {
          onProgress?.(Math.min(1, progress.totalBytesWritten / expected.sizeBytes));
        });
        const timeout = setTimeout(() => { void task.cancelAsync().catch(() => undefined); }, 120_000);
        const cancellation = setInterval(() => { if (!hasCurrentConsumer() || activeAccountId !== accountId || activeAccountGeneration !== context.accountGeneration) void task.cancelAsync().catch(() => undefined); }, 200);
        try {
          const result = await task.downloadAsync();
          if (!result || result.status < 200 || result.status >= 300) throw new Error('download_interrupted');
        } finally { clearTimeout(timeout); clearInterval(cancellation); }
      } else await File.downloadFileAsync(signedUrl, staging, { idempotent: true });
      assertMemberContentContextCurrent(context);
      if (!hasCurrentConsumer()) return undefined;
      if (staging.size !== expected.sizeBytes) throw new Error('resource_size_mismatch');
      const bytes = new Uint8Array(await staging.bytes());
      const hash = Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes)))
        .map((value) => value.toString(16).padStart(2, '0')).join('');
      if (hash !== expected.checksum) throw new Error('resource_checksum_mismatch');
      return await withAccountContentLock(accountId, async () => {
        assertMemberContentContextCurrent(context);
        if (!hasCurrentConsumer()) return undefined;
        if (!temporary && !publicDownload && !await readMemberTopicCache(accountId, scope!)) return undefined;
        assertMemberContentContextCurrent(context);
        if (!hasCurrentConsumer()) return undefined;
        directory.create({ idempotent: true, intermediates: true });
        if (file.exists) file.delete();
        if (temporary) staging.move(file);
        else {
          const key = await contentKey(accountId, true);
          const sealed = await aesEncryptAsync(bytes, key!, { additionalData: new TextEncoder().encode(`${accountId}/${environment}/${publicPath}/${expected.checksum}`) });
          assertMemberContentContextCurrent(context);
          if (!hasCurrentConsumer()) return undefined;
          file.write(await sealed.combined());
        }
        if (temporary) {
          touchTemporaryResource(file);
          pruneTemporaryResources(directory);
        } else {
          const previousChecksum = await Storage.getItem(checksumKey);
          assertMemberContentContextCurrent(context);
          await Storage.setItem(checksumKey, expected.checksum);
          if (publicDownload) await Storage.setItem(`${resourceIndexKey(accountId, environment, publicPath)}.public`, '1');
          if (previousChecksum && previousChecksum !== expected.checksum) {
            const obsolete = await memberResourceFile(accountId, environment, publicPath, previousChecksum);
            if (obsolete.exists) obsolete.delete();
          }
          await Storage.removeItem(`${resourceIndexKey(accountId, environment, publicPath)}.invalid`);
          assertMemberContentContextCurrent(context);
        }
        return file.exists ? file.uri : undefined;
      });
    } finally {
      activeResourceTransfers -= 1;
      // File.move mutates staging.uri; only remove the original partial path.
      const partial = new File(stagingUri);
      if (partial.exists) partial.delete();
    }
  })();
  const download = { promise: downloading, consumers };
  resourceDownloads.set(downloadKey, download);
  try {
    const result = await downloading;
    return isCurrent() ? result : undefined;
  } finally {
    consumers.delete(isCurrent);
    if (resourceDownloads.get(downloadKey) === download) resourceDownloads.delete(downloadKey);
  }
}

/** Invalidation is durable and does not erase unrelated downloads or user data. */
export async function invalidateOfflineTopic(scope: ContentAccessScope, cardIds?: string[]) {
  const accountId = activeAccountId;
  if (!accountId) return;
  const context = memberContentContext(accountId);
  const key = `${topicCacheKey(accountId, context.environment, scope)}.invalid`;
  await withAccountContentLock(accountId, async () => {
    assertMemberContentContextCurrent(context);
    const previous = await Storage.getItem(key);
    const value = !cardIds || previous === '1' ? '1' : JSON.stringify([...new Set([...(previous ? JSON.parse(previous) as string[] : []), ...cardIds])]);
    assertMemberContentContextCurrent(context);
    await Storage.setItem(key, value);
  });
}
export async function isOfflineTopicInvalid(scope: ContentAccessScope) {
  return activeAccountId ? Boolean(await Storage.getItem(`${topicCacheKey(activeAccountId, getNativeCommerceEnvironment(), scope)}.invalid`)) : false;
}
export async function invalidateOfflineResource(path: string, expectedChecksum?: string) {
  const accountId = activeAccountId;
  if (!accountId) return;
  const context = memberContentContext(accountId);
  const index = resourceIndexKey(accountId, context.environment, path);
  await withAccountContentLock(accountId, async () => {
    assertMemberContentContextCurrent(context);
    if (expectedChecksum && await Storage.getItem(`${index}.checksum`) !== expectedChecksum) return;
    assertMemberContentContextCurrent(context);
    await Storage.setItem(`${index}.invalid`, '1');
  });
}
export async function removeOfflineResources(paths: string[], scopes: ContentAccessScope[]) {
  const accountId = activeAccountId;
  if (!accountId) return;
  const context = memberContentContext(accountId);
  await withAccountContentLock(accountId, async () => {
    assertMemberContentContextCurrent(context);
    for (const path of paths) {
      const index = resourceIndexKey(accountId, context.environment, path);
      const checksum = await Storage.getItem(`${index}.checksum`);
      if (checksum) {
        const file = await memberResourceFile(accountId, context.environment, path, checksum);
        if (file.exists) file.delete();
        const playable = new File(new Directory(temporaryResourceAccountDirectory(accountId), context.environment), file.name.replace(/\.sealed$/, ''));
        if (playable.exists) playable.delete();
      }
      await Storage.multiRemove([index, `${index}.checksum`, `${index}.invalid`, `${index}.public`]);
    }
    for (const scope of scopes) {
      await Storage.multiRemove([topicCacheKey(accountId, context.environment, scope), `${topicCacheKey(accountId, context.environment, scope)}.invalid`]);
      await SecureStore.deleteItemAsync(credentialKey(accountId, context.environment, scope));
    }
  });
}

export async function verifyOfflineResource(publicPath: string, expected: { checksum: string; sizeBytes: number }) {
  const accountId = activeAccountId;
  if (!accountId) return false;
  const context = memberContentContext(accountId);
  const file = await memberResourceFile(accountId, context.environment, publicPath, expected.checksum);
  const key = await contentKey(accountId, false);
  if (!file.exists || !key) return false;
  try {
    const bytes = new Uint8Array(await aesDecryptAsync(AESSealedData.fromCombined(await file.bytes()), key,
      { additionalData: new TextEncoder().encode(`${accountId}/${context.environment}/${publicPath}/${expected.checksum}`) }));
    const hash = Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
    assertMemberContentContextCurrent(context);
    const valid = bytes.length === expected.sizeBytes && hash === expected.checksum;
    if (!valid) await invalidateOfflineResource(publicPath, expected.checksum);
    return valid;
  } catch {
    if (activeAccountId === accountId && activeAccountGeneration === context.accountGeneration) await invalidateOfflineResource(publicPath, expected.checksum);
    return false;
  }
}

export async function suspendQuestionBankMemberAccess(accountId: string) {
  await withAccountContentLock(accountId, async () => {
    const raw = await Storage.getItem(credentialIndexKey(accountId));
    const keys: string[] = raw ? JSON.parse(raw) : [];
    await Promise.all(keys.filter(validSecureStoreKey).map(key => SecureStore.deleteItemAsync(key)));
  });
}

export async function offlineResourcePrepared(publicPath: string, expected: { checksum: string; sizeBytes: number }) {
  const accountId = activeAccountId;
  if (!accountId) return false;
  const context = memberContentContext(accountId);
  const index = resourceIndexKey(accountId, context.environment, publicPath);
  const file = await memberResourceFile(accountId, context.environment, publicPath, expected.checksum);
  const valid = file.exists && file.size > expected.sizeBytes && await Storage.getItem(`${index}.checksum`) === expected.checksum
    && !await Storage.getItem(`${index}.invalid`);
  assertMemberContentContextCurrent(context);
  return valid;
}

export async function offlineCredentialNeedsRefresh(scope: ContentAccessScope) {
  if (!activeAccountId) return false;
  try {
    const raw = await SecureStore.getItemAsync(credentialKey(activeAccountId, getNativeCommerceEnvironment(), scope));
    return !raw || Date.parse((JSON.parse(raw) as ContentAccessCredential).expiresAt) - Date.now() < 24 * 60 * 60 * 1000;
  } catch { return true; }
}
export async function renewOfflineCredentials(credential: ContentAccessCredential) {
  const accountId = activeAccountId;
  if (!accountId) return;
  const context = memberContentContext(accountId);
  await withAccountContentLock(accountId, async () => {
    for (const scope of credential.scopes) {
      assertMemberContentContextCurrent(context);
      if (!verifyContentAccessCredential({ accountId, credential, scope, environment: context.environment })) throw new Error('invalid_content_credential');
      const key = credentialKey(accountId, context.environment, scope);
      await SecureStore.setItemAsync(key, JSON.stringify(credential), secureOptions());
      await registerCredentialKey(accountId, key);
    }
  });
}

export async function discardTemporaryMemberResource(path: string, checksum: string) {
  const accountId = activeAccountId;
  if (!accountId) return;
  const environment = getNativeCommerceEnvironment();
  const persistent = await memberResourceFile(accountId, environment, path, checksum);
  const directory = new Directory(temporaryResourceAccountDirectory(accountId), environment);
  for (const name of [persistent.name, persistent.name.replace(/\.sealed$/, '')]) {
    const file = new File(directory, name);
    if (file.exists) file.delete();
    temporaryResourceUses.delete(file.uri);
  }
}

/** A bank version may change outside this downloaded range. Rebase only verified unchanged cards. */
export async function rebaseOfflineTopic(topic: import('@icao/contracts').OfflineTopic,
  release: import('./content-version.native').ContentReleaseReference) {
  const accountId = activeAccountId;
  if (!accountId) return;
  const cached = await readMemberTopicCache(accountId, topic);
  if (!cached) return;
  const cards = cached.cards.filter(card => topic.cardIds.includes(card.id));
  for (const card of cards) {
    const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(card));
    if (hash !== topic.cardChecksums[card.id]) return;
  }
  const raw = await SecureStore.getItemAsync(credentialKey(accountId, getNativeCommerceEnvironment(), topic));
  if (!raw) return;
  await writeMemberTopicCache(accountId, topic, { ...cached, cards, contentRelease: release } as QuestionBankTopic, JSON.parse(raw) as ContentAccessCredential, { preserveInvalid: true });
  const missing = topic.cardIds.filter(id => !cards.some(card => card.id === id));
  if (missing.length) await invalidateOfflineTopic(topic, missing);
}

export async function offlineResourceFailureCode(path: string) {
  const accountId = activeAccountId;
  if (!accountId) return 'offline_resource_missing';
  const environment = getNativeCommerceEnvironment();
  const index = resourceIndexKey(accountId, environment, path);
  if (await Storage.getItem(`${index}.invalid`)) return 'offline_resource_outdated';
  const scope = await memberResourceScope(accountId, path);
  if (!scope) return 'offline_resource_missing';
  const access = await inspectOfflineMemberTopicAccess(scope);
  if (access === 'expired' || access === 'invalid') return 'offline_authorization_required';
  return await Storage.getItem(`${index}.checksum`) ? 'offline_resource_unavailable' : 'offline_resource_missing';
}
