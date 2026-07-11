import { BookOpenText, Captions, CaptionsOff, Headphones, Languages, ListMusic, MessageSquareQuote, SkipBack, SkipForward } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Button, Card, Screen, Tag } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { StudyAudioPlayer } from '@/features/question-bank/components/StudyAudioPlayer';
import { getEmbeddedQuestionBanks } from '@/features/question-bank/data/repository';
import { resolveQuestionBankAsset } from '@/features/question-bank/platform/resource-service';

type BankId = 'listening' | 'sentences900' | 'storytelling';
const banks = getEmbeddedQuestionBanks().filter((bank): bank is (typeof bank & { id: BankId }) => ['listening', 'sentences900', 'storytelling'].includes(bank.id));
const icons = { listening: Headphones, sentences900: MessageSquareQuote, storytelling: BookOpenText };

export function RadioPlayerScreen() {
  const [bankId, setBankId] = useState<BankId>('listening');
  const [index, setIndex] = useState(0);
  const [subtitle, setSubtitle] = useState<'off' | 'en' | 'bi'>('bi');
  const bank = banks.find((item) => item.id === bankId) ?? banks[0];
  const tracks = useMemo(() => bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards)).filter((card) => card.audio).slice(0, 50), [bank]);
  const track = tracks[index] ?? tracks[0];
  const SubtitleIcon = subtitle === 'off' ? CaptionsOff : subtitle === 'en' ? Captions : Languages;
  return (
    <Screen scroll contentStyle={styles.screen}>
      <TopBar title="随身听" />
      <View style={styles.header}><AppText color={colors.primary} variant="micro">ICAO RADIO</AppText><AppText variant="pageTitle">{bank.title}随身听</AppText><AppText>从规范题库音频生成播放列表，不建立第二套资源来源。</AppText></View>
      <View style={styles.bankTabs}>{banks.map((item) => { const Icon = icons[item.id]; return <Pressable key={item.id} onPress={() => { setBankId(item.id); setIndex(0); }} style={[styles.bankTab, item.id === bank.id ? styles.activeTab : null]}><Icon color={item.id === bank.id ? colors.primary : colors.mutedForeground} size={17} /><AppText color={item.id === bank.id ? colors.primary : colors.mutedForeground} variant="caption">{item.title}</AppText></Pressable>; })}</View>
      <Card elevated style={styles.player}><View style={styles.art}><ListMusic color={colors.primary} size={38} /></View><Tag>{index + 1} / {tracks.length}</Tag><AppText style={styles.center} variant="sectionTitle">{track.taskTitle}</AppText><StudyAudioPlayer label={track.taskTitle} uri={resolveQuestionBankAsset(track.audio)} /><View style={styles.controls}><Button disabled={index === 0} onPress={() => setIndex(Math.max(0, index - 1))} size="icon" variant="outline"><SkipBack size={18} /></Button><Button onPress={() => setSubtitle(subtitle === 'off' ? 'en' : subtitle === 'en' ? 'bi' : 'off')} variant="secondary"><SubtitleIcon size={17} /> {subtitle === 'off' ? '无字幕' : subtitle === 'en' ? '仅原文' : '中英文'}</Button><Button disabled={index === tracks.length - 1} onPress={() => setIndex(Math.min(tracks.length - 1, index + 1))} size="icon" variant="outline"><SkipForward size={18} /></Button></View>{subtitle !== 'off' ? <View style={styles.subtitle}><AppText>{track.audioText}</AppText>{subtitle === 'bi' && track.audioTextZh ? <AppText color={colors.mutedForeground}>{track.audioTextZh}</AppText> : null}</View> : null}</Card>
      <View style={styles.list}><AppText variant="sectionTitle">播放列表</AppText>{tracks.slice(0, 12).map((item, itemIndex) => <Pressable key={item.id} onPress={() => setIndex(itemIndex)}><Card style={[styles.track, itemIndex === index ? styles.trackActive : null]}><AppText style={styles.number} variant="micro">{String(itemIndex + 1).padStart(2, '0')}</AppText><AppText numberOfLines={1} style={styles.copy} variant="button">{item.taskTitle}</AppText>{itemIndex === index ? <Tag>播放中</Tag> : null}</Card></Pressable>)}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, header: { gap: spacing[2], paddingHorizontal: spacing[5], paddingVertical: spacing[4] }, bankTabs: { flexDirection: 'row', gap: spacing[2], paddingBottom: spacing[3], paddingHorizontal: spacing[5] }, bankTab: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flex: 1, gap: spacing[1], padding: spacing[2] }, activeTab: { backgroundColor: colors.primary06, borderColor: colors.primary },
  player: { alignItems: 'center', gap: spacing[3] }, art: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 94, justifyContent: 'center', width: 94 }, center: { textAlign: 'center' }, controls: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, subtitle: { alignSelf: 'stretch', backgroundColor: colors.secondary, borderRadius: radii.xl, gap: spacing[2], padding: spacing[4] }, list: { gap: spacing[2], paddingBottom: spacing[6], paddingTop: spacing[5] }, track: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, trackActive: { borderColor: colors.primary, backgroundColor: colors.primary06 }, number: { color: colors.mutedForeground, width: 28 }, copy: { flex: 1 },
});
