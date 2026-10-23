import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { GuideAnchor, useGuide, useGuideAvailability } from '@/features/usage-guide/GuideBindings';
import { useState } from 'react';
import { hotspotCenters, hotspotSources, selectHotspotSource, hotspotReportedPrompts, hotspotQuestionOrigins } from '@icao/contracts/app-content';
import { useLocalSearchParams } from 'expo-router';
import { Sparkles } from '@/components/ui/icons';
import { StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

import { HotspotAccessNotice, HotspotBriefCard } from './HotspotAccessView.native';
import { useHotspotAccess } from './use-hotspot-access.native';

export function HotspotDetailScreen({ briefId }: { briefId: string }) {
  return <NativeScreenBoundary title="OPI 热点" fallbackHref="/content/hotspot" resetKey={briefId}><HotspotDetailContent briefId={briefId} /></NativeScreenBoundary>;
}

function HotspotDetailContent({ briefId }: { briefId: string }) {
  const router = useRouter();
  const guide = useGuide();
  const params=useLocalSearchParams<{center?:string}>();
  const [selection,setSelection]=useState(params.center??'all');
  const { retry, state } = useHotspotAccess(briefId);
  useGuideAvailability('hotspot', state.status === 'membership-required' ? '完整练习需要会员。可查看会员权益，或跳过教学继续浏览。'
    : state.status === 'loading' || state.status === 'ready' ? undefined : '热点暂时无法打开。可在页面重试或返回列表；教学进度不会误记为完成。');
  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/content/hotspot'); };
  if (state.status === 'loading') return <Screen contentStyle={styles.screen}><TopBar onBack={goBack} title="OPI 热点" /><GlobalLoadingScreen /></Screen>;

  const selectedBrief=state.brief?selectHotspotSource(state.brief,selection):undefined;
  const selectedIds=new Set(selectedBrief?.topics.flatMap(t=>t.cardIds));
  const topics=state.status==='ready'?state.topics.map(t=>({...t,cards:t.cards.filter(c=>selectedIds.has(c.id))})).filter(t=>t.cards.length):[];
  const totalQuestions = selectedBrief?.topics.reduce((sum, topic) => sum + topic.cardIds.length, 0) ?? 0;
  return (
    <Screen contentStyle={styles.screen} scroll>
      <TopBar onBack={goBack} title={state.brief?.title ?? 'OPI 热点'} />
      <View style={styles.body}>
        {state.brief ? <HotspotBriefCard brief={state.brief} /> : null}

        {state.status === 'ready' ? (
          <>
            <View style={styles.filters}>
              <Button size="sm" variant={selection==='all'?'primary':'outline'} onPress={()=>setSelection('all')}>全部考点</Button>
              {hotspotCenters(state.brief).filter(center=>hotspotSources(state.brief).some(s=>s.kind==='feedback'&&s.centers.includes(center))).map(center=><Button key={center} size="sm" variant={selection===center?'primary':'outline'} onPress={()=>setSelection(center)}>{center}</Button>)}
              {hotspotSources(state.brief).some(s=>s.kind==='general')?<Button size="sm" variant={selection==='general'?'primary':'outline'} onPress={()=>setSelection('general')}>本日综合反馈</Button>:null}
            </View>
            {hotspotSources(state.brief).some(s=>s.kind==='general')?<AppText variant="caption">历史综合反馈未逐题确认考点归属，单独保留供查看。</AppText>:null}
            <View style={styles.topicsSection}><GuideAnchor id="hotspot-article" />
              <AppText variant="sectionTitle">涵盖话题与问题（{topics.length}）</AppText>
              {topics.map((topic, topicIndex) => (
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
                        <View style={styles.questionContent}><AppText>{card.kind !== 'image' && hotspotReportedPrompts(selectedBrief!,card).join('\n') || card.audioText}</AppText><View style={styles.filters}>{hotspotQuestionOrigins(selectedBrief!,card.id).map(origin=><Tag key={origin} tone="muted">{origin}</Tag>)}</View></View>
                      </View>
                    ))}
                  </View>
                </Card>
              ))}
            </View>
            <Button guideId="hotspot-study"
              onPress={() => { guide?.event('hotspot-study'); router.push({
                pathname: '/content/hotspot/[briefId]/study',
                params: { briefId: state.brief.id, ...(selection!=='all'?{center:selection}:{}) },
              }); }}
              disabled={!totalQuestions}
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  questionContent: { flex: 1, gap: spacing[1.5] },
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
