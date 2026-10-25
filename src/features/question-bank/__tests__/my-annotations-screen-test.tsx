import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MyAnnotationsScreen } from '../components/MyAnnotationsScreen';

let mockHighlightName: string | undefined;
let mockHighlightDeleted = false;
const mockPush = jest.fn();
const mockRefresh = jest.fn(async () => undefined);

jest.mock('../annotations/card-index.native', () => {
  const actual = jest.requireActual('../annotations/card-index.native');
  const { createCardDirectory } = jest.requireActual('../data/card-directory');
  const directory = createCardDirectory(require('../data/question-bank.json'));
  return { ...actual, getQuestionBankCardReference: (target: object) => directory.get(target) };
});
jest.mock('../annotations/use-card-references.native', () => ({ useCardReferences: (targets: { bankId: string; cardId: string }[]) => {
  const { getQuestionBankCardReference } = jest.requireMock('../annotations/card-index.native');
  return { values: new Map(targets.map(target => [`${target.bankId}:${target.cardId}`, { status: 'ready', location: getQuestionBankCardReference(target) }])), retry: jest.fn() };
} }));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => callback(),
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return {
    ArrowLeft: Icon,
    BookOpenText: Icon,
    Check: Icon,
    ChevronDown: Icon,
    ChevronRight: Icon,
    Headphones: Icon,
    Highlighter: Icon,
    MessageSquareQuote: Icon,
    Mic2: Icon,
    NotebookPen: Icon,
    RadioTower: Icon,
    Search: Icon,
    Tag: Icon,
    X: Icon,
  };
});

jest.mock('../annotations/use-question-annotations', () => ({
  useQuestionAnnotations: () => {
    const { DEFAULT_ANNOTATION_HIGHLIGHTS, DEFAULT_ANNOTATION_TAGS } = jest.requireActual('../annotations/types');
    const highlights = DEFAULT_ANNOTATION_HIGHLIGHTS.filter((entry: { id: string }) => !mockHighlightDeleted || entry.id !== 'yellow').map((entry: { id: string; label: string }) => entry.id === 'yellow' && mockHighlightName ? { ...entry, label: mockHighlightName } : entry);
    return ({
    hydrated: true,
    highlightDefinitions: highlights,
    loadErrorMessage: undefined,
    refresh: mockRefresh,
    store: {
      version: 1,
      legacyImported: true,
      tagDefinitions: DEFAULT_ANNOTATION_TAGS,
      highlightDefinitions: highlights,
      entries: {
        entry: {
          bankId: 'listening',
          categoryId: 'listening-category-01',
          topicId: 'listening-topic-01',
          cardId: 'listening-main-001',
          tagIds: ['memory'],
          highlights: mockHighlightDeleted ? [] : [{ blockId: 'question', wordIndex: 0, colorId: 'yellow', quote: 'UAL919,', sentence: 'UAL 919, was struck by lightning.', contentFingerprint: jest.requireActual('../annotations/text').contentFingerprint(jest.requireMock('../annotations/card-index.native').getQuestionBankCardReference({ bankId: 'listening', cardId: 'listening-main-001' }).card.audioText) }],
          note: '复习雷击通话',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
        sentenceEntry: {
          bankId: 'sentences900',
          categoryId: 'sentence900-3级',
          topicId: 'sentence900-3级-main',
          cardId: 'sentence900-main-001',
          tagIds: ['good', 'confused'],
          highlights: [],
          note: '',
          updatedAt: '2026-07-12T01:00:00.000Z',
        },
      },
    },
    tagDefinitions: DEFAULT_ANNOTATION_TAGS,
    });
  },
}));

describe('<MyAnnotationsScreen />', () => {
  beforeEach(() => {
    mockHighlightName = undefined; mockHighlightDeleted = false;
    mockPush.mockClear();
    mockRefresh.mockClear();
  });

  it('separates annotation kinds, filters by color, and routes to the exact card', async () => {
    const screen = await render(<MyAnnotationsScreen />);
    expect(screen.queryByText('我的标注')).toBeNull();
    expect(screen.getByText('全部题库')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/UAL\s?919/)).toBeTruthy());
    expect(screen.getByText('Maintaining FL310.')).toBeTruthy();
    expect(screen.getByLabelText('已添加2个标签：好题、不懂')).toBeTruthy();

    await fireEvent.press(screen.getByText(/UAL\s?919/));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ cardId: 'listening-main-001', returnTo: 'annotations' }) }));

    await fireEvent.press(screen.getByText('高亮'));
    expect(screen.getByLabelText('高亮词：UAL919,')).toBeTruthy();
    expect(screen.queryByLabelText('高亮词：UAL')).toBeNull();
    expect(screen.getByText('重点')).toBeTruthy();
    expect(screen.getByText('记忆')).toBeTruthy();
    expect(screen.getByText('难点')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('筛选难点'));
    expect(screen.getByText('没有匹配该颜色的高亮')).toBeTruthy();
  });

  it('can narrow the default all-bank view to one question bank', async () => {
    const screen = await render(<MyAnnotationsScreen />);
    expect(screen.getByText('Maintaining FL310.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/UAL\s?919/)).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('切换题库'));
    await fireEvent.press(screen.getByText('听力'));

    expect(screen.queryByText('Maintaining FL310.')).toBeNull();
    await waitFor(() => expect(screen.getByText(/UAL\s?919/)).toBeTruthy());
    expect(screen.queryByText('本机数据 · 当前题库')).toBeNull();
  });
});

it('keeps a filter attached to its stable class ID after renaming, and clears deleted filters while preserving notes', async () => {
  const screen = await render(<MyAnnotationsScreen />);
  await fireEvent.press(screen.getByText('高亮'));
  await fireEvent.press(screen.getByLabelText('筛选记忆'));
  mockHighlightName = '待复习';
  await screen.rerender(<MyAnnotationsScreen />);
  expect(screen.getByLabelText('筛选待复习').props.accessibilityState.selected).toBe(true);
  expect(screen.getByLabelText('高亮词：UAL919,')).toBeTruthy();
  mockHighlightDeleted = true;
  await screen.rerender(<MyAnnotationsScreen />);
  expect(screen.queryByLabelText('筛选待复习')).toBeNull();
  expect(screen.queryByLabelText('高亮词：UAL919,')).toBeNull();
  await fireEvent.press(screen.getByText('笔记'));
  expect(screen.getByText('复习雷击通话')).toBeTruthy();
});
