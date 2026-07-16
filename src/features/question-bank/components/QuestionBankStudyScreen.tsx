import { usePreventRemove } from '@react-navigation/native';
import type { WordLookupResult } from '@icao/contracts';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, Flag, Grid3X3, Languages, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { AppText, BottomSheet, Button } from '@/components/ui';
import { colors, fonts, motion, radii, spacing } from '@/theme';
import { acceptAiConsent, hasAiConsent, wordLookup } from '@/features/ai/ai-client';

import { annotationToneColors } from '../annotations/colors';
import { useQuestionAnnotations } from '../annotations/use-question-annotations';
import type { AnnotationTextBlockId } from '../annotations/types';
import { useStudySession } from '../hooks/useStudySession';
import { useQuestionBankAsset } from '../hooks/useQuestionBankAsset';
import { getConnectivity, subscribeConnectivity, type Connectivity } from '../platform/network-service';
import type { QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';
import { boundedHorizontalSwipe } from '../lib/study-gestures';
import { AnnotationToolbar } from './AnnotationToolbar';
import { AnswerCardSheet } from './AnswerCardSheet';
import { InteractiveStudyText } from './InteractiveStudyText';
import { ImageQuestionCard } from './ImageQuestionCard';
import { StudyAudioPlayer } from './StudyAudioPlayer';
import { StudyCardStack } from './StudyCardStack';
import { StudyReport } from './StudyReport';
import { StudyTaskRenderer } from './StudyTaskRenderer';
import { StudyWorkbench, type StudyWorkbenchHandle } from './StudyWorkbench';

type LookupRequest = { word: string; sentence: string; blockLabel: string };
type Props = { dataset: QuestionBankDataset; category: QuestionBankCategory; topic: QuestionBankTopic; initialCardId?: string; returnTo?: 'annotations' | 'radio' };

export function QuestionBankStudyScreen({ dataset, category, topic, initialCardId, returnTo }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const session = useStudySession({ dataset, category, topic, initialCardId });
  const [answerCardVisible, setAnswerCardVisible] = useState(false);
  const [connectivity, setConnectivity] = useState<Connectivity>('unknown');
  const [activeHighlightId, setActiveHighlightId] = useState('green');
  const [lookup, setLookup] = useState<LookupRequest>();
  const [lookupResult, setLookupResult] = useState<WordLookupResult>();
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string>();
  const [aiConsented, setAiConsented] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [returningToRadio, setReturningToRadio] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const [editingWorkbenchTab, setEditingWorkbenchTab] = useState<'mine' | 'notes'>();
  const [swipeBoundaryMessage, setSwipeBoundaryMessage] = useState<string>();
  const [taskInteractionActive, setTaskInteractionActive] = useState(false);
  const [seekInteractionActive, setSeekInteractionActive] = useState(false);
  const [cardTransitionActive, setCardTransitionActive] = useState(false);
  const [questionAudioPauseRequest, setQuestionAudioPauseRequest] = useState(0);
  const [recordingPreviewPauseRequest, setRecordingPreviewPauseRequest] = useState(0);
  const [dismissMediaControlsRequest, setDismissMediaControlsRequest] = useState(0);
  const finishInFlight = useRef(false);
  const cardTransitionInFlight = useRef(false);
  const workbenchRef = useRef<StudyWorkbenchHandle>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const questionOffsetX = useSharedValue(0);
  const card = session.card;
  const recordingKey = session.recording?.id;
  const imageCard = card?.kind === 'image';
  const audioAsset = useQuestionBankAsset(card?.audio);
  const target = card && !imageCard ? { bankId: dataset.id, categoryId: category.id, topicId: topic.id, cardId: card.id } : undefined;
  const annotations = useQuestionAnnotations(target);

  usePreventRemove(!session.report && !returningToRadio, () => { void finish('abort', returnTo === 'radio'); });

  useEffect(() => {
    if (returningToRadio) router.replace('/content/radio');
  }, [returningToRadio, router]);

  useEffect(() => {
    let active = true;
    void getConnectivity().then((state) => { if (active) setConnectivity(state); });
    const unsubscribe = subscribeConnectivity(setConnectivity);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => { void hasAiConsent().then(setAiConsented); }, []);

  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ animated: false, y: 0 });
    setEditingWorkbenchTab(undefined);
    setTaskInteractionActive(false);
    setSeekInteractionActive(false);
    setDismissMediaControlsRequest((request) => request + 1);
    setSwipeBoundaryMessage(undefined);
    Keyboard.dismiss();
  }, [card?.id]);

  useEffect(() => {
    if (!swipeBoundaryMessage) return;
    const timeout = setTimeout(() => setSwipeBoundaryMessage(undefined), 1400);
    return () => clearTimeout(timeout);
  }, [swipeBoundaryMessage]);

  const finishWorkbenchEditing = useCallback(() => {
    setEditingWorkbenchTab(undefined);
    Keyboard.dismiss();
  }, []);

  const handleBodyScrollBegin = useCallback(() => {
    finishWorkbenchEditing();
    setDismissMediaControlsRequest((request) => request + 1);
  }, [finishWorkbenchEditing]);

  const handleQuestionPlaybackStart = useCallback(() => {
    setRecordingPreviewPauseRequest((request) => request + 1);
  }, []);

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
    if (index < 0 || index >= topic.cards.length) return false;
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
  }, [animateCardChange, finishCardTransition, finishWorkbenchEditing, questionOffsetX, reduceMotion, resetQuestionOffset, session, taskInteractionActive, topic.cards.length]);

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
    const result = boundedHorizontalSwipe(session.currentIndex, topic.cards.length, translationX, velocityX);
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
    void goToCard(result.index, result.direction).then((changed) => {
      if (!changed) resetQuestionOffset();
    });
  }, [finishWorkbenchEditing, goToCard, resetQuestionOffset, session.currentIndex, topic.cards.length]);

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
        const atFirstBoundary = session.currentIndex === 0 && translationX > 0;
        const atLastBoundary = session.currentIndex === topic.cards.length - 1 && translationX < 0;
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
  }, [activeWorkbenchTab, editingWorkbenchTab, handleQuestionSwipe, questionOffsetX, questionSwipeEnabled, session.currentIndex, session.toolMode, setActiveWorkbenchTab, topic.cards.length, workbenchTabs]);

  async function runLookup(request = lookup, alreadyConsented = aiConsented) {
    if (!request || !card) return;
    setLookupBusy(true);
    setLookupError(undefined);
    try {
      if (!alreadyConsented) {
        await acceptAiConsent();
        setAiConsented(true);
      }
      const module = dataset.id === 'sentences900' ? 'sentence900'
        : dataset.id === 'radiotelephony' ? 'atc'
          : dataset.id === 'storytelling' ? 'story'
            : dataset.id;
      setLookupResult(await wordLookup({ module, questionId: card.id, word: request.word, sentence: request.sentence }));
    } catch {
      setLookupError('AI 查词暂时失败，请检查网络后重试。');
    } finally {
      setLookupBusy(false);
    }
  }

  const selectedTagColors = useMemo(() => (annotations.entry?.tagIds ?? []).flatMap((id) => {
    const definition = annotations.tagDefinitions.find((item) => item.id === id);
    return definition ? [annotationToneColors[definition.color]] : [];
  }), [annotations.entry?.tagIds, annotations.tagDefinitions]);

  function lookupWord(blockLabel: string, value: { word: string; sentence: string }) {
    if (!value.word) return;
    const request = { ...value, blockLabel };
    setLookupResult(undefined);
    setLookupError(undefined);
    setLookup(request);
    if (aiConsented) {
      void runLookup(request, true);
      return;
    }
    void hasAiConsent().then((consented) => {
      setAiConsented(consented);
      if (consented) void runLookup(request, true);
    }).catch(() => setAiConsented(false));
  }

  function toggleHighlight(value: { blockId: AnnotationTextBlockId; wordIndex: number; quote: string; sentence: string; sourceText: string }) {
    if (!card) return;
    session.markCompleted(card.id);
    void annotations.toggleHighlight({ ...value, colorId: activeHighlightId });
  }

  function applyHighlightRange(value: { action: 'apply' | 'remove'; blockId: AnnotationTextBlockId; endWordIndex: number; sourceText: string; startWordIndex: number }) {
    if (!card) return;
    session.markCompleted(card.id);
    void annotations.applyHighlightRange({ ...value, colorId: activeHighlightId });
  }

  function sessionAnnotationMetrics() {
    const cardIds = new Set(Array.from(session.visitedIndexes).flatMap((index) => topic.cards[index]?.id ?? []));
    const entries = Object.values(annotations.store.entries).filter((entry) => entry.bankId === dataset.id && entry.categoryId === category.id && entry.topicId === topic.id && cardIds.has(entry.cardId));
    return {
      annotationCount: entries.reduce((count, entry) => count + entry.tagIds.length + entry.highlights.length, 0),
      noteCount: entries.filter((entry) => entry.note.trim()).length,
    };
  }

  async function finish(reason: 'abort' | 'complete', returnDirectlyToRadio = false) {
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
      if (returnDirectlyToRadio) setReturningToRadio(true);
    } catch {
      setFinishError('学习报告保存失败，请重试。');
    } finally {
      finishInFlight.current = false;
      setFinishing(false);
    }
  }

  if (session.report) {
    return <StudyReport interaction={dataset.study.interaction} noteCount={session.report.noteCount ?? 0} onReturn={() => returnTo === 'annotations' ? router.replace('/annotations') : returnTo === 'radio' ? router.replace('/content/radio') : router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: dataset.id } })} record={session.report} />;
  }
  if (!session.hydrated) return <SafeAreaView style={styles.state}><AppText variant="caption">正在恢复学习进度…</AppText></SafeAreaView>;
  if (session.loadError || !card) return <SafeAreaView style={styles.state}><CenteredState actionLabel="重新加载" description={session.loadError ?? '当前题目不存在，请返回题库后重试。'} onAction={session.retryHydration} title="学习内容加载失败" tone="destructive" /></SafeAreaView>;

  const entry = annotations.entry;
  const transcript = card.kind === 'image' ? null : (
    <View style={styles.cardContent}>
      <View style={styles.sectionTitle}><Languages color={colors.mutedForeground} size={15} /><AppText variant="button">{session.behavior.transcriptLabel}</AppText></View>
      <InteractiveStudyText activeHighlightId={activeHighlightId} blockId="question" definitions={annotations.highlightDefinitions} dictionaryMode={false} highlightMode={session.toolMode === 'highlight'} highlights={entry?.highlights ?? []} lookupEnabled={dataset.study.tools.dictionary} onHighlight={toggleHighlight} onHighlightRange={applyHighlightRange} onLookup={(value) => lookupWord(session.behavior.transcriptLabel, value)} text={card.audioText} />
      {card.audioTextZh ? <AppText style={styles.translation}>{card.audioTextZh}</AppText> : null}
    </View>
  );
  const referenceContent = card.kind === 'image' ? null : (
    <View style={styles.referenceContent}>
      {card.referenceText ? <InteractiveStudyText activeHighlightId={activeHighlightId} blockId="reference" definitions={annotations.highlightDefinitions} dictionaryMode={false} highlightMode={session.toolMode === 'highlight'} highlights={entry?.highlights ?? []} lookupEnabled={dataset.study.tools.dictionary} onHighlight={toggleHighlight} onHighlightRange={applyHighlightRange} onLookup={(value) => lookupWord(session.behavior.referenceLabel, value)} text={card.referenceText} /> : <AppText color={colors.mutedForeground}>暂无参考内容</AppText>}
      {card.referenceTextZh ? <AppText style={styles.translation}>{card.referenceTextZh}</AppText> : null}
    </View>
  );
  const integratedRecordingLayout = session.behavior.taskKind === 'recording';
  const taskContent = (
    <StudyTaskRenderer
      behavior={session.behavior}
      blockedExternalGesture={questionSwipeGesture}
      card={card}
      interactionGesture={recordingInteractionGesture}
      key={card.id}
      onChoose={session.chooseOption}
      onClearRecording={session.clearRecording}
      onInteractionChange={setTaskInteractionActive}
      onPreviewPlaybackStart={handleRecordingPreviewStart}
      onRecorded={session.recordAnswer}
      onRecordingIntent={handleRecordingIntent}
      previewPauseRequest={recordingPreviewPauseRequest}
      recording={session.recording}
      revealed={session.revealed}
      selectedChoiceIndex={session.cardState?.selectedChoiceIndex}
      sessionId={session.sessionId}
      variant={integratedRecordingLayout ? 'integrated' : 'default'}
    />
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel={returnTo === 'radio' ? '保存并返回随身听' : '结束学习并查看报告'} disabled={finishing || taskInteractionActive} onPress={() => void finish('abort', returnTo === 'radio')} style={returnTo === 'radio' ? styles.returnToRadioButton : styles.circleButton}><ChevronLeft color={colors.foreground} size={21} />{returnTo === 'radio' ? <AppText variant="button">返回随身听</AppText> : null}</Pressable>
        <View style={styles.topSpacer} />
        <Pressable accessibilityLabel="打开答题卡" disabled={taskInteractionActive} onPress={() => { finishWorkbenchEditing(); setAnswerCardVisible(true); }} style={styles.counterButton}><Grid3X3 color={colors.mutedForeground} size={15} /><AppText style={styles.counter} variant="button">{session.currentIndex + 1} / {topic.cards.length}</AppText></Pressable>
      </View>
      {connectivity === 'offline' ? <View style={styles.offline}><WifiOff color={colors.mutedForeground} size={15} /><AppText style={styles.offlineCopy} variant="micro">当前处于离线状态；文字学习和本机标注仍可使用。</AppText></View> : null}

      {!imageCard ? <View style={styles.tools}>
        <Pressable accessibilityLabel={session.revealed ? '收起答案' : '显示答案'} onPress={toggleAnswers} style={[styles.answerTool, session.revealed ? styles.toolActive : null]}><Check color={session.revealed ? colors.primary : colors.mutedForeground} size={14} /><AppText color={session.revealed ? colors.primary : colors.mutedForeground} variant="caption">答案</AppText></Pressable>
        <AnnotationToolbar activeHighlightId={activeHighlightId} dictionaryMode={false} highlightDefinitions={annotations.highlightDefinitions} highlightMode={session.toolMode === 'highlight'} onCreateHighlight={(label, color) => { finishWorkbenchEditing(); void annotations.addHighlightDefinition(label, color).then((id) => { if (id) setActiveHighlightId(id); }); }} onCreateTag={(label, color) => { finishWorkbenchEditing(); void annotations.addTagDefinition(label, color); }} onDictionaryModeChange={(value) => { finishWorkbenchEditing(); session.setToolMode(value ? 'dictionary' : undefined); }} onHighlightChange={(value) => { finishWorkbenchEditing(); setActiveHighlightId(value); }} onHighlightModeChange={(value) => { finishWorkbenchEditing(); session.setToolMode(value ? 'highlight' : undefined); }} onTagToggle={(id) => { finishWorkbenchEditing(); void annotations.toggleTag(id); }} resetToken={card.id} selectedTags={entry?.tagIds ?? []} showDictionary={false} showHighlights={dataset.study.tools.highlights} showTags={dataset.study.tools.tags} tagDefinitions={annotations.tagDefinitions} />
      </View> : null}

      <GestureDetector gesture={questionSwipeGesture}>
        <Animated.View style={[styles.bodyGesture, questionBodyAnimatedStyle]}>
          <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={styles.bodyContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" onScrollBeginDrag={handleBodyScrollBegin} ref={bodyScrollRef} showsVerticalScrollIndicator={false} style={styles.body} testID="study-body-scroll">
            {card.kind === 'image' ? (
              <ImageQuestionCard imageAlt={card.imageAlt} imagePath={card.image} onDisplayed={() => session.markCompleted(card.id)} />
            ) : (
              <StudyCardStack onCollapse={() => { void collapseWorkbench(); }} onReveal={() => session.revealCurrent(true)} primary={<View style={styles.primaryContent}><StudyAudioPlayer autoPlayRequest={session.playRequestToken} blockedExternalGesture={questionSwipeGesture} dismissControlsRequest={dismissMediaControlsRequest} generatedAudio={session.behavior.generatedAudio && !card.audio} label={card.taskTitle} onPlaybackStart={handleQuestionPlaybackStart} onRetry={audioAsset.retry} onSeekInteractionChange={setSeekInteractionActive} pauseRequest={questionAudioPauseRequest} playbackKey={card.id} practiceControls={integratedRecordingLayout ? taskContent : undefined} resolving={audioAsset.resolving} tagColors={selectedTagColors} uri={audioAsset.uri} variant={integratedRecordingLayout ? 'integrated-recording' : 'default'} />{integratedRecordingLayout ? null : <><View style={styles.divider} />{taskContent}</>}</View>} revealed={session.revealed} transcript={transcript} workbench={<StudyWorkbench ref={workbenchRef} activeTab={session.activeTab} answerText={session.answerText} bankId={dataset.id} bankTitle={dataset.title} cardKey={card.id} categoryTitle={category.name} editingTab={editingWorkbenchTab} noteText={entry?.note ?? ''} onAnswerChange={session.updateAnswer} onEditingTabChange={setEditingWorkbenchTab} onFeedback={session.markFeedback} onNoteChange={(note) => { void annotations.saveNote(note); }} onRetrySave={() => { void annotations.retrySave(); }} onTabChange={session.setActiveTab} onTranscriptionAttempted={session.markTranscriptionAttempted} questionText={card.audioText} recordingKey={recordingKey} recordingUri={session.recording?.uri} referenceContent={referenceContent} referenceLabel={session.behavior.referenceLabel} reviewKind={session.behavior.reviewKind} saveError={annotations.saveErrorMessage} sessionId={session.sessionId} sessionStartedAt={session.sessionStartedAt} swipeGesture={workbenchSwipeGesture} tabs={session.behavior.workbenchTabs} topicTitle={topic.name} transcriptionAttempted={Boolean(recordingKey && session.attemptedTranscriptionKeys.has(recordingKey))} />} />
            )}
          </ScrollView>
          {swipeBoundaryMessage ? <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.swipeBoundary}><AppText variant="micro">{swipeBoundaryMessage}</AppText></View> : null}
        </Animated.View>
      </GestureDetector>

      <View style={[styles.footerShell, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
        {finishError ? <AppText color={colors.destructive} style={styles.finishError} variant="caption">{finishError}</AppText> : null}
        <View style={styles.footer}>
          <Button disabled={finishing || taskInteractionActive || cardTransitionActive} leading={<Flag color={colors.foreground} size={15} />} onPress={() => void finish('abort')} size="sm" variant="ghost">{finishing ? '生成中…' : '结束'}</Button>
          <Button disabled={finishing || taskInteractionActive || cardTransitionActive || session.currentIndex === 0} leading={<ChevronLeft color={colors.foreground} size={16} />} onPress={() => { void goToCard(session.currentIndex - 1, -1); }} size="sm" variant="outline">上一题</Button>
          <Button accessibilityLabel={session.currentIndex < topic.cards.length - 1 ? '下一题' : '完成'} disabled={finishing || taskInteractionActive || cardTransitionActive} onPress={() => { if (session.currentIndex < topic.cards.length - 1) void goToCard(session.currentIndex + 1, 1); else void finish('complete'); }} size="sm" style={styles.footerPrimary}>{finishing ? '生成中…' : session.currentIndex < topic.cards.length - 1 ? '下一题' : '完成'} <ChevronRight color={colors.primaryForeground} size={15} /></Button>
        </View>
      </View>

      <AnswerCardSheet current={session.currentIndex} onClose={() => setAnswerCardVisible(false)} onSelect={(index) => { void goToCard(index).then((changed) => { if (changed) setAnswerCardVisible(false); }); }} total={topic.cards.length} visible={answerCardVisible} visited={session.visitedIndexes} />
      <BottomSheet accessibilityLabel="上下文查词" onClose={() => setLookup(undefined)} visible={Boolean(lookup)}><View style={styles.sheetContent}><AppText color={colors.primary} variant="micro">AI 查词</AppText><AppText variant="pageTitle">{lookup?.word}</AppText><AppText variant="caption">{dataset.title} · {card.taskTitle} · {lookup?.blockLabel}</AppText><View style={styles.lookupSentence}><AppText>{lookup?.sentence}</AppText></View>{lookupResult ? <><View style={styles.lookupResult}><AppText variant="button">释义</AppText><AppText>{lookupResult.definition}</AppText></View><View style={styles.lookupResult}><AppText variant="button">本句理解</AppText><AppText>{lookupResult.sentenceMeaning}</AppText></View><AppText color={colors.mutedForeground} variant="micro">{lookupResult.cached ? '已复用相同查询，不重复调用 AI' : 'AI 生成内容，请结合原句学习'}</AppText></> : <><AppText variant="caption">查询会发送所选词与当前句子，不上传录音，也不会进入个人学习记录。</AppText>{lookupBusy ? <AppText color={colors.mutedForeground} variant="caption">正在查询释义…</AppText> : null}{lookupError ? <><AppText color={colors.destructive} variant="caption">{lookupError}</AppText><Button onPress={() => void runLookup()} size="lg">重新查询</Button></> : null}{!aiConsented && !lookupBusy && !lookupError ? <Button onPress={() => void runLookup()} size="lg">同意 AI 处理并查询</Button> : null}</>}<Button onPress={() => setLookup(undefined)} size="lg" variant="outline">返回学习</Button></View></BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1, overflow: 'hidden' }, state: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' }, topBar: { alignItems: 'center', flexDirection: 'row', minHeight: 46, paddingHorizontal: spacing[3] }, circleButton: { alignItems: 'center', borderRadius: radii.full, height: 38, justifyContent: 'center', width: 38 }, topSpacer: { flex: 1 }, counterButton: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 34, paddingHorizontal: spacing[3] }, counter: { fontFamily: fonts.monoRegular }, offline: { alignItems: 'center', backgroundColor: colors.secondary, flexDirection: 'row', gap: spacing[2], marginHorizontal: spacing[5], padding: spacing[2] }, offlineCopy: { flex: 1 }, tools: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[2], zIndex: 20 }, answerTool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] }, toolActive: { backgroundColor: colors.primary06, borderColor: colors.primary }, bodyGesture: { flex: 1, minHeight: 0 }, body: { flex: 1, minHeight: 0 }, bodyContent: { paddingBottom: spacing[5], paddingHorizontal: spacing[5], paddingTop: spacing[1] }, primaryContent: { gap: spacing[3] }, divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth }, cardContent: { gap: spacing[2], paddingBottom: spacing[2] }, sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, translation: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, color: colors.mutedForeground, marginTop: spacing[2], paddingTop: spacing[2] }, referenceContent: { gap: spacing[2] }, swipeBoundary: { alignSelf: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, bottom: spacing[3], paddingHorizontal: spacing[3], paddingVertical: spacing[2], position: 'absolute' }, footerShell: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[1], paddingTop: spacing[2] }, finishError: { paddingHorizontal: spacing[5], textAlign: 'center' }, footer: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[5] }, footerPrimary: { flex: 1 }, sheetContent: { gap: spacing[3], paddingBottom: spacing[3] }, lookupSentence: { backgroundColor: colors.secondary, borderRadius: radii.xl, padding: spacing[3] }, lookupResult: { backgroundColor: colors.secondary, borderRadius: radii.xl, gap: spacing[1], padding: spacing[3] },
  returnToRadioButton: { alignItems: 'center', borderRadius: radii.full, flexDirection: 'row', gap: spacing[1], minHeight: 38, paddingHorizontal: spacing[2] },
});
