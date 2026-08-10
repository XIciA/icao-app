import { useRouter } from 'expo-router';
import { BookOpenText, Check, ChevronDown, ChevronRight, CloudLightning, Cog, Compass, Headphones, Library, MessageSquareQuote, Mic2, RadioTower, UserRound, Wrench, type LucideIcon } from '@/components/ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Card, Screen } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import { getEmbeddedQuestionBanks } from '../data/repository';
import { loadCatalogProgress, type CatalogProgressMap } from '../lib/catalog-progress';
import type { QuestionBankCategory, QuestionBankDataset } from '../types';
import { QuestionBankSwitcherHeader } from './QuestionBankSwitcherHeader';

const icons: LucideIcon[] = [CloudLightning, Cog, RadioTower, Wrench];
const bankIcons: Record<QuestionBankDataset['icon'], LucideIcon> = {
  headphones: Headphones,
  sentences: MessageSquareQuote,
  radioTower: RadioTower,
  mic: Mic2,
  story: BookOpenText,
};

export function QuestionBankCatalog({ dataset }: { dataset: QuestionBankDataset }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string>();
  const [progress, setProgress] = useState<CatalogProgressMap>({});
  const switcherItems = useMemo(() => getEmbeddedQuestionBanks().map((item) => ({
    icon: bankIcons[item.icon],
    label: item.title,
    summary: `${item.categories.length} ${item.categoryUnit} / ${item.declaredCardCount} ${item.cardUnit}`,
    value: item.id,
  })), []);

  useEffect(() => {
    let active = true;
    const topics = dataset.categories.flatMap((category) => category.topics);
    void loadCatalogProgress(topics).then((nextProgress) => {
      if (active) setProgress(nextProgress);
    });
    return () => {
      active = false;
    };
  }, [dataset]);

  function openTopic(category: QuestionBankCategory, topicId: string) {
    router.push({
      pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]',
      params: { bankId: dataset.id, categoryId: category.id, topicId },
    });
  }

  return (
    <Screen background={<SoftGlow intensity={0.75} size={360} style={styles.glow} />} contentStyle={styles.screen}>
      <QuestionBankSwitcherHeader
        items={switcherItems}
        onBack={() => router.back()}
        onSelect={(nextBankId) => router.replace({ pathname: '/question-bank/[bankId]', params: { bankId: nextBankId } })}
        value={dataset.id}
      />

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
      <CatalogBottomNav onNavigate={(route) => router.replace(route)} />
    </Screen>
  );
}

function CatalogBottomNav({ onNavigate }: { onNavigate: (route: '/(tabs)' | '/(tabs)/discover' | '/(tabs)/profile') => void }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomNav, { bottom: Math.max(insets.bottom, spacing[4]) }]}>
    <Pressable onPress={() => onNavigate('/(tabs)')} style={[styles.navItem, styles.navActive]}><Library color={colors.primary} size={19} /><AppText color={colors.primary} variant="button">题库</AppText></Pressable>
    <Pressable accessibilityLabel="发现" onPress={() => onNavigate('/(tabs)/discover')} style={styles.navIcon}><Compass color={colors.mutedForeground} size={19} /></Pressable>
    <Pressable accessibilityLabel="我的" onPress={() => onNavigate('/(tabs)/profile')} style={styles.navIcon}><UserRound color={colors.mutedForeground} size={19} /></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  glow: { left: 8, top: -230 },
  scrollFrame: { flex: 1 },
  list: { gap: spacing[3], paddingBottom: 112, paddingHorizontal: spacing[5], paddingTop: spacing[3] },
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
  bottomNav: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.background72, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[2], padding: spacing[1.5], position: 'absolute', ...shadows.floating },
  navItem: { alignItems: 'center', borderRadius: radii.full, flexDirection: 'row', gap: spacing[1.5], height: 40, paddingHorizontal: spacing[4] },
  navActive: { backgroundColor: colors.primary10 },
  navIcon: { alignItems: 'center', height: 40, justifyContent: 'center', width: 44 },
});
