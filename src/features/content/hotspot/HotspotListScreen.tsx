import { Calendar, ChevronRight, Flame, MapPin, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { QuestionBankStudyScreen } from '@/features/question-bank/components/QuestionBankStudyScreen';
import { loadQuestionBank } from '@/features/question-bank/data/repository';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { buildHotspotSession, type HotspotSessionResult } from './build-hotspot-session';
import { loadHotspotBriefs } from './repository';
import type { OpiHotspotBrief } from './types';

const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function HotspotContainerScreen() {
  const [activeBrief, setActiveBrief] = useState<OpiHotspotBrief>();
  const [sessionData, setSessionData] = useState<HotspotSessionResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const handleStartStudy = async (brief: OpiHotspotBrief) => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await loadQuestionBank('opi');
      if (!result?.dataset) {
        throw new Error('OPI 题库数据读取失败，请稍后重试。');
      }
      const session = buildHotspotSession(brief, result.dataset);
      setSessionData(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉起练习包失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <GlobalLoadingScreen />;

  // 1. Full-screen study view when session is built
  if (sessionData) {
    return (
      <QuestionBankStudyScreen
        category={sessionData.category}
        dataset={sessionData.dataset}
        topic={sessionData.topic}
      />
    );
  }

  // 2. Full-screen detail view when brief selected
  if (activeBrief) {
    return (
      <HotspotDetailScreen
        brief={activeBrief}
        error={error}
        onBack={() => setActiveBrief(undefined)}
        onStartStudy={() => void handleStartStudy(activeBrief)}
      />
    );
  }

  // 3. Main list view
  return <HotspotListScreen onSelectBrief={(brief) => setActiveBrief(brief)} />;
}

export function HotspotListScreen({ onSelectBrief }: { onSelectBrief: (brief: OpiHotspotBrief) => void }) {
  const briefs = loadHotspotBriefs();

  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar title="OPI 热点" />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBox}>
            <Flame color={colors.accent} size={22} />
          </View>
          <View style={styles.headerText}>
            <AppText variant="pageTitle">每日考点资讯</AppText>
            <AppText variant="body">结合各大考点最新真实提问，快速进行针对性抽样练习。</AppText>
          </View>
        </View>
      </View>

      <View style={styles.list}>
        {briefs.map((brief) => {
          const [year, month, day] = brief.date.split('-');
          const monthIndex = parseInt(month ?? '1', 10) - 1;
          const monthLabel = MONTH_EN[monthIndex] ?? month;
          const totalQuestions = brief.topics.reduce((sum, t) => sum + t.cardIds.length, 0);

          return (
            <Card key={brief.id} style={styles.card}>
              <Pressable
                accessibilityLabel={`打开 ${brief.title}`}
                onPress={() => onSelectBrief(brief)}
                style={({ pressed }) => [styles.cardPressable, pressed ? styles.pressed : null]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.dateBadge}>
                    <AppText color={colors.primary} style={styles.day} variant="sectionTitle">
                      {day}
                    </AppText>
                    <AppText color={colors.primary} style={styles.month} variant="micro">
                      {monthLabel}
                    </AppText>
                  </View>
                  <View style={styles.cardInfo}>
                    <AppText style={styles.briefTitle} variant="cardTitle">
                      {brief.title}
                    </AppText>
                    <View style={styles.tagsRow}>
                      {brief.centers.map((center) => (
                        <Tag key={center}>
                          <MapPin size={11} /> {center}
                        </Tag>
                      ))}
                    </View>
                    <View style={styles.metaRow}>
                      <AppText variant="caption">
                        {brief.topics.length} 个考点话题 · 共 {totalQuestions} 题
                      </AppText>
                    </View>
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

export function HotspotDetailScreen({
  brief,
  onBack,
  onStartStudy,
  error,
}: {
  brief: OpiHotspotBrief;
  onBack: () => void;
  onStartStudy: () => void;
  error?: string;
}) {
  const totalQuestions = brief.topics.reduce((sum, t) => sum + t.cardIds.length, 0);

  return (
    <Screen contentStyle={styles.detailScreen} scroll>
      <TopBar onBack={onBack} title={brief.title} />

      <View style={styles.detailBody}>
        {/* Banner Header */}
        <Card style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroBadge}>
              <Calendar color={colors.primary} size={16} />
              <AppText color={colors.primary} style={styles.heroDateText} variant="caption">
                {brief.date} 考情归档
              </AppText>
            </View>
            <AppText style={styles.heroTitle} variant="pageTitle">
              {brief.title}
            </AppText>
            <View style={styles.tagsRow}>
              {brief.centers.map((center) => (
                <Tag key={center}>
                  <MapPin size={11} /> {center}
                </Tag>
              ))}
            </View>
            <AppText variant="body">
              本套练习包含当日精选的 {brief.topics.length} 个考试话题（共 {totalQuestions} 道 OPI 真实口语题）。点击底部开始全真练习。
            </AppText>
          </View>
        </Card>

        {error ? (
          <CenteredState description={error} title="拉起练习包失败" tone="destructive" />
        ) : null}

        {/* Topics List */}
        <View style={styles.topicsSection}>
          <AppText style={styles.sectionHeader} variant="sectionTitle">
            涵盖话题与题库包 ({brief.topics.length})
          </AppText>

          {brief.topics.map((topic, index) => (
            <Card key={topic.topicId} style={styles.topicCard}>
              <View style={styles.topicHeader}>
                <View style={styles.topicNumberBadge}>
                  <AppText color={colors.primary} style={styles.topicNumberText} variant="micro">
                    TOPIC {String(index + 1).padStart(2, '0')}
                  </AppText>
                </View>
                <AppText style={styles.topicName} variant="cardTitle">
                  {topic.topicTitle}
                </AppText>
              </View>
              <View style={styles.topicFooter}>
                <AppText variant="caption">包含 {topic.cardIds.length} 道 OPI 精选提问</AppText>
              </View>
            </Card>
          ))}
        </View>

        {/* Floating Action CTA */}
        <View style={styles.ctaContainer}>
          <Button onPress={onStartStudy} size="lg" style={styles.ctaButton}>
            <Sparkles size={18} /> 开始学习（共 {totalQuestions} 题）
          </Button>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  header: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  titleRow: { flexDirection: 'row', gap: spacing[3] },
  iconBox: {
    alignItems: 'center',
    backgroundColor: colors.primary08,
    borderRadius: radii.xl,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerText: { flex: 1, gap: spacing[1] },
  list: { gap: spacing[3], paddingHorizontal: spacing[4], paddingBottom: spacing[8] },
  card: { overflow: 'hidden', padding: 0 },
  cardPressable: { padding: spacing[4] },
  pressed: { opacity: 0.85 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  dateBadge: {
    alignItems: 'center',
    backgroundColor: colors.primary06,
    borderRadius: radii.xl,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  day: { fontFamily: fonts.monoRegular, fontSize: 20, lineHeight: 22 },
  month: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.5 },
  cardInfo: { flex: 1, gap: spacing[1.5] },
  briefTitle: { fontSize: 16 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
  metaRow: { marginTop: spacing[1] },

  // Detail screen styles
  detailScreen: { paddingHorizontal: 0 },
  detailBody: { gap: spacing[4], paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  heroCard: { gap: spacing[3], marginTop: spacing[2], padding: spacing[5] },
  heroHeader: { gap: spacing[2] },
  heroBadge: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5] },
  heroDateText: { fontFamily: fonts.monoRegular, fontSize: 12 },
  heroTitle: { fontSize: 22 },
  topicsSection: { gap: spacing[3], marginTop: spacing[2] },
  sectionHeader: { marginBottom: spacing[1] },
  topicCard: { gap: spacing[2], padding: spacing[4] },
  topicHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  topicNumberBadge: {
    backgroundColor: colors.primary08,
    borderRadius: radii.md,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  topicNumberText: { fontFamily: fonts.monoRegular, fontSize: 11 },
  topicName: { flex: 1, fontSize: 16 },
  topicFooter: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing[2] },
  ctaContainer: { marginTop: spacing[4] },
  ctaButton: { width: '100%' },
});
