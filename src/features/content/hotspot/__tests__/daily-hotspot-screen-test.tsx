import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { normalizeDailyHotspots, type AppContentHotspotOverview } from '@icao/contracts/app-content';
import { HotspotDetailScreen } from '../HotspotDetailScreen.native';

const mockPush = jest.fn();
const brief = normalizeDailyHotspots(['北京考点', '深圳考点'].map((center, i) => ({
  id: `source-${center}`, date: '2026-10-16', title: `Original ${center}`, centers: [center],
  topics: [{ topicId: 't', topicTitle: 'Weather', cardIds: i ? ['shared', 'b'] : ['shared', 'a'] }],
})))[0]!;
const questions = {
  shared: 'What actions should pilots take when the weather deteriorates?',
  a: 'How should the crew prepare for a possible diversion?',
  b: 'What information should pilots obtain before flying near thunderstorms?',
};
const mockOverview: AppContentHotspotOverview = { brief, topics: [{
  topicId: 't', topicTitle: 'Weather', cards: (['shared', 'a', 'b'] as const).map(id => ({
    id, prompt: `How should pilots handle weather scenario ${id}?`,
    reportedPrompts: { 'source-北京考点': [questions[id]], 'source-深圳考点': [questions[id]] },
  })),
}] };

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: mockPush, canGoBack: () => true, back: jest.fn() }) }));
jest.mock('../use-hotspot-overview.native', () => ({ useHotspotOverview: () => ({ state: { ...mockOverview, status: 'ready' }, retry: jest.fn() }) }));
jest.mock('@/features/auth/use-member-action', () => ({ useMemberAction: () => mockPush }));

it('deduplicates the day, shows source attribution and carries the selected center into practice', async () => {
  const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}><HotspotDetailScreen briefId={brief.id} /></SafeAreaProvider>);
  expect(screen.getAllByText(questions.shared)).toHaveLength(1);
  expect(screen.getByText(questions.a)).toBeTruthy();
  expect(screen.getByText(questions.b)).toBeTruthy();
  expect(screen.getByText('本日汇总 2 份反馈，共 3 道题。')).toBeTruthy();
  expect(screen.getAllByText('北京考点').length).toBeGreaterThan(1);
  expect(screen.getAllByText('深圳考点').length).toBeGreaterThan(1);
  await fireEvent.press(screen.getByRole('button', { name: '深圳考点' }));
  await waitFor(() => expect(screen.queryByText(questions.a)).toBeNull());
  expect(screen.getByText(questions.shared)).toBeTruthy();
  expect(screen.getByText(questions.b)).toBeTruthy();
  await fireEvent.press(screen.getByText('开始学习（共 2 题）'));
  expect(mockPush).toHaveBeenCalledWith(`/content/hotspot/${encodeURIComponent(brief.id)}/study?center=${encodeURIComponent("深圳考点")}`);
});

it('shows one all-centers filter for general feedback and no historical disclaimer', async () => {
  const previous = mockOverview.brief;
  mockOverview.brief = { ...brief, centers: ['综合反馈'], sources: [{
    id: 'general', title: '综合反馈', centers: ['综合反馈'], kind: 'general', topics: brief.topics,
  }] };
  try {
    const screen = await render(<SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}><HotspotDetailScreen briefId={brief.id} /></SafeAreaProvider>);
    expect(screen.getAllByRole('button', { name: '全部考点' })).toHaveLength(1);
    expect(screen.queryByText('本日综合反馈')).toBeNull();
    expect(screen.queryByText(/历史综合反馈/)).toBeNull();
    await fireEvent.press(screen.getByText('开始学习（共 3 题）'));
    expect(mockPush).toHaveBeenCalledWith(`/content/hotspot/${encodeURIComponent(brief.id)}/study`);
  } finally { mockOverview.brief = previous; }
});
