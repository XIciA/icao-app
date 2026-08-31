import {
  AESKeySize,
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  CryptoDigestAlgorithm,
  digestStringAsync,
} from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';
import Storage from '@/platform/storage';
import type { ContentAccessCredential, ContentAccessScope } from '@icao/contracts';

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

function credentialKey(accountId: string, environment: ContentAccessCredential['environment'], scope: ContentAccessScope) {
  return `${CREDENTIAL_KEY_PREFIX}${accountId}.${environment}.${scope.bankId}.${scope.categoryId}.${scope.topicId}`;
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

function memberResourceDirectory(accountId: string, environment: ContentAccessCredential['environment']) {
  return new Directory(memberResourceAccountDirectory(accountId), environment);
}

async function memberResourceFile(
  accountId: string,
  environment: ContentAccessCredential['environment'],
  publicPath: string,
) {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, publicPath);
  const extension = /\.[A-Za-z0-9]{1,8}$/u.exec(publicPath)?.[0] ?? '.bin';
  return new File(memberResourceDirectory(accountId, environment), `${digest}${extension}`);
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

function isLegacyScope(value: unknown): value is ContentAccessScope {
  if (!value || typeof value !== 'object') return false;
  const scope = value as Partial<ContentAccessScope>;
  return [scope.bankId, scope.categoryId, scope.topicId].every((part) => (
    typeof part === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(part)
  ));
}

async function removeLegacyDeviceBoundMemberContent() {
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
      if (isLegacyScope(scope)) {
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
    ...[...credentialKeys].map((key) => SecureStore.deleteItemAsync(key)),
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
    assertMemberContentContextCurrent(context);
    const resourcePaths = topic.cards.flatMap((card) => card.kind === 'image'
      ? [card.image]
      : [card.audio].filter((path): path is string => Boolean(path)));
    for (const path of resourcePaths) {
      await Storage.setItem(resourceIndexKey(accountId, environment, path), JSON.stringify(scope));
      assertMemberContentContextCurrent(context);
    }
  });
}

export async function readMemberTopicCache(accountId: string, scope: ContentAccessScope) {
  await ensureLegacyDeviceBoundContentCleanup();
  const context = memberContentContext(accountId);
  const { environment } = context;
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
      ...credentialKeys.map((key) => SecureStore.deleteItemAsync(key)),
      SecureStore.deleteItemAsync(accountKeyName(accountId)),
    ]);
    const topicPrefix = `${TOPIC_CACHE_PREFIX}${accountId}.`;
    const resourcePrefix = `${RESOURCE_INDEX_PREFIX}${accountId}.`;
    const cacheKeys = (await Storage.getAllKeys()).filter((key) => key.startsWith(topicPrefix) || key.startsWith(resourcePrefix));
    await Storage.multiRemove([...cacheKeys, indexKey]);
    const directory = memberResourceAccountDirectory(accountId);
    if (directory.exists) directory.delete();
  });
}

export async function clearAllQuestionBankMemberContent() {
  await ensureLegacyDeviceBoundContentCleanup();
  const keys = await Storage.getAllKeys();
  const indexes = keys.filter((key) => key.startsWith(CREDENTIAL_INDEX_PREFIX));
  for (const index of indexes) {
    const accountId = index.slice(CREDENTIAL_INDEX_PREFIX.length);
    await clearQuestionBankMemberContent(accountId);
  }
  activeAccountId = undefined;
  activeAccountGeneration += 1;
}

async function memberResourceScope(accountId: string, publicPath: string) {
  const value = await Storage.getItem(resourceIndexKey(accountId, getNativeCommerceEnvironment(), publicPath));
  if (!value) return undefined;
  try {
    return JSON.parse(value) as ContentAccessScope;
  } catch {
    return undefined;
  }
}

export async function resolveOfflineMemberResource(publicPath: string) {
  const accountId = activeAccountId;
  if (!accountId) return undefined;
  const context = memberContentContext(accountId);
  const { environment } = context;
  const scope = await memberResourceScope(accountId, publicPath);
  assertMemberContentContextCurrent(context);
  if (!scope || !await readMemberTopicCache(accountId, scope)) return undefined;
  assertMemberContentContextCurrent(context);
  const file = await memberResourceFile(accountId, environment, publicPath);
  assertMemberContentContextCurrent(context);
  return file.exists ? file.uri : undefined;
}

export async function hasValidOfflineMemberResourceAccess(publicPath: string) {
  const accountId = activeAccountId;
  if (!accountId) return false;
  const context = memberContentContext(accountId);
  const scope = await memberResourceScope(accountId, publicPath);
  assertMemberContentContextCurrent(context);
  const valid = Boolean(scope && await readMemberTopicCache(accountId, scope));
  assertMemberContentContextCurrent(context);
  return valid;
}

export async function cacheMemberResource(publicPath: string, signedUrl: string) {
  const accountId = activeAccountId;
  if (!accountId) return undefined;
  const context = memberContentContext(accountId);
  const { environment } = context;
  const scope = await memberResourceScope(accountId, publicPath);
  assertMemberContentContextCurrent(context);
  if (!scope || !await readMemberTopicCache(accountId, scope)) return undefined;
  assertMemberContentContextCurrent(context);
  return withAccountContentLock(accountId, async () => {
    assertMemberContentContextCurrent(context);
    const directory = memberResourceDirectory(accountId, environment);
    directory.create({ idempotent: true, intermediates: true });
    const file = await memberResourceFile(accountId, environment, publicPath);
    assertMemberContentContextCurrent(context);
    if (!file.exists) await File.downloadFileAsync(signedUrl, file, { idempotent: true });
    assertMemberContentContextCurrent(context);
    return file.exists ? file.uri : undefined;
  });
}
