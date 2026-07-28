import { AlertCircle, Check, Headphones, Pause, Play, RotateCcw } from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

import { AppModal } from '@/components/platform/AppModal';
import { useAppViewportDimensions } from '@/components/platform/useAppViewportDimensions';
import { AppText } from '@/components/ui';
import {
  audioSessionOrchestrator,
  emitAudioDiagnostic,
  type AudioLease,
} from '@/platform/audio';
import { colors, fonts, radii, shadows, spacing } from '@/theme';
import { AudioTimeline } from './AudioTimeline';

const speeds = [0.75, 1, 1.25, 1.5];
const SPEED_MENU_WIDTH = 112;
const SPEED_MENU_HEIGHT = 176;
export const WEB_AUDIO_FIRST_FRAME_TIMEOUT_MS = 20_000;

type WebPlaybackPhase =
  | 'ready'
  | 'starting'
  | 'playing'
  | 'buffering'
  | 'paused'
  | 'ended'
  | 'error';

type WebPlaybackError =
  | 'network'
  | 'decode'
  | 'unsupported'
  | 'start-timeout'
  | 'session';

type WebPlaybackState = {
  currentTime: number;
  duration: number;
  error?: WebPlaybackError;
  metadataReady: boolean;
  phase: WebPlaybackPhase;
};

type StudyAudioPlayerProps = {
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
  onReady?: () => void;
  practiceControls?: ReactNode;
  durationHint?: number;
  variant?: 'default' | 'integrated-recording';
};

function initialPlaybackState(durationHint?: number): WebPlaybackState {
  return {
    currentTime: 0,
    duration: durationHint ?? 0,
    metadataReady: false,
    phase: 'ready',
  };
}

function mediaErrorCode(media: HTMLAudioElement): WebPlaybackError {
  switch (media.error?.code) {
    case 2:
      return 'network';
    case 3:
      return 'decode';
    case 4:
      return 'unsupported';
    default:
      return 'network';
  }
}

function promiseErrorCode(error: unknown, media: HTMLAudioElement): WebPlaybackError | 'not-allowed' {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return 'not-allowed';
  if (error instanceof DOMException && error.name === 'NotSupportedError') return 'unsupported';
  return media.error ? mediaErrorCode(media) : 'network';
}

function errorCopy(error: WebPlaybackError) {
  switch (error) {
    case 'network':
      return {
        detail: '浏览器无法读取音频数据；请检查网络后重试。',
        title: '音频网络错误',
      };
    case 'decode':
      return {
        detail: '浏览器无法解码这段音频；请重试或更换浏览器。',
        title: '音频解码失败',
      };
    case 'unsupported':
      return {
        detail: '当前浏览器不支持这段音频的格式。',
        title: '音频格式不支持',
      };
    case 'start-timeout':
      return {
        detail: '浏览器在 20 秒内未开始播放；请重试。',
        title: '音频启动超时',
      };
    case 'session':
      return {
        detail: '录音或其它音频正在占用播放通道；请稍后重试。',
        title: '音频暂时不可用',
      };
  }
}

