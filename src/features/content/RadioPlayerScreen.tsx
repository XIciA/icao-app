import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AlertCircle, Captions, ChevronDown, Headphones, ListMusic, Pause, Play, RotateCcw, SkipBack, SkipForward, TextSelect } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';
import { getEmbeddedQuestionBanks } from '@/features/question-bank/data/repository';
import { useQuestionBankAsset } from '@/features/question-bank/hooks/useQuestionBankAsset';
import { useAudioLoadTimeout } from '@/features/question-bank/hooks/useAudioLoadTimeout';

type BankId = 'listening' | 'sentences900' | 'storytelling';
const banks = getEmbeddedQuestionBanks().filter((bank): bank is (typeof bank & { id: BankId }) => ['listening', 'sentences900', 'storytelling'].includes(bank.id));
const speedOptions = [1, 1.25, 1.5, 0.75];

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function RadioPlayerScreen() {
  const [bankId, setBankId] = useState<BankId>('listening');
  const [bankPicker, setBankPicker] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [subtitle, setSubtitle] = useState<'off' | 'bi'>('bi');
  const [speedIndex, setSpeedIndex] = useState(0);
  const bank = banks.find((item) => item.id === bankId) ?? banks[0];
  const tracks = useMemo(() => bank.categories.flatMap((category) => category.topics.flatMap((topic) => topic.cards)).filter((card) => card.audio).slice(0, 50), [bank]);
  const track = tracks[index] ?? tracks[0];
  const audioAsset = useQuestionBankAsset(track?.audio);
  const { uri } = audioAsset;
  const player = useAudioPlayer(null, { updateInterval: 250, preferredForwardBufferDuration: 10 });
  const status = useAudioPlayerStatus(player);
  const loadTimeout = useAudioLoadTimeout({
    sourceKey: track?.id ?? 'radio-empty',
    uri,
    isLoaded: status.isLoaded,
    hasError: status.playbackState === 'error',
  });

  useEffect(() => { void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }); }, []);
  useEffect(() => { player.pause(); if (uri) player.replace(uri); }, [player, uri]);
  useEffect(() => { player.setPlaybackRate(speedOptions[speedIndex]); }, [player, speedIndex]);
  useEffect(() => { if (loadTimeout.timedOut) player.pause(); }, [loadTimeout.timedOut, player]);

  const chooseBank = (id: BankId) => { setBankId(id); setIndex(0); setBankPicker(false); };
  const chooseTrack = (next: number) => { setIndex(next); setListOpen(false); };
  const toggle = () => {
    if (!uri) return;
    if (status.playing) player.pause();
    else { if (status.duration && status.currentTime >= status.duration) void player.seekTo(0); player.play(); }
  };
  const retryAudio = () => {
    if (!uri) return;
    loadTimeout.retry();
    audioAsset.retry();
    player.replace(uri);
    player.setPlaybackRate(speedOptions[speedIndex]);
  };
  const audioFailed = loadTimeout.timedOut || status.playbackState === 'error';
  const progress = status.duration ? Math.min(1, status.currentTime / status.duration) : 0;

  return <View style={styles.screen}>
    <TopBar title="" right={<Pressable accessibilityLabel="打开播放列表" onPress={() => setListOpen(true)} style={styles.topButton}><ListMusic color={colors.foreground} size={21} /></Pressable>} />
    <Pressable accessibilityLabel="切换随身听题库" onPress={() => setBankPicker((current) => !current)} style={styles.titlePicker}><AppText variant="micro">随身听</AppText><AppText variant="sectionTitle">{bank.title}</AppText><ChevronDown color={colors.mutedForeground} size={15} /></Pressable>
    {bankPicker ? <View style={styles.bankMenu}>{banks.map((item) => <Pressable key={item.id} onPress={() => chooseBank(item.id)} style={[styles.bankOption, item.id === bank.id && styles.bankOptionActive]}><AppText color={item.id === bank.id ? colors.primary : colors.foreground} variant="button">{item.title}</AppText>{item.id === bank.id ? <AppText color={colors.primary}>✓</AppText> : null}</Pressable>)}</View> : null}

    <View style={styles.body}>
      <View style={styles.art}><View style={styles.artInner}><Headphones color={colors.primaryForeground} size={60} strokeWidth={1.8} /></View></View>
      <View style={styles.trackHeading}><AppText numberOfLines={1} style={styles.trackTitle} variant="pageTitle">{track?.taskTitle}</AppText><AppText variant="caption">第 {index + 1} 题 · {bank.title} · 全部题目</AppText></View>
      <View style={styles.lyrics}>
        <AppText color={colors.primary} style={styles.lyricEn} variant="button">{track?.audioText || '当前音频暂无英文字幕'}</AppText>
        {subtitle === 'bi' ? <AppText style={styles.lyricZh}>{track?.audioTextZh || '当前音频暂无中文译文。'}</AppText> : <AppText variant="caption">字幕已关闭</AppText>}
      </View>
      <View style={styles.timeline}><View style={styles.timelineTrack}><View style={[styles.timelineFill, { width: `${progress * 100}%` }]} /></View><View style={styles.timeRow}><AppText style={styles.mono} variant="micro">{formatTime(status.currentTime)}</AppText><AppText style={styles.mono} variant="micro">{formatTime(status.duration)}</AppText></View>{audioFailed ? <View style={styles.audioError}><AlertCircle color={colors.destructive} size={14} /><AppText color={colors.destructive} variant="micro">音频加载超时或失败，点击中央按钮重试</AppText></View> : null}</View>
      <View style={styles.transport}>
        <Pressable accessibilityLabel="上一首" disabled={index === 0} onPress={() => setIndex(Math.max(0, index - 1))} style={styles.skip}><SkipBack color={index === 0 ? colors.border : colors.foreground} fill={index === 0 ? colors.border : colors.foreground} size={25} /></Pressable>
        <Pressable accessibilityLabel={audioFailed ? '重试音频' : status.playing ? '暂停' : '播放'} disabled={!uri} onPress={audioFailed ? retryAudio : toggle} style={styles.play}>{audioFailed ? <RotateCcw color={colors.primaryForeground} size={25} /> : !status.isLoaded ? <ActivityIndicator color={colors.primaryForeground} /> : status.playing ? <Pause color={colors.primaryForeground} fill={colors.primaryForeground} size={28} /> : <Play color={colors.primaryForeground} fill={colors.primaryForeground} size={28} style={{ marginLeft: 3 }} />}</Pressable>
        <Pressable accessibilityLabel="下一首" disabled={index >= tracks.length - 1} onPress={() => setIndex(Math.min(tracks.length - 1, index + 1))} style={styles.skip}><SkipForward color={index >= tracks.length - 1 ? colors.border : colors.foreground} fill={index >= tracks.length - 1 ? colors.border : colors.foreground} size={25} /></Pressable>
      </View>
      <View style={styles.secondaryControls}>
        <Pressable accessibilityLabel="播放顺序" onPress={() => setListOpen(true)} style={styles.secondaryAction}><ListMusic color={colors.primary} size={20} /><AppText color={colors.primary} variant="micro">顺序播放</AppText></Pressable>
        <Pressable accessibilityLabel="切换倍速" onPress={() => setSpeedIndex((current) => (current + 1) % speedOptions.length)} style={styles.secondaryAction}><AppText style={styles.speed} variant="button">{speedOptions[speedIndex]}×</AppText><AppText variant="micro">倍速</AppText></Pressable>
        <Pressable accessibilityLabel="切换字幕" onPress={() => setSubtitle((current) => current === 'bi' ? 'off' : 'bi')} style={styles.secondaryAction}>{subtitle === 'bi' ? <TextSelect color={colors.primary} size={20} /> : <Captions color={colors.mutedForeground} size={20} />}<AppText color={subtitle === 'bi' ? colors.primary : colors.mutedForeground} variant="micro">{subtitle === 'bi' ? '中英' : '无字幕'}</AppText></Pressable>
      </View>
    </View>

    <BottomSheet accessibilityLabel="播放列表" onClose={() => setListOpen(false)} visible={listOpen}><View style={styles.sheetHeader}><View><AppText variant="pageTitle">播放列表</AppText><AppText variant="caption">{bank.title} · 共 {tracks.length} 题 · 顺序播放</AppText></View><Pressable accessibilityLabel="关闭播放列表" onPress={() => setListOpen(false)}><AppText variant="pageTitle">×</AppText></Pressable></View><ScrollView style={styles.trackList}>{tracks.map((item, itemIndex) => <Pressable key={item.id} onPress={() => chooseTrack(itemIndex)} style={[styles.trackRow, itemIndex === index && styles.trackRowActive]}><AppText color={itemIndex === index ? colors.primary : colors.mutedForeground} style={styles.trackNumber} variant="micro">{itemIndex + 1}</AppText><View style={styles.grow}><AppText color={itemIndex === index ? colors.primary : colors.foreground} numberOfLines={1} variant="button">{item.taskTitle}</AppText><AppText numberOfLines={1} variant="micro">第 {itemIndex + 1} 题 · {bank.title} · 全部题目</AppText></View><AppText variant="micro">{itemIndex === index && status.duration ? formatTime(status.duration) : '--:--'}</AppText></Pressable>)}</ScrollView></BottomSheet>
  </View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 }, topButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 }, titlePicker: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: spacing[1], marginTop: -46, minHeight: 40, zIndex: 2 }, bankMenu: { alignSelf: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, padding: spacing[1], position: 'absolute', top: 54, width: 190, zIndex: 4 }, bankOption: { alignItems: 'center', borderRadius: radii.lg, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing[3], paddingVertical: spacing[2] }, bankOptionActive: { backgroundColor: colors.primary06 }, body: { alignItems: 'center', flex: 1, paddingHorizontal: spacing[5], paddingTop: spacing[5] }, art: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 32, height: 176, justifyContent: 'center', shadowColor: colors.primary, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.24, shadowRadius: 18, width: 176 }, artInner: { alignItems: 'center', borderColor: colors.primaryForeground, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, height: 132, justifyContent: 'center', opacity: 0.9, width: 132 }, trackHeading: { alignItems: 'center', gap: spacing[1], marginTop: spacing[5], width: '100%' }, trackTitle: { fontSize: 21, textAlign: 'center' }, lyrics: { alignItems: 'center', flex: 1, gap: spacing[3], justifyContent: 'center', maxHeight: 250, minHeight: 150 }, lyricEn: { fontSize: 16, lineHeight: 24, textAlign: 'center' }, lyricZh: { lineHeight: 23, textAlign: 'center' }, timeline: { width: '100%' }, timelineTrack: { backgroundColor: colors.border, borderRadius: radii.full, height: 4, overflow: 'hidden' }, timelineFill: { backgroundColor: colors.primary, height: '100%' }, timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[2] }, mono: { fontFamily: fonts.monoRegular }, transport: { alignItems: 'center', flexDirection: 'row', gap: spacing[6], marginTop: spacing[3] }, skip: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 }, play: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 64, justifyContent: 'center', width: 64 }, secondaryControls: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing[2], paddingTop: spacing[3], width: '100%' }, secondaryAction: { alignItems: 'center', gap: spacing[1], minWidth: 72 }, speed: { fontFamily: fonts.monoRegular, fontSize: 16 }, sheetHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing[3] }, trackList: { maxHeight: 520, marginHorizontal: -spacing[5] }, trackRow: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing[3], minHeight: 62, paddingHorizontal: spacing[5], paddingVertical: spacing[2] }, trackRowActive: { backgroundColor: colors.primary06 }, trackNumber: { textAlign: 'center', width: 28 }, grow: { flex: 1, gap: spacing[1] },
  audioError: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5], justifyContent: 'center', marginTop: spacing[1] },
});
