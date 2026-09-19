// These regression cases target the frozen generic/Web implementation.
jest.mock('../components/QuestionBankStudyScreen', () => jest.requireActual('../components/QuestionBankStudyScreen.tsx'));
jest.mock('../lib/study-review', () => jest.requireActual('../lib/study-review.ts'));
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { captureStudyReview, getStudyReview, toStudyReviewPackage } from '../lib/study-review';
import { QuestionBankStudyScreen } from '../components/QuestionBankStudyScreen';
import { useStudySession } from '../hooks/useStudySession';
import { captureListeningReview, toListeningReviewPackage } from '@/features/mock-exam/listening-review';
import type { CardLearningState, LearningRecord, QuestionBankCategory, QuestionBankDataset, QuestionBankStudyItem, QuestionBankStudyPackage, QuestionBankTopic } from '../types';

const mockFinish = jest.fn();
const mockSaveListeningResult = jest.fn(async () => undefined);
const mockGoTo = jest.fn();
const mockFlush = jest.fn(async () => true);
const mockDismissTo = jest.fn();
const mockReplace = jest.fn();
let mockPreventRemoveHandler: (() => void) | undefined;
let mockTaskKind: 'choices' | 'recording' = 'choices';
let mockAnnotationTarget: unknown;
let mockWorkbenchProps: { persistAiResult?: boolean } | undefined;
let mockSessionOverride: ((input: { studyPackage?: QuestionBankStudyPackage }) => Record<string, unknown>) | undefined;
let mockAnswerCardProps: { results?: ('correct' | 'incorrect' | undefined)[]; tagColors?: string[][]; marked: Set<number>; markedLabel?: string; onSelect: (index: number) => void; total: number; unmarkedLabel?: string } | undefined;

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
  useQuestionAnnotations: (target: unknown) => {
    mockAnnotationTarget = target;
    return {
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
    };
  },
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
    AnswerCardSheet: (props: { marked: Set<number>; markedLabel?: string; onSelect: (index: number) => void; total: number; unmarkedLabel?: string; visible: boolean }) => {
      mockAnswerCardProps = props;
      return props.visible ? (
        <MockView><MockPressable accessibilityLabel="答题卡选择第2题" onPress={() => props.onSelect(1)}><MockText>第2题</MockText></MockPressable></MockView>
      ) : null;
    },
  };
});
jest.mock('../components/InteractiveStudyText', () => ({ InteractiveStudyText: () => null }));
jest.mock('../components/StudyAudioPlayer', () => {
  const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual('react-native');
  return { StudyAudioPlayer: ({ onManualPlay, practiceControls, variant = 'default' }: { onManualPlay?: () => void; practiceControls?: React.ReactNode; variant?: string }) => <MockView><MockText>{`audio-layout:${variant}`}</MockText><MockPressable accessibilityLabel="手动播放" onPress={onManualPlay} />{practiceControls}</MockView> };
});
jest.mock('../components/StudyCardStack', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { StudyCardStack: ({ primary, workbench }: { primary: React.ReactNode; workbench: React.ReactNode }) => <MockView>{primary}{workbench}</MockView> };
});
jest.mock('../components/StudyTaskRenderer', () => {
  const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual('react-native');
  return { StudyTaskRenderer: ({ choiceReadOnly = false, onChoose, revealed, variant = 'default' }: { choiceReadOnly?: boolean; onChoose: (index: number) => void; revealed: boolean; variant?: string }) => <MockView><MockText>{`task-layout:${variant}`}</MockText><MockText>{`task-revealed:${revealed}`}</MockText><MockText>{`task-read-only:${choiceReadOnly}`}</MockText><MockPressable accessibilityLabel="选择正确答案" disabled={choiceReadOnly} onPress={() => onChoose(0)} /><MockPressable accessibilityLabel="选择错误答案" disabled={choiceReadOnly} onPress={() => onChoose(1)} /></MockView> };
});
jest.mock('../components/StudyWorkbench', () => {
  const { forwardRef: mockForwardRef, useImperativeHandle: mockUseImperativeHandle } = jest.requireActual('react');
  return {
    StudyWorkbench: mockForwardRef((props: { persistAiResult?: boolean }, ref: React.ForwardedRef<{ flushAutoSave: () => Promise<boolean> }>) => {
      mockWorkbenchProps = props;
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

function listeningExamPackage(includeFollowingModule = false): QuestionBankStudyPackage {
  const listeningItems: QuestionBankStudyItem[] = Array.from({ length: 20 }, (_, index) => {
    const card = {
      id: `listening-card-${index + 1}`,
      taskTitle: `Listening ${index + 1}`,
      audioText: 'Question',
      choices: ['Correct', 'Wrong'],
      correctChoiceIndex: 0,
    };
    return { id: `listening-item-${index + 1}`, dataset, category, topic, card };
  });
  const followingDataset: QuestionBankDataset = {
    ...dataset,
    id: 'opi',
    title: 'OPI',
    study: {
      ...dataset.study,
      interaction: 'speaking',
      tools: { ...dataset.study.tools, choices: false, recorder: true },
    },
  };
  const followingItems: QuestionBankStudyItem[] = includeFollowingModule ? [{
    id: 'opi-item-1',
    dataset: followingDataset,
    category,
    topic,
    card: { id: 'opi-card-1', taskTitle: 'OPI', audioText: 'Question' },
  }] : [];
  return {
    id: 'vercel-listening-exam',
    startedAt: '2026-08-26T00:00:00.000Z',
    progressMode: 'session-only',
    items: [...listeningItems, ...followingItems],
    record: {
      bankId: 'mock_exam',
      bankTitle: 'AI 模考',
      categoryTitle: 'ICAO 4 初考',
      topicTitle: '按考试规则组卷',
      recordType: 'mock_exam',
    },
  };
}

function useMockListeningExamSession(input: { studyPackage?: QuestionBankStudyPackage }) {
  const items = input.studyPackage!.items;
  const [currentIndex, setCurrentIndex] = useState(0);
  const historyRecord = input.studyPackage?.studyReviewRecord ?? input.studyPackage?.listeningReviewRecord;
  const historyReview = historyRecord ? getStudyReview(historyRecord) : undefined;
  const [states, setStates] = useState<Record<string, CardLearningState>>(() => historyReview?.states ?? {});
  const [visitedIndexes, setVisitedIndexes] = useState<Set<number>>(() => new Set([0]));
  const [studyReport, setStudyReport] = useState<LearningRecord>();
  const currentItem = items[currentIndex];
  const currentState = states[currentItem.id];
  const goTo = (index: number) => {
    mockGoTo(index);
    setCurrentIndex(index);
    setVisitedIndexes((current) => new Set(current).add(index));
  };
  const chooseOption = (choiceIndex: number, revealAnswer = true) => {
    setStates((current) => ({
      ...current,
      [currentItem.id]: {
        visited: true,
        completed: true,
        selectedChoiceIndex: choiceIndex,
        note: '',
        updatedAt: '2026-08-26T00:00:00.000Z',
      },
    }));
    if (revealAnswer) {
      // The test observes the explicit flag passed by the Vercel exam screen.
    }
  };
  const markCompleted = (itemId: string) => setStates((current) => ({
    ...current,
    [itemId]: {
      ...current[itemId],
      visited: true,
      completed: true,
      note: current[itemId]?.note ?? '',
      updatedAt: '2026-08-26T00:00:00.000Z',
    },
  }));
  return {
    hydrated: true,
    historyRecord,
    historyReview,
    report: studyReport,
    items,
    item: currentItem,
    card: currentItem.card,
    cardState: currentState,
    states,
    behavior: { taskKind: currentItem.dataset.id === 'listening' ? 'choices' : 'recording', recordingMode: 'speaking', transcriptLabel: '音频原文', referenceLabel: '参考答案', workbenchTabs: ['notes'] },
    currentIndex,
    visitedIndexes,
    completedCardIds: new Set(Object.entries(states).flatMap(([id, state]) => state.completed ? [id] : [])),
    revealed: false,
    toolMode: undefined,
    activeTab: 'notes',
    answerText: historyReview?.answers[currentItem.id] ?? '',
    playRequestToken: 0,
    finish: async (reason: 'abort' | 'complete') => {
      mockFinish(reason);
      setStudyReport(report(reason));
    },
    saveListeningResult: mockSaveListeningResult,
    goTo,
    chooseOption,
    markCompleted,
    toggleAnswers: jest.fn(),
    setToolMode: jest.fn(),
    collapseAnswers: jest.fn(),
    revealCurrent: jest.fn(),
    clearRecording: jest.fn(),
    recordAnswer: jest.fn(),
    updateAnswer: jest.fn(),
    markFeedback: jest.fn(),
    setActiveTab: jest.fn(),
  };
}

function useMockPersistentLearningSession() {
  const items = topic.cards.map((card) => ({ id: card.id, dataset, category, topic, card }));
  return useMockListeningExamSession({
    studyPackage: {
      id: 'persistent-learning-test',
      startedAt: '2026-08-26T00:00:00.000Z',
      progressMode: 'persistent',
      items,
      record: {
        bankId: dataset.id,
        bankTitle: dataset.title,
        categoryTitle: category.name,
        topicTitle: topic.name,
        recordType: 'session',
      },
    },
  });
}

describe('study exit flow', () => {
  beforeEach(() => {
    mockFinish.mockReset();
    mockSaveListeningResult.mockReset().mockResolvedValue(undefined);
    mockGoTo.mockReset();
    mockFlush.mockReset().mockResolvedValue(true);
    mockDismissTo.mockReset();
    mockReplace.mockReset();
    mockPreventRemoveHandler = undefined;
    mockAnnotationTarget = undefined;
    mockWorkbenchProps = undefined;
    mockSessionOverride = undefined;
    mockAnswerCardProps = undefined;
    mockTaskKind = 'choices';
    (useStudySession as jest.Mock).mockImplementation((input: { studyPackage?: QuestionBankStudyPackage }) => {
      if (mockSessionOverride) return mockSessionOverride(input);
      const [studyReport, setStudyReport] = useState<LearningRecord>();
      const items = input.studyPackage?.items ?? topic.cards.map((card) => ({ id: card.id, dataset, category, topic, card }));
      const currentItem = items[0];
      return {
        hydrated: true,
        report: studyReport,
        items,
        item: currentItem,
        card: currentItem.card,
        cardState: undefined,
        behavior: { taskKind: mockTaskKind, recordingMode: mockTaskKind === 'recording' ? 'speaking' : undefined, transcriptLabel: '音频原文', referenceLabel: '参考答案', workbenchTabs: ['notes'] },
        currentIndex: 0,
        visitedIndexes: new Set([0]),
        completedCardIds: new Set<string>(),
        states: {},
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

  it('reviews an incomplete mixed paper without scoring it, hiding unanswered items, or mounting the recorder/editor', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    try {
      const pkg = listeningExamPackage(true);
      const saved: LearningRecord = { ...report('abort'), ...pkg.record, id: 'partial-review',
        vercelStudyReview: captureStudyReview(pkg.items, {
          [pkg.items[0].id]: { visited: true, completed: true, selectedChoiceIndex: 1, note: '', updatedAt: '2026-09-08' },
        }, { 'opi-item-1': 'Original spoken topic text answer' }, 'web'),
      };
      mockSessionOverride = useMockListeningExamSession;
      const onReturn = jest.fn();
      const screen = await render(<QuestionBankStudyScreen studyPackage={toStudyReviewPackage(saved, 'web')!} onReturn={onReturn} />);
      expect(screen.getByText('学习复盘 · 未完成')).toBeTruthy();
      expect(screen.queryByText('听力成绩')).toBeNull();
      expect(screen.getByText('task-read-only:true')).toBeTruthy();
      expect(mockWorkbenchProps).toBeUndefined();
      expect(mockAnswerCardProps?.total).toBe(21);
      await act(async () => { mockAnswerCardProps!.onSelect(1); });
      await waitFor(() => expect(screen.getByText('本题未作答')).toBeTruthy());
      await act(async () => { mockAnswerCardProps!.onSelect(20); });
      await waitFor(() => expect(screen.getByText('Original spoken topic text answer')).toBeTruthy());
      expect(screen.queryByText('task-layout:integrated')).toBeNull();
      expect(mockWorkbenchProps).toBeUndefined();
      await fireEvent.press(screen.getByLabelText('返回学习记录'));
      await waitFor(() => expect(onReturn).toHaveBeenCalledTimes(1));
      expect(mockFinish).not.toHaveBeenCalled();
      expect(mockSaveListeningResult).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
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

  it('returns an in-memory study package through its callback and keeps annotations on the original question', async () => {
    const packageTopic: QuestionBankTopic = {
      id: 'opi-source-topic',
      name: 'OPI source topic',
      declaredCardCount: 1,
      cards: [{ id: 'opi-source-card', taskTitle: 'OPI card', audioText: 'Question' }],
    };
    const packageCategory: QuestionBankCategory = { id: 'opi-source-category', name: 'OPI category', declaredTopicCount: 1, declaredCardCount: 1, topics: [packageTopic] };
    const packageDataset: QuestionBankDataset = { ...dataset, id: 'opi', title: 'OPI', categories: [packageCategory] };
    const studyPackage: QuestionBankStudyPackage = {
      id: 'mock-exam-test',
      startedAt: '2026-08-12T00:00:00.000Z',
      progressMode: 'session-only',
      items: [{ id: 'mock-item-1', dataset: packageDataset, category: packageCategory, topic: packageTopic, card: packageTopic.cards[0] }],
      record: { bankId: 'mock_exam', bankTitle: 'AI 模考', categoryTitle: 'ICAO 4 初考', topicTitle: '按考试规则组卷', recordType: 'mock_exam' },
    };
    const onReturn = jest.fn();
    const screen = await render(<QuestionBankStudyScreen onReturn={onReturn} returnLabel="返回 AI 模考" studyPackage={studyPackage} />);

    expect(mockAnnotationTarget).toEqual({
      bankId: 'opi',
      categoryId: 'opi-source-category',
      topicId: 'opi-source-topic',
      cardId: 'opi-source-card',
    });
    expect(mockWorkbenchProps?.persistAiResult).toBe(false);
    await act(async () => { fireEvent.press(screen.getByLabelText('返回 AI 模考')); });
    await waitFor(() => expect(onReturn).toHaveBeenCalledTimes(1));
    expect(mockFinish).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
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

  it('settles the 20-question Vercel listening exam before read-only review and continuation', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    mockSessionOverride = useMockListeningExamSession;
    const studyPackage = listeningExamPackage(true);
    mockSaveListeningResult.mockRejectedValueOnce(new Error('storage_full'));

    try {
      const screen = await render(<QuestionBankStudyScreen onReturn={jest.fn()} returnLabel="返回 AI 模考" studyPackage={studyPackage} />);

      for (let index = 0; index < 20; index += 1) {
        expect(screen.getByText('task-revealed:false')).toBeTruthy();
        if (index === 0) {
          await act(async () => { fireEvent.press(screen.getByLabelText('选择错误答案')); });
          expect(screen.getByText('task-revealed:false')).toBeTruthy();
        }
        if (index === 19) {
          expect(screen.queryByLabelText('听力成绩 50 分 6 级')).toBeNull();
          await act(async () => { fireEvent.press(screen.getByLabelText('检查答题')); });
          expect(mockAnswerCardProps?.marked.size).toBe(19);
        }
        await act(async () => { fireEvent.press(screen.getByLabelText('选择正确答案')); });
        if (index === 0) {
          await act(async () => { fireEvent.press(screen.getByLabelText('打开答题卡')); });
          expect(mockAnswerCardProps).toMatchObject({ markedLabel: '已答', total: 20, unmarkedLabel: '未答' });
          expect(mockAnswerCardProps?.marked).toEqual(new Set([0]));
          expect(mockAnswerCardProps?.results).toBeUndefined();
          await act(async () => { mockAnswerCardProps?.onSelect(0); });
        }
        if (index < 19) {
          await act(async () => { fireEvent.press(screen.getByLabelText('下一题')); });
        }
      }

      await waitFor(() => expect(screen.getByLabelText('听力成绩 50 分 6 级')).toBeTruthy());
      expect(screen.getByText('task-revealed:true')).toBeTruthy();
      expect(screen.getByText('task-read-only:true')).toBeTruthy();
      expect(mockSaveListeningResult).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByText('听力复盘尚未保存，请重试后再离开。')).toBeTruthy());
      await act(async () => { fireEvent.press(screen.getByLabelText('重试保存复盘')); });
      expect(mockSaveListeningResult).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('听力复盘尚未保存，请重试后再离开。')).toBeNull();

      await act(async () => { mockAnswerCardProps?.onSelect(19); });
      await act(async () => { fireEvent.press(screen.getByLabelText('继续考试')); });
      await waitFor(() => expect(mockGoTo).toHaveBeenLastCalledWith(20));
      expect(screen.queryByLabelText('听力成绩 50 分 6 级')).toBeNull();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

  it('opens saved listening results locked and returns to history without finishing or saving again', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    mockSessionOverride = useMockListeningExamSession;
    try {
      const input = listeningExamPackage();
      const states = Object.fromEntries(input.items.map((item, index) => [item.id, {
        visited: true, completed: true, selectedChoiceIndex: index % 2, note: '', updatedAt: input.startedAt,
      }]));
      const record: LearningRecord = {
        ...report('complete'), ...input.record, id: 'saved-listening',
        vercelListeningReview: captureListeningReview(input, states, 'web'),
      };
      const onReturn = jest.fn();
      const screen = await render(<QuestionBankStudyScreen onReturn={onReturn} studyPackage={toListeningReviewPackage(record, 'web')!} />);
      expect(screen.getByLabelText('听力成绩 25 分 4 级')).toBeTruthy();
      expect(screen.getByText('task-read-only:true')).toBeTruthy();
      await act(async () => { fireEvent.press(screen.getByLabelText('选择错误答案')); });
      expect(screen.getByLabelText('听力成绩 25 分 4 级')).toBeTruthy();
      await act(async () => { fireEvent.press(screen.getByLabelText('返回记录')); });
      expect(onReturn).toHaveBeenCalledTimes(1);
      expect(mockFinish).not.toHaveBeenCalled();
      expect(mockSaveListeningResult).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

  it('marks a Vercel question learned on manual play and reflects it in the answer card', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    mockSessionOverride = useMockPersistentLearningSession;

    try {
      const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);
      await act(async () => { fireEvent.press(screen.getByLabelText('手动播放')); });
      await act(async () => { fireEvent.press(screen.getByLabelText('打开答题卡')); });

      expect(mockAnswerCardProps).toMatchObject({ markedLabel: '已学', total: 2, unmarkedLabel: '未学' });
      expect(mockAnswerCardProps?.marked).toEqual(new Set([0]));
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });
  it('uses the latest choice in the Vercel question list and leaves unanswered questions neutral', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const pkg = { ...listeningExamPackage(), progressMode: 'persistent' as const };
    mockSessionOverride = function useLatestChoiceSession() { return useMockListeningExamSession({ studyPackage: pkg }); };
    try {
      const screen = await render(<QuestionBankStudyScreen category={category} dataset={dataset} topic={topic} />);
      expect(mockAnswerCardProps?.results?.every((result) => result === undefined)).toBe(true);
      await act(async () => { fireEvent.press(screen.getByLabelText('选择错误答案')); });
      expect(mockAnswerCardProps?.results?.[0]).toBe('incorrect');
      await act(async () => { fireEvent.press(screen.getByLabelText('选择正确答案')); });
      expect(mockAnswerCardProps?.results?.[0]).toBe('correct');
      expect(mockAnswerCardProps?.results?.[1]).toBeUndefined();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    }
  });

});
