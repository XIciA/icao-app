import {
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Mic, Pause, Play, RotateCcw, ShieldAlert, Square, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { AppText, Button } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';
import { claimAudioSession, registerAudioOwner, releaseAudioSession } from '@/platform/audio-session-coordinator';
import type { LocalRecordingState } from '../hooks/useStudySession';
import { AudioTimeline } from './AudioTimeline';

// Use uncompressed PCM on iOS. On the physical iPhone/iOS 26.5 validation
// device, AVAudioRecorder's AAC encoder reports that it is recording but only
// writes its 0.09-second priming frames. PCM bypasses that encoder while the
// Android and web settings remain those of Expo's high-quality preset.
const VOICE_RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  bitRate: 256_000,
  isMeteringEnabled: true,
  numberOfChannels: 1,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    audioQuality: AudioQuality.HIGH,
    extension: '.wav',
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
    outputFormat: IOSOutputFormat.LINEARPCM,
    sampleRate: 16_000,
  },
};

const MIN_RECORDING_DURATION_MS = 400;
const MIN_RECORDING_BYTES = 10_000;
const PCM_BYTES_PER_MILLISECOND = 32;
const FILE_SETTLE_INTERVAL_MS = 100;
const PLAYBACK_LOAD_TIMEOUT_MS = 4_000;
const AUDIO_ROUTE_SETTLE_MS = 180;

type RecordingPhase = 'idle' | 'preparing' | 'recording' | 'finalizing' | 'validating' | 'ready' | 'error';

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function deleteLocalRecording(uri?: string) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best-effort; a native player may still be releasing the file.
  }
}

async function settledRecordingSize(uri: string) {
  let previous = -1;
  let stableReads = 0;
  let current = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(FILE_SETTLE_INTERVAL_MS);
    const file = new File(uri);
    if (!file.exists) return 0;
    current = file.size;
    if (current > 0 && current === previous) stableReads += 1;
    else stableReads = 0;
    if (stableReads >= 2) return current;
    previous = current;
  }
  return current;
}

