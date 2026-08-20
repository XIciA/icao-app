import { Clock3, History, Sparkles, Target } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Card, Screen, Tag } from '@/components/ui';
import { colors, fonts, spacing } from '@/theme';

import { sqliteLearningStore } from '../platform/learning-store';
import type { LearningRecord } from '../types';
import { AiReviewResultView } from './AiReviewResultView';

function duration(value: number) {
  return value < 60 ? `${value} 秒` : `${Math.floor(value / 60)} 分 ${value % 60} 秒`;
}

function savedReview(result: NonNullable<LearningRecord['aiResult']>) {
  if (!result.grammar || !result.grammar.issues.every((issue) => typeof issue !== 'string')) return undefined;
  return {
    grammar: {
      correctedText: result.grammar.correctedText,
      issues: result.grammar.issues.filter((issue) => typeof issue !== 'string'),
    },
    ...(result.polishedText ? { polishedText: result.polishedText } : {}),
    promptVersion: 'deepseek-review:v1' as const,
  };
}

export function LearningRecordsScreen() {
  const [records, setRecords] = useState<LearningRecord[]>();
  useEffect(() => { void sqliteLearningStore.getRecords().then(setRecords); }, []);

  return (
    <Screen scroll contentStyle={styles.screen}>
      <TopBar title="学习记录" />
      <View style={styles.header}>
        <AppText color={colors.primary} variant="micro">LOCAL HISTORY</AppText>
        <AppText variant="pageTitle">最近学习</AppText>
        <AppText>学习记录保存在本机。</AppText>
      </View>
      <View style={styles.list}>
        {records?.length ? records.map((record) => (
          <Card key={record.id} style={styles.card}>
            <View style={styles.titleRow}>
              <View style={styles.icon}><History color={colors.primary} size={18} /></View>
              <View style={styles.copy}>
                <AppText variant="cardTitle">{record.bankTitle} · {record.categoryTitle}</AppText>
                <AppText variant="caption">{record.recordType === 'ai_result' ? `我的回答 · ${record.topicTitle}` : record.topicTitle}</AppText>
              </View>
              <Tag tone={record.reason === 'complete' ? 'primary' : 'accent'}>{record.recordType === 'ai_result' ? '已保存' : record.recordType === 'mock_exam' ? record.reason === 'complete' ? '模考完成' : '模考结束' : record.reason === 'complete' ? '已完成' : '中途结束'}</Tag>
            </View>
            <View style={styles.metrics}>
              {record.recordType === 'ai_result' ? <View style={styles.metric}><Sparkles color={colors.primary} size={14} /><AppText variant="micro">回答与反馈</AppText></View> : <><View style={styles.metric}><Target color={colors.primary} size={14} /><AppText variant="micro">{record.completedCount}/{record.totalCount}</AppText></View><View style={styles.metric}><Clock3 color={colors.primary} size={14} /><AppText variant="micro">{duration(record.durationSeconds)}</AppText></View></>}
              <AppText style={styles.date} variant="micro">{new Date(record.createdAt).toLocaleString('zh-CN')}</AppText>
            </View>
            {record.recordType === 'ai_result' && record.aiResult ? <View style={styles.aiResult}><AppText variant="button">我的回答</AppText><AppText>{record.aiResult.transcript}</AppText>{savedReview(record.aiResult) ? <AiReviewResultView result={savedReview(record.aiResult)!} /> : record.aiResult.grammar ? <><AppText variant="button">语法反馈</AppText><AppText>{record.aiResult.grammar.correctedText}</AppText>{record.aiResult.grammar.issues.length ? record.aiResult.grammar.issues.map((issue, index) => <AppText key={`${index}-${typeof issue === 'string' ? issue : issue.before}`} variant="caption">{typeof issue === 'string' ? issue : `${issue.before} → ${issue.after}：${issue.reasonZh}`}</AppText>) : <AppText variant="caption">未发现明确语法问题</AppText>}</> : null}{!savedReview(record.aiResult) && record.aiResult.polishedText ? <><AppText variant="button">润色表达</AppText><AppText>{record.aiResult.polishedText}</AppText></> : null}</View> : null}
            {record.recordType === 'mock_exam' && record.mockExam ? <AppText color={colors.mutedForeground} variant="caption">{record.mockExam.mode === 'complete' ? '按考试规则组卷' : '自选板块'} · {record.mockExam.moduleIds.length} 个板块</AppText> : null}
          </Card>
        )) : records ? (
          <Card style={styles.empty}><History color={colors.mutedForeground} size={28} /><AppText variant="cardTitle">还没有学习记录</AppText><AppText>完成或中途结束一次学习后会显示在这里。</AppText></Card>
        ) : <AppText>正在读取本地记录…</AppText>}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  header: { gap: spacing[1], paddingHorizontal: spacing[5], paddingVertical: spacing[4] },
  list: { gap: spacing[3], paddingBottom: spacing[6] },
  card: { gap: spacing[3] },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  icon: { alignItems: 'center', backgroundColor: colors.primary08, borderRadius: 14, height: 40, justifyContent: 'center', width: 40 },
  copy: { flex: 1 },
  metrics: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing[3], paddingTop: spacing[3] },
  metric: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] },
  date: { color: colors.mutedForeground, flex: 1, fontFamily: fonts.monoRegular, textAlign: 'right' },
  empty: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] },
  aiResult: { backgroundColor: colors.secondary, borderRadius: 14, gap: spacing[2], padding: spacing[3] },
});
