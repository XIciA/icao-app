import { usePreventRemove } from '@react-navigation/native';
import type { WordLookupResult } from '@icao/contracts';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, Flag, Grid3X3, Languages, WifiOff } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CenteredState } from '@/components/states/CenteredState';
import { AppText, BottomSheet, Button } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';
import { acceptAiConsent, hasAiConsent, wordLookup } from '@/features/ai/ai-client';

import { useQuestionAnnotations } from '../annotations/use-question-annotations';
import type { AnnotationTextBlockId } from '../annotations/types';
import { useStudySession } from '../hooks/useStudySession';
import { useQuestionBankAsset } from '../hooks/useQuestionBankAsset';
import { getConnectivity, subscribeConnectivity, type Connectivity } from '../platform/network-service';
import type { QuestionBankCategory, QuestionBankDataset, QuestionBankTopic } from '../types';
import { AnnotationToolbar } from './AnnotationToolbar';
import { AnswerCardSheet } from './AnswerCardSheet';
import { InteractiveStudyText } from './InteractiveStudyText';
import { StudyAudioPlayer } from './StudyAudioPlayer';
import { StudyCardStack } from './StudyCardStack';
import { StudyReport } from './StudyReport';
import { StudyTaskRenderer } from './StudyTaskRenderer';
import { StudyWorkbench } from './StudyWorkbench';

type LookupRequest = { word: string; sentence: string; blockLabel: string };
type Props = { dataset: QuestionBankDataset; category: QuestionBankCategory; topic: QuestionBankTopic; initialCardId?: string; returnTo?: 'annotations' };
const toneColors = { green: '#45A26B', yellow: '#D6A72D', red: '#D94A53', blue: colors.primary } as const;

