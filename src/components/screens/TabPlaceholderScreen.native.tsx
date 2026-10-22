import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { GuideAnchor } from '@/features/usage-guide/GuideBindings';
import { trackProductClick } from '@/platform/product-clicks.native';
import { ProfileAvatar } from '@/features/account/ProfileAvatar';
import { examGoal } from '@/features/account/profile-model';
import { useProfile } from '@/features/account/profile-store.native';
import { ChevronRight, type LucideIcon } from '@/components/ui/icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStudyCatalog } from '@/features/question-bank/hooks/useStudyCatalog.native';
import { StudyScopeSelector } from '@/features/question-bank/components/StudyScopeSelector';

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
};

type Props = {
  title: string;
  subtitle: string;
  eyebrow?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  entries: FoundationEntry[];
  onEntryPress: (entry: FoundationEntry) => void;
};

// The existing route uses this component only for the question-bank home.
export function TabPlaceholderScreen({ title, eyebrow, headerTrailing, entries }: Props) {
  const profile = useProfile();
  const router = useRouter();
  const headerLeading = <Pressable accessibilityRole="button" accessibilityLabel="打开个人资料" hitSlop={6} onPress={() => router.push('/account/profile')} style={({ pressed }) => pressed ? { opacity: 0.7 } : undefined}><ProfileAvatar size={40} uri={profile.avatarUri} /></Pressable>;
  const goal = examGoal(profile.target);
  const catalog = useStudyCatalog();
  const visibleEntries = goal.banks.flatMap((id) => entries.filter((entry) => entry.slug === id).map((entry) => ({ ...entry, meta: catalog.find((bank) => bank.id === id)?.summary ?? '此范围暂无内容' })));
  return (
    <Screen
      background={(
        <>
          <SoftGlow intensity={1.15} size={340} style={styles.glowOne} />
          <SoftGlow intensity={0.65} size={320} style={styles.glowTwo} />
        </>
      )}
      bottomInset
      contentStyle={styles.content}
      scroll
    >
      <View style={styles.header}><GuideAnchor id="study-open" />
        {headerLeading || headerTrailing ? (
          <View style={styles.toolbar}>
            <View>{headerLeading}</View>
            <View style={styles.actions}><StudyScopeSelector />{headerTrailing}</View>
          </View>
        ) : null}
        {eyebrow ? (
          <AppText color={colors.primary} style={styles.eyebrow} variant="micro">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText style={headerLeading || headerTrailing ? styles.titleWithToolbar : null} variant="pageTitle">{title}</AppText>
        <AppText style={styles.subtitle}>按自己的节奏开始练习。</AppText>
      </View>

      <View style={styles.list}>
        {visibleEntries.map((entry) => {
          const Icon = entry.icon;
          const enabled = entry.enabled ?? true;
          return (
            <PressableCard
              accessibilityLabel={`${entry.title}，${enabled ? '打开' : '功能开发中'}`}
              disabled={!enabled}
              key={entry.slug}
              onPress={() => { trackProductClick('bank_open',entry.slug); router.push({ pathname: '/question-bank/[bankId]', params: { bankId: entry.slug } }); }}
              style={!enabled ? styles.disabled : null}
            >
              <View style={styles.row}>
                <View style={styles.iconBox}>
                  <Icon color={colors.primary} size={24} />
                </View>
                <View style={styles.copy}>
                  <View style={styles.titleLine}>
                    <AppText variant="cardTitle">{entry.title}</AppText>
                    {!enabled ? <Tag tone="muted">即将上线</Tag> : null}
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
  actions: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  titleWithToolbar: { marginTop: spacing[6] },
  eyebrow: { letterSpacing: 1.8, marginBottom: spacing[2], textTransform: 'uppercase' },
  subtitle: { marginTop: spacing[2], maxWidth: 330 },
  list: { gap: spacing[2.5] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3.5] },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.primary045,
    borderRadius: radii.full,
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
