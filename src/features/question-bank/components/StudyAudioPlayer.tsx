import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AlertCircle, Check, Headphones, Pause, Play, RotateCcw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

import { AppText } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';
import { useAudioLoadTimeout } from '../hooks/useAudioLoadTimeout';
import { AudioTimeline } from './AudioTimeline';

const speeds = [0.75, 1, 1.25, 1.5];
const SPEED_MENU_WIDTH = 112;
const SPEED_MENU_HEIGHT = 176;

export function StudyAudioPlayer({
  uri,
  label,
  generatedAudio = false,
  playbackKey,
  autoPlayRequest = 0,
  tagColors = [],
  resolving = false,
  onRetry,
  onSeekInteractionChange,
  blockedExternalGesture,
  dismissControlsRequest = 0,
  pauseRequest = 0,
  onPlaybackStart,
}: {
  uri?: string;
  label: string;
  generatedAudio?: boolean;
  playbackKey: string;
  autoPlayRequest?: number;
  tagColors?: string[];
  resolving?: boolean;
  onRetry?: () => void;
  onSeekInteractionChange?: (active: boolean) => void;
  blockedExternalGesture?: GestureType;
  dismissControlsRequest?: number;
  pauseRequest?: number;
  onPlaybackStart?: () => void;
}) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const player = useAudioPlayer(null, { updateInterval: 250, preferredForwardBufferDuration: 10 });
  const status = useAudioPlayerStatus(player);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [speedMenuPosition, setSpeedMenuPosition] = useState<{ left: number; top: number }>();
  const speedRef = useRef(1);
  const speedButtonRef = useRef<View>(null);
  const speedMenuAnchorRef = useRef<{ left: number; top: number } | undefined>(undefined);
  const pendingAutoPlayRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const currentAppState = AppState.currentState;
  const appStateRef = useRef<'active' | 'background' | 'inactive' | 'unknown' | 'extension'>(
    typeof currentAppState === 'string' ? currentAppState : 'active',
  );
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
    resumeAfterScrubRef.current = false;
    setSpeedMenuPosition(undefined);
    onSeekInteractionChange?.(false);
    void player.seekTo(0).catch(() => undefined);
    if (!uri) return;
    player.replace(uri);
    player.setPlaybackRate(speedRef.current);
    pendingAutoPlayRef.current = autoPlayRequest > 0;
  }, [autoPlayRequest, onSeekInteractionChange, playbackKey, player, uri]);

  useEffect(() => {
    if (!pendingAutoPlayRef.current || appStateRef.current !== 'active' || !status.isLoaded || status.playbackState === 'error') return;
    pendingAutoPlayRef.current = false;
    onPlaybackStart?.();
    player.play();
  }, [onPlaybackStart, player, status.isLoaded, status.playbackState]);

  useEffect(() => {
    if (pauseRequest <= 0) return;
    pendingAutoPlayRef.current = false;
    resumeAfterScrubRef.current = false;
    player.pause();
  }, [pauseRequest, player]);

  useEffect(() => {
    if (status.playbackState !== 'error') return;
    pendingAutoPlayRef.current = false;
    resumeAfterScrubRef.current = false;
    player.pause();
  }, [player, status.playbackState]);

  useEffect(() => {
    setSpeedMenuPosition(undefined);
    onSeekInteractionChange?.(false);
  }, [dismissControlsRequest, onSeekInteractionChange]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active') {
        pendingAutoPlayRef.current = false;
        resumeAfterScrubRef.current = false;
        setSpeedMenuPosition(undefined);
        onSeekInteractionChange?.(false);
        if (player.playing) player.pause();
      }
    });
    return () => subscription.remove();
  }, [onSeekInteractionChange, player]);

  useEffect(() => {
    if (!loadTimeout.timedOut) return;
    pendingAutoPlayRef.current = false;
    resumeAfterScrubRef.current = false;
    player.pause();
  }, [loadTimeout.timedOut, player]);

  async function toggle() {
    if (!uri) return;
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) await player.seekTo(0);
      onPlaybackStart?.();
      player.play();
    }
  }

  const closeSpeedMenu = useCallback(() => {
    setSpeedMenuPosition(undefined);
    onSeekInteractionChange?.(false);
  }, [onSeekInteractionChange]);

  function measureSpeedButton(updateVisiblePosition: boolean) {
    speedButtonRef.current?.measureInWindow((x, y, width, height) => {
      const left = Math.max(spacing[2], Math.min(windowWidth - SPEED_MENU_WIDTH - spacing[2], x + width - SPEED_MENU_WIDTH));
      const above = y - SPEED_MENU_HEIGHT - spacing[2];
      const top = above >= spacing[2]
        ? above
        : Math.min(windowHeight - SPEED_MENU_HEIGHT - spacing[2], y + height + spacing[2]);
      const nextPosition = { left, top: Math.max(spacing[2], top) };
      speedMenuAnchorRef.current = nextPosition;
      if (updateVisiblePosition) setSpeedMenuPosition(nextPosition);
    });
  }

  function openSpeedMenu() {
    setSpeedMenuPosition(speedMenuAnchorRef.current ?? {
      left: Math.max(spacing[2], windowWidth - SPEED_MENU_WIDTH - spacing[5]),
      top: Math.max(spacing[2], windowHeight - SPEED_MENU_HEIGHT - spacing[5]),
    });
    onSeekInteractionChange?.(true);
    measureSpeedButton(true);
  }

  function selectSpeed(index: number) {
    setSpeedIndex(index);
    speedRef.current = speeds[index];
    player.setPlaybackRate(speeds[index]);
    closeSpeedMenu();
  }

  function retry() {
    if (!uri) return;
    loadTimeout.retry();
    onRetry?.();
    pendingAutoPlayRef.current = true;
    player.replace(uri);
    player.setPlaybackRate(speeds[speedIndex]);
  }

  function beginScrub() {
    resumeAfterScrubRef.current = status.playing;
    if (status.playing) player.pause();
  }

  async function finishScrub(nextPosition: number) {
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    await player.seekTo(nextPosition);
    if (!shouldResume || appStateRef.current !== 'active') return;
    onPlaybackStart?.();
    player.play();
  }

  function cancelScrub() {
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    if (!shouldResume || appStateRef.current !== 'active') return;
    onPlaybackStart?.();
    player.play();
  }

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
            onPress={() => void toggle()}
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
            <AudioTimeline
              blockedExternalGesture={blockedExternalGesture}
              disabled={!status.isLoaded}
              duration={status.duration}
              onInteractionChange={onSeekInteractionChange}
              onScrubCancel={cancelScrub}
              onScrubEnd={finishScrub}
              onScrubStart={beginScrub}
              position={status.currentTime}
              testID="question-audio-timeline"
            />
          </View>
          <Pressable accessibilityLabel={`播放速度 ${speeds[speedIndex]} 倍`} accessibilityState={{ expanded: Boolean(speedMenuPosition) }} onLayout={() => measureSpeedButton(false)} onPress={openSpeedMenu} ref={speedButtonRef} style={styles.speed}>
            <AppText style={styles.speedText} variant="caption">{speeds[speedIndex]}x</AppText>
          </Pressable>
        </View>
      )}

      <Modal animationType="fade" onRequestClose={closeSpeedMenu} transparent visible={Boolean(speedMenuPosition)}>
        <View style={styles.modalLayer}>
          <Pressable accessibilityLabel="关闭倍速选择" onPressIn={closeSpeedMenu} style={StyleSheet.absoluteFill} />
          {speedMenuPosition ? (
            <View accessibilityLabel="播放速度选项" style={[styles.speedMenu, speedMenuPosition]} testID="speed-menu">
              {speeds.map((speed, index) => {
                const selected = index === speedIndex;
                return (
                  <Pressable accessibilityLabel={`${speed} 倍`} accessibilityState={{ selected }} key={speed} onPress={() => selectSpeed(index)} style={[styles.speedOption, selected ? styles.speedOptionSelected : null]}>
                    <AppText color={selected ? colors.primary : colors.foreground} style={styles.speedOptionText} variant="caption">{speed}x</AppText>
                    {selected ? <Check color={colors.primary} size={14} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Modal>
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
  speed: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, paddingHorizontal: spacing[2.5], paddingVertical: spacing[1.5] },
  speedText: { color: colors.foreground, fontFamily: fonts.monoRegular },
  modalLayer: { flex: 1 },
  speedMenu: { backgroundColor: colors.card80, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, padding: spacing[1], position: 'absolute', width: SPEED_MENU_WIDTH, ...shadows.modal },
  speedOption: { alignItems: 'center', borderRadius: radii.lg, flexDirection: 'row', justifyContent: 'space-between', minHeight: 40, paddingHorizontal: spacing[3] },
  speedOptionSelected: { backgroundColor: colors.primary06 },
  speedOptionText: { fontFamily: fonts.monoRegular },
  error: { alignItems: 'flex-start', backgroundColor: 'rgba(219,43,51,0.08)', borderColor: 'rgba(219,43,51,0.25)', borderRadius: radii.xl, borderWidth: 1, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
  generated: { alignItems: 'flex-start', backgroundColor: colors.primary06, borderColor: colors.primary20, borderRadius: radii.xl, borderWidth: 1, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
  errorCopy: { flex: 1 },
  retry: { alignItems: 'center', flexDirection: 'row', gap: spacing[1], padding: spacing[1] },
  pressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
});
