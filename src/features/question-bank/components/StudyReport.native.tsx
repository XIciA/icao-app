import { sqliteLearningStore } from '../platform/learning-store.native';
import { TopBar } from '@/components/navigation/TopBar';
import { LocalBackLoadingScreen } from '@/components/states/LocalBackLoadingScreen.native';
import { answerCardMarkers } from '../annotations/answer-card-markers.native';
import { readAnnotationStore } from '../annotations/annotation-store.native';
import { AnswerCardSheet } from './AnswerCardSheet.native';
import { useLocalBack } from '@/components/navigation/useLocalBack';
import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import { TutorialCoach, useTutorial } from '@/features/usage-guide/TutorialContext';
import { SessionRecapList } from './SessionRecapList.native';
import { objectiveReview, selectReview } from '../lib/session-recap';
import { CheckCircle2, ChevronRight, Flag } from '@/components/ui/icons';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { loadLearningRecordReview } from '../platform/learning-record-storage.native';
import { getStudyReview, toStudyReviewPackage } from '../lib/study-review.native';
import type { LearningRecord, QuestionBankStudyPackage, StudyInteraction, QuestionBankStudyItem } from '../types';
const HistoryScreen = lazy(() => import('./QuestionBankStudyScreen.native').then(module => ({ default: module.QuestionBankStudyScreen })));
export function StudyReport({ answerScope, localReturn, record, onReturn, returnLabel, interaction, onContinue, onEnd, onExitWithoutSave, busy, error: externalError }: { answerScope?: { items: QuestionBankStudyItem[]; current: number }; localReturn?: boolean; onContinue?: () => void; onEnd?: () => void; onExitWithoutSave?: () => void; busy?: boolean; error?: string; record: LearningRecord; noteCount: number; onReturn: () => void; interaction: StudyInteraction; returnLabel?: string }) {
  const tutorial = useTutorial();
  const guide = useGuide();
  const offer = guide?.offer;
  useEffect(() => { if (record.recordType !== 'mock_exam' && !externalError) offer?.('study', ['study-recap']); }, [offer, record.id, record.recordType, externalError]);
  const [review, setReview] = useState<QuestionBankStudyPackage>();
  const [list,setList] = useState<'annotations'|'words'|'wrong'>();
  const [detail,setDetail] = useState(record);
  const objective = objectiveReview(record.studyReview);
  const [markers, setMarkers] = useState<ReturnType<typeof answerCardMarkers>>([]);
  const [answerCard, setAnswerCard] = useState(false);
  const [answerMarked, setAnswerMarked] = useState<Set<number>>();
  const snapshot = getStudyReview(detail);
  const answerItems = answerScope?.items ?? snapshot?.items ?? [];
  const [opening, setOpening] = useState(false);
  const openingRequest = useRef(0);
  const openingBusy = useRef(false);
  useEffect(() => () => { openingRequest.current++; }, []);
  const [error, setError] = useState('');
  const exam = record.recordType === 'mock_exam';
  const complete = record.reason === 'complete';
  const listening = record.mockExam?.listeningResult;
  async function open(itemId?: string) {
    if (openingBusy.current) return;
    openingBusy.current = true;
    const request = ++openingRequest.current;
    setOpening(true); setError('');
    try { const loaded = await loadLearningRecordReview(record); if (request !== openingRequest.current) return; setDetail(loaded); const result = toStudyReviewPackage(itemId ? selectReview(loaded, new Set([itemId])) : loaded); if (!result) throw new Error('missing_review'); setAnswerCard(false); setReview(result); tutorial?.event('recap'); }
    catch { if (request === openingRequest.current) setError('记录暂时无法打开，请重试。'); }
    finally { if (request === openingRequest.current) { openingBusy.current = false; setOpening(false); } }
  }
  async function openAnswerCard() {
    if (openingBusy.current) return;
    openingBusy.current = true;
    const request = ++openingRequest.current;
    setOpening(true); setError('');
    try {
      const loaded = await loadLearningRecordReview(record);
      const saved = getStudyReview(loaded);
      if (!saved) throw new Error('missing_review');
      const items = answerScope?.items ?? saved.items;
      const annotations = await readAnnotationStore();
      // Re-read the existing progress owner: a nested answer-card session may
      // have learned more questions while this completion screen stayed mounted.
      const topics = new Map(items.map(item => [`${item.dataset.id}:${item.topic.id}`, item.topic]));
      const states = answerScope ? new Map(await Promise.all([...topics].map(async ([key, topic]) =>
        [key, await sqliteLearningStore.getTopicStates(topic)] as const))) : undefined;
      const marked = new Set(items.flatMap((item, index) =>
        (states ? states.get(`${item.dataset.id}:${item.topic.id}`)?.[item.card.id]?.visited : saved.states[item.id]?.visited) ? [index] : []));
      if (request !== openingRequest.current) return;
      setAnswerMarked(marked);
      setMarkers(answerCardMarkers(items, annotations)); setDetail(loaded); setAnswerCard(true);
    }
    catch { if (request === openingRequest.current) setError('记录暂时无法打开，请重试。'); }
    finally { if (request === openingRequest.current) { openingBusy.current = false; setOpening(false); } }
  }
  const back = useLocalBack(!review && (Boolean(list) || Boolean(localReturn && !onContinue)), () => { openingRequest.current++; openingBusy.current = false; setOpening(false); if (list) setList(undefined); else onReturn(); });
  const returnToReport = () => setReview(undefined);
  if (review) return <NativeScreenBoundary title="学习记录" onExit={returnToReport} resetKey={review.id}><Suspense fallback={<LocalBackLoadingScreen title="学习记录" onBack={returnToReport} />}><HistoryScreen studyPackage={review} onReturn={returnToReport} returnLabel={list === 'words' ? '返回查词与收藏' : list === 'annotations' ? '返回标注题目' : list === 'wrong' ? '返回错题回顾' : '返回结束页面'} /></Suspense></NativeScreenBoundary>;
  if (list) return <SessionRecapList kind={list} record={detail} onBack={back} onOpen={id => { void open(id); }} />;
  return <Screen scroll contentStyle={styles.screen} header={<TopBar title="学习回顾" onBack={back} />}>
    <TutorialCoach inset={false} />
    <View style={styles.hero}><View style={styles.icon}>{complete ? <CheckCircle2 color={colors.primary} size={34} /> : <Flag color={colors.primary} size={32} />}</View>
      {!onContinue && exam && !complete ? <Tag tone="accent">未完成</Tag> : null}
      <AppText variant="pageTitle">{onContinue || (listening && record.mockExam?.moduleIds.length === 1) ? '听力成绩' : exam ? '本次模拟考试已结束' : '本次学习已结束'}</AppText>
      <AppText style={styles.center} variant="caption">{record.source === 'hotspot' ? record.hotspot?.title : `${record.bankTitle} · ${record.topicTitle}`}</AppText>
    </View>
    {listening ? <Card style={styles.card}><View style={styles.metric}><AppText variant="sectionTitle">听力</AppText><AppText color={colors.primary} variant="pageTitle">{listening.score} / 50</AppText></View><View style={styles.metric}><AppText variant="caption">练习等级</AppText><AppText color={colors.primary} variant="sectionTitle">{listening.level} 级</AppText></View><AppText variant="caption">答对 {listening.correctCount} / 20 题 · 作答 {listening.answeredCount} / 20 题</AppText></Card> : null}
    {!onContinue ? <Card style={styles.summary}><View style={styles.summaryMetric}><AppText variant="caption">{exam ? '作答题数' : '本次学习'}</AppText><AppText variant="sectionTitle">{exam ? `${record.answeredCount ?? record.completedCount} / ${record.totalCount}` : `${record.studiedCount ?? record.totalCount} 题`}</AppText></View><View style={styles.summaryMetric}><AppText variant="caption">学习时长</AppText><AppText variant="sectionTitle">{record.durationSeconds < 60 ? `${record.durationSeconds} 秒` : `${Math.floor(record.durationSeconds / 60)} 分`}</AppText></View></Card> : null}
    {!exam && interaction === 'choices' && objective.answered > 0 ? <View style={styles.metric}><AppText variant="caption">正确率</AppText><AppText variant="sectionTitle">{Math.round(objective.correct / objective.answered * 100)}% <AppText variant="caption">（{objective.correct}/{objective.answered}）</AppText></AppText></View> : null}
    {externalError ? <AppText style={styles.center} color={colors.destructive} variant="caption">学习记录尚未保存，请重试</AppText> : null}
    {error || externalError ? <AppText color={colors.destructive} variant="caption">{error || externalError}</AppText> : null}
    {externalError && onExitWithoutSave ? <Button disabled={busy} onPress={onExitWithoutSave} variant="ghost">仍然返回</Button> : null}
    {onContinue ? <><Button disabled={busy} onPress={onContinue}>进入下一板块</Button><Button disabled={busy} variant="secondary" onPress={onEnd}>结束考试</Button></> : <>
    <View style={styles.recap}><AppText variant="sectionTitle">本次回顾</AppText>
      {Boolean(record.sessionRecap?.annotatedCardIds.length) && <ReviewRow title="标注题目" count={record.sessionRecap!.annotatedCardIds.length} onPress={() => { setList('annotations'); tutorial?.event('recap'); }} anchor="sentence-recap" />}
      {Boolean(record.sessionRecap?.words.length) && <ReviewRow title="查词与收藏" count={record.sessionRecap!.words.length} onPress={() => setList('words')} />}
      {objective.wrongIds.length > 0 && <ReviewRow title="错题回顾" count={objective.wrongIds.length} onPress={() => setList('wrong')} />}
      <ReviewRow anchor={!record.sessionRecap?.annotatedCardIds.length ? 'sentence-recap' : undefined} title={opening ? '正在打开…' : '本次学习记录'} count={record.studiedCount ?? record.totalCount} onPress={() => { if (!opening) void open(); }} />
      <ReviewRow title="查看答题卡" onPress={() => { void openAnswerCard(); }} />
    </View>
    <Button variant="secondary" onPress={back}>{returnLabel ?? (exam ? '返回模拟考试' : '返回题库')}</Button></>}
    <AnswerCardSheet tagColors={markers.map(value => value.tags)} highlightColors={markers.map(value => value.highlights)} visible={answerCard} total={answerItems.length} current={answerScope?.current ?? -1} marked={answerMarked ?? new Set(snapshot?.items.flatMap((item,index) => snapshot.states[item.id]?.visited ? [index] : []) ?? [])} onClose={() => { openingRequest.current++; openingBusy.current = false; setOpening(false); setAnswerCard(false); }} onSelect={index => {
      const item = answerItems[index];
      if (!item) return;
      if (!answerScope) { void open(item.id); return; }
      setAnswerCard(false);
      setReview({ id: `answer-card-${Date.now().toString(36)}`, startedAt: new Date().toISOString(),
        progressMode: 'persistent', items: answerScope.items, initialItemId: item.id,
        record: { bankId: record.bankId, bankTitle: record.bankTitle, categoryTitle: record.categoryTitle,
          topicTitle: record.topicTitle, recordType: 'session', source: record.source, hotspot: record.hotspot } });
    }} />
  </Screen>;
}
function ReviewRow({title,count,onPress,anchor}:{title:string;count?:number;onPress:()=>void;anchor?:string}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{flexDirection:'row',alignItems:'center',gap:spacing[3],paddingVertical:spacing[4],borderBottomWidth:1,borderBottomColor:colors.border}}>{anchor ? <GuideAnchor id={anchor} /> : null}<AppText style={{flex:1}}>{title}</AppText>{count !== undefined ? <AppText variant="caption">{count}</AppText> : null}<ChevronRight size={18} color={colors.mutedForeground}/></Pressable>;
}
const styles = StyleSheet.create({ screen: { paddingVertical: spacing[6], gap: spacing[4] }, hero: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[5] }, icon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 56, justifyContent: 'center', width: 56 }, center: { textAlign: 'center' }, summary: { flexDirection: 'row', gap: spacing[4] }, summaryMetric: { flex: 1, gap: spacing[2], alignItems: 'center' }, recap: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radii.xl, padding: spacing[4] }, card: { gap: spacing[4] }, metric: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] } });
