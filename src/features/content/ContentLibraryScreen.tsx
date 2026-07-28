import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Card, Screen, Tag } from '@/components/ui';
import { ResourceEditorialScreen } from '@/features/editorial/ResourceEditorialScreen';
import { colors, radii, spacing } from '@/theme';

import { CourseCatalogScreen } from './courses/CourseCatalogScreen';
import { HotspotContainerScreen } from './hotspot/HotspotListScreen';

export function ContentLibraryScreen({ slug }: { slug: string }) {
  if (slug === 'courses') return <CourseCatalogScreen />;
  if (slug === 'hotspot') return <HotspotContainerScreen />;
  if (slug === 'resources') return <ResourceEditorialScreen />;
  return null;
}

function HotspotScreen() {
  const briefs = [
    {
      date: '2026-07-09',
      title: '7月9日 考试资讯',
      centers: ['广汉考点', '绵阳考点'],
      topics: ['风切变', '危险品培训', '复飞', '五边威胁', '燃油政策'],
    },
    {
      date: '2026-07-08',
      title: '7月8日 考试资讯',
      centers: ['广汉考点', '绵阳考点'],
      topics: ['TCAS', '冲出跑道落水', '飞行员疲劳', '无人机'],
    },
  ];
  const [active, setActive] = useState<(typeof briefs)[number]>();

  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar title="OPI 热点" />
      <View style={styles.intro}>
        <AppText>每日更新各考点 OPI 真实考题资讯，一天一篇。点开查看当日考点解析。</AppText>
      </View>
      <View style={styles.list}>
        {briefs.map((brief) => {
          const [year, month, day] = brief.date.split('-');
          return (
            <Card key={brief.date} style={styles.hotspotCard}>
              <Pressable onPress={() => setActive(brief)} style={styles.hotspotTop}>
                <View style={styles.dateBadge}>
                  <AppText color={colors.primary} style={styles.day} variant="sectionTitle">
                    {day}
                  </AppText>
                  <AppText color={colors.primary} variant="micro">
                    {month === '07' ? 'JUL' : `${year}`}
                  </AppText>
                </View>
                <View style={styles.grow}>
                  <AppText variant="sectionTitle">{brief.title}</AppText>
                  <View style={styles.tags}>
                    {brief.centers.map((center) => (
                      <Tag key={center}>
                        <MapPin size={11} /> {center}
                      </Tag>
                    ))}
                  </View>
                  <AppText variant="micro">共 {brief.topics.length} 个考点</AppText>
                </View>
              </Pressable>
              <View style={styles.hotspotActions}>
                <Button onPress={() => setActive(brief)} style={styles.grow} variant="outline">
                  查看详情 →
                </Button>
              </View>
            </Card>
          );
        })}
      </View>
      <BottomSheet
        accessibilityLabel={active?.title ?? '考点详情'}
        onClose={() => setActive(undefined)}
        visible={Boolean(active)}
      >
        {active ? (
          <View style={styles.detail}>
            <AppText variant="pageTitle">{active.title}</AppText>
            <AppText variant="caption">{active.date}</AppText>
            {active.topics.map((topic, index) => (
              <Card key={topic}>
                <AppText color={colors.primary} variant="micro">
                  TOPIC {index + 1}
                </AppText>
                <AppText variant="cardTitle">{topic}</AppText>
                <AppText>
                  围绕该主题组织背景、风险、处置与个人观点，完成结构化口语表达。
                </AppText>
              </Card>
            ))}
            <Button onPress={() => setActive(undefined)} size="lg">
              完成查看
            </Button>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  intro: { gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  list: { gap: spacing[3], paddingBottom: spacing[6] },
  detail: { gap: spacing[3], paddingBottom: spacing[4] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  hotspotCard: { overflow: 'hidden', padding: 0 },
  hotspotTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3], padding: spacing[4] },
  dateBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary06,
    borderRadius: radii.xl,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  day: { lineHeight: 20 },
  grow: { flex: 1 },
  hotspotActions: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3],
  },
});
