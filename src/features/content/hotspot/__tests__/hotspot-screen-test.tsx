import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import completeQuestionBanks from '@/features/question-bank/data/question-bank.json';
import * as questionBankDataRepository from '@/features/question-bank/data/repository';
import type { QuestionBankDataset } from '@/features/question-bank/types';

import { resolveHotspotTopics } from '../build-hotspot-session';
import { HotspotDetailScreen } from '../HotspotDetailScreen';
import { HotspotListScreen } from '../HotspotListScreen';
import { loadHotspotBriefs } from '../repository';

const mockBack = jest.fn();
const mockPush = jest.fn();

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
  const completeOpiDataset = (completeQuestionBanks as QuestionBankDataset[]).find((bank) => bank.id === 'opi');

  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    // The screen fixture uses bundled briefs and questions, independent of the live content service.
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline_test_fixture'));
    jest.spyOn(questionBankDataRepository, 'loadQuestionBank').mockImplementation(async (bankId) => (
      bankId === 'opi' && completeOpiDataset
        ? { dataset: completeOpiDataset, source: 'embedded' }
        : undefined
    ));
  });

  afterEach(() => jest.restoreAllMocks());

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
    const dataset = completeOpiDataset;
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
