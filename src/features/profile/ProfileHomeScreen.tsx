import { useRouter } from 'expo-router';
import { Bookmark, ChevronRight, History, MessageCircle, Settings, UserRound } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import type { LearningRecord } from '@/features/question-bank/types';
import { AccountScreen, Avatar, RowGroup, Row } from '@/components/account/account-ui';

const menu = [
  { slug: 'learning-records', label: '学习记录', icon: History },
  { slug: 'annotations', label: '我的标注', icon: Bookmark },
  { slug: 'settings', label: '设置', icon: Settings },
  { slug: 'help', label: '联系我们', icon: MessageCircle }
];

export function ProfileHomeScreen() {
  const router = useRouter();
  const [records, setRecords] = useState<LearningRecord[]>([]);
  useEffect(() => { void sqliteLearningStore.getRecords().then(setRecords); }, []);
  const cards = useMemo(() => records.reduce((sum, item) => sum + item.completedCount, 0), [records]);

  function open(slug: string) {
    if (slug === 'learning-records') router.push('/learning-records');
    else if (slug === 'annotations') router.push('/annotations');
    else if (slug === 'settings') router.push('/account/settings');
    else if (slug === 'help') router.push('/info/help');
    else router.push('/account/profile');
  }

  return (
    <AccountScreen>
      <Pressable onPress={() => open('profile-detail')} style={({ pressed }) => pressed ? styles.pressed : null}>
        <Card elevated style={styles.profile}>
          <Avatar size={56} icon={UserRound} />
          <View style={styles.copy}>
            <AppText variant="sectionTitle">飞行学员</AppText>
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
          <AppText style={styles.value} variant="pageTitle">{records.length}</AppText>
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
      <AppText style={styles.footer} variant="caption">© 2026 飞猪 ICAO · 咨询微信 15736231388</AppText>
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  profile: { alignItems: 'center', borderRadius: radii.xxxl, flexDirection: 'row', gap: spacing[4] },
  copy: { flex: 1 },
  stats: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] },
  stat: { alignItems: 'center', flex: 1, paddingVertical: spacing[3] },
  value: { fontSize: 24, lineHeight: 31 },
  menuSpacing: { marginTop: spacing[5] },
  footer: { marginTop: spacing[5], textAlign: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
