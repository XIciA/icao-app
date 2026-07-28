import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { embeddedQuestionBankRepository } from '@/features/question-bank/data/repository';

import { resolveHotspotTopics } from '../build-hotspot-session';
import { HotspotDetailScreen } from '../HotspotDetailScreen';
import { HotspotListScreen } from '../HotspotListScreen';
import { loadHotspotBriefs } from '../repository';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => true,
    push: mockPush,
    replace: jest.fn(),
  }),
}));

function withSafeArea(screen: React.ReactNode) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 47 } }}>
      {screen}
    </SafeAreaProvider>
  );
}

describe('OPI hotspot screens', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
  });

  it('opens a dated hotspot from the list through its dedicated route', async () => {
    const brief = loadHotspotBriefs()[0];
    const screen = await render(withSafeArea(<HotspotListScreen />));

    fireEvent.press(screen.getByLabelText(`打开 ${brief.title}`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/content/hotspot/[briefId]',
      params: { briefId: brief.id },
    });
  });

  it('renders the real OPI questions and starts the matching study route', async () => {
    const brief = loadHotspotBriefs()[0];
    const dataset = await embeddedQuestionBankRepository.getDataset('opi');
    expect(dataset).toBeDefined();
    if (!dataset) return;
    const expectedQuestion = resolveHotspotTopics(brief, dataset)[0].cards[0].audioText;
    expect(expectedQuestion).toEqual(expect.any(String));
    if (!expectedQuestion) return;
    const screen = await render(withSafeArea(<HotspotDetailScreen briefId={brief.id} />));

    await waitFor(() => expect(screen.getByText(expectedQuestion)).toBeTruthy());
    fireEvent.press(screen.getByText(`开始学习（共 ${brief.topics.reduce((sum, topic) => sum + topic.cardIds.length, 0)} 题）`));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/content/hotspot/[briefId]/study',
      params: { briefId: brief.id },
    });
  });
});
