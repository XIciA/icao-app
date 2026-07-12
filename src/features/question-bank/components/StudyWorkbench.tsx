import type { GrammarReviewResult, OpiAnalysisResult } from '@icao/contracts';
import { Check, Eraser, Mic, NotebookPen, Save, Sparkles } from 'lucide-react-native';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { acceptAiConsent, grammarReview, hasAiConsent, polishExpression, transcribeRecording } from '@/features/ai/ai-client';
import { exactMatch } from '@/features/ai/exact-match';
import { AppText, Button } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { sqliteLearningStore } from '../platform/learning-store';
import type { QuestionBankId, StudyConsoleTab, StudyReviewKind } from '../types';

const labels: Record<StudyConsoleTab, string> = { mine: '我的回答', reference: '参考答案', notes: '笔记' };

function stableResultId(cardKey: string, value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `ai-${cardKey}-${(hash >>> 0).toString(36)}`;
}

type Props = {
  cardKey: string;
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
  referenceContent: ReactNode;
  noteText: string;
  saveError?: string;
  onTabChange: (tab: StudyConsoleTab) => void;
  onAnswerChange: (text: string) => void;
  onNoteChange: (text: string) => void;
  onRetrySave: () => void;
  onFeedback: () => void;
};

export function StudyWorkbench(props: Props) {
  const { activeTab, answerText, bankId, bankTitle, cardKey, categoryTitle, noteText, onAnswerChange, onFeedback, onNoteChange, onRetrySave, onTabChange, questionText, recordingKey, recordingUri, referenceContent, referenceLabel, reviewKind, saveError, tabs, topicTitle } = props;
  const [rawTranscript, setRawTranscript] = useState<string>();
  const [grammar, setGrammar] = useState<GrammarReviewResult>();
  const [opi, setOpi] = useState<OpiAnalysisResult>();
  const [matchMessage, setMatchMessage] = useState<string>();
  const [busy, setBusy] = useState<'transcribe' | 'review' | 'save'>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [consented, setConsented] = useState(false);
  const [answerInputHeight, setAnswerInputHeight] = useState(92);
  const [noteInputHeight, setNoteInputHeight] = useState(92);
  const activeRequest = useRef<AbortController | undefined>(undefined);
  const lastAutoTranscribeKey = useRef<string | undefined>(undefined);
  const activeIndex = Math.max(0, tabs.indexOf(activeTab));
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderRelease: (_, gesture) => {
      if (tabs.length < 2) return;
      if (gesture.dx < -45) onTabChange(tabs[(activeIndex + 1) % tabs.length]);
      if (gesture.dx > 45) onTabChange(tabs[(activeIndex - 1 + tabs.length) % tabs.length]);
    },
  }), [activeIndex, onTabChange, tabs]);

  useEffect(() => {
    setRawTranscript(undefined); setGrammar(undefined); setOpi(undefined); setMatchMessage(undefined); setError(undefined); setSaved(false);
  }, [cardKey]);
  useEffect(() => { void hasAiConsent().then(setConsented); }, []);
  useEffect(() => { setSaved(false); }, [answerText, grammar, opi]);

  const ensureConsent = useCallback(async () => {
    if (consented) return;
    await acceptAiConsent();
    setConsented(true);
  }, [consented]);

  const transcribe = useCallback(async () => {
    if (!recordingUri) return;
    setBusy('transcribe'); setError(undefined);
    const controller = new AbortController(); activeRequest.current = controller;
    try {
      await ensureConsent();
      const result = await transcribeRecording(recordingUri, controller.signal);
      setRawTranscript(result.rawTranscript);
      onAnswerChange(result.transcript);
      setGrammar(undefined); setOpi(undefined); setMatchMessage(undefined);
    } catch { setError(controller.signal.aborted ? '已取消转写，录音和当前文本仍保留。' : '语音转写失败，请检查网络或重新录音后重试。'); }
    finally { if (activeRequest.current === controller) activeRequest.current = undefined; setBusy(undefined); }
  }, [ensureConsent, onAnswerChange, recordingUri]);

  useEffect(() => {
    if (!recordingKey || !recordingUri || lastAutoTranscribeKey.current === recordingKey) return;
    lastAutoTranscribeKey.current = recordingKey;
    void transcribe();
  }, [recordingKey, recordingUri, transcribe]);

  async function reviewAnswer() {
    if (!answerText.trim()) return;
    setBusy('review'); setError(undefined); onFeedback();
    const controller = new AbortController(); activeRequest.current = controller;
    try {
      if (reviewKind === 'exact-match') {
        const result = exactMatch(questionText, answerText);
        setMatchMessage(result.exact
          ? '与原文逐词一致。'
          : `发现差异：缺失 ${result.summary.missing}、多余 ${result.summary.extra}、替换 ${result.summary.replace}、顺序 ${result.summary.order}。`);
        return;
      }
      await ensureConsent();
      const module = bankId === 'radiotelephony' ? 'atc' : bankId === 'storytelling' ? 'story' : 'opi';
      const input = { module, questionId: cardKey, questionText, transcript: answerText } as const;
      if (reviewKind === 'opi-analysis') {
        const grammarResult = grammar ?? await grammarReview(input, controller.signal);
        setGrammar(grammarResult);
        const polished = await polishExpression({ ...input, module: 'opi', correctedText: grammarResult.correctedText }, controller.signal);
        setOpi({ grammar: grammarResult, polishedText: polished.polishedText, polishPromptVersion: polished.promptVersion });
      } else {
        setGrammar(await grammarReview(input, controller.signal)); setOpi(undefined);
      }
    } catch { setError(controller.signal.aborted ? '已取消分析，当前转写和已完成结果仍保留。' : 'AI 分析暂时失败，请稍后重试。'); }
    finally { if (activeRequest.current === controller) activeRequest.current = undefined; setBusy(undefined); }
  }

  async function saveAiResult() {
    if (!answerText.trim()) return;
    setBusy('save'); setError(undefined);
    try {
      await sqliteLearningStore.addRecord({
        schemaVersion: 2,
        id: stableResultId(cardKey, JSON.stringify({ answerText, grammar, polishedText: opi?.polishedText })),
        bankId,
        bankTitle,
        categoryTitle,
        topicTitle,
        completedCount: 1,
        totalCount: 1,
        correctCount: 0,
        feedbackCount: grammar || opi || matchMessage ? 1 : 0,
        durationSeconds: 0,
        reason: 'complete',
        createdAt: new Date().toISOString(),
        recordType: 'ai_result',
        aiResult: {
          questionId: cardKey,
          rawTranscript,
          transcript: answerText,
          grammar: grammar ? { overallFeedbackZh: grammar.overallFeedbackZh, correctedText: grammar.correctedText, issues: grammar.issues } : undefined,
          polishedText: opi?.polishedText,
        },
      });
      setSaved(true);
    } catch { setError('学习结果保存失败，请重试。'); }
    finally { setBusy(undefined); }
  }

  const title = activeTab === 'reference' ? referenceLabel : labels[activeTab];
  const reviewLabel = reviewKind === 'exact-match' ? '对比原文' : reviewKind === 'opi-analysis' ? '分析表达' : '检查语法';

  return (
    <View>
      <View {...panResponder.panHandlers} style={styles.header}>
        <View style={styles.titleRow}>{activeTab === 'mine' ? <Mic color={colors.primary} size={16} /> : activeTab === 'notes' ? <NotebookPen color={colors.primary} size={16} /> : <Check color={colors.primary} size={16} />}<AppText color={colors.primary} variant="button">{title}</AppText></View>
        {activeTab === 'mine' ? <Pressable accessibilityLabel="清空我的回答" disabled={!answerText} onPress={() => onAnswerChange('')} style={[styles.smallAction, !answerText ? styles.disabled : null]}><Eraser color={colors.mutedForeground} size={13} /><AppText variant="micro">清空</AppText></Pressable> : null}
      </View>

      <View style={styles.content} testID="study-workbench-content">
        {activeTab === 'mine' ? <View style={styles.panel}>
          {recordingUri && !consented ? <AppText variant="micro">录音仅用于本次转写；服务端不长期保存原始音频。</AppText> : null}
          <TextInput accessibilityLabel="我的回答" multiline onChangeText={onAnswerChange} onContentSizeChange={({ nativeEvent }) => setAnswerInputHeight(Math.max(92, Math.ceil(nativeEvent.contentSize.height)))} placeholder={busy === 'transcribe' ? '正在自动转写录音…' : '录音转写后可编辑，也可以直接输入回答…'} placeholderTextColor={colors.mutedForeground} scrollEnabled={false} style={[styles.input, { height: answerInputHeight }]} textAlignVertical="top" value={answerText} />
          {reviewKind !== 'none' ? <Button disabled={!answerText.trim() || Boolean(busy)} leading={<Sparkles color={answerText.trim() ? colors.foreground : colors.mutedForeground} size={14} />} onPress={() => void reviewAnswer()} size="sm" variant="outline">{busy === 'review' ? '正在分析…' : reviewLabel}</Button> : null}
          {matchMessage ? <View style={styles.feedback}><AppText variant="caption">{matchMessage}</AppText><AppText variant="button">正确原文</AppText><AppText>{questionText}</AppText></View> : null}
          {grammar ? <View style={styles.feedback}><AppText variant="button">语法反馈</AppText><AppText variant="caption">{grammar.overallFeedbackZh}</AppText><AppText variant="button">修改后表达</AppText><AppText>{grammar.correctedText}</AppText>{grammar.issues.map((issue, index) => <View key={`${issue}-${index}`} style={styles.issue}><AppText variant="caption">{issue}</AppText></View>)}</View> : null}
          {opi ? <View style={styles.feedback}><AppText variant="button">更自然的民航口语表达</AppText><AppText>{opi.polishedText}</AppText></View> : null}
          {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
          {busy === 'transcribe' || busy === 'review' ? <Button onPress={() => activeRequest.current?.abort()} size="sm" variant="outline">取消当前 AI 操作</Button> : null}
          {answerText.trim() ? <Button disabled={Boolean(busy) || saved} leading={<Save color={saved ? colors.mutedForeground : colors.primaryForeground} size={14} />} onPress={() => void saveAiResult()} size="sm">{saved ? '已保存到学习记录' : busy === 'save' ? '正在保存…' : '保存到学习记录'}</Button> : null}
          <AppText color={colors.mutedForeground} variant="micro">只有点击“保存到学习记录”后，当前转写、纠错和润色结果才会保存并参与账号同步。</AppText>
        </View> : activeTab === 'reference' ? referenceContent : <View style={styles.panel}><TextInput accessibilityLabel="学习笔记" multiline onChangeText={onNoteChange} onContentSizeChange={({ nativeEvent }) => setNoteInputHeight(Math.max(92, Math.ceil(nativeEvent.contentSize.height)))} placeholder="记生词、要点、易错表达…" placeholderTextColor={colors.mutedForeground} scrollEnabled={false} style={[styles.input, { height: noteInputHeight }]} textAlignVertical="top" value={noteText} />{saveError ? <View style={styles.errorRow}><AppText color={colors.destructive} style={styles.flex} variant="micro">{saveError}</AppText><Pressable onPress={onRetrySave}><AppText color={colors.destructive} variant="micro">重试</AppText></Pressable></View> : <AppText color={colors.primary} variant="micro">已保存到本机并进入同步队列</AppText>}</View>}
      </View>
      {tabs.length > 1 ? <View style={styles.dots}>{tabs.map((tab) => <Pressable accessibilityLabel={`切换到${tab === 'reference' ? referenceLabel : labels[tab]}`} key={tab} onPress={() => onTabChange(tab)} style={[styles.dot, tab === activeTab ? styles.dotActive : null]} />)}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: spacing[4], paddingTop: spacing[2] }, titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, smallAction: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, flexDirection: 'row', gap: spacing[1], paddingHorizontal: spacing[2.5], paddingVertical: spacing[1.5] }, disabled: { opacity: 0.4 }, content: { paddingBottom: spacing[2], paddingHorizontal: spacing[4] }, panel: { gap: spacing[2] }, input: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, color: colors.foreground, minHeight: 92, padding: spacing[3] }, feedback: { backgroundColor: colors.primary06, borderColor: colors.primary20, borderRadius: radii.lg, borderWidth: 1, gap: spacing[2], padding: spacing[3] }, issue: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[1], paddingTop: spacing[2] }, errorRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, flex: { flex: 1 }, dots: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5], justifyContent: 'center', paddingBottom: spacing[3], paddingTop: spacing[1] }, dot: { backgroundColor: colors.border, borderRadius: radii.full, height: 6, width: 6 }, dotActive: { backgroundColor: colors.primary, width: 18 },
});
