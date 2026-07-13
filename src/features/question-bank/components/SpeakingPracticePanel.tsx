import {
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { Mic, Pause, Play, RotateCcw, ShieldAlert, Square } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { AppText, Button } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';
import type { LocalRecordingState } from '../hooks/useStudySession';

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
}: {
  mode: 'speaking' | 'retell';
  recording?: LocalRecordingState;
  onClear: () => void;
  onRecorded: (recording: LocalRecordingState) => void;
  onInteractionChange?: (active: boolean) => void;
  interactionGesture?: GestureType;
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
  const startPromise = useRef<Promise<void> | null>(null);
  const stopPromise = useRef<Promise<void> | null>(null);
  const startGeneration = useRef(0);
  const pressHeld = useRef(false);
  const resolvedCandidate = useRef<string | undefined>(undefined);
  const phaseRef = useRef<RecordingPhase>(phase);
  const interactionActive = ['preparing', 'recording', 'finalizing', 'validating'].includes(phase);

  playbackStatusRef.current = playbackStatus;
  phaseRef.current = phase;

  useEffect(() => {
    onInteractionChange?.(interactionActive);
  }, [interactionActive, onInteractionChange]);

  useEffect(() => () => onInteractionChange?.(false), [onInteractionChange]);

  const restorePlaybackMode = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: false, interruptionMode: 'doNotMix', playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
  }, []);

  const cancelRecording = useCallback(async () => {
    pressHeld.current = false;
    startGeneration.current += 1;
    const interrupted = recorder.isRecording || ['preparing', 'recording', 'finalizing', 'validating'].includes(phaseRef.current);
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // The recorder may already have been interrupted by the OS.
    } finally {
      await restorePlaybackMode().catch(() => undefined);
      if (interrupted) {
        deleteLocalRecording(recorder.uri ?? undefined);
        setCandidate(undefined);
        setPhase('idle');
      }
    }
  }, [recorder, restorePlaybackMode]);

  useEffect(() => {
    if (candidate) return;
    if (recording) setPhase('ready');
    else setPhase((current) => current === 'ready' ? 'idle' : current);
  }, [candidate, recording]);

  const rejectRecording = useCallback((uri: string, message: string) => {
    resolvedCandidate.current = uri;
    playback.pause();
    setCandidate(undefined);
    onClear();
    setPhase('error');
    setError(message);
    setTimeout(() => deleteLocalRecording(uri), 0);
  }, [onClear, playback]);

  useEffect(() => {
    if (!candidate || resolvedCandidate.current === candidate.uri) return;
    if (playbackStatus.playbackState === 'failed') {
      rejectRecording(candidate.uri, '录音文件无法读取，请重新录制。');
      return;
    }
    if (!playbackStatus.isLoaded) return;
    const actualDurationMillis = Math.round(playbackStatus.duration * 1000);
    if (actualDurationMillis < MIN_RECORDING_DURATION_MS) {
      rejectRecording(candidate.uri, '没有采集到有效录音内容，请重新录制。');
      return;
    }
    resolvedCandidate.current = candidate.uri;
    onRecorded({ uri: candidate.uri, durationMillis: actualDurationMillis });
    setCandidate(undefined);
    setError(undefined);
    setPhase('ready');
  }, [candidate, onRecorded, playbackStatus.duration, playbackStatus.isLoaded, playbackStatus.playbackState, rejectRecording]);

  useEffect(() => {
    if (!playbackUri) return;
    const timeout = setTimeout(() => {
      if (playbackStatusRef.current.isLoaded) return;
      if (candidate) rejectRecording(playbackUri, '录音文件加载超时，请重新录制。');
      else {
        playback.pause();
        onClear();
        setPhase('error');
        setError('本地录音已失效，请重新录制。');
        setTimeout(() => deleteLocalRecording(playbackUri), 0);
      }
    }, PLAYBACK_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [candidate, onClear, playback, playbackUri, rejectRecording]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void cancelRecording();
    });
    return () => {
      subscription.remove();
      void cancelRecording();
    };
  }, [cancelRecording]);

  async function startRecording() {
    const generation = startGeneration.current + 1;
    startGeneration.current = generation;
    setPhase('preparing');
    setError(undefined);
    const permission = await requestRecordingPermissionsAsync();
    if (generation !== startGeneration.current || !pressHeld.current) {
      setPhase(recording ? 'ready' : 'idle');
      return;
    }
    if (!permission.granted) {
      setPermissionDenied(true);
      setPhase('error');
      return;
    }
    setPermissionDenied(false);
    try {
      playback.pause();
      const previousUri = recording?.uri;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
      await wait(AUDIO_ROUTE_SETTLE_MS);
      if (generation !== startGeneration.current || !pressHeld.current) {
        await restorePlaybackMode().catch(() => undefined);
        setPhase('idle');
        return;
      }
      await recorder.prepareToRecordAsync();
      if (generation !== startGeneration.current || !pressHeld.current) {
        await restorePlaybackMode().catch(() => undefined);
        setPhase('idle');
        return;
      }
      recorder.record();
      if (!recorder.isRecording) {
        throw new Error('Native audio recorder did not start');
      }
      onClear();
      setCandidate(undefined);
      if (previousUri) setTimeout(() => deleteLocalRecording(previousUri), 0);
      setPhase('recording');
    } catch {
      await restorePlaybackMode().catch(() => undefined);
      deleteLocalRecording(recorder.uri ?? undefined);
      setPhase('error');
      setError('录音启动失败，请稍后重试。');
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
        if (savedUri) deleteLocalRecording(savedUri);
        onClear();
        setCandidate(undefined);
        setPhase('error');
        setError('没有生成有效录音文件，请重新录制。');
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
      await setAudioModeAsync({ allowsRecording: false, interruptionMode: 'doNotMix', playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
      if (!playbackStatus.isLoaded) {
        setError('录音正在准备回放，请稍候再试。');
        return;
      }
      if (playbackStatus.didJustFinish || playbackStatus.currentTime >= playbackStatus.duration) {
        await playback.seekTo(0);
      }
      playback.play();
    } catch {
      setError('录音回放失败，请重新录制。');
    }
  }

  async function retryPermission() {
    const permission = await requestRecordingPermissionsAsync();
    setPermissionDenied(!permission.granted);
  }

  function resetRecording() {
    playback.pause();
    const previousUri = recording?.uri;
    onClear();
    setCandidate(undefined);
    setPhase('idle');
    setError(undefined);
    if (previousUri) setTimeout(() => deleteLocalRecording(previousUri), 0);
  }

  const isRecording = phase === 'recording';
  const isBusy = phase === 'preparing' || phase === 'finalizing' || phase === 'validating';
  const recordLabel = phase === 'preparing'
    ? '正在准备录音…'
    : phase === 'finalizing'
      ? '正在保存录音…'
      : phase === 'validating'
        ? '正在校验录音…'
        : isRecording
          ? '松开结束'
          : '按住说话';
  const recordButton = (
    <Pressable
      accessibilityLabel={isRecording ? '松开结束录音' : mode === 'retell' ? '按住开始复述' : '按住说话'}
      disabled={isBusy}
      onPressIn={() => {
        onInteractionChange?.(true);
        pressHeld.current = true;
        startPromise.current = startRecording();
      }}
      onPressOut={() => {
        pressHeld.current = false;
        void (async () => { await startPromise.current; if (recorder.isRecording) await stopRecording(); })();
      }}
      style={[styles.recordButton, isRecording ? styles.recording : null, isBusy ? styles.recordButtonBusy : null]}
    >
      {isRecording ? <Square color={colors.primaryForeground} fill={colors.primaryForeground} size={17} /> : <Mic color={colors.primaryForeground} size={18} />}
      <AppText color={colors.primaryForeground} variant="button">{recordLabel}</AppText>
    </Pressable>
  );

  if (permissionDenied) {
    return (
      <View style={styles.permission}>
        <ShieldAlert color={colors.accent} size={21} />
        <View style={styles.permissionCopy}>
          <AppText variant="button">需要麦克风权限</AppText>
          <AppText variant="caption">允许后即可录制；题目、原文和参考答案仍可正常学习。</AppText>
        </View>
        <Button onPress={() => void retryPermission()} size="sm" variant="outline">重试</Button>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {interactionGesture ? <GestureDetector gesture={interactionGesture}>{recordButton}</GestureDetector> : recordButton}

      {recording ? <View style={styles.console}>
        <View style={styles.status}><AppText variant="caption">录音已保存在本机临时目录</AppText><AppText style={styles.duration} variant="micro">{formatDuration(recording.durationMillis)}</AppText></View>
        {recording ? (
          <Pressable accessibilityLabel={playbackStatus.playing ? '暂停我的录音' : '播放我的录音'} disabled={!playbackStatus.isLoaded} onPress={() => void togglePlayback()} style={[styles.playbackButton, !playbackStatus.isLoaded ? styles.playbackPending : null]}>
            {playbackStatus.playing ? <Pause color={colors.primary} size={18} /> : <Play color={colors.primary} fill={colors.primary} size={18} />}
          </Pressable>
        ) : null}
      </View> : null}

      {recording && !recorderState.isRecording ? (
        <Pressable accessibilityLabel="重新录音" onPress={resetRecording} style={styles.retry}>
          <RotateCcw color={colors.mutedForeground} size={14} />
          <AppText variant="caption">重新录音</AppText>
        </Pressable>
      ) : null}
      {recording && !playbackStatus.isLoaded ? <AppText variant="caption">正在准备本地录音回放…</AppText> : null}
      {phase === 'validating' ? <AppText variant="caption">正在校验录音文件与实际时长…</AppText> : null}
      {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  console: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  recordButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, flexDirection: 'row', gap: spacing[2], height: 48, justifyContent: 'center', width: '100%' },
  recordButtonBusy: { opacity: 0.7 },
  recording: { backgroundColor: colors.destructive },
  status: { flex: 1 },
  duration: { fontFamily: fonts.monoRegular, marginTop: spacing[1] },
  playbackButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  playbackPending: { opacity: 0.45 },
  retry: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: spacing[1.5] },
  permission: { alignItems: 'flex-start', backgroundColor: 'rgba(183,118,16,0.08)', borderRadius: radii.xl, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
  permissionCopy: { flex: 1 },
});
