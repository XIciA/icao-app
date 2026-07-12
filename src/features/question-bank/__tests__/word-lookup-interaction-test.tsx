import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { QuestionBankStudyScreen } from '../components/QuestionBankStudyScreen';
import type { QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';

const mockWordLookup = jest.fn(async (_input: unknown) => ({ cached: false, definition: '偏离', sentenceMeaning: '请求偏航以避开天气。' }));
const mockAcceptAiConsent = jest.fn();

jest.mock('@react-navigation/native', () => ({ usePreventRemove: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const Icon = () => <View />;
  return { Check: Icon, ChevronLeft: Icon, ChevronRight: Icon, Flag: Icon, Grid3X3: Icon, Languages: Icon, WifiOff: Icon };
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
jest.mock('@/features/ai/ai-client', () => ({
  acceptAiConsent: () => mockAcceptAiConsent(),
  hasAiConsent: async () => true,
  wordLookup: (input: unknown) => mockWordLookup(input),
}));
jest.mock('../hooks/useQuestionBankAsset', () => ({ useQuestionBankAsset: () => ({ resolving: false, retry: jest.fn() }) }));
jest.mock('../hooks/useStudySession', () => ({
  useStudySession: ({ dataset, topic }: { dataset: QuestionBankDataset; topic: QuestionBankTopic }) => ({
    activeTab: 'notes', answerText: '', card: topic.cards[0], cardState: undefined, clearRecording: jest.fn(), collapseAnswers: jest.fn(),
    behavior: { generatedAudio: false, referenceLabel: dataset.study.copy.referenceLabel, reviewKind: 'none', taskKind: 'choices', transcriptLabel: dataset.study.copy.transcriptLabel, workbenchTabs: ['notes'] },
    chooseOption: jest.fn(), currentIndex: 0, finish: jest.fn(), goTo: jest.fn(), hydrated: true, markCompleted: jest.fn(), markFeedback: jest.fn(), playRequestToken: 0,
    recording: undefined, report: undefined, revealCurrent: jest.fn(), revealed: true, setActiveTab: jest.fn(), setToolMode: jest.fn(), toggleAnswers: jest.fn(),
    topic, updateAnswer: jest.fn(), visitedIndexes: new Set([0]),
  }),
}));
jest.mock('../annotations/use-question-annotations', () => ({
  useQuestionAnnotations: () => ({
    addHighlightDefinition: jest.fn(), addTagDefinition: jest.fn(), entry: undefined, highlightDefinitions: [], retrySave: jest.fn(), saveNote: jest.fn(),
    store: { entries: {} }, tagDefinitions: [], toggleHighlight: jest.fn(), toggleTag: jest.fn(),
  }),
}));
jest.mock('../platform/network-service', () => ({ getConnectivity: async () => 'online', subscribeConnectivity: () => jest.fn() }));
jest.mock('../components/AnnotationToolbar', () => ({ AnnotationToolbar: () => null }));
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
    mockWordLookup.mockClear();
    mockAcceptAiConsent.mockClear();
  });

  it.each([
    ['音频原文', 'deviation', 'Request deviation to avoid weather.'],
    ['参考答案', 'clearance', 'Confirm clearance before departure.'],
  ])('automatically looks up a long-pressed word in %s after consent', async (_section, word, sentence) => {
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => {
      fireEvent(screen.getByLabelText(`长按查词：${word}`), 'longPress');
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockWordLookup).toHaveBeenCalledWith({ module: 'listening', questionId: 'card', word, sentence }));
    expect(mockAcceptAiConsent).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('查询释义')).toBeNull();
  });
});
