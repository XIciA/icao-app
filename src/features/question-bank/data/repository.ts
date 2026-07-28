import embeddedData from './question-bank.json';
import { Platform } from 'react-native';
import Storage from '@/platform/storage';
import type { ApiSuccessEnvelope, QuestionBankRelease } from '@icao/contracts';

import { loadWebContentRelease, resolveWebContentUrl } from '@/features/web-content/release';
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

async function loadQuestionBankForWeb(id: QuestionBankId): Promise<QuestionBankLoadResult | undefined> {
  const cached = await readCachedReleaseForWebEntry(id);
  const embedded = await embeddedQuestionBankRepository.getDataset(id);
  try {
    const [url, contentRelease] = await Promise.all([
      resolveWebContentUrl(`/question-bank/banks/${encodeURIComponent(id)}.json`),
      loadWebContentRelease(),
    ]);
    const response = await fetch(url, { signal: AbortSignal.timeout(WEB_MIRROR_TIMEOUT_MILLISECONDS) });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`question_bank_http_${response.status}`);
    const dataset = await response.json() as QuestionBankDataset;
    if (dataset.id !== id || !Array.isArray(dataset.categories)) throw new Error('invalid_question_bank_response');
    await Storage.setItem(cacheKey(id), JSON.stringify({
      bankId: id,
      version: Number(contentRelease.releaseId?.match(/qb-v(\d+)/u)?.[1] ?? 8),
      checksum: contentRelease.releaseChecksum ?? '0'.repeat(64),
      dataset,
      cachedAt: new Date().toISOString(),
    } satisfies CachedRelease));
    return { dataset, source: 'remote' };
  } catch {
    if (cached) return { dataset: cached.dataset, source: 'cache', warning: 'question_bank_remote_unavailable' };
    return embedded ? { dataset: embedded, source: 'embedded', warning: 'question_bank_remote_unavailable' } : undefined;
  }
}

export async function loadQuestionBank(id: QuestionBankId): Promise<QuestionBankLoadResult | undefined> {
  if (Platform.OS === 'web') return loadQuestionBankForWeb(id);
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
