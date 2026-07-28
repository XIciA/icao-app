import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { QuestionBankStudyScreen } from '../components/QuestionBankStudyScreen';
import { useStudySession } from '../hooks/useStudySession';
import type { LearningRecord, QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';

const mockFinish = jest.fn();
const mockGoTo = jest.fn();
const mockFlush = jest.fn(async () => true);
const mockDismissTo = jest.fn();
const mockReplace = jest.fn();
let mockPreventRemoveHandler: (() => void) | undefined;
let mockTaskKind: 'choices' | 'recording' = 'choices';

jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (_prevent: boolean, handler: () => void) => { mockPreventRemoveHandler = handler; },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ dismissTo: mockDismissTo, replace: mockReplace }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
});
jest.mock('lucide-react-native', () => {
  const { View: MockView } = jest.requireActual('react-native');
  const MockIcon = () => <MockView />;
  return { Check: MockIcon, ChevronLeft: MockIcon, ChevronRight: MockIcon, Flag: MockIcon, Grid3X3: MockIcon, Languages: MockIcon, Star: MockIcon, WifiOff: MockIcon };
});
jest.mock('@/components/states/CenteredState', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { CenteredState: () => <MockText>state</MockText> };
});
jest.mock('@/components/ui', () => {
  const { Children: MockChildren } = jest.requireActual('react');
  const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual('react-native');
  return {
    AppText: ({ children }: { children: React.ReactNode }) => <MockText>{children}</MockText>,
    BottomSheet: ({ children, visible }: { children: React.ReactNode; visible: boolean }) => visible ? <MockView>{children}</MockView> : null,
    Button: ({ accessibilityLabel, children, disabled, onPress }: { accessibilityLabel?: string; children: React.ReactNode; disabled?: boolean; onPress?: () => void }) => (
      <MockPressable accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)} disabled={disabled} onPress={onPress}><MockView>{MockChildren.map(children, (child: React.ReactNode) => typeof child === 'string' ? <MockText>{child}</MockText> : child)}</MockView></MockPressable>
    ),
  };
});
jest.mock('../hooks/useStudySession', () => ({ useStudySession: jest.fn() }));
jest.mock('../hooks/useQuestionBankAsset', () => ({ useQuestionBankAsset: () => ({ resolving: false, retry: jest.fn() }) }));
jest.mock('../annotations/use-question-annotations', () => ({
  useQuestionAnnotations: () => ({
    entry: undefined,
    highlightDefinitions: [],
    tagDefinitions: [],
    store: { entries: {} },
    toggleHighlight: jest.fn(),
    addHighlightDefinition: jest.fn(),
    addTagDefinition: jest.fn(),
    toggleTag: jest.fn(),
    saveNote: jest.fn(),
    retrySave: jest.fn(),
  }),
}));
jest.mock('../platform/network-service', () => ({
  getConnectivity: async () => 'online',
  subscribeConnectivity: () => jest.fn(),
}));
jest.mock('@/features/vocabulary/progress-store', () => ({
  useWordFavorites: () => ({ isFavorite: () => false, toggleFavorite: jest.fn() }),
}));
jest.mock('@/features/ai/ai-client', () => ({ hasAiConsent: async () => false }));
jest.mock('../components/AnnotationToolbar', () => ({ AnnotationToolbar: () => null }));
jest.mock('../components/AnswerCardSheet', () => {
  const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual('react-native');
  return {
    AnswerCardSheet: ({ onSelect, visible }: { onSelect: (index: number) => void; visible: boolean }) => visible ? (
      <MockView><MockPressable accessibilityLabel="答题卡选择第2题" onPress={() => onSelect(1)}><MockText>第2题</MockText></MockPressable></MockView>
    ) : null,
  };
});
jest.mock('../components/InteractiveStudyText', () => ({ InteractiveStudyText: () => null }));
jest.mock('../components/StudyAudioPlayer', () => {
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');
  return { StudyAudioPlayer: ({ practiceControls, variant = 'default' }: { practiceControls?: React.ReactNode; variant?: string }) => <MockView><MockText>{`audio-layout:${variant}`}</MockText>{practiceControls}</MockView> };
});
jest.mock('../components/StudyCardStack', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { StudyCardStack: ({ primary, workbench }: { primary: React.ReactNode; workbench: React.ReactNode }) => <MockView>{primary}{workbench}</MockView> };
});
jest.mock('../components/StudyTaskRenderer', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { StudyTaskRenderer: ({ variant = 'default' }: { variant?: string }) => <MockText>{`task-layout:${variant}`}</MockText> };
});
jest.mock('../components/StudyWorkbench', () => {
  const { forwardRef: mockForwardRef, useImperativeHandle: mockUseImperativeHandle } = jest.requireActual('react');
  return {
    StudyWorkbench: mockForwardRef((_props: object, ref: React.ForwardedRef<{ flushAutoSave: () => Promise<boolean> }>) => {
      mockUseImperativeHandle(ref, () => ({ flushAutoSave: mockFlush }));
      return null;
    }),
  };
});
jest.mock('../components/StudyReport', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { StudyReport: ({ record }: { record: LearningRecord }) => <MockText>{`report:${record.reason}`}</MockText> };
});

