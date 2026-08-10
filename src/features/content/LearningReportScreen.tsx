import { Clock, Layers, LineChart, Sparkles, Target, Zap } from '@/components/ui/icons';
import { StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Card, Screen, Tag } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, radii, spacing } from '@/theme';

export function LearningReportScreen() {
  return (
    <Screen
      background={<SoftGlow intensity={0.6} size={300} style={styles.glow} />}
      contentStyle={styles.screen}
      scroll
    >
      <TopBar title="学习报告" />

      <View style={styles.container}>
        {/* 正在开发主卡片 */}
        <Card elevated style={styles.heroCard}>
          <View style={styles.iconCircle}>
            <LineChart color={colors.primary} size={32} />
            <View style={styles.badgeSparkle}>
              <Sparkles color={colors.accentForeground} size={14} />
            </View>
          </View>

          <View style={styles.heroTextContainer}>
            <View style={styles.tagWrapper}>
              <Tag>
                <Clock size={11} /> 研发中
              </Tag>
            </View>
            <AppText style={styles.heroTitle} variant="pageTitle">
              学习报告功能正在开发中
            </AppText>
            <AppText style={styles.heroSub} variant="caption">
              敬请期待！我们正在为您打造全方位的 ICAO 英语能力分析系统，帮您精准识别薄弱项，高效提分。
            </AppText>
          </View>
        </Card>

        {/* 规划功能亮点预览 */}
        <View style={styles.sectionHeader}>
          <AppText variant="sectionTitle">即将推出</AppText>
          <AppText variant="micro">FEATURE PREVIEW</AppText>
        </View>

        <View style={styles.previewList}>
          <Card style={styles.previewCard}>
            <View style={styles.previewIconBox}>
              <Target color={colors.primary} size={20} />
            </View>
            <View style={styles.previewText}>
              <AppText variant="cardTitle">多维能力雷达诊断</AppText>
              <AppText variant="caption">
                涵盖发音、语法、词汇、流利度与理解力 5 大维度考官级评估。
              </AppText>
            </View>
          </Card>

          <Card style={styles.previewCard}>
            <View style={styles.previewIconBox}>
              <Zap color={colors.primary} size={20} />
            </View>
            <View style={styles.previewText}>
              <AppText variant="cardTitle">薄弱考点精准归因</AppText>
              <AppText variant="caption">
                自动归纳陆空通话及 OPI 面试易错主题，提供针对性强化方案。
              </AppText>
            </View>
          </Card>

          <Card style={styles.previewCard}>
            <View style={styles.previewIconBox}>
              <Layers color={colors.primary} size={20} />
            </View>
            <View style={styles.previewText}>
              <AppText variant="cardTitle">模考成长提分曲线</AppText>
              <AppText variant="caption">
                追踪每次 AI 模考作答轨迹，量化复习成效与通过率趋势预测。
              </AppText>
            </View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  glow: {
    right: -100,
    top: -120,
  },
  container: {
    gap: spacing[5],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  heroCard: {
    alignItems: 'center',
    gap: spacing[4],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.primary08,
    borderRadius: radii.full,
    height: 72,
    justifyContent: 'center',
    position: 'relative',
    width: 72,
  },
  badgeSparkle: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    top: -2,
    width: 24,
  },
  heroTextContainer: {
    alignItems: 'center',
    gap: spacing[2],
  },
  tagWrapper: {
    alignSelf: 'center',
  },
  heroTitle: {
    textAlign: 'center',
  },
  heroSub: {
    color: colors.mutedForeground,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  previewList: {
    gap: spacing[3],
    paddingBottom: spacing[4],
  },
  previewCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[4],
  },
  previewIconBox: {
    alignItems: 'center',
    backgroundColor: colors.primary08,
    borderRadius: radii.xl,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  previewText: {
    flex: 1,
    gap: spacing[1],
  },
});
