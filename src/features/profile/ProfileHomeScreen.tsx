import { useRouter } from 'expo-router';
import { Bookmark, ChevronRight, History, MessageCircle, Settings, UserRound } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import type { LearningRecord } from '@/features/question-bank/types';

const menu = [{ slug: 'learning-records', label: '学习记录', icon: History }, { slug: 'annotations', label: '我的标注', icon: Bookmark }, { slug: 'settings', label: '设置', icon: Settings }, { slug: 'help', label: '联系我们', icon: MessageCircle }];

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
  return <Screen bottomInset scroll contentStyle={styles.screen}><Pressable onPress={() => open('profile-detail')} style={({ pressed }) => pressed ? styles.pressed : null}><Card elevated style={styles.profile}><View style={styles.avatar}><UserRound color={colors.primary} size={28} /></View><View style={styles.copy}><AppText variant="sectionTitle">飞行学员</AppText><AppText variant="caption">目标：ICAO 4 级 · 加油！</AppText></View><ChevronRight color={colors.mutedForeground} size={20} /></Card></Pressable><View style={styles.stats}><Card style={styles.stat}><AppText style={styles.value} variant="pageTitle">{cards}</AppText><AppText variant="caption">已学卡片</AppText></Card><Card style={styles.stat}><AppText style={styles.value} variant="pageTitle">{records.length}</AppText><AppText variant="caption">学习次数</AppText></Card></View><Card style={styles.menu}>{menu.map((item, index) => { const Icon = item.icon; return <Pressable key={item.slug} onPress={() => open(item.slug)} style={({ pressed }) => [styles.row, index ? styles.border : null, pressed ? styles.rowPressed : null]}><View style={styles.icon}><Icon color={colors.primary} size={18} /></View><AppText style={styles.copy} variant="button">{item.label}</AppText><ChevronRight color={colors.mutedForeground} size={18} /></Pressable>; })}</Card><AppText style={styles.footer} variant="caption">© 2026 飞猪 ICAO · 咨询微信 15736231388</AppText></Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing[2] }, profile: { alignItems: 'center', borderRadius: radii.xxxl, flexDirection: 'row', gap: spacing[4] }, avatar: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 56, justifyContent: 'center', width: 56 }, copy: { flex: 1 }, stats: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] }, stat: { alignItems: 'center', flex: 1, paddingVertical: spacing[3] }, value: { fontSize: 24, lineHeight: 31 }, menu: { marginTop: spacing[5], padding: 0 }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 60, paddingHorizontal: spacing[4] }, border: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, icon: { alignItems: 'center', backgroundColor: colors.primary08, borderRadius: radii.lg, height: 36, justifyContent: 'center', width: 36 }, footer: { marginTop: spacing[5], textAlign: 'center' }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] }, rowPressed: { backgroundColor: colors.secondary },
});