function normalizedMediaUri(uri: string) {
  try {
    return new URL(uri, document.baseURI).href;
  } catch {
    return uri;
  }
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
  onSeekInteractionChange,
  blockedExternalGesture,
  dismissControlsRequest = 0,
  pauseRequest = 0,
  onPlaybackStart,
  onReady,
  practiceControls,
  durationHint,
  variant = 'default',
}: StudyAudioPlayerProps) {
  const { height: windowHeight, width: windowWidth } = useAppViewportDimensions();
  const [playback, setPlayback] = useState<WebPlaybackState>(() => initialPlaybackState(durationHint));
  const [speedIndex, setSpeedIndex] = useState(1);
  const [speedMenuPosition, setSpeedMenuPosition] = useState<{ left: number; top: number }>();
  const mediaRef = useRef<HTMLAudioElement | undefined>(undefined);
  const audioLeaseRef = useRef<AudioLease | undefined>(undefined);
  const currentAppState = AppState.currentState;
  const appStateRef = useRef(
    typeof currentAppState === 'string' ? currentAppState : 'active',
  );
  const sourceGenerationRef = useRef(0);
  const operationGenerationRef = useRef(0);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const playbackPhaseRef = useRef<WebPlaybackPhase>('ready');
  const speedRef = useRef(1);
  const speedButtonRef = useRef<View>(null);
  const speedMenuAnchorRef = useRef<{ left: number; top: number } | undefined>(undefined);
  const resumeAfterScrubRef = useRef(false);
  const webAudioUnlockedRef = useRef(false);
  const readyNotifiedKeyRef = useRef<string | undefined>(undefined);
  const onPlaybackStartRef = useRef(onPlaybackStart);
  const onReadyRef = useRef(onReady);
  const onSeekInteractionChangeRef = useRef(onSeekInteractionChange);
  const integrated = variant === 'integrated-recording';

  onPlaybackStartRef.current = onPlaybackStart;
  onReadyRef.current = onReady;
  onSeekInteractionChangeRef.current = onSeekInteractionChange;

  const setPhase = useCallback((phase: WebPlaybackPhase, error?: WebPlaybackError) => {
    playbackPhaseRef.current = phase;
    setPlayback((current) => ({
      ...current,
      error,
      phase,
    }));
  }, []);

  const clearStartTimeout = useCallback(() => {
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    startTimeoutRef.current = undefined;
  }, []);

  const releaseAudioLease = useCallback(async (lease = audioLeaseRef.current) => {
    if (lease) await audioSessionOrchestrator.release(lease).catch(() => undefined);
    if (audioLeaseRef.current?.token === lease?.token) audioLeaseRef.current = undefined;
  }, []);

  const invalidatePlaybackOperation = useCallback(() => {
    operationGenerationRef.current += 1;
    clearStartTimeout();
  }, [clearStartTimeout]);

  const pauseMedia = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return true;
    try {
      media.pause();
      return true;
    } catch {
      return false;
    }
  }, []);

  const pauseAndRelease = useCallback((nextPhase: WebPlaybackPhase = 'paused') => {
    invalidatePlaybackOperation();
    pauseMedia();
    if (playbackPhaseRef.current !== 'error') setPhase(nextPhase);
    void releaseAudioLease();
  }, [invalidatePlaybackOperation, pauseMedia, releaseAudioLease, setPhase]);

  const failPlayback = useCallback((
    error: WebPlaybackError,
    operationGeneration: number,
  ) => {
    if (operationGeneration !== operationGenerationRef.current) return;
    invalidatePlaybackOperation();
    pauseMedia();
    setPhase('error', error);
    emitAudioDiagnostic({
      code: `study_web_${error.replace('-', '_')}`,
      level: 'error',
      owner: 'study',
      scope: 'playback',
    });
    void releaseAudioLease();
  }, [invalidatePlaybackOperation, pauseMedia, releaseAudioLease, setPhase]);

  const markPlaybackStarted = useCallback((sourceGeneration: number) => {
    if (sourceGeneration !== sourceGenerationRef.current) return;
    clearStartTimeout();
    webAudioUnlockedRef.current = true;
    setPhase('playing');
    if (readyNotifiedKeyRef.current === playbackKey) return;
    readyNotifiedKeyRef.current = playbackKey;
    onReadyRef.current?.();
    emitAudioDiagnostic({
      code: 'study_web_first_frame',
      level: 'info',
      owner: 'study',
      scope: 'playback',
    });
  }, [clearStartTimeout, playbackKey, setPhase]);

  const armStartTimeout = useCallback((operationGeneration: number) => {
    clearStartTimeout();
    startTimeoutRef.current = setTimeout(() => {
      failPlayback('start-timeout', operationGeneration);
    }, WEB_AUDIO_FIRST_FRAME_TIMEOUT_MS);
  }, [clearStartTimeout, failPlayback]);

  const handlePlayPromiseFailure = useCallback((
    error: unknown,
    media: HTMLAudioElement,
    operationGeneration: number,
  ) => {
    if (operationGeneration !== operationGenerationRef.current) return;
    const code = promiseErrorCode(error, media);
    if (code === 'not-allowed') {
      invalidatePlaybackOperation();
      pauseMedia();
      setPhase('ready');
      emitAudioDiagnostic({
        code: 'study_web_play_not_allowed',
        level: 'info',
        owner: 'study',
        scope: 'playback',
      });
      void releaseAudioLease();
      return;
    }
    failPlayback(code, operationGeneration);
  }, [failPlayback, invalidatePlaybackOperation, pauseMedia, releaseAudioLease, setPhase]);

  const startPlaybackFromGesture = useCallback((reason = 'study-play') => {
    const media = mediaRef.current;
    if (!media || !uri || appStateRef.current !== 'active') return;
    const operationGeneration = operationGenerationRef.current + 1;
    operationGenerationRef.current = operationGeneration;
    if (
      playbackPhaseRef.current === 'ended'
      || (Number.isFinite(media.duration) && media.duration > 0 && media.currentTime >= media.duration)
    ) {
      try {
        media.currentTime = 0;
      } catch {
        // A source without metadata can still start from its natural beginning.
      }
    }
    setPhase('starting');
    armStartTimeout(operationGeneration);

    // Mobile Safari only preserves the audible-media permission while this
    // user-activation callback is still on the stack. Acquire the shared study
    // lease first, but deliberately do not await it before calling play().
    const leasePromise = audioSessionOrchestrator.acquire('study', reason);
    onPlaybackStartRef.current?.();
    let playPromise: Promise<void>;
    try {
      playPromise = media.play();
    } catch (error) {
      handlePlayPromiseFailure(error, media, operationGeneration);
      void leasePromise.then(releaseAudioLease, () => undefined);
      return;
    }
    void playPromise.catch((error) => {
      handlePlayPromiseFailure(error, media, operationGeneration);
    });
    void leasePromise.then(async (lease) => {
      if (
        operationGeneration !== operationGenerationRef.current
        || appStateRef.current !== 'active'
      ) {
        await releaseAudioLease(lease);
        return;
      }
      audioLeaseRef.current = lease;
    }, () => {
      if (operationGeneration !== operationGenerationRef.current) return;
      failPlayback('session', operationGeneration);
    });
  }, [armStartTimeout, failPlayback, handlePlayPromiseFailure, releaseAudioLease, setPhase, uri]);

  const startBestEffortAutoPlay = useCallback(async (
    media: HTMLAudioElement,
    sourceGeneration: number,
  ) => {
    const operationGeneration = operationGenerationRef.current + 1;
    operationGenerationRef.current = operationGeneration;
    let lease: AudioLease | undefined;
    try {
      lease = await audioSessionOrchestrator.acquire('study', 'study-autoplay');
      if (
        sourceGeneration !== sourceGenerationRef.current
        || operationGeneration !== operationGenerationRef.current
        || appStateRef.current !== 'active'
      ) {
        await releaseAudioLease(lease);
        return;
      }
      audioLeaseRef.current = lease;
      setPhase('starting');
      armStartTimeout(operationGeneration);
      onPlaybackStartRef.current?.();
      await media.play();
    } catch (error) {
      if (lease && audioLeaseRef.current?.token !== lease.token) {
        await releaseAudioLease(lease);
      }
      if (operationGeneration !== operationGenerationRef.current) return;
      if (promiseErrorCode(error, media) === 'not-allowed') {
        invalidatePlaybackOperation();
        pauseMedia();
        setPhase('ready');
        void releaseAudioLease();
        return;
      }
      if (!lease) {
        failPlayback('session', operationGeneration);
        return;
      }
      handlePlayPromiseFailure(error, media, operationGeneration);
    }
  }, [
    armStartTimeout,
    failPlayback,
    handlePlayPromiseFailure,
    invalidatePlaybackOperation,
    pauseMedia,
    releaseAudioLease,
    setPhase,
  ]);

  useEffect(() => audioSessionOrchestrator.register('study', {
    deactivate: async () => {
      invalidatePlaybackOperation();
      resumeAfterScrubRef.current = false;
      if (!pauseMedia()) throw new Error('study_web_player_pause_failed');
      audioLeaseRef.current = undefined;
      if (playbackPhaseRef.current !== 'error') setPhase('paused');
    },
  }), [invalidatePlaybackOperation, pauseMedia, setPhase]);

  useEffect(() => {
    const sourceGeneration = sourceGenerationRef.current + 1;
    sourceGenerationRef.current = sourceGeneration;
    invalidatePlaybackOperation();
    resumeAfterScrubRef.current = false;
    readyNotifiedKeyRef.current = undefined;
    setSpeedMenuPosition(undefined);
    onSeekInteractionChangeRef.current?.(false);
    pauseMedia();
    void releaseAudioLease();
    setPlayback(initialPlaybackState(durationHint));
    playbackPhaseRef.current = 'ready';

    if (!uri || typeof Audio === 'undefined') return;
    const media = mediaRef.current ?? new Audio();
    mediaRef.current = media;
    const expectedUri = normalizedMediaUri(uri);
    const isCurrentSource = () => (
      sourceGeneration === sourceGenerationRef.current
      && (media.currentSrc ? media.currentSrc === expectedUri : media.src === expectedUri)
    );
    const updateTiming = () => {
      if (!isCurrentSource()) return;
      setPlayback((current) => ({
        ...current,
        currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0,
        duration: Number.isFinite(media.duration) && media.duration > 0
          ? media.duration
          : current.duration,
      }));
    };
    const onLoadedMetadata = () => {
      if (!isCurrentSource()) return;
      setPlayback((current) => ({
        ...current,
        duration: Number.isFinite(media.duration) && media.duration > 0
          ? media.duration
          : current.duration,
        metadataReady: true,
      }));
    };
    const onCanPlay = () => {
      if (!isCurrentSource()) return;
      setPlayback((current) => ({ ...current, metadataReady: true }));
    };
    const onPlaying = () => markPlaybackStarted(sourceGeneration);
    const onTimeUpdate = () => {
      updateTiming();
      if (media.currentTime > 0 && !media.paused) markPlaybackStarted(sourceGeneration);
    };
    const onWaiting = () => {
      if (!isCurrentSource()) return;
      if (playbackPhaseRef.current === 'playing' || playbackPhaseRef.current === 'buffering') {
        setPhase('buffering');
      }
    };
    const onPause = () => {
      if (!isCurrentSource() || media.ended) return;
      if (
        playbackPhaseRef.current === 'playing'
        || playbackPhaseRef.current === 'buffering'
        || playbackPhaseRef.current === 'starting'
      ) {
        setPhase('paused');
      }
    };
    const onEnded = () => {
      if (!isCurrentSource()) return;
      invalidatePlaybackOperation();
      updateTiming();
      setPhase('ended');
      void releaseAudioLease();
    };
    const onError = () => {
      if (!isCurrentSource()) return;
      failPlayback(mediaErrorCode(media), operationGenerationRef.current);
    };

    media.addEventListener('loadedmetadata', onLoadedMetadata);
    media.addEventListener('canplay', onCanPlay);
    media.addEventListener('playing', onPlaying);
    media.addEventListener('timeupdate', onTimeUpdate);
    media.addEventListener('waiting', onWaiting);
    media.addEventListener('stalled', onWaiting);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onEnded);
    media.addEventListener('error', onError);

    media.crossOrigin = 'anonymous';
    media.preload = 'metadata';
    media.playbackRate = speedRef.current;
    media.src = uri;
    try {
      media.load();
    } catch {
      // The first explicit play() remains the authoritative load attempt.
    }

    const autoPlayTimer = autoPlayRequest > 0 && webAudioUnlockedRef.current
      ? setTimeout(() => {
        if (isCurrentSource()) void startBestEffortAutoPlay(media, sourceGeneration);
      }, 0)
      : undefined;

    return () => {
      if (autoPlayTimer) clearTimeout(autoPlayTimer);
      media.removeEventListener('loadedmetadata', onLoadedMetadata);
      media.removeEventListener('canplay', onCanPlay);
      media.removeEventListener('playing', onPlaying);
      media.removeEventListener('timeupdate', onTimeUpdate);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('stalled', onWaiting);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onEnded);
      media.removeEventListener('error', onError);
    };
  }, [
    autoPlayRequest,
    durationHint,
    failPlayback,
    invalidatePlaybackOperation,
    markPlaybackStarted,
    pauseMedia,
    playbackKey,
    releaseAudioLease,
    setPhase,
    startBestEffortAutoPlay,
    uri,
  ]);

  useEffect(() => {
    if (pauseRequest <= 0) return;
    resumeAfterScrubRef.current = false;
    pauseAndRelease();
  }, [pauseAndRelease, pauseRequest]);

  useEffect(() => {
    setSpeedMenuPosition(undefined);
    onSeekInteractionChange?.(false);
  }, [dismissControlsRequest, onSeekInteractionChange]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next === 'active') return;
      resumeAfterScrubRef.current = false;
      setSpeedMenuPosition(undefined);
      onSeekInteractionChangeRef.current?.(false);
      pauseAndRelease();
    });
    return () => subscription.remove();
  }, [pauseAndRelease]);

  useEffect(() => () => {
    sourceGenerationRef.current += 1;
    invalidatePlaybackOperation();
    pauseMedia();
    void releaseAudioLease();
    const media = mediaRef.current;
    if (!media) return;
    media.removeAttribute('src');
    try {
      media.load();
    } catch {
      // Component cleanup must remain best effort.
    }
  }, [invalidatePlaybackOperation, pauseMedia, releaseAudioLease]);

  function toggle() {
    const media = mediaRef.current;
    if (!media || !uri) return;
    if (
      playback.phase === 'playing'
      || playback.phase === 'buffering'
      || (playback.phase === 'starting' && !media.paused)
    ) {
      pauseAndRelease();
      return;
    }
    startPlaybackFromGesture();
  }

  const closeSpeedMenu = useCallback(() => {
    setSpeedMenuPosition(undefined);
    onSeekInteractionChange?.(false);
  }, [onSeekInteractionChange]);

  function measureSpeedButton(updateVisiblePosition: boolean) {
    speedButtonRef.current?.measureInWindow((x, y, width, height) => {
      const left = Math.max(
        spacing[2],
        Math.min(windowWidth - SPEED_MENU_WIDTH - spacing[2], x + width - SPEED_MENU_WIDTH),
      );
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
    const nextSpeed = speeds[index];
    setSpeedIndex(index);
    speedRef.current = nextSpeed;
    if (mediaRef.current) mediaRef.current.playbackRate = nextSpeed;
    closeSpeedMenu();
  }

  function retry() {
    const media = mediaRef.current;
    if (!media || !uri) return;
    invalidatePlaybackOperation();
    setPhase('ready');
    media.crossOrigin = 'anonymous';
    media.preload = 'metadata';
    media.playbackRate = speedRef.current;
    media.src = uri;
    try {
      media.load();
    } catch {
      // The next explicit play remains available if metadata loading is deferred.
    }
    onRetry?.();
  }

  function beginScrub() {
    const media = mediaRef.current;
    if (!media) return;
    resumeAfterScrubRef.current = !media.paused;
    if (resumeAfterScrubRef.current) {
      clearStartTimeout();
      media.pause();
    }
  }

  function finishScrub(nextPosition: number) {
    const media = mediaRef.current;
    if (!media) return;
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    try {
      media.currentTime = nextPosition;
      setPlayback((current) => ({ ...current, currentTime: nextPosition }));
    } catch {
      void releaseAudioLease();
      return;
    }
    if (shouldResume && appStateRef.current === 'active') {
      startPlaybackFromGesture('study-scrub-resume');
    }
  }

  function cancelScrub() {
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    if (shouldResume && appStateRef.current === 'active') {
      startPlaybackFromGesture('study-scrub-cancel');
    }
  }

  const audioFailed = !uri || playback.phase === 'error';
  const audioControllable = Boolean(uri && playback.phase !== 'error');
  const waitingForFirstFrame = playback.phase === 'starting';
  const playing = playback.phase === 'playing' || playback.phase === 'buffering';
  const displayDuration = playback.duration > 0 ? playback.duration : durationHint ?? 0;
  const canSeek = Boolean(uri && playback.metadataReady && displayDuration > 0 && !playback.error);
  const failureCopy = playback.error ? errorCopy(playback.error) : undefined;

  const speedControl = (
    <Pressable
      accessibilityLabel={`播放速度 ${speeds[speedIndex]} 倍`}
      accessibilityState={{
        disabled: integrated && !audioControllable,
        expanded: Boolean(speedMenuPosition),
      }}
      disabled={integrated && !audioControllable}
      onLayout={() => measureSpeedButton(false)}
      onPress={openSpeedMenu}
      ref={speedButtonRef}
      style={[
        styles.speed,
        integrated ? styles.integratedSpeed : null,
        integrated && !audioControllable ? styles.controlDisabled : null,
      ]}
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
                <AppText variant="button">{failureCopy?.title ?? '音频加载失败'}</AppText>
                <AppText variant="caption">{failureCopy?.detail ?? '原文与题目仍可继续学习。'}</AppText>
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
                disabled={!canSeek}
                duration={displayDuration}
                onInteractionChange={onSeekInteractionChange}
                onScrubCancel={cancelScrub}
                onScrubEnd={finishScrub}
                onScrubStart={beginScrub}
                position={playback.currentTime}
                testID="question-audio-timeline"
              />
            </View>
          )}

          <View style={styles.integratedControls} testID="integrated-audio-controls">
            <View style={styles.sideControl}>
              <Pressable
                accessibilityLabel={waitingForFirstFrame ? '音频正在启动' : playing ? '暂停' : '播放'}
                accessibilityState={{ disabled: !audioControllable || waitingForFirstFrame }}
                disabled={!audioControllable || waitingForFirstFrame}
                onPress={toggle}
                style={({ pressed }) => [
                  styles.integratedPlay,
                  !audioControllable ? styles.controlDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                {waitingForFirstFrame ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : playing ? (
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
                <AppText variant="button">{failureCopy?.title ?? '音频加载失败'}</AppText>
                <AppText variant="caption">{failureCopy?.detail ?? '原文与题目仍可继续学习。'}</AppText>
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
                accessibilityLabel={waitingForFirstFrame ? '音频正在启动' : playing ? '暂停' : '播放'}
                accessibilityState={{ disabled: waitingForFirstFrame }}
                disabled={waitingForFirstFrame}
                onPress={toggle}
                style={({ pressed }) => [styles.play, pressed ? styles.pressed : null]}
              >
                {waitingForFirstFrame ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : playing ? (
                  <Pause color={colors.primaryForeground} fill={colors.primaryForeground} size={18} />
                ) : (
                  <Play color={colors.primaryForeground} fill={colors.primaryForeground} size={18} style={styles.playIcon} />
                )}
              </Pressable>
              <View style={styles.timeline}>
                <AudioTimeline
                  blockedExternalGesture={blockedExternalGesture}
                  disabled={!canSeek}
                  duration={displayDuration}
                  onInteractionChange={onSeekInteractionChange}
                  onScrubCancel={cancelScrub}
                  onScrubEnd={finishScrub}
                  onScrubStart={beginScrub}
                  position={playback.currentTime}
                  testID="question-audio-timeline"
                />
              </View>
              {speedControl}
            </View>
          )}
        </>
      )}

      <AppModal
        animationType="fade"
        onRequestClose={closeSpeedMenu}
        transparent
        visible={Boolean(speedMenuPosition)}
      >
        <View style={styles.modalLayer}>
          <Pressable
            accessibilityLabel="关闭倍速选择"
            onPressIn={closeSpeedMenu}
            style={StyleSheet.absoluteFill}
          />
          {speedMenuPosition ? (
            <View
              accessibilityLabel="播放速度选项"
              style={[styles.speedMenu, speedMenuPosition]}
              testID="speed-menu"
            >
              {speeds.map((speed, index) => {
                const selected = index === speedIndex;
                return (
                  <Pressable
                    accessibilityLabel={`${speed} 倍`}
                    accessibilityState={{ selected }}
                    key={speed}
                    onPress={() => selectSpeed(index)}
                    style={[styles.speedOption, selected ? styles.speedOptionSelected : null]}
                  >
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
