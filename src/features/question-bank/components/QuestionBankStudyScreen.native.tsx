import { useRouter as useExitRouter } from 'expo-router';
import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { GuideScrollView } from '@/features/usage-guide/GuideScrollView';
import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { TutorialCoach, TutorialTarget, useTutorial } from '@/features/usage-guide/TutorialContext';
import { TUTORIAL_STEPS } from '@/features/usage-guide/tutorial-model';
import { annotatedThisSession } from '../lib/session-recap';
import { readAnnotationStore } from '../annotations/annotation-store.native';
import { useSaveAction } from '@/features/vocabulary/use-save-action.native';
import { setClickStudyContext, trackProductClick } from '@/platform/product-clicks.native';
import { usePreventRemove } from '@react-navigation/native';
import { type Href, useFocusEffect } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, Flag, Grid3X3, Languages, Star, WifiOff } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { AppContentFrame } from '@/components/platform/AppContentFrame';
import { useAppViewportDimensions } from '@/components/platform/useAppViewportDimensions';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { getCommerceEntitlementSnapshot, subscribeCommerceEntitlementChanges } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import { getEmbeddedQuestionBanks } from '../data/repository.native';
import { contentReleaseOf } from '../data/content-version.native';
import { contentFingerprint } from '../annotations/text';
import { StudyHistoryPersonalContent } from './StudyHistoryPersonalContent.native';
import { colors, fonts, motion, radii, spacing } from '@/theme';
import { useWordFavorites } from '@/features/vocabulary/progress-store.native';
import { resolveListeningExamRange } from '@/features/mock-exam/listening-session.native';
import { ExamQuestionAudio } from './ExamQuestionAudio.native';

import { annotationToneColors } from '../annotations/colors';
import { questionBankCardTargetKey } from '../annotations/card-index';
import { useQuestionAnnotations } from '../annotations/use-question-annotations-with-save.native';
import type { AnnotationTextBlockId, QuestionBankAnnotationStore } from '../annotations/types';
import { useStudySession } from '../hooks/useStudySession.native';
import { useQuestionBankAsset } from '../hooks/useQuestionBankAsset';
import { useQuestionBankAudioPreload } from '../hooks/useQuestionBankAudioPreload';
import { resolveWordLookupInteraction, showsWordLookupModeToggle } from '../lib/word-lookup-interaction';
import { getConnectivity, subscribeConnectivity, type Connectivity } from '../platform/network-service';
import { findStaticWordLookup, hasStaticWordLookup, type StaticWordLookupEntry } from '../static-word-lookup/repository';
import type {
  LearningRecord,
  QuestionBankCategory,
  QuestionBankDataset,
  QuestionBankStudyPackage,
  QuestionBankTopic,
} from '../types';
import { boundedHorizontalSwipe } from '../lib/study-gestures';
import { AnnotationFloatingPanel, AnnotationToolbar } from './AnnotationToolbar.native';
import { AnswerCardSheet } from './AnswerCardSheet';
import { LookupPronunciation } from './LookupPronunciation';
import { InteractiveStudyText } from './InteractiveStudyText';
import { ImageQuestionCard } from './ImageQuestionCard';
import { StudyAudioPlayer } from './StudyAudioPlayer';
import { StudyCardStack } from './StudyCardStack';
import { StudyReport } from './StudyReport.native';
import { StudyTaskRenderer } from './StudyTaskRenderer.native';
import { StudyWorkbench, type StudyWorkbenchHandle, type StudyWorkbenchFeedbackCache } from './StudyWorkbench.native';

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
  const fallbackHref: Href = props.returnHref ?? (props.returnTo === 'annotations' ? '/annotations' : props.returnTo === 'radio' ? '/content/radio' : props.dataset ? { pathname: '/question-bank/[bankId]', params: { bankId: props.dataset.id } } : '/(tabs)');
  return <NativeScreenBoundary title={props.studyPackage?.studyReviewRecord ? '学习记录' : props.studyPackage?.record.recordType === 'mock_exam' ? '模拟考试' : '题库学习'} onExit={props.onReturn} fallbackHref={fallbackHref} resetKey={props.studyPackage?.id ?? `${props.dataset?.id}/${props.category?.id}/${props.topic?.id}`}><StudyContent {...props} /></NativeScreenBoundary>;
}

