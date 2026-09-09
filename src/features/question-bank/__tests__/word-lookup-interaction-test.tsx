// These regression cases target the frozen generic/Web implementation.
jest.mock('../components/QuestionBankStudyScreen', () => jest.requireActual('../components/QuestionBankStudyScreen.tsx'));
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { QuestionBankStudyScreen } from '../components/QuestionBankStudyScreen';
import type { QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';

const mockFindStaticWordLookup = jest.fn((word: string) => word === 'deviation' ? {
  word: 'deviation', ipa: '/ˌdiːviˈeɪʃən/', aviationMeaning: 'n. 偏离预定航向', generalMeaning: 'n. 偏差；背离',
} : undefined);
const mockToggleFavorite = jest.fn();

jest.mock('@react-navigation/native', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = () => <View />;
  return { Check: Icon, ChevronLeft: Icon, ChevronRight: Icon, Flag: Icon, Grid3X3: Icon, Highlighter: Icon, Languages: Icon, Plus: Icon, Search: Icon, Star: Icon, Tags: Icon, WifiOff: Icon, X: Icon };
});
jest.mock('@/components/states/CenteredState', () => ({ CenteredState: () => null }));
jest.mock('@/components/ui', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    AppText: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    BottomSheet: ({ children, visible }: { children: React.ReactNode; visible: boolean }) => visible ? <View>{children}</View> : null,
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => <Pressable accessibilityLabel={typeof children === 'string' ? children : undefined} onPress={onPress}><Text>{children}</Text></Pressable>,
  };
});
jest.mock('../static-word-lookup/repository', () => ({
  findStaticWordLookup: (word: string) => mockFindStaticWordLookup(word),
  hasStaticWordLookup: (word: string) => word === 'deviation',
}));
jest.mock('../hooks/useQuestionBankAsset', () => ({ useQuestionBankAsset: () => ({ resolving: false, retry: jest.fn() }) }));
jest.mock('../hooks/useStudySession', () => ({
  useStudySession: ({ category, dataset, topic }: { category: QuestionBankCategory; dataset: QuestionBankDataset; topic: QuestionBankTopic }) => {
    const { useState } = jest.requireActual('react');
    const [toolMode, setToolMode] = useState();
    const items = topic.cards.map((card) => ({ id: card.id, dataset, category, topic, card }));
    return {
      activeTab: 'notes', answerText: '', card: topic.cards[0], cardState: undefined, clearRecording: jest.fn(), collapseAnswers: jest.fn(), item: items[0], items,
      behavior: { generatedAudio: false, referenceLabel: dataset.study.copy.referenceLabel, reviewKind: 'none', taskKind: 'choices', transcriptLabel: dataset.study.copy.transcriptLabel, workbenchTabs: ['notes'] },
      chooseOption: jest.fn(), currentIndex: 0, finish: jest.fn(), goTo: jest.fn(), hydrated: true, markCompleted: jest.fn(), markFeedback: jest.fn(), playRequestToken: 0,
      recording: undefined, report: undefined, revealCurrent: jest.fn(), revealed: true, setActiveTab: jest.fn(), setToolMode, toggleAnswers: jest.fn(), toolMode,
      topic, updateAnswer: jest.fn(), visitedIndexes: new Set([0]),
    };
  },
}));
jest.mock('../annotations/use-question-annotations', () => ({
  useQuestionAnnotations: () => ({
    addHighlightDefinition: jest.fn(), addTagDefinition: jest.fn(), entry: undefined, highlightDefinitions: [], retrySave: jest.fn(), saveNote: jest.fn(),
    store: { entries: {} }, tagDefinitions: [], toggleHighlight: jest.fn(), toggleTag: jest.fn(),
  }),
}));
jest.mock('../platform/network-service', () => ({ getConnectivity: async () => 'online', subscribeConnectivity: () => jest.fn() }));
jest.mock('@/features/vocabulary/progress-store', () => ({
  useWordFavorites: () => {
    const { useState } = jest.requireActual('react');
    const [favorite, setFavorite] = useState(false);
    return {
      isFavorite: () => favorite,
      toggleFavorite: async (reference: { word: string }) => {
        mockToggleFavorite(reference);
        setFavorite((value: boolean) => !value);
      },
    };
  },
}));
jest.mock('../components/AnswerCardSheet', () => ({ AnswerCardSheet: () => null }));
jest.mock('../components/StudyAudioPlayer', () => ({ StudyAudioPlayer: () => null }));
jest.mock('../components/StudyCardStack', () => {
  const { View } = jest.requireActual('react-native');
  return { StudyCardStack: ({ transcript, workbench }: { transcript: React.ReactNode; workbench: React.ReactNode }) => <View>{transcript}{workbench}</View> };
});
jest.mock('../components/StudyTaskRenderer', () => ({ StudyTaskRenderer: () => null }));
jest.mock('../components/StudyWorkbench', () => {
  const { View } = jest.requireActual('react-native');
  return { StudyWorkbench: ({ referenceContent }: { referenceContent: React.ReactNode }) => <View>{referenceContent}</View> };
});
jest.mock('../components/StudyReport', () => ({ StudyReport: () => null }));

