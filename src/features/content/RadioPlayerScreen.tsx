import {
  AlertCircle,
  BookOpen,
  Captions,
  CaptionsOff,
  Check,
  Headphones,
  Languages,
  ListMusic,
  Pause,
  Play,
  Repeat1,
  Repeat2,
  RotateCcw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, TextField } from '@/components/ui';
import { AudioTimeline, formatAudioTime } from '@/features/question-bank/components/AudioTimeline';
import { useRadioPlayer } from '@/features/radio-player/RadioPlayerProvider';
import type { RadioPlaybackMode, RadioSubtitleMode, RadioTrack } from '@/features/radio-player/types';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

const modeCopy: Record<RadioPlaybackMode, string> = { order: '顺序播放', repeatOne: '单曲循环', shuffle: '随机播放' };
const subtitleCopy: Record<RadioSubtitleMode, string> = { english: '仅英文', bilingual: '中英字幕', off: '无字幕' };
const modes: RadioPlaybackMode[] = ['order', 'repeatOne', 'shuffle'];
const subtitleModes: RadioSubtitleMode[] = ['english', 'bilingual', 'off'];
const ROW_HEIGHT = 70;

function ModeIcon({ mode, color = colors.primary, size = 20 }: { mode: RadioPlaybackMode; color?: string; size?: number }) {
  if (mode === 'repeatOne') return <Repeat1 color={color} size={size} />;
  if (mode === 'shuffle') return <Shuffle color={color} size={size} />;
  return <Repeat2 color={color} size={size} />;
}

function SubtitleIcon({ mode, color = colors.primary }: { mode: RadioSubtitleMode; color?: string }) {
  if (mode === 'bilingual') return <Languages color={color} size={20} />;
  if (mode === 'off') return <CaptionsOff color={color} size={20} />;
  return <Captions color={color} size={20} />;
}

