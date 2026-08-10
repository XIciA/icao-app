import { useRouter } from 'expo-router';
import { ChevronRight, Flame, MapPin } from '@/components/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Card, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import { loadHotspotBriefs } from './repository';

const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function HotspotListScreen() {
  const router = useRouter();
  const briefs = loadHotspotBriefs();

  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar title="OPI 热点" />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBox}><Flame color={colors.accent} size={22} /></View>
          <View style={styles.headerText}>
            <AppText variant="pageTitle">每日考点资讯</AppText>
            <AppText>结合 OPI 题库精选提问，快速进行针对性抽样练习。</AppText>
          </View>
        </View>
      </View>

      <View style={styles.list}>
        {briefs.map((brief) => {
          const [, month, day] = brief.date.split('-');
          const monthIndex = parseInt(month ?? '1', 10) - 1;
          const monthLabel = MONTH_EN[monthIndex] ?? month;
          const totalQuestions = brief.topics.reduce((sum, t) => sum + t.cardIds.length, 0);

          return (
            <Card key={brief.id} style={styles.card}>
              <Pressable
                accessibilityLabel={`打开 ${brief.title}`}
                onPress={() => router.push({
                  pathname: '/content/hotspot/[briefId]',
                  params: { briefId: brief.id },
                })}
                style={({ pressed }) => [styles.cardPressable, pressed ? styles.pressed : null]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.dateBadge}>
                    <AppText color={colors.primary} style={styles.day} variant="sectionTitle">{day}</AppText>
                    <AppText color={colors.primary} style={styles.month} variant="micro">{monthLabel}</AppText>
                  </View>
                  <View style={styles.cardInfo}>
                    <AppText style={styles.briefTitle} variant="cardTitle">{brief.title}</AppText>
                    <View style={styles.tagsRow}>
                      {brief.centers.map((center) => <Tag key={center}><MapPin size={11} /> {center}</Tag>)}
                    </View>
                    <AppText variant="caption">{brief.topics.length} 个考点话题 · 共 {totalQuestions} 题</AppText>
                  </View>
                  <ChevronRight color={colors.mutedForeground} size={18} />
                </View>
              </Pressable>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  header: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  titleRow: { flexDirection: 'row', gap: spacing[3] },
  iconBox: { alignItems: 'center', backgroundColor: colors.primary08, borderRadius: radii.xl, height: 48, justifyContent: 'center', width: 48 },
  headerText: { flex: 1, gap: spacing[1] },
  list: { gap: spacing[3], paddingBottom: spacing[8], paddingHorizontal: spacing[4] },
  card: { overflow: 'hidden', padding: 0 },
  cardPressable: { padding: spacing[4] },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  dateBadge: { alignItems: 'center', backgroundColor: colors.primary06, borderRadius: radii.xl, height: 56, justifyContent: 'center', width: 56 },
  day: { fontFamily: fonts.monoRegular, fontSize: 20, lineHeight: 22 },
  month: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5 },
  cardInfo: { flex: 1, gap: spacing[1.5] },
  briefTitle: { fontSize: 16 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
});
