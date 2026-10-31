import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { WifiOff } from '@/components/ui/icons';
import { colors, radii, spacing } from '@/theme';
/** Fits the existing action row; no banner or new content row. */
export function OfflineBadge({ offline }: { offline: boolean }) {
  return offline ? <View style={styles.badge}><WifiOff color={colors.mutedForeground} size={13} /><AppText color={colors.mutedForeground} variant="micro">离线模式</AppText></View> : null;
}
const styles = StyleSheet.create({ badge: { alignItems: 'center', backgroundColor: colors.secondary, flexDirection: 'row', gap: spacing[1], borderRadius: radii.full, paddingHorizontal: spacing[2], paddingVertical: spacing[1] } });
