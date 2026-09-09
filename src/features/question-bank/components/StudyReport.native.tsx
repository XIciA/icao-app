import { CheckCircle2, Flag } from '@/components/ui/icons';
import { lazy, Suspense, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { TopBar } from '@/components/navigation/TopBar';
import { loadLearningRecordReview } from '../platform/learning-record-storage.native';
import { toStudyReviewPackage } from '../lib/study-review.native';
import type { LearningRecord, QuestionBankStudyPackage, StudyInteraction } from '../types';
const HistoryScreen = lazy(() => import('./QuestionBankStudyScreen.native').then(module => ({ default: module.QuestionBankStudyScreen })));
export function StudyReport({ record, onReturn, returnLabel, onContinue, onEnd, onExitWithoutSave, busy, error: externalError }: { onContinue?: () => void; onEnd?: () => void; onExitWithoutSave?: () => void; busy?: boolean; error?: string; record: LearningRecord; noteCount: number; onReturn: () => void; interaction: StudyInteraction; returnLabel?: string }) {
  const [review, setReview] = useState<QuestionBankStudyPackage>();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const exam = record.recordType === 'mock_exam';
  const complete = record.reason === 'complete';
  const listening = record.mockExam?.listeningResult;
  async function open() {
    if (opening) return;
    setOpening(true); setError('');
    try { const result = toStudyReviewPackage(await loadLearningRecordReview(record)); if (!result) throw new Error('missing_review'); setReview(result); }
    catch { setError('记录暂时无法打开，请重试。'); }
    finally { setOpening(false); }
  }
  const returnToReport = () => setReview(undefined);
  if (review) return <NativeScreenBoundary title="学习记录" onExit={returnToReport} resetKey={review.id}><Suspense fallback={<Screen><TopBar title="学习记录" onBack={returnToReport} /><AppText>正在打开记录…</AppText></Screen>}><HistoryScreen studyPackage={review} onReturn={returnToReport} returnLabel="返回结束页面" /></Suspense></NativeScreenBoundary>;
  return <Screen scroll contentStyle={styles.screen}>
    <View style={styles.hero}><View style={styles.icon}>{complete ? <CheckCircle2 color={colors.primary} size={34} /> : <Flag color={colors.primary} size={32} />}</View>
      {onContinue ? null : <Tag tone={complete ? 'primary' : 'accent'}>{exam && !complete ? '未完成' : '已结束'}</Tag>}
      <AppText variant="pageTitle">{onContinue || (listening && record.mockExam?.moduleIds.length === 1) ? '听力成绩' : exam ? '本次模拟考试已结束' : '本次学习已结束'}</AppText>
      <AppText style={styles.center} variant="caption">{record.source === 'hotspot' ? record.hotspot?.title : `${record.bankTitle} · ${record.topicTitle}`}</AppText>
    </View>
    {listening ? <Card style={styles.card}><View style={styles.metric}><AppText variant="sectionTitle">听力</AppText><AppText color={colors.primary} variant="pageTitle">{listening.score} / 50</AppText></View><View style={styles.metric}><AppText variant="caption">练习等级</AppText><AppText color={colors.primary} variant="sectionTitle">{listening.level} 级</AppText></View><AppText variant="caption">答对 {listening.correctCount} / 20 题 · 作答 {listening.answeredCount} / 20 题</AppText></Card> : null}
    {!onContinue ? <Card style={styles.card}><View style={styles.metric}><AppText variant="caption">{exam ? '作答题数' : '本次学习'}</AppText><AppText variant="sectionTitle">{exam ? `${record.answeredCount ?? record.completedCount} / ${record.totalCount}` : `${record.studiedCount ?? record.totalCount} 题`}</AppText></View><View style={styles.metric}><AppText variant="caption">学习时长</AppText><AppText variant="button">{record.durationSeconds < 60 ? `${record.durationSeconds} 秒` : `${Math.floor(record.durationSeconds / 60)} 分`}</AppText></View></Card> : null}
    <AppText style={styles.center} variant="caption">已保存到学习记录</AppText>
    {error || externalError ? <AppText color={colors.destructive} variant="caption">{error || externalError}</AppText> : null}
    {externalError && onExitWithoutSave ? <Button disabled={busy} onPress={onExitWithoutSave} variant="ghost">仍然返回</Button> : null}
    {onContinue ? <><Button disabled={busy} onPress={onContinue}>进入下一板块</Button><Button disabled={busy} variant="secondary" onPress={onEnd}>结束考试</Button></> : <>
    <Button disabled={opening} onPress={() => { void open(); }}>{opening ? '正在打开…' : '查看本次记录'}</Button>
    <Button variant="secondary" onPress={onReturn}>{returnLabel ?? (exam ? '返回模拟考试' : '返回题库')}</Button></>}
  </Screen>;
}
const styles = StyleSheet.create({ screen: { paddingVertical: spacing[6], gap: spacing[4] }, hero: { alignItems: 'center', gap: spacing[3] }, icon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 72, justifyContent: 'center', width: 72 }, center: { textAlign: 'center' }, card: { gap: spacing[4] }, metric: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3] } });
