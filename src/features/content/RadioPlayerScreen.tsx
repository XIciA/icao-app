import { GuideAnchor, useGuide } from '@/features/usage-guide/GuideBindings';
import {
  AlertCircle,
  BookOpenText,
  Captions,
  CaptionsOff,
  Check,
  ChevronRight,
  Clock3,
  Headphones,
  Languages,
  ListMusic,
  MessageSquareQuote,
  Pause,
  Play,
  Repeat1,
  Repeat2,
  RotateCcw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
} from '@/components/ui/icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, BottomSheet, Button, TextField } from '@/components/ui';
import { TopBar } from '@/components/navigation/TopBar';
import { CenteredState } from '@/components/states/CenteredState';
import { isVercelLegacyWeb } from '@/config/web-runtime';
import { AppContentFrame } from '@/components/platform/AppContentFrame';
import { useAppViewportDimensions } from '@/components/platform/useAppViewportDimensions';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { AudioTimeline, formatAudioTime } from '@/features/question-bank/components/AudioTimeline';
import { QuestionBankSwitcherHeader, type QuestionBankSwitcherItem } from '@/features/question-bank/components/QuestionBankSwitcherHeader';
import { RADIO_INTERVAL_MAX_SECONDS, RADIO_INTERVAL_PRESETS } from '@/features/radio-player/radio-interval';
import { useRadioPlayer } from '@/features/radio-player/RadioPlayerProvider';
import type { RadioBankId, RadioPlaybackMode, RadioSubtitleMode, RadioTrack } from '@/features/radio-player/types';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

const modeCopy: Record<RadioPlaybackMode, string> = { order: '顺序播放', repeatOne: '单曲循环', shuffle: '随机播放' };
const modeShortCopy: Record<RadioPlaybackMode, string> = { order: '顺序', repeatOne: '单曲', shuffle: '随机' };
const subtitleCopy: Record<RadioSubtitleMode, string> = { english: '仅英文', bilingual: '中英字幕', off: '字幕关闭' };
const subtitleShortCopy: Record<RadioSubtitleMode, string> = { english: '英文', bilingual: '中英', off: '字幕关' };
const modes: RadioPlaybackMode[] = ['order', 'repeatOne', 'shuffle'];
const subtitleModes: RadioSubtitleMode[] = ['english', 'bilingual', 'off'];
const ROW_HEIGHT = 70;

const radioBankIcons: Partial<Record<RadioBankId, typeof Headphones>> = {
  listening: Headphones,
  sentences900: MessageSquareQuote,
  storytelling: BookOpenText,
};

function ModeIcon({ mode, color = colors.primary, size = 18 }: { mode: RadioPlaybackMode; color?: string; size?: number }) {
  if (mode === 'repeatOne') return <Repeat1 color={color} size={size} />;
  if (mode === 'shuffle') return <Shuffle color={color} size={size} />;
  return <Repeat2 color={color} size={size} />;
}

function SubtitleIcon({ mode, color = colors.primary }: { mode: RadioSubtitleMode; color?: string }) {
  if (mode === 'bilingual') return <Languages color={color} size={18} />;
  if (mode === 'off') return <CaptionsOff color={color} size={18} />;
  return <Captions color={color} size={18} />;
}

function BreathingWaveform({ active, remaining }: { active: boolean; remaining?: number }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(pulse);
    if (active && !reduceMotion) {
      pulse.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1, false);
    } else {
      pulse.value = withTiming(0, { duration: 160 });
    }
    return () => cancelAnimation(pulse);
  }, [active, pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.74 + pulse.value * 0.2,
    transform: [{ scale: 1 + pulse.value * 0.035 }],
  }));
  const bars = [22, 38, 54, 72, 92, 72, 54, 38, 22];

  return (
    <View accessibilityLabel={remaining !== undefined ? `等待下一题，剩余${remaining}秒` : active ? '正在播放' : '已暂停'} style={styles.waveStage}>
      <SoftGlow intensity={active ? 0.5 : 0.3} size={210} style={styles.waveGlow} />
      <Animated.View style={[styles.waveform, animatedStyle]}>
        {bars.map((height, index) => <View key={`${height}-${index}`} style={[styles.waveBar, { height: Math.max(12, height * 0.62) }]} />)}
      </Animated.View>
      {remaining !== undefined ? <AppText color={colors.primary} style={styles.waitingCopy} variant="micro">下一题 · {remaining}s</AppText> : null}
    </View>
  );
}