const topic: QuestionBankTopic = {
  id: 'topic',
  name: 'Topic',
  declaredCardCount: 1,
  cards: [
    { id: 'card', taskTitle: 'Card', audioText: 'Question' },
    { id: 'card-2', taskTitle: 'Card 2', audioText: 'Question 2' },
  ],
};
const category: QuestionBankCategory = { id: 'category', name: 'Category', declaredTopicCount: 1, declaredCardCount: 1, topics: [topic] };
const dataset: QuestionBankDataset = {
  id: 'listening', title: '听力', nameEn: 'Listening', description: '', summary: '', enabled: true, statusLabel: '', icon: 'headphones', declaredTopicCount: 1, declaredCardCount: 1, categoryUnit: '类', topicUnit: '组', cardUnit: '题', categories: [category],
  study: { interaction: 'choices', tools: { recorder: false, choices: true, notes: true, dictionary: true, highlights: true, tags: true }, copy: { transcriptLabel: '音频原文', referenceLabel: '参考答案' }, audioTitlePattern: 'card-title', consoleTabs: ['notes'] },
};

function report(reason: 'abort' | 'complete'): LearningRecord {
  return { schemaVersion: 2, id: 'report', bankId: dataset.id, bankTitle: dataset.title, categoryTitle: category.name, topicTitle: topic.name, completedCount: 0, totalCount: 1, correctCount: 0, annotationCount: 0, noteCount: 0, feedbackCount: 0, durationSeconds: 1, reason, createdAt: '2026-07-12T00:00:00.000Z' };
}