const topic: QuestionBankTopic = {
  id: 'topic', name: 'Topic', declaredCardCount: 1,
  cards: [{ id: 'card', taskTitle: 'Card', audioText: 'Request deviation to avoid weather.', referenceText: 'Confirm clearance before departure.' }],
};
const category: QuestionBankCategory = { id: 'category', name: 'Category', declaredTopicCount: 1, declaredCardCount: 1, topics: [topic] };
const dataset: QuestionBankDataset = {
  id: 'listening', title: '听力', nameEn: 'Listening', description: '', summary: '', enabled: true, statusLabel: '', icon: 'headphones', declaredTopicCount: 1, declaredCardCount: 1,
  categoryUnit: '类', topicUnit: '组', cardUnit: '题', categories: [category],
  study: { interaction: 'choices', tools: { recorder: false, choices: true, notes: true, dictionary: true, highlights: true, tags: true }, copy: { transcriptLabel: '音频原文', referenceLabel: '参考答案' }, audioTitlePattern: 'card-title', consoleTabs: ['notes'] },
};

describe('study word lookup interaction', () => {
  beforeEach(() => {
    mockFindStaticWordLookup.mockClear();
    mockToggleFavorite.mockClear();
  });

  it('opens a fixed local entry from the listening transcript without an AI request', async () => {
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => {
      fireEvent(screen.getByLabelText('长按查词：deviation'), 'longPress');
    });

    await waitFor(() => expect(mockFindStaticWordLookup).toHaveBeenCalledWith('deviation'));
    expect(screen.getByText('/ˌdiːviˈeɪʃən/')).toBeTruthy();
    expect(screen.getByText('航空释义：n. 偏离预定航向')).toBeTruthy();
    expect(screen.getByText('常用释义：n. 偏差；背离')).toBeTruthy();
    expect(screen.queryByText('AI 查词')).toBeNull();
    expect(screen.queryByText('本句理解')).toBeNull();
    expect(screen.queryByText('重新查询')).toBeNull();

    fireEvent.press(screen.getByLabelText('收藏'));
    await waitFor(() => expect(screen.getByLabelText('取消收藏')).toBeTruthy());
    expect(mockToggleFavorite).toHaveBeenCalledWith({ word: 'deviation' });
  });

  it('does not expose the listening legacy answer key as reference content', async () => {
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    expect(screen.queryByLabelText('长按查词：clearance')).toBeNull();
    expect(screen.queryByText('Confirm clearance before departure.')).toBeNull();
  });

  it('activates web lookup from the toolbar and opens the fixed entry with one click', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

      await act(async () => {
        fireEvent.press(screen.getByLabelText('开启查词模式'));
      });
      await waitFor(() => expect(screen.getByLabelText('关闭查词模式')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('查词：deviation'));

      await waitFor(() => expect(mockFindStaticWordLookup).toHaveBeenCalledWith('deviation'));
      expect(screen.getByText('/ˌdiːviˈeɪʃən/')).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });
});
