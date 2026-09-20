// Immutable legacy website snapshot. Native and formal Web resolve the protected
// repository.native implementation and keep using the current canonical bank.
import embeddedData from './legacy-v13/question-bank.json';
import embeddedRelease from './legacy-v13/question-bank-release.json';
import { Platform } from 'react-native';
import Storage from '@/platform/storage';
import type { ApiSuccessEnvelope, QuestionBankRelease } from '@icao/contracts';

import { loadWebContentRelease } from '@/features/web-content/release';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import type { QuestionBankDataset, QuestionBankId, QuestionBankTopic } from '../types';
import { apiFetch, getApiBaseUrl } from '@/platform/api-client';

const datasets = embeddedData as QuestionBankDataset[];

export type QuestionBankRepository = {
  getDataset(id: QuestionBankId): Promise<QuestionBankDataset | undefined>;
  getTopic(bankId: QuestionBankId, categoryId: string, topicId: string): Promise<QuestionBankTopic | undefined>;
};

export const embeddedQuestionBankRepository: QuestionBankRepository = {
  async getDataset(id) {
    return datasets.find((dataset) => dataset.id === id);
  },
  async getTopic(bankId, categoryId, topicId) {
    const dataset = datasets.find((item) => item.id === bankId);
    return dataset?.categories.find((category) => category.id === categoryId)?.topics.find((topic) => topic.id === topicId);
  },
};

type CachedRelease = QuestionBankRelease<QuestionBankDataset> & { cachedAt: string };
export type QuestionBankSource = 'remote' | 'cache' | 'embedded';
export type QuestionBankLoadResult = { dataset: QuestionBankDataset; source: QuestionBankSource; warning?: string };
const CACHE_PREFIX = 'icao.content.v1.bank.';
const WEB_CACHE_READ_TIMEOUT_MILLISECONDS = 600;
const WEB_MIRROR_TIMEOUT_MILLISECONDS = 12_000;
const webMemoryCache = new Map<QuestionBankId, { releaseIdentity: string; result: QuestionBankLoadResult }>();
const webPendingLoads = new Map<QuestionBankId, Promise<QuestionBankLoadResult | undefined>>();

function cacheKey(id: QuestionBankId) {
  return `${CACHE_PREFIX}${id}`;
}

async function readCachedRelease(id: QuestionBankId) {
  const value = await Storage.getItem(cacheKey(id));
  if (!value) return undefined;
  try {
    const cached = JSON.parse(value) as CachedRelease;
    return cached.dataset?.id === id ? cached : undefined;
  } catch {
    return undefined;
  }
}

async function readCachedReleaseForWebEntry(id: QuestionBankId) {
  return new Promise<CachedRelease | undefined>((resolve) => {
    const timeout = setTimeout(() => resolve(undefined), WEB_CACHE_READ_TIMEOUT_MILLISECONDS);
    void readCachedRelease(id)
      .then((release) => {
        clearTimeout(timeout);
        resolve(release);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(undefined);
      });
  });
}

export const remoteQuestionBankRepository = {
  async getDataset(id, signal?: AbortSignal) {
    const cached = await readCachedRelease(id);
    const headers = cached ? { 'if-none-match': `"${cached.checksum}"` } : undefined;
    const response = await apiFetch(`/v1/question-banks/${encodeURIComponent(id)}`, { headers, signal });
    if (response.status === 304 && cached) return cached.dataset;
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`question_bank_http_${response.status}`);
    const body = await response.json() as ApiSuccessEnvelope<QuestionBankRelease<QuestionBankDataset>>;
    if (!body.data?.dataset || body.data.dataset.id !== id) throw new Error('invalid_question_bank_response');
    await Storage.setItem(cacheKey(id), JSON.stringify({ ...body.data, cachedAt: new Date().toISOString() } satisfies CachedRelease));
    return body.data.dataset;
  },
  async getTopic(bankId, categoryId, topicId) {
    const dataset = await this.getDataset(bankId);
    return dataset?.categories.find((category) => category.id === categoryId)?.topics.find((topic) => topic.id === topicId);
  },
} satisfies QuestionBankRepository;

function webReleaseIdentity(release: Awaited<ReturnType<typeof loadWebContentRelease>>) {
  return release.releaseChecksum ?? release.releaseId ?? release.baseUrl;
}

