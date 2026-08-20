import type { AiReviewResult } from '@icao/contracts';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors } from '@/theme';

export function AiReviewResultView({ result }: { result: AiReviewResult }) {
  const primary = result.polishedText ?? result.grammar.correctedText;
  const explanation = result.grammar.issues.length
    ? result.grammar.issues.map((issue) => issue.before === issue.after ? issue.before : `${issue.before} → ${issue.after}${issue.reasonZh ? `：${issue.reasonZh}` : ''}`).join('\n')
    : '未发现明确语法问题';
  return <>
    <AppText style={styles.primary} testID="study-workbench-ai-primary" variant="button">{primary}</AppText>
    <View style={styles.divider} testID="study-workbench-ai-divider" />
    <AppText color={colors.mutedForeground} style={styles.explanation} testID="study-workbench-ai-explanation">{explanation}</AppText>
  </>;
}

const styles = StyleSheet.create({
  primary: { lineHeight: 24 },
  divider: { backgroundColor: colors.primary20, height: StyleSheet.hairlineWidth },
  explanation: { lineHeight: 21 },
});
