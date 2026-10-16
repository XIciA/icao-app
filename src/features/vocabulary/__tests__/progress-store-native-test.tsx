import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createEmptyVocabularyState, readVocabularyState, writeVocabularyState } from '../persistence';
import { resetVocabularyMutationQueueForTests, setWordFavorite, useVocabularyState } from '../progress-store.native';
jest.mock('../persistence', () => ({
  createEmptyVocabularyState: () => ({ schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() }),
  readVocabularyState: jest.fn(), writeVocabularyState: jest.fn(), subscribeVocabularyState: () => () => undefined,
}));
let mockOwner = 0;
jest.mock('@/features/sync/learning-sync.native', () => ({
  captureLearningWriteContext: () => mockOwner,
  assertLearningWriteContext: (owner: number) => { if (owner !== mockOwner) throw new Error('account_changed'); },
  mutateVocabularyInCurrentWorkspace: async (owner: number, action: () => Promise<unknown>) => {
    if (owner !== mockOwner) throw new Error('account_changed');
    return action();
  },
}));
beforeEach(() => {
  jest.clearAllMocks(); mockOwner = 0; resetVocabularyMutationQueueForTests();
  jest.mocked(readVocabularyState).mockResolvedValue(createEmptyVocabularyState());
  jest.mocked(writeVocabularyState).mockImplementation(async state => state);
});
it('leaves loading after a read failure and retries without inventing empty progress', async () => {
  jest.mocked(readVocabularyState).mockRejectedValueOnce(new Error('disk'));
  const { result } = await renderHook(useVocabularyState);
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.ready).toBe(false);
  await act(async () => result.current.retry());
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toBe(false);
});
it('propagates failed writes and lets a later retry succeed', async () => {
  jest.mocked(writeVocabularyState).mockRejectedValueOnce(new Error('disk'));
  await expect(setWordFavorite({ word: 'pilot' }, true)).rejects.toThrow('disk');
  await expect(setWordFavorite({ word: 'pilot' }, true)).resolves.toMatchObject({ words: expect.any(Object) });
});
it('does not install a late read from a previous account', async () => {
  let resolve!: (value: ReturnType<typeof createEmptyVocabularyState>) => void;
  jest.mocked(readVocabularyState).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const { result } = await renderHook(useVocabularyState);
  mockOwner++;
  await act(async () => resolve({ ...createEmptyVocabularyState(), words: { private: { status: 'known', favorite: true, updatedAt: new Date().toISOString() } } }));
  expect(result.current.state.words).toEqual({});
  expect(result.current.error).toBe(true);
});
