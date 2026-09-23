import type { LearningAnalysis } from '@icao/contracts/learning-ai';
import { View } from 'react-native';
import { AppText } from '@/components/ui';
import { AiGeneratedContentLabel } from '@/features/ai/AiGeneratedContentLabel';
import { colors, spacing } from '@/theme';

export function LearningAnalysisView({ analysis }: { analysis: LearningAnalysis }) {
  const groups: { title: string; rows: { quote: string; reason: string }[] }[] = [];
  if (analysis.module === 'opi' && analysis.offTopic) groups.push({ title: '偏离题目要求', rows: [{ quote: analysis.offTopic.answerQuote, reason: analysis.offTopic.reasonZh }] });
  if (analysis.grammarErrors.length) groups.push({ title: '语法错误', rows: analysis.grammarErrors.map((e) => ({ quote: `${e.before} → ${e.after}`, reason: e.reasonZh })) });
  if (analysis.module !== 'opi') {
    if (analysis.missingInformation.length) groups.push({ title: '信息缺失', rows: analysis.missingInformation.map((e) => ({ quote: e.sourceQuote, reason: e.reasonZh })) });
    if (analysis.incorrectInformation.length) groups.push({ title: '信息错误', rows: analysis.incorrectInformation.map((e) => ({ quote: `${e.answerQuote}\n题目依据：${e.sourceQuote}`, reason: e.reasonZh })) });
    if (analysis.extraInformation.length) groups.push({ title: '信息多余', rows: analysis.extraInformation.map((e) => ({ quote: e.answerQuote, reason: e.reasonZh })) });
  }
  return <View style={{ gap: spacing[3] }} testID="learning-analysis-result">
    <AiGeneratedContentLabel />
    {groups.length ? groups.map((group) => <View key={group.title} style={{ gap: spacing[2] }}>
      <AppText variant="button">{group.title}</AppText>
      {group.rows.map((row, index) => <View key={index} style={{ gap: spacing[1] }}>
        <AppText>{row.quote}</AppText><AppText color={colors.mutedForeground} variant="caption">{row.reason}</AppText>
      </View>)}
    </View>) : <AppText>分析完成，未发现上述问题。</AppText>}
    {analysis.module === 'opi' ? <View style={{ gap: spacing[2] }}><AppText variant="button">表达润色</AppText><AppText>{analysis.polishedText}</AppText></View> : null}
    <AppText variant="micro">基于回答文字的学习反馈，不代表官方考试分数或发音评价。</AppText>
  </View>;
}