function minimumExpectedBytes(reportedDurationMillis: number) {
  // iOS PCM is about 32 bytes/ms. Requiring only 20% leaves room for platform
  // encoders while still rejecting 4 KB headers and 0.09-second priming files.
  return Math.max(MIN_RECORDING_BYTES, Math.round(reportedDurationMillis * PCM_BYTES_PER_MILLISECOND * 0.2));
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SpeakingPracticePanel({
  mode,
  recording,
  onClear,
  onRecorded,
  onInteractionChange,
  interactionGesture,
  blockedExternalGesture,
  previewPauseRequest = 0,
  onPreviewPlaybackStart,
  onRecordingIntent,
  variant = 'default',
}: {
  mode: 'speaking' | 'retell';
  recording?: LocalRecordingState;
  onClear: () => void;
  onRecorded: (recording: LocalRecordingState) => void;
  onInteractionChange?: (active: boolean) => void;
  interactionGesture?: GestureType;
  blockedExternalGesture?: GestureType;
  previewPauseRequest?: number;
  onPreviewPlaybackStart?: () => void;
  onRecordingIntent?: () => void;
  variant?: 'default' | 'integrated';
}) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [candidate, setCandidate] = useState<LocalRecordingState>();
  const playbackUri = candidate?.uri ?? recording?.uri;
  // The source is supplied exactly once. useAudioPlayer recreates and releases
  // the native player when this URI changes; calling replace() as well races it.
  const playback = useAudioPlayer(playbackUri ?? null, { updateInterval: 100 });
  const playbackStatus = useAudioPlayerStatus(playback);
  const playbackStatusRef = useRef(playbackStatus);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<RecordingPhase>(recording ? 'ready' : 'idle');
  const [replacementMode, setReplacementMode] = useState(false);
  const startPromise = useRef<Promise<void> | null>(null);
  const stopPromise = useRef<Promise<void> | null>(null);
  const startGeneration = useRef(0);
  const pressHeld = useRef(false);
  const resolvedCandidate = useRef<string | undefined>(undefined);
  const replacementTargetUri = useRef<string | undefined>(undefined);
  const resumePreviewAfterScrub = useRef(false);
  const phaseRef = useRef<RecordingPhase>(phase);
  const recordingRef = useRef(recording);
  const interactionActive = ['preparing', 'recording', 'finalizing', 'validating'].includes(phase);

  playbackStatusRef.current = playbackStatus;
  phaseRef.current = phase;
  recordingRef.current = recording;

  const deleteUncommittedRecording = useCallback((uri?: string) => {
    if (!uri || uri === recordingRef.current?.uri || uri === replacementTargetUri.current) return;
    deleteLocalRecording(uri);
  }, []);

  const discardRecorderUri = useCallback(() => {
    try {
      deleteUncommittedRecording(recorder.uri ?? undefined);
    } catch {
      // The native recorder may already be released during cleanup.
    }
  }, [deleteUncommittedRecording, recorder]);

  useEffect(() => {
    onInteractionChange?.(interactionActive);
  }, [interactionActive, onInteractionChange]);

  useEffect(() => () => onInteractionChange?.(false), [onInteractionChange]);

  const restorePlaybackMode = useCallback(async () => {
    releaseAudioSession('recording');
    await claimAudioSession('recordingPlayback');
  }, []);

  useEffect(() => registerAudioOwner('recordingPlayback', () => {
    resumePreviewAfterScrub.current = false;
    playback.pause();
  }), [playback]);

  const cancelRecording = useCallback(async () => {
    pressHeld.current = false;
    startGeneration.current += 1;
    let nativeRecorderActive = false;
    try {
      nativeRecorderActive = recorder.isRecording;
    } catch {
      // Fast Refresh can release the native shared object before React cleanup.
    }
    const interrupted = nativeRecorderActive || ['preparing', 'recording', 'finalizing', 'validating'].includes(phaseRef.current);
    try {
      if (nativeRecorderActive) await recorder.stop();
    } catch {
      // The recorder may already have been interrupted by the OS.
    } finally {
      try {
        playback.pause();
      } catch {
        // The playback shared object can already be released during unmount.
      }
      resumePreviewAfterScrub.current = false;
      await restorePlaybackMode().catch(() => undefined);
      if (interrupted) {
        discardRecorderUri();
        setCandidate(undefined);
        if (recordingRef.current) {
          replacementTargetUri.current = undefined;
          setReplacementMode(false);
          setPhase('ready');
          setError(undefined);
        } else {
          setPhase('idle');
        }
      }
    }
  }, [discardRecorderUri, playback, recorder, restorePlaybackMode]);

  useEffect(() => {
    if (previewPauseRequest <= 0) return;
    resumePreviewAfterScrub.current = false;
    playback.pause();
  }, [playback, previewPauseRequest]);

  const rejectCandidate = useCallback((uri: string, message: string) => {
    const preservingExistingRecording = Boolean(replacementTargetUri.current && recordingRef.current);
    resolvedCandidate.current = uri;
    playback.pause();
    setCandidate(undefined);
    replacementTargetUri.current = undefined;
    setReplacementMode(false);
    setPhase(preservingExistingRecording ? 'ready' : 'error');
    setError(preservingExistingRecording ? '新录音无效，已保留原录音。' : message);
    setTimeout(() => deleteUncommittedRecording(uri), 0);
  }, [deleteUncommittedRecording, playback]);

  useEffect(() => {
    if (!candidate || resolvedCandidate.current === candidate.uri) return;
    if (playbackStatus.playbackState === 'error') {
      rejectCandidate(candidate.uri, '录音文件无法读取，请重新录制。');
      return;
    }
    if (!playbackStatus.isLoaded) return;
    const actualDurationMillis = Math.round(playbackStatus.duration * 1000);
    if (actualDurationMillis < MIN_RECORDING_DURATION_MS) {
      rejectCandidate(candidate.uri, '没有采集到有效录音内容，请重新录制。');
      return;
    }
    resolvedCandidate.current = candidate.uri;
    const previousUri = replacementTargetUri.current;
    onRecorded({ uri: candidate.uri, durationMillis: actualDurationMillis });
    setCandidate(undefined);
    replacementTargetUri.current = undefined;
    setReplacementMode(false);
    setError(undefined);
    setPhase('ready');
    if (previousUri && previousUri !== candidate.uri) setTimeout(() => deleteLocalRecording(previousUri), 0);
  }, [candidate, onRecorded, playbackStatus.duration, playbackStatus.isLoaded, playbackStatus.playbackState, rejectCandidate]);

  useEffect(() => {
    if (!playbackUri) return;
    const timeout = setTimeout(() => {
      if (playbackStatusRef.current.isLoaded) return;
      if (candidate) rejectCandidate(playbackUri, '录音文件加载超时，请重新录制。');
      else {
        playback.pause();
        onClear();
        setPhase('error');
        setError('本地录音已失效，请重新录制。');
        setTimeout(() => deleteLocalRecording(playbackUri), 0);
      }
    }, PLAYBACK_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [candidate, onClear, playback, playbackUri, rejectCandidate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void cancelRecording();
    });
    return () => {
      subscription.remove();
      void cancelRecording();
    };
  }, [cancelRecording]);

  function restoreCancelledStart() {
    if (variant === 'integrated') {
      replacementTargetUri.current = undefined;
      setReplacementMode(false);
      setPhase(recordingRef.current ? 'ready' : 'idle');
      return;
    }
    setPhase(replacementMode ? 'idle' : recordingRef.current ? 'ready' : 'idle');
  }

  async function startRecording() {
    const generation = startGeneration.current + 1;
    startGeneration.current = generation;
    setPhase('preparing');
    setError(undefined);
    const permission = await requestRecordingPermissionsAsync();
    if (generation !== startGeneration.current || !pressHeld.current) {
      restoreCancelledStart();
      return;
    }
    if (!permission.granted) {
      setPermissionDenied(true);
      const preservingExistingRecording = Boolean(replacementTargetUri.current && recordingRef.current);
      replacementTargetUri.current = undefined;
      setReplacementMode(false);
      setPhase(preservingExistingRecording ? 'ready' : 'error');
      setError(preservingExistingRecording ? '未获得麦克风权限，已保留原录音。' : '需要麦克风权限才能录音。');
      return;
    }
    setPermissionDenied(false);
    try {
      playback.pause();
      await claimAudioSession('recording');
      await wait(AUDIO_ROUTE_SETTLE_MS);
      if (generation !== startGeneration.current || !pressHeld.current) {
        await restorePlaybackMode().catch(() => undefined);
        discardRecorderUri();
        restoreCancelledStart();
        return;
      }
      await recorder.prepareToRecordAsync();
      if (generation !== startGeneration.current || !pressHeld.current) {
        await restorePlaybackMode().catch(() => undefined);
        discardRecorderUri();
        restoreCancelledStart();
        return;
      }
      if (variant === 'integrated' && replacementTargetUri.current) setReplacementMode(true);
      recorder.record();
      if (!recorder.isRecording) {
        throw new Error('Native audio recorder did not start');
      }
      setCandidate(undefined);
      setPhase('recording');
    } catch {
      await restorePlaybackMode().catch(() => undefined);
      discardRecorderUri();
      const preservingExistingRecording = Boolean(replacementTargetUri.current && recordingRef.current);
      replacementTargetUri.current = undefined;
      setReplacementMode(false);
      setPhase(preservingExistingRecording ? 'ready' : 'error');
      setError(preservingExistingRecording ? '重录启动失败，已保留原录音。' : '录音启动失败，请稍后重试。');
    }
  }

  function stopRecording() {
    if (stopPromise.current) return stopPromise.current;
    const operation = (async () => {
      setPhase('finalizing');
      let savedUri: string | undefined;
      try {
        // The hook update can lag one render behind the native recorder on a
        // physical iPhone. Capture the recorder's own clock before stopping,
        // then reconcile it with its final native status.
        const durationBeforeStop = Math.max(
          recorderState.durationMillis,
          Math.round(recorder.currentTime * 1000),
        );
        await recorder.stop();
        const finalStatus = recorder.getStatus();
        const duration = Math.max(durationBeforeStop, finalStatus.durationMillis);
        savedUri = finalStatus.url ?? recorder.uri ?? undefined;
        await restorePlaybackMode().catch(() => undefined);
        if (!savedUri || duration < MIN_RECORDING_DURATION_MS) throw new Error('recording_too_short');

        setPhase('validating');
        const fileSize = await settledRecordingSize(savedUri);
        if (fileSize < minimumExpectedBytes(duration)) throw new Error('recording_file_incomplete');

        resolvedCandidate.current = undefined;
        setCandidate({ uri: savedUri, durationMillis: duration });
      } catch {
        await restorePlaybackMode().catch(() => undefined);
        if (savedUri) deleteUncommittedRecording(savedUri);
        setCandidate(undefined);
        const preservingExistingRecording = Boolean(replacementTargetUri.current && recordingRef.current);
        replacementTargetUri.current = undefined;
        setReplacementMode(false);
        setPhase(preservingExistingRecording ? 'ready' : 'error');
        setError(preservingExistingRecording ? '没有生成有效的新录音，已保留原录音。' : '没有生成有效录音文件，请重新录制。');
      }
    })().finally(() => { stopPromise.current = null; });
    stopPromise.current = operation;
    return operation;
  }

  async function togglePlayback() {
    if (!recording?.uri) return;
    try {
      if (playbackStatus.playing) {
        playback.pause();
        return;
      }
      await claimAudioSession('recordingPlayback');
      if (!playbackStatus.isLoaded) {
        setError('录音正在准备回放，请稍候再试。');
        return;
      }
      if (playbackStatus.didJustFinish || playbackStatus.currentTime >= playbackStatus.duration) {
        await playback.seekTo(0);
      }
      onPreviewPlaybackStart?.();
      playback.play();
    } catch {
      setError('录音回放失败，请重新录制。');
    }
  }

  async function retryPermission() {
    const permission = await requestRecordingPermissionsAsync();
    setPermissionDenied(!permission.granted);
  }

  function beginReplacement() {
    if (!recording) return;
    playback.pause();
    resumePreviewAfterScrub.current = false;
    replacementTargetUri.current = recording.uri;
    setReplacementMode(true);
    setError(undefined);
    setPhase('idle');
  }

  function cancelReplacement() {
    playback.pause();
    resumePreviewAfterScrub.current = false;
    replacementTargetUri.current = undefined;
    setCandidate(undefined);
    setReplacementMode(false);
    setError(undefined);
    setPhase(recording ? 'ready' : 'idle');
  }

  function beginPreviewScrub() {
    resumePreviewAfterScrub.current = playbackStatus.playing;
    if (playbackStatus.playing) playback.pause();
  }

  async function finishPreviewScrub(nextPosition: number) {
    const shouldResume = resumePreviewAfterScrub.current;
    resumePreviewAfterScrub.current = false;
    await playback.seekTo(nextPosition);
    if (!shouldResume || AppState.currentState !== 'active') return;
    await claimAudioSession('recordingPlayback');
    onPreviewPlaybackStart?.();
    playback.play();
  }

  function cancelPreviewScrub() {
    const shouldResume = resumePreviewAfterScrub.current;
    resumePreviewAfterScrub.current = false;
    if (!shouldResume || AppState.currentState !== 'active') return;
    void claimAudioSession('recordingPlayback').then(() => {
      onPreviewPlaybackStart?.();
      playback.play();
    });
  }

  const isRecording = phase === 'recording';
  const isBusy = phase === 'preparing' || phase === 'finalizing' || phase === 'validating';
  const integratedHasRecording = variant === 'integrated' && Boolean(recording && !candidate);
  const recordLabel = phase === 'preparing'
    ? '正在准备麦克风…'
    : phase === 'finalizing' || phase === 'validating'
      ? '正在保存录音…'
      : isRecording
        ? `松开结束 · ${formatDuration(recorderState.durationMillis)}`
        : replacementMode || integratedHasRecording
          ? '按住重录'
          : '按住说话';
  const recordAccessibilityLabel = isRecording
    ? '松开结束录音'
    : replacementMode || integratedHasRecording
      ? '按住重新录音'
      : mode === 'retell'
        ? '按住开始复述'
        : '按住说话';
  const recordButton = (
    <Pressable
      accessibilityLabel={recordAccessibilityLabel}
      disabled={isBusy}
      onPressIn={() => {
        playback.pause();
        resumePreviewAfterScrub.current = false;
        if (variant === 'integrated' && recording && !replacementTargetUri.current) replacementTargetUri.current = recording.uri;
        else if (replacementMode && !replacementTargetUri.current) replacementTargetUri.current = recording?.uri;
        onRecordingIntent?.();
        onInteractionChange?.(true);
        pressHeld.current = true;
        startPromise.current = wait(0).then(startRecording);
      }}
      onPressOut={() => {
        pressHeld.current = false;
        void (async () => { await startPromise.current; if (recorder.isRecording) await stopRecording(); })();
      }}
      style={[styles.recordButton, variant === 'integrated' ? styles.integratedRecordButton : null, isRecording ? styles.recording : null, isBusy ? styles.recordButtonBusy : null]}
      testID={variant === 'integrated' ? 'integrated-record-button' : undefined}
    >
      {isRecording ? <Square color={colors.primaryForeground} fill={colors.primaryForeground} size={17} /> : <Mic color={colors.primaryForeground} size={18} />}
      <AppText color={colors.primaryForeground} numberOfLines={1} style={variant === 'integrated' ? styles.integratedRecordLabel : null} variant="button">{recordLabel}</AppText>
    </Pressable>
  );

  if (variant === 'integrated') {
    const playbackDisabled = !recording || !playbackStatus.isLoaded || isRecording || isBusy || replacementMode;
    return (
      <View style={styles.integratedRoot} testID="integrated-speaking-practice">
        <View style={styles.integratedControlRow}>
          {interactionGesture ? <GestureDetector gesture={interactionGesture}>{recordButton}</GestureDetector> : recordButton}
          <View style={styles.integratedSideControl}>
            <Pressable
              accessibilityLabel={playbackStatus.playing ? '暂停我的录音' : '回放我的录音'}
              accessibilityState={{ disabled: playbackDisabled }}
              disabled={playbackDisabled}
              onPress={() => void togglePlayback()}
              style={({ pressed }) => [styles.integratedPlaybackButton, playbackDisabled ? styles.playbackPending : null, pressed ? styles.pressed : null]}
            >
              {playbackStatus.playing ? (
                <Pause color={colors.primary} size={17} />
              ) : (
                <RotateCcw color={playbackDisabled ? colors.mutedForeground : colors.primary} size={17} />
              )}
            </Pressable>
            <AppText color={playbackDisabled ? colors.mutedForeground : colors.foreground} variant="micro">{playbackStatus.playing ? '暂停' : '回放'}</AppText>
          </View>
        </View>

        {permissionDenied && (!recording || replacementMode) ? (
          <View style={styles.integratedNotice}>
            <ShieldAlert color={colors.accent} size={18} />
            <View style={styles.permissionCopy}>
              <AppText variant="button">需要麦克风权限</AppText>
              <AppText variant="caption">允许后即可录制；其它学习内容仍可正常使用。</AppText>
            </View>
            <Button onPress={() => void retryPermission()} size="sm" variant="outline">重试</Button>
          </View>
        ) : null}

        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
      </View>
    );
  }

  if (permissionDenied && (!recording || replacementMode)) {
    return (
      <View style={styles.permission}>
        <ShieldAlert color={colors.accent} size={21} />
        <View style={styles.permissionCopy}>
          <AppText variant="button">需要麦克风权限</AppText>
          <AppText variant="caption">允许后即可录制；题目、原文和参考答案仍可正常学习。</AppText>
          <View style={styles.permissionActions}>
            <Button onPress={() => void retryPermission()} size="sm" variant="outline">重试</Button>
            {replacementMode ? <Button onPress={cancelReplacement} size="sm" variant="ghost">保留原录音</Button> : null}
          </View>
        </View>
      </View>
    );
  }

  const showResultCard = Boolean(recording && !replacementMode && !candidate && !isBusy && !isRecording);

  return (
    <View style={styles.root}>
      {!showResultCard ? (interactionGesture ? <GestureDetector gesture={interactionGesture}>{recordButton}</GestureDetector> : recordButton) : null}

      {replacementMode && !isRecording && !isBusy ? (
        <View style={styles.replacementNote}>
          <AppText style={styles.replacementCopy} variant="caption">原录音会保留至新录音成功</AppText>
          <Pressable accessibilityLabel="取消重新录音" onPress={cancelReplacement} style={styles.cancelReplacement}>
            <X color={colors.mutedForeground} size={14} />
            <AppText variant="caption">取消</AppText>
          </Pressable>
        </View>
      ) : null}

      {showResultCard && recording ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <View style={styles.resultTitle}>
              <Mic color={colors.primary} size={16} />
              <AppText variant="button">我的录音</AppText>
              <AppText style={styles.duration} variant="micro">{formatDuration(recording.durationMillis)}</AppText>
            </View>
            <Pressable accessibilityLabel="重新录音" onPress={beginReplacement} style={styles.rerecordButton}>
              <RotateCcw color={colors.mutedForeground} size={14} />
              <AppText variant="caption">重录</AppText>
            </Pressable>
          </View>
          <View style={styles.playbackRow}>
            <Pressable accessibilityLabel={playbackStatus.playing ? '暂停我的录音' : '播放我的录音'} disabled={!playbackStatus.isLoaded} onPress={() => void togglePlayback()} style={[styles.playbackButton, !playbackStatus.isLoaded ? styles.playbackPending : null]}>
              {playbackStatus.playing ? <Pause color={colors.primary} size={17} /> : <Play color={colors.primary} fill={colors.primary} size={17} />}
            </Pressable>
            <AudioTimeline
              accessibilityLabel="我的录音播放进度"
              blockedExternalGesture={blockedExternalGesture}
              disabled={!playbackStatus.isLoaded}
              duration={playbackStatus.duration || recording.durationMillis / 1000}
              onInteractionChange={onInteractionChange}
              onScrubCancel={cancelPreviewScrub}
              onScrubEnd={finishPreviewScrub}
              onScrubStart={beginPreviewScrub}
              position={playbackStatus.currentTime}
              testID="recording-audio-timeline"
            />
          </View>
          {!playbackStatus.isLoaded ? <AppText variant="caption">正在准备录音回放…</AppText> : null}
        </View>
      ) : null}

      {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  recordButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, flexDirection: 'row', gap: spacing[2], height: 48, justifyContent: 'center', width: '100%' },
  integratedRoot: { flex: 1, gap: spacing[2], minWidth: 0 },
  integratedControlRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  integratedRecordButton: { flex: 1, minWidth: 0, paddingHorizontal: spacing[3], width: 'auto' },
  integratedRecordLabel: { flexShrink: 1, textAlign: 'center' },
  integratedSideControl: { alignItems: 'center', gap: spacing[1], width: 44 },
  integratedPlaybackButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.primary, borderRadius: radii.full, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  integratedNotice: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2], paddingTop: spacing[1] },
  recordButtonBusy: { opacity: 0.7 },
  recording: { backgroundColor: colors.destructive },
  resultCard: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xl, borderWidth: 1, gap: spacing[2], padding: spacing[3], ...shadows.card },
  resultHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  resultTitle: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[1.5] },
  duration: { color: colors.mutedForeground, fontFamily: fonts.monoRegular },
  playbackRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  playbackButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  playbackPending: { opacity: 0.45 },
  rerecordButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 36, paddingHorizontal: spacing[2.5] },
  replacementNote: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  replacementCopy: { flex: 1 },
  cancelReplacement: { alignItems: 'center', flexDirection: 'row', gap: spacing[1], minHeight: 36, paddingHorizontal: spacing[2] },
  permission: { alignItems: 'flex-start', backgroundColor: 'rgba(183,118,16,0.08)', borderRadius: radii.xl, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
  permissionCopy: { flex: 1 },
  permissionActions: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] },
  pressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
});
