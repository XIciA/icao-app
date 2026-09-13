import { trackProductClick } from '@/platform/product-clicks.native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bookmark, ChevronRight, History, MessageCircle, Settings, Star } from '@/components/ui/icons';
import { useCallback, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { colors, radii, spacing } from '@/theme';
import { readLearningProgressStats } from '@/features/question-bank/platform/learning-store.native';
import { AccountScreen, RowGroup, Row } from '@/components/account/account-ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/account/profile-store.native';
import { examGoal } from '@/features/account/profile-model';
import { ProfileAvatar } from '@/features/account/ProfileAvatar';
import { AiAllowanceCard } from './AiAllowanceCard.native';

const menu = [
  { slug: 'membership', label: '会员与购买', icon: Star },
  { slug: 'learning-records', label: '学习记录', icon: History },
  { slug: 'annotations', label: '我的标注', icon: Bookmark },
  { slug: 'word-favorites', label: '单词收藏', icon: Star },
  { slug: 'settings', label: '设置', icon: Settings },
  { slug: 'feedback', label: '意见反馈', icon: MessageCircle },
];

export function ProfileHomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const profile = useProfile();
  const cloudWeb = Platform.OS === 'web' && isEdgeOneProductionWeb();
  const visibleMenu = menu.filter((item) => Platform.OS !== 'web'
    || (item.slug !== 'membership' && (cloudWeb || item.slug !== 'feedback')));
  const [progress, setProgress] = useState<{ accountId: string; learnedCards: number; completedCards: number }>();
  const accountId = auth.accountReady ? auth.account?.accountId : undefined;
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = () => {
        if (!accountId) return;
        void readLearningProgressStats().then((stats) => {
          if (active) setProgress({ accountId, ...stats });
        }).catch(() => { if (active) setProgress(undefined); });
      };
      refresh();
      const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
      return () => {
        active = false;
        foreground.remove();
      };
    }, [accountId]),
  );
  const stats = progress?.accountId === accountId ? progress : undefined;
  const accountLabel = auth.restoring
    ? '正在确认账号…'
    : auth.session
      ? `${Platform.OS === 'web' ? cloudWeb ? '听你五个 Web' : 'Web 体验版' : '听你五个账号'} · ${auth.session.user.displayName ?? '已登录'}`
      : '尚未登录';

  function open(slug: string) {
    if (slug === 'learning-records') router.push('/learning-records');
    else if (slug === 'annotations') router.push('/annotations');
    else if (slug === 'word-favorites') router.push('/word-favorites');
    else if (slug === 'membership') { trackProductClick('membership_open','profile'); router.push('/account/membership'); }
    else if (slug === 'settings') router.push('/account/settings');
    else if (slug === 'feedback')
      router.push({
        pathname: '/info/[slug]',
        params: { slug: 'feedback', source: 'profile', sourceRoute: '/(tabs)/profile' },
      });
    else router.push('/account/profile');
  }

  return (
    <AccountScreen>
      <Pressable
        accessibilityLabel={`个人资料，${accountLabel}`}
        onPress={() => open('profile-detail')}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <Card elevated style={styles.profile}>
          <ProfileAvatar size={56} uri={profile.avatarUri} />
          <View style={styles.copy}>
            <AppText variant="sectionTitle">{profile.displayName}</AppText>
            <AppText ellipsizeMode="middle" numberOfLines={1} style={styles.account} variant="caption">
              {accountLabel}
            </AppText>
            <AppText variant="caption">目标：{examGoal(profile.target).label}</AppText>
          </View>
          <ChevronRight color={colors.mutedForeground} size={20} />
        </Card>
      </Pressable>
      <AiAllowanceCard />
      <View style={styles.stats}>
        <Card style={styles.stat}>
          <AppText style={styles.value} variant="pageTitle">
            {stats?.learnedCards ?? '—'}
          </AppText>
          <AppText variant="caption">已学卡片</AppText>
        </Card>
        <Card style={styles.stat}>
          <AppText style={styles.value} variant="pageTitle">
            {stats?.completedCards ?? '—'}
          </AppText>
          <AppText variant="caption">已完成卡片</AppText>
        </Card>
      </View>
      <View style={styles.menuSpacing}>
        <RowGroup>
          {visibleMenu.map((item, index) => (
            <Row
              icon={item.icon}
              isLast={index === visibleMenu.length - 1}
              key={item.slug}
              label={item.label}
              onPress={() => open(item.slug)}
            />
          ))}
        </RowGroup>
      </View>
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', borderRadius: radii.xxxl, flexDirection: 'row', gap: spacing[4] },
  copy: { flex: 1 },
  account: { color: colors.foreground, marginTop: spacing[1] },
  stats: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] },
  stat: { alignItems: 'center', flex: 1, paddingVertical: spacing[3] },
  value: { fontSize: 24, lineHeight: 31 },
  menuSpacing: { marginTop: spacing[5] },
  footer: { marginTop: spacing[5], textAlign: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
