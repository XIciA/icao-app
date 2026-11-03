import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { VocabularyState } from '../types';
import type { LearningRecord } from '@/features/question-bank/types';
import { SessionRecapList } from '@/features/question-bank/components/SessionRecapList.native';
import { WordFavoritesScreen } from '../WordFavoritesScreen.native';
import { resetVocabularyMutationQueueForTests } from '../progress-store.native';

let mockState: VocabularyState;
const mockListeners = new Set<(state: VocabularyState) => void>();
jest.mock('../persistence', () => ({
  createEmptyVocabularyState: () => ({ schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() }),
  readVocabularyState: async () => mockState,
  writeVocabularyState: async (state: VocabularyState) => { mockState = state; mockListeners.forEach(listener => listener(state)); return state; },
  subscribeVocabularyState: (listener: (state: VocabularyState) => void) => { mockListeners.add(listener); return () => mockListeners.delete(listener); },
}));
jest.mock('@/features/sync/learning-sync.native', () => ({
  captureLearningWriteContext: () => 'account', assertLearningWriteContext: () => undefined,
  mutateVocabularyInCurrentWorkspace: async (_owner: string, action: () => Promise<unknown>) => action(),
}));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ account: { accountId: 'account' } }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));
jest.mock('../use-vocabulary-catalog', () => ({ useVocabularyCatalog: () => ({ loadResult: { dataset: { books: [] } } }) }));
jest.mock('@/features/question-bank/annotations/use-question-annotations-with-save.native', () => ({ useQuestionAnnotations: () => ({ hydrated: true, highlightDefinitions: [], tagDefinitions: [], store: { entries: {} } }) }));
jest.mock('@/features/question-bank/static-word-lookup/use-word-lookup', () => ({ useWordLookupUpdates: () => 0 }));
jest.mock('@/features/question-bank/static-word-lookup/repository', () => ({
  getStaticWordLookupEntries: () => [{ word: 'terrain', ipa: '/təˈreɪn/', aviationMeaning: '地形' }],
  findStaticWordLookup: () => ({ word: 'terrain', ipa: '/təˈreɪn/', aviationMeaning: '地形' }),
}));
jest.mock('../speech.native', () => ({ speakVocabulary: jest.fn(async () => true), stopVocabularySpeech: jest.fn(async () => undefined) }));

it('shares persisted favorites between session lookup and collection, including removal and undo', async () => {
  mockState = { schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() };
  mockListeners.clear(); resetVocabularyMutationQueueForTests();
  const record = { sessionRecap: { words: [{ word: 'terrain', favorited: false }] }, studyReview: { items: [] } } as unknown as LearningRecord;
  const lookup = await render(<SessionRecapList kind="words" record={record} onBack={jest.fn()} onOpen={jest.fn()} />);
  await waitFor(() => expect(lookup.getByLabelText('收藏 terrain')).toBeTruthy());
  await fireEvent.press(lookup.getByLabelText('收藏 terrain'));
  await waitFor(() => expect(lookup.getByLabelText('取消收藏 terrain')).toBeTruthy());
  await lookup.unmount();
  const saved = await render(<WordFavoritesScreen />);
  await waitFor(() => expect(saved.getByText('terrain')).toBeTruthy());
  await fireEvent.press(saved.getByLabelText('取消收藏 terrain'));
  await waitFor(() => expect(saved.queryByText('terrain')).toBeNull());
  await fireEvent.press(saved.getByText('撤销'));
  await waitFor(() => expect(saved.getByText('terrain')).toBeTruthy());
  await saved.unmount();
  const returned = await render(<SessionRecapList kind="words" record={record} onBack={jest.fn()} onOpen={jest.fn()} initialViewState={{ onlyFavorites: true, scrollY: 0 }} />);
  await waitFor(() => expect(returned.getByLabelText('取消收藏 terrain')).toBeTruthy());
});
