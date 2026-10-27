/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { VocabularyBook, VocabularyDataset } from '../types';

let mockLocalBack: (() => void) | undefined;
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), usePreventRemove: (enabled: boolean, back: () => void) => { mockLocalBack = enabled ? back : undefined; } }));

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

const mockSetStatus = jest.fn(async (_id: string, _status: string): Promise<void> => undefined);

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
    saveStudySession: jest.fn(async () => undefined),
    setStatus: mockSetStatus,
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
    await waitFor(() => expect(screen.getByText('ICAO考前预习')).toBeTruthy());
    expect(screen.queryByText('从 838 条 ICAO 词汇中选择词书，按自己的节奏学习。')).toBeNull();
    expect(screen.queryByText(/纳入学习数据同步/)).toBeNull();
    expect(screen.getAllByText('单词学习')).toHaveLength(1);
    expect(screen.getByText('ICAO考前预习')).toBeTruthy();
    expect(screen.getByText('360 词')).toBeTruthy();
    expect(screen.getByText('372 词')).toBeTruthy();
    expect(screen.getByText('106 词')).toBeTruthy();
    expect(screen.getByText('提前熟悉民航基础词汇，为 ICAO 学习打好基础。')).toBeTruthy();
    expect(screen.queryByText('请选择至少一本词书')).toBeNull();
    fireEvent.press(screen.getByLabelText('开始30题词汇测评'));
    await waitFor(() => expect(screen.getByText('每题 10 秒')).toBeTruthy());
    expect(screen.getByText('开始 30 题测评')).toBeTruthy();
    fireEvent.press(screen.getByText('开始 30 题测评'));
    await waitFor(() => expect(screen.getByLabelText('返回')).toBeTruthy());
    expect(screen.queryByLabelText('退出测评')).toBeNull();
    fireEvent.press(screen.getByLabelText('返回'));
    await waitFor(() => expect(screen.getByText('开始 30 题测评')).toBeTruthy());
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 451);
    await act(async () => { mockLocalBack?.(); });
    clock.mockRestore();
    await waitFor(() => expect(screen.getByText('ICAO考前预习')).toBeTruthy());
    expect(mockLocalBack).toBeUndefined();
  });
});

it('leaves a replay started from the completed word list without cycling between list and result', async () => {
  const words = mockBooks[0].words;
  mockBooks[0].words = words.slice(0, 1);
  let now = 1000;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const screen = await render(withSafeArea(<VocabularyScreen />));
    await fireEvent.press(screen.getByLabelText('选择ICAO考前预习'));
    await fireEvent.press(screen.getByText('开始学习'));
    await fireEvent.press(screen.getByText('认识'));
    await fireEvent.press(screen.getByText('完成本轮'));
    await fireEvent.press(screen.getByText('查看本轮单词'));
    await fireEvent.press(screen.getByText('学习当前 1 词'));
    await fireEvent.press(screen.getByText('认识'));
    await fireEvent.press(screen.getByText('完成本轮'));
    await act(async () => mockLocalBack?.());
    expect(screen.getByText('ICAO考前预习')).toBeTruthy();
    expect(mockLocalBack).toBeUndefined();
    now += 451;
  } finally { mockBooks[0].words = words; clock.mockRestore(); }
});

it('labels the completion return for the originating word list and returns there', async () => {
  const words = mockBooks[0].words;
  mockBooks[0].words = words.slice(0, 1);
  try {
    const screen = await render(withSafeArea(<VocabularyScreen />));
    await fireEvent.press(screen.getByLabelText('查看ICAO考前预习详情'));
    await fireEvent.press(screen.getByText('查看单词列表'));
    await fireEvent.press(screen.getByText('学习当前 1 词'));
    await fireEvent.press(screen.getByText('认识'));
    await fireEvent.press(screen.getByText('完成本轮'));
    expect(screen.getByText('返回单词列表')).toBeTruthy();
    expect(screen.queryByText('返回词书')).toBeNull();
    await fireEvent.press(screen.getByText('返回单词列表'));
    expect(screen.getByText('学习当前 1 词')).toBeTruthy();
  } finally { mockBooks[0].words = words; }
});


