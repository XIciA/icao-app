import { usePreventRemove } from '@react-navigation/native';
import { type Href, useRouter } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, Flag, Grid3X3, Languages, Star, WifiOff } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenteredState } from '@/components/states/CenteredState';
import { AppContentFrame } from '@/components/platform/AppContentFrame';
import { useAppViewportDimensions } from '@/components/platform/useAppViewportDimensions';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { isVercelLegacyWeb } from '@/config/web-runtime';
import { colors, fonts, motion, radii, spacing } from '@/theme';
import { useWordFavorites } from '@/features/vocabulary/progress-store';
import {
  LISTENING_EXAM_ITEM_COUNT,
  resolveVercelListeningExamRange,
  scoreListeningExam,
} from '@/features/mock-exam/listening-exam';

import { annotationToneColors } from '../annotations/colors';
import { questionBankCardTargetKey } from '../annotations/card-index';
import { useQuestionAnnotations } from '../annotations/use-question-annotations';
import type { AnnotationTextBlockId } from '../annotations/types';
import { useStudySession } from '../hooks/useStudySession';
import { useQuestionBankAsset } from '../hooks/useQuestionBankAsset';
import { useQuestionBankAudioPreload } from '../hooks/useQuestionBankAudioPreload';
import { resolveWordLookupInteraction, showsWordLookupModeToggle } from '../lib/word-lookup-interaction';
import { getConnectivity, subscribeConnectivity, type Connectivity } from '../platform/network-service';
import { findStaticWordLookup, hasStaticWordLookup, type StaticWordLookupEntry } from '../static-word-lookup/repository';
import type {
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankStudyPackage,
  QuestionBankTopic,
} from '../types';
import { wasAnswered } from '../lib/study-review';
import { boundedHorizontalSwipe } from '../lib/study-gestures';
import { AnnotationFloatingPanel, AnnotationToolbar } from './AnnotationToolbar';
import { AnswerCardSheet } from './AnswerCardSheet';
import { LegacyLookupPronunciation } from './LegacyLookupPronunciation';
import { InteractiveStudyText } from './InteractiveStudyText';
import { ImageQuestionCard } from './ImageQuestionCard';
import { StudyAudioPlayer } from './StudyAudioPlayer';
import { StudyCardStack } from './StudyCardStack';
import { StudyReport } from './StudyReport';
import { StudyTaskRenderer } from './StudyTaskRenderer';
import { StudyWorkbench, type StudyWorkbenchHandle } from './StudyWorkbench';

type NavigationProps = {
  onReturn?: () => void;
  returnTo?: 'annotations' | 'radio';
  returnHref?: Href;
  returnLabel?: string;
  sourceRoute?: string;
};

type Props = NavigationProps & ({
  dataset: QuestionBankDataset;
  category: QuestionBankCategory;
  topic: QuestionBankTopic;
  initialCardId?: string;
  studyPackage?: never;
} | {
  dataset?: never;
  category?: never;
  topic?: never;
  initialCardId?: never;
  studyPackage: QuestionBankStudyPackage;
});