function cachedReleaseMatchesWebRelease(
  cached: CachedRelease | undefined,
  release: Awaited<ReturnType<typeof loadWebContentRelease>>,
) {
  if (!cached) return false;
  if (release.releaseChecksum) return cached.checksum === release.releaseChecksum;
  const version = Number(release.releaseId?.match(/qb-v(\d+)/u)?.[1]);
  return !Number.isFinite(version) || cached.version === version;
}

async function performQuestionBankLoadForWeb(id: QuestionBankId): Promise<QuestionBankLoadResult | undefined> {
  const contentRelease = await loadWebContentRelease();
  const releaseIdentity = webReleaseIdentity(contentRelease);
  const memory = webMemoryCache.get(id);
  if (memory?.releaseIdentity === releaseIdentity) return memory.result;

  const releaseVersion = Number(contentRelease.releaseId?.match(/qb-v(\d+)/u)?.[1]);
  if (releaseVersion === embeddedRelease.releaseVersion) {
    const embedded = await embeddedQuestionBankRepository.getDataset(id);
    if (embedded) {
      const result = { dataset: embedded, source: 'embedded' } satisfies QuestionBankLoadResult;
      webMemoryCache.set(id, { releaseIdentity, result });
      return result;
    }
  }

  const cached = await readCachedReleaseForWebEntry(id);
  if (cachedReleaseMatchesWebRelease(cached, contentRelease)) {
    const result = { dataset: cached!.dataset, source: 'cache' } satisfies QuestionBankLoadResult;
    webMemoryCache.set(id, { releaseIdentity, result });
    return result;
  }

  try {
    const url = `${contentRelease.baseUrl}/question-bank/banks/${encodeURIComponent(id)}.json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(WEB_MIRROR_TIMEOUT_MILLISECONDS) });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`question_bank_http_${response.status}`);
    const dataset = await response.json() as QuestionBankDataset;
    if (dataset.id !== id || !Array.isArray(dataset.categories)) throw new Error('invalid_question_bank_response');
    const result = { dataset, source: 'remote' } satisfies QuestionBankLoadResult;
    webMemoryCache.set(id, { releaseIdentity, result });
    void Storage.setItem(cacheKey(id), JSON.stringify({
      bankId: id,
      version: Number(contentRelease.releaseId?.match(/qb-v(\d+)/u)?.[1] ?? embeddedRelease.releaseVersion),
      checksum: contentRelease.releaseChecksum ?? '0'.repeat(64),
      dataset,
      cachedAt: new Date().toISOString(),
    } satisfies CachedRelease)).catch(() => undefined);
    return result;
  } catch {
    if (cached) {
      const result = { dataset: cached.dataset, source: 'cache', warning: 'question_bank_remote_unavailable' } satisfies QuestionBankLoadResult;
      webMemoryCache.set(id, { releaseIdentity, result });
      return result;
    }
    const embedded = await embeddedQuestionBankRepository.getDataset(id);
    return embedded ? { dataset: embedded, source: 'embedded', warning: 'question_bank_remote_unavailable' } : undefined;
  }
}

async function loadQuestionBankForWeb(id: QuestionBankId): Promise<QuestionBankLoadResult | undefined> {
  const pending = webPendingLoads.get(id);
  if (pending) return pending;
  const load = performQuestionBankLoadForWeb(id).finally(() => {
    if (webPendingLoads.get(id) === load) webPendingLoads.delete(id);
  });
  webPendingLoads.set(id, load);
  return load;
}

export async function loadQuestionBank(id: QuestionBankId): Promise<QuestionBankLoadResult | undefined> {
  if (Platform.OS === 'web' && !isEdgeOneProductionWeb()) return loadQuestionBankForWeb(id);
  if (getApiBaseUrl()) {
    try {
      const remote = await remoteQuestionBankRepository.getDataset(id);
      if (remote) return { dataset: remote, source: 'remote' };
    } catch {
      const cached = await readCachedRelease(id);
      if (cached) return { dataset: cached.dataset, source: 'cache', warning: 'question_bank_remote_unavailable' };
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
  async getTopic(bankId, categoryId, topicId) {
    const dataset = await this.getDataset(bankId);
    return dataset?.categories.find((category) => category.id === categoryId)?.topics.find((topic) => topic.id === topicId);
  },
};

export function getEmbeddedQuestionBankIds() {
  return datasets.map((dataset) => dataset.id);
}

export function getEmbeddedQuestionBanks() {
  return datasets;
}
