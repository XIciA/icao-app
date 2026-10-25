import { GuideBindingContext } from '@/features/usage-guide/GuideBindings';
import { fireEvent, render, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { RadioTrack } from '../types';
import { RadioPlayerScreen } from '@/features/content/RadioPlayerScreen.native';

const mockPause = jest.fn();
const mockPush = jest.fn();
const mockSetIntervalSeconds = jest.fn();
let mockSubtitleMode = 'bilingual';
let mockWaitingForNext = false;
let mockIntervalSeconds = 0;
let mockIntervalRemaining = 0;

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

let mockDirectoryTracks: RadioTrack[] = [mockTrack as RadioTrack];
const mockSelectTrack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
jest.mock('lucide-react-native', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const MockIcon = () => <MockView />;
  return new Proxy({}, { get: () => MockIcon });
});
jest.mock('@/features/radio-player/RadioPlayerProvider', () => ({
  useRadioPlayer: () => ({
    catalogs: [{ bankId: 'listening', title: '听力', nameEn: 'Listening', tracks: mockDirectoryTracks }],
    currentCatalog: { bankId: 'listening', title: '听力', nameEn: 'Listening', tracks: mockDirectoryTracks },
    currentTrack: mockTrack,
    currentIndex: 0,
    mode: 'order',
    subtitleMode: mockSubtitleMode,
    rate: 1,
    intervalSeconds: mockIntervalSeconds,
    intervalRemaining: mockIntervalRemaining,
    waitingForNext: mockWaitingForNext,
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
    selectTrack: mockSelectTrack,
    setMode: jest.fn(),
    setSubtitleMode: jest.fn(),
    setRate: jest.fn(),
    setIntervalSeconds: mockSetIntervalSeconds,
    retry: jest.fn(),
    stopAndClear: jest.fn(),
  }),
}));

describe('radio learning entry', () => {
  beforeEach(() => {
    mockDirectoryTracks = [mockTrack as RadioTrack];
    mockSelectTrack.mockReset();
    mockPause.mockReset();
    mockPush.mockReset();
    mockSetIntervalSeconds.mockReset();
    mockSubtitleMode = 'bilingual';
    mockWaitingForNext = false;
    mockIntervalSeconds = 0;
    mockIntervalRemaining = 0;
  });

  it('pauses radio and opens the exact source card with a radio return target', async () => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <RadioPlayerScreen />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByLabelText('进入当前题目学习'));

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

  it('uses the lightweight waveform while subtitles are off and exposes interval presets', async () => {
    mockSubtitleMode = 'off';
    mockWaitingForNext = true;
    mockIntervalSeconds = 5;
    mockIntervalRemaining = 3;
    const screen = await render(
      <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
        <RadioPlayerScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByLabelText('等待下一题，剩余3秒')).toBeTruthy();
    expect(screen.queryByText('English transcript')).toBeNull();

    await fireEvent.press(screen.getByLabelText('播放间隔：5秒'));
    await fireEvent.press(screen.getByLabelText('设置播放间隔10秒'));

    expect(mockSetIntervalSeconds).toHaveBeenCalledWith(10);
  });
});

it('keeps presets and completion inside the interval tutorial target', async () => {
  mockIntervalSeconds = 0;
  const event = jest.fn();
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      <GuideBindingContext.Provider value={{ availability: jest.fn(), event, surface: () => null, register: jest.fn(), modal: jest.fn(), offer: jest.fn(), exit: jest.fn(), start: jest.fn(), suspend: jest.fn(), pause: jest.fn(), checkpoint: jest.fn() }}><RadioPlayerScreen /></GuideBindingContext.Provider>
    </SafeAreaProvider>,
  );
  await fireEvent.press(screen.getByLabelText('播放间隔：0秒'));
  const targets = screen.getAllByTestId('guide-anchor-radio-interval', { includeHiddenElements: true });
  const sheetTarget = targets[targets.length - 1];
  expect(within(sheetTarget.parent!).getByLabelText('设置播放间隔10秒')).toBeTruthy();
  expect(within(sheetTarget.parent!).getByText('完成')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('设置播放间隔10秒'));
  expect(event).not.toHaveBeenCalledWith('radio-interval');
  await fireEvent.press(screen.getByText('完成'));
  expect(event).toHaveBeenCalledWith('radio-interval');
});


it('shows the full total and selects an unloaded late question by its position', async () => {
  mockDirectoryTracks = Array.from({ length: 100 }, (_, index) => ({ ...mockTrack, id: `entry-${index}`, title: `Topic item ${index}`, stableIndex: index, bankId: 'listening', contentLoaded: false, audioPath: '', audioText: '' }));
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}><RadioPlayerScreen /></SafeAreaProvider>);
  expect(screen.getByText('1/100')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('打开播放队列'));
  await fireEvent.changeText(screen.getByLabelText('搜索播放队列'), '100');
  await fireEvent.press(screen.getByLabelText('播放 Topic item 99'));
  expect(mockSelectTrack).toHaveBeenCalledWith('entry-99', true);
  await screen.unmount();
  mockDirectoryTracks = [mockTrack as RadioTrack];
});
