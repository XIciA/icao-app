import { Mic, Pause, Play, RotateCcw, ShieldAlert, Square, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { AppText, Button } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import type { RecordingAsset } from '../recording/types';
import { useRecordingPlayback } from '../recording/use-recording-playback';
import { useSpeakingRecordingController } from '../recording/use-speaking-recording-controller';
import { AudioTimeline } from './AudioTimeline';

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function recordingErrorMessage(error: ReturnType<typeof useSpeakingRecordingController>['error'], hasRecording: boolean) {
  if (!error) return undefined;
  if (!hasRecording) return error.message;
  if (error.code === 'microphone_permission_denied') return '未获得麦克风权限，已保留原录音。';
  return '新录音无效，已保留原录音。';
}

function playbackErrorMessage(error: ReturnType<typeof useRecordingPlayback>['error']) {
  if (error === 'asset_missing') return '本地录音文件已失效；答案和转写结果已保留，请重新录制。';
  if (error === 'playback_load_failed') return '录音回放准备失败，可以重试回放。';
  if (error === 'playback_start_failed') return '录音回放启动失败，可以重试。';
  return undefined;
}

export function SpeakingPracticePanel({
  blockedExternalGesture,
  cardId,
  interactionGesture,
  mode,
  onClear,
  onInteractionChange,
  onPreviewPlaybackStart,
  onRecorded,
  onRecordingIntent,
  previewPauseRequest = 0,
  recording,
  sessionId,
  variant = 'default',
}: {
  blockedExternalGesture?: GestureType;
  cardId: string;
  interactionGesture?: GestureType;
  mode: 'speaking' | 'retell';
  onClear: () => void;
  onInteractionChange?: (active: boolean) => void;
  onPreviewPlaybackStart?: () => void;
  onRecorded: (recording: RecordingAsset) => void;
  onRecordingIntent?: () => void;
  previewPauseRequest?: number;
  recording?: RecordingAsset;
  sessionId: string;
  variant?: 'default' | 'integrated';
}) {
  const controller = useSpeakingRecordingController({
    cardId,
    onClear,
    onInteractionChange,
    onRecorded,
    recording,
    sessionId,
  });
  const playback = useRecordingPlayback(controller.asset, previewPauseRequest);
  const isRecording = controller.phase === 'recording';
  const isBusy = ['requestingPermission', 'preparing', 'finalizing'].includes(controller.phase);
  const integratedHasRecording = variant === 'integrated' && Boolean(controller.asset);
  const error = recordingErrorMessage(controller.error, Boolean(controller.asset));
  const playbackError = playbackErrorMessage(playback.error);
  const recordLabel = controller.phase === 'requestingPermission' || controller.phase === 'preparing'
    ? '正在准备麦克风…'
    : controller.phase === 'finalizing'
      ? '正在保存录音…'
      : isRecording
        ? `松开结束 · ${formatDuration(controller.durationMillis)}`
        : controller.replacing || integratedHasRecording
          ? '按住重录'
          : '按住说话';
  const recordAccessibilityLabel = isRecording
    ? '松开结束录音'
    : controller.replacing || integratedHasRecording
      ? '按住重新录音'
      : mode === 'retell'
        ? '按住开始复述'
        : '按住说话';

  async function togglePlayback() {
    if (playback.status.playing) {
      playback.pause();
      return;
    }
    const started = await playback.play();
    if (started) onPreviewPlaybackStart?.();
  }

  const recordButton = (
    <Pressable
      accessibilityLabel={recordAccessibilityLabel}
      disabled={isBusy}
      onPressIn={() => {
        playback.pause();
        onRecordingIntent?.();
        onInteractionChange?.(true);
        controller.pressIn();
      }}
      onPressOut={() => { void controller.pressOut(); }}
      style={[styles.recordButton, variant === 'integrated' ? styles.integratedRecordButton : null, isRecording ? styles.recording : null, isBusy ? styles.recordButtonBusy : null]}
      testID={variant === 'integrated' ? 'integrated-record-button' : undefined}
    >
      {isRecording ? <Square color={colors.primaryForeground} fill={colors.primaryForeground} size={17} /> : <Mic color={colors.primaryForeground} size={18} />}
      <AppText color={colors.primaryForeground} numberOfLines={1} style={variant === 'integrated' ? styles.integratedRecordLabel : null} variant="button">{recordLabel}</AppText>
    </Pressable>
  );

  if (variant === 'integrated') {
    const retryable = Boolean(controller.asset && playback.error && !isRecording && !isBusy && !controller.replacing);
    const playbackDisabled = !controller.asset || isRecording || isBusy || controller.replacing || (!playback.status.isLoaded && !retryable);
    return (
      <View style={styles.integratedRoot} testID="integrated-speaking-practice">
        <View style={styles.integratedControlRow}>
          {interactionGesture ? <GestureDetector gesture={interactionGesture}>{recordButton}</GestureDetector> : recordButton}
          <View style={styles.integratedSideControl}>
            <Pressable
              accessibilityLabel={retryable ? '重试录音回放' : playback.status.playing ? '暂停我的录音' : '回放我的录音'}
              accessibilityState={{ disabled: playbackDisabled }}
              disabled={playbackDisabled}
              onPress={() => retryable ? playback.retry() : void togglePlayback()}
              style={({ pressed }) => [styles.integratedPlaybackButton, playbackDisabled ? styles.playbackPending : null, pressed ? styles.pressed : null]}
            >
              {playback.status.playing ? <Pause color={colors.primary} size={17} /> : <RotateCcw color={playbackDisabled ? colors.mutedForeground : colors.primary} size={17} />}
            </Pressable>
          </View>
        </View>

        {controller.permissionDenied && (!controller.asset || controller.replacing) ? (
          <View style={styles.integratedNotice}>
            <ShieldAlert color={colors.accent} size={18} />
            <View style={styles.permissionCopy}>
              <AppText variant="button">需要麦克风权限</AppText>
              <AppText variant="caption">允许后即可录制；其它学习内容仍可正常使用。</AppText>
            </View>
            <Button onPress={() => void controller.retryPermission()} size="sm" variant="outline">重试</Button>
          </View>
        ) : null}

        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        {playbackError ? <AppText color={colors.destructive} variant="caption">{playbackError}</AppText> : null}
      </View>
    );
  }

  if (controller.permissionDenied && (!controller.asset || controller.replacing)) {
    return (
      <View style={styles.permission}>
        <ShieldAlert color={colors.accent} size={21} />
        <View style={styles.permissionCopy}>
          <AppText variant="button">需要麦克风权限</AppText>
          <AppText variant="caption">允许后即可录制；题目、原文和参考答案仍可正常学习。</AppText>
          <View style={styles.permissionActions}>
            <Button onPress={() => void controller.retryPermission()} size="sm" variant="outline">重试</Button>
            {controller.replacing ? <Button onPress={controller.cancelReplacement} size="sm" variant="ghost">保留原录音</Button> : null}
          </View>
        </View>
      </View>
    );
  }

  const showResultCard = Boolean(controller.asset && !controller.replacing && !isBusy && !isRecording);

  return (
    <View style={styles.root}>
      {!showResultCard ? (interactionGesture ? <GestureDetector gesture={interactionGesture}>{recordButton}</GestureDetector> : recordButton) : null}

      {controller.replacing && !isRecording && !isBusy ? (
        <View style={styles.replacementNote}>
          <AppText style={styles.replacementCopy} variant="caption">原录音会保留至新录音成功</AppText>
          <Pressable accessibilityLabel="取消重新录音" onPress={controller.cancelReplacement} style={styles.cancelReplacement}>
            <X color={colors.mutedForeground} size={14} />
            <AppText variant="caption">取消</AppText>
          </Pressable>
        </View>
      ) : null}

      {showResultCard && controller.asset ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <View style={styles.resultTitle}>
              <Mic color={colors.primary} size={16} />
              <AppText variant="button">我的录音</AppText>
              <AppText style={styles.duration} variant="micro">{formatDuration(controller.asset.durationMillis)}</AppText>
            </View>
            <Pressable accessibilityLabel="重新录音" onPress={controller.beginReplacement} style={styles.rerecordButton}>
              <RotateCcw color={colors.mutedForeground} size={14} />
              <AppText variant="caption">重录</AppText>
            </Pressable>
          </View>
          <View style={styles.playbackRow}>
            <Pressable accessibilityLabel={playback.status.playing ? '暂停我的录音' : '播放我的录音'} disabled={!playback.status.isLoaded} onPress={() => void togglePlayback()} style={[styles.playbackButton, !playback.status.isLoaded ? styles.playbackPending : null]}>
              {playback.status.playing ? <Pause color={colors.primary} size={17} /> : <Play color={colors.primary} fill={colors.primary} size={17} />}
            </Pressable>
            <AudioTimeline
              accessibilityLabel="我的录音播放进度"
              blockedExternalGesture={blockedExternalGesture}
              disabled={!playback.status.isLoaded}
              duration={playback.status.duration || controller.asset.durationMillis / 1000}
              onInteractionChange={onInteractionChange}
              onScrubCancel={() => playback.cancelScrub(onPreviewPlaybackStart)}
              onScrubEnd={(position) => playback.finishScrub(position, onPreviewPlaybackStart)}
              onScrubStart={playback.beginScrub}
              position={playback.status.currentTime}
              testID="recording-audio-timeline"
            />
          </View>
          {!playback.status.isLoaded && !playback.error ? <AppText variant="caption">正在准备录音回放…</AppText> : null}
          {playback.error ? <Button onPress={playback.retry} size="sm" variant="outline">重试回放</Button> : null}
        </View>
      ) : null}

      {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
      {playbackError ? <AppText color={colors.destructive} variant="caption">{playbackError}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[2] },
  recordButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, flexDirection: 'row', gap: spacing[2], height: 46, justifyContent: 'center', width: '100%' },
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
