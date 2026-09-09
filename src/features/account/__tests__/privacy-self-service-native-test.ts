const mockRequest = jest.fn();
const mockAccessToken = jest.fn();
let mockOwner = 'A';
const mockApply = jest.fn();
const mockSync = jest.fn();
const mockClearRecordings = jest.fn();
const mockClearRadio = jest.fn();
const contextFor = (accountId?: string) => {
  if (accountId && accountId !== mockOwner) throw new Error('learning_owner_or_generation_changed');
  return { ownerToken: mockOwner, aiToken: 0 };
};
const assertCurrent = (context: { ownerToken: string }) => {
  if (context.ownerToken !== mockOwner) throw new Error('learning_owner_or_generation_changed');
};
jest.mock('@/platform/api-client', () => ({
  apiAccessToken: () => mockAccessToken(),
  apiRequestWithAccessToken: (...args: unknown[]) => mockRequest(...args),
}));
jest.mock('@/features/sync/learning-sync.native', () => ({
  captureLearningWriteContext: (accountId?: string) => contextFor(accountId),
  assertLearningWriteContext: (context: { ownerToken: string }) => assertCurrent(context),
  runLearningSync: (...args: unknown[]) => mockSync(...args),
  applyPrivacyLearningDataReset: (...args: unknown[]) => mockApply(...args),
  applyPrivacyAiResultReset: (...args: unknown[]) => mockApply(...args),
  deleteLocalAiResult: (...args: unknown[]) => mockApply(...args),
}));
jest.mock('../privacy-action-state', () => ({
  pendingPrivacyActionFor: async (accountId: string) => ({ accountId, idempotencyKey: 'receipt-1' }),
  completePrivacyAction: jest.fn(),
}));
jest.mock('@/features/question-bank/recording/recording-repository', () => ({ recordingRepository: { clearAll: () => mockClearRecordings() } }));
jest.mock('@/features/radio-player/radio-player-storage', () => ({ clearRadioPlayerAccountData: () => mockClearRadio() }));
// eslint-disable-next-line import/first
import { clearLearningData, deleteAiResult, deleteAllAiResults } from '../privacy-self-service.native';
beforeEach(() => {
  jest.clearAllMocks(); mockOwner = 'A'; mockAccessToken.mockResolvedValue('token-A');
  mockRequest.mockResolvedValue({ dataGeneration: 2, aiResultGeneration: 3 }); mockSync.mockResolvedValue(undefined);
  mockApply.mockImplementation(async (_value, context, cleanup) => { assertCurrent(context); await cleanup?.(); });
});
it.each(['learning', 'ai', 'single'] as const)('pins the %s request and reset to its original account', async kind => {
  const execute = () => kind === 'learning' ? clearLearningData('A') : kind === 'ai' ? deleteAllAiResults('A') : deleteAiResult('A', 'one');
  let resolve!: (value: unknown) => void;
  mockRequest.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = execute();
  for (let i = 0; i < 30 && !resolve; i++) await Promise.resolve();
  expect(mockRequest).toHaveBeenCalledWith(expect.any(String), 'token-A', expect.objectContaining({ method: 'DELETE' }));
  mockOwner = 'B'; resolve({ dataGeneration: 2, aiResultGeneration: 3 });
  await expect(pending).rejects.toThrow('learning_owner_or_generation_changed');
  expect(mockApply.mock.calls[0][1].ownerToken).toBe('A');
  expect(mockClearRecordings).not.toHaveBeenCalled(); expect(mockClearRadio).not.toHaveBeenCalled();
});
it('refuses a different owner before sending a deletion and clears related media inside the workspace reset', async () => {
  await expect(clearLearningData('B')).rejects.toThrow('learning_owner_or_generation_changed');
  expect(mockRequest).not.toHaveBeenCalled();
  await clearLearningData('A'); expect(mockClearRecordings).toHaveBeenCalledTimes(1); expect(mockClearRadio).toHaveBeenCalledTimes(1);
});
