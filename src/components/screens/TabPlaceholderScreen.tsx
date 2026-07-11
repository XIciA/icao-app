import { useRouter } from 'expo-router';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText, PressableCard, Screen, Tag } from '../ui';
import { SoftGlow } from '../visual/SoftGlow';

export type FoundationEntry = {
  slug: string;
  title: string;
  description: string;
  meta: string;
  icon: LucideIcon;
  enabled?: boolean;
  statusLabel?: string;
};

type Props = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  entries: FoundationEntry[];
  onEntryPress?: (entry: FoundationEntry) => void;
};

export function TabPlaceholderScreen({ title, subtitle, eyebrow, headerLeading, headerTrailing, entries, onEntryPress }: Props) {
  const router = useRouter();

  return (
    <Screen bottomInset scroll contentStyle={styles.content}>
      <SoftGlow intensity={1.15} size={340} style={styles.glowOne} />
      <SoftGlow intensity={0.65} size={320} style={styles.glowTwo} />
      <View style={styles.header}>
        {headerLeading || headerTrailing ? (
          <View style={styles.toolbar}>
            <View>{headerLeading}</View>
            <View>{headerTrailing}</View>
          </View>
        ) : null}
        {eyebrow ? (
          <AppText color={colors.primary} style={styles.eyebrow} variant="micro">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText style={headerLeading || headerTrailing ? styles.titleWithToolbar : null} variant="pageTitle">{title}</AppText>
        <AppText style={styles.subtitle}>{subtitle}</AppText>
      </View>

      <View style={styles.list}>
        {entries.map((entry) => {
          const Icon = entry.icon;
          const enabled = entry.enabled ?? true;
          return (
            <PressableCard
              accessibilityLabel={`${entry.title}，${enabled ? '打开' : '功能开发中'}`}
              disabled={!enabled}
              key={entry.slug}
              onPress={() => onEntryPress ? onEntryPress(entry) : router.push({ pathname: '/detail/[slug]', params: { slug: entry.slug } })}
              style={!enabled ? styles.disabled : null}
            >
              <View style={styles.row}>
                <View style={styles.iconBox}>
                  <Icon color={colors.primary} size={21} strokeWidth={2} />
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleLine}>
                    <AppText variant="cardTitle">{entry.title}</AppText>
                    <Tag tone={enabled ? 'primary' : 'muted'}>{enabled ? (entry.statusLabel ?? '可练习') : '即将上线'}</Tag>
                  </View>
                  <AppText style={styles.description} variant="caption">
                    {entry.description}
                  </AppText>
                  <AppText color="rgba(31,94,217,0.80)" style={styles.meta} variant="micro">
                    {entry.meta}
                  </AppText>
                </View>
                <ChevronRight color={colors.mutedForeground} size={20} />
              </View>
            </PressableCard>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing[2] },
  header: { marginBottom: spacing[5] },
  toolbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  titleWithToolbar: { marginTop: spacing[6] },
  eyebrow: { letterSpacing: 1.8, marginBottom: spacing[2], textTransform: 'uppercase' },
  subtitle: { marginTop: spacing[2], maxWidth: 330 },
  list: { gap: spacing[2.5] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3.5] },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.primary08,
    borderRadius: radii.xl,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  copy: { flex: 1, minWidth: 0 },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  description: { marginTop: 2 },
  meta: { marginTop: spacing[1] },
  disabled: { opacity: 0.65 },
  glowOne: {
    left: -145,
    top: -190,
  },
  glowTwo: {
    right: -175,
    top: 35,
  },
});
