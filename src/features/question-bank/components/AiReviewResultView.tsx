import type { AiReviewResult } from '@icao/contracts';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, spacing } from '@/theme';

export function AiReviewResultView({ result }: { result: AiReviewResult }) {
  return (
    <View style={styles.root} testID="study-workbench-review-result">
      <AppText testID="study-workbench-grammar-title" variant="button">语法纠错</AppText>
      {result.grammar.issues.length ? <View style={styles.issues}>
        {result.grammar.issues.map((issue, index) => (
          <View key={`${index}-${issue.before}-${issue.after}`} style={styles.issue} testID={`study-workbench-grammar-issue-${index}`}>
            <AppText variant="button">{`${index + 1}. ${issue.before} → ${issue.after}`}</AppText>
            <AppText color={colors.mutedForeground} variant="caption">{issue.reasonZh}</AppText>
          </View>
        ))}
      </View> : <AppText color={colors.mutedForeground}>未发现明确语法问题。</AppText>}
      <AppText style={styles.sectionTitle} testID="study-workbench-corrected-title" variant="button">正确句子</AppText>
      <AppText testID="study-workbench-corrected-text">{result.grammar.correctedText}</AppText>
      {result.polishedText ? <>
        <View style={styles.divider} />
        <AppText testID="study-workbench-polished-title" variant="button">润色后的表达</AppText>
        <AppText testID="study-workbench-polished-text">{result.polishedText}</AppText>
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  issues: { gap: spacing[3] },
  issue: { gap: spacing[1] },
  sectionTitle: { marginTop: spacing[2] },
  divider: { backgroundColor: colors.primary20, height: StyleSheet.hairlineWidth, marginVertical: spacing[2] },
});
