import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AlertCircle, Headphones, Pause, Play, RotateCcw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';
import { useAudioLoadTimeout } from '../hooks/useAudioLoadTimeout';

const speeds = [0.75, 1, 1.25, 1.5];

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function StudyAudioPlayer({
  uri,
  label,
  generatedAudio = false,
  playbackKey,
  autoPlayRequest = 0,
  tagColors = [],
  resolving = false,
  onRetry,
}: {
  uri?: string;
  label: string;
  generatedAudio?: boolean;
  playbackKey: string;
  autoPlayRequest?: number;
  tagColors?: string[];
  resolving?: boolean;
  onRetry?: () => void;
}) {
  const player = useAudioPlayer(null, { updateInterval: 250, preferredForwardBufferDuration: 10 });
  const status = useAudioPlayerStatus(player);
  const [speedIndex, setSpeedIndex] = useState(1);
  const speedRef = useRef(1);
  const pendingAutoPlayRef = useRef(false);
  const appStateRef = useRef<'active' | 'background' | 'inactive' | 'unknown' | 'extension'>('active');
  const [trackWidth, setTrackWidth] = useState(0);
  const loadTimeout = useAudioLoadTimeout({
    sourceKey: playbackKey,
    uri,
    isLoaded: status.isLoaded,
    hasError: status.playbackState === 'error',
  });

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
  }, []);

  useEffect(() => {
    player.pause();
    pendingAutoPlayRef.current = false;
    void player.seekTo(0).catch(() => undefined);
    if (!uri) return;
    player.replace(uri);
    player.setPlaybackRate(speedRef.current);
    pendingAutoPlayRef.current = autoPlayRequest > 0;
  }, [autoPlayRequest, playbackKey, player, uri]);

  useEffect(() => {
    if (!pendingAutoPlayRef.current || appStateRef.current !== 'active' || !status.isLoaded || status.playbackState === 'error') return;
    pendingAutoPlayRef.current = false;
    player.play();
  }, [player, status.isLoaded, status.playbackState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active') {
        pendingAutoPlayRef.current = false;
        if (player.playing) player.pause();
      }
    });
    return () => subscription.remove();
  }, [player]);

  useEffect(() => {
    if (!loadTimeout.timedOut) return;
    pendingAutoPlayRef.current = false;
    player.pause();
  }, [loadTimeout.timedOut, player]);

  function toggle() {
    if (!uri) return;
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) void player.seekTo(0);
      player.play();
    }
  }

  function cycleSpeed() {
    const next = (speedIndex + 1) % speeds.length;
    setSpeedIndex(next);
    speedRef.current = speeds[next];
    player.setPlaybackRate(speeds[next]);
  }

  function retry() {
    if (!uri) return;
    loadTimeout.retry();
    onRetry?.();
    pendingAutoPlayRef.current = true;
    player.replace(uri);
    player.setPlaybackRate(speeds[speedIndex]);
  }

  function seekFromLocation(locationX: number) {
    if (!status.duration || !trackWidth) return;
    const next = Math.max(0, Math.min(status.duration, (locationX / trackWidth) * status.duration));
    void player.seekTo(next);
  }

  function onTrackLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  const progress = status.duration ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;

  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Headphones color={colors.mutedForeground} size={14} />
        <AppText numberOfLines={1} style={styles.label} variant="caption">{label}</AppText>
        {tagColors.length ? <View accessibilityLabel={`已添加${tagColors.length}个标签`} style={styles.tagDots}>{tagColors.map((color, index) => <View key={`${color}-${index}`} style={[styles.tagDot, { backgroundColor: color }, index ? styles.tagDotOverlap : null]} />)}</View> : null}
      </View>

      {!uri && resolving ? (
        <View style={styles.generated}>
          <ActivityIndicator color={colors.primary} size="small" />
          <View style={styles.errorCopy}><AppText variant="button">正在获取音频…</AppText><AppText variant="caption">文字学习内容已经可用。</AppText></View>
        </View>
      ) : !uri && generatedAudio ? (
        <View style={styles.generated}>
          <Headphones color={colors.primary} size={18} />
          <View style={styles.errorCopy}>
            <AppText variant="button">生成语音预留</AppText>
            <AppText variant="caption">OPI 题目按既定方向使用生成语音，本阶段不捆绑本地问题音频。</AppText>
          </View>
        </View>
      ) : !uri || loadTimeout.timedOut || status.playbackState === 'error' ? (
        <View style={styles.error}>
          <AlertCircle color={colors.destructive} size={18} />
          <View style={styles.errorCopy}>
            <AppText variant="button">{loadTimeout.timedOut ? '音频加载超时' : '音频加载失败'}</AppText>
            <AppText variant="caption">{loadTimeout.timedOut ? '连接可能已中断；重试会重新获取音频地址。' : '原文与题目仍可继续学习。'}</AppText>
          </View>
          {uri ? (
            <Pressable accessibilityLabel="重试音频" onPress={retry} style={styles.retry}>
              <RotateCcw color={colors.destructive} size={15} />
              <AppText color={colors.destructive} variant="caption">重试</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.playerRow}>
          <Pressable
            accessibilityLabel={status.playing ? '暂停' : '播放'}
            disabled={!status.isLoaded}
            onPress={toggle}
            style={({ pressed }) => [styles.play, pressed ? styles.pressed : null]}
          >
            {!status.isLoaded ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : status.playing ? (
              <Pause color={colors.primaryForeground} fill={colors.primaryForeground} size={18} />
            ) : (
              <Play color={colors.primaryForeground} fill={colors.primaryForeground} size={18} style={styles.playIcon} />
            )}
          </Pressable>
          <View style={styles.timeline}>
            <Pressable
              accessibilityActions={[{ name: 'increment', label: '快进' }, { name: 'decrement', label: '后退' }]}
              accessibilityLabel="播放进度"
              accessibilityRole="adjustable"
              onAccessibilityAction={(event) => {
                const delta = event.nativeEvent.actionName === 'increment' ? 5 : -5;
                void player.seekTo(Math.max(0, Math.min(status.duration, status.currentTime + delta)));
              }}
              onLayout={onTrackLayout}
              onPress={(event) => seekFromLocation(event.nativeEvent.locationX)}
              style={styles.track}
            >
              <View style={styles.trackBase} />
              <View style={[styles.fill, { width: `${progress}%` }]} />
              <View style={[styles.thumb, { left: `${progress}%` }]} />
            </Pressable>
            <View style={styles.timeRow}>
              <AppText style={styles.time} variant="micro">{formatTime(status.currentTime)}</AppText>
              <AppText style={styles.time} variant="micro">{formatTime(status.duration)}</AppText>
            </View>
          </View>
          <Pressable accessibilityLabel={`播放速度 ${speeds[speedIndex]} 倍`} onPress={cycleSpeed} style={styles.speed}>
            <AppText style={styles.speedText} variant="caption">{speeds[speedIndex]}x</AppText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch', backgroundColor: 'rgba(244,242,236,0.55)', borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, padding: spacing[3] },
  labelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5], marginBottom: spacing[2] },
  label: { flex: 1, fontFamily: fonts.sansSemibold },
  tagDots: { alignItems: 'center', flexDirection: 'row', paddingRight: 2 },
  tagDot: { borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, height: 13, width: 13 },
  tagDotOverlap: { marginLeft: -5 },
  playerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  play: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 42, justifyContent: 'center', width: 42 },
  playIcon: { marginLeft: 2 },
  timeline: { flex: 1 },
  track: { height: 18, justifyContent: 'center' },
  trackBase: { backgroundColor: colors.border, borderRadius: radii.full, height: 6, left: 0, position: 'absolute', right: 0 },
  fill: { backgroundColor: colors.primary, borderRadius: radii.full, height: 6 },
  thumb: { backgroundColor: colors.card, borderColor: colors.primary, borderRadius: radii.full, borderWidth: 2, height: 14, marginLeft: -7, position: 'absolute', width: 14 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[1] },
  time: { color: colors.mutedForeground, fontFamily: fonts.monoRegular },
  speed: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, paddingHorizontal: spacing[2.5], paddingVertical: spacing[1.5] },
  speedText: { color: colors.foreground, fontFamily: fonts.monoRegular },
  error: { alignItems: 'flex-start', backgroundColor: 'rgba(219,43,51,0.08)', borderColor: 'rgba(219,43,51,0.25)', borderRadius: radii.xl, borderWidth: 1, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
  generated: { alignItems: 'flex-start', backgroundColor: colors.primary06, borderColor: colors.primary20, borderRadius: radii.xl, borderWidth: 1, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
  errorCopy: { flex: 1 },
  retry: { alignItems: 'center', flexDirection: 'row', gap: spacing[1], padding: spacing[1] },
  pressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
});
