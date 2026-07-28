import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AlertCircle, Check, Headphones, Pause, Play, RotateCcw } from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

import { AppText } from '@/components/ui';
import { AppModal } from '@/components/platform/AppModal';
import { useAppViewportDimensions } from '@/components/platform/useAppViewportDimensions';
import { colors, fonts, radii, shadows, spacing } from '@/theme';
import { audioSessionOrchestrator, type AudioLease } from '@/platform/audio';
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
  practiceControls,
  variant = 'default',
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
  practiceControls?: ReactNode;
  variant?: 'default' | 'integrated-recording';
}) {
  const { height: windowHeight, width: windowWidth } = useAppViewportDimensions();
  const player = useAudioPlayer(null, { updateInterval: 250, preferredForwardBufferDuration: 10 });
  const status = useAudioPlayerStatus(player);
  const [speedIndex, setSpeedIndex] = useState(1);
  const [speedMenuPosition, setSpeedMenuPosition] = useState<{ left: number; top: number }>();
  const speedRef = useRef(1);
  const speedButtonRef = useRef<View>(null);
  const speedMenuAnchorRef = useRef<{ left: number; top: number } | undefined>(undefined);
  const pendingAutoPlayRef = useRef(false);
  const latestStatusRef = useRef(status);
  const statusAtSourceReplacementRef = useRef<typeof status | undefined>(undefined);
  const resumeAfterScrubRef = useRef(false);
  const audioLease = useRef<AudioLease | undefined>(undefined);
  const playGeneration = useRef(0);
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
  const integrated = variant === 'integrated-recording';
  const audioFailed = !uri || loadTimeout.timedOut || status.playbackState === 'error';
  const audioControllable = Boolean(uri && status.isLoaded && !loadTimeout.timedOut && status.playbackState !== 'error');

  latestStatusRef.current = status;

  const tryPausePlayer = useCallback(() => {
    try {
      player.pause();
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const trySeekPlayer = useCallback(async (position: number) => {
    try {
      await player.seekTo(position);
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const tryReplacePlayer = useCallback((source: string) => {
    try {
      player.replace(source);
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const trySetPlaybackRate = useCallback((rate: number) => {
    try {
      player.setPlaybackRate(rate);
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const tryPlayPlayer = useCallback(() => {
    try {
      player.play();
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const releaseAudioLease = useCallback(async (lease = audioLease.current) => {
    if (lease) await audioSessionOrchestrator.release(lease).catch(() => undefined);
    if (audioLease.current?.token === lease?.token) audioLease.current = undefined;
  }, []);

  useEffect(() => audioSessionOrchestrator.register('study', {
    deactivate: async () => {
      playGeneration.current += 1;
      pendingAutoPlayRef.current = false;
      resumeAfterScrubRef.current = false;
      if (!tryPausePlayer()) throw new Error('study_player_pause_failed');
      audioLease.current = undefined;
    },
  }), [tryPausePlayer]);

  useEffect(() => {
    playGeneration.current += 1;
    tryPausePlayer();
    void releaseAudioLease();
    pendingAutoPlayRef.current = false;
    resumeAfterScrubRef.current = false;
    setSpeedMenuPosition(undefined);
    onSeekInteractionChange?.(false);
    void trySeekPlayer(0);
    statusAtSourceReplacementRef.current = undefined;
    if (!uri) return;
    statusAtSourceReplacementRef.current = latestStatusRef.current;
    if (!tryReplacePlayer(uri)) {
      statusAtSourceReplacementRef.current = undefined;
      return;
    }
    if (!trySetPlaybackRate(speedRef.current)) {
      // The source can still play at the native default rate.
    }
    pendingAutoPlayRef.current = autoPlayRequest > 0;
  }, [autoPlayRequest, onSeekInteractionChange, playbackKey, releaseAudioLease, tryPausePlayer, tryReplacePlayer, trySeekPlayer, trySetPlaybackRate, uri]);

  useEffect(() => {
    if (!pendingAutoPlayRef.current || appStateRef.current !== 'active') return;
    if (statusAtSourceReplacementRef.current === status) return;
    statusAtSourceReplacementRef.current = undefined;
    if (!status.isLoaded || status.playbackState === 'error') return;
    pendingAutoPlayRef.current = false;
    const operationGeneration = playGeneration.current + 1;
    playGeneration.current = operationGeneration;
    void (async () => {
      let lease: AudioLease | undefined;
      try {
        lease = await audioSessionOrchestrator.acquire('study', 'study-autoplay');
        if (operationGeneration !== playGeneration.current || appStateRef.current !== 'active') {
          await releaseAudioLease(lease);
          return;
        }
        audioLease.current = lease;
        onPlaybackStart?.();
        if (!tryPlayPlayer()) throw new Error('study_player_play_failed');
      } catch {
        if (lease) await releaseAudioLease(lease);
      }
    })();
  }, [onPlaybackStart, releaseAudioLease, status, tryPlayPlayer]);

  useEffect(() => {
    if (pauseRequest <= 0) return;
    playGeneration.current += 1;
    pendingAutoPlayRef.current = false;
    resumeAfterScrubRef.current = false;
    tryPausePlayer();
    void releaseAudioLease();
  }, [pauseRequest, releaseAudioLease, tryPausePlayer]);

  useEffect(() => {
    if (status.playbackState !== 'error') return;
    playGeneration.current += 1;
    pendingAutoPlayRef.current = false;
    resumeAfterScrubRef.current = false;
    tryPausePlayer();
    void releaseAudioLease();
  }, [releaseAudioLease, status.playbackState, tryPausePlayer]);

  useEffect(() => {
    setSpeedMenuPosition(undefined);
    onSeekInteractionChange?.(false);
  }, [dismissControlsRequest, onSeekInteractionChange]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active') {
        playGeneration.current += 1;
        pendingAutoPlayRef.current = false;
        resumeAfterScrubRef.current = false;
        setSpeedMenuPosition(undefined);
        onSeekInteractionChange?.(false);
        if (player.playing) tryPausePlayer();
        void releaseAudioLease();
      }
    });
    return () => subscription.remove();
  }, [onSeekInteractionChange, player, releaseAudioLease, tryPausePlayer]);

  useEffect(() => {
    if (!loadTimeout.timedOut) return;
    playGeneration.current += 1;
    pendingAutoPlayRef.current = false;
    resumeAfterScrubRef.current = false;
    tryPausePlayer();
    void releaseAudioLease();
  }, [loadTimeout.timedOut, releaseAudioLease, tryPausePlayer]);

  useEffect(() => {
    if (status.didJustFinish) {
      playGeneration.current += 1;
      void releaseAudioLease();
    }
  }, [releaseAudioLease, status.didJustFinish]);

  useEffect(() => () => {
    playGeneration.current += 1;
    tryPausePlayer();
    void releaseAudioLease();
  }, [releaseAudioLease, tryPausePlayer]);

  async function toggle() {
    if (!uri) return;
    if (status.playing) {
      playGeneration.current += 1;
      tryPausePlayer();
      await releaseAudioLease();
    }
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) await trySeekPlayer(0);
      const operationGeneration = playGeneration.current + 1;
      playGeneration.current = operationGeneration;
      let lease: AudioLease | undefined;
      try {
        lease = await audioSessionOrchestrator.acquire('study', 'study-play');
        if (operationGeneration !== playGeneration.current || appStateRef.current !== 'active') {
          await releaseAudioLease(lease);
          return;
        }
        audioLease.current = lease;
        onPlaybackStart?.();
        if (!tryPlayPlayer()) throw new Error('study_player_play_failed');
      } catch {
        if (lease) await releaseAudioLease(lease);
      }
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
    trySetPlaybackRate(speeds[index]);
    closeSpeedMenu();
  }

  function retry() {
    if (!uri) return;
    loadTimeout.retry();
    onRetry?.();
    pendingAutoPlayRef.current = true;
    if (!tryReplacePlayer(uri) || !trySetPlaybackRate(speeds[speedIndex])) {
      pendingAutoPlayRef.current = false;
    }
  }

  function beginScrub() {
    resumeAfterScrubRef.current = status.playing;
    if (status.playing) tryPausePlayer();
  }

  async function finishScrub(nextPosition: number) {
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    if (!await trySeekPlayer(nextPosition)) {
      await releaseAudioLease();
      return;
    }
    if (!shouldResume || appStateRef.current !== 'active') return;
    const operationGeneration = playGeneration.current + 1;
    playGeneration.current = operationGeneration;
    let lease: AudioLease | undefined;
    try {
      lease = await audioSessionOrchestrator.acquire('study', 'study-scrub-resume');
      if (operationGeneration !== playGeneration.current || appStateRef.current !== 'active') {
        await releaseAudioLease(lease);
        return;
      }
      audioLease.current = lease;
      onPlaybackStart?.();
      if (!tryPlayPlayer()) throw new Error('study_player_play_failed');
    } catch {
      if (lease) await releaseAudioLease(lease);
    }
  }

  function cancelScrub() {
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    if (!shouldResume || appStateRef.current !== 'active') return;
    const operationGeneration = playGeneration.current + 1;
    playGeneration.current = operationGeneration;
    void (async () => {
      let lease: AudioLease | undefined;
      try {
        lease = await audioSessionOrchestrator.acquire('study', 'study-scrub-cancel');
        if (operationGeneration !== playGeneration.current || appStateRef.current !== 'active') {
          await releaseAudioLease(lease);
          return;
        }
        audioLease.current = lease;
        onPlaybackStart?.();
        if (!tryPlayPlayer()) throw new Error('study_player_play_failed');
      } catch {
        if (lease) await releaseAudioLease(lease);
      }
    })();
  }

  const speedControl = (
    <Pressable
      accessibilityLabel={`播放速度 ${speeds[speedIndex]} 倍`}
      accessibilityState={{ disabled: integrated && !audioControllable, expanded: Boolean(speedMenuPosition) }}
      disabled={integrated && !audioControllable}
      onLayout={() => measureSpeedButton(false)}
      onPress={openSpeedMenu}
      ref={speedButtonRef}
      style={[styles.speed, integrated ? styles.integratedSpeed : null, integrated && !audioControllable ? styles.controlDisabled : null]}
    >
      <AppText style={styles.speedText} variant="caption">{speeds[speedIndex]}x</AppText>
    </Pressable>
  );

  return (
    <View style={[styles.root, integrated ? styles.integratedRoot : null]} testID="study-audio-player">
      {integrated ? (
        <>
          <View style={styles.integratedHeader}>
            <View style={[styles.labelRow, styles.integratedLabelRow]}>
              <Headphones color={colors.mutedForeground} size={15} />
              <AppText numberOfLines={1} style={styles.integratedLabel} variant="button">{label}</AppText>
              {tagColors.length ? <View accessibilityLabel={`已添加${tagColors.length}个标签`} style={styles.tagDots}>{tagColors.map((color, index) => <View key={`${color}-${index}`} style={[styles.tagDot, { backgroundColor: color }, index ? styles.tagDotOverlap : null]} />)}</View> : null}
            </View>
            {speedControl}
          </View>

          {!uri && resolving ? (
            <View style={styles.integratedStatus}>
              <ActivityIndicator color={colors.primary} size="small" />
              <View style={styles.errorCopy}><AppText variant="button">正在获取音频…</AppText><AppText variant="caption">文字学习内容已经可用。</AppText></View>
            </View>
          ) : !uri && generatedAudio ? (
            <View style={styles.integratedStatus}>
              <Headphones color={colors.primary} size={18} />
              <View style={styles.errorCopy}>
                <AppText variant="button">生成语音预留</AppText>
                <AppText variant="caption">OPI 题目按既定方向使用生成语音，本阶段不捆绑本地问题音频。</AppText>
              </View>
            </View>
          ) : audioFailed ? (
            <View style={styles.integratedStatus}>
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
            <View style={styles.integratedTimeline}>
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
          )}

          <View style={styles.integratedControls} testID="integrated-audio-controls">
            <View style={styles.sideControl}>
              <Pressable
                accessibilityLabel={status.playing ? '暂停' : '播放'}
                accessibilityState={{ disabled: !audioControllable }}
                disabled={!audioControllable}
                onPress={() => void toggle()}
                style={({ pressed }) => [styles.integratedPlay, !audioControllable ? styles.controlDisabled : null, pressed ? styles.pressed : null]}
              >
                {uri && !audioFailed && !status.isLoaded ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : status.playing ? (
                  <Pause color={colors.primaryForeground} fill={colors.primaryForeground} size={18} />
                ) : (
                  <Play color={colors.primaryForeground} fill={colors.primaryForeground} size={18} style={styles.playIcon} />
                )}
              </Pressable>
            </View>
            {practiceControls ? <View style={styles.practiceControls}>{practiceControls}</View> : null}
          </View>
        </>
      ) : (
        <>
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
          ) : audioFailed ? (
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
              {speedControl}
            </View>
          )}
        </>
      )}

      <AppModal animationType="fade" onRequestClose={closeSpeedMenu} transparent visible={Boolean(speedMenuPosition)}>
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
      </AppModal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
  integratedRoot: { backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0, gap: spacing[4], padding: 0 },
  integratedHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  integratedLabelRow: { flex: 1, marginBottom: 0, minWidth: 0 },
  integratedLabel: { flex: 1 },
  integratedTimeline: { minHeight: 52 },
  integratedControls: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  sideControl: { alignItems: 'center', gap: spacing[1], width: 44 },
  integratedPlay: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 44, justifyContent: 'center', width: 44 },
  practiceControls: { flex: 1, minWidth: 0 },
  integratedStatus: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2.5], minHeight: 52, paddingVertical: spacing[1] },
  labelRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[1.5], marginBottom: spacing[2] },
  label: { flex: 1, fontFamily: fonts.serifSemibold },
  tagDots: { alignItems: 'center', flexDirection: 'row', paddingRight: 2 },
  tagDot: { borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, height: 13, width: 13 },
  tagDotOverlap: { marginLeft: -5 },
  playerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  play: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 42, justifyContent: 'center', width: 42 },
  playIcon: { marginLeft: 2 },
  timeline: { flex: 1 },
  speed: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, paddingHorizontal: spacing[2.5], paddingVertical: spacing[1.5] },
  integratedSpeed: { minWidth: 52 },
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
  controlDisabled: { opacity: 0.42 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
});
