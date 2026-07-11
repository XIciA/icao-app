import { fireEvent, render } from '@testing-library/react-native';

import { MyAnnotationsScreen } from '../components/MyAnnotationsScreen';

const mockPush = jest.fn();
const mockRefresh = jest.fn(async () => undefined);

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => callback(),
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return {
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
    return ({
    hydrated: true,
    highlightDefinitions: DEFAULT_ANNOTATION_HIGHLIGHTS,
    loadErrorMessage: undefined,
    refresh: mockRefresh,
    store: {
      version: 1,
      legacyImported: true,
      tagDefinitions: DEFAULT_ANNOTATION_TAGS,
      highlightDefinitions: DEFAULT_ANNOTATION_HIGHLIGHTS,
      entries: {
        entry: {
          bankId: 'listening',
          categoryId: 'listening-category-01',
          topicId: 'listening-topic-01',
          cardId: 'listening-main-001',
          tagIds: ['memory'],
          highlights: [{ blockId: 'question', wordIndex: 1, colorId: 'yellow', quote: 'Airlines', sentence: 'United Airlines 919 was struck by lightning.', contentFingerprint: 'abc' }],
          note: '复习雷击通话',
          updatedAt: '2026-07-12T00:00:00.000Z',
        },
      },
    },
    tagDefinitions: DEFAULT_ANNOTATION_TAGS,
    });
  },
}));

describe('<MyAnnotationsScreen />', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockRefresh.mockClear();
  });

  it('separates annotation kinds, filters by color, and routes to the exact card', async () => {
    const screen = await render(<MyAnnotationsScreen />);
    expect(screen.getByText('我的标注')).toBeTruthy();
    expect(screen.getByText(/United Airlines 919/)).toBeTruthy();

    await fireEvent.press(screen.getByText(/United Airlines 919/));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ cardId: 'listening-main-001', returnTo: 'annotations' }) }));

    await fireEvent.press(screen.getByText('高亮'));
    expect(screen.getByText('United Airlines 919 was struck by lightning.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('筛选颜色 red'));
    expect(screen.getByText('没有匹配该颜色的高亮')).toBeTruthy();
  });
});
