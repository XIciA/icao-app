import type { AppContentLegalDocument } from '@icao/contracts/app-content';
import { StyleSheet, View } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

/** Renders the supplied immutable document, without fetching or replacing its version. */
export function LegalDocumentBody({ document }: { document: AppContentLegalDocument }) {
  return (
    <View style={styles.legal}>
      <AppText variant="pageTitle">{document.title}</AppText>
      <AppText variant="micro">版本 {document.version} · 生效于 {document.effectiveAt}</AppText>
      <Card style={styles.intro}><AppText>{document.intro}</AppText></Card>
      {document.sections.map(({ title, body }, index) => (
        <View key={`${index}-${title}`} style={styles.clause}>
          <View style={styles.clauseTitle}>
            <View style={styles.number}><AppText color={colors.primary} variant="micro">{index + 1}</AppText></View>
            <AppText style={styles.title} variant="button">{title}</AppText>
          </View>
          <AppText style={styles.clauseBody}>{body}</AppText>
        </View>
      ))}
      <AppText style={styles.center} variant="micro">云启航科（成都）科技有限公司 · {document.id === 'agreement' ? 'legal' : 'privacy'}@yunqihangke.com</AppText>
    </View>
  );
}
const styles = StyleSheet.create({
  legal: { gap: spacing[4], padding: spacing[5] },
  intro: { backgroundColor: colors.secondary },
  clause: { gap: spacing[2] },
  clauseTitle: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  number: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.sm, height: 22, justifyContent: 'center', width: 22 },
  title: { flex: 1 },
  clauseBody: { paddingLeft: spacing[8] },
  center: { textAlign: 'center' },
});
