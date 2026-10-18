import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown } from '@/components/ui/icons';
import { AppText } from '@/components/ui';
import { builtinAppContent, loadAppContent } from '@/features/app-content/repository.native';
import { colors, spacing } from '@/theme';

export function HelpFaqList() {
  const [open, setOpen] = useState<string>();
  const [faqs, setFaqs] = useState(builtinAppContent.help);
  useFocusEffect(useCallback(() => {
    let active = true;
    void loadAppContent().then(({ data }) => { if (active) setFaqs(data.payload.help); }).catch(() => undefined);
    return () => { active = false; };
  }, []));
  return <View>{faqs.map(({ id, question, answer }) => <View key={id} style={styles.item}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === id }} onPress={() => setOpen(open === id ? undefined : id)} style={styles.row}>
      <AppText variant="button" style={{ flex: 1 }}>{question}</AppText><ChevronDown size={16} color={colors.mutedForeground} />
    </Pressable>
    {open === id ? <AppText style={styles.answer}>{answer}</AppText> : null}
  </View>)}</View>;
}
const styles = StyleSheet.create({ item: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, row: { flexDirection: 'row', gap: spacing[3], alignItems: 'center', paddingVertical: spacing[4] }, answer: { paddingBottom: spacing[4] } });