export function QuestionBankStudyScreen({ dataset, category, topic, initialCardId, returnTo }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useStudySession({ dataset, category, topic, initialCardId });
  const [answerCardVisible, setAnswerCardVisible] = useState(false);
  const [exitVisible, setExitVisible] = useState(false);
  const [connectivity, setConnectivity] = useState<Connectivity>('unknown');
  const [activeHighlightId, setActiveHighlightId] = useState('green');
  const [lookup, setLookup] = useState<LookupRequest>();
  const [lookupResult, setLookupResult] = useState<WordLookupResult>();
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string>();
  const [aiConsented, setAiConsented] = useState(false);
  const [finishError, setFinishError] = useState<string>();
  const card = session.card;
  const audioAsset = useQuestionBankAsset(card?.audio);
  const target = card ? { bankId: dataset.id, categoryId: category.id, topicId: topic.id, cardId: card.id } : undefined;
  const annotations = useQuestionAnnotations(target);

  usePreventRemove(!session.report, () => setExitVisible(true));

  useEffect(() => {
    let active = true;
    void getConnectivity().then((state) => { if (active) setConnectivity(state); });
    const unsubscribe = subscribeConnectivity(setConnectivity);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => { void hasAiConsent().then(setAiConsented); }, []);

  useEffect(() => {
    setLookupResult(undefined);
    setLookupError(undefined);
  }, [lookup?.sentence, lookup?.word]);

  async function runLookup() {
    if (!lookup || !card) return;
    setLookupBusy(true);
    setLookupError(undefined);
    try {
      if (!aiConsented) {
        await acceptAiConsent();
        setAiConsented(true);
      }
      const module = dataset.id === 'sentences900' ? 'sentence900'
        : dataset.id === 'radiotelephony' ? 'atc'
          : dataset.id === 'storytelling' ? 'story'
            : dataset.id;
      setLookupResult(await wordLookup({ module, questionId: card.id, word: lookup.word, sentence: lookup.sentence }));
    } catch {
      setLookupError('AI 查词暂时失败，请检查网络后重试。');
    } finally {
      setLookupBusy(false);
    }
  }

  const selectedTagColors = useMemo(() => (annotations.entry?.tagIds ?? []).flatMap((id) => {
    const definition = annotations.tagDefinitions.find((item) => item.id === id);
    return definition ? [toneColors[definition.color]] : [];
  }), [annotations.entry?.tagIds, annotations.tagDefinitions]);

  function lookupWord(blockLabel: string, value: { word: string; sentence: string }) {
    if (value.word) setLookup({ ...value, blockLabel });
  }

  function toggleHighlight(value: { blockId: AnnotationTextBlockId; wordIndex: number; quote: string; sentence: string; sourceText: string }) {
    if (!card) return;
    session.markCompleted(card.id);
    void annotations.toggleHighlight({ ...value, colorId: activeHighlightId });
  }

  function sessionAnnotationMetrics() {
    const cardIds = new Set(Array.from(session.visitedIndexes).flatMap((index) => topic.cards[index]?.id ?? []));
    const entries = Object.values(annotations.store.entries).filter((entry) => entry.bankId === dataset.id && entry.categoryId === category.id && entry.topicId === topic.id && cardIds.has(entry.cardId));
    return {
      annotationCount: entries.reduce((count, entry) => count + entry.tagIds.length + entry.highlights.length, 0),
      noteCount: entries.filter((entry) => entry.note.trim()).length,
    };
  }

  async function finish(reason: 'abort' | 'complete') {
    setFinishError(undefined);
    try {
      await session.finish(reason, sessionAnnotationMetrics());
      setExitVisible(false);
    } catch {
      setFinishError('学习报告保存失败，请重试。');
    }
  }

  if (session.report) {
    return <StudyReport interaction={dataset.study.interaction} noteCount={session.report.noteCount ?? 0} onReturn={() => returnTo === 'annotations' ? router.replace('/annotations') : router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: dataset.id } })} record={session.report} />;
  }
  if (!session.hydrated) return <SafeAreaView style={styles.state}><AppText variant="caption">正在恢复学习进度…</AppText></SafeAreaView>;
  if (session.loadError || !card) return <SafeAreaView style={styles.state}><CenteredState actionLabel="重新加载" description={session.loadError ?? '当前题目不存在，请返回题库后重试。'} onAction={session.retryHydration} title="学习内容加载失败" tone="destructive" /></SafeAreaView>;

  const entry = annotations.entry;
  const transcript = (
    <ScrollView contentContainerStyle={styles.cardScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionTitle}><Languages color={colors.mutedForeground} size={15} /><AppText variant="button">{session.behavior.transcriptLabel}</AppText></View>
      <InteractiveStudyText blockId="question" definitions={annotations.highlightDefinitions} dictionaryMode={session.toolMode === 'dictionary'} highlightMode={session.toolMode === 'highlight'} highlights={entry?.highlights ?? []} onHighlight={toggleHighlight} onLookup={(value) => lookupWord(session.behavior.transcriptLabel, value)} text={card.audioText} />
      {card.audioTextZh ? <AppText style={styles.translation}>{card.audioTextZh}</AppText> : null}
    </ScrollView>
  );
  const referenceContent = (
    <View style={styles.referenceContent}>
      <InteractiveStudyText blockId="reference" definitions={annotations.highlightDefinitions} dictionaryMode={session.toolMode === 'dictionary'} highlightMode={session.toolMode === 'highlight'} highlights={entry?.highlights ?? []} onHighlight={toggleHighlight} onLookup={(value) => lookupWord(session.behavior.referenceLabel, value)} text={card.referenceText ?? ''} />
      {card.referenceTextZh ? <AppText style={styles.translation}>{card.referenceTextZh}</AppText> : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.topBar}>
        <Pressable accessibilityLabel="结束学习" onPress={() => setExitVisible(true)} style={styles.circleButton}><ChevronLeft color={colors.foreground} size={21} /></Pressable>
        <View style={styles.topSpacer} />
        <Pressable accessibilityLabel="打开答题卡" onPress={() => setAnswerCardVisible(true)} style={styles.counterButton}><Grid3X3 color={colors.mutedForeground} size={15} /><AppText style={styles.counter} variant="button">{session.currentIndex + 1} / {topic.cards.length}</AppText></Pressable>
      </View>
      {connectivity === 'offline' ? <View style={styles.offline}><WifiOff color={colors.mutedForeground} size={15} /><AppText style={styles.offlineCopy} variant="micro">当前处于离线状态；文字学习和本机标注仍可使用。</AppText></View> : null}

      <View style={styles.tools}>
        <Pressable accessibilityLabel={session.revealed ? '收起答案' : '显示答案'} onPress={session.toggleAnswers} style={[styles.answerTool, session.revealed ? styles.toolActive : null]}><Check color={session.revealed ? colors.primary : colors.mutedForeground} size={14} /><AppText color={session.revealed ? colors.primary : colors.mutedForeground} variant="caption">答案</AppText></Pressable>
        <AnnotationToolbar activeHighlightId={activeHighlightId} dictionaryMode={session.toolMode === 'dictionary'} highlightDefinitions={annotations.highlightDefinitions} highlightMode={session.toolMode === 'highlight'} onCreateHighlight={(label, color) => { void annotations.addHighlightDefinition(label, color).then((id) => { if (id) setActiveHighlightId(id); }); }} onCreateTag={(label, color) => { void annotations.addTagDefinition(label, color); }} onDictionaryModeChange={(value) => session.setToolMode(value ? 'dictionary' : undefined)} onHighlightChange={setActiveHighlightId} onHighlightModeChange={(value) => session.setToolMode(value ? 'highlight' : undefined)} onTagToggle={(id) => { void annotations.toggleTag(id); }} resetToken={`${card.id}:${session.revealed}`} selectedTags={entry?.tagIds ?? []} showDictionary={dataset.study.tools.dictionary} showHighlights={dataset.study.tools.highlights} showTags={dataset.study.tools.tags} tagDefinitions={annotations.tagDefinitions} />
      </View>

      <View style={styles.body}>
        <StudyCardStack compact={session.behavior.taskKind === 'choices'} onCollapse={session.collapseAnswers} onReveal={() => session.revealCurrent(true)} primary={<View style={styles.primaryContent}><StudyAudioPlayer autoPlayRequest={session.playRequestToken} generatedAudio={session.behavior.generatedAudio && !card.audio} label={card.taskTitle} onRetry={audioAsset.retry} playbackKey={card.id} resolving={audioAsset.resolving} tagColors={selectedTagColors} uri={audioAsset.uri} /><View style={styles.divider} /><StudyTaskRenderer behavior={session.behavior} card={card} onChoose={session.chooseOption} onClearRecording={session.clearRecording} onRecorded={session.recordAnswer} recording={session.recording} revealed={session.revealed} selectedChoiceIndex={session.cardState?.selectedChoiceIndex} /></View>} revealed={session.revealed} transcript={transcript} workbench={<StudyWorkbench activeTab={session.activeTab} answerText={session.answerText} bankId={dataset.id} bankTitle={dataset.title} cardKey={card.id} categoryTitle={category.name} noteText={entry?.note ?? ''} onAnswerChange={session.updateAnswer} onFeedback={session.markFeedback} onNoteChange={(note) => { void annotations.saveNote(note); }} onRetrySave={() => { void annotations.retrySave(); }} onTabChange={session.setActiveTab} questionText={card.audioText} recordingKey={session.recording ? `${session.recording.uri}:${session.recording.durationMillis}` : undefined} recordingUri={session.recording?.uri} referenceContent={referenceContent} referenceLabel={session.behavior.referenceLabel} reviewKind={session.behavior.reviewKind} saveError={annotations.saveErrorMessage} tabs={session.behavior.workbenchTabs} topicTitle={topic.name} />} />
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
        <Button leading={<Flag color={colors.foreground} size={15} />} onPress={() => setExitVisible(true)} size="sm" variant="outline">结束</Button>
        <Button disabled={session.currentIndex === 0} leading={<ChevronLeft color={colors.foreground} size={16} />} onPress={() => session.goTo(session.currentIndex - 1)} size="sm" variant="outline">上一题</Button>
        <Button onPress={() => session.currentIndex < topic.cards.length - 1 ? session.goTo(session.currentIndex + 1) : void finish('complete')} size="sm">{session.currentIndex < topic.cards.length - 1 ? '下一题' : '完成'} <ChevronRight color={colors.primaryForeground} size={15} /></Button>
      </View>

      <AnswerCardSheet current={session.currentIndex} onClose={() => setAnswerCardVisible(false)} onSelect={(index) => { session.goTo(index); setAnswerCardVisible(false); }} total={topic.cards.length} visible={answerCardVisible} visited={session.visitedIndexes} />
      <BottomSheet accessibilityLabel="结束本次学习" onClose={() => setExitVisible(false)} visible={exitVisible}><View style={styles.sheetContent}><AppText style={styles.center} variant="sectionTitle">结束本次学习？</AppText><AppText style={styles.center}>结束后将生成学习报告，你的标注和笔记会继续保留。</AppText><View style={styles.exitProgress}><AppText variant="caption">当前完成</AppText><AppText style={styles.counter} variant="button">{session.completedCardIds.size} / {topic.cards.length}</AppText></View>{finishError ? <AppText color={colors.destructive} style={styles.center} variant="caption">{finishError}</AppText> : null}<Button onPress={() => setExitVisible(false)} size="lg">继续学习</Button><Button onPress={() => void finish('abort')} size="lg" variant="outline">结束并查看报告</Button></View></BottomSheet>
      <BottomSheet accessibilityLabel="上下文查词" onClose={() => setLookup(undefined)} visible={Boolean(lookup)}><View style={styles.sheetContent}><AppText color={colors.primary} variant="micro">AI 查词</AppText><AppText variant="pageTitle">{lookup?.word}</AppText><AppText variant="caption">{dataset.title} · {card.taskTitle} · {lookup?.blockLabel}</AppText><View style={styles.lookupSentence}><AppText>{lookup?.sentence}</AppText></View>{lookupResult ? <><View style={styles.lookupResult}><AppText variant="button">释义</AppText><AppText>{lookupResult.definition}</AppText></View><View style={styles.lookupResult}><AppText variant="button">本句理解</AppText><AppText>{lookupResult.sentenceMeaning}</AppText></View><AppText color={colors.mutedForeground} variant="micro">{lookupResult.cached ? '已复用相同查询，不重复调用 AI' : 'AI 生成内容，请结合原句学习'}</AppText></> : <><AppText variant="caption">查询会发送所选词与当前句子，不上传录音，也不会进入个人学习记录。</AppText>{lookupError ? <AppText color={colors.destructive} variant="caption">{lookupError}</AppText> : null}<Button disabled={lookupBusy} onPress={() => void runLookup()} size="lg">{lookupBusy ? '正在查询…' : aiConsented ? '查询释义' : '同意 AI 处理并查询'}</Button></>}<Button onPress={() => setLookup(undefined)} size="lg" variant="outline">返回学习</Button></View></BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background, flex: 1 }, state: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center' }, topBar: { alignItems: 'center', flexDirection: 'row', minHeight: 46, paddingHorizontal: spacing[3] }, circleButton: { alignItems: 'center', borderRadius: radii.full, height: 38, justifyContent: 'center', width: 38 }, topSpacer: { flex: 1 }, counterButton: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 34, paddingHorizontal: spacing[3] }, counter: { fontFamily: fonts.monoRegular }, offline: { alignItems: 'center', backgroundColor: colors.secondary, flexDirection: 'row', gap: spacing[2], marginHorizontal: spacing[5], padding: spacing[2] }, offlineCopy: { flex: 1 }, tools: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[2] }, answerTool: { alignItems: 'center', backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 30, paddingHorizontal: spacing[3] }, toolActive: { backgroundColor: colors.primary06, borderColor: colors.primary }, body: { flex: 1, minHeight: 0, paddingHorizontal: spacing[5], paddingTop: spacing[1] }, primaryContent: { gap: spacing[2.5] }, divider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth }, cardScroll: { gap: spacing[2], paddingBottom: spacing[2] }, sectionTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, translation: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, color: colors.mutedForeground, marginTop: spacing[2], paddingTop: spacing[2] }, referenceContent: { gap: spacing[2] }, footer: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between', paddingHorizontal: spacing[5], paddingTop: spacing[2] }, sheetContent: { gap: spacing[3], paddingBottom: spacing[3] }, center: { textAlign: 'center' }, exitProgress: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.xl, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[4] }, lookupSentence: { backgroundColor: colors.secondary, borderRadius: radii.xl, padding: spacing[3] }, lookupResult: { backgroundColor: colors.secondary, borderRadius: radii.xl, gap: spacing[1], padding: spacing[3] },
});
