import { CheckCircle2, Clock3, Flag, NotebookPen, Target } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import type { LearningRecord } from '../types';

function formatDuration(total: number) {
  const seconds = Math.max(1, Math.floor(total));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

export function StudyReport({ record, noteCount, onReturn }: { record: LearningRecord; noteCount: number; onReturn: () => void }) {
  const completed = record.reason === 'complete' && record.completedCount >= record.totalCount;
  const progress = record.totalCount ? (record.completedCount / record.totalCount) * 100 : 0;
  return (
    <Screen scroll contentStyle={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.iconBox}>
          {completed ? <CheckCircle2 color={colors.primary} size={34} /> : <Flag color={colors.primary} size={32} />}
        </View>
        <Tag tone={completed ? 'primary' : 'accent'}>{completed ? '全部完成' : '中途结束'}</Tag>
        <AppText style={styles.center} variant="pageTitle">{completed ? '本次学习完成' : '本次学习已结束'}</AppText>
        <AppText style={styles.center}>{record.bankTitle} · {record.categoryTitle} · {record.topicTitle}</AppText>
      </View>
      <Card elevated style={styles.reportCard}>
        <View style={styles.progressHeader}>
          <View>
            <AppText color={colors.primary} variant="micro">题目完成数</AppText>
            <AppText variant="sectionTitle">本次学习进度</AppText>
          </View>
          <AppText style={styles.progressNumber} variant="sectionTitle">{record.completedCount} / {record.totalCount}</AppText>
        </View>
        <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
        <View style={styles.metrics}>
          <Metric icon={Target} label="答对题数" value={String(record.correctCount)} />
          <Metric icon={NotebookPen} label="笔记数" value={String(noteCount)} />
          <Metric icon={Clock3} label="学习时长" value={formatDuration(record.durationSeconds)} />
        </View>
      </Card>
      <Button onPress={onReturn} size="lg" style={styles.button}>返回题库目录</Button>
    </Screen>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricIcon}><Icon color={colors.primary} size={17} /></View>
      <AppText style={styles.metricValue} variant="button">{value}</AppText>
      <AppText variant="micro">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[6], paddingTop: spacing[6] },
  hero: { alignItems: 'center', gap: spacing[3] },
  iconBox: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 72, justifyContent: 'center', width: 72 },
  center: { textAlign: 'center' },
  reportCard: { marginTop: spacing[6] },
  progressHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  progressNumber: { fontFamily: fonts.monoRegular, fontSize: 18 },
  track: { backgroundColor: colors.secondary, borderRadius: radii.full, height: 8, marginTop: spacing[3], overflow: 'hidden' },
  fill: { backgroundColor: colors.primary, borderRadius: radii.full, height: '100%' },
  metrics: { flexDirection: 'row', gap: spacing[2.5], marginTop: spacing[4] },
  metric: { backgroundColor: 'rgba(244,242,236,0.55)', borderRadius: radii.xl, flex: 1, minHeight: 105, padding: spacing[3] },
  metricIcon: { alignItems: 'center', backgroundColor: colors.primary08, borderRadius: radii.md, height: 32, justifyContent: 'center', width: 32 },
  metricValue: { marginTop: spacing[3] },
  button: { marginTop: spacing[6] },
});
