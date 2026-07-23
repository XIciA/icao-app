import { useFocusEffect, useRouter } from 'expo-router';
import { Bookmark, ChevronRight, History, MessageCircle, Settings, Star, UserRound } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { colors, radii, spacing } from '@/theme';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import type { LearningRecord } from '@/features/question-bank/types';
import { AccountScreen, Avatar, RowGroup, Row } from '@/components/account/account-ui';
import { useAuth } from '@/features/auth/AuthProvider';

const menu = [
  { slug: 'learning-records', label: '学习记录', icon: History },
  { slug: 'annotations', label: '我的标注', icon: Bookmark },
  { slug: 'word-favorites', label: '单词收藏', icon: Star },
  { slug: 'settings', label: '设置', icon: Settings },
  { slug: 'feedback', label: '意见反馈', icon: MessageCircle }
];

export function ProfileHomeScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [records, setRecords] = useState<LearningRecord[]>([]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void sqliteLearningStore.getRecords().then((items) => { if (active) setRecords(items); });
    return () => { active = false; };
  }, []));
  const sessionRecords = useMemo(() => records.filter((item) => item.recordType !== 'ai_result'), [records]);
  const cards = useMemo(() => sessionRecords.reduce((sum, item) => sum + item.completedCount, 0), [sessionRecords]);
  const accountLabel = auth.restoring
    ? '正在确认账号…'
    : auth.session?.user.displayName
      ? `内测账号 · ${auth.session.user.displayName}`
      : '尚未登录';

  function open(slug: string) {
    if (slug === 'learning-records') router.push('/learning-records');
    else if (slug === 'annotations') router.push('/annotations');
    else if (slug === 'word-favorites') router.push('/word-favorites');
    else if (slug === 'settings') router.push('/account/settings');
    else if (slug === 'feedback') router.push({
      pathname: '/info/[slug]',
      params: { slug: 'feedback', source: 'profile', sourceRoute: '/profile' },
    });
    else router.push('/account/profile');
  }

  return (
    <AccountScreen>
      <Pressable accessibilityLabel={`个人资料，${accountLabel}`} onPress={() => open('profile-detail')} style={({ pressed }) => pressed ? styles.pressed : null}>
        <Card elevated style={styles.profile}>
          <Avatar size={56} icon={UserRound} />
          <View style={styles.copy}>
            <AppText variant="sectionTitle">{auth.session?.user.displayName ?? '飞行学员'}</AppText>
            <AppText ellipsizeMode="middle" numberOfLines={1} style={styles.account} variant="caption">{accountLabel}</AppText>
            <AppText variant="caption">目标：ICAO 4 级 · 加油！</AppText>
          </View>
          <ChevronRight color={colors.mutedForeground} size={20} />
        </Card>
      </Pressable>
      <View style={styles.stats}>
        <Card style={styles.stat}>
          <AppText style={styles.value} variant="pageTitle">{cards}</AppText>
          <AppText variant="caption">已学卡片</AppText>
        </Card>
        <Card style={styles.stat}>
          <AppText style={styles.value} variant="pageTitle">{sessionRecords.length}</AppText>
          <AppText variant="caption">学习次数</AppText>
        </Card>
      </View>
      <View style={styles.menuSpacing}>
        <RowGroup>
          {menu.map((item, index) => (
            <Row
              key={item.slug}
              label={item.label}
              icon={item.icon}
              onPress={() => open(item.slug)}
              isLast={index === menu.length - 1}
            />
          ))}
        </RowGroup>
      </View>
      <AppText style={styles.footer} variant="caption">© 2026 飞猪 ICAO · {APP_DISPLAY_VERSION}</AppText>
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
