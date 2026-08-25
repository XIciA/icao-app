const mockApiRequest = jest.fn();
const mockRunLearningSync = jest.fn();
const mockDeleteLocalAiResult = jest.fn();
const mockApplyAiReset = jest.fn();
const mockApplyLearningReset = jest.fn();
const mockClearRadio = jest.fn();
const mockClearRecordings = jest.fn();
const mockPendingPrivacyAction = jest.fn();
const mockCompletePrivacyAction = jest.fn();

jest.mock('@/platform/api-client', () => ({ apiRequest: (...args: unknown[]) => mockApiRequest(...args) }));
jest.mock('@/features/sync/learning-sync', () => ({
  applyPrivacyAiResultReset: (...args: unknown[]) => mockApplyAiReset(...args),
  applyPrivacyLearningDataReset: (...args: unknown[]) => mockApplyLearningReset(...args),
  deleteLocalAiResult: (...args: unknown[]) => mockDeleteLocalAiResult(...args),
  runLearningSync: (...args: unknown[]) => mockRunLearningSync(...args),
}));
jest.mock('@/features/account/profile-store', () => ({
  readProfile: jest.fn(async () => ({ targetLevel: 'ICAO 5 级' })),
}));
jest.mock('@/features/question-bank/recording/recording-repository', () => ({
  recordingRepository: { clearAll: () => mockClearRecordings() },
}));
jest.mock('@/features/radio-player/radio-player-storage', () => ({
  clearRadioPlayerAccountData: () => mockClearRadio(),
}));
jest.mock('@/features/account/privacy-action-state', () => ({
  completePrivacyAction: (...args: unknown[]) => mockCompletePrivacyAction(...args),
  pendingPrivacyActionFor: (...args: unknown[]) => mockPendingPrivacyAction(...args),
}));

// Keep the import after the mock factories so their shared spies are initialized first.
// eslint-disable-next-line import/first
import {
  clearLearningData,
  deleteAiResult,
  deleteAllAiResults,
  exportAccountAndLearningData,
} from '../privacy-self-service';

const deletion = { aiResultGeneration: 2, dataGeneration: 3, deletedCount: 4 };

describe('privacy self service client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunLearningSync.mockResolvedValue({});
    mockApiRequest.mockResolvedValue(deletion);
    mockApplyAiReset.mockResolvedValue(undefined);
    mockApplyLearningReset.mockResolvedValue(undefined);
    mockDeleteLocalAiResult.mockResolvedValue(undefined);
    mockClearRadio.mockResolvedValue(undefined);
    mockCompletePrivacyAction.mockResolvedValue(undefined);
    mockPendingPrivacyAction.mockImplementation(async (accountId: string, action: string) => ({
      accountId,
      action,
      createdAt: 1,
      idempotencyKey: action === 'delete_all_ai_results'
        ? '20000000-0000-4000-8000-000000000001'
        : '20000000-0000-4000-8000-000000000002',
    }));
  });

  it('deletes a local-only AI result without pretending to call the account API', async () => {
    await expect(deleteAiResult(undefined, 'result-1')).resolves.toEqual({ deletedCount: 1 });
    expect(mockDeleteLocalAiResult).toHaveBeenCalledWith('result-1');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('flushes, deletes and reconciles one synced AI result', async () => {
    await deleteAiResult('account-1', 'result / 1');

    expect(mockRunLearningSync).toHaveBeenNthCalledWith(1, 'account-1');
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/privacy/ai-results/result%20%2F%201', { method: 'DELETE' });
    expect(mockDeleteLocalAiResult).toHaveBeenCalledWith('result / 1');
    expect(mockRunLearningSync).toHaveBeenCalledTimes(2);
  });

  it('uses explicit confirmations and applies server generations to destructive bulk actions', async () => {
    await deleteAllAiResults('account-1');
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/privacy/ai-results', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({
        confirmation: '删除全部AI结果',
        idempotencyKey: '20000000-0000-4000-8000-000000000001',
      }),
    }));
    expect(mockApplyAiReset).toHaveBeenCalledWith(deletion);

    jest.clearAllMocks();
    mockApiRequest.mockResolvedValue(deletion);
    mockRunLearningSync.mockResolvedValue({});
    await clearLearningData('account-1');
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/privacy/learning-data', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({
        confirmation: '清除学习数据',
        idempotencyKey: '20000000-0000-4000-8000-000000000002',
      }),
    }));
    expect(mockApplyLearningReset).toHaveBeenCalledWith(deletion);
    expect(mockClearRecordings).toHaveBeenCalledTimes(1);
    expect(mockClearRadio).toHaveBeenCalledTimes(1);
  });

  it('keeps the stable destructive-action receipt until local completion succeeds', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('response_lost')).mockResolvedValueOnce(deletion);

    await expect(deleteAllAiResults('account-1')).rejects.toThrow('response_lost');
    expect(mockCompletePrivacyAction).not.toHaveBeenCalled();
    await deleteAllAiResults('account-1');

    expect(mockPendingPrivacyAction).toHaveBeenNthCalledWith(1, 'account-1', 'delete_all_ai_results');
    expect(mockPendingPrivacyAction).toHaveBeenNthCalledWith(2, 'account-1', 'delete_all_ai_results');
    const requestBodies = mockApiRequest.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
    expect(requestBodies[0].idempotencyKey).toBe(requestBodies[1].idempotencyKey);
    expect(mockCompletePrivacyAction).toHaveBeenCalledTimes(1);
  });

  it('syncs before export and includes device-local profile data', async () => {
    const cloud = {
      schemaVersion: 1,
      exportedAt: '2026-08-25T00:00:00.000Z',
      account: { accountId: 'account-1', createdAt: '2026-08-01T00:00:00.000Z', providers: ['phone'] },
      learning: { dataGeneration: 0, aiResultGeneration: 0, cardStates: [], records: [], documents: [] },
    };
    mockApiRequest.mockResolvedValue(cloud);

    await expect(exportAccountAndLearningData('account-1')).resolves.toMatchObject({
      account: { accountId: 'account-1' },
      device: { localProfile: { targetLevel: 'ICAO 5 级' } },
    });
    expect(mockRunLearningSync).toHaveBeenCalledWith('account-1');
    expect(mockApiRequest).toHaveBeenCalledWith('/v1/account/privacy/export');
  });
});