it('confirms a wrong mark only after saving and clears the feedback on the next word', async () => {
 const words=mockBooks[0].words;mockBooks[0].words=words.slice(0,2);mockSetStatus.mockClear();
 try {
  const screen=await render(withSafeArea(<VocabularyScreen/>));
  await fireEvent.press(screen.getByLabelText('选择ICAO考前预习'));await fireEvent.press(screen.getByText('开始学习'));
  await fireEvent.press(screen.getByText('认识'));
  let complete!:()=>void;mockSetStatus.mockImplementationOnce(()=>new Promise<void>(resolve=>{complete=resolve;}));
  await fireEvent.press(screen.getByLabelText('记错了'));
  expect(screen.queryByText('已标记记错')).toBeNull();expect(screen.getByText('word 0')).toBeTruthy();
  await act(async()=>complete());expect(screen.getByText('已标记记错')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('已标记记错'));expect(mockSetStatus).toHaveBeenCalledTimes(2);
  await fireEvent.press(screen.getByText('下一词'));expect(screen.queryByText('已标记记错')).toBeNull();
  expect(screen.getByText('word 1')).toBeTruthy();await fireEvent.press(screen.getByText('模糊'));
  mockSetStatus.mockRejectedValueOnce(new Error('write failed'));await fireEvent.press(screen.getByLabelText('记错了'));
  expect(screen.queryByText('已标记记错')).toBeNull();expect(screen.getByText('保存尚未完成')).toBeTruthy();
  await fireEvent.press(screen.getByText('重试保存'));expect(screen.getByText('已标记记错')).toBeTruthy();
 } finally {mockBooks[0].words=words;mockSetStatus.mockReset().mockResolvedValue(undefined);}
});

it('uses only the three reorganized books and exposes order before starting without changing the study controls', async () => {
  const catalog = jest.requireActual('../../../../content/vocabulary/three-books/dataset.json') as {books:VocabularyBook[]};
  const original = [...mockBooks];
  mockBooks.splice(0,mockBooks.length,...catalog.books);
  try {
    const screen = await render(withSafeArea(<VocabularyScreen />));
    await waitFor(() => expect(screen.getByText('ICAO 4 必会')).toBeTruthy());
    expect(screen.queryByText('全题库高频核心词')).toBeNull();
    expect(screen.getByLabelText('按频率')).toBeTruthy();
    expect(screen.getByLabelText('乱序学习')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('选择ICAO 4 必会'));
    await fireEvent.press(screen.getByText('开始学习'));
    const first = [...catalog.books[1]!.words].sort((a,b)=>(b.frequency?.occurrences??0)-(a.frequency?.occurrences??0))[0]!;
    expect(screen.getByText(first.word)).toBeTruthy();
    expect(screen.getByLabelText(/词频档位 .*\+/)).toBeTruthy();
    expect(screen.getByText('忘记')).toBeTruthy();
    expect(screen.getByText('模糊')).toBeTruthy();
    expect(screen.getByText('认识')).toBeTruthy();
    expect(jest.requireMock('../speech').speakVocabulary).toHaveBeenCalledWith(first.pronunciationText);
    await screen.unmount();
  } finally { mockBooks.splice(0,mockBooks.length,...original); }
});

it('keeps compact-card details separate from multi-selection and guide confirmation', async () => {
  const { GuideBindingContext } = jest.requireActual('@/features/usage-guide/GuideBindings') as typeof import('@/features/usage-guide/GuideBindings');
  const confirm = jest.fn(), event = jest.fn();
  const binding = {
    current: 'vocab', step: 'vocab-book', target: 'vocab-book', confirm, event,
    availability: jest.fn(), register: jest.fn(), modal: jest.fn(), surface: () => null,
    offer: jest.fn(), exit: jest.fn(), start: jest.fn(async () => undefined),
    suspend: jest.fn(), pause: jest.fn(), checkpoint: jest.fn(),
  };
  const screen = await render(withSafeArea(<GuideBindingContext.Provider value={binding}><VocabularyScreen /></GuideBindingContext.Provider>));
  await waitFor(() => expect(screen.getByText('ICAO考前预习')).toBeTruthy());
  expect(screen.getAllByTestId('guide-anchor-vocab-book')).toHaveLength(1);
  expect(confirm).toHaveBeenLastCalledWith('vocab-book', false);
  await fireEvent.press(screen.getByLabelText('查看ICAO考前预习详情'));
  expect(screen.getByText('查看单词列表')).toBeTruthy();
  expect(event).not.toHaveBeenCalledWith('vocab-book');
  await fireEvent.press(screen.getByLabelText('返回'));
  await fireEvent.press(screen.getByLabelText('选择ICAO考前预习'));
  expect(confirm).toHaveBeenLastCalledWith('vocab-book', true);
  await fireEvent.press(screen.getByLabelText('选择ICAO 4 必会'));
  await fireEvent.press(screen.getByLabelText('取消选择ICAO考前预习'));
  expect(confirm).toHaveBeenLastCalledWith('vocab-book', true);
  await fireEvent.press(screen.getByLabelText('取消选择ICAO 4 必会'));
  expect(confirm).toHaveBeenLastCalledWith('vocab-book', false);
  expect(event).not.toHaveBeenCalledWith('vocab-book');
});
