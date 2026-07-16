import type { GrammarReviewResult, OpiAnalysisResult } from '@icao/contracts';
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { BookOpenCheck, MessageSquareText, NotebookPen } from 'lucide-react-native';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { AppText } from '@/components/ui';
import { acceptAiConsent, grammarReview, hasAiConsent, polishExpression, transcribeRecording } from '@/features/ai/ai-client';
import { exactMatch } from '@/features/ai/exact-match';
import { emitAudioDiagnostic } from '@/platform/audio/audio-diagnostics';
import { colors, radii, spacing } from '@/theme';

import { sqliteLearningStore, type LearningStore } from '../platform/learning-store';
import type { LearningRecord, QuestionBankId, StudyConsoleTab, StudyReviewKind } from '../types';

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

type Props = {
  cardKey: string;
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
  questionText: string;
  reviewKind: StudyReviewKind;
  recordingKey?: string;
  recordingUri?: string;
  transcriptionAttempted?: boolean;
  referenceContent: ReactNode;
  noteText: string;
  saveError?: string;
  editingTab?: 'mine' | 'notes';
  swipeGesture: GestureType;
  learningStore?: Pick<LearningStore, 'addRecord'>;
  onTabChange: (tab: StudyConsoleTab) => void;
  onEditingTabChange: (tab?: 'mine' | 'notes') => void;
  onAnswerChange: (text: string) => void;
  onNoteChange: (text: string) => void;
  onRetrySave: () => void;
  onFeedback: () => void;
  onTranscriptionAttempted?: (recordingKey: string) => void;
};

export type StudyWorkbenchHandle = {
  flushAutoSave: () => Promise<boolean>;
};

