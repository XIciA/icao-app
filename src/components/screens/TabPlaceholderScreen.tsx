import { useRouter } from 'expo-router';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText, PressableCard, Screen, Tag } from '../ui';

export type FoundationEntry = {
  slug: string;
  title: string;
  description: string;
  meta: string;
  icon: LucideIcon;
  enabled?: boolean;
};

type Props = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  entries: FoundationEntry[];
};

export function TabPlaceholderScreen({ title, subtitle, eyebrow, entries }: Props) {
  const router = useRouter();

  return (
    <Screen bottomInset scroll contentStyle={styles.content}>
      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />
      <View style={styles.header}>
        {eyebrow ? (
          <AppText color={colors.primary} style={styles.eyebrow} variant="micro">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="pageTitle">{title}</AppText>
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
              onPress={() => router.push({ pathname: '/detail/[slug]', params: { slug: entry.slug } })}
              style={!enabled ? styles.disabled : null}
            >
              <View style={styles.row}>
                <View style={styles.iconBox}>
                  <Icon color={colors.primary} size={21} strokeWidth={2} />
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleLine}>
                    <AppText variant="cardTitle">{entry.title}</AppText>
                    <Tag tone={enabled ? 'primary' : 'muted'}>{enabled ? '基础壳已就绪' : '即将上线'}</Tag>
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
  content: { paddingTop: spacing[4] },
  header: { marginBottom: spacing[5] },
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
    backgroundColor: colors.primary10,
    borderRadius: radii.full,
    height: 240,
    left: -120,
    opacity: 0.5,
    position: 'absolute',
    top: -140,
    width: 240,
  },
  glowTwo: {
    backgroundColor: colors.primary08,
    borderRadius: radii.full,
    height: 210,
    opacity: 0.4,
    position: 'absolute',
    right: -120,
    top: 110,
    width: 210,
  },
});
