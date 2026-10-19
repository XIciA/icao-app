import { hotspotCenters } from '@icao/contracts/app-content';
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ChevronRight, Flame, MapPin } from '@/components/ui/icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

import { loadHotspotBriefs, refreshHotspotDirectory } from './repository.native';


export function HotspotListScreen() {
  return <NativeScreenBoundary title="OPI 热点" fallbackHref="/(tabs)/discover"><HotspotListContent /></NativeScreenBoundary>;
}

function HotspotListContent() {
  const router = useRouter();
  const [briefs, setBriefs] = useState(loadHotspotBriefs);
  const [warning, setWarning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    void refreshHotspotDirectory().then((result) => { if (active) { setBriefs(result.briefs); setWarning(!!result.warning); } }).catch(() => { if (active) setWarning(true); });
    return () => { active = false; };
  // Manual retry intentionally recreates the focus effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]));

  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar title="OPI 热点" />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBox}><Flame color={colors.accent} size={22} /></View>
          <View style={styles.headerText}>
            <AppText variant="pageTitle">每日考点资讯</AppText>
            <AppText>按考试日期整理，进入即可学习对应题目。</AppText>
          </View>
        </View>
      </View>

      <View style={styles.list}>
        {warning ? <View><AppText>暂时无法更新热点，正在显示本机已有内容，可能缺少最新考点。请联网后重试。</AppText><Button variant="outline" onPress={() => setAttempt(n => n + 1)}>重新加载热点</Button></View> : null}
        {briefs.length === 0 ? <AppText style={{ padding: spacing[4] }}>暂无热点内容</AppText> : null}
        {briefs.map((brief) => {
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
                  <View style={styles.cardInfo}>
                    <AppText style={styles.briefTitle} variant="cardTitle">{brief.title}</AppText>
                    <View style={styles.tagsRow}>
                      {hotspotCenters(brief).map((center) => <Tag key={center}><MapPin size={11} /> {center}</Tag>)}
                    </View>
                    <AppText variant="caption">{hotspotCenters(brief).length ? `${hotspotCenters(brief).length} 个考点` : '综合反馈'} · {totalQuestions} 道题</AppText>
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
  cardInfo: { flex: 1, gap: spacing[1.5] },
  briefTitle: { fontSize: 16 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
});