export const StudyWorkbench = forwardRef<StudyWorkbenchHandle, Props>(function StudyWorkbench(props, ref) {
  const {
    activeTab,
    answerText,
    bankId,
    bankTitle,
    cardKey,
    categoryTitle,
    editingTab,
    learningStore = sqliteLearningStore,
    noteText,
    onAnswerChange,
    onEditingTabChange,
    onFeedback,
    onNoteChange,
    onRetrySave,
    onTabChange,
    onTranscriptionAttempted,
    questionText,
    recordingKey,
    recordingUri,
    transcriptionAttempted,
    referenceContent,
    referenceLabel,
    reviewKind,
    saveError,
    sessionId,
    sessionStartedAt,
    swipeGesture,
    tabs,
    topicTitle,
  } = props;
  const [rawTranscript, setRawTranscript] = useState<string>();
  const [grammar, setGrammar] = useState<GrammarReviewResult>();
  const [opi, setOpi] = useState<OpiAnalysisResult>();
  const [matchMessage, setMatchMessage] = useState<string>();
  const [busy, setBusy] = useState<'transcribe' | 'review'>();
  const [error, setError] = useState<string>();
  const [failedAction, setFailedAction] = useState<'transcribe' | 'review'>();
  const [autoSaveError, setAutoSaveError] = useState<string>();
  const [consented, setConsented] = useState(false);
  const [answerInputHeight, setAnswerInputHeight] = useState(92);
  const [noteInputHeight, setNoteInputHeight] = useState(92);
  const [saveRevision, setSaveRevision] = useState(0);
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const lastAutoTranscribeKey = useRef<string | undefined>(undefined);
  const answerInputRef = useRef<TextInput>(null);
  const noteInputRef = useRef<TextInput>(null);
  const currentCardKey = useRef(cardKey);
  const dirty = useRef(false);
  const latestSnapshot = useRef<AutoSaveSnapshot | undefined>(undefined);
  const lastSavedFingerprints = useRef(new Map<string, string>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  currentCardKey.current = cardKey;

  const resultId = stableResultId(sessionId, cardKey);
  const fingerprint = JSON.stringify({
    answerText,
    grammar,
    matchMessage,
    polishedText: opi?.polishedText,
    rawTranscript,
  });
  latestSnapshot.current = {
    cardKey,
    fingerprint,
    record: {
      schemaVersion: 3,
      id: resultId,
      sessionId,
      cardId: cardKey,
      bankId,
      bankTitle,
      categoryTitle,
      topicTitle,
      completedCount: 1,
      totalCount: 1,
      correctCount: 0,
      feedbackCount: grammar || opi || matchMessage ? 1 : 0,
      durationSeconds: Math.max(0, Math.round((Date.now() - Date.parse(sessionStartedAt)) / 1000)),
      reason: 'complete',
      createdAt: sessionStartedAt,
      recordType: 'ai_result',
      aiResult: {
        questionId: cardKey,
        rawTranscript,
        transcript: answerText,
        grammar: grammar ? {
          overallFeedbackZh: grammar.overallFeedbackZh,
          correctedText: grammar.correctedText,
          issues: grammar.issues,
        } : undefined,
        polishedText: opi?.polishedText,
      },
    },
  };

  const markDirty = useCallback(() => {
    dirty.current = true;
    setAutoSaveError(undefined);
    setSaveRevision((value) => value + 1);
  }, []);

  const persistCurrent = useCallback(() => {
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
          await learningStore.addRecord({ ...snapshot.record, updatedAt: new Date().toISOString() });
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
  }, [learningStore]);

  const flushAutoSave = useCallback(async () => {
    activeRequest.current?.abort();
    return persistCurrent();
  }, [persistCurrent]);

  useImperativeHandle(ref, () => ({ flushAutoSave }), [flushAutoSave]);

  useEffect(() => {
    const controller = activeRequest.current;
    if (controller) controller.abort();
    setRawTranscript(undefined);
    setGrammar(undefined);
    setOpi(undefined);
    setMatchMessage(undefined);
    setError(undefined);
    setFailedAction(undefined);
    setAutoSaveError(undefined);
    setBusy(undefined);
    setAnswerInputHeight(92);
    setNoteInputHeight(92);
    dirty.current = false;
  }, [cardKey]);

  useEffect(() => () => {
    const controller = activeRequest.current;
    activeRequest.current = undefined;
    controller?.abort();
  }, []);

  useEffect(() => { void hasAiConsent().then(setConsented); }, []);

  useEffect(() => {
    if (!dirty.current || saveRevision === 0) return;
    const timeout = setTimeout(() => { void persistCurrent(); }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [persistCurrent, saveRevision]);

  const ensureConsent = useCallback(async () => {
    if (consented) return;
    await acceptAiConsent();
    setConsented(true);
  }, [consented]);

  const changeAnswer = useCallback((text: string) => {
    setGrammar(undefined);
    setOpi(undefined);
    setMatchMessage(undefined);
    setError(undefined);
    setFailedAction(undefined);
    onAnswerChange(text);
    markDirty();
  }, [markDirty, onAnswerChange]);

  const transcribe = useCallback(async () => {
    if (!recordingUri) return;
    const requestCardKey = cardKey;
    if (recordingKey) onTranscriptionAttempted?.(recordingKey);
    activeRequest.current?.abort();
    setBusy('transcribe');
    setError(undefined);
    setFailedAction(undefined);
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      await ensureConsent();
      const result = await transcribeRecording(recordingUri, controller.signal);
      if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
      setRawTranscript(result.rawTranscript);
      changeAnswer(result.transcript);
      emitAudioDiagnostic({ code: 'transcription_completed', level: 'info', scope: 'transcription' });
    } catch {
      if (activeRequest.current === controller && currentCardKey.current === requestCardKey) {
        setFailedAction('transcribe');
        setError(controller.signal.aborted ? '已取消转写' : '语音转写失败，请检查网络后重试。');
        emitAudioDiagnostic({
          code: controller.signal.aborted ? 'transcription_cancelled' : 'transcription_failed',
          level: controller.signal.aborted ? 'info' : 'error',
          scope: 'transcription',
        });
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = undefined;
        if (currentCardKey.current === requestCardKey) setBusy(undefined);
      }
    }
  }, [cardKey, changeAnswer, ensureConsent, onTranscriptionAttempted, recordingKey, recordingUri]);

  useEffect(() => {
    if (!recordingKey || !recordingUri || transcriptionAttempted || lastAutoTranscribeKey.current === recordingKey) return;
    lastAutoTranscribeKey.current = recordingKey;
    void transcribe();
  }, [recordingKey, recordingUri, transcribe, transcriptionAttempted]);

  async function reviewAnswer() {
    if (!answerText.trim()) return;
    const requestCardKey = cardKey;
    activeRequest.current?.abort();
    setBusy('review');
    setError(undefined);
    setFailedAction(undefined);
    onFeedback();
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      if (reviewKind === 'exact-match') {
        const result = exactMatch(questionText, answerText);
        if (activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
        setMatchMessage(result.exact
          ? '与原文逐词一致。'
          : `发现差异：缺失 ${result.summary.missing}、多余 ${result.summary.extra}、替换 ${result.summary.replace}、顺序 ${result.summary.order}。`);
        markDirty();
        return;
      }
      await ensureConsent();
      const module = bankId === 'radiotelephony' ? 'atc' : bankId === 'storytelling' ? 'story' : 'opi';
      const input = { module, questionId: cardKey, questionText, transcript: answerText } as const;
      if (reviewKind === 'opi-analysis') {
        const grammarResult = grammar ?? await grammarReview(input, controller.signal);
        if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
        setGrammar(grammarResult);
        markDirty();
        const polished = await polishExpression({ ...input, module: 'opi', correctedText: grammarResult.correctedText }, controller.signal);
        if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
        setOpi({ grammar: grammarResult, polishedText: polished.polishedText, polishPromptVersion: polished.promptVersion });
        markDirty();
      } else {
        const result = await grammarReview(input, controller.signal);
        if (controller.signal.aborted || activeRequest.current !== controller || currentCardKey.current !== requestCardKey) return;
        setGrammar(result);
        setOpi(undefined);
        markDirty();
      }
    } catch {
      if (activeRequest.current === controller && currentCardKey.current === requestCardKey) {
        setFailedAction('review');
        setError(controller.signal.aborted ? '已取消分析' : 'AI 分析暂时失败，请稍后重试。');
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

  const aiBusy = busy === 'transcribe' || busy === 'review';
  const showRetry = activeTab === 'mine' ? Boolean(autoSaveError) : activeTab === 'notes' ? Boolean(saveError) : false;
  const showReviewAction = activeTab === 'mine' && reviewKind !== 'none';
  const reviewDisabled = !answerText.trim() || editing || aiBusy;
  const reviewError = failedAction === 'review' ? error : undefined;
  const transcriptionError = failedAction === 'transcribe' ? error : undefined;
  const aiPrimaryText = opi?.polishedText || grammar?.correctedText || (matchMessage ? questionText : undefined);
  const aiExplanation = matchMessage ?? (grammar
    ? [grammar.overallFeedbackZh, ...grammar.issues].map((item) => item.trim()).filter(Boolean).join('\n')
    : undefined);
  const showAiRegion = busy === 'review' || Boolean(reviewError || aiPrimaryText || aiExplanation);

  return (
    <GestureDetector gesture={swipeGesture}>
      <View>
        <View style={styles.header} testID="study-workbench-header">
          <View style={styles.headerTitle}>
            {activeTab === 'mine' ? <MessageSquareText color={colors.mutedForeground} size={15} testID="study-workbench-title-icon-mine" /> : activeTab === 'reference' ? <BookOpenCheck color={colors.mutedForeground} size={15} testID="study-workbench-title-icon-reference" /> : <NotebookPen color={colors.mutedForeground} size={15} testID="study-workbench-title-icon-notes" />}
            <AppText numberOfLines={1} style={styles.headerTitleText} variant="button">{title}</AppText>
          </View>
          {editableTab ? <View style={styles.headerActions}>
            {showReviewAction ? <Pressable
              accessibilityLabel={reviewLabel}
              accessibilityRole="button"
              accessibilityState={{ disabled: reviewDisabled }}
              disabled={reviewDisabled}
              hitSlop={4}
              onPress={() => void reviewAnswer()}
              style={({ pressed }) => [styles.reviewAction, pressed && !reviewDisabled ? styles.pressed : null, reviewDisabled ? styles.headerActionDisabled : null]}
              testID="study-workbench-review-action"
            >
              <AppText color={reviewDisabled ? colors.mutedForeground : colors.primary} variant="caption">{reviewLabel}</AppText>
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
          </View> : null}
        </View>

        <View style={styles.content} testID="study-workbench-content">
          {activeTab === 'mine' ? <View>
            <View style={styles.responseSection}>
              {recordingUri && !consented ? <AppText variant="micro">录音仅用于本次转写。</AppText> : null}
              {editing ? <TextInput accessibilityLabel="我的回答" autoFocus multiline onBlur={() => { onEditingTabChange(undefined); void persistCurrent(); }} onChangeText={changeAnswer} onContentSizeChange={({ nativeEvent }) => setAnswerInputHeight(Math.max(92, Math.ceil(nativeEvent.contentSize.height)))} placeholder={busy === 'transcribe' ? '正在转写…' : '输入回答'} placeholderTextColor={colors.mutedForeground} ref={answerInputRef} scrollEnabled={false} style={[styles.input, { height: answerInputHeight }]} textAlignVertical="top" value={answerText} /> : <View accessibilityLabel="我的回答内容" style={styles.input}><AppText color={answerText ? colors.foreground : colors.mutedForeground}>{answerText || (busy === 'transcribe' ? '正在转写…' : '录音或编辑后，回答会显示在这里')}</AppText></View>}
              {transcriptionError ? <AppText color={colors.destructive} variant="caption">{transcriptionError}</AppText> : null}
              {autoSaveError ? <AppText accessibilityLiveRegion="assertive" color={colors.destructive} variant="micro">{autoSaveError}</AppText> : null}
            </View>
            {showAiRegion ? <View style={styles.aiRegion} testID="study-workbench-ai-region">
              {busy === 'review' ? <AppText color={colors.mutedForeground}>正在分析表达…</AppText> : reviewError ? <>
                <AppText accessibilityLiveRegion="assertive" color={colors.destructive}>{reviewError}</AppText>
                <Pressable accessibilityLabel="重试分析表达" accessibilityRole="button" onPress={() => void reviewAnswer()} style={({ pressed }) => [styles.aiRetry, pressed ? styles.pressed : null]} testID="study-workbench-ai-retry"><AppText color={colors.primary} variant="caption">重试</AppText></Pressable>
              </> : <>
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
            {activeTab === 'mine' && (failedAction === 'transcribe' || (transcriptionAttempted && !answerText.trim())) && recordingUri && !aiBusy ? <Pressable accessibilityLabel="重试语音转写" accessibilityRole="button" onPress={() => void transcribe()} style={styles.action}><AppText color={colors.primary} variant="micro">重试转写</AppText></Pressable> : null}
          </View>
        </View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between', minHeight: 52, paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  headerTitle: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[2], minWidth: 0 },
  headerTitleText: { flexShrink: 1 },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: spacing[1.5] },
  reviewAction: { alignItems: 'center', backgroundColor: 'transparent', borderColor: colors.primary20, borderRadius: radii.full, borderWidth: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing[3] },
  editAction: { alignItems: 'center', backgroundColor: 'transparent', borderRadius: radii.full, borderWidth: 0, justifyContent: 'center', minHeight: 36, minWidth: 40, paddingHorizontal: spacing[2] },
  headerActionDisabled: { opacity: 0.45 },
  content: { paddingHorizontal: 0 },
  responseSection: { gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  referenceSection: { paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  input: { backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0, color: colors.foreground, minHeight: 92, paddingHorizontal: 0, paddingVertical: spacing[2] },
  aiRegion: { backgroundColor: colors.primary06, borderRadius: 0, borderWidth: 0, gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[5], width: '100%' },
  aiPrimaryText: { lineHeight: 24 },
  aiDivider: { backgroundColor: colors.primary20, height: StyleSheet.hairlineWidth, width: '100%' },
  aiExplanation: { lineHeight: 22 },
  aiRetry: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.full, justifyContent: 'center', minHeight: 36, paddingHorizontal: spacing[2] },
  footer: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40, paddingBottom: spacing[2], paddingHorizontal: spacing[3], paddingTop: spacing[1] },
  dots: { alignItems: 'center', backgroundColor: 'transparent', borderWidth: 0, flexDirection: 'row', height: 28 },
  dotTarget: { alignItems: 'center', height: 28, justifyContent: 'center', width: 18 },
  dot: { backgroundColor: colors.mutedForeground, borderRadius: radii.full, height: 4, opacity: 0.32, width: 4 },
  dotActive: { backgroundColor: colors.primary, height: 4, opacity: 1, width: 14 },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end' },
  action: { alignItems: 'center', borderRadius: radii.full, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing[2.5] },
  pressed: { opacity: 0.72 },
});
