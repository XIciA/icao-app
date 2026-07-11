import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import type { PropsWithChildren, ReactNode } from 'react';

import { AppText, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

export function StateScreen({ children }: { children: ReactNode }) {
  return <Screen contentStyle={styles.screen}>{children}</Screen>;
}

export function StateTopBar({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  return (
    <Pressable accessibilityLabel="关闭" hitSlop={10} onPress={onClose ?? router.back} style={styles.back}>
      <X color={colors.foreground} size={24} />
    </Pressable>
  );
}

export function StateHero({ icon: Icon, tone = 'primary' }: { icon: any; tone?: 'primary' | 'destructive' | 'accent' }) {
  const bgColor = tone === 'primary' ? colors.primary10 : tone === 'destructive' ? 'rgba(219, 43, 51, 0.1)' : 'rgba(183, 118, 16, 0.1)';
  const iconColor = tone === 'primary' ? colors.primary : tone === 'destructive' ? colors.destructive : colors.accent;
  const glowColor = tone === 'primary' ? colors.primary08 : tone === 'destructive' ? 'rgba(219, 43, 51, 0.08)' : 'rgba(183, 118, 16, 0.08)';

  return (
    <View style={styles.heroWrapper}>
      <View style={[StyleSheet.absoluteFill, styles.heroGlow, { backgroundColor: glowColor }]} />
      <View style={[styles.heroBox, { backgroundColor: bgColor }]}>
        <Icon color={iconColor} size={32} />
      </View>
    </View>
  );
}

export function CenteredState({
  icon, tone = 'primary', title, description, primaryAction, secondaryAction
}: {
  icon: any;
  tone?: 'primary' | 'destructive' | 'accent';
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <View style={styles.centered}>
      <StateHero icon={icon} tone={tone} />
      <AppText style={styles.title} variant="pageTitle">{title}</AppText>
      <AppText style={styles.description} variant="body">{description}</AppText>
      <View style={styles.actions}>
        {primaryAction}
        {secondaryAction}
      </View>
    </View>
  );
}

export function ReasonItem({ children }: PropsWithChildren) {
  return (
    <View style={styles.reasonItem}>
      <View style={styles.reasonBullet} />
      <AppText style={styles.reasonText} variant="caption">{children}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing[5] },
  back: { alignItems: 'center', height: 42, justifyContent: 'center', marginLeft: -spacing[2], marginTop: spacing[1], width: 42 },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 100 },
  heroWrapper: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing[5], position: 'relative' },
  heroGlow: { borderRadius: 100, transform: [{ scale: 1.8 }], opacity: 0.8 },
  heroBox: { alignItems: 'center', borderRadius: radii.xxl, height: 72, justifyContent: 'center', width: 72 },
  title: { marginBottom: spacing[2], textAlign: 'center' },
  description: { textAlign: 'center', maxWidth: 280, color: colors.mutedForeground },
  actions: { gap: spacing[3], marginTop: spacing[6], width: '100%' },
  reasonItem: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] },
  reasonBullet: { backgroundColor: colors.mutedForeground, borderRadius: 3, height: 6, marginTop: 7, width: 6 },
  reasonText: { flex: 1 },
});