export function RadioPlayerScreen() {
  const radio = useRadioPlayer();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const [queueOpen, setQueueOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const queueRef = useRef<FlatList<RadioTrack>>(null);
  const compact = height < 950;
  const activateSession = radio.activateSession;

  useEffect(() => activateSession(), [activateSession]);
  useEffect(() => { setGroup('全部'); setQuery(''); }, [radio.currentCatalog?.bankId]);

  const groups = useMemo(() => ['全部', ...new Set((radio.currentCatalog?.tracks ?? []).map((track) => track.topicTitle))], [radio.currentCatalog]);
  const filteredTracks = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return (radio.currentCatalog?.tracks ?? []).filter((track) => {
      if (group !== '全部' && track.topicTitle !== group) return false;
      if (!keyword) return true;
      return `${track.title}\n${track.audioText}\n${track.audioTextZh ?? ''}`.toLocaleLowerCase().includes(keyword);
    });
  }, [group, query, radio.currentCatalog]);
  useEffect(() => {
    if (!queueOpen || !radio.currentTrack) return;
    const index = filteredTracks.findIndex((track) => track.id === radio.currentTrack?.id);
    if (index < 0) return;
    const frame = requestAnimationFrame(() => queueRef.current?.scrollToIndex({ animated: false, index, viewPosition: 0.45 }));
    return () => cancelAnimationFrame(frame);
  }, [filteredTracks, queueOpen, radio.currentTrack]);

  const cycleMode = () => radio.setMode(modes[(modes.indexOf(radio.mode) + 1) % modes.length]);
  const cycleSubtitle = () => radio.setSubtitleMode(subtitleModes[(subtitleModes.indexOf(radio.subtitleMode) + 1) % subtitleModes.length]);
  const cycleRate = () => {
    const index = radio.speedOptions.indexOf(radio.rate);
    radio.setRate(radio.speedOptions[(index + 1) % radio.speedOptions.length]);
  };
  const enterStudy = () => {
    const track = radio.currentTrack;
    if (!track) return;
    radio.pause();
    router.push({
      pathname: '/question-bank/[bankId]/study/[categoryId]/[topicId]',
      params: {
        bankId: track.bankId,
        categoryId: track.categoryId,
        topicId: track.topicId,
        cardId: track.id,
        returnTo: 'radio',
      },
    });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <TopBar title="随身听" right={<Pressable accessibilityLabel="打开播放队列" onPress={() => setQueueOpen(true)} style={styles.topButton}><ListMusic color={colors.foreground} size={21} /></Pressable>} />

      <View style={styles.bankTabs}>
        {radio.catalogs.map((catalog) => {
          const active = catalog.bankId === radio.currentCatalog?.bankId;
          return <Pressable accessibilityLabel={`切换到${catalog.title}`} key={catalog.bankId} onPress={() => radio.selectBank(catalog.bankId)} style={[styles.bankTab, active ? styles.bankTabActive : null]}><AppText color={active ? colors.primary : colors.mutedForeground} variant="button">{catalog.title}</AppText><AppText color={active ? colors.primary : colors.mutedForeground} variant="micro">{catalog.tracks.length}</AppText></Pressable>;
        })}
      </View>

      <View style={styles.playerBody}>
        <View style={[styles.art, compact ? styles.artCompact : null]}>
          <View style={styles.artHalo} />
          <Headphones color={colors.primaryForeground} size={compact ? 38 : 48} strokeWidth={1.8} />
          <AppText color={colors.primaryForeground} style={styles.artLabel} variant="micro">ICAO AUDIO</AppText>
        </View>

        <View style={styles.trackHeading}>
          <AppText color={colors.primary} variant="micro">{radio.currentTrack?.bankTitle} · {radio.currentIndex + 1} / {radio.currentCatalog?.tracks.length ?? 0}</AppText>
          <AppText numberOfLines={2} style={styles.trackTitle} variant="pageTitle">{radio.currentTrack?.title ?? '正在准备曲目'}</AppText>
          <AppText numberOfLines={1} variant="caption">{radio.currentTrack?.categoryTitle} · {radio.currentTrack?.topicTitle}</AppText>
          <Button disabled={!radio.currentTrack} leading={<BookOpen color={colors.primary} size={16} />} onPress={enterStudy} size="sm" variant="outline">学习本题</Button>
        </View>

        <View style={styles.subtitleCard}>
          {radio.subtitleMode === 'off' ? (
            <View style={styles.subtitleOff}><CaptionsOff color={colors.mutedForeground} size={22} /><AppText variant="caption">字幕已隐藏，播放控制保持可用</AppText></View>
          ) : (
            <ScrollView contentContainerStyle={styles.subtitleContent} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <AppText style={styles.englishText}>{radio.currentTrack?.audioText || '当前曲目暂无英文原文。'}</AppText>
              {radio.subtitleMode === 'bilingual' ? <><View style={styles.subtitleDivider} /><AppText style={styles.chineseText}>{radio.currentTrack?.audioTextZh || '当前曲目暂无中文译文。'}</AppText></> : null}
            </ScrollView>
          )}
        </View>

        <View style={styles.controlDock}>
          {radio.error ? <View style={styles.errorRow}><AlertCircle color={colors.destructive} size={15} /><AppText color={colors.destructive} style={styles.errorCopy} variant="caption">{radio.error}</AppText><Pressable accessibilityLabel="重试音频" onPress={radio.retry} style={styles.retry}><RotateCcw color={colors.destructive} size={15} /><AppText color={colors.destructive} variant="caption">重试</AppText></Pressable></View> : null}
          <View style={styles.timelineWrap}><AudioTimeline disabled={radio.loading || Boolean(radio.error)} duration={radio.duration} onScrubEnd={radio.seek} position={radio.position} testID="radio-timeline" /></View>
          <View style={styles.transport}>
            <Pressable accessibilityLabel="上一首" onPress={() => void radio.previous()} style={styles.transportButton}><SkipBack color={colors.foreground} fill={colors.foreground} size={25} /></Pressable>
            <Pressable accessibilityLabel={radio.error ? '重试音频' : radio.playing ? '暂停' : '播放'} disabled={radio.loading && !radio.error} onPress={() => radio.error ? radio.retry() : void radio.toggle()} style={({ pressed }) => [styles.playButton, pressed ? styles.playPressed : null]}>
              {radio.loading || radio.buffering ? <ActivityIndicator color={colors.primaryForeground} /> : radio.error ? <RotateCcw color={colors.primaryForeground} size={25} /> : radio.playing ? <Pause color={colors.primaryForeground} fill={colors.primaryForeground} size={27} /> : <Play color={colors.primaryForeground} fill={colors.primaryForeground} size={27} style={styles.playIcon} />}
            </Pressable>
            <Pressable accessibilityLabel="下一首" onPress={() => void radio.next(true)} style={styles.transportButton}><SkipForward color={colors.foreground} fill={colors.foreground} size={25} /></Pressable>
          </View>
          <View style={styles.secondaryControls}>
            <Pressable accessibilityLabel={`播放模式：${modeCopy[radio.mode]}`} onPress={cycleMode} style={styles.secondaryAction}><ModeIcon mode={radio.mode} /><AppText color={colors.primary} variant="micro">{modeCopy[radio.mode]}</AppText></Pressable>
            <Pressable accessibilityLabel={`播放倍速：${radio.rate}倍`} onPress={cycleRate} style={styles.secondaryAction}><AppText color={colors.primary} style={styles.speed} variant="button">{radio.rate}×</AppText><AppText color={colors.primary} variant="micro">播放倍速</AppText></Pressable>
            <Pressable accessibilityLabel={`字幕模式：${subtitleCopy[radio.subtitleMode]}`} onPress={cycleSubtitle} style={styles.secondaryAction}><SubtitleIcon mode={radio.subtitleMode} /><AppText color={colors.primary} variant="micro">{subtitleCopy[radio.subtitleMode]}</AppText></Pressable>
          </View>
        </View>
      </View>

      <BottomSheet accessibilityLabel="播放队列" onClose={() => setQueueOpen(false)} scrollable={false} visible={queueOpen}>
        <View style={{ height: Math.min(height * 0.78, 650) }}>
          <View style={styles.sheetHeader}><View style={styles.grow}><AppText variant="sectionTitle">播放队列</AppText><AppText variant="caption">{radio.currentCatalog?.title} · {radio.currentCatalog?.tracks.length ?? 0} 首 · {modeCopy[radio.mode]}</AppText></View><ModeIcon color={colors.mutedForeground} mode={radio.mode} size={18} /></View>
          <TextField accessibilityLabel="搜索播放队列" onChangeText={setQuery} placeholder="搜索标题、英文或中文" trailing={<Search color={colors.mutedForeground} size={17} />} value={query} />
          <ScrollView contentContainerStyle={styles.groupFilters} horizontal showsHorizontalScrollIndicator={false} style={styles.groupScroll}>
            {groups.map((item) => <Pressable key={item} onPress={() => setGroup(item)} style={[styles.groupFilter, group === item ? styles.groupFilterActive : null]}><AppText color={group === item ? colors.primary : colors.mutedForeground} numberOfLines={1} variant="caption">{item}</AppText></Pressable>)}
          </ScrollView>
          <FlatList
            contentContainerStyle={filteredTracks.length ? styles.queueContent : styles.queueEmptyContent}
            data={filteredTracks}
            getItemLayout={(_data, index) => ({ index, length: ROW_HEIGHT, offset: ROW_HEIGHT * index })}
            initialNumToRender={12}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<View style={styles.empty}><Search color={colors.mutedForeground} size={24} /><AppText variant="button">没有匹配曲目</AppText><AppText variant="caption">请调整关键词或题组筛选。</AppText></View>}
            maxToRenderPerBatch={16}
            onScrollToIndexFailed={({ index }) => queueRef.current?.scrollToOffset({ animated: false, offset: ROW_HEIGHT * index })}
            ref={queueRef}
            removeClippedSubviews
            renderItem={({ item }) => <QueueRow current={item.id === radio.currentTrack?.id} item={item} onPress={() => { radio.selectTrack(item.id, true); setQueueOpen(false); }} playing={radio.playing} />}
            style={styles.queueList}
            windowSize={9}
          />
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function QueueRow({ item, current, playing, onPress }: { item: RadioTrack; current: boolean; playing: boolean; onPress: () => void }) {
  return <Pressable accessibilityLabel={`播放 ${item.title}`} onPress={onPress} style={[styles.queueRow, current ? styles.queueRowCurrent : null]}><View style={[styles.queueNumber, current ? styles.queueNumberCurrent : null]}>{current && playing ? <Headphones color={colors.primary} size={15} /> : <AppText color={current ? colors.primary : colors.mutedForeground} style={styles.numberText} variant="micro">{item.stableIndex + 1}</AppText>}</View><View style={styles.grow}><AppText color={current ? colors.primary : colors.foreground} numberOfLines={1} variant="button">{item.title}</AppText><AppText numberOfLines={1} variant="micro">{item.topicTitle} · {item.categoryTitle}</AppText></View><AppText style={styles.duration} variant="micro">{formatAudioTime(item.durationSeconds)}</AppText>{current ? <Check color={colors.primary} size={16} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  topButton: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  bankTabs: { alignSelf: 'center', backgroundColor: colors.secondary, borderRadius: radii.full, flexDirection: 'row', gap: spacing[1], marginHorizontal: spacing[5], marginTop: spacing[3], padding: spacing[1] },
  bankTab: { alignItems: 'center', borderRadius: radii.full, flexDirection: 'row', gap: spacing[1.5], minHeight: 36, paddingHorizontal: spacing[3] },
  bankTabActive: { backgroundColor: colors.card, ...shadows.card },
  playerBody: { alignItems: 'center', flex: 1, minHeight: 0, paddingHorizontal: spacing[5], paddingTop: spacing[4] },
  art: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.xxl, height: 132, justifyContent: 'center', overflow: 'hidden', width: 132, ...shadows.floating },
  artCompact: { borderRadius: radii.xl, height: 96, width: 96 },
  artHalo: { borderColor: 'rgba(255,255,255,0.22)', borderRadius: radii.full, borderWidth: 1, height: 102, position: 'absolute', width: 102 },
  artLabel: { bottom: spacing[2], letterSpacing: 1.2, position: 'absolute' },
  trackHeading: { alignItems: 'center', gap: spacing[1.5], marginTop: spacing[3], width: '100%' },
  trackTitle: { fontSize: 21, lineHeight: 27, textAlign: 'center' },
  subtitleCard: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, flex: 1, marginTop: spacing[3], minHeight: 82, overflow: 'hidden', width: '100%' },
  subtitleContent: { gap: spacing[3], padding: spacing[4] },
  subtitleOff: { alignItems: 'center', flex: 1, gap: spacing[2], justifyContent: 'center', minHeight: 82, padding: spacing[4] },
  subtitleDivider: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  englishText: { color: colors.foreground, fontSize: 15, lineHeight: 23 },
  chineseText: { color: colors.mutedForeground, lineHeight: 22 },
  controlDock: { paddingBottom: spacing[1], paddingTop: spacing[2], width: '100%' },
  timelineWrap: { height: 54 },
  errorRow: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.06)', borderRadius: radii.md, flexDirection: 'row', gap: spacing[2], marginBottom: spacing[1], paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  errorCopy: { flex: 1 }, retry: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] },
  transport: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing[1] },
  transportButton: { alignItems: 'center', borderRadius: radii.full, height: 52, justifyContent: 'center', width: 76 },
  playButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 62, justifyContent: 'center', marginHorizontal: spacing[3], width: 62, ...shadows.floating },
  playPressed: { transform: [{ scale: 0.96 }] }, playIcon: { marginLeft: 3 },
  secondaryControls: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing[1], width: '100%' },
  secondaryAction: { alignItems: 'center', gap: 2, minHeight: 42, minWidth: 88 },
  speed: { fontFamily: fonts.monoRegular, fontSize: 16, lineHeight: 20 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], marginBottom: spacing[3] }, grow: { flex: 1, minWidth: 0 },
  groupScroll: { flexGrow: 0, height: 52 },
  groupFilters: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] },
  groupFilter: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, maxWidth: 150, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  groupFilterActive: { backgroundColor: colors.primary06, borderColor: colors.primary20 },
  queueList: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flex: 1, marginHorizontal: -spacing[5] },
  queueContent: { paddingBottom: spacing[4] }, queueEmptyContent: { flexGrow: 1 },
  queueRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing[3], height: ROW_HEIGHT, paddingHorizontal: spacing[5] },
  queueRowCurrent: { backgroundColor: colors.primary06 },
  queueNumber: { alignItems: 'center', borderRadius: radii.full, height: 30, justifyContent: 'center', width: 30 },
  queueNumberCurrent: { backgroundColor: colors.primary10 }, numberText: { fontFamily: fonts.monoRegular }, duration: { fontFamily: fonts.monoRegular },
  empty: { alignItems: 'center', flex: 1, gap: spacing[2], justifyContent: 'center', padding: spacing[8] },
});