export function QuestionBankStudyScreen(props: Props) {
  const { onReturn, returnTo, returnHref, returnLabel, sourceRoute } = props;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useAppViewportDimensions();
  const reduceMotion = useReducedMotion();
  const session = useStudySession(props.studyPackage
    ? { studyPackage: props.studyPackage }
    : {
      dataset: props.dataset,
      category: props.category,
      topic: props.topic,
      initialCardId: props.initialCardId,
    });
  const wordFavorites = useWordFavorites();
  const [answerCardVisible, setAnswerCardVisible] = useState(false);
  const [connectivity, setConnectivity] = useState<Connectivity>('unknown');
  const [activeHighlightId, setActiveHighlightId] = useState('green');
  const [annotationPanelTop, setAnnotationPanelTop] = useState<number>();
  const [lookup, setLookup] = useState<StaticWordLookupEntry>();
  const [finishing, setFinishing] = useState(false);
  const [leavingStudy, setLeavingStudy] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const [editingWorkbenchTab, setEditingWorkbenchTab] = useState<'mine' | 'notes'>();
  const [swipeBoundaryMessage, setSwipeBoundaryMessage] = useState<string>();
  const [taskInteractionActive, setTaskInteractionActive] = useState(false);
  const [seekInteractionActive, setSeekInteractionActive] = useState(false);
  const [cardTransitionActive, setCardTransitionActive] = useState(false);
  const [questionAudioPauseRequest, setQuestionAudioPauseRequest] = useState(0);
  const [recordingPreviewPauseRequest, setRecordingPreviewPauseRequest] = useState(0);
  const [dismissMediaControlsRequest, setDismissMediaControlsRequest] = useState(0);
  const [readyAudioItemId, setReadyAudioItemId] = useState<string>();
  const [listeningReviewStarted, setListeningReviewStarted] = useState(false);
  const [listeningFlowCompleted, setListeningFlowCompleted] = useState(false);
  const [listeningSaveError, setListeningSaveError] = useState<string>();
  const finishInFlight = useRef(false);
  const cardTransitionInFlight = useRef(false);
  const workbenchRef = useRef<StudyWorkbenchHandle>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const questionOffsetX = useSharedValue(0);
  const item = session.item;
  const card = item?.card;
  const dataset = item?.dataset;
  const category = item?.category;
  const topic = item?.topic;
  const totalItems = session.items.length;
  const vercelLegacyWeb = isVercelLegacyWeb(Platform.OS);
  const listeningExamRange = useMemo(
    () => resolveVercelListeningExamRange(props.studyPackage, Platform.OS),
    [props.studyPackage],
  );
  const listeningExamResult = useMemo(
    () => session.historyRecord?.vercelListeningReview?.result
      ?? (listeningExamRange ? scoreListeningExam(listeningExamRange, session.states) : undefined),
    [listeningExamRange, session.historyRecord, session.states],
  );
  const currentInListeningExam = Boolean(
    listeningExamRange
    && session.currentIndex >= listeningExamRange.startIndex
    && session.currentIndex <= listeningExamRange.endIndex,
  );
  const listeningExamActive = currentInListeningExam && !listeningReviewStarted && !session.historyRecord;
  const listeningReviewActive = currentInListeningExam && (listeningReviewStarted || Boolean(session.historyRecord));
  const listeningSegmentNavigationActive = Boolean(listeningExamRange && !listeningFlowCompleted && !session.historyRecord);
  const navigationStartIndex = listeningSegmentNavigationActive ? listeningExamRange!.startIndex : 0;
  const navigationEndIndex = listeningSegmentNavigationActive ? listeningExamRange!.endIndex : totalItems - 1;
  const navigationItemCount = Math.max(0, navigationEndIndex - navigationStartIndex + 1);
  const navigationCurrentIndex = session.currentIndex - navigationStartIndex;
  const forceListeningReveal = listeningReviewActive;
  const sessionCards = useMemo(() => session.items.map((entry) => entry.card), [session.items]);
  const imageCard = card?.kind === 'image';
  const audioAsset = useQuestionBankAsset(card?.audio);
  useQuestionBankAudioPreload(
    sessionCards,
    session.currentIndex,
    Platform.OS === 'web' && readyAudioItemId === item?.id,
  );
  const target = item && card && !imageCard && !session.historyRecord ? {
    bankId: item.dataset.id,
    categoryId: item.category.id,
    topicId: item.topic.id,
    cardId: card.id,
  } : undefined;
  const annotations = useQuestionAnnotations(target);
  const navigateAfterStudy = useCallback(() => {
    if (onReturn) {
      onReturn();
      return;
    }
    if (returnHref) {
      router.dismissTo(returnHref);
      return;
    }
    if (returnTo === 'annotations') {
      router.replace('/annotations');
      return;
    }
    if (returnTo === 'radio') {
      router.replace('/content/radio');
      return;
    }
    if (dataset) router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: dataset.id } });
  }, [dataset, onReturn, returnHref, returnTo, router]);

  usePreventRemove(!session.report && !leavingStudy, () => { void leaveStudy(); });

  useEffect(() => {
    if (!leavingStudy) return;
    navigateAfterStudy();
  }, [leavingStudy, navigateAfterStudy]);

  useEffect(() => {
    let active = true;
    void getConnectivity().then((state) => { if (active) setConnectivity(state); });
    const unsubscribe = subscribeConnectivity(setConnectivity);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ animated: false, y: 0 });
    setEditingWorkbenchTab(undefined);
    setTaskInteractionActive(false);
    setSeekInteractionActive(false);
    setDismissMediaControlsRequest((request) => request + 1);
    setSwipeBoundaryMessage(undefined);
    Keyboard.dismiss();
  }, [item?.id]);

  useEffect(() => {
    setListeningReviewStarted(false);
    setListeningFlowCompleted(false);
  }, [props.studyPackage?.id]);

  useEffect(() => {
    if (!swipeBoundaryMessage) return;
    const timeout = setTimeout(() => setSwipeBoundaryMessage(undefined), 1400);
    return () => clearTimeout(timeout);
  }, [swipeBoundaryMessage]);

  const finishWorkbenchEditing = useCallback(() => {
    setEditingWorkbenchTab(undefined);
    Keyboard.dismiss();
  }, []);

  const persistListeningResult = session.saveListeningResult;
  const saveListeningResult = useCallback(() => {
    setListeningSaveError(undefined);
    void persistListeningResult().catch(() => {
      setListeningSaveError('听力复盘尚未保存，请重试后再离开。');
    });
  }, [persistListeningResult]);

  useEffect(() => {
    if (
      !listeningExamRange
      || session.historyRecord
      || listeningReviewStarted
      || listeningExamResult?.answeredCount !== LISTENING_EXAM_ITEM_COUNT
    ) return;
    finishWorkbenchEditing();
    setQuestionAudioPauseRequest((request) => request + 1);
    setRecordingPreviewPauseRequest((request) => request + 1);
    setDismissMediaControlsRequest((request) => request + 1);
    setListeningReviewStarted(true);
    if (!session.historyRecord) saveListeningResult();
    if (session.currentIndex !== listeningExamRange.startIndex) {
      session.goTo(listeningExamRange.startIndex, false);
    }
  }, [finishWorkbenchEditing, listeningExamRange, listeningExamResult?.answeredCount, listeningReviewStarted, saveListeningResult, session]);

  const handleBodyScrollBegin = useCallback(() => {
    finishWorkbenchEditing();
    setDismissMediaControlsRequest((request) => request + 1);
  }, [finishWorkbenchEditing]);

  const handleQuestionPlaybackStart = useCallback(() => {
    setRecordingPreviewPauseRequest((request) => request + 1);
  }, []);

  const handleQuestionManualPlay = useCallback(() => {
    if (!vercelLegacyWeb || props.studyPackage?.progressMode === 'session-only' || !item) return;
    session.markCompleted(item.id);
  }, [item, props.studyPackage?.progressMode, session, vercelLegacyWeb]);

  const handleRecordingPreviewStart = useCallback(() => {
    setQuestionAudioPauseRequest((request) => request + 1);
  }, []);

  const handleRecordingIntent = useCallback(() => {
    setQuestionAudioPauseRequest((request) => request + 1);
    setRecordingPreviewPauseRequest((request) => request + 1);
    setDismissMediaControlsRequest((request) => request + 1);
  }, []);

  const workbenchTabs = session.behavior.workbenchTabs;
  const activeWorkbenchTab = session.activeTab;
  const setActiveWorkbenchTab = session.setActiveTab;

  const finishCardTransition = useCallback(() => {
    cardTransitionInFlight.current = false;
    setCardTransitionActive(false);
  }, []);

  const resetQuestionOffset = useCallback(() => {
    questionOffsetX.value = withSpring(0, {
      damping: 22,
      stiffness: 240,
      reduceMotion: ReduceMotion.System,
    });
  }, [questionOffsetX]);

  const enterCard = useCallback((index: number, direction: -1 | 1) => {
    questionOffsetX.value = direction * viewportWidth;
    session.goTo(index);
    questionOffsetX.value = withTiming(0, {
      duration: motion.standard,
      reduceMotion: ReduceMotion.System,
    }, () => {
      runOnJS(finishCardTransition)();
    });
  }, [finishCardTransition, questionOffsetX, session, viewportWidth]);

  const animateCardChange = useCallback((index: number, direction: -1 | 1) => {
    questionOffsetX.value = withTiming(-direction * viewportWidth, {
      duration: motion.quick,
      reduceMotion: ReduceMotion.System,
    }, (finished) => {
      if (finished) runOnJS(enterCard)(index, direction);
      else runOnJS(finishCardTransition)();
    });
  }, [enterCard, finishCardTransition, questionOffsetX, viewportWidth]);

  const goToCard = useCallback(async (index: number, requestedDirection?: -1 | 1) => {
    if (index === session.currentIndex) return true;
    if (index < 0 || index >= totalItems) return false;
    if (taskInteractionActive || finishInFlight.current || cardTransitionInFlight.current) return false;
    cardTransitionInFlight.current = true;
    setCardTransitionActive(true);
    finishWorkbenchEditing();
    try {
      const saved = await (workbenchRef.current?.flushAutoSave() ?? Promise.resolve(true));
      if (!saved) {
        setFinishError('回答自动保存失败，请重试后继续。');
        resetQuestionOffset();
        finishCardTransition();
        return false;
      }
      setFinishError(undefined);
      const direction = requestedDirection ?? (index > session.currentIndex ? 1 : -1);
      if (reduceMotion) {
        questionOffsetX.value = 0;
        session.goTo(index);
        finishCardTransition();
      } else {
        animateCardChange(index, direction);
      }
      return true;
    } catch {
      setFinishError('回答自动保存失败，请重试后继续。');
      resetQuestionOffset();
      finishCardTransition();
      return false;
    }
  }, [animateCardChange, finishCardTransition, finishWorkbenchEditing, questionOffsetX, reduceMotion, resetQuestionOffset, session, taskInteractionActive, totalItems]);

  const collapseWorkbench = useCallback(async () => {
    if (finishInFlight.current || cardTransitionInFlight.current) return false;
    cardTransitionInFlight.current = true;
    setCardTransitionActive(true);
    finishWorkbenchEditing();
    try {
      const saved = await (workbenchRef.current?.flushAutoSave() ?? Promise.resolve(true));
      if (!saved) {
        setFinishError('回答自动保存失败，请重试后收起。');
        return false;
      }
      setFinishError(undefined);
      session.collapseAnswers();
      return true;
    } finally {
      finishCardTransition();
    }
  }, [finishCardTransition, finishWorkbenchEditing, session]);

  const toggleAnswers = useCallback(() => {
    if (session.revealed) {
      void collapseWorkbench();
      return;
    }
    finishWorkbenchEditing();
    session.toggleAnswers();
  }, [collapseWorkbench, finishWorkbenchEditing, session]);

  const handleQuestionSwipe = useCallback((translationX: number, velocityX: number) => {
    const result = boundedHorizontalSwipe(navigationCurrentIndex, navigationItemCount, translationX, velocityX);
    if (result.direction === 0) {
      resetQuestionOffset();
      return;
    }
    if (result.boundary) {
      finishWorkbenchEditing();
      setSwipeBoundaryMessage(result.direction < 0 ? '已经是第一题' : '已经是最后一题，请点击完成');
      resetQuestionOffset();
      return;
    }
    void goToCard(navigationStartIndex + result.index, result.direction).then((changed) => {
      if (!changed) resetQuestionOffset();
    });
  }, [finishWorkbenchEditing, goToCard, navigationCurrentIndex, navigationItemCount, navigationStartIndex, resetQuestionOffset]);

  const questionBodyAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: questionOffsetX.value }],
  }));

  const questionSwipeEnabled = !editingWorkbenchTab
    && !taskInteractionActive
    && !seekInteractionActive
    && !cardTransitionActive
    && !answerCardVisible
    && !lookup
    && !finishing
    && session.toolMode !== 'highlight';
  const { questionSwipeGesture, recordingInteractionGesture, workbenchSwipeGesture } = useMemo(() => {
    const questionGesture = Gesture.Pan()
      .enabled(questionSwipeEnabled)
      .maxPointers(1)
      .activeOffsetX([-24, 24])
      .failOffsetY([-14, 14])
      .onUpdate(({ translationX }) => {
        const atFirstBoundary = session.currentIndex === navigationStartIndex && translationX > 0;
        const atLastBoundary = session.currentIndex === navigationEndIndex && translationX < 0;
        questionOffsetX.value = atFirstBoundary || atLastBoundary ? translationX * 0.28 : translationX;
      })
      .onEnd(({ translationX, velocityX }) => {
        runOnJS(handleQuestionSwipe)(translationX, velocityX);
      })
      .onFinalize((_event, success) => {
        if (!success) {
          questionOffsetX.value = withSpring(0, {
            damping: 22,
            stiffness: 240,
            reduceMotion: ReduceMotion.System,
          });
        }
      })
      .withTestId('study-question-swipe');
    const consoleGesture = Gesture.Pan()
      .enabled(workbenchTabs.length > 1 && !editingWorkbenchTab && session.toolMode !== 'highlight')
      .maxPointers(1)
      .activeOffsetX([-18, 18])
      .failOffsetY([-14, 14])
      .onEnd(({ translationX, velocityX }) => {
        const activeIndex = Math.max(0, workbenchTabs.indexOf(activeWorkbenchTab));
        const result = boundedHorizontalSwipe(activeIndex, workbenchTabs.length, translationX, velocityX, 48, 600);
        if (result.index !== activeIndex) setActiveWorkbenchTab(workbenchTabs[result.index]);
      })
      .runOnJS(true)
      .withTestId('study-workbench-swipe');
    consoleGesture.blocksExternalGesture(questionGesture);
    const recordingGesture = Gesture.Native().blocksExternalGesture(questionGesture);
    return {
      questionSwipeGesture: questionGesture,
      recordingInteractionGesture: recordingGesture,
      workbenchSwipeGesture: consoleGesture,
    };
  }, [activeWorkbenchTab, editingWorkbenchTab, handleQuestionSwipe, navigationEndIndex, navigationStartIndex, questionOffsetX, questionSwipeEnabled, session.currentIndex, session.toolMode, setActiveWorkbenchTab, workbenchTabs]);

  const selectedTagColors = useMemo(() => (annotations.entry?.tagIds ?? []).flatMap((id) => {
    const definition = annotations.tagDefinitions.find((item) => item.id === id);
    return definition ? [annotationToneColors[definition.color]] : [];
  }), [annotations.entry?.tagIds, annotations.tagDefinitions]);
  const answerCardMarked = useMemo(() => {
    if (session.historyReview) {
      return new Set(session.items.flatMap((entry, index) => wasAnswered(session.historyReview!, entry.id) ? [index] : []));
    }
    if (listeningSegmentNavigationActive && listeningExamRange) {
      return new Set(listeningExamRange.items.flatMap((entry, index) => (
        session.states?.[entry.id]?.selectedChoiceIndex !== undefined ? [index] : []
      )));
    }
    if (vercelLegacyWeb) {
      return new Set(session.items.flatMap((entry, index) => (
        session.states?.[entry.id]?.completed ? [index] : []
      )));
    }
    return session.visitedIndexes;
  }, [listeningExamRange, listeningSegmentNavigationActive, session.historyReview, session.items, session.states, session.visitedIndexes, vercelLegacyWeb]);
  const answerCardResults = useMemo(() => {
    // Keep active mock exams blind; their results become visible during review.
    if (!vercelLegacyWeb || listeningExamActive) return undefined;
    return session.items.slice(navigationStartIndex, navigationEndIndex + 1).map((entry) => {
      const selected = session.states[entry.id]?.selectedChoiceIndex;
      const correct = entry.card.correctChoiceIndex;
      if (selected === undefined || correct === undefined) return undefined;
      return selected === correct ? 'correct' as const : 'incorrect' as const;
    });
  }, [listeningExamActive, navigationEndIndex, navigationStartIndex, session.items, session.states, vercelLegacyWeb]);
  const answerCardTagColors = useMemo(() => {
    if (!vercelLegacyWeb) return undefined;
    return session.items.slice(navigationStartIndex, navigationEndIndex + 1).map((entry) => {
      const key = questionBankCardTargetKey({ bankId: entry.dataset.id, categoryId: entry.category.id, topicId: entry.topic.id, cardId: entry.card.id });
      return (annotations.store.entries[key]?.tagIds ?? []).flatMap((id) => {
        const definition = annotations.tagDefinitions.find((tag) => tag.id === id);
        return definition ? [annotationToneColors[definition.color]] : [];
      });
    });
  }, [annotations.store.entries, annotations.tagDefinitions, navigationEndIndex, navigationStartIndex, session.items, vercelLegacyWeb]);
  const answerCardMarkedLabel = listeningSegmentNavigationActive || session.historyRecord ? '已答' : '已学';
  const answerCardUnmarkedLabel = listeningSegmentNavigationActive || session.historyRecord ? '未答' : '未学';
  const lookupInteraction = resolveWordLookupInteraction(Platform.OS, session.toolMode);
  const dictionaryMode = lookupInteraction === 'tap';
  const nativeAnnotationMode = Platform.OS !== 'web' && (session.toolMode === 'highlight' || session.toolMode === 'tags')
    ? session.toolMode
    : undefined;
  const annotationPanelWidth = Math.min(viewportWidth - spacing[10], 390);
  const annotationPanelLeft = Math.max(spacing[5], (viewportWidth - annotationPanelWidth) / 2);

  function lookupWord(word: string) {
    const entry = findStaticWordLookup(word);
    if (entry) setLookup(entry);
  }

  function toggleHighlight(value: { blockId: AnnotationTextBlockId; wordIndex: number; quote: string; sentence: string; sourceText: string }) {
    if (!item) return;
    session.markCompleted(item.id);
    void annotations.toggleHighlight({ ...value, colorId: activeHighlightId });
  }

  function applyHighlightRange(value: { action: 'apply' | 'remove'; blockId: AnnotationTextBlockId; endWordIndex: number; sourceText: string; startWordIndex: number }) {
    if (!item) return;
    session.markCompleted(item.id);
    void annotations.applyHighlightRange({ ...value, colorId: activeHighlightId });
  }

  function sessionAnnotationMetrics() {
    const targetKeys = new Set(Array.from(session.visitedIndexes).flatMap((index) => {
      const visited = session.items[index];
      return visited ? [questionBankCardTargetKey({
        bankId: visited.dataset.id,
        categoryId: visited.category.id,
        topicId: visited.topic.id,
        cardId: visited.card.id,
      })] : [];
    }));
    const entries = Object.values(annotations.store.entries).filter((entry) => targetKeys.has(questionBankCardTargetKey(entry)));
    return {
      annotationCount: entries.reduce((count, entry) => count + entry.tagIds.length + entry.highlights.length, 0),
      noteCount: entries.filter((entry) => entry.note.trim()).length,
    };
  }

  async function leaveStudy() {
    if (taskInteractionActive) {
      setFinishError('录音正在保存，请稍候再返回。');
      return;
    }
    if (finishInFlight.current || cardTransitionInFlight.current) return;
    finishInFlight.current = true;
    setFinishing(true);
    setFinishError(undefined);
    finishWorkbenchEditing();
    try {
      const saved = await (workbenchRef.current?.flushAutoSave() ?? Promise.resolve(true));
      if (!saved) {
        setFinishError('回答自动保存失败，请重试后返回。');
        return;
      }
      setQuestionAudioPauseRequest((request) => request + 1);
      setRecordingPreviewPauseRequest((request) => request + 1);
      setDismissMediaControlsRequest((request) => request + 1);
      setLeavingStudy(true);
    } finally {
      finishInFlight.current = false;
      setFinishing(false);
    }
  }

  async function openCorrectionFeedback() {
    if (!item || taskInteractionActive || finishInFlight.current || cardTransitionInFlight.current) return;
    finishInFlight.current = true;
    setFinishError(undefined);
    finishWorkbenchEditing();
    try {
      const saved = await (workbenchRef.current?.flushAutoSave() ?? Promise.resolve(true));
      if (!saved) {
        setFinishError('回答自动保存失败，请重试后提交纠错。');
        return;
      }
      setQuestionAudioPauseRequest((request) => request + 1);
      setRecordingPreviewPauseRequest((request) => request + 1);
      setDismissMediaControlsRequest((request) => request + 1);
      router.push({
        pathname: '/info/[slug]',
        params: {
          slug: 'feedback',
          source: 'study',
          sourceRoute: sourceRoute ?? `/question-bank/${item.dataset.id}/study/${item.category.id}/${item.topic.id}`,
          bankId: item.dataset.id,
          categoryId: item.category.id,
          topicId: item.topic.id,
          cardId: item.card.id,
        },
      });
    } catch {
      setFinishError('回答自动保存失败，请重试后提交纠错。');
    } finally {
      finishInFlight.current = false;
    }
  }

  async function finish(reason: 'abort' | 'complete') {
    if (session.historyRecord) {
      await leaveStudy();
      return;
    }
    if (taskInteractionActive) {
      setFinishError('录音正在保存，请稍候再结束。');
      return;
    }
    if (finishInFlight.current || cardTransitionInFlight.current) return;
    finishInFlight.current = true;
    setFinishing(true);
    setFinishError(undefined);
    finishWorkbenchEditing();
    try {
      const saved = await (workbenchRef.current?.flushAutoSave() ?? Promise.resolve(true));
      if (!saved) {
        setFinishError('回答自动保存失败，请重试后继续。');
        return;
      }
      setQuestionAudioPauseRequest((request) => request + 1);
      setRecordingPreviewPauseRequest((request) => request + 1);
      setDismissMediaControlsRequest((request) => request + 1);
      await session.finish(reason, sessionAnnotationMetrics());
    } catch {
      setFinishError('学习报告保存失败，请重试。');
    } finally {
      finishInFlight.current = false;
      setFinishing(false);
    }
  }

  if (session.report) {
    return <StudyReport interaction={dataset?.study.interaction ?? 'speaking'} noteCount={session.report.noteCount ?? 0} onReturn={navigateAfterStudy} record={session.report} returnLabel={returnLabel} />;
  }
  if (!session.hydrated) return <SafeAreaView style={styles.state}><AppText variant="caption">正在恢复学习进度…</AppText></SafeAreaView>;
  if (session.loadError || !item || !card || !dataset || !category || !topic) return <SafeAreaView style={styles.state}><CenteredState actionLabel="重新加载" description={session.loadError ?? '当前题目不存在，请返回题库后重试。'} onAction={session.retryHydration} title="学习内容加载失败" tone="destructive" /></SafeAreaView>;

  const entry = annotations.entry;
  const transcript = card.kind === 'image' ? null : (
    <View style={styles.cardContent}>
      <View style={styles.sectionTitle}><Languages color={colors.mutedForeground} size={15} /><AppText variant="button">{session.behavior.transcriptLabel}</AppText></View>
      <InteractiveStudyText activeHighlightId={activeHighlightId} blockId="question" definitions={annotations.highlightDefinitions} dictionaryMode={dictionaryMode} highlightMode={session.toolMode === 'highlight'} highlights={entry?.highlights ?? []} isLookupAvailable={hasStaticWordLookup} lookupEnabled={dataset.study.tools.dictionary} lookupInteraction={lookupInteraction} onHighlight={toggleHighlight} onHighlightRange={applyHighlightRange} onLookup={lookupWord} text={card.audioText} />
      {card.audioTextZh ? <AppText style={styles.translation}>{card.audioTextZh}</AppText> : null}
    </View>
  );
  const referenceContent = card.kind === 'image' || dataset.id === 'listening' || !card.referenceText ? null : (
    <View style={styles.referenceContent}>
      <InteractiveStudyText activeHighlightId={activeHighlightId} blockId="reference" definitions={annotations.highlightDefinitions} dictionaryMode={dictionaryMode} highlightMode={session.toolMode === 'highlight'} highlights={entry?.highlights ?? []} isLookupAvailable={hasStaticWordLookup} lookupEnabled={dataset.study.tools.dictionary} lookupInteraction={lookupInteraction} onHighlight={toggleHighlight} onHighlightRange={applyHighlightRange} onLookup={lookupWord} text={card.referenceText} />
      {card.referenceTextZh ? <AppText style={styles.translation}>{card.referenceTextZh}</AppText> : null}
    </View>
  );
  const integratedRecordingLayout = session.behavior.taskKind === 'recording' && !session.historyRecord;
  const taskContent = session.historyRecord && session.behavior.taskKind === 'recording' ? (
    <AppText variant="caption">{session.cardState?.recorded ? '本次录音未保留，可查看已保存的文字回答。' : '历史复盘 · 仅查看当次作答'}</AppText>
  ) : (
    <StudyTaskRenderer
      behavior={session.behavior}
      blockedExternalGesture={questionSwipeGesture}
      card={card}
      interactionGesture={recordingInteractionGesture}
      isLookupAvailable={hasStaticWordLookup}
      key={item.id}
      lookupInteraction={lookupInteraction}
      onChoose={(choiceIndex) => session.chooseOption(choiceIndex, !listeningExamActive)}
      onLookupWord={listeningExamActive ? undefined : lookupWord}
      onClearRecording={session.clearRecording}
      onInteractionChange={setTaskInteractionActive}
      onPreviewPlaybackStart={handleRecordingPreviewStart}
      onRecorded={session.recordAnswer}
      onRecordingIntent={handleRecordingIntent}
      previewPauseRequest={recordingPreviewPauseRequest}
      recording={session.recording}
      choiceReadOnly={listeningReviewActive || Boolean(session.historyRecord)}
      revealed={session.revealed || forceListeningReveal || Boolean(session.historyRecord)}
      selectedChoiceIndex={session.cardState?.selectedChoiceIndex}
      sessionId={session.sessionId}
      variant={integratedRecordingLayout ? 'integrated' : 'default'}
    />
  );
  const atNavigationEnd = session.currentIndex === navigationEndIndex;
  const hasModulesAfterListening = Boolean(
    listeningExamRange && listeningExamRange.endIndex < totalItems - 1,
  );
  const footerPrimaryLabel = !atNavigationEnd
    ? '下一题'
    : session.historyRecord
      ? '返回学习记录'
    : listeningSegmentNavigationActive && !listeningReviewStarted
      ? '检查答题'
      : listeningSegmentNavigationActive && hasModulesAfterListening
        ? '继续考试'
        : '完成';

  function handleFooterPrimary() {
    if (!atNavigationEnd) {
      void goToCard(session.currentIndex + 1, 1);
      return;
    }
    if (session.historyRecord) {
      void finish('complete');
      return;
    }
    if (listeningSegmentNavigationActive && !listeningReviewStarted) {
      setAnswerCardVisible(true);
      return;
    }
    if (listeningSegmentNavigationActive && listeningExamRange && hasModulesAfterListening) {
      setListeningFlowCompleted(true);
      void goToCard(listeningExamRange.endIndex + 1, 1);
      return;
    }
    void finish('complete');
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <AppContentFrame style={styles.contentFrame}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel={returnLabel ?? (returnTo === 'radio' ? '返回随身听' : returnTo === 'annotations' ? '返回我的标注' : '返回题库目录')} disabled={finishing || taskInteractionActive} onPress={() => void leaveStudy()} style={({ pressed }) => [returnTo === 'radio' ? styles.returnToRadioButton : styles.circleButton, pressed ? styles.topBarPressed : null]}><ChevronLeft color={colors.foreground} size={21} />{returnTo === 'radio' ? <AppText variant="button">返回随身听</AppText> : null}</Pressable>
        <View style={styles.topSpacer} />
        <Pressable accessibilityLabel="纠正当前题目内容" disabled={finishing || taskInteractionActive || cardTransitionActive} hitSlop={5} onPress={() => void openCorrectionFeedback()} style={({ pressed }) => [styles.correctionButton, pressed ? styles.counterPressed : null]}><Flag color={colors.mutedForeground} size={13} /><AppText color={colors.mutedForeground} variant="micro">纠错</AppText></Pressable>
        <Pressable accessibilityLabel="打开答题卡" disabled={taskInteractionActive} onPress={() => { finishWorkbenchEditing(); setAnswerCardVisible(true); }} style={({ pressed }) => [styles.counterButton, pressed ? styles.counterPressed : null]}><Grid3X3 color={colors.mutedForeground} size={15} /><AppText style={styles.counter} variant="button">{navigationCurrentIndex + 1} / {navigationItemCount}</AppText></Pressable>
      </View>
      {connectivity === 'offline' ? <View style={styles.offline}><WifiOff color={colors.mutedForeground} size={15} /><AppText style={styles.offlineCopy} variant="micro">当前处于离线状态；文字学习和本机标注仍可使用。</AppText></View> : null}

      {!imageCard && !listeningExamActive && !session.historyRecord ? <View onLayout={({ nativeEvent }) => { if (Platform.OS !== 'web') setAnnotationPanelTop(nativeEvent.layout.y + nativeEvent.layout.height); }} style={styles.tools}>
        <AnnotationToolbar activeHighlightId={activeHighlightId} dictionaryMode={dictionaryMode} highlightDefinitions={annotations.highlightDefinitions} highlightMode={session.toolMode === 'highlight'} leading={listeningReviewActive ? undefined : <Pressable accessibilityLabel={session.revealed ? '收起答案' : '显示答案'} onPress={toggleAnswers} style={({ pressed }) => [styles.answerTool, session.revealed ? styles.toolActive : null, pressed ? styles.toolPressed : null]}><Check color={session.revealed ? colors.primary : colors.mutedForeground} size={14} /><AppText color={session.revealed ? colors.primary : colors.mutedForeground} variant="caption">答案</AppText></Pressable>} onCreateHighlight={(label, color) => { finishWorkbenchEditing(); void annotations.addHighlightDefinition(label, color).then((id) => { if (id) setActiveHighlightId(id); }); }} onCreateTag={(label, color) => { finishWorkbenchEditing(); void annotations.addTagDefinition(label, color); }} onDictionaryModeChange={(value) => { finishWorkbenchEditing(); session.setToolMode(value ? 'dictionary' : undefined); }} onHighlightChange={(value) => { finishWorkbenchEditing(); setActiveHighlightId(value); }} onHighlightModeChange={(value) => { finishWorkbenchEditing(); session.setToolMode(value ? 'highlight' : undefined); }} onTagModeChange={(value) => { finishWorkbenchEditing(); session.setToolMode(value ? 'tags' : undefined); }} onTagToggle={(id) => { finishWorkbenchEditing(); void annotations.toggleTag(id); }} resetToken={item.id} selectedTags={entry?.tagIds ?? []} showDictionary={showsWordLookupModeToggle(Platform.OS) && dataset.study.tools.dictionary} showHighlights={dataset.study.tools.highlights} showTags={dataset.study.tools.tags} tagDefinitions={annotations.tagDefinitions} tagMode={session.toolMode === 'tags'} />
      </View> : null}

      {!imageCard && !listeningExamActive && !session.historyRecord && annotationPanelTop !== undefined ? (
        <AnnotationFloatingPanel
          activeHighlightId={activeHighlightId}
          highlightDefinitions={annotations.highlightDefinitions}
          left={annotationPanelLeft}
          mode={nativeAnnotationMode}
          onCreateHighlight={(label, color) => { finishWorkbenchEditing(); void annotations.addHighlightDefinition(label, color).then((id) => { if (id) setActiveHighlightId(id); }); }}
          onCreateTag={(label, color) => { finishWorkbenchEditing(); void annotations.addTagDefinition(label, color); }}
          onHighlightChange={(value) => { finishWorkbenchEditing(); setActiveHighlightId(value); }}
          onTagToggle={(id) => { finishWorkbenchEditing(); void annotations.toggleTag(id); }}
          resetToken={item.id}
          selectedTags={entry?.tagIds ?? []}
          tagDefinitions={annotations.tagDefinitions}
          top={annotationPanelTop}
          width={annotationPanelWidth}
        />
      ) : null}

      <GestureDetector gesture={questionSwipeGesture}>
        <Animated.View style={[styles.bodyGesture, questionBodyAnimatedStyle]}>
          <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.bodyContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" onScrollBeginDrag={handleBodyScrollBegin} ref={bodyScrollRef} showsVerticalScrollIndicator={false} style={styles.body} testID="study-body-scroll">
            {session.historyReview && session.historyRecord ? (
              <View style={styles.historySummary}>
                <AppText variant="sectionTitle">学习复盘{session.historyReview.items.some((entry) => !wasAnswered(session.historyReview!, entry.id) && !(entry.card.kind === 'image' && session.historyReview!.states[entry.id]?.completed)) ? ' · 未完成' : ''}</AppText>
                <AppText variant="caption">当次题包与作答已锁定</AppText>
                <AppText color={wasAnswered(session.historyReview, item.id) ? colors.primary : colors.mutedForeground} variant="button">
                  {wasAnswered(session.historyReview, item.id) ? '本题已作答' : '本题未作答'}
                </AppText>
              </View>
            ) : null}
            {listeningReviewActive && listeningExamResult?.answeredCount === LISTENING_EXAM_ITEM_COUNT ? (
              <View accessibilityLabel={`听力成绩 ${listeningExamResult.score} 分 ${listeningExamResult.level} 级`} style={styles.listeningResult}>
                <View style={styles.listeningResultCopy}>
                  <AppText color={colors.primary} variant="micro">LISTENING RESULT</AppText>
                  <AppText variant="sectionTitle">听力成绩</AppText>
                  <AppText variant="caption">已进入复盘，答案已锁定</AppText>
                </View>
                <View style={styles.listeningResultScore}>
                  <AppText color={colors.primary} style={styles.listeningScoreNumber} variant="pageTitle">{listeningExamResult.score} 分</AppText>
                  <AppText color={colors.accent} variant="button">{listeningExamResult.level} 级</AppText>
                </View>
              </View>
            ) : null}
            {listeningSaveError ? <View style={styles.listeningSaveError}>
              <AppText color={colors.destructive} variant="caption">{listeningSaveError}</AppText>
              <Button onPress={saveListeningResult} size="sm">重试保存复盘</Button>
            </View> : null}
            {card.kind === 'image' ? (
              <ImageQuestionCard imageAlt={card.imageAlt} imagePath={card.image} onDisplayed={() => session.markCompleted(item.id)} />
            ) : (
              <StudyCardStack onCollapse={() => { if (!listeningExamActive && !listeningReviewActive && !session.historyRecord) void collapseWorkbench(); }} onReveal={() => { if (!listeningExamActive && !listeningReviewActive && !session.historyRecord) session.revealCurrent(true); }} primary={<View style={styles.primaryContent}><StudyAudioPlayer autoPlayRequest={session.playRequestToken} blockedExternalGesture={questionSwipeGesture} dismissControlsRequest={dismissMediaControlsRequest} durationHint={Platform.OS === 'web' ? card.audioDurationSeconds : undefined} generatedAudio={session.behavior.generatedAudio && !card.audio} label={card.taskTitle} onManualPlay={handleQuestionManualPlay} onPlaybackStart={handleQuestionPlaybackStart} onReady={Platform.OS === 'web' ? () => setReadyAudioItemId(item.id) : undefined} onRetry={audioAsset.retry} onSeekInteractionChange={setSeekInteractionActive} pauseRequest={questionAudioPauseRequest} playbackKey={item.id} practiceControls={integratedRecordingLayout ? taskContent : undefined} resolving={audioAsset.resolving} tagColors={selectedTagColors} uri={audioAsset.uri} variant={integratedRecordingLayout ? 'integrated-recording' : 'default'} />{integratedRecordingLayout ? null : <><View style={styles.divider} />{taskContent}</>}</View>} revealed={session.revealed || forceListeningReveal} transcript={transcript} workbench={session.historyRecord ? <View style={styles.historySummary}>
                {session.behavior.taskKind === 'recording' ? <>
                  <AppText variant="button">我的回答</AppText>
                  <AppText>{session.answerText.trim() ? session.answerText : session.cardState?.recorded ? '本题仅录音，未保存文字答案' : '未作答'}</AppText>
                </> : null}
                {referenceContent ? <><AppText variant="button">{session.behavior.referenceLabel}</AppText>{referenceContent}</> : null}
              </View> : <StudyWorkbench ref={workbenchRef} activeTab={session.activeTab} answerText={session.answerText} bankId={dataset.id} bankTitle={dataset.title} cardKey={item.id} categoryTitle={category.name} editingTab={editingWorkbenchTab} noteText={entry?.note ?? ''} onAnswerChange={session.updateAnswer} onEditingTabChange={setEditingWorkbenchTab} onFeedback={session.markFeedback} onNoteChange={(note) => { void annotations.saveNote(note); }} onRetrySave={() => { void annotations.retrySave(); }} onTabChange={session.setActiveTab} persistAiResult={props.studyPackage?.progressMode !== 'session-only'} questionText={card.audioText} recordingUri={session.recording?.uri} referenceContent={referenceContent} referenceLabel={session.behavior.referenceLabel} reviewKind={session.behavior.reviewKind} saveError={annotations.saveErrorMessage} sessionId={session.sessionId} sessionStartedAt={session.sessionStartedAt} sourceCardId={card.id} swipeGesture={workbenchSwipeGesture} tabs={session.behavior.workbenchTabs} topicTitle={topic.name} />} />
            )}
          </ScrollView>
          {swipeBoundaryMessage ? <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.swipeBoundary}><AppText variant="micro">{swipeBoundaryMessage}</AppText></View> : null}
        </Animated.View>
      </GestureDetector>

      <View style={[styles.footerShell, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
        {finishError ? <AppText color={colors.destructive} style={styles.finishError} variant="caption">{finishError}</AppText> : null}
        <View style={styles.footer}>
          <Button disabled={finishing || taskInteractionActive || cardTransitionActive} leading={<Flag color={colors.foreground} size={18} />} onPress={() => void finish('abort')} size="sm" style={styles.footerFinish} testID="study-footer-finish" variant="outline">{finishing ? '生成中…' : session.historyRecord ? '返回记录' : '结束'}</Button>
          <Button disabled={finishing || taskInteractionActive || cardTransitionActive || session.currentIndex === navigationStartIndex} leading={<ChevronLeft color={colors.foreground} size={20} />} onPress={() => { void goToCard(session.currentIndex - 1, -1); }} size="sm" style={styles.footerPrevious} testID="study-footer-previous" variant="outline">上一题</Button>
          <Button accessibilityLabel={footerPrimaryLabel} disabled={finishing || taskInteractionActive || cardTransitionActive} onPress={handleFooterPrimary} size="sm" style={styles.footerPrimary} testID="study-footer-next">{finishing ? '生成中…' : footerPrimaryLabel} <ChevronRight color={colors.primaryForeground} size={20} /></Button>
        </View>
      </View>
      </AppContentFrame>

      <AnswerCardSheet results={answerCardResults} tagColors={answerCardTagColors} current={navigationCurrentIndex} marked={answerCardMarked} markedLabel={answerCardMarkedLabel} onClose={() => setAnswerCardVisible(false)} onSelect={(index) => { void goToCard(navigationStartIndex + index).then((changed) => { if (changed) setAnswerCardVisible(false); }); }} total={navigationItemCount} unmarkedLabel={answerCardUnmarkedLabel} visible={answerCardVisible} />
      <BottomSheet accessibilityLabel="查词结果" onClose={() => setLookup(undefined)} scrollable={false} visible={Boolean(lookup)}>
        <View style={styles.sheetContent}>
          <View style={styles.lookupTitleRow}>
            <AppText style={styles.lookupTitle} variant="pageTitle">{lookup?.word}</AppText>
            {lookup ? <LegacyLookupPronunciation key={lookup.word} word={lookup.word} /> : null}
            {lookup ? (
              <Pressable
                accessibilityLabel={wordFavorites.isFavorite({ word: lookup.word }) ? '取消收藏' : '收藏'}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => { void wordFavorites.toggleFavorite({ word: lookup.word }); }}
                style={({ pressed }) => [styles.lookupFavorite, pressed ? styles.lookupFavoritePressed : null]}
              >
                <Star
                  color={wordFavorites.isFavorite({ word: lookup.word }) ? colors.accent : colors.mutedForeground}
                  fill={wordFavorites.isFavorite({ word: lookup.word }) ? colors.accent : 'transparent'}
                  size={22}
                />
              </Pressable>
            ) : null}
          </View>
          <AppText color={colors.mutedForeground}>{lookup?.ipa}</AppText>
          <AppText>{`航空释义：${lookup?.aviationMeaning ?? ''}`}</AppText>
          <AppText>{`常用释义：${lookup?.generalMeaning ?? ''}`}</AppText>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  historySummary: { gap: spacing[2], paddingVertical: spacing[3] },
  listeningSaveError: { gap: spacing[2], marginBottom: spacing[3] },
  root: { backgroundColor: colors.background, flex: 1, overflow: 'hidden' }, contentFrame: { flex: 1, position: 'relative' }, state: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' }, topBar: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], minHeight: 48, paddingBottom: spacing[1], paddingHorizontal: spacing[3] }, circleButton: { alignItems: 'center', borderRadius: radii.full, height: 38, justifyContent: 'center', width: 38 }, topBarPressed: { opacity: 0.65 }, topSpacer: { flex: 1 }, correctionButton: { alignItems: 'center', borderRadius: radii.full, flexDirection: 'row', gap: spacing[1], minHeight: 34, paddingHorizontal: spacing[2] }, counterButton: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 34, paddingHorizontal: spacing[3] }, counterPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] }, counter: { fontFamily: fonts.monoRegular }, offline: { alignItems: 'center', backgroundColor: colors.secondary, flexDirection: 'row', gap: spacing[2], marginHorizontal: spacing[5], padding: spacing[2] }, offlineCopy: { flex: 1 }, tools: { paddingHorizontal: spacing[5], paddingVertical: spacing[2.5], zIndex: 20 }, answerTool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] }, toolActive: { backgroundColor: colors.primary06, borderColor: colors.primary }, toolPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] }, bodyGesture: { flex: 1, minHeight: 0 }, body: { flex: 1, minHeight: 0 }, bodyContent: { paddingBottom: spacing[5], paddingHorizontal: spacing[5], paddingTop: spacing[2] }, listeningResult: { alignItems: 'center', backgroundColor: colors.primary06, borderColor: colors.primary20, borderRadius: radii.xxl, borderWidth: 1, flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between', marginBottom: spacing[4], padding: spacing[4] }, listeningResultCopy: { flex: 1, gap: spacing[1] }, listeningResultScore: { alignItems: 'flex-end', gap: spacing[1] }, listeningScoreNumber: { fontFamily: fonts.monoRegular, fontSize: 24, lineHeight: 30 }, primaryContent: { gap: spacing[4] }, divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth }, cardContent: { gap: spacing[2], paddingBottom: spacing[2] }, sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, translation: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, color: colors.mutedForeground, fontSize: 13, lineHeight: 21, marginTop: spacing[3], paddingTop: spacing[3] }, referenceContent: { gap: spacing[2] }, swipeBoundary: { alignSelf: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, bottom: spacing[3], paddingHorizontal: spacing[3], paddingVertical: spacing[2], position: 'absolute' }, footerShell: { backgroundColor: colors.background, gap: spacing[1], paddingTop: spacing[2], shadowColor: colors.foreground, shadowOffset: { height: -4, width: 0 }, shadowOpacity: 0.025, shadowRadius: 12, elevation: 3 }, finishError: { paddingHorizontal: spacing[5], textAlign: 'center' }, footer: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[5] }, footerFinish: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, minHeight: 48, paddingHorizontal: spacing[4] }, footerPrevious: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, flex: 1, minHeight: 48, paddingHorizontal: spacing[3] }, footerPrimary: { borderRadius: radii.full, flex: 1, minHeight: 48, paddingHorizontal: spacing[3] }, sheetContent: { gap: spacing[3], paddingBottom: spacing[3] }, lookupTitleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' }, lookupTitle: { flex: 1 }, lookupFavorite: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 }, lookupFavoritePressed: { backgroundColor: colors.secondary, transform: [{ scale: 0.95 }] },
  returnToRadioButton: { alignItems: 'center', borderRadius: radii.full, flexDirection: 'row', gap: spacing[1], minHeight: 38, paddingHorizontal: spacing[2] },
});