describe('study exit flow', () => {
  beforeEach(() => {
    mockFinish.mockReset();
    mockGoTo.mockReset();
    mockFlush.mockReset().mockResolvedValue(true);
    mockDismissTo.mockReset();
    mockReplace.mockReset();
    mockPreventRemoveHandler = undefined;
    mockTaskKind = 'choices';
    (useStudySession as jest.Mock).mockImplementation(() => {
      const [studyReport, setStudyReport] = useState<LearningRecord>();
      return {
        hydrated: true,
        report: studyReport,
        card: topic.cards[0],
        cardState: undefined,
        behavior: { taskKind: mockTaskKind, recordingMode: mockTaskKind === 'recording' ? 'speaking' : undefined, transcriptLabel: '音频原文', referenceLabel: '参考答案', workbenchTabs: ['notes'] },
        currentIndex: 0,
        visitedIndexes: new Set([0]),
        completedCardIds: new Set<string>(),
        revealed: false,
        toolMode: undefined,
        activeTab: 'notes',
        answerText: '',
        playRequestToken: 0,
        finish: async (reason: 'abort' | 'complete') => {
          mockFinish(reason);
          setStudyReport(report(reason));
        },
        goTo: mockGoTo, toggleAnswers: jest.fn(), setToolMode: jest.fn(), collapseAnswers: jest.fn(), revealCurrent: jest.fn(), chooseOption: jest.fn(), clearRecording: jest.fn(), recordAnswer: jest.fn(), updateAnswer: jest.fn(), markFeedback: jest.fn(), setActiveTab: jest.fn(), markCompleted: jest.fn(),
      };
    });
  });

  it('ends from the footer and shows the report without a confirmation sheet', async () => {
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);
    expect(screen.queryByText('结束本次学习？')).toBeNull();

    await act(async () => { fireEvent.press(screen.getByLabelText('结束')); });

    await waitFor(() => expect(screen.getByText('report:abort')).toBeTruthy());
    expect(mockFinish).toHaveBeenCalledWith('abort');
    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('结束本次学习？')).toBeNull();
  });

  it('returns to the catalog from the visible back button without ending the session', async () => {
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('返回题库目录')); });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/question-bank/[bankId]', params: { bankId: dataset.id } }));
    expect(mockFinish).not.toHaveBeenCalled();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('returns to the catalog from the native back action without ending the session', async () => {
    await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => { mockPreventRemoveHandler?.(); });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/question-bank/[bankId]', params: { bankId: dataset.id } }));
    expect(mockFinish).not.toHaveBeenCalled();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('returns a hotspot session to its explicit detail route', async () => {
    const returnHref = { pathname: '/content/hotspot/[briefId]', params: { briefId: 'hotspot-2026-07-23' } } as const;
    const screen = await render(
      <QuestionBankStudyScreen
        category={category}
        dataset={dataset}
        returnHref={returnHref}
        returnLabel="返回热点详情"
        topic={topic}
      />,
    );

    await act(async () => { fireEvent.press(screen.getByLabelText('返回热点详情')); });

    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith(returnHref));
    expect(mockFinish).not.toHaveBeenCalled();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('returns to the paused radio session without ending the study session when opened from radio', async () => {
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} returnTo="radio" topic={topic} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('返回随身听')); });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/content/radio'));
    expect(mockFinish).not.toHaveBeenCalled();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('swipes left to the next question without invoking the exit flow', async () => {
    await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => {
      fireGestureHandler(getByGestureTestId('study-question-swipe'), [
        { state: State.BEGAN, translationX: 0, translationY: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: -40, translationY: 3, velocityX: -300 },
        { state: State.END, translationX: -80, translationY: 3, velocityX: -300 },
      ]);
    });

    expect(mockGoTo).toHaveBeenCalledWith(1);
    expect(mockFlush).toHaveBeenCalledTimes(1);
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it('keeps a right swipe on the first question inside the study screen', async () => {
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => {
      fireGestureHandler(getByGestureTestId('study-question-swipe'), [
        { state: State.BEGAN, translationX: 0, translationY: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: 40, translationY: 3, velocityX: 300 },
        { state: State.END, translationX: 80, translationY: 3, velocityX: 300 },
      ]);
    });

    expect(mockGoTo).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();
    expect(screen.getByText('已经是第一题')).toBeTruthy();
  });

  it('rebounds after a short drag without changing the question', async () => {
    await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => {
      fireGestureHandler(getByGestureTestId('study-question-swipe'), [
        { state: State.BEGAN, translationX: 0, translationY: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: -18, translationY: 2, velocityX: -260 },
        { state: State.END, translationX: -18, translationY: 2, velocityX: -260 },
      ]);
    });

    expect(mockGoTo).not.toHaveBeenCalled();
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it('uses the same navigation path for the footer and answer card', async () => {
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => { fireEvent.press(screen.getByLabelText('下一题')); });
    expect(mockGoTo).toHaveBeenLastCalledWith(1);
    expect(mockFlush).toHaveBeenCalledTimes(1);

    mockGoTo.mockClear();
    mockFlush.mockClear();
    await act(async () => { fireEvent.press(screen.getByLabelText('打开答题卡')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('答题卡选择第2题')); });
    expect(mockGoTo).toHaveBeenLastCalledWith(1);
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });

  it('keeps the current card visible when automatic saving fails', async () => {
    mockFlush.mockResolvedValue(false);
    const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);

    await act(async () => {
      fireGestureHandler(getByGestureTestId('study-question-swipe'), [
        { state: State.BEGAN, translationX: 0, translationY: 0, velocityX: 0 },
        { state: State.ACTIVE, translationX: -40, translationY: 3, velocityX: -300 },
        { state: State.END, translationX: -80, translationY: 3, velocityX: -300 },
      ]);
    });

    expect(mockGoTo).not.toHaveBeenCalled();
    expect(screen.getByText('回答自动保存失败，请重试后继续。')).toBeTruthy();
  });

  it('uses the integrated D layout only for recording tasks', async () => {
    const listeningScreen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);
    expect(listeningScreen.getByText('audio-layout:default')).toBeTruthy();
    expect(listeningScreen.getByText('task-layout:default')).toBeTruthy();
    await listeningScreen.unmount();

    mockTaskKind = 'recording';
    const speakingDataset: QuestionBankDataset = {
      ...dataset,
      id: 'opi',
      title: 'OPI',
      study: {
        ...dataset.study,
        interaction: 'speaking',
        tools: { ...dataset.study.tools, choices: false, recorder: true },
      },
    };
    const speakingScreen = await render(<QuestionBankStudyScreen category={category} dataset={speakingDataset} topic={topic} />);
    expect(speakingScreen.getByText('audio-layout:integrated-recording')).toBeTruthy();
    expect(speakingScreen.getByText('task-layout:integrated')).toBeTruthy();
    expect(speakingScreen.queryByText('task-layout:default')).toBeNull();
  });
});
