import { naturalDatasetTitles, naturalTopicTitles } from '../lib/question-titles';
import { sameContentRelease, withContentRelease, type ContentReleaseReference } from './content-version.native';
import publicData from './question-bank-public.json';
import publicRelease from './question-bank-public-release.json';
import Storage from '@/platform/storage';
import type {
  ApiSuccessEnvelope,
  ContentAccessCredential,
  ContentAccessScope,
  QuestionBankRelease,
  QuestionBankTopicRelease,
} from '@icao/contracts';
import { COMMERCE_ENVIRONMENT_HEADER, CONTENT_ACCESS_POLICY_VERSION } from '@icao/contracts';

import type { QuestionBankDataset, QuestionBankId, QuestionBankTopic } from '../types';
import {
  getNativeCommerceEnvironment,
  nativeCommerceEnvironmentSnapshot,
} from '@/features/native-commercial-testflight/commerce-environment';
import { ApiClientError, apiFetch, apiRequest, getApiBaseUrl } from '@/platform/api-client';
import {
  clearQuestionBankMemberContent,
  currentQuestionBankContentAccountId,
  questionBankContentAccountGeneration,
  readMemberTopicCache,
  writeMemberTopicCache,
} from './member-content-cache';

const datasets = (publicData as QuestionBankDataset[]).map(naturalDatasetTitles);
const CATALOG_CACHE_PREFIX = 'icao.content.v3.catalog.';
const LEGACY_CACHE_PREFIXES = ['icao.content.v1.bank.', 'icao.content.v2.catalog.'];

type CachedRelease = QuestionBankRelease<QuestionBankDataset> & { cachedAt: string };
export type QuestionBankSource = 'remote' | 'cache' | 'embedded';
export type QuestionBankLoadResult = { dataset: QuestionBankDataset; source: QuestionBankSource; warning?: string };

export type QuestionBankRepository = {
  getDataset(id: QuestionBankId): Promise<QuestionBankDataset | undefined>;
  getTopic(bankId: QuestionBankId, categoryId: string, topicId: string, expected?: ContentReleaseReference): Promise<QuestionBankTopic | undefined>;
};

let legacyCacheCleanup: Promise<void> | undefined;

function contentContext() {
  return {
    accountId: currentQuestionBankContentAccountId(),
    accountGeneration: questionBankContentAccountGeneration(),
    environment: getNativeCommerceEnvironment(),
    environmentSnapshot: nativeCommerceEnvironmentSnapshot(),
  };
}

function contentContextIsCurrent(context: ReturnType<typeof contentContext>) {
  return context.accountId === currentQuestionBankContentAccountId()
    && context.accountGeneration === questionBankContentAccountGeneration()
    && context.environment === getNativeCommerceEnvironment()
    && context.environmentSnapshot === nativeCommerceEnvironmentSnapshot();
}

function assertContentContextCurrent(context: ReturnType<typeof contentContext>) {
  if (!contentContextIsCurrent(context)) throw new ApiClientError('content_account_changed', 409);
}

function ensureLegacyFullCacheRemoved() {
  if (!legacyCacheCleanup) {
    legacyCacheCleanup = Storage.getAllKeys()
      .then(async (keys) => {
        const legacy = keys.filter((key) => LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)));
        if (legacy.length > 0) await Storage.multiRemove(legacy);
      })
      .catch(() => undefined);
  }
  return legacyCacheCleanup;
}

function cacheKey(accountId: string, environment: string, id: QuestionBankId) {
  return `${CATALOG_CACHE_PREFIX}${accountId}.${environment}.${id}`;
}

async function readCachedCatalog(accountId: string | undefined, environment: string, id: QuestionBankId) {
  if (!accountId) return undefined;
  const value = await Storage.getItem(cacheKey(accountId, environment, id));
  if (!value) return undefined;
  try {
    const cached = JSON.parse(value) as CachedRelease;
    return cached.dataset?.id === id ? cached : undefined;
  } catch {
    return undefined;
  }
}

export const embeddedQuestionBankRepository: QuestionBankRepository = {
  async getDataset(id) {
    return datasets.find((dataset) => dataset.id === id);
  },
  async getTopic(bankId, categoryId, topicId) {
    const dataset = datasets.find((item) => item.id === bankId);
    return dataset?.categories.find((category) => category.id === categoryId)?.topics.find((topic) => topic.id === topicId);
  },
};

