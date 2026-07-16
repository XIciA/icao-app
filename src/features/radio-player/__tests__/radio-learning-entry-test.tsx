import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RadioPlayerScreen } from '@/features/content/RadioPlayerScreen';

const mockPause = jest.fn();
const mockPush = jest.fn();

const mockTrack = {
  id: 'listening-main-001',
  bankId: 'listening',
  bankTitle: '听力',
  categoryId: 'listening-category-01',
  categoryTitle: '第一部分',
  topicId: 'listening-topic-01',
  topicTitle: '题组一',
  title: 'Question 1',
  audioText: 'English transcript',
  audioTextZh: '中文译文',
  audioPath: '/audio/001.mp3',
  durationSeconds: 12,
  stableIndex: 0,
};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('lucide-react-native', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const MockIcon = () => <MockView />;
  return new Proxy({}, { get: () => MockIcon });
});
jest.mock('@/features/radio-player/RadioPlayerProvider', () => ({
  useRadioPlayer: () => ({
    catalogs: [{ bankId: 'listening', title: '听力', nameEn: 'Listening', tracks: [mockTrack] }],
    currentCatalog: { bankId: 'listening', title: '听力', nameEn: 'Listening', tracks: [mockTrack] },
    currentTrack: mockTrack,
    currentIndex: 0,
    mode: 'order',
    subtitleMode: 'bilingual',
    rate: 1,
    speedOptions: [0.75, 1, 1.25, 1.5],
    playing: true,
    loading: false,
    buffering: false,
    position: 3,
    duration: 12,
    activateSession: jest.fn(),
    pause: mockPause,
    play: jest.fn(),
    toggle: jest.fn(),
    seek: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
    selectBank: jest.fn(),
    selectTrack: jest.fn(),
    setMode: jest.fn(),
    setSubtitleMode: jest.fn(),
    setRate: jest.fn(),
    retry: jest.fn(),
    stopAndClear: jest.fn(),
  }),
}));

describe('radio learning entry', () => {
  beforeEach(() => {
    mockPause.mockReset();
    mockPush.mockReset();
  });

  it('pauses radio and opens the exact source card with a radio return target', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <RadioPlayerScreen />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByText('学习本题'));

    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]',
      params: {
        bankId: 'listening',
        categoryId: 'listening-category-01',
        topicId: 'listening-topic-01',
        cardId: 'listening-main-001',
        returnTo: 'radio',
      },
    });
  });
});
