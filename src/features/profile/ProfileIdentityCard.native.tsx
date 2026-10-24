import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText, Card } from '@/components/ui';
import { BookOpen, ChevronRight } from '@/components/ui/icons';
import { ProfileAvatar } from '@/features/account/ProfileAvatar';
import { examGoal, type UserProfile } from '@/features/account/profile-model';
import { GuideAnchor } from '@/features/usage-guide/GuideBindings';
import { colors, radii, spacing } from '@/theme';
import { MembershipStatus } from './MembershipStatus.native';

export function ProfileIdentityCard({ profile, accountLabel, onOpenProfile }: {
  profile: UserProfile;
  accountLabel: string;
  onOpenProfile: () => void;
}) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState<number>();
  const compact = (width ?? window.width) / window.fontScale < 560;
  const goal = examGoal(profile.target).label.replace(/ (初考|复考)$/u, ' · $1');
  const badges = <View pointerEvents="box-none" style={styles.badges}>
    <MembershipStatus pill />
    <View pointerEvents="none" style={styles.goal}>
      <BookOpen color={colors.primary} size={16} />
      <AppText color={colors.primary} style={styles.goalText} variant="caption">{goal}</AppText>
    </View>
  </View>;

  return <Card onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.card}>
    <GuideAnchor id="setup-profile" /><GuideAnchor id="setup-bank" />
    {/* Sibling targets keep the full profile surface clickable without nested buttons on Web. */}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看个人资料，${profile.displayName}，${goal}，${accountLabel}`}
      onPress={onOpenProfile}
      style={({ pressed }) => [StyleSheet.absoluteFill, styles.profileTarget, pressed && styles.pressed]}
      testID="profile-card-open"
    />
    <View pointerEvents="box-none" style={styles.identity}>
      <View pointerEvents="none"><ProfileAvatar size={compact ? 48 : 60} uri={profile.avatarUri} /></View>
      <View pointerEvents="box-none" style={styles.copy}>
        <AppText pointerEvents="none" numberOfLines={1} variant="sectionTitle">{profile.displayName}</AppText>
        {!compact && badges}
      </View>
      <View pointerEvents="none"><ChevronRight color={colors.mutedForeground} size={20} /></View>
    </View>
    {compact && badges}
  </Card>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, gap: spacing[3], backgroundColor: colors.card },
  profileTarget: { borderRadius: radii.xl },
  pressed: { backgroundColor: colors.primary06 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  copy: { flex: 1, minWidth: 0, gap: spacing[2] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing[2] },
  goal: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], maxWidth: '100%', minHeight: 44, paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radii.full, backgroundColor: colors.primary06, borderColor: colors.primary10, borderWidth: 1 },
  goalText: { flexShrink: 1 },
});
