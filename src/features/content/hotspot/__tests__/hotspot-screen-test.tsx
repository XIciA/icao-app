import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { AppContentHotspotOverview } from '@icao/contracts/app-content';

import { HotspotDetailScreen } from '../HotspotDetailScreen';
import { HotspotListScreen } from '../HotspotListScreen';
import { loadHotspotBriefs } from '../repository';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockOverview: AppContentHotspotOverview;
const completeQuestion = 'What should a pilot do when severe weather affects the planned route?';

jest.mock('../use-hotspot-overview.native', () => ({
  useHotspotOverview: () => ({ state: { ...mockOverview, status: 'ready' }, retry: jest.fn() }),
}));
jest.mock('@/features/auth/use-member-action', () => ({ useMemberAction: () => mockPush }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual('react').useEffect(effect, [effect]),
}));
jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: mockBack, canGoBack: () => true, push: mockPush, replace: jest.fn() }),
}));

function withSafeArea(screen: React.ReactNode) {
  return <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>{screen}</SafeAreaProvider>;
}

describe('OPI hotspot screens', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    // Public overview fixtures contain complete questions, never member cards or study packages.
    const brief = loadHotspotBriefs()[0];
    mockOverview = { brief, topics: brief.topics.map((topic, topicIndex) => ({
      topicId: topic.topicId, topicTitle: topic.topicTitle,
      cards: topic.cardIds.map((id, cardIndex) => ({
        id, prompt: topicIndex === 0 && cardIndex === 0 ? completeQuestion
          : `How should the crew manage operational situation ${topicIndex + 1}.${cardIndex + 1}?`,
      })),
    })) };
    // The list fixture falls back to its bundled directory without using a live service.
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline_test_fixture'));
  });
  afterEach(() => jest.restoreAllMocks());

  it('opens a dated hotspot from the list through its dedicated route', async () => {
    const brief = mockOverview.brief;
    const screen = await render(withSafeArea(<HotspotListScreen />));
    await fireEvent.press(screen.getByLabelText(`打开 ${brief.title}`));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/content/hotspot/[briefId]', params: { briefId: brief.id } });
  });

  it('renders a complete public English question and routes Start learning through the member action', async () => {
    const brief = mockOverview.brief;
    const screen = await render(withSafeArea(<HotspotDetailScreen briefId={brief.id} />));
    expect(screen.getByText(completeQuestion)).toBeTruthy();
    await fireEvent.press(screen.getByText(`开始学习（共 ${brief.topics.reduce((sum, topic) => sum + topic.cardIds.length, 0)} 题）`));
    expect(mockPush).toHaveBeenCalledWith(`/content/hotspot/${encodeURIComponent(brief.id)}/study`);
  });
});
