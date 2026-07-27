import { Image } from 'expo-image';
import { ArrowRight, CalendarDays, Pause, Play } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Card, Screen, Tag } from '@/components/ui';
import { ResourceEditorialScreen } from '@/features/editorial/ResourceEditorialScreen';
import { colors, radii, spacing } from '@/theme';

import { CourseCatalogScreen } from './courses/CourseCatalogScreen';
import { HotspotListScreen } from './hotspot/HotspotListScreen';

type FeedItem = { title: string; badge: string; summary: string; date: string; image: number; body: string[] };
const articleImages = [require('../../../assets/content/article-1.jpg'), require('../../../assets/content/article-2.jpg'), require('../../../assets/content/article-3.jpg'), require('../../../assets/content/article-4.jpg')];
const articles: FeedItem[] = [
  { image: articleImages[0], badge: 'Safety', title: 'Single-Engine Failure: How Modern Airliners Stay in the Air', summary: '从 ETOPS 认证到动力、液压和电气冗余，理解现代双发客机的单发安全能力。', date: 'May 24, 2026', body: ['Modern transport-category aircraft are certified to climb, cruise, and land safely on a single engine.', 'ETOPS defines how far a twin can fly from the nearest suitable airport. Redundancy is built into every critical system.', 'For the crew, an engine failure triggers a well-rehearsed identify, confirm and secure sequence.'] },
  { image: articleImages[1], badge: 'ATC', title: 'How Busy Airports Sequence Traffic', summary: '进近管制如何利用速度、航向、高度与尾流间隔组织高密度到达流。', date: 'May 10, 2026', body: ['Controllers build an arrival sequence by assigning speeds, headings, and altitudes.', 'Wake turbulence separation and ground flow management add further constraints.'] },
  { image: articleImages[2], badge: 'Phraseology', title: 'Why Standard Phraseology Bridges Any Accent', summary: '标准结构、复诵协议和歧义预防如何构成航空通话的共同语言。', date: 'April 27, 2026', body: ['ICAO standard phraseology is a tightly defined set of words and structures designed to remove ambiguity.', 'Key information is always read back to confirm correct understanding.'] },
  { image: articleImages[3], badge: 'Industry', title: 'Sustainable Aviation Fuel and Decarbonization', summary: 'SAF 原料、混合比例、成本挑战与氢能/混合动力的长期前景。', date: 'April 8, 2026', body: ['Sustainable Aviation Fuel is the most promising near-term decarbonization lever.', 'Scaling supply and reducing production cost remain the central challenges.'] },
];
export function ContentLibraryScreen({ slug }: { slug: string }) {
  const [active, setActive] = useState<FeedItem>();
  const [playing, setPlaying] = useState<string>();
  if (slug === 'courses') return <CourseCatalogScreen />;
  if (slug === 'hotspot') return <HotspotListScreen />;
  if (slug === 'resources') return <ResourceEditorialScreen />;
  return (
    <Screen scroll contentStyle={styles.screen}>
      <TopBar title="优质文章" />
      <View style={styles.intro}><AppText>精选民航知识与行业观察，每篇均配有音频版。不方便阅读时，点击播放即可边听边学。</AppText></View>
      <View style={styles.list}>{articles.map((item) => <FeedCard article item={item} key={item.title} onPlay={() => setPlaying((current) => current === item.title ? undefined : item.title)} onPress={() => setActive(item)} playing={playing === item.title} />)}</View>
      <BottomSheet accessibilityLabel={active?.title ?? '内容详情'} onClose={() => setActive(undefined)} visible={Boolean(active)}>
        {active ? <View style={styles.detail}><Tag>{active.badge}</Tag><AppText variant="pageTitle">{active.title}</AppText><AppText variant="caption">{active.date}</AppText>{active.body.map((paragraph) => <AppText key={paragraph}>{paragraph}</AppText>)}<Button onPress={() => setActive(undefined)} size="lg">阅读完成</Button></View> : null}
      </BottomSheet>
    </Screen>
  );
}

function FeedCard({ item, onPress, article, playing, onPlay }: { item: FeedItem; onPress: () => void; article: boolean; playing: boolean; onPlay: () => void }) {
  return <Card style={styles.feed}><Pressable accessibilityLabel={`查看${item.title}`} onPress={onPress}><Image contentFit="cover" source={item.image} style={styles.image} /></Pressable><View style={styles.feedCopy}><Tag>{item.badge}</Tag><Pressable onPress={onPress}><AppText variant="cardTitle">{item.title}</AppText></Pressable><AppText numberOfLines={2}>{item.summary}</AppText>{article ? <Pressable accessibilityLabel={playing ? '暂停音频示例' : '播放音频示例'} onPress={onPlay} style={styles.audioDemo}><View style={styles.audioButton}>{playing ? <Pause color={colors.primaryForeground} fill={colors.primaryForeground} size={14} /> : <Play color={colors.primaryForeground} fill={colors.primaryForeground} size={14} />}</View><View style={styles.audioTrack}><View style={[styles.audioFill, { width: playing ? '34%' : '0%' }]} /></View><AppText style={styles.audioTime} variant="micro">03:42</AppText></Pressable> : null}<View style={styles.date}><CalendarDays color={colors.mutedForeground} size={14} /><AppText variant="micro">{item.date}</AppText><Pressable onPress={onPress} style={styles.readButton}><AppText color={colors.primary} variant="button">{article || item.badge.includes('技巧') || item.badge.includes('专项') || item.badge.includes('规划') ? '阅读全文' : '查看详情'}</AppText><ArrowRight color={colors.primary} size={15} /></Pressable></View></View></Card>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, intro: { gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[4] }, list: { gap: spacing[3], paddingBottom: spacing[6] },
  feed: { overflow: 'hidden', padding: 0 }, image: { height: 160, width: '100%' }, feedCopy: { gap: spacing[2], padding: spacing[4] }, date: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, readButton: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[1], justifyContent: 'flex-end' }, detail: { gap: spacing[3], paddingBottom: spacing[4] }, filters: { flexDirection: 'row', gap: spacing[2], paddingBottom: spacing[4] }, filter: { borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, paddingHorizontal: spacing[4], paddingVertical: spacing[2] }, filterActive: { backgroundColor: colors.primary, borderColor: colors.primary }, audioDemo: { alignItems: 'center', backgroundColor: colors.secondary, borderRadius: radii.xl, flexDirection: 'row', gap: spacing[2], padding: spacing[2] }, audioButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 30, justifyContent: 'center', width: 30 }, audioTrack: { backgroundColor: colors.border, borderRadius: radii.full, flex: 1, height: 4, overflow: 'hidden' }, audioFill: { backgroundColor: colors.primary, height: '100%' }, audioTime: { width: 36 },
});
