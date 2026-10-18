import { SessionRecapList } from './SessionRecapList.native';
import { objectiveReview, selectReview } from '../lib/session-recap';
import { CheckCircle2, ChevronRight, Flag } from '@/components/ui/icons';
import { lazy, Suspense, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { TopBar } from '@/components/navigation/TopBar';
import { loadLearningRecordReview } from '../platform/learning-record-storage.native';
import { toStudyReviewPackage } from '../lib/study-review.native';
import type { LearningRecord, QuestionBankStudyPackage, StudyInteraction } from '../types';
const HistoryScreen = lazy(() => import('./QuestionBankStudyScreen.native').then(module => ({ default: module.QuestionBankStudyScreen })));
export function StudyReport({ record, onReturn, returnLabel, interaction, onContinue, onEnd, onExitWithoutSave, busy, error: externalError }: { onContinue?: () => void; onEnd?: () => void; onExitWithoutSave?: () => void; busy?: boolean; error?: string; record: LearningRecord; noteCount: number; onReturn: () => void; interaction: StudyInteraction; returnLabel?: string }) {
  const [review, setReview] = useState<QuestionBankStudyPackage>();
  const [list,setList] = useState<'annotations'|'words'|'wrong'>();
  const [detail,setDetail] = useState(record);
  const objective = objectiveReview(record.studyReview);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const exam = record.recordType === 'mock_exam';
  const complete = record.reason === 'complete';
  const listening = record.mockExam?.listeningResult;
  async function open(itemId?: string) {
    if (opening) return;
    setOpening(true); setError('');
    try { const loaded = await loadLearningRecordReview(record); setDetail(loaded); const result = toStudyReviewPackage(itemId ? selectReview(loaded, new Set([itemId])) : loaded); if (!result) throw new Error('missing_review'); setReview(result); }
    catch { setError('记录暂时无法打开，请重试。'); }
    finally { setOpening(false); }
  }
  const returnToReport = () => setReview(undefined);
  if (review) return <NativeScreenBoundary title="学习记录" onExit={returnToReport} resetKey={review.id}><Suspense fallback={<Screen><TopBar title="学习记录" onBack={returnToReport} /><AppText>正在打开记录…</AppText></Screen>}><HistoryScreen studyPackage={review} onReturn={returnToReport} returnLabel="返回结束页面" /></Suspense></NativeScreenBoundary>;
  if (list) return <SessionRecapList kind={list} record={detail} onBack={() => setList(undefined)} onOpen={id => { void open(id); }} />;
  return <Screen scroll contentStyle={styles.screen}>
    <View style={styles.hero}><View style={styles.icon}>{complete ? <CheckCircle2 color={colors.primary} size={34} /> : <Flag color={colors.primary} size={32} />}</View>
      {!onContinue && exam && !complete ? <Tag tone="accent">未完成</Tag> : null}
      <AppText variant="pageTitle">{onContinue || (listening && record.mockExam?.moduleIds.length === 1) ? '听力成绩' : exam ? '本次模拟考试已结束' : '本次学习已结束'}</AppText>
      <AppText style={styles.center} variant="caption">{record.source === 'hotspot' ? record.hotspot?.title : `${record.bankTitle} · ${record.topicTitle}`}</AppText>
    </View>
    {listening ? <Card style={styles.card}><View style={styles.metric}><AppText variant="sectionTitle">听力</AppText><AppText color={colors.primary} variant="pageTitle">{listening.score} / 50</AppText></View><View style={styles.metric}><AppText variant="caption">练习等级</AppText><AppText color={colors.primary} variant="sectionTitle">{listening.level} 级</AppText></View><AppText variant="caption">答对 {listening.correctCount} / 20 题 · 作答 {listening.answeredCount} / 20 题</AppText></Card> : null}
    {!onContinue ? <Card style={styles.card}><View style={styles.metric}><AppText variant="caption">{exam ? '作答题数' : '本次学习'}</AppText><AppText variant="sectionTitle">{exam ? `${record.answeredCount ?? record.completedCount} / ${record.totalCount}` : `${record.studiedCount ?? record.totalCount} 题`}</AppText></View><View style={styles.metric}><AppText variant="caption">学习时长</AppText><AppText variant="button">{record.durationSeconds < 60 ? `${record.durationSeconds} 秒` : `${Math.floor(record.durationSeconds / 60)} 分`}</AppText></View></Card> : null}
    {!exam && interaction === 'choices' && objective.answered > 0 ? <View style={styles.metric}><AppText variant="caption">正确率</AppText><AppText variant="sectionTitle">{Math.round(objective.correct / objective.answered * 100)}% <AppText variant="caption">（{objective.correct}/{objective.answered}）</AppText></AppText></View> : null}
    {externalError ? <AppText style={styles.center} color={colors.destructive} variant="caption">学习记录尚未保存，请重试</AppText> : null}
    {error || externalError ? <AppText color={colors.destructive} variant="caption">{error || externalError}</AppText> : null}
    {externalError && onExitWithoutSave ? <Button disabled={busy} onPress={onExitWithoutSave} variant="ghost">仍然返回</Button> : null}
    {onContinue ? <><Button disabled={busy} onPress={onContinue}>进入下一板块</Button><Button disabled={busy} variant="secondary" onPress={onEnd}>结束考试</Button></> : <>
    <View><AppText variant="sectionTitle">本次回顾</AppText>
      {Boolean(record.sessionRecap?.annotatedCardIds.length) && <ReviewRow title="标注题目" count={record.sessionRecap!.annotatedCardIds.length} onPress={() => setList('annotations')} />}
      {Boolean(record.sessionRecap?.words.length) && <ReviewRow title="查词与收藏" count={record.sessionRecap!.words.length} onPress={() => setList('words')} />}
      {objective.wrongIds.length > 0 && <ReviewRow title="错题回顾" count={objective.wrongIds.length} onPress={() => setList('wrong')} />}
      <ReviewRow title={opening ? '正在打开…' : '全部学习记录'} count={record.studiedCount ?? record.totalCount} onPress={() => { if (!opening) void open(); }} />
    </View>
    <Button variant="secondary" onPress={onReturn}>{returnLabel ?? (exam ? '返回模拟考试' : '返回题库')}</Button></>}
  </Screen>;
}
function ReviewRow({title,count,onPress}:{title:string;count:number;onPress:()=>void}) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{flexDirection:'row',alignItems:'center',gap:spacing[3],paddingVertical:spacing[4],borderBottomWidth:1,borderBottomColor:colors.border}}><AppText style={{flex:1}}>{title}</AppText><AppText variant="caption">{count}</AppText><ChevronRight size={18} color={colors.mutedForeground}/></Pressable>;
}
const styles = StyleSheet.create({ screen: { paddingVertical: spacing[6], gap: spacing[4] }, hero: { alignItems: 'center', gap: spacing[3] }, icon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 72, justifyContent: 'center', width: 72 }, center: { textAlign: 'center' }, card: { gap: spacing[4] }, metric: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] } });
