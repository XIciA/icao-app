/* eslint-disable import/first */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { VocabularyBook, VocabularyDataset, VocabularyState } from '../types';

const mockSetFavorite = jest.fn(async () => undefined);
const mockMigrateFavorites = jest.fn(async (_books: VocabularyBook[]) => undefined);
const mockLoadVocabulary = jest.fn();
const mockUseWordFavorites = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('../repository', () => ({
  loadVocabulary: () => mockLoadVocabulary(),
}));
jest.mock('../progress-store', () => ({
  migrateLegacyVocabularyFavorites: (books: VocabularyBook[]) => mockMigrateFavorites(books),
  useWordFavorites: () => mockUseWordFavorites(),
}));
jest.mock('@/features/question-bank/static-word-lookup/repository', () => ({
  getStaticWordLookupEntries: () => [
    { word: 'deviation', ipa: '/ˌdiːviˈeɪʃən/', aviationMeaning: 'n. 航向偏离', generalMeaning: 'n. 偏差' },
    { word: 'clearance', ipa: '/ˈklɪrəns/', aviationMeaning: 'n. 管制许可', generalMeaning: 'n. 清除；许可' },
  ],
}));

import { favoriteKeyForWord } from '../favorites';
import { WordFavoritesScreen } from '../WordFavoritesScreen';

const book: VocabularyBook = {
  id: 'preview',
  level: 1,
  name: 'ICAO考前预习',
  description: '预习',
  words: [{
    id: 'preview-0001',
    bookId: 'preview',
    level: 1,
    word: 'deviation',
    meaning: 'n. 偏离',
    example: 'Report any deviation.',
    exampleTranslation: '报告任何偏离。',
    source: { name: 'test', rowIndex: 1, sourceNo: 1 },
  }],
};
const dataset: VocabularyDataset = {
  schemaVersion: 1,
  version: 1,
  source: { name: 'test', generatedAt: '2026-07-23T00:00:00.000Z', sourceRows: 1, validRows: 1, ignoredRows: 0, invalidRows: 0 },
  books: [book],
};

function stateFor(words: string[]): VocabularyState {
  const updatedAt = '2026-07-23T03:00:00.000Z';
  return {
    schemaVersion: 1,
    words: Object.fromEntries(words.map((word, index) => [
      favoriteKeyForWord(word)!,
      { status: 'new', favorite: true, updatedAt: new Date(Date.parse(updatedAt) + index * 1000).toISOString() },
    ])),
    updatedAt,
  };
}

async function renderScreen(width = 375) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      <WordFavoritesScreen />
    </SafeAreaProvider>,
  );
}

describe('WordFavoritesScreen', () => {
  beforeEach(() => {
    mockSetFavorite.mockClear();
    mockMigrateFavorites.mockClear();
    mockLoadVocabulary.mockReset();
    mockUseWordFavorites.mockReset();
    mockLoadVocabulary.mockResolvedValue({ dataset, source: 'remote' });
    mockUseWordFavorites.mockReturnValue({
      ready: true,
      state: stateFor(['deviation', 'clearance']),
      setFavorite: mockSetFavorite,
    });
  });

  it('merges sources, sorts favorites, and removes from the unified list action', async () => {
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText(/词书：/)).toBeTruthy());
    expect(screen.getAllByText('deviation')).toHaveLength(1);
    expect(screen.getByText('单词学习')).toBeTruthy();
    expect(screen.getAllByText('题库查词')).toHaveLength(2);
    expect(mockMigrateFavorites).toHaveBeenCalledWith([book]);

    fireEvent.press(screen.getByLabelText('取消收藏deviation'));
    expect(mockSetFavorite).toHaveBeenCalledWith({ word: 'deviation', wordId: 'preview-0001' }, false);
  });

  it('shows the empty state after resources load with no favorites', async () => {
    mockUseWordFavorites.mockReturnValue({ ready: true, state: stateFor([]), setFavorite: mockSetFavorite });
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('还没有收藏单词')).toBeTruthy());
  });

  it('keeps lookup favorites visible when vocabulary loading fails', async () => {
    mockLoadVocabulary.mockRejectedValue(new Error('offline'));
    mockUseWordFavorites.mockReturnValue({ ready: true, state: stateFor(['clearance']), setFavorite: mockSetFavorite });
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByText('词书资源暂时不可用')).toBeTruthy());
    expect(screen.getByText('clearance')).toBeTruthy();
    expect(screen.getByText('n. 管制许可')).toBeTruthy();
  });

  it.each([360, 375, 390, 430])('renders the merged list at %ipx without dropping actions', async (width) => {
    const screen = await renderScreen(width);

    await waitFor(() => expect(screen.getByLabelText('取消收藏deviation')).toBeTruthy());
    expect(screen.getByText('单词学习')).toBeTruthy();
    expect(screen.getAllByText('题库查词')).toHaveLength(2);
  });
});
