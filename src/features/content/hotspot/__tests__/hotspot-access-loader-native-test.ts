import completeQuestionBanks from '@/features/question-bank/data/question-bank.json';
import {
  inspectOfflineMemberTopicAccess,
} from '@/features/question-bank/data/member-content-cache';
import {
  loadQuestionBank,
  questionBankRepository,
} from '@/features/question-bank/data/repository';
import { getConnectivity } from '@/features/question-bank/platform/network-service';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { ApiClientError } from '@/platform/api-client';

import { loadHotspotAccess } from '../access-loader.native';
import { loadHotspotBriefs } from '../repository';

jest.mock('@/features/question-bank/data/member-content-cache', () => ({
  inspectOfflineMemberTopicAccess: jest.fn(),
}));
jest.mock('@/features/question-bank/data/repository', () => ({
  loadQuestionBank: jest.fn(),
  questionBankRepository: { getTopic: jest.fn() },
}));
jest.mock('@/features/question-bank/platform/network-service', () => ({
  getConnectivity: jest.fn(),
}));

const mockInspectOfflineAccess = jest.mocked(inspectOfflineMemberTopicAccess);
const mockLoadQuestionBank = jest.mocked(loadQuestionBank);
const mockGetTopic = jest.mocked(questionBankRepository.getTopic);
const mockGetConnectivity = jest.mocked(getConnectivity);

describe('native OPI hotspot access loader', () => {
  const brief = loadHotspotBriefs()[0];
  const completeOpiDataset = (completeQuestionBanks as QuestionBankDataset[])
    .find((bank) => bank.id === 'opi');

  function catalogWithoutRequestedCards() {
    if (!completeOpiDataset) throw new Error('missing_opi_fixture');
    const requestedTopicIds = new Set(brief.topics.map((topic) => topic.topicId));
    return {
      ...completeOpiDataset,
      categories: completeOpiDataset.categories.map((category) => ({
        ...category,
        topics: category.topics.map((topic) => (
          requestedTopicIds.has(topic.id) ? { ...topic, cards: [] } : topic
        )),
      })),
    };
  }

  beforeEach(() => {
    jest.resetAllMocks();
    mockGetConnectivity.mockResolvedValue('online');
    mockInspectOfflineAccess.mockResolvedValue('missing');
  });

  it('returns ready only after resolving the requested questions', async () => {
    expect(completeOpiDataset).toBeDefined();
    if (!completeOpiDataset) return;
    mockLoadQuestionBank.mockResolvedValue({ dataset: completeOpiDataset, source: 'embedded' });

    const result = await loadHotspotAccess(brief.id);

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.topics).toHaveLength(brief.topics.length);
    expect(result.session.topic.cards).toHaveLength(
      brief.topics.reduce((count, topic) => count + topic.cardIds.length, 0),
    );
    expect(mockGetTopic).not.toHaveBeenCalled();
  });

  it('preserves the public brief when membership is required and does not expose the API code', async () => {
    mockLoadQuestionBank.mockResolvedValue({ dataset: catalogWithoutRequestedCards(), source: 'remote' });
    mockGetTopic.mockRejectedValue(
      new ApiClientError('membership_required', 403, 'request-safe_1'),
    );

    const result = await loadHotspotAccess(brief.id);

    expect(result).toMatchObject({
      brief: { id: brief.id },
      requestId: 'request-safe_1',
      status: 'membership-required',
    });
    expect(JSON.stringify(result)).not.toContain('membership_required');
  });

  it('distinguishes an expired offline authorization from a general network failure', async () => {
    mockLoadQuestionBank.mockResolvedValue({ dataset: catalogWithoutRequestedCards(), source: 'cache' });
    mockGetTopic.mockRejectedValue(new TypeError('https://private.example/member-topic'));
    mockGetConnectivity.mockResolvedValue('offline');
    mockInspectOfflineAccess.mockResolvedValue('expired');

    const expiredResult = await loadHotspotAccess(brief.id);
    expect(expiredResult.status).toBe('offline-authorization-expired');
    expect(JSON.stringify(expiredResult)).not.toContain('private.example');

    mockInspectOfflineAccess.mockResolvedValue('missing');
    const networkResult = await loadHotspotAccess(brief.id);
    expect(networkResult.status).toBe('network-error');
    expect(JSON.stringify(networkResult)).not.toContain('private.example');
  });

  it('returns a safe not-found state for an unknown brief', async () => {
    await expect(loadHotspotAccess('unknown-hotspot')).resolves.toEqual({ status: 'not-found' });
    expect(mockLoadQuestionBank).not.toHaveBeenCalled();
  });

  it('redacts internal failures and only keeps a validated request ID', async () => {
    mockLoadQuestionBank.mockResolvedValue({ dataset: catalogWithoutRequestedCards(), source: 'remote' });
    mockGetTopic.mockRejectedValue(
      new ApiClientError('internal_origin_failure', 503, 'request-safe_2'),
    );

    const safeResult = await loadHotspotAccess(brief.id);
    expect(safeResult).toMatchObject({ requestId: 'request-safe_2', status: 'content-unavailable' });
    expect(JSON.stringify(safeResult)).not.toContain('internal_origin_failure');

    mockGetTopic.mockRejectedValue(
      new ApiClientError('internal_origin_failure', 503, 'unsafe request https://private.example'),
    );
    const unsafeResult = await loadHotspotAccess(brief.id);
    expect(unsafeResult.status).toBe('content-unavailable');
    if (unsafeResult.status !== 'content-unavailable') return;
    expect(unsafeResult.requestId).toBeUndefined();
    expect(JSON.stringify(unsafeResult)).not.toContain('private.example');
  });
});
