import { trackProductClick } from '@/platform/product-clicks.native';
import {
  AI_GENERATED_CONTENT_LABEL,
  DEEPSEEK_MODEL_FILING_DISCLOSURE,
} from '@icao/contracts';
import { randomUUID } from 'expo-crypto';
import { usePathname, useRouter } from 'expo-router';
import {
  Fragment,
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { BookOpenCheck, MessageSquareText, NotebookPen } from '@/components/ui/icons';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { AppModal } from '@/components/platform/AppModal';
import { AppText, Button } from '@/components/ui';
import { acceptAiConsent, hasAiConsent, reviewExpression, transcribeRecording } from '@/features/ai/ai-client.native';
import { aiFailureDisplayMessage, toAiOperationFailure, type AiCapability } from '@/features/ai/ai-operation-failure.native';
import { savePendingAiOperation, completePendingAiOperation, abandonPendingAiOperation } from '@/features/ai/ai-operation-recovery.native';
import { exactMatch } from '@/features/ai/exact-match';
import { AiGeneratedContentLabel } from '@/features/ai/AiGeneratedContentLabel';
import { TRANSCRIPTION_ACTION_ENABLED } from '@/features/ai/transcription-ui-capability';
import { emitAudioDiagnostic } from '@/platform/audio/audio-diagnostics';
import { recordSafeDiagnosticEvent } from '@/platform/diagnostics/safe-diagnostic-store';
import { colors, radii, spacing } from '@/theme';

import { captureLearningWriteContext } from '@/features/sync/learning-sync.native';
import { sqliteLearningStore, type LearningStore } from '../platform/learning-store.native';
import type { LearningRecord, QuestionBankId, StudyConsoleTab, StudyReviewKind } from '../types';
import { AiReviewResultView } from './AiReviewResultView';

const labels: Record<StudyConsoleTab, string> = { mine: '我的回答', reference: '参考答案', notes: '我的笔记' };
const AUTO_SAVE_DELAY_MS = 600;

function stableResultId(sessionId: string, cardKey: string) {
  let hash = 2166136261;
  const value = `${sessionId}:${cardKey}`;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `ai-${sessionId}-${(hash >>> 0).toString(36)}`;
}

type AutoSaveSnapshot = {
  cardKey: string;
  fingerprint: string;
  record: Omit<LearningRecord, 'updatedAt'>;
};

type AiConsentKind = 'audio' | 'text';
type AiAction = 'transcribe' | 'review';
type FeedbackReview = Pick<NonNullable<LearningRecord['aiResult']>, 'grammar' | 'polishedText'>;
type CardFeedback = {
  inherited?: boolean;
  aiReview?: FeedbackReview;
  aiOperation?: LearningRecord['aiOperation'];
  rawTranscript?: string;
  analyzedTranscript?: string;
  matchMessage?: string;
};
export type StudyWorkbenchFeedbackCache = { sessionId: string; cards: Map<string, CardFeedback> };

function initialCardFeedback(feedback?: LearningRecord['aiResult']): CardFeedback {
  return {
    inherited: true,
    aiReview: feedback && (feedback.grammar || feedback.polishedText)
      ? { grammar: feedback.grammar, polishedText: feedback.polishedText } : undefined,
    rawTranscript: feedback?.rawTranscript,
    analyzedTranscript: feedback?.analyzedTranscript ?? feedback?.transcript,
  };
}

function FeedbackReviewContent({ result }: { result: FeedbackReview }) {
  const grammar = result.grammar;
  if (grammar && grammar.issues.every((issue) => typeof issue !== 'string')) {
    return <AiReviewResultView result={{ grammar: { ...grammar, issues: grammar.issues.filter((issue) => typeof issue !== 'string') }, polishedText: result.polishedText, promptVersion: 'deepseek-review:v1' }} />;
  }
  // Earlier records may contain plain-text issues or only a polished answer.
  return <View style={{ gap: spacing[2] }} testID="study-workbench-review-result">
    <AiGeneratedContentLabel />
    {grammar ? <>
      <AppText variant="button">语法纠错</AppText>
      {grammar.issues.map((issue, index) => <AppText key={index} variant="caption">{typeof issue === 'string' ? issue : `${issue.before} → ${issue.after}：${issue.reasonZh}`}</AppText>)}
      <AppText variant="button">正确句子</AppText><AppText>{grammar.correctedText}</AppText>
    </> : null}
    {result.polishedText ? <><AppText variant="button">润色后的表达</AppText><AppText>{result.polishedText}</AppText></> : null}
  </View>;
}

// Unknown outcomes retain their key; a known rejected/released task can start anew.
function resetFailedOperation(failure: ReturnType<typeof toAiOperationFailure>) {
  return failure.status !== undefined && failure.status >= 400 && failure.status < 500
    && ![408, 429].includes(failure.status) && failure.code !== 'ai_operation_in_progress';
}

type Props = {
  cardKey: string;
  sourceCardId?: string;
  sessionId: string;
  sessionStartedAt: string;
  bankId: QuestionBankId;
  bankTitle: string;
  categoryTitle: string;
  topicTitle: string;
  tabs: StudyConsoleTab[];
  activeTab: StudyConsoleTab;
  referenceLabel: string;
  answerText: string;
  initialFeedback?: LearningRecord['aiResult'];
  feedbackCacheRef?: { current: StudyWorkbenchFeedbackCache | undefined };
  questionText: string;
  reviewKind: StudyReviewKind;
  recordingUri?: string;
  referenceContent: ReactNode;
  noteText: string;
  saveError?: string;
  editingTab?: 'mine' | 'notes';
  swipeGesture: GestureType;
  learningStore?: Pick<LearningStore, 'addRecord'>;
  persistAiResult?: boolean;
  onTabChange: (tab: StudyConsoleTab) => void;
  onEditingTabChange: (tab?: 'mine' | 'notes') => void;
  onAnswerChange: (text: string) => void;
  onNoteChange: (text: string) => void;
  onRetrySave: () => void;
  onFeedback: () => void;
  onBeforeAiOperation?: () => Promise<void>;
};

export type StudyWorkbenchHandle = {
  flushAutoSave: () => Promise<boolean>;
};

export const StudyWorkbench = forwardRef<StudyWorkbenchHandle, Props>(function StudyWorkbench(props, ref) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    activeTab,
    answerText,
    initialFeedback,
    feedbackCacheRef,
    bankId,
    bankTitle,
    cardKey,
    categoryTitle,
    editingTab,
    learningStore = sqliteLearningStore,
    persistAiResult = true,
    noteText,
    onAnswerChange,
    onEditingTabChange,
    onFeedback,
    onBeforeAiOperation,
    onNoteChange,
    onRetrySave,
    onTabChange,
    questionText,
    recordingUri,
    referenceContent,
    referenceLabel,
    reviewKind,
    saveError,
    sessionId,
    sessionStartedAt,
    sourceCardId = cardKey,
    swipeGesture,
    tabs,
    topicTitle,
  } = props;
  // The screen may retain this cache while a collapsed card unmounts its workbench.
  const feedbackCacheOwner = useRef<StudyWorkbenchFeedbackCache>(feedbackCacheRef?.current ?? { sessionId, cards: new Map() });
  const [feedbackCache, setFeedbackCache] = useState(feedbackCacheOwner.current);
  const feedback = (feedbackCache.sessionId === sessionId ? feedbackCache.cards.get(cardKey) : undefined) ?? initialCardFeedback(initialFeedback);
  const { aiReview, aiOperation, rawTranscript, analyzedTranscript, matchMessage } = feedback;
  const updateFeedback = useCallback((patch: Partial<CardFeedback>) => {
    const current = feedbackCacheOwner.current;
    const cards = new Map(current.sessionId === sessionId ? current.cards : undefined);
    cards.set(cardKey, { ...(cards.get(cardKey) ?? initialCardFeedback(initialFeedback)), ...patch });
    const next = { sessionId, cards };
    feedbackCacheOwner.current = next;
    if (feedbackCacheRef) feedbackCacheRef.current = next;
    setFeedbackCache(next);
  }, [cardKey, feedbackCacheRef, initialFeedback, sessionId]);
  const [failureRetryable, setFailureRetryable] = useState(false);
  const [failureNeedsDiagnostic, setFailureNeedsDiagnostic] = useState(false);
  const [busy, setBusy] = useState<AiAction>();
  const [error, setError] = useState<string>();
  const [failedAction, setFailedAction] = useState<AiAction>();
  const [failureDiagnosticId, setFailureDiagnosticId] = useState<string>();
  const [autoSaveError, setAutoSaveError] = useState<string>();
  const [consented, setConsented] = useState(false);
  const [consentKind, setConsentKind] = useState<AiConsentKind>();
  const [answerInputHeight, setAnswerInputHeight] = useState(92);
  const [noteInputHeight, setNoteInputHeight] = useState(92);
  const [saveRevision, setSaveRevision] = useState(0);
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const transcribeOperationId = useRef<string | undefined>(undefined);
  const reviewOperationId = useRef<string | undefined>(undefined);
  const answerInputRef = useRef<TextInput>(null);
  const noteInputRef = useRef<TextInput>(null);
  const currentCardKey = useRef(cardKey);
  const writeContext = useRef(captureLearningWriteContext()).current;
  const dirty = useRef(false);
  const latestSnapshot = useRef<AutoSaveSnapshot | undefined>(undefined);
  const lastSavedFingerprints = useRef(new Map<string, string>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const consentResolver = useRef<((accepted: boolean) => void) | undefined>(undefined);

  currentCardKey.current = cardKey;

  const resultId = stableResultId(sessionId, cardKey);
  // Historical feedback is a display seed, never a newly generated result.
  const savedReview = feedback.inherited ? undefined : aiReview;
  const savedRawTranscript = feedback.inherited ? undefined : rawTranscript;
  const savedAnalyzedTranscript = feedback.inherited ? undefined : analyzedTranscript;
  const fingerprint = JSON.stringify({
    answerText,
    aiReview: savedReview,
    matchMessage,
    aiOperation,
    rawTranscript: savedRawTranscript,
    analyzedTranscript: savedAnalyzedTranscript,
  });
  latestSnapshot.current = {
    cardKey,
    fingerprint,
    record: {
      schemaVersion: 5,
      id: resultId,
      sessionId,
      cardId: sourceCardId,
      bankId,
      bankTitle,
      categoryTitle,
      topicTitle,
      completedCount: 1,
      totalCount: 1,
      correctCount: 0,
      feedbackCount: savedReview || matchMessage ? 1 : 0,
      durationSeconds: Math.max(0, Math.round((Date.now() - Date.parse(sessionStartedAt)) / 1000)),
      reason: 'complete',
      createdAt: sessionStartedAt,
      recordType: 'ai_result',
      aiOperation,
      aiResult: {
        questionId: sourceCardId,
        transcript: answerText,
        itemId: cardKey,
        analyzedTranscript: savedAnalyzedTranscript,
        rawTranscript: savedRawTranscript,
        grammar: savedReview?.grammar,
        polishedText: savedReview?.polishedText,
      },
    },
  };

  const markDirty = useCallback(() => {
    dirty.current = true;
    setAutoSaveError(undefined);
    setSaveRevision((value) => value + 1);
  }, []);

  const persistCurrent = useCallback(() => {
    if (!persistAiResult) {
      dirty.current = false;
      setAutoSaveError(undefined);
      return Promise.resolve(true);
    }
    const saveLatest = async () => {
      while (true) {
        const snapshot = latestSnapshot.current;
        if (!dirty.current || !snapshot) return true;
        if (lastSavedFingerprints.current.get(snapshot.record.id) === snapshot.fingerprint) {
          dirty.current = false;
          return true;
        }

        const savedFingerprint = snapshot.fingerprint;
        try {
          await learningStore.addRecord({ ...snapshot.record, updatedAt: new Date().toISOString() }, writeContext);
          lastSavedFingerprints.current.set(snapshot.record.id, savedFingerprint);
          if (latestSnapshot.current?.cardKey === snapshot.cardKey && latestSnapshot.current.fingerprint === savedFingerprint) {
            dirty.current = false;
            setAutoSaveError(undefined);
            return true;
          }
        } catch {
          lastSavedFingerprints.current.delete(snapshot.record.id);
          if (currentCardKey.current === snapshot.cardKey) setAutoSaveError('自动保存失败');
          return false;
        }
      }
    };
    const operation = saveQueue.current.then(saveLatest, saveLatest);
    saveQueue.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [learningStore, persistAiResult, writeContext]);

  const flushAutoSave = useCallback(async () => {
    activeRequest.current?.abort();
    return persistCurrent();
  }, [persistCurrent]);

  useImperativeHandle(ref, () => ({ flushAutoSave }), [flushAutoSave]);

  useEffect(() => {
    const controller = activeRequest.current;
    if (controller) controller.abort();
    setError(undefined);
    setFailedAction(undefined);
    setFailureDiagnosticId(undefined);
    setAutoSaveError(undefined);
    setBusy(undefined);
    transcribeOperationId.current = undefined;
    reviewOperationId.current = undefined;
    completePendingConsent();
    setAnswerInputHeight(92);
    setNoteInputHeight(92);
    dirty.current = false;
  }, [cardKey, sessionId]);

  function completePendingConsent() {
    consentResolver.current?.(false);
    consentResolver.current = undefined;
    setConsentKind(undefined);
  }

  useEffect(() => {
    activeRequest.current?.abort();
    transcribeOperationId.current = undefined;
  }, [recordingUri]);

  useEffect(() => () => {
    const controller = activeRequest.current;
    activeRequest.current = undefined;
    controller?.abort();
    consentResolver.current?.(false);
    consentResolver.current = undefined;
  }, []);

  useEffect(() => {
    void hasAiConsent().then(setConsented).catch(() => setConsented(false));
  }, []);

  useEffect(() => {
    if (!dirty.current || saveRevision === 0) return;
    const timeout = setTimeout(() => { void persistCurrent(); }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [persistCurrent, saveRevision]);

  const requestAiConsent = useCallback((kind: AiConsentKind) => new Promise<boolean>((resolve) => {
    consentResolver.current?.(false);
    consentResolver.current = resolve;
    setConsentKind(kind);
  }), []);

  const completeAiConsent = useCallback((accepted: boolean) => {
    const resolve = consentResolver.current;
    consentResolver.current = undefined;
    setConsentKind(undefined);
    resolve?.(accepted);
  }, []);

  const ensureConsent = useCallback(async (kind: AiConsentKind) => {
    if (Platform.OS === 'web') {
      const acknowledged = consented || await hasAiConsent();
      if (!acknowledged && !await requestAiConsent(kind)) return false;
      await acceptAiConsent();
      setConsented(true);
      return true;
    }
    // The server is authoritative for the current account and policy version.
    // A cached UI state must never unlock an upload after a remote revocation,
    // account switch, or policy update.
    const acknowledged = await hasAiConsent();
    setConsented(acknowledged);
    if (acknowledged) return true;
    if (!await requestAiConsent(kind)) return false;
    await acceptAiConsent();
    setConsented(true);
    return true;
  }, [consented, requestAiConsent]);

  const changeAnswer = useCallback((text: string) => {
    if (text === answerText) return;
    updateFeedback({ inherited: false, aiReview: undefined, aiOperation: undefined, matchMessage: undefined, rawTranscript: undefined, analyzedTranscript: undefined });
    setError(undefined);
    setFailedAction(undefined);
    setFailureDiagnosticId(undefined);
    reviewOperationId.current = undefined;
    transcribeOperationId.current = undefined;
    onAnswerChange(text);
    markDirty();
  }, [answerText, markDirty, onAnswerChange, updateFeedback]);

  const beginOperation = useCallback(async (operationId: string, inputTranscript?: string) => {
    const request = activeRequest.current;
    if (!request) throw new Error('request_aborted');
    if (!await persistCurrent()) throw new Error('learning_save_failed');
    await onBeforeAiOperation?.();
    const snapshot = latestSnapshot.current;
    if (!snapshot || snapshot.cardKey !== cardKey || currentCardKey.current !== cardKey || activeRequest.current !== request || request.signal.aborted) throw new Error('request_aborted');
    const operation = await savePendingAiOperation(snapshot.record, operationId, writeContext, inputTranscript);
    if (currentCardKey.current !== cardKey || activeRequest.current !== request || request.signal.aborted) throw new Error('request_aborted');
    updateFeedback({ aiOperation: operation });
  }, [cardKey, onBeforeAiOperation, persistCurrent, updateFeedback, writeContext]);

  const transcribe = useCallback(async () => {
    if (!recordingUri || activeRequest.current) return;
    const requestCardKey = cardKey;
    setBusy('transcribe');
    setError(undefined);
    setFailedAction(undefined);
    setFailureDiagnosticId(undefined);
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      if (!await ensureConsent('audio')) return;
      if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      const operation = transcribeOperationId;
      const stableOperationId = operation.current ?? randomUUID();
      operation.current = stableOperationId;
      await beginOperation(stableOperationId);
      if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      const result = await transcribeRecording(recordingUri, controller.signal, stableOperationId);
      if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      const saved = await completePendingAiOperation(resultId, stableOperationId, result, writeContext);
      if (!saved || controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      updateFeedback({ inherited: false, aiOperation: saved.aiOperation, rawTranscript: result.transcript, aiReview: undefined, analyzedTranscript: undefined, matchMessage: undefined });
      reviewOperationId.current = undefined;
      onAnswerChange(result.transcript);
      markDirty();
      emitAudioDiagnostic({ code: 'transcription_completed', level: 'info', scope: 'transcription' });
    } catch (error) {
      if (activeRequest.current === controller && currentCardKey.current === requestCardKey) {
        const failure = toAiOperationFailure(error, 'transcribe');
        if (controller.signal.aborted || failure.cancelled) return;
        if (resetFailedOperation(failure)) {
          const operation = transcribeOperationId;
          if (operation.current) await abandonPendingAiOperation(resultId, operation.current, writeContext).catch(() => undefined);
          if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
          operation.current = undefined;
          updateFeedback({ aiOperation: undefined });
        }
        if (Platform.OS !== 'web' && failure.code === 'ai_consent_required') setConsented(false);
        void recordSafeDiagnosticEvent({
          feature: 'ai',
          correlationId: failure.diagnosticId,
          stage: failure.stage,
          code: failure.code,
          level: 'error',
          capability: failure.capability,
          httpStatus: failure.status,
          requestId: failure.requestId,
          retryable: failure.retryable,
        });
        setFailedAction('transcribe');
        setFailureDiagnosticId(failure.diagnosticId);
        setFailureRetryable(failure.retryable);
        setFailureNeedsDiagnostic(failure.code !== 'insufficient_ai_points');
        setError(aiFailureDisplayMessage(failure));
        emitAudioDiagnostic({
          code: 'transcription_failed',
          level: 'warning',
          reason: failure.code,
          scope: 'transcription',
        });
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = undefined;
        if (currentCardKey.current === requestCardKey) setBusy(undefined);
      }
    }
  }, [beginOperation, cardKey, ensureConsent, markDirty, onAnswerChange, recordingUri, resultId, updateFeedback, writeContext]);

  async function reviewAnswer() {
    if (!answerText.trim() || activeRequest.current) return;
    const requestCardKey = cardKey;
    setBusy('review');
    setError(undefined);
    setFailedAction(undefined);
    setFailureDiagnosticId(undefined);
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      if (reviewKind === 'exact-match') {
        const result = exactMatch(questionText, answerText);
        if (activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
        updateFeedback({ inherited: false, aiReview: undefined, rawTranscript: undefined, analyzedTranscript: undefined, matchMessage: result.exact
          ? '与原文逐词一致。'
          : `发现差异：缺失 ${result.summary.missing}、多余 ${result.summary.extra}、替换 ${result.summary.replace}、顺序 ${result.summary.order}。` });
        onFeedback();
        markDirty();
        return;
      }
      if (!await ensureConsent('text')) return;
      if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      const module = bankId === 'radiotelephony' ? 'atc' : bankId === 'storytelling' ? 'story' : 'opi';
      const stableOperationId = reviewOperationId.current ?? randomUUID();
      reviewOperationId.current = stableOperationId;
      await beginOperation(stableOperationId, answerText);
      if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      const result = await reviewExpression({
        mode: reviewKind === 'opi-analysis' ? 'opi' : 'grammar',
        module,
        questionId: sourceCardId,
        transcript: answerText,
      }, controller.signal, stableOperationId);
      if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      const saved = await completePendingAiOperation(resultId, stableOperationId, result, writeContext);
      if (!saved || controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      updateFeedback({ inherited: false, aiOperation: saved.aiOperation, aiReview: { grammar: result.grammar, polishedText: result.polishedText }, analyzedTranscript: answerText, ...(feedback.inherited ? { rawTranscript: undefined } : {}) });
      onFeedback();
      markDirty();
    } catch (error) {
      if (activeRequest.current === controller && currentCardKey.current === requestCardKey) {
        const capability: AiCapability = reviewKind === 'opi-analysis' ? 'polish' : 'grammar';
        const failure = toAiOperationFailure(error, capability);
        if (controller.signal.aborted || failure.cancelled) return;
        if (resetFailedOperation(failure)) {
          if (reviewOperationId.current) await abandonPendingAiOperation(resultId, reviewOperationId.current, writeContext).catch(() => undefined);
          if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
          reviewOperationId.current = undefined;
          updateFeedback({ aiOperation: undefined });
        }
        if (Platform.OS !== 'web' && failure.code === 'ai_consent_required') setConsented(false);
        void recordSafeDiagnosticEvent({
          feature: 'ai',
          correlationId: failure.diagnosticId,
          stage: failure.stage,
          code: failure.code,
          level: 'error',
          capability: failure.capability,
          httpStatus: failure.status,
          requestId: failure.requestId,
          retryable: failure.retryable,
        });
        setFailedAction('review');
        setFailureDiagnosticId(failure.diagnosticId);
        setFailureRetryable(failure.retryable);
        setFailureNeedsDiagnostic(failure.code !== 'insufficient_ai_points');
        setError(aiFailureDisplayMessage(failure));
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = undefined;
        if (currentCardKey.current === requestCardKey) setBusy(undefined);
      }
    }
  }

  const title = activeTab === 'reference' ? referenceLabel : labels[activeTab];
  const reviewLabel = '分析表达';
  const editableTab = activeTab === 'mine' || activeTab === 'notes' ? activeTab : undefined;
  const editing = Boolean(editableTab && editingTab === editableTab);
  const editAccessibilityLabel = editing ? `完成${title}` : `编辑${title}`;

  function finishEditing() {
    answerInputRef.current?.blur();
    noteInputRef.current?.blur();
    Keyboard.dismiss();
    onEditingTabChange(undefined);
    if (activeTab === 'mine') void persistCurrent();
  }

  function selectTab(tab: StudyConsoleTab) {
    finishEditing();
    onTabChange(tab);
  }

  function openAiDiagnosticFeedback() {
    if (!failureDiagnosticId) return;
    router.push({
      pathname: '/info/[slug]',
      params: {
        slug: 'feedback',
        source: 'study',
        sourceRoute: pathname,
        feature: 'ai',
        correlationId: failureDiagnosticId,
      },
    });
  }

  const aiBusy = Boolean(busy);
  const showRetry = activeTab === 'mine' ? Boolean(autoSaveError) : activeTab === 'notes' ? Boolean(saveError) : false;
  const showReviewAction = activeTab === 'mine' && reviewKind !== 'none';
  const showTranscribeAction = TRANSCRIPTION_ACTION_ENABLED && activeTab === 'mine';
  const transcribeDisabled = !recordingUri || editing || aiBusy;
  const reviewDisabled = !answerText.trim() || editing || aiBusy;
  const reviewError = failedAction === 'review' ? error : undefined;
  const transcriptionError = failedAction === 'transcribe' ? error : undefined;
  const aiPrimaryText = matchMessage ? questionText : undefined;
  const aiExplanation = matchMessage;
  const visibleRawTranscript = rawTranscript && rawTranscript !== answerText ? rawTranscript : undefined;
  const visibleAnalyzedTranscript = aiReview && analyzedTranscript && analyzedTranscript !== answerText && analyzedTranscript !== visibleRawTranscript ? analyzedTranscript : undefined;
  const showAiRegion = busy === 'review' || Boolean(reviewError || aiReview || aiPrimaryText || aiExplanation || visibleRawTranscript);

  return (
    <Fragment>
      <GestureDetector gesture={swipeGesture}>
      <View>
        <View style={styles.header} testID="study-workbench-header">
          <View style={styles.headerTitle}>
            {activeTab === 'mine' ? <MessageSquareText color={colors.mutedForeground} size={15} testID="study-workbench-title-icon-mine" /> : activeTab === 'reference' ? <BookOpenCheck color={colors.mutedForeground} size={15} testID="study-workbench-title-icon-reference" /> : <NotebookPen color={colors.mutedForeground} size={15} testID="study-workbench-title-icon-notes" />}
            <AppText numberOfLines={1} style={styles.headerTitleText} variant="button">{title}</AppText>
          </View>
          {editableTab ? <View style={styles.headerActions}>
            {showTranscribeAction ? <Pressable
              accessibilityLabel="转写"
              accessibilityRole="button"
              accessibilityState={{ disabled: transcribeDisabled }}
              disabled={transcribeDisabled}
              hitSlop={4}
              onPress={() => { trackProductClick('transcription'); void transcribe(); }}
              style={({ pressed }) => [styles.transcribeAction, pressed && !transcribeDisabled ? styles.pressed : null, transcribeDisabled ? styles.headerActionDisabled : null]}
              testID="study-workbench-transcribe-action"
            >
              <AppText color={transcribeDisabled ? colors.mutedForeground : colors.primary} variant="caption">转写</AppText>
            </Pressable> : null}
            <Pressable
              accessibilityLabel={editAccessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: aiBusy }}
              disabled={aiBusy}
              hitSlop={4}
              onPress={() => editing ? finishEditing() : onEditingTabChange(editableTab)}
              style={({ pressed }) => [styles.editAction, pressed && !aiBusy ? styles.pressed : null, aiBusy ? styles.headerActionDisabled : null]}
              testID="study-workbench-primary-action"
            >
              <AppText color={aiBusy ? colors.mutedForeground : colors.primary} variant="caption">{editing ? '完成' : '编辑'}</AppText>
            </Pressable>
            {showReviewAction ? <Pressable
              accessibilityLabel={reviewLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: reviewDisabled }}
              disabled={reviewDisabled}
              hitSlop={4}
              onPress={() => { trackProductClick('analysis'); void reviewAnswer(); }}
              style={({ pressed }) => [styles.reviewAction, pressed && !reviewDisabled ? styles.pressed : null, reviewDisabled ? styles.headerActionDisabled : null]}
              testID="study-workbench-review-action"
            >
              <AppText color={reviewDisabled ? colors.mutedForeground : colors.primary} variant="caption">{reviewLabel}</AppText>
            </Pressable> : null}
          </View> : null}
        </View>

        <View style={styles.content} testID="study-workbench-content">
          {activeTab === 'mine' ? <View>
            <View style={styles.responseSection}>
              {Platform.OS !== 'web' && recordingUri && !consented ? <AppText variant="micro">录音仅在你主动使用 AI 时上传。</AppText> : null}
              {editing ? <TextInput accessibilityLabel="我的回答" autoFocus multiline onBlur={() => { onEditingTabChange(undefined); void persistCurrent(); }} onChangeText={changeAnswer} onContentSizeChange={({ nativeEvent }) => setAnswerInputHeight(Math.max(92, Math.ceil(nativeEvent.contentSize.height)))} placeholder={busy === 'transcribe' ? '正在转写…' : '输入回答'} placeholderTextColor={colors.mutedForeground} ref={answerInputRef} scrollEnabled={false} style={[styles.input, { height: answerInputHeight }]} textAlignVertical="top" value={answerText} /> : <View accessibilityLabel="我的回答内容" style={styles.input}><AppText color={answerText ? colors.foreground : colors.mutedForeground}>{answerText || (busy === 'transcribe' ? '正在转写…' : Platform.OS === 'web' ? '回答会显示在这里' : '录音或编辑后，回答会显示在这里')}</AppText></View>}
              {transcriptionError ? <View style={styles.aiErrorActions}>
                <AppText color={colors.destructive} style={styles.aiErrorCopy} variant="caption">{transcriptionError}</AppText>
                {failureRetryable ? <Pressable accessibilityLabel="重试转写" accessibilityRole="button" onPress={() => { trackProductClick('transcription'); void transcribe(); }} testID="study-workbench-ai-retry" style={styles.aiRetry}><AppText color={colors.primary} variant="caption">重试</AppText></Pressable> : null}
                {failureNeedsDiagnostic ? <Pressable accessibilityLabel="提交 AI 诊断" accessibilityRole="button" onPress={openAiDiagnosticFeedback} style={({ pressed }) => [styles.aiRetry, pressed ? styles.pressed : null]}><AppText color={colors.primary} variant="caption">提交诊断</AppText></Pressable> : null}
              </View> : null}
              {autoSaveError ? <AppText accessibilityLiveRegion="assertive" color={colors.destructive} variant="micro">{autoSaveError}</AppText> : null}
            </View>
            {showAiRegion ? <View style={styles.aiRegion} testID="study-workbench-ai-region">
              {visibleRawTranscript ? <View><AppText variant="button">本次转写</AppText><AppText testID="study-workbench-raw-transcript">{visibleRawTranscript}</AppText></View> : null}
              {visibleAnalyzedTranscript ? <View><AppText variant="button">分析时的回答</AppText><AppText testID="study-workbench-analyzed-transcript">{visibleAnalyzedTranscript}</AppText></View> : null}
              {busy === 'review' ? <AppText color={colors.mutedForeground}>正在分析表达…</AppText> : reviewError ? <>
                <AppText accessibilityLiveRegion="assertive" color={colors.destructive}>{reviewError}</AppText>
                <View style={styles.aiErrorButtons}>
                  {failureRetryable ? <Pressable accessibilityLabel="重试分析表达" accessibilityRole="button" onPress={() => { trackProductClick('analysis'); void reviewAnswer(); }} style={({ pressed }) => [styles.aiRetry, pressed ? styles.pressed : null]} testID="study-workbench-ai-retry"><AppText color={colors.primary} variant="caption">重试</AppText></Pressable> : null}
                  {failureNeedsDiagnostic ? <Pressable accessibilityLabel="提交 AI 诊断" accessibilityRole="button" onPress={openAiDiagnosticFeedback} style={({ pressed }) => [styles.aiRetry, pressed ? styles.pressed : null]}><AppText color={colors.primary} variant="caption">提交诊断</AppText></Pressable> : null}
                </View>
                {aiReview ? <FeedbackReviewContent result={aiReview} /> : null}
              </> : aiReview ? <FeedbackReviewContent result={aiReview} /> : <>
                {aiPrimaryText ? <AppText style={styles.aiPrimaryText} testID="study-workbench-ai-primary" variant="button">{aiPrimaryText}</AppText> : null}
                {aiExplanation ? <><View style={styles.aiDivider} testID="study-workbench-ai-divider" /><AppText color={colors.mutedForeground} style={styles.aiExplanation} testID="study-workbench-ai-explanation">{aiExplanation}</AppText></> : null}
              </>}
            </View> : null}
          </View> : activeTab === 'reference' ? <View style={styles.referenceSection}>{referenceContent}</View> : <View style={styles.responseSection}>
            {editing ? <TextInput accessibilityLabel="我的笔记" autoFocus multiline onBlur={() => onEditingTabChange(undefined)} onChangeText={onNoteChange} onContentSizeChange={({ nativeEvent }) => setNoteInputHeight(Math.max(92, Math.ceil(nativeEvent.contentSize.height)))} placeholder="记录要点" placeholderTextColor={colors.mutedForeground} ref={noteInputRef} scrollEnabled={false} style={[styles.input, { height: noteInputHeight }]} textAlignVertical="top" value={noteText} /> : <View accessibilityLabel="我的笔记内容" style={styles.input}><AppText color={noteText ? colors.foreground : colors.mutedForeground}>{noteText || '记录这道题的关键词、易错点或复盘想法'}</AppText></View>}
            {saveError ? <AppText accessibilityLiveRegion="assertive" color={colors.destructive} variant="micro">{saveError}</AppText> : null}
          </View>}
        </View>

        <View style={styles.footer} testID="study-workbench-footer">
          {tabs.length > 1 ? <View accessibilityLabel="学习控制台栏目" accessibilityRole="tablist" style={styles.dots}>{tabs.map((tab) => {
            const active = tab === activeTab;
            const label = tab === 'reference' ? referenceLabel : labels[tab];
            return <Pressable accessibilityLabel={`切换到${label}`} accessibilityRole="tab" accessibilityState={{ selected: active }} hitSlop={8} key={tab} onPress={() => selectTab(tab)} style={styles.dotTarget} testID={`study-workbench-tab-${tab}`}><View style={[styles.dot, active ? styles.dotActive : null]} testID={`study-workbench-tab-indicator-${tab}`} /></Pressable>;
          })}</View> : <View />}
          <View style={styles.actions}>
            {showRetry ? <Pressable accessibilityLabel="重试保存" accessibilityRole="button" onPress={() => activeTab === 'mine' ? void persistCurrent() : onRetrySave()} style={styles.action}><AppText color={colors.destructive} variant="micro">重试</AppText></Pressable> : null}
            {aiBusy ? <Pressable accessibilityLabel="取消当前 AI 操作" accessibilityRole="button" onPress={() => activeRequest.current?.abort()} style={styles.action}><AppText color={colors.mutedForeground} variant="micro">取消</AppText></Pressable> : null}
          </View>
        </View>
      </View>
      </GestureDetector>
      <AppModal animationType="fade" onRequestClose={() => completeAiConsent(false)} transparent visible={Boolean(consentKind)}>
        <View style={styles.consentOverlay}>
          <View accessibilityLabel="AI 数据处理提示" style={[styles.consentDialog, Platform.OS === 'ios' && styles.nativeConsentDialog]}>
            <AppText variant="sectionTitle">AI 数据处理提示</AppText>
            {Platform.OS !== 'ios' ? (
              <AppText>
                {consentKind === 'audio'
                  ? '继续后，本次录音会经听你五个服务器发送至腾讯云语音识别，用于语音转写。我们的暂存录音会在处理完成后删除，异常残留最长保留 24 小时。'
                  : Platform.OS === 'web'
                    ? '继续后，本次回答文本会经听你五个服务器发送至阿里云百炼，用于语法分析和表达优化。'
                    : `继续后，本次回答文本会经听你五个服务器发送至 ${DEEPSEEK_MODEL_FILING_DISCLOSURE}，用于语法纠错和表达润色。结果会持续显示“${AI_GENERATED_CONTENT_LABEL}”标识。`}
              </AppText>
            ) : (
              <ScrollView style={styles.nativeConsentBody} contentContainerStyle={styles.nativeConsentContent}>
                <AppText>同意后，仅当你主动使用对应 AI 功能时，以下数据才会经听你五个服务器发送给相应服务商：</AppText>
                <AppText>录音发送至腾讯云语音识别，用于语音转写。我们的暂存录音会在处理完成后删除，异常残留最长保留 24 小时。</AppText>
                <AppText>{`回答文本发送至 DeepSeek 开放平台，使用 ${DEEPSEEK_MODEL_FILING_DISCLOSURE} 进行语法纠错和表达润色。结果会持续显示“${AI_GENERATED_CONTENT_LABEL}”标识。`}</AppText>
              </ScrollView>
            )}
            <AppText color={colors.mutedForeground} variant="caption">AI 服务使用日志仅记录功能、状态、模型、耗时和用量；回答与分析结果仍可能作为学习记录同步到你的账号。你可在“设置—隐私与数据”撤回同意。</AppText>
            <Button onPress={() => completeAiConsent(true)}>同意并继续</Button>
            <Button onPress={() => completeAiConsent(false)} variant="outline">暂不使用</Button>
          </View>
        </View>
      </AppModal>
    </Fragment>
  );
});

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between', minHeight: 52, paddingHorizontal: spacing[4], paddingTop: spacing[4] },
  headerTitle: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[2], minWidth: 0 },
  headerTitleText: { flexShrink: 1 },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: spacing[1.5] },
  transcribeAction: { alignItems: 'center', backgroundColor: 'transparent', borderColor: colors.primary20, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing[3] },
  reviewAction: { alignItems: 'center', backgroundColor: 'transparent', borderColor: colors.primary20, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing[3] },
  editAction: { alignItems: 'center', backgroundColor: 'transparent', borderColor: colors.primary20, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing[3] },
  headerActionDisabled: { opacity: 0.45 },
  content: { paddingHorizontal: 0 },
  responseSection: { gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  referenceSection: { paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  input: { backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0, color: colors.foreground, minHeight: 92, paddingHorizontal: 0, paddingVertical: spacing[2] },
  aiRegion: { backgroundColor: colors.primary06, borderRadius: 0, borderWidth: 0, gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[5], width: '100%' },
  aiPrimaryText: { lineHeight: 24 },
  aiDivider: { backgroundColor: colors.primary20, height: StyleSheet.hairlineWidth, width: '100%' },
  aiExplanation: { lineHeight: 22 },
  aiErrorActions: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  aiErrorButtons: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  aiErrorCopy: { flex: 1, paddingTop: spacing[2] },
  aiRetry: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.full, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing[2] },
  footer: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', minHeight: 32, paddingBottom: spacing[1.5], paddingHorizontal: spacing[3], paddingTop: spacing[1] },
  dots: { alignItems: 'center', backgroundColor: 'transparent', borderWidth: 0, flexDirection: 'row', height: 28 },
  dotTarget: { alignItems: 'center', height: 28, justifyContent: 'center', width: 18 },
  dot: { backgroundColor: colors.mutedForeground, borderRadius: radii.full, height: 4, opacity: 0.32, width: 4 },
  dotActive: { backgroundColor: colors.primary, height: 4, opacity: 1, width: 10 },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  action: { alignItems: 'center', borderRadius: radii.full, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing[2.5] },
  consentOverlay: { alignItems: 'center', backgroundColor: colors.overlay, flex: 1, justifyContent: 'center', padding: spacing[5] },
  nativeConsentDialog: { maxHeight: '90%' },
  nativeConsentBody: { flexShrink: 1 },
  nativeConsentContent: { gap: spacing[3] },
  consentDialog: { backgroundColor: colors.card, borderRadius: radii.xl, gap: spacing[4], maxWidth: 420, padding: spacing[5], width: '100%' },
  pressed: { opacity: 0.72 },
});