export function RadioPlayerScreen() {
  const radio = useRadioPlayer();
  const guide = useGuide();
  const router = useRouter();
  const { height } = useAppViewportDimensions();
  const [queueOpen, setQueueOpen] = useState(false);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const queueRef = useRef<FlatList<RadioTrack>>(null);
  const compact = height < 760;
  const activateSession = radio.activateSession;
  const intervalSeconds = radio.intervalSeconds ?? 0;

  useEffect(() => activateSession(), [activateSession]);
  useEffect(() => { if (radio.playing) guide?.event('radio-play'); }, [radio.playing, guide]);
  useEffect(() => { setGroup('全部'); setQuery(''); }, [radio.currentCatalog?.bankId]);

  const switcherItems = useMemo<QuestionBankSwitcherItem<RadioBankId>[]>(() => radio.catalogs.map((catalog) => ({
    icon: radioBankIcons[catalog.bankId] ?? Headphones,
    label: catalog.title,
    summary: `${catalog.tracks.length} 题`,
    value: catalog.bankId,
  })), [radio.catalogs]);
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

  const cycleMode = () => { radio.setMode(modes[(modes.indexOf(radio.mode) + 1) % modes.length]); guide?.event('radio-order'); };
  const cycleSubtitle = () => { radio.setSubtitleMode(subtitleModes[(subtitleModes.indexOf(radio.subtitleMode) + 1) % subtitleModes.length]); guide?.event('radio-subtitle'); };
  const cycleRate = () => {
    const index = radio.speedOptions.indexOf(radio.rate);
    radio.setRate(radio.speedOptions[(index + 1) % radio.speedOptions.length]); guide?.event('radio-speed');
  };
  const enterStudy = () => {
    const track = radio.currentTrack;
    if (!track) return;
    radio.pause();
    guide?.event('radio-study');
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

  if (!isVercelLegacyWeb(Platform.OS) && radio.catalogs.length === 0 && !radio.loading) {
    return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <AppContentFrame style={styles.contentFrame}>
        <TopBar title="随身听" onBack={() => router.back()} />
        <CenteredState icon={Headphones} title={radio.error ? '曲目加载失败' : '当前范围暂无可播放内容'}
          description={radio.error ?? '随身听包含听力、语句复诵和故事复述。当前考试目标或题库范围内没有这些内容，可以返回题库继续练习。'}
          actionLabel={radio.error ? '重新加载' : '返回题库'} onAction={radio.error ? radio.retry : () => router.push('/(tabs)')} />
      </AppContentFrame>
    </SafeAreaView>;
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <AppContentFrame style={styles.contentFrame}>
      <QuestionBankSwitcherHeader
        guideId="radio-bank"
        items={switcherItems}
        onBack={() => router.back()}
        onSelect={radio.selectBank}
        right={
          <Pressable accessibilityLabel="打开播放队列" hitSlop={8} onPress={() => setQueueOpen(true)} style={({ pressed }) => [styles.headerAction, pressed ? styles.headerActionPressed : null]}>
            <ListMusic color={colors.foreground} size={20} />
          </Pressable>
        }
        showDivider={false}
        value={radio.currentCatalog?.bankId ?? switcherItems[0]?.value ?? 'listening'}
      />

      <View style={[styles.playerBody, compact ? styles.playerBodyCompact : null]}>
        <Pressable
          accessibilityLabel="进入当前题目学习"
          accessibilityRole="button"
          disabled={!radio.currentTrack}
          onPress={enterStudy}
          style={({ pressed }) => [styles.trackRow, pressed ? styles.trackRowPressed : null]}
        >
          <GuideAnchor id="radio-study" /><AppText numberOfLines={1} style={styles.trackTitle}>{radio.currentTrack?.title ?? '正在准备曲目'}</AppText>
          <View style={styles.trackCount}><AppText color={colors.primary} style={styles.trackCountText} variant="micro">{radio.currentIndex + 1}/{radio.currentCatalog?.tracks.length ?? 0}</AppText></View>
          <ChevronRight color={colors.mutedForeground} size={15} />
        </Pressable>

        <View style={styles.contentStage}>
          {radio.subtitleMode === 'off' ? (
            <BreathingWaveform active={radio.playing && !radio.waitingForNext} remaining={radio.waitingForNext ? radio.intervalRemaining : undefined} />
          ) : (
            <ScrollView contentContainerStyle={styles.subtitleContent} showsVerticalScrollIndicator={false} style={styles.subtitleScroll}>
              <AppText style={styles.englishText}>{radio.currentTrack?.audioText || '当前曲目暂无英文原文。'}</AppText>
              {radio.subtitleMode === 'bilingual' ? <AppText style={styles.chineseText}>{radio.currentTrack?.audioTextZh || '当前曲目暂无中文译文。'}</AppText> : null}
            </ScrollView>
          )}
        </View>

        <View style={styles.controlDock}>
          {radio.error ? <View style={styles.errorRow}><AlertCircle color={colors.destructive} size={15} /><AppText color={colors.destructive} style={styles.errorCopy} variant="caption">{radio.error}</AppText><Pressable accessibilityLabel="重试音频" onPress={radio.retry} style={styles.retry}><RotateCcw color={colors.destructive} size={15} /><AppText color={colors.destructive} variant="caption">重试</AppText></Pressable></View> : null}
          <View style={styles.timelineWrap}><AudioTimeline disabled={radio.loading || radio.waitingForNext || Boolean(radio.error)} duration={radio.duration} onScrubEnd={radio.seek} position={radio.position} testID="radio-timeline" /></View>
          <View style={styles.transport}>
            <Pressable accessibilityLabel="上一首" hitSlop={6} onPress={() => void radio.previous()} style={({ pressed }) => [styles.transportButton, pressed ? styles.controlPressed : null]}><SkipBack color={colors.foreground} fill={colors.foreground} size={22} /></Pressable>
            <Pressable accessibilityLabel={radio.error ? '重试音频' : radio.playing ? '暂停' : '播放'} disabled={radio.loading && !radio.error} onPress={() => { if (radio.error) radio.retry(); else void radio.toggle(); }} style={({ pressed }) => [styles.playButton, pressed ? styles.playPressed : null]}>
              <GuideAnchor id="radio-play" />{radio.loading || radio.buffering ? <ActivityIndicator color={colors.primaryForeground} /> : radio.error ? <RotateCcw color={colors.primaryForeground} size={24} /> : radio.playing ? <Pause color={colors.primaryForeground} fill={colors.primaryForeground} size={24} /> : <Play color={colors.primaryForeground} fill={colors.primaryForeground} size={24} style={styles.playIcon} />}
            </Pressable>
            <Pressable accessibilityLabel="下一首" hitSlop={6} onPress={() => void radio.next(true)} style={({ pressed }) => [styles.transportButton, pressed ? styles.controlPressed : null]}><SkipForward color={colors.foreground} fill={colors.foreground} size={22} /></Pressable>
          </View>
          <View style={styles.secondaryControls}>
            <Pressable accessibilityLabel={`播放模式：${modeCopy[radio.mode]}`} onPress={cycleMode} style={styles.secondaryAction}><GuideAnchor id="radio-order" /><ModeIcon mode={radio.mode} /><AppText color={colors.primary} variant="micro">{modeShortCopy[radio.mode]}</AppText></Pressable>
            <Pressable accessibilityLabel={`播放倍速：${radio.rate}倍`} onPress={cycleRate} style={styles.secondaryAction}><GuideAnchor id="radio-speed" /><AppText color={colors.primary} style={styles.speed}>{radio.rate}×</AppText><AppText color={colors.primary} variant="micro">倍速</AppText></Pressable>
            <Pressable accessibilityLabel={`播放间隔：${intervalSeconds}秒`} onPress={() => setIntervalOpen(true)} style={styles.secondaryAction}><GuideAnchor id="radio-interval" /><Clock3 color={colors.primary} size={18} /><AppText color={colors.primary} variant="micro">{radio.waitingForNext ? `${radio.intervalRemaining}s` : intervalSeconds ? `${intervalSeconds}s` : '间隔'}</AppText></Pressable>
            <Pressable accessibilityLabel={`字幕模式：${subtitleCopy[radio.subtitleMode]}`} onPress={cycleSubtitle} style={styles.secondaryAction}><GuideAnchor id="radio-subtitle" /><SubtitleIcon mode={radio.subtitleMode} /><AppText color={colors.primary} variant="micro">{subtitleShortCopy[radio.subtitleMode]}</AppText></Pressable>
          </View>
        </View>
      </View>
      </AppContentFrame>

      <BottomSheet accessibilityLabel="播放间隔" onClose={() => setIntervalOpen(false)} visible={intervalOpen}>
        <View style={styles.intervalSheet}>
          <AppText variant="sectionTitle">播放间隔</AppText>
          <View style={styles.intervalValueRow}><AppText color={colors.primary} style={styles.intervalValue}>{intervalSeconds}</AppText><AppText color={colors.mutedForeground} style={styles.intervalUnit}>秒</AppText></View>
          <View style={styles.intervalTimeline}><GuideAnchor id="radio-interval" />
            <AudioTimeline
              accessibilityLabel="播放间隔秒数"
              duration={RADIO_INTERVAL_MAX_SECONDS}
              formatValue={(value) => `${Math.round(value)}秒`}
              onScrubEnd={radio.setIntervalSeconds}
              position={intervalSeconds}
              showLabels={false}
              step={1}
              testID="radio-interval-timeline"
            />
          </View>
          <View style={styles.intervalRange}><AppText variant="micro">0s</AppText><AppText variant="micro">30s</AppText></View>
          <View style={styles.intervalPresets}>
            {RADIO_INTERVAL_PRESETS.map((preset) => <Pressable accessibilityLabel={`设置播放间隔${preset}秒`} accessibilityState={{ selected: preset === intervalSeconds }} key={preset} onPress={() => radio.setIntervalSeconds(preset)} style={[styles.intervalPreset, preset === intervalSeconds ? styles.intervalPresetActive : null]}><AppText color={preset === intervalSeconds ? colors.primary : colors.mutedForeground} variant="button">{preset}s</AppText></Pressable>)}
          </View>
          <Button onPress={() => { setIntervalOpen(false); guide?.event('radio-interval'); }}>完成</Button>
        </View>
      </BottomSheet>

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
            ListEmptyComponent={<View style={styles.empty}><Search color={colors.mutedForeground} size={24} /><AppText variant="button">没有匹配曲目</AppText></View>}
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
  contentFrame: { flex: 1 },
  headerAction: { alignItems: 'center', borderRadius: radii.full, height: 40, justifyContent: 'center', width: 40 },
  headerActionPressed: { backgroundColor: colors.secondary },
  playerBody: { alignItems: 'center', flex: 1, minHeight: 0, paddingBottom: spacing[2], paddingHorizontal: spacing[5] },
  playerBodyCompact: { paddingHorizontal: spacing[4] },
  trackRow: { alignItems: 'center', alignSelf: 'stretch', borderRadius: radii.lg, flexDirection: 'row', gap: spacing[2], justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing[2] },
  trackRowPressed: { backgroundColor: colors.primary06 },
  trackTitle: { flexShrink: 1, fontFamily: fonts.serifSemibold, fontSize: 17, lineHeight: 24, maxWidth: '72%', textAlign: 'center' },
  trackCount: { backgroundColor: colors.primary08, borderRadius: radii.full, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  trackCountText: { fontFamily: fonts.monoRegular },
  contentStage: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 90, width: '100%' },
  waveStage: { alignItems: 'center', height: 164, justifyContent: 'center', width: 210 },
  waveGlow: { left: 0, top: -23 },
  waveform: { alignItems: 'center', flexDirection: 'row', gap: 5, height: 72, justifyContent: 'center', width: 96 },
  waveBar: { backgroundColor: colors.primary, borderRadius: radii.full, maxHeight: 58, opacity: 0.84, width: 4 },
  waitingCopy: { bottom: spacing[2], fontFamily: fonts.monoRegular, position: 'absolute' },
  subtitleScroll: { alignSelf: 'stretch', flex: 1 },
  subtitleContent: { gap: spacing[5], paddingBottom: spacing[4], paddingHorizontal: spacing[2], paddingTop: spacing[5] },
  englishText: { color: colors.foreground, fontSize: 16, lineHeight: 26 },
  chineseText: { color: colors.mutedForeground, fontSize: 14, lineHeight: 23 },
  controlDock: { paddingTop: spacing[1], width: '100%' },
  timelineWrap: { height: 52 },
  errorRow: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.06)', borderRadius: radii.md, flexDirection: 'row', gap: spacing[2], marginBottom: spacing[1], paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  errorCopy: { flex: 1 },
  retry: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] },
  transport: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: spacing[1] },
  transportButton: { alignItems: 'center', borderRadius: radii.full, height: 44, justifyContent: 'center', width: 44 },
  controlPressed: { backgroundColor: colors.secondary },
  playButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 56, justifyContent: 'center', marginHorizontal: spacing[3], width: 56, ...shadows.floating },
  playPressed: { opacity: 0.86, transform: [{ scale: 0.96 }] },
  playIcon: { marginLeft: 3 },
  secondaryControls: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing[2], width: '100%' },
  secondaryAction: { alignItems: 'center', borderRadius: radii.lg, gap: 2, justifyContent: 'center', minHeight: 46, minWidth: 68 },
  speed: { color: colors.primary, fontFamily: fonts.monoRegular, fontSize: 15, lineHeight: 18 },
  intervalSheet: { gap: spacing[4], paddingBottom: spacing[2] },
  intervalValueRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'center' },
  intervalValue: { fontFamily: fonts.monoRegular, fontSize: 46, lineHeight: 54 },
  intervalUnit: { fontFamily: fonts.sansMedium, fontSize: 15, marginLeft: spacing[2] },
  intervalTimeline: { height: 44 },
  intervalRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing[4] },
  intervalPresets: { flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  intervalPreset: { alignItems: 'center', backgroundColor: colors.secondary, borderColor: 'transparent', borderRadius: radii.full, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 36 },
  intervalPresetActive: { backgroundColor: colors.primary08, borderColor: colors.primary20 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], marginBottom: spacing[3] },
  grow: { flex: 1, minWidth: 0 },
  groupScroll: { flexGrow: 0, height: 52 },
  groupFilters: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] },
  groupFilter: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, maxWidth: 150, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  groupFilterActive: { backgroundColor: colors.primary06, borderColor: colors.primary20 },
  queueList: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flex: 1, marginHorizontal: -spacing[5] },
  queueContent: { paddingBottom: spacing[4] },
  queueEmptyContent: { flexGrow: 1 },
  queueRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing[3], height: ROW_HEIGHT, paddingHorizontal: spacing[5] },
  queueRowCurrent: { backgroundColor: colors.primary06 },
  queueNumber: { alignItems: 'center', borderRadius: radii.full, height: 30, justifyContent: 'center', width: 30 },
  queueNumberCurrent: { backgroundColor: colors.primary10 },
  numberText: { fontFamily: fonts.monoRegular },
  duration: { fontFamily: fonts.monoRegular },
  empty: { alignItems: 'center', flex: 1, gap: spacing[2], justifyContent: 'center', padding: spacing[8] },
});
