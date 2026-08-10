import { useRouter } from 'expo-router';
import { Calendar, MapPin, Sparkles } from '@/components/ui/icons';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { loadQuestionBank } from '@/features/question-bank/data/repository';
import type { QuestionBankDataset } from '@/features/question-bank/types';
import { colors, fonts, radii, spacing } from '@/theme';

import { resolveHotspotTopics } from './build-hotspot-session';
import { getHotspotBrief } from './repository';
import type { ResolvedOpiHotspotTopic } from './types';

export function HotspotDetailScreen({ briefId }: { briefId: string }) {
  const router = useRouter();
  const brief = getHotspotBrief(briefId);
  const [topics, setTopics] = useState<ResolvedOpiHotspotTopic[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!brief) return;
    setError(undefined);
    try {
      const result = await loadQuestionBank('opi');
      if (!result?.dataset) throw new Error('OPI 题库数据读取失败，请稍后重试。');
      setTopics(resolveHotspotTopics(brief, result.dataset));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '热点详情读取失败。');
    }
  }, [brief]);

  useEffect(() => { void load(); }, [load]);

  if (!brief) {
    return (
      <Screen contentStyle={styles.state}>
        <TopBar onBack={() => router.back()} title="OPI 热点" />
        <CenteredState description="该热点资讯不存在或已经下线。" title="无法打开热点资讯" tone="destructive" />
      </Screen>
    );
  }
  if (!topics && !error) return <GlobalLoadingScreen />;

  const totalQuestions = brief.topics.reduce((sum, topic) => sum + topic.cardIds.length, 0);
  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar onBack={() => router.back()} title={brief.title} />
      <View style={styles.body}>
        <Card style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Calendar color={colors.primary} size={16} />
            <AppText color={colors.primary} style={styles.heroDateText} variant="caption">{brief.date} 考情归档</AppText>
          </View>
          <AppText style={styles.heroTitle} variant="pageTitle">{brief.title}</AppText>
          <View style={styles.tagsRow}>
            {brief.centers.map((center) => <Tag key={center}><MapPin size={11} /> {center}</Tag>)}
          </View>
          <AppText>本套练习包含 {brief.topics.length} 个考试话题，共 {totalQuestions} 道 OPI 题库精选口语题。</AppText>
        </Card>

        {error ? (
          <CenteredState actionLabel="重新加载" description={error} onAction={() => void load()} title="热点详情读取失败" tone="destructive" />
        ) : (
          <View style={styles.topicsSection}>
            <AppText variant="sectionTitle">涵盖话题与问题（{topics?.length ?? 0}）</AppText>
            {topics?.map((topic, topicIndex) => (
              <Card key={topic.topicId} style={styles.topicCard}>
                <View style={styles.topicHeader}>
                  <View style={styles.topicNumberBadge}>
                    <AppText color={colors.primary} style={styles.topicNumberText} variant="micro">
                      TOPIC {String(topicIndex + 1).padStart(2, '0')}
                    </AppText>
                  </View>
                  <AppText style={styles.topicName} variant="cardTitle">{topic.topicTitle}</AppText>
                </View>
                <View style={styles.questionList}>
                  {topic.cards.map((card, cardIndex) => (
                    <View key={card.id} style={styles.questionRow}>
                      <AppText color={colors.primary} style={styles.questionIndex} variant="micro">
                        {String(cardIndex + 1).padStart(2, '0')}
                      </AppText>
                      <AppText style={styles.questionText}>{card.audioText}</AppText>
                    </View>
                  ))}
                </View>
              </Card>
            ))}
          </View>
        )}

        <Button
          disabled={Boolean(error) || !topics}
          onPress={() => router.push({
            pathname: '/content/hotspot/[briefId]/study',
            params: { briefId: brief.id },
          })}
          size="lg"
          style={styles.cta}
        >
          <Sparkles size={18} /> 开始学习（共 {totalQuestions} 题）
        </Button>
      </View>
    </Screen>
  );
}

export async function loadHotspotDataset(): Promise<QuestionBankDataset> {
  const result = await loadQuestionBank('opi');
  if (!result?.dataset) throw new Error('OPI 题库数据读取失败，请稍后重试。');
  return result.dataset;
}

const styles = StyleSheet.create({
  state: { paddingHorizontal: 0 },
  screen: { paddingHorizontal: 0 },
  body: { gap: spacing[4], paddingBottom: spacing[10], paddingHorizontal: spacing[4] },
  heroCard: { gap: spacing[2], marginTop: spacing[2], padding: spacing[5] },
  heroBadge: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5] },
  heroDateText: { fontFamily: fonts.monoRegular, fontSize: 12 },
  heroTitle: { fontSize: 22 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
  topicsSection: { gap: spacing[3] },
  topicCard: { gap: spacing[3], padding: spacing[4] },
  topicHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  topicNumberBadge: { backgroundColor: colors.primary08, borderRadius: radii.md, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  topicNumberText: { fontFamily: fonts.monoRegular, fontSize: 11 },
  topicName: { flex: 1, fontSize: 16 },
  questionList: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing[2.5], paddingTop: spacing[3] },
  questionRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2.5] },
  questionIndex: { marginTop: 3, width: 18 },
  questionText: { flex: 1 },
  cta: { width: '100%' },
});