export const remoteQuestionBankRepository = {
  async getDataset(id: QuestionBankId, signal?: AbortSignal) {
    await ensureLegacyFullCacheRemoved();
    const context = contentContext();
    const { accountId, environment } = context;
    const cached = await readCachedCatalog(accountId, environment, id);
    const accessState = (cached?.dataset as QuestionBankDataset | undefined)?.access?.membershipActive === true ? 'member' : 'free';
    const headers = {
      [COMMERCE_ENVIRONMENT_HEADER]: environment,
      ...(cached ? { 'if-none-match': `"${cached.checksum}.${CONTENT_ACCESS_POLICY_VERSION}.${accessState}"` } : {}),
    };
    const response = await apiFetch(`/v1/question-banks/${encodeURIComponent(id)}`, { headers, signal });
    assertContentContextCurrent(context);
    if (response.status === 304 && cached) return cached.dataset;
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`question_bank_http_${response.status}`);
    const body = await response.json() as ApiSuccessEnvelope<QuestionBankRelease<QuestionBankDataset>>;
    assertContentContextCurrent(context);
    if (!body.data?.dataset || body.data.dataset.id !== id || !Number.isSafeInteger(body.data.version) || body.data.version < 1 || !/^[a-f0-9]{64}$/.test(body.data.checksum)) throw new Error('invalid_question_bank_response');
    body.data.dataset = withContentRelease(body.data.dataset, { bankId: id, version: body.data.version, checksum: body.data.checksum });
    if (accountId && body.data.dataset.access?.membershipActive === false) {
      await clearQuestionBankMemberContent(accountId).catch(() => undefined);
    }
    if (accountId) {
      await Storage.setItem(
        cacheKey(accountId, environment, id),
        JSON.stringify({ ...body.data, cachedAt: new Date().toISOString() } satisfies CachedRelease),
      );
    }
    return body.data.dataset;
  },
  async getTopic(bankId: QuestionBankId, categoryId: string, topicId: string, expected?: ContentReleaseReference) {
    const context = contentContext();
    const { accountId, environment } = context;
    const scope = { bankId, categoryId, topicId, ...(expected ? { version: expected.version } : {}) } satisfies ContentAccessScope & { version?: number };
    try {
      const release = await apiRequest<QuestionBankTopicRelease<QuestionBankTopic>>(
        `/v1/question-banks/${encodeURIComponent(bankId)}/categories/${encodeURIComponent(categoryId)}/topics/${encodeURIComponent(topicId)}${expected ? `?version=${expected.version}&checksum=${expected.checksum}` : ''}`,
        { headers: { [COMMERCE_ENVIRONMENT_HEADER]: environment } },
      );
      assertContentContextCurrent(context);
      release.topic = withContentRelease(release.topic, { bankId: release.bankId, version: release.version, checksum: release.checksum });
      if (!sameContentRelease(release.topic, expected) || release.bankId !== bankId || release.categoryId !== categoryId || release.topic.id !== topicId) {
        throw new Error('invalid_question_bank_topic_response');
      }
      if (accountId && release.access.membershipActive === false) {
        await clearQuestionBankMemberContent(accountId).catch(() => undefined);
      }
      if (accountId && release.access.membershipActive && release.topic.access?.level === 'member') {
        try {
          const credential = await apiRequest<ContentAccessCredential>('/v1/content-access/credentials', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              [COMMERCE_ENVIRONMENT_HEADER]: environment,
            },
            body: JSON.stringify({ scopes: [scope] }),
          });
          assertContentContextCurrent(context);
          // Verification is still mandatory before any offline cache is
          // written. Online topic access was separately authorized by the API.
          await writeMemberTopicCache(accountId, scope, release.topic, credential);
        } catch (error) {
          assertContentContextCurrent(context);
          // Never suppress revoked access or invalid request/owner boundaries.
          // A transient credential service or local cache failure must not
          // discard a topic already returned by the authenticated topic API.
          if (error instanceof ApiClientError && error.status >= 400 && error.status < 500
            && error.status !== 408 && error.status !== 429) throw error;
        }
        assertContentContextCurrent(context);
      }
      return release.topic;
    } catch (error) {
      const mayUseOffline = !(error instanceof ApiClientError)
        || error.status === 408
        || error.status === 429
        || error.status >= 500;
      if (accountId && mayUseOffline) {
        const cached = await readMemberTopicCache(accountId, scope);
        assertContentContextCurrent(context);
        if (cached && sameContentRelease(cached, expected)) return cached;
      }
      if (
        accountId
        && error instanceof ApiClientError
        && error.code !== 'content_account_changed'
        && error.status >= 400
        && error.status < 500
      ) {
        await clearQuestionBankMemberContent(accountId).catch(() => undefined);
      }
      throw error;
    }
  },
} satisfies QuestionBankRepository;

export async function loadQuestionBank(id: QuestionBankId): Promise<QuestionBankLoadResult | undefined> {
  await ensureLegacyFullCacheRemoved();
  if (getApiBaseUrl()) {
    try {
      const remote = await remoteQuestionBankRepository.getDataset(id);
      if (remote) return { dataset: naturalDatasetTitles(remote), source: 'remote' };
    } catch {
      const cached = await readCachedCatalog(
        currentQuestionBankContentAccountId(),
        getNativeCommerceEnvironment(),
        id,
      );
      if (cached) return { dataset: naturalDatasetTitles(cached.dataset), source: 'cache', warning: 'question_bank_remote_unavailable' };
      const embedded = await embeddedQuestionBankRepository.getDataset(id);
      return embedded ? { dataset: embedded, source: 'embedded', warning: 'question_bank_remote_unavailable' } : undefined;
    }
  }
  const embedded = await embeddedQuestionBankRepository.getDataset(id);
  return embedded ? { dataset: embedded, source: 'embedded' } : undefined;
}

export const questionBankRepository: QuestionBankRepository = {
  async getDataset(id) {
    return (await loadQuestionBank(id))?.dataset;
  },
  async getTopic(bankId, categoryId, topicId, expected) {
    const topic = getApiBaseUrl() ? await remoteQuestionBankRepository.getTopic(bankId, categoryId, topicId, expected)
      : await embeddedQuestionBankRepository.getTopic(bankId, categoryId, topicId);
    return topic ? naturalTopicTitles(bankId, topic) : undefined;
  },
};

export function getEmbeddedQuestionBankIds() {
  return datasets.map((dataset) => dataset.id);
}

export function getEmbeddedQuestionBanks() {
  return datasets;
}

export function getNativePublicQuestionBankRelease() {
  return publicRelease;
}
