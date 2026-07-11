import { useRouter } from 'expo-router';
import { Check, ChevronDown, ChevronRight, CloudLightning, Cog, RadioTower, Wrench, type LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Card, Screen } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { completedCards, sqliteLearningStore } from '../platform/learning-store';
import type { QuestionBankCategory, QuestionBankDataset } from '../types';

const icons: LucideIcon[] = [CloudLightning, Cog, RadioTower, Wrench];

type ProgressMap = Record<string, { learned: number; total: number }>;

export function QuestionBankCatalog({ dataset }: { dataset: QuestionBankDataset }) {
  const router = useRouter();
  const initialExpanded = dataset.categories.find((category) => category.topics.length > 1)?.id;
  const [expanded, setExpanded] = useState<string | undefined>(initialExpanded);
  const [progress, setProgress] = useState<ProgressMap>({});

  useEffect(() => {
    let active = true;
    const topics = dataset.categories.flatMap((category) => category.topics);
    void Promise.all(
      topics.map(async (topic) => {
        const states = await sqliteLearningStore.getTopicStates(topic);
        return [topic.id, { learned: completedCards(topic.cards, states), total: topic.declaredCardCount }] as const;
      }),
    ).then((entries) => {
      if (active) setProgress(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [dataset]);

  const totalLearned = useMemo(
    () => Object.values(progress).reduce((sum, item) => sum + item.learned, 0),
    [progress],
  );

  function openTopic(category: QuestionBankCategory, topicId: string) {
    router.push({
      pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]',
      params: { bankId: dataset.id, categoryId: category.id, topicId },
    });
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.glow} />
      <TopBar title={dataset.title} />
      <View style={styles.summary}>
        <AppText color={colors.primary} style={styles.eyebrow} variant="micro">
          {dataset.nameEn.toUpperCase()}
        </AppText>
        <AppText variant="pageTitle">{dataset.title}题库</AppText>
        <AppText style={styles.description}>{dataset.description} · {dataset.summary}</AppText>
        <View style={styles.summaryProgress}>
          <View style={[styles.summaryFill, { width: `${Math.min(100, (totalLearned / dataset.declaredCardCount) * 100)}%` }]} />
        </View>
        <AppText variant="caption">已学 {totalLearned} / {dataset.declaredCardCount}</AppText>
      </View>

      <View style={styles.scrollFrame}>
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {dataset.categories.map((category, categoryIndex) => {
            const singleTopic = category.topics.length === 1 ? category.topics[0] : undefined;
            const isExpanded = !singleTopic && expanded === category.id;
            const categoryLearned = category.topics.reduce((sum, topic) => sum + (progress[topic.id]?.learned ?? 0), 0);
            const Icon = icons[categoryIndex % icons.length];

            return (
              <Card key={category.id} style={[styles.category, isExpanded ? styles.categoryExpanded : null]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => singleTopic ? openTopic(category, singleTopic.id) : setExpanded(isExpanded ? undefined : category.id)}
                  style={({ pressed }) => [styles.categoryHeader, pressed ? styles.pressed : null]}
                >
                  <View style={[styles.categoryIcon, isExpanded ? styles.categoryIconExpanded : null]}>
                    <Icon color={isExpanded ? colors.primaryForeground : colors.primary} size={20} />
                  </View>
                  <View style={styles.categoryCopy}>
                    <AppText variant="cardTitle">{category.name}</AppText>
                    <AppText numberOfLines={1} variant="caption">
                      {singleTopic
                        ? `${category.declaredCardCount} ${dataset.cardUnit}`
                        : `${category.declaredTopicCount} ${dataset.topicUnit} / ${category.declaredCardCount} ${dataset.cardUnit}`}
                    </AppText>
                  </View>
                  <View style={styles.countPill}>
                    {categoryLearned >= category.declaredCardCount && category.declaredCardCount > 0 ? <Check color={colors.primary} size={12} /> : null}
                    <AppText color={categoryLearned ? colors.primary : colors.mutedForeground} style={styles.countText} variant="micro">
                      {categoryLearned}/{category.declaredCardCount}
                    </AppText>
                  </View>
                  {singleTopic ? (
                    <ChevronRight color={colors.mutedForeground} size={20} />
                  ) : (
                    <ChevronDown color={colors.mutedForeground} size={20} style={isExpanded ? styles.rotated : undefined} />
                  )}
                </Pressable>

                {isExpanded ? (
                  <View style={styles.topicList}>
                    {category.topics.map((topic, topicIndex) => {
                      const topicProgress = progress[topic.id] ?? { learned: 0, total: topic.declaredCardCount };
                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={topic.id}
                          onPress={() => openTopic(category, topic.id)}
                          style={({ pressed }) => [styles.topic, pressed ? styles.pressed : null]}
                        >
                          <View style={styles.topicNumber}>
                            <AppText style={styles.topicNumberText} variant="micro">{topicIndex + 1}</AppText>
                          </View>
                          <View style={styles.topicCopy}>
                            <AppText numberOfLines={1} variant="button">{topic.name}</AppText>
                            <View style={styles.topicProgressRow}>
                              <View style={styles.topicProgressTrack}>
                                <View style={[styles.topicProgressFill, { width: `${Math.min(100, (topicProgress.learned / Math.max(1, topicProgress.total)) * 100)}%` }]} />
                              </View>
                              <AppText style={styles.topicCount} variant="micro">{topicProgress.learned}/{topicProgress.total}</AppText>
                            </View>
                          </View>
                          <ChevronRight color={colors.mutedForeground} size={17} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
            );
          })}
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  glow: { backgroundColor: colors.primary06, borderRadius: radii.full, height: 300, left: -90, position: 'absolute', right: -90, top: -190 },
  summary: { gap: spacing[1], paddingHorizontal: spacing[5], paddingBottom: spacing[4], paddingTop: spacing[3] },
  eyebrow: { letterSpacing: 1.8 },
  description: { marginTop: spacing[1] },
  summaryProgress: { backgroundColor: colors.secondary, borderRadius: radii.full, height: 7, marginTop: spacing[3], overflow: 'hidden' },
  summaryFill: { backgroundColor: colors.primary, borderRadius: radii.full, height: '100%' },
  scrollFrame: { flex: 1 },
  list: { gap: spacing[3], paddingBottom: spacing[6], paddingTop: spacing[2] },
  category: { padding: 0, ...shadows.card },
  categoryExpanded: { borderColor: colors.primary20 },
  categoryHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 74, padding: spacing[4] },
  categoryIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 40, justifyContent: 'center', width: 40 },
  categoryIconExpanded: { backgroundColor: colors.primary },
  categoryCopy: { flex: 1, minWidth: 0 },
  countPill: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, flexDirection: 'row', gap: 3, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  countText: { fontFamily: fonts.monoRegular },
  rotated: { transform: [{ rotate: '180deg' }] },
  topicList: { borderTopColor: colors.border, borderTopWidth: 1 },
  topic: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing[3], minHeight: 62, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  topicNumber: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, height: 25, justifyContent: 'center', width: 25 },
  topicNumberText: { color: colors.mutedForeground, fontFamily: fonts.sansSemibold },
  topicCopy: { flex: 1, minWidth: 0 },
  topicProgressRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], marginTop: spacing[1.5] },
  topicProgressTrack: { backgroundColor: colors.secondary, borderRadius: radii.full, flex: 1, height: 5, overflow: 'hidden' },
  topicProgressFill: { backgroundColor: colors.primary, borderRadius: radii.full, height: '100%' },
  topicCount: { color: colors.mutedForeground, fontFamily: fonts.monoRegular, minWidth: 44, textAlign: 'right' },
  pressed: { opacity: 0.72 },
});
