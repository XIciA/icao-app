import { useRouter } from 'expo-router';
import { Sparkles } from '@/components/ui/icons';
import { StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import { HotspotAccessNotice, HotspotBriefCard } from './HotspotAccessView.native';
import { useHotspotAccess } from './use-hotspot-access.native';

export function HotspotDetailScreen({ briefId }: { briefId: string }) {
  return <NativeScreenBoundary title="OPI 热点" fallbackHref="/content/hotspot" resetKey={briefId}><HotspotDetailContent briefId={briefId} /></NativeScreenBoundary>;
}

function HotspotDetailContent({ briefId }: { briefId: string }) {
  const router = useRouter();
  const { retry, state } = useHotspotAccess(briefId);
  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/content/hotspot'); };
  if (state.status === 'loading') return <Screen contentStyle={styles.screen}><TopBar onBack={goBack} title="OPI 热点" /><GlobalLoadingScreen /></Screen>;

  const totalQuestions = state.brief?.topics.reduce((sum, topic) => sum + topic.cardIds.length, 0) ?? 0;
  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar onBack={goBack} title={state.brief?.title ?? 'OPI 热点'} />
      <View style={styles.body}>
        {state.brief ? <HotspotBriefCard brief={state.brief} /> : null}

        {state.status === 'ready' ? (
          <>
            <View style={styles.topicsSection}>
              <AppText variant="sectionTitle">涵盖话题与问题（{state.topics.length}）</AppText>
              {state.topics.map((topic, topicIndex) => (
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
                        <AppText style={styles.questionText}>{card.kind !== 'image' && card.reportedPrompts?.[state.brief.id]?.join('\n') || card.audioText}</AppText>
                      </View>
                    ))}
                  </View>
                </Card>
              ))}
            </View>
            <Button
              onPress={() => router.push({
                pathname: '/content/hotspot/[briefId]/study',
                params: { briefId: state.brief.id },
              })}
              size="lg"
              style={styles.cta}
            >
              <Sparkles size={18} /> 开始学习（共 {totalQuestions} 题）
            </Button>
          </>
        ) : (
          <HotspotAccessNotice
            onMembership={() => router.push({ pathname: '/account/[slug]', params: { slug: 'membership', from: 'learning' } })}
            onRetry={retry}
            result={state}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  body: { gap: spacing[4], paddingBottom: spacing[10], paddingHorizontal: spacing[4] },
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
