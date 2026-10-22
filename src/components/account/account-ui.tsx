import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight } from '@/components/ui/icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { PropsWithChildren } from 'react';

import { AppText, Card, Screen } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

export function AccountScreen({ children }: { children: React.ReactNode }) {
  return (
    <Screen bottomInset contentStyle={styles.screen} scroll>
      {children}
    </Screen>
  );
}

export function AccountTopBar({ title }: { title: string }) {
  const router = useRouter();
  return (
    <View style={styles.topbar}>
      <Pressable accessibilityLabel="返回" hitSlop={10} onPress={router.back} style={styles.back}>
        <ArrowLeft color={colors.foreground} size={19} />
      </Pressable>
      <AppText style={styles.topbarTitle} variant="sectionTitle">{title}</AppText>
      <View style={styles.back} />
    </View>
  );
}

export function SectionLabel({ title }: { title: string }) {
  return <AppText style={styles.sectionLabel} variant="caption">{title}</AppText>;
}

export function RowGroup({ children }: PropsWithChildren) {
  return <Card style={styles.rowGroup}>{children}</Card>;
}

export function Row({
  label, icon: Icon, value, onPress, isLast
}: { label: string; icon?: any; value?: string; onPress?: () => void; isLast?: boolean }) {
  const content = (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      {Icon ? (
        <View style={styles.iconBox}>
          <Icon color={colors.primary} size={18} />
        </View>
      ) : null}
      <AppText style={styles.rowLabel} variant="button">{label}</AppText>
      {value ? <AppText variant="body">{value}</AppText> : null}
      {onPress ? <ChevronRight color={colors.mutedForeground} size={18} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed ? styles.rowPressed : null}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export function Avatar({ size = 56, icon: Icon, uri }: { size?: number; icon?: any; uri?: string | null }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image accessibilityLabel="用户头像" source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : Icon ? (
        <Icon color={colors.primary} size={size / 2} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing[2] },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[2], marginBottom: spacing[4] },
  back: { alignItems: 'center', height: 42, justifyContent: 'center', width: 42, marginLeft: -spacing[2] },
  topbarTitle: { fontFamily: fonts.serifSemibold, fontSize: 18 },
  sectionLabel: { marginLeft: spacing[4], marginBottom: spacing[2], marginTop: spacing[6], letterSpacing: 1 },
  rowGroup: { padding: 0, overflow: 'hidden' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 60, paddingHorizontal: spacing[4] },
  rowBorder: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowPressed: { backgroundColor: colors.secondary },
  rowLabel: { flex: 1 },
  iconBox: { alignItems: 'center', backgroundColor: colors.primary08, borderRadius: radii.lg, height: 36, justifyContent: 'center', width: 36 },
  avatar: { alignItems: 'center', backgroundColor: colors.primary10, justifyContent: 'center', overflow: 'hidden' },
});
