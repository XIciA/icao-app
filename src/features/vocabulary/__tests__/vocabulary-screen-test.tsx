/* eslint-disable import/first */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { VocabularyBook, VocabularyDataset } from '../types';

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

jest.mock('../speech', () => ({ speakVocabulary: jest.fn(async () => true), speakVocabularyWithFeedback: jest.fn(async () => true), stopVocabularySpeech: jest.fn(async () => undefined) }));

function createBook(id: VocabularyBook['id'], name: string, count: number): VocabularyBook {
  const level = id === 'preview' ? 1 : id === 'icao4' ? 2 : 3;
  return {
    id,
    level,
    name,
    description: `${name}描述`,
    words: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index}`,
      bookId: id,
      level,
      word: `word ${index}`,
      meaning: `meaning ${index}`,
      example: `Example ${index}.`,
      exampleTranslation: `例句 ${index}`,
      source: { name: 'test', rowIndex: index, sourceNo: index },
    })),
  };
}

const mockBooks = [
  createBook('preview', 'ICAO考前预习', 360),
  createBook('icao4', 'ICAO 4 必会', 372),
  createBook('icao5', 'ICAO 5 冲刺', 106),
];
const mockDataset: VocabularyDataset = {
  schemaVersion: 1,
  version: 1,
  source: { name: 'test', generatedAt: '2026-07-13T00:00:00.000Z', sourceRows: 838, validRows: 838, ignoredRows: 0, invalidRows: 0 },
  books: mockBooks,
};

jest.mock('../repository', () => ({
  loadVocabulary: jest.fn(async () => ({ dataset: mockDataset, source: 'remote' })),
}));

jest.mock('../progress-store', () => ({
  progressFor: (wordId: string, state: { words: Record<string, { status: string; favorite: boolean; updatedAt: string }> }) => state.words[wordId] ?? { status: 'new', favorite: false, updatedAt: new Date(0).toISOString() },
  useVocabularyProgress: () => ({
    ready: true,
    state: { schemaVersion: 1, words: {}, updatedAt: new Date(0).toISOString() },
    statsByBook: Object.fromEntries(mockBooks.map((book) => [book.id, { total: book.words.length, learned: 0, known: 0, vague: 0, forgot: 0, wrong: 0, favorite: 0 }])),
    setStatus: jest.fn(async () => undefined),
    toggleFavorite: jest.fn(async () => undefined),
    resetBook: jest.fn(async () => undefined),
    saveTestResult: jest.fn(async () => undefined),
  }),
}));

import { VocabularyScreen } from '../VocabularyScreen';

function withSafeArea(node: React.ReactNode) {
  return <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>{node}</SafeAreaProvider>;
}

describe('VocabularyScreen', () => {
  it('renders all three real-size books and opens the 30-question assessment', async () => {
    const screen = await render(withSafeArea(<VocabularyScreen />));
    await waitFor(() => expect(screen.getByText('从 838 条 ICAO 词汇中选择词书，按自己的节奏学习。')).toBeTruthy());
    expect(screen.getAllByText('单词学习')).toHaveLength(1);
    expect(screen.getByText('ICAO考前预习')).toBeTruthy();
    expect(screen.getByText('360 词')).toBeTruthy();
    expect(screen.getByText('372 词')).toBeTruthy();
    expect(screen.getByText('106 词')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('开始30题词汇测评'));
    await waitFor(() => expect(screen.getByText('每题 10 秒')).toBeTruthy());
    expect(screen.getByText('开始 30 题测评')).toBeTruthy();
  });
});
