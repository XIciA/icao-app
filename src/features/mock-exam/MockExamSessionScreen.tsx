import { Check, ChevronLeft, Grid3X3, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, BottomSheet, Button, Card, Tag } from '@/components/ui';
import { ImageQuestionCard } from '@/features/question-bank/components/ImageQuestionCard';
import { StudyAudioPlayer } from '@/features/question-bank/components/StudyAudioPlayer';
import { StudyTaskRenderer } from '@/features/question-bank/components/StudyTaskRenderer';
import { StudyWorkbench } from '@/features/question-bank/components/StudyWorkbench';
import { useQuestionBankAsset } from '@/features/question-bank/hooks/useQuestionBankAsset';
import { getStudyBehavior } from '@/features/question-bank/lib/study-behavior';
import { recordingRepository } from '@/features/question-bank/recording/recording-repository';
import type { RecordingAsset } from '@/features/question-bank/recording/types';
import { colors, radii, spacing } from '@/theme';

import { MOCK_EXAM_MODULE_LABELS, MOCK_EXAM_TYPE_LABELS } from './rules';
import { finishMockExam, makeMockExamDraft, saveMockExamDraft } from './session-storage';
import type { MockExamSession } from './types';

export function MockExamSessionScreen({ session, onDone }: { session: MockExamSession; onDone: (reason: 'abort' | 'complete', answered: number) => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'mine' | 'reference' | 'notes'>('mine');
  const [recordings, setRecordings] = useState<Record<string, RecordingAsset>>({});
  const [revealed, setRevealed] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string>();
  const finished = useRef(false);
  const item = session.items[currentIndex];
  const behavior = getStudyBehavior(item.dataset);
  const audio = useQuestionBankAsset(item.card.kind === 'image' ? undefined : item.card.audio);
  const disabledSwipeGesture = useMemo(() => Gesture.Pan().enabled(false), []);

  useEffect(() => { void saveMockExamDraft(makeMockExamDraft(session, answered)); }, [answered, session]);
  useEffect(() => () => { if (!finished.current) void saveMockExamDraft(makeMockExamDraft(session, answered)); }, [answered, session]);
  useEffect(() => { setRevealed(Boolean(answered.has(item.id))); }, [answered, item.id]);
  useEffect(() => { setActiveTab(behavior.workbenchTabs.includes('mine') ? 'mine' : behavior.workbenchTabs[0] ?? 'notes'); }, [behavior.workbenchTabs, item.id]);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= session.items.length) return;
    setCurrentIndex(index);
    setDirectoryOpen(false);
  }, [session.items]);

  const recordAnswer = useCallback((asset: RecordingAsset) => {
    const old = recordings[item.id];
    setRecordings((current) => ({ ...current, [item.id]: asset }));
    if (old && old.id !== asset.id) recordingRepository.discard(old);
    setAnswered((current) => new Set(current).add(item.id));
    setRevealed(true);
  }, [item.id, recordings]);
  const choose = useCallback((choice: number) => {
    setChoices((current) => ({ ...current, [item.id]: choice }));
    setAnswered((current) => new Set(current).add(item.id));
    setRevealed(true);
  }, [item.id]);
  const clear = useCallback(() => {
    const old = recordings[item.id];
    if (old) recordingRepository.discard(old);
    setRecordings((current) => { const next = { ...current }; delete next[item.id]; return next; });
  }, [item.id, recordings]);
  const finish = useCallback(async (reason: 'abort' | 'complete') => {
    if (finishing || finished.current) return;
    setFinishing(true); setError(undefined);
    try {
      const draft = makeMockExamDraft(session, answered);
      await saveMockExamDraft(draft);
      await finishMockExam(draft, reason);
      finished.current = true;
      onDone(reason, answered.size);
    } catch {
      setError('模考记录保存失败，请检查后重试。');
    } finally { setFinishing(false); }
  }, [answered, finishing, onDone, session]);
  const currentSection = session.sections.find((section) => section.id === item.sectionId);
  const directoryGroups = useMemo(() => session.sections.map((section) => ({ ...section, start: section.items[0]?.number ?? 0 })), [session.sections]);
  const allAnswered = answered.size === session.items.length;
  const nextLabel = currentIndex === session.items.length - 1 ? allAnswered ? '完成考试' : '结束并保存记录' : '下一题';
  const task = <StudyTaskRenderer behavior={behavior} card={item.card} onChoose={choose} selectedChoiceIndex={choices[item.id]} revealed={revealed} recording={recordings[item.id]} onClearRecording={clear} onRecorded={recordAnswer} sessionId={session.id} />;

  return <SafeAreaView edges={['top']} style={styles.root}>
    <View style={styles.top}><Pressable accessibilityLabel="结束模考" disabled={finishing} onPress={() => void finish('abort')} style={styles.exit}><ChevronLeft color={colors.destructive} size={20} /><AppText color={colors.destructive} variant="button">结束</AppText></Pressable><View style={styles.topTitle}><AppText numberOfLines={1} variant="button">学习型模考</AppText><AppText numberOfLines={1} variant="micro">{MOCK_EXAM_TYPE_LABELS[session.config.examType]}</AppText></View><Pressable accessibilityLabel="打开试卷目录" onPress={() => setDirectoryOpen(true)} style={styles.directory}><Grid3X3 color={colors.mutedForeground} size={15} /><AppText variant="button">{currentIndex + 1}/{session.items.length}</AppText></Pressable></View>
    <ScrollView contentContainerStyle={styles.body}><View style={styles.sectionRow}><Tag tone="accent">{MOCK_EXAM_MODULE_LABELS[item.moduleId]}</Tag><AppText style={styles.sectionText} variant="caption">{currentSection?.title}</AppText></View><Card elevated style={styles.prompt}><AppText color={colors.primary} variant="micro">第 {item.number} 题</AppText>{item.card.kind === 'image' ? <ImageQuestionCard imageAlt={item.card.imageAlt} imagePath={item.card.image} onDisplayed={() => undefined} /> : <><AppText style={styles.question} variant="sectionTitle">{item.card.audioText}</AppText>{item.card.audioTextZh ? <AppText style={styles.translation}>{item.card.audioTextZh}</AppText> : null}</>}</Card>
      {item.card.kind === 'image' ? null : <StudyAudioPlayer autoPlayRequest={1} generatedAudio={behavior.generatedAudio && !item.card.audio} label={item.card.taskTitle} onRetry={audio.retry} resolving={audio.resolving} playbackKey={item.id} uri={audio.uri} />}
      {task}
      {item.card.kind === 'image' ? null : <StudyWorkbench activeTab={activeTab} answerText={answers[item.id] ?? ''} bankId={item.dataset.id} bankTitle={item.dataset.title} cardKey={item.id} categoryTitle={item.category.name} noteText="" onAnswerChange={(value) => setAnswers((current) => ({ ...current, [item.id]: value }))} onEditingTabChange={() => undefined} onFeedback={() => undefined} onNoteChange={() => undefined} onRetrySave={() => undefined} onTabChange={setActiveTab} persistAiResult={false} questionText={item.card.audioText} recordingUri={recordings[item.id]?.uri} referenceContent={<AppText>{item.card.referenceText}</AppText>} referenceLabel={behavior.referenceLabel} reviewKind={behavior.reviewKind} sessionId={session.id} sessionStartedAt={session.startedAt} swipeGesture={disabledSwipeGesture} tabs={behavior.workbenchTabs} topicTitle={item.topic.name} />}
      {revealed && item.card.kind !== 'image' && item.card.referenceText ? <Card style={styles.reference}><AppText color={colors.primary} variant="button">{behavior.referenceLabel}</AppText><AppText>{item.card.referenceText}</AppText>{item.card.referenceTextZh ? <AppText style={styles.translation}>{item.card.referenceTextZh}</AppText> : null}</Card> : null}
      {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
      <View style={styles.actions}><Button disabled={currentIndex === 0 || finishing} onPress={() => goTo(currentIndex - 1)} variant="outline">上一题</Button><Button disabled={finishing} onPress={() => currentIndex === session.items.length - 1 ? void finish(allAnswered ? 'complete' : 'abort') : goTo(currentIndex + 1)}>{nextLabel}</Button></View>
    </ScrollView>
    <BottomSheet accessibilityLabel="本套试卷目录" onClose={() => setDirectoryOpen(false)} visible={directoryOpen}><View style={styles.sheetHeader}><View><AppText variant="sectionTitle">本套试卷目录</AppText><AppText variant="caption">已作答 {answered.size}/{session.items.length}</AppText></View><Pressable accessibilityLabel="关闭试卷目录" onPress={() => setDirectoryOpen(false)}><X color={colors.foreground} size={20} /></Pressable></View><ScrollView contentContainerStyle={styles.directoryList}>{directoryGroups.map((section) => <View key={section.id} style={styles.group}><AppText variant="button">{section.title}</AppText><View style={styles.numbers}>{section.items.map((entry) => { const current = entry.id === item.id; const done = answered.has(entry.id); return <Pressable key={entry.id} accessibilityLabel={`跳转第 ${entry.number} 题`} onPress={() => goTo(entry.number - 1)} style={[styles.number, current ? styles.currentNumber : done ? styles.doneNumber : null]}><AppText color={current ? colors.primaryForeground : done ? colors.primary : colors.foreground} variant="button">{entry.number}</AppText>{done && !current ? <Check color={colors.primary} size={11} style={styles.numberCheck} /> : null}</Pressable>; })}</View></View>)}</ScrollView></BottomSheet>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 }, top: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 60, paddingHorizontal: spacing[4] }, exit: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] }, topTitle: { alignItems: 'center', flex: 1, gap: 1 }, directory: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] }, body: { gap: spacing[4], padding: spacing[5], paddingBottom: spacing[6] }, sectionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, sectionText: { color: colors.mutedForeground, flex: 1 }, prompt: { gap: spacing[3] }, question: { lineHeight: 28 }, translation: { color: colors.mutedForeground }, reference: { gap: spacing[2] }, actions: { flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' }, sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, directoryList: { gap: spacing[4], paddingTop: spacing[4] }, group: { gap: spacing[2] }, numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }, number: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: 40, justifyContent: 'center', position: 'relative', width: 40 }, currentNumber: { backgroundColor: colors.primary, borderColor: colors.primary }, doneNumber: { backgroundColor: colors.primary10, borderColor: colors.primary20 }, numberCheck: { position: 'absolute', right: 3, top: 3 },
});