function StudyContent(props: Props) {
  const { onReturn, returnTo, returnHref, returnLabel, sourceRoute } = props;
  const router = useRouter();
  const exitRouter = useExitRouter();
  const tutorial = useTutorial();
  const guide = useGuide();
  const pauseGuide = guide?.pause;
  const guideCurrent = guide?.current;
  useFocusEffect(useCallback(() => { setClickStudyContext(props.dataset?.id ?? (props.studyPackage?.record.recordType === 'mock_exam' ? 'mock-exam' : 'study')); return () => setClickStudyContext('study'); }, [props.dataset?.id, props.studyPackage?.record.recordType]));
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
  const tutorialStep = tutorial ? TUTORIAL_STEPS[tutorial.progress.step]?.id : undefined;
  const guiding = Boolean(tutorial && !session.historyRecord);
  const revealForTutorial = session.revealCurrent;
  const setTutorialTool = session.setToolMode;
  const setTutorialTab = session.setActiveTab;
  const wordFavorites = useWordFavorites();
  const sessionWords = useRef(new Set<string>());
  const sessionFavorites = useRef(new Set<string>());
  const initialAnnotations = useRef<QuestionBankAnnotationStore | undefined>(undefined);
  const favoriteSave = useSaveAction();
  const [newRecording, setNewRecording] = useState<{ cardKey: string; token: string }>();
  const [answerCardVisible, setAnswerCardVisible] = useState(false);
  const [connectivity, setConnectivity] = useState<Connectivity>('unknown');
  const [activeHighlightId, setActiveHighlightId] = useState('green');
  const [managingAnnotations, setManagingAnnotations] = useState(false);
  const [annotationPanelTop, setAnnotationPanelTop] = useState<number>();
  const [lookup, setLookup] = useState<StaticWordLookupEntry>();
  useFocusEffect(useCallback(() => () => setLookup(undefined), []));
  const [finishing, setFinishing] = useState(false);
  const [leavingStudy, setLeavingStudy] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const [canLeaveWithoutSave, setCanLeaveWithoutSave] = useState(false);
  const [editingWorkbenchTab, setEditingWorkbenchTab] = useState<'mine' | 'notes'>();
  const [swipeBoundaryMessage, setSwipeBoundaryMessage] = useState<string>();
  const [taskInteractionActive, setTaskInteractionActive] = useState(false);
  const [seekInteractionActive, setSeekInteractionActive] = useState(false);
  const [cardTransitionActive, setCardTransitionActive] = useState(false);
  const [questionAudioPauseRequest, setQuestionAudioPauseRequest] = useState(0);
  const [recordingPreviewPauseRequest, setRecordingPreviewPauseRequest] = useState(0);
  const [dismissMediaControlsRequest, setDismissMediaControlsRequest] = useState(0);
  const [readyAudioItemId, setReadyAudioItemId] = useState<string>();
  const [listeningCheckpoint, setListeningCheckpoint] = useState<LearningRecord>();
  const finishInFlight = useRef(false);
  const cardTransitionInFlight = useRef(false);
  const annotationExitGuard = useRef<(() => Promise<boolean>) | undefined>(undefined);
  const exitAnnotationManagement = useCallback(() => annotationExitGuard.current?.() ?? Promise.resolve(true), []);
  const workbenchRef = useRef<StudyWorkbenchHandle>(null);
  const workbenchFeedbackCacheRef = useRef<StudyWorkbenchFeedbackCache | undefined>(undefined);
  const bodyScrollRef = useRef<ScrollView>(null);
  const questionOffsetX = useSharedValue(0);
  const item = session.item;
  const card = item?.card;
  const dataset = item?.dataset;
  const category = item?.category;
  const topic = item?.topic;
  const reviewRelease = contentReleaseOf(topic) ?? contentReleaseOf(dataset);
  const totalItems = session.items.length;
  const vercelLegacyWeb = false;
  const entitlement = useSyncExternalStore(subscribeCommerceEntitlementChanges, getCommerceEntitlementSnapshot, getCommerceEntitlementSnapshot);
  const publicCard = item && getEmbeddedQuestionBanks().find((bank) => bank.id === item.dataset.id)?.categories.find((group) => group.id === item.category.id)?.topics.find((group) => group.id === item.topic.id)?.cards.some((entry) => entry.id === item.card.id);
  const membership = entitlement?.snapshot?.membership;
  const historyContentAllowed = !session.historyRecord || Boolean(publicCard || membership?.active);
  const listeningExamRange = useMemo(() => resolveListeningExamRange(props.studyPackage), [props.studyPackage]);
  const examMode = session.examMode;
  const listeningExamActive = examMode;
  const lookupAllowed = !examMode && historyContentAllowed;
  useEffect(() => { if (!lookupAllowed) setLookup(undefined); }, [lookupAllowed]);
  const listeningReviewActive = false;
  const listeningSegmentNavigationActive = false;
  const navigationStartIndex = 0;
  const navigationEndIndex = totalItems - 1;
  const navigationItemCount = totalItems;
  const navigationCurrentIndex = session.currentIndex;
  const forceListeningReveal = false;
  const sessionCards = useMemo(() => session.items.map((entry) => entry.card), [session.items]);
  const imageCard = card?.kind === 'image';
  const availableTutorialSteps = session.hydrated && card && dataset && !examMode && !session.historyRecord ? [
    ...(card.audio ? ['study-play'] : []),
    ...(!imageCard ? ['study-reveal'] : []),
    ...(!imageCard && dataset.study.tools.highlights ? ['study-highlight'] : []),
    ...(!imageCard && dataset.study.tools.tags ? ['study-tag'] : []),
    ...(session.behavior.workbenchTabs.includes('notes') ? ['study-note'] : []),
    ...(!imageCard && dataset.study.tools.dictionary && card.audioText ? ['study-lookup', 'study-favorite'] : []),
    ...(session.behavior.workbenchTabs.includes('mine') ? ['study-record', 'study-review'] : []),
  ].join(',') : '';
  const offerGuide = guide?.offer;
  useEffect(() => { if (availableTutorialSteps) offerGuide?.('study', availableTutorialSteps.split(',')); }, [availableTutorialSteps, offerGuide]);
  const audioAsset = useQuestionBankAsset(historyContentAllowed ? card?.audio : undefined);
  useQuestionBankAudioPreload(
    sessionCards,
    session.currentIndex,
    Platform.OS === 'web' && readyAudioItemId === item?.id,
  );
  const target = item && card && !imageCard ? {
    bankId: item.dataset.id,
    categoryId: item.category.id,
    topicId: item.topic.id,
    cardId: card.id,
  } : undefined;
  const annotations = useQuestionAnnotations(target);
  useEffect(() => { if (annotations.hydrated && !annotations.loadErrorMessage && !initialAnnotations.current) initialAnnotations.current = JSON.parse(JSON.stringify(annotations.store)); }, [annotations.hydrated, annotations.loadErrorMessage, annotations.store]);
  useEffect(() => {
    if (!guiding || !session.hydrated || !tutorialStep || tutorialStep === 'play' || tutorialStep === 'reveal' || tutorialStep === 'favorite') return;
    revealForTutorial(true);
    setTutorialTool(undefined);
    setLookup(undefined);
    setEditingWorkbenchTab(undefined);
    Keyboard.dismiss();
    if (tutorialStep === 'note') setTutorialTab('notes');
    if (tutorialStep === 'record' || tutorialStep === 'review') setTutorialTab('mine');
  }, [guiding, session.hydrated, tutorialStep, revealForTutorial, setTutorialTool, setTutorialTab]);
  useEffect(() => {
    if (tutorial && session.historyRecord && session.hydrated) revealForTutorial(true);
  }, [tutorial, session.historyRecord, session.hydrated, revealForTutorial]);
  const flushAnnotationSaves = annotations.flushPendingSaves;
  const navigateAfterStudy = useCallback(() => {
    if (guideCurrent === 'study') pauseGuide?.();
    if (onReturn) {
      onReturn();
      return;
    }
    if (router.canGoBack()) {
      // This resumes a prevented swipe after saving. It must not be swallowed
      // by the transition/tap gate; leavingStudy dispatches it only once.
      exitRouter.back();
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
    else router.replace('/(tabs)');
  }, [dataset, exitRouter, onReturn, returnHref, returnTo, router, guideCurrent, pauseGuide]);

  usePreventRemove(!leavingStudy && (!session.report || Boolean(onReturn && session.historyRecord)), () => { void leaveStudy(); });

  const exitDispatched = useRef(false);
  useEffect(() => {
    if (!leavingStudy || exitDispatched.current) return;
    exitDispatched.current = true;
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
    setListeningCheckpoint(undefined);
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

  async function submitListening() {
    if (finishInFlight.current || taskInteractionActive || cardTransitionInFlight.current) return;
    finishInFlight.current = true; setFinishing(true); setFinishError(undefined);
    setCanLeaveWithoutSave(false);
    setQuestionAudioPauseRequest((request) => request + 1);
    try {
      const result = await session.saveListeningResult();
      if (!result) throw new Error('listening_not_ready');
      if (listeningExamRange?.endIndex === totalItems - 1) await session.finish('complete');
      else setListeningCheckpoint(result);
    } catch { setFinishError('成绩暂未保存，请重试。'); setCanLeaveWithoutSave(true); }
    finally { finishInFlight.current = false; setFinishing(false); }
  }

  const handleBodyScrollBegin = useCallback(() => {
    finishWorkbenchEditing();
    setDismissMediaControlsRequest((request) => request + 1);
  }, [finishWorkbenchEditing]);

  const handleQuestionPlaybackStart = useCallback(() => {
    if (guiding) tutorial?.event('play');
    setRecordingPreviewPauseRequest((request) => request + 1);
  }, [guiding, tutorial]);

  const handleQuestionManualPlay = useCallback(() => {
    if (!vercelLegacyWeb || props.studyPackage?.progressMode === 'session-only' || !item) return;
    session.markCompleted(item.id);
  }, [item, props.studyPackage?.progressMode, session, vercelLegacyWeb]);

  const handleRecordingPreviewStart = useCallback(() => {
    setQuestionAudioPauseRequest((request) => request + 1);
  }, []);

  const handleRecordingIntent = useCallback(() => {
    trackProductClick('record');
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
    if (examMode && index !== session.currentIndex + 1) return false;
    if (index < 0 || index >= totalItems) return false;
    if (!await exitAnnotationManagement()) return false;
    if (taskInteractionActive || finishInFlight.current || cardTransitionInFlight.current) return false;
    cardTransitionInFlight.current = true;
    setCardTransitionActive(true);
    finishWorkbenchEditing();
    try {
      if (!await flushAnnotationSaves()) {
        setFinishError('笔记或标注保存失败，请重试。');
        setCanLeaveWithoutSave(true);
        resetQuestionOffset();
        finishCardTransition();
        return false;
      }
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
  }, [animateCardChange, examMode, exitAnnotationManagement, flushAnnotationSaves, finishCardTransition, finishWorkbenchEditing, questionOffsetX, reduceMotion, resetQuestionOffset, session, taskInteractionActive, totalItems]);

  const collapseWorkbench = useCallback(async () => {
    if (!await exitAnnotationManagement()) return false;
    if (finishInFlight.current || cardTransitionInFlight.current) return false;
    cardTransitionInFlight.current = true;
    setCardTransitionActive(true);
    finishWorkbenchEditing();
    try {
      if (!await flushAnnotationSaves()) {
        setFinishError('笔记或标注保存失败，请重试。');
        setCanLeaveWithoutSave(true);
        return;
      }
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
  }, [exitAnnotationManagement, finishCardTransition, finishWorkbenchEditing, flushAnnotationSaves, session]);

  const toggleAnswers = useCallback(() => {
    if (session.revealed) {
      void collapseWorkbench();
      return;
    }
    finishWorkbenchEditing();
    session.toggleAnswers();
    if (guiding) tutorial?.event('reveal');
  }, [collapseWorkbench, finishWorkbenchEditing, session, guiding, tutorial]);

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

  const questionSwipeEnabled = !examMode && !managingAnnotations && !editingWorkbenchTab
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
      // Reserve the left edge for the native interactive back gesture.
      .hitSlop({ left: -24 })
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
      return new Set(session.items.flatMap((entry, index) => {
        const state = session.states[entry.id];
        return state?.selectedChoiceIndex !== undefined || state?.recorded || session.answers[entry.id]?.trim() ? [index] : [];
      }));
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
  }, [listeningExamRange, listeningSegmentNavigationActive, session.answers, session.historyReview, session.items, session.states, session.visitedIndexes, vercelLegacyWeb]);
  const answerCardMarkedLabel = listeningSegmentNavigationActive || session.historyRecord ? '已答' : '已学';
  const answerCardResults = useMemo(() => {
    if (examMode) return undefined;
    return session.items.map((entry) => {
      const selected = session.states[entry.id]?.selectedChoiceIndex;
      const correct = entry.card.correctChoiceIndex;
      if (entry.dataset.id !== 'listening' || selected === undefined || correct === undefined) return undefined;
      return selected === correct ? 'correct' as const : 'incorrect' as const;
    });
  }, [examMode, session.items, session.states]);
  const answerCardTagColors = useMemo(() => session.items.map((entry) => {
    const key = questionBankCardTargetKey({ bankId: entry.dataset.id, categoryId: entry.category.id, topicId: entry.topic.id, cardId: entry.card.id });
    return (annotations.store.entries[key]?.tagIds ?? []).flatMap((id) => {
      const definition = annotations.tagDefinitions.find((tag) => tag.id === id);
      return definition ? [annotationToneColors[definition.color]] : [];
    });
  }), [annotations.store.entries, annotations.tagDefinitions, session.items]);
  const answerCardUnmarkedLabel = listeningSegmentNavigationActive || session.historyRecord ? '未答' : '未学';
  const lookupInteraction = resolveWordLookupInteraction(Platform.OS, session.toolMode);
  const dictionaryMode = lookupInteraction === 'tap';
  const annotationMode = session.toolMode === 'highlight' || session.toolMode === 'tags'
    ? session.toolMode
    : undefined;
  const annotationPanelWidth = Math.min(viewportWidth - spacing[10], 390);
  const annotationPanelLeft = Math.max(spacing[5], (viewportWidth - annotationPanelWidth) / 2);

  function lookupWord(word: string) {
    trackProductClick('dictionary');
    if (!lookupAllowed) return;
    const entry = findStaticWordLookup(word);
    if (entry) { sessionWords.current.add(entry.word); setLookup(entry); if (guiding) tutorial?.event('lookup'); }
  }

  async function changeToolMode(mode: 'dictionary' | 'highlight' | 'tags' | undefined) {
    if (!await exitAnnotationManagement()) return;
    finishWorkbenchEditing();
    session.setToolMode(mode);
  }

  function toggleHighlight(value: { blockId: AnnotationTextBlockId; wordIndex: number; quote: string; sentence: string; sourceText: string }) {
    if (!item || managingAnnotations || !annotations.highlightDefinitions.some((entry) => entry.id === activeHighlightId)) return;
    session.markCompleted(item.id);
    void annotations.toggleHighlight({ ...value, colorId: activeHighlightId }).then(saved => { if (saved && guiding) tutorial?.event('highlight'); });
  }

  function applyHighlightRange(value: { action: 'apply' | 'remove'; blockId: AnnotationTextBlockId; endWordIndex: number; sourceText: string; startWordIndex: number }) {
    if (!item || managingAnnotations || !annotations.highlightDefinitions.some((entry) => entry.id === activeHighlightId)) return;
    session.markCompleted(item.id);
    void annotations.applyHighlightRange({ ...value, colorId: activeHighlightId }).then(saved => { if (saved && guiding && value.action === 'apply') tutorial?.event('highlight'); });
  }

  async function sessionAnnotationMetrics() {
    const current = await readAnnotationStore();
    const targetKeys = new Set(Array.from(session.visitedIndexes).flatMap((index) => {
      const visited = session.items[index];
      return visited ? [questionBankCardTargetKey({
        bankId: visited.dataset.id,
        categoryId: visited.category.id,
        topicId: visited.topic.id,
        cardId: visited.card.id,
      })] : [];
    }));
    const entries = Object.values(current.entries).filter((entry) => targetKeys.has(questionBankCardTargetKey(entry)));
    return {
      sessionRecap: {
        annotatedCardIds: guiding ? entries.filter(entry => entry.note.trim() || entry.tagIds.length || entry.highlights.length).map(entry => entry.cardId) : initialAnnotations.current ? annotatedThisSession(initialAnnotations.current, current, session.items.filter((_entry, index) => session.visitedIndexes.has(index))) : [],
        words: [...sessionWords.current].map(word => ({ word, favorited: (guiding || sessionFavorites.current.has(word)) && wordFavorites.isFavorite({word}) })),
      },
      annotationCount: entries.reduce((count, entry) => count + entry.tagIds.length + entry.highlights.length, 0),
      noteCount: entries.filter((entry) => entry.note.trim()).length,
    };
  }

  async function leaveStudy() {
    if (!await exitAnnotationManagement()) return;
    if (!session.hydrated || session.loadError || !session.items.length) { setLeavingStudy(true); return; }
    if (examMode && session.hydrated && !session.loadError && session.items.length) { await finish('abort'); return; }
    if (taskInteractionActive) {
      setFinishError('录音正在保存，请稍候再返回。');
      return;
    }
    if (finishInFlight.current || cardTransitionInFlight.current) return;
    finishInFlight.current = true;
    setFinishing(true);
    setFinishError(undefined);
    setCanLeaveWithoutSave(false);
    finishWorkbenchEditing();
    try {
      if (!await flushAnnotationSaves()) {
        setFinishError('笔记或标注保存失败，请重试。');
        setCanLeaveWithoutSave(true);
        return;
      }
      const saved = await (workbenchRef.current?.flushAutoSave() ?? Promise.resolve(true));
      if (!saved) {
        setFinishError('回答自动保存失败，请重试后返回。');
        setCanLeaveWithoutSave(true);
        return;
      }
      setQuestionAudioPauseRequest((request) => request + 1);
      setRecordingPreviewPauseRequest((request) => request + 1);
      setDismissMediaControlsRequest((request) => request + 1);
      await session.finish('abort', await sessionAnnotationMetrics());
      setLeavingStudy(true);
    } catch {
      setFinishError('学习记录保存失败，内容仍保留在当前页面，请重试。');
      setCanLeaveWithoutSave(true);
    } finally {
      finishInFlight.current = false;
      setFinishing(false);
    }
  }


  function confirmExitWithoutSave() {
    if (!canLeaveWithoutSave || finishInFlight.current || taskInteractionActive) return;
    Alert.alert('仍然返回？', '尚未保存的本次作答可能丢失，已保存的学习记录不受影响。', [
      { text: '继续保存', style: 'cancel' },
      { text: '仍然返回', style: 'destructive', onPress: () => { setLeavingStudy(true); } },
    ]);
  }

  async function openCorrectionFeedback() {
    if (!await exitAnnotationManagement()) return;
    if (examMode) return;
    if (!item || taskInteractionActive || finishInFlight.current || cardTransitionInFlight.current) return;
    const sourceRelease = contentReleaseOf(item.topic) ?? contentReleaseOf(item.dataset);
    finishInFlight.current = true;
    setFinishError(undefined);
    finishWorkbenchEditing();
    try {
      if (!await flushAnnotationSaves()) {
        setFinishError('笔记或标注保存失败，请重试。');
        setCanLeaveWithoutSave(true);
        return;
      }
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
          ...(sourceRelease ? { bankVersion: String(sourceRelease.version), bankChecksum: sourceRelease.checksum } : {}),
        },
      });
    } catch {
      setFinishError('回答自动保存失败，请重试后提交纠错。');
    } finally {
      finishInFlight.current = false;
    }
  }

  async function finish(reason: 'abort' | 'complete') {
    if (!await exitAnnotationManagement()) return;
    if (taskInteractionActive) {
      setFinishError('录音正在保存，请稍候再结束。');
      return;
    }
    if (finishInFlight.current || cardTransitionInFlight.current) return;
    finishInFlight.current = true;
    setFinishing(true);
    setFinishError(undefined);
    setCanLeaveWithoutSave(false);
    finishWorkbenchEditing();
    try {
      if (!await flushAnnotationSaves()) {
        setFinishError('笔记或标注保存失败，请重试。');
        setCanLeaveWithoutSave(true);
        return;
      }
      const saved = await (workbenchRef.current?.flushAutoSave() ?? Promise.resolve(true));
      if (!saved) {
        setFinishError('回答自动保存失败，请重试后继续。');
        setCanLeaveWithoutSave(true);
        return;
      }
      setQuestionAudioPauseRequest((request) => request + 1);
      setRecordingPreviewPauseRequest((request) => request + 1);
      setDismissMediaControlsRequest((request) => request + 1);
      const savedRecord = await session.finish(reason, await sessionAnnotationMetrics());
      if (savedRecord && guiding) tutorial?.finish(savedRecord.id);
      if (!savedRecord || session.historyRecord) setLeavingStudy(true);
    } catch {
      setFinishError('学习报告保存失败，请重试。');
      setCanLeaveWithoutSave(true);
    } finally {
      finishInFlight.current = false;
      setFinishing(false);
    }
  }

  if (session.report && !session.historyRecord) {
    return <StudyReport localReturn={Boolean(onReturn)} interaction={dataset?.study.interaction ?? 'speaking'} noteCount={session.report.noteCount ?? 0} onReturn={navigateAfterStudy} record={session.report} returnLabel={returnLabel} />;
  }
  if (listeningCheckpoint) return <StudyReport record={listeningCheckpoint} noteCount={0} interaction="choices" onReturn={navigateAfterStudy} busy={finishing} error={finishError} onExitWithoutSave={canLeaveWithoutSave ? confirmExitWithoutSave : undefined} onEnd={() => { void finish('abort'); }} onContinue={() => { if (!finishing && listeningExamRange) { session.goTo(listeningExamRange.endIndex + 1); setListeningCheckpoint(undefined); } }} />;
  if (!session.hydrated) return <SafeAreaView style={styles.state}><AppText variant="caption">正在恢复学习进度…</AppText><Button variant="secondary" onPress={() => { void leaveStudy(); }}>返回</Button></SafeAreaView>;
  if (session.loadError || !item || !card || !dataset || !category || !topic) return <SafeAreaView style={styles.state}><CenteredState actionLabel="重新加载" description={session.loadError ?? '当前题目不存在，请返回题库后重试。'} onAction={session.retryHydration} title="学习内容加载失败" tone="destructive" /><Button variant="secondary" onPress={() => { void leaveStudy(); }}>返回</Button></SafeAreaView>;

  const entry = annotations.entry ? { ...annotations.entry, highlights: annotations.entry.highlights.filter((highlight) => highlight.contentFingerprint === contentFingerprint(highlight.blockId === 'question' ? card.audioText ?? '' : card.referenceText ?? '')) } : undefined;
  const transcript = card.kind === 'image' ? null : (
    <TutorialTarget ids={['text', 'highlight']}><View style={styles.cardContent}>{session.toolMode === 'highlight' ? <GuideAnchor id="sentence-highlight-tool" /> : null}
      <View style={styles.sectionTitle}><Languages color={colors.mutedForeground} size={15} /><AppText variant="button">{session.behavior.transcriptLabel}</AppText></View>
      <InteractiveStudyText activeHighlightId={activeHighlightId} blockId="question" definitions={annotations.highlightDefinitions} dictionaryMode={dictionaryMode} highlightMode={!managingAnnotations && annotations.highlightDefinitions.some((definition) => definition.id === activeHighlightId) && session.toolMode === 'highlight'} highlights={entry?.highlights ?? []} isLookupAvailable={hasStaticWordLookup} lookupEnabled={lookupAllowed && dataset.study.tools.dictionary} lookupInteraction={lookupInteraction} onHighlight={toggleHighlight} onHighlightRange={applyHighlightRange} onLookup={lookupWord} text={card.audioText} />
      {card.audioTextZh ? <AppText style={styles.translation}>{card.audioTextZh}</AppText> : null}
    </View></TutorialTarget>
  );
  const referenceContent = card.kind === 'image' || dataset.id === 'listening' || !card.referenceText ? null : (
    <View style={styles.referenceContent}>
      <InteractiveStudyText activeHighlightId={activeHighlightId} blockId="reference" definitions={annotations.highlightDefinitions} dictionaryMode={dictionaryMode} highlightMode={!managingAnnotations && annotations.highlightDefinitions.some((definition) => definition.id === activeHighlightId) && session.toolMode === 'highlight'} highlights={entry?.highlights ?? []} isLookupAvailable={hasStaticWordLookup} lookupEnabled={lookupAllowed && dataset.study.tools.dictionary} lookupInteraction={lookupInteraction} onHighlight={toggleHighlight} onHighlightRange={applyHighlightRange} onLookup={lookupWord} text={card.referenceText} />
      {card.referenceTextZh ? <AppText style={styles.translation}>{card.referenceTextZh}</AppText> : null}
    </View>
  );
  const integratedRecordingLayout = session.behavior.taskKind === 'recording';
  const taskContent = (
    <StudyTaskRenderer
      examMode={examMode}
      behavior={session.behavior}
      blockedExternalGesture={questionSwipeGesture}
      card={card}
      interactionGesture={recordingInteractionGesture}
      isLookupAvailable={hasStaticWordLookup}
      key={item.id}
      lookupInteraction={lookupInteraction}
      onChoose={(choiceIndex) => session.chooseOption(choiceIndex, !listeningExamActive)}
      onLookupWord={lookupAllowed ? lookupWord : undefined}
      onClearRecording={session.clearRecording}
      onInteractionChange={setTaskInteractionActive}
      onPreviewPlaybackStart={handleRecordingPreviewStart}
      onRecorded={(recording) => { session.recordAnswer(recording); if (guiding) tutorial?.event('record'); setNewRecording({ cardKey: item.id, token: recording.id }); }}
      onRecordingIntent={handleRecordingIntent}
      previewPauseRequest={recordingPreviewPauseRequest}
      recording={session.recording}
      choiceReadOnly={listeningReviewActive}
      revealed={session.revealed || forceListeningReveal}
      selectedChoiceIndex={session.cardState?.selectedChoiceIndex}
      sessionId={session.sessionId}
      variant={integratedRecordingLayout ? 'integrated' : 'default'}
    />
  );
  const atNavigationEnd = session.currentIndex === navigationEndIndex;
  const atListeningSubmission = examMode && session.currentIndex === listeningExamRange?.endIndex;
  const footerPrimaryLabel = atListeningSubmission ? '提交听力' : !atNavigationEnd ? '下一题' : '完成';
  function handleFooterPrimary() {
    if (atListeningSubmission) { void submitListening(); return; }
    if (!atNavigationEnd) { void goToCard(session.currentIndex + 1, 1); return; }
    void finish('complete');
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <AppContentFrame style={styles.contentFrame}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel={returnLabel ?? (returnTo === 'radio' ? '返回随身听' : returnTo === 'annotations' ? '返回我的标注' : '返回题库目录')} disabled={finishing || taskInteractionActive} onPress={() => void leaveStudy()} style={({ pressed }) => [returnTo === 'radio' ? styles.returnToRadioButton : styles.circleButton, pressed ? styles.topBarPressed : null]}><ChevronLeft color={colors.foreground} size={21} />{returnTo === 'radio' ? <AppText variant="button">返回随身听</AppText> : null}</Pressable>
        <View style={styles.topSpacer} />
        {!examMode && historyContentAllowed ? <Pressable accessibilityLabel="纠正当前题目内容" disabled={finishing || taskInteractionActive || cardTransitionActive} hitSlop={5} onPress={() => void openCorrectionFeedback()} style={({ pressed }) => [styles.correctionButton, pressed ? styles.counterPressed : null]}><Flag color={colors.mutedForeground} size={13} /><AppText color={colors.mutedForeground} variant="micro">纠错</AppText></Pressable> : null}
        <Pressable accessibilityLabel={examMode ? "当前题号" : "打开答题卡"} disabled={examMode || taskInteractionActive} onPress={() => { finishWorkbenchEditing(); setAnswerCardVisible(true); }} style={({ pressed }) => [styles.counterButton, pressed ? styles.counterPressed : null]}>{!examMode ? <Grid3X3 color={colors.mutedForeground} size={15} /> : null}<AppText style={styles.counter} variant="button">{navigationCurrentIndex + 1} / {navigationItemCount}</AppText></Pressable>
      </View>
      <TutorialCoach ready={Boolean(guiding && ((tutorialStep === 'reveal' && session.revealed) || (tutorialStep === 'highlight' && annotations.entry?.highlights.length) || (tutorialStep === 'tag' && annotations.entry?.tagIds.length) || (tutorialStep === 'note' && annotations.entry?.note.trim()) || (tutorialStep === 'favorite' && lookup && wordFavorites.isFavorite({ word: lookup.word }))))} />
      {connectivity === 'offline' ? <View style={styles.offline}><WifiOff color={colors.mutedForeground} size={15} /><AppText style={styles.offlineCopy} variant="micro">当前处于离线状态；文字学习和本机标注仍可使用。</AppText></View> : null}

      {!imageCard && !listeningExamActive && historyContentAllowed ? <View testID="annotation-panel-anchor" onLayout={({ nativeEvent }) => setAnnotationPanelTop(nativeEvent.layout.y + nativeEvent.layout.height)} style={styles.tools}>
        <TutorialTarget ids={['answer', 'highlight', 'tag']}><AnnotationToolbar activeHighlightId={activeHighlightId} dictionaryMode={dictionaryMode} highlightDefinitions={annotations.highlightDefinitions} highlightMode={session.toolMode === 'highlight'} leading={listeningReviewActive ? undefined : <Pressable accessibilityLabel={session.revealed ? '收起答案' : '显示答案'} onPress={toggleAnswers} style={({ pressed }) => [styles.answerTool, session.revealed ? styles.toolActive : null, pressed ? styles.toolPressed : null]}><GuideAnchor id="sentence-answer" /><Check color={session.revealed ? colors.primary : colors.mutedForeground} size={14} /><AppText color={session.revealed ? colors.primary : colors.mutedForeground} variant="caption">答案</AppText></Pressable>} onCreateHighlight={(label, color) => { finishWorkbenchEditing(); void annotations.addHighlightDefinition(label, color); }} onCreateTag={(label, color) => { finishWorkbenchEditing(); void annotations.addTagDefinition(label, color); }} onDictionaryModeChange={(value) => { void changeToolMode(value ? 'dictionary' : undefined); }} onHighlightChange={(value) => { finishWorkbenchEditing(); setActiveHighlightId(value); }} onHighlightModeChange={(value) => { void changeToolMode(value ? 'highlight' : undefined); }} onTagModeChange={(value) => { void changeToolMode(value ? 'tags' : undefined); }} onTagToggle={(id) => { finishWorkbenchEditing(); void Promise.resolve(annotations.toggleTag(id)).then(saved => { if (saved && guiding) tutorial?.event('tag'); }); }} resetToken={item.id} selectedTags={entry?.tagIds ?? []} showDictionary={showsWordLookupModeToggle(Platform.OS) && dataset.study.tools.dictionary} showHighlights={dataset.study.tools.highlights} showTags={dataset.study.tools.tags} tagDefinitions={annotations.tagDefinitions} tagMode={session.toolMode === 'tags'} /></TutorialTarget>
      </View> : null}

      {!imageCard && !listeningExamActive && historyContentAllowed && annotationPanelTop !== undefined ? (
        <AnnotationFloatingPanel
          onManagingChange={setManagingAnnotations}
          exitGuardRef={annotationExitGuard}
          onSaveDefinition={annotations.saveDefinition}
          onDeleteDefinition={async (kind, id) => { const saved = await annotations.deleteDefinition(kind, id); if (saved && kind === 'highlight' && activeHighlightId === id) setActiveHighlightId(''); return saved; }}
          definitionUsage={(kind, id) => Object.values(annotations.store.entries).filter((entry) => kind === 'tag' ? entry.tagIds.includes(id) : entry.highlights.some((highlight) => highlight.colorId === id)).length}
          activeHighlightId={activeHighlightId}
          highlightDefinitions={annotations.highlightDefinitions}
          left={annotationPanelLeft}
          mode={annotationMode}
          onCreateHighlight={(label, color) => { finishWorkbenchEditing(); void annotations.addHighlightDefinition(label, color); }}
          onCreateTag={(label, color) => { finishWorkbenchEditing(); void annotations.addTagDefinition(label, color); }}
          onHighlightChange={(value) => { finishWorkbenchEditing(); setActiveHighlightId(value); }}
          onTagToggle={(id) => { finishWorkbenchEditing(); void Promise.resolve(annotations.toggleTag(id)).then(saved => { if (saved && guiding) tutorial?.event('tag'); }); }}
          resetToken={item.id}
          selectedTags={entry?.tagIds ?? []}
          tagDefinitions={annotations.tagDefinitions}
          top={annotationPanelTop}
          width={annotationPanelWidth}
        />
      ) : null}

      <GestureDetector gesture={questionSwipeGesture}>
        <Animated.View style={[styles.bodyGesture, questionBodyAnimatedStyle]}>
          <GuideScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.bodyContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" onScrollBeginDrag={handleBodyScrollBegin} scrollEventThrottle={16} ref={bodyScrollRef} showsVerticalScrollIndicator={false} style={styles.body} testID="study-body-scroll">
            {historyContentAllowed ? item.materials?.map((material) => (
              <ImageQuestionCard key={material.id} imageAlt={material.imageAlt} imagePath={material.image} />
            )) : null}
            {!historyContentAllowed ? <View style={styles.historySummary}><AppText variant="caption">会员到期后，题目与参考内容暂不可查看；你的回答和学习资料仍保留。</AppText><StudyHistoryPersonalContent answer={session.answerText} selectedChoiceIndex={session.cardState?.selectedChoiceIndex} recorded={session.cardState?.recorded} feedback={session.historyRecord?.studyFeedback?.[item.id]} note={entry?.note} tags={entry?.tagIds} definitions={annotations.tagDefinitions} /></View> : card.kind === 'image' ? (
              <ImageQuestionCard imageAlt={card.imageAlt} imagePath={card.image} onDisplayed={() => session.markCompleted(item.id)} />
            ) : (
              <StudyCardStack onCollapse={() => { if (!listeningExamActive && !listeningReviewActive && historyContentAllowed) void collapseWorkbench(); }} onReveal={() => { if (!listeningExamActive && !listeningReviewActive && historyContentAllowed) session.revealCurrent(true); }} primary={<TutorialTarget ids={['audio']}><View style={styles.primaryContent}>{examMode || (session.behavior.generatedAudio && !card.audio) ? <ExamQuestionAudio exam={examMode} autoPlay={true} questionId={card.id} key={item.id} uri={audioAsset.uri} text={!card.audio && session.behavior.generatedAudio ? card.audioText : undefined} label={card.taskTitle} resolving={audioAsset.resolving} onRetry={audioAsset.retry} pauseRequest={questionAudioPauseRequest} onPlaybackStart={handleQuestionPlaybackStart} practiceControls={integratedRecordingLayout ? taskContent : undefined} /> : <StudyAudioPlayer autoPlayRequest={guiding ? 0 : session.playRequestToken} blockedExternalGesture={questionSwipeGesture} dismissControlsRequest={dismissMediaControlsRequest} durationHint={Platform.OS === 'web' ? card.audioDurationSeconds : undefined} generatedAudio={session.behavior.generatedAudio && !card.audio} label={card.taskTitle} onManualPlay={handleQuestionManualPlay} onPlaybackStart={handleQuestionPlaybackStart} onReady={Platform.OS === 'web' ? () => setReadyAudioItemId(item.id) : undefined} onRetry={audioAsset.retry} onSeekInteractionChange={setSeekInteractionActive} pauseRequest={questionAudioPauseRequest} playbackKey={item.id} practiceControls={integratedRecordingLayout ? taskContent : undefined} resolving={audioAsset.resolving} tagColors={selectedTagColors} uri={audioAsset.uri} variant={integratedRecordingLayout ? 'integrated-recording' : 'default'} />}{integratedRecordingLayout ? null : <><View style={styles.divider} />{taskContent}</>}</View></TutorialTarget>} revealed={session.revealed || forceListeningReveal} transcript={transcript} workbench={examMode ? null : <TutorialTarget ids={['workbench']}><StudyWorkbench newRecordingToken={newRecording?.cardKey === item.id ? newRecording.token : undefined} reviewSource={reviewRelease && (dataset.id === 'radiotelephony' || dataset.id === 'storytelling' || dataset.id === 'opi') ? { ...reviewRelease, bankId: dataset.id, categoryId: category.id, topicId: topic.id } : undefined} feedbackCacheRef={workbenchFeedbackCacheRef} initialFeedback={session.historyRecord?.studyFeedback?.[item.id]} onBeforeAiOperation={session.saveCheckpoint} ref={workbenchRef} activeTab={session.activeTab} answerText={session.answerText} bankId={dataset.id} bankTitle={dataset.title} cardKey={item.id} categoryTitle={category.name} editingTab={editingWorkbenchTab} noteText={entry?.note ?? ''} onAnswerChange={session.updateAnswer} onEditingTabChange={(tab) => { setEditingWorkbenchTab(tab); if (!tab && editingWorkbenchTab === 'notes' && guiding) void annotations.flushPendingSaves().then(saved => { if (saved && annotations.entry?.note.trim()) tutorial?.event('note'); }); }} onFeedback={() => { session.markFeedback(); if (guiding) tutorial?.event('review'); }} onNoteChange={async (note) => { const saved = Boolean(await annotations.saveNote(note)); return saved; }} onRetrySave={() => { void annotations.retrySave(); }} onTabChange={session.setActiveTab} persistAiResult={props.studyPackage?.progressMode !== 'session-only'} questionText={card.audioText} recordingUri={session.recording?.uri} referenceContent={referenceContent} referenceLabel={session.behavior.referenceLabel} reviewKind={session.behavior.reviewKind} saveError={annotations.saveErrorMessage} sessionId={session.sessionId} sessionStartedAt={session.sessionStartedAt} sourceCardId={card.id} swipeGesture={workbenchSwipeGesture} tabs={session.behavior.workbenchTabs} topicTitle={topic.name} /></TutorialTarget>} />
            )}
          </GuideScrollView>
          {swipeBoundaryMessage ? <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.swipeBoundary}><AppText variant="micro">{swipeBoundaryMessage}</AppText></View> : null}
        </Animated.View>
      </GestureDetector>

      <View style={[styles.footerShell, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
        {finishError ? <AppText color={colors.destructive} style={styles.finishError} variant="caption">{finishError}</AppText> : null}
        {finishError && canLeaveWithoutSave ? <Button disabled={finishing || taskInteractionActive} onPress={confirmExitWithoutSave} size="sm" variant="ghost">仍然返回</Button> : null}
        <View style={styles.footer}>
          <TutorialTarget ids={['finish']}><Button disabled={finishing || taskInteractionActive || cardTransitionActive} leading={<Flag color={colors.foreground} size={18} />} onPress={() => void finish('abort')} size="sm" style={styles.footerFinish} testID="study-footer-finish" variant="outline">{finishing ? '保存中…' : '结束'}</Button></TutorialTarget>
          {!examMode ? <Button disabled={finishing || taskInteractionActive || cardTransitionActive || session.currentIndex === navigationStartIndex} leading={<ChevronLeft color={colors.foreground} size={20} />} onPress={() => { void goToCard(session.currentIndex - 1, -1); }} size="sm" style={styles.footerPrevious} testID="study-footer-previous" variant="outline">上一题</Button> : null}
          <Button accessibilityLabel={footerPrimaryLabel} disabled={finishing || taskInteractionActive || cardTransitionActive} onPress={handleFooterPrimary} size="sm" style={styles.footerPrimary} testID="study-footer-next">{finishing ? '生成中…' : footerPrimaryLabel} <ChevronRight color={colors.primaryForeground} size={20} /></Button>
        </View>
      </View>
      </AppContentFrame>

      <AnswerCardSheet results={answerCardResults} tagColors={answerCardTagColors} current={navigationCurrentIndex} marked={answerCardMarked} markedLabel={answerCardMarkedLabel} onClose={() => setAnswerCardVisible(false)} onSelect={(index) => { void goToCard(navigationStartIndex + index).then((changed) => { if (changed) setAnswerCardVisible(false); }); }} total={navigationItemCount} unmarkedLabel={answerCardUnmarkedLabel} visible={!examMode && answerCardVisible} />
      <BottomSheet accessibilityLabel="查词结果" onClose={() => setLookup(undefined)} scrollable={false} visible={lookupAllowed && Boolean(lookup)}>
        <View style={styles.sheetContent}>
          <View style={styles.lookupTitleRow}>
            <AppText style={styles.lookupTitle} variant="pageTitle">{lookup?.word}</AppText>
            {lookupAllowed && lookup ? <LookupPronunciation key={lookup.word} word={lookup.word} /> : null}
            {lookupAllowed && lookup ? (
              <TutorialTarget ids={['favorite']}><Pressable
                accessibilityLabel={wordFavorites.isFavorite({ word: lookup.word }) ? '取消收藏' : '收藏'}
                accessibilityRole="button"
                hitSlop={8}
                disabled={favoriteSave.saving || favoriteSave.failed || wordFavorites.ready === false || wordFavorites.error}
                onPress={() => { const word = lookup.word; const wasFavorite = wordFavorites.isFavorite({word}); void favoriteSave.run(async () => { await wordFavorites.toggleFavorite({word}); if (!wasFavorite) sessionFavorites.current.add(word); }, () => { if (!wasFavorite && guiding) { tutorial?.event('favorite'); setLookup(undefined); } }); }}
                style={({ pressed }) => [styles.lookupFavorite, pressed ? styles.lookupFavoritePressed : null]}
              >
                <Star
                  color={wordFavorites.isFavorite({ word: lookup.word }) ? colors.accent : colors.mutedForeground}
                  fill={wordFavorites.isFavorite({ word: lookup.word }) ? colors.accent : 'transparent'}
                  size={22}
                />
              </Pressable></TutorialTarget>
            ) : null}
          </View>
          {favoriteSave.panel()}
          {wordFavorites.error ? <View><AppText>收藏暂时无法读取，请重试后再修改收藏。</AppText><Button onPress={wordFavorites.retry}>重试读取收藏</Button></View> : null}
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
