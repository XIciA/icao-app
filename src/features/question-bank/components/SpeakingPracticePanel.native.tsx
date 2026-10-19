import { GuideAnchor } from '@/features/usage-guide/GuideBindings';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Mic, Pause, Play, RotateCcw, ShieldAlert, Square, X } from '@/components/ui/icons';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { AppModal } from '@/components/platform/AppModal';
import { AppText, Button } from '@/components/ui';
import { colors, fonts, radii, shadows, spacing } from '@/theme';

import type { RecordingAsset } from '../recording/types';
import { useRecordingPlayback } from '../recording/use-recording-playback';
import {
  SpeakingRecordingControllerHost,
  type SpeakingRecordingController,
} from '../recording/use-speaking-recording-controller';
import { AudioTimeline } from './AudioTimeline';

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function recordingErrorMessage(
  error: SpeakingRecordingController['error'],
  hasRecording: boolean,
  isWeb: boolean,
) {
  if (!error) return undefined;
  if (isWeb) {
    const preserved = hasRecording ? '原录音已保留。' : '';
    switch (error.code) {
      case 'microphone_permission_denied':
        return `请在浏览器的网站设置中允许麦克风，然后重新检测。若网站设置已允许但仍无法录音，请使用推荐浏览器打开。${preserved}`;
      case 'microphone_device_missing':
        return `没有检测到可用麦克风，请连接或启用麦克风后重新检测。${preserved}`;
      case 'microphone_device_unavailable':
        return `麦克风暂时不可用，请结束通话、会议或其它录音页面后重试。${preserved}`;
      case 'recording_browser_unsupported':
        return `当前浏览器无法完成网页录音，请使用推荐浏览器继续。${preserved}`;
      case 'recording_interrupted':
        return `本次录音已停止，请让页面保持在前台后重试。${preserved}`;
      case 'recording_finalization_timeout':
        return `录音保存等待时间较长，请重新录制或使用推荐浏览器。${preserved}`;
      case 'recording_too_short':
        return `录音时间较短，请按住说完后再松开。${preserved}`;
      case 'recording_source_missing':
        return `没有找到这次录音文件，请重新录制。${preserved}`;
      case 'recording_container_invalid':
        return `这次录音格式无效，请重新录制。${preserved}`;
      case 'recording_file_incomplete':
        return `这次录音内容不完整，请重新录制。${preserved}`;
      case 'record_prepare_failed':
        return `麦克风尚未准备好，请确认没有其它页面占用后再试。${preserved}`;
      case 'record_start_failed':
        return `录音暂未开始，请重新点击录音；若仍无法使用，请切换推荐浏览器。${preserved}`;
      case 'record_stop_failed':
      case 'recording_commit_failed':
        return `这次录音暂未完整保存，请再试一次。${preserved}`;
      case 'recording_asset_missing':
        return '这段录音已不可回放，请重新录制；答案和转写结果仍会保留。';
      default:
        return `暂时未能完成录音，请重新尝试。${preserved}`;
    }
  }
  const diagnosticSuffix = error.diagnosticId ? `（诊断编号：${error.diagnosticId}）` : '';
  if (!hasRecording) return `${error.message}${diagnosticSuffix}`;
  if (error.code === 'microphone_permission_denied') return '未获得麦克风权限，已保留原录音。';
  return `新录音无效，已保留原录音。${diagnosticSuffix}`;
}

function playbackErrorMessage(error: ReturnType<typeof useRecordingPlayback>['error'], isWeb: boolean) {
  if (isWeb) {
    if (error === 'asset_missing') return '这段录音已不可回放，请重新录制；答案和转写结果仍会保留。';
    if (error === 'playback_load_failed' || error === 'playback_start_failed') return '录音回放暂未开始，请点击“重试回放”。';
    return undefined;
  }
  if (error === 'asset_missing') return '本地录音文件已失效；答案和转写结果已保留，请重新录制。';
  if (error === 'playback_load_failed') return '录音回放准备失败，可以重试回放。';
  if (error === 'playback_start_failed') return '录音回放启动失败，可以重试。';
  return undefined;
}

async function copyCurrentWebLink() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const link = window.location.href;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      return true;
    }
  } catch {
    // Fall back to the selection-based copy path used by older embedded browsers.
  }
  if (typeof document === 'undefined') return false;
  const input = document.createElement('textarea');
  try {
    input.value = link;
    input.setAttribute('readonly', '');
    input.style.left = '-9999px';
    input.style.position = 'fixed';
    document.body.appendChild(input);
    input.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    input.remove();
  }
}

type SpeakingPracticePanelProps = {
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
};

export function SpeakingPracticePanel(props: SpeakingPracticePanelProps) {
  return (
    <SpeakingRecordingControllerHost
      cardId={props.cardId}
      onClear={props.onClear}
      onInteractionChange={props.onInteractionChange}
      onRecorded={props.onRecorded}
      recording={props.recording}
      sessionId={props.sessionId}
    >
      {(controller) => <SpeakingPracticePanelContent {...props} controller={controller} />}
    </SpeakingRecordingControllerHost>
  );
}

function SpeakingPracticePanelContent({
  blockedExternalGesture,
  controller,
  interactionGesture,
  mode,
  onInteractionChange,
  onPreviewPlaybackStart,
  onRecordingIntent,
  previewPauseRequest = 0,
  variant = 'default',
}: SpeakingPracticePanelProps & { controller: SpeakingRecordingController }) {
  const router = useRouter();
  const isWeb = Platform.OS === 'web';
  const [copyLinkFeedback, setCopyLinkFeedback] = useState<string | undefined>(undefined);
  const playback = useRecordingPlayback(controller.asset, previewPauseRequest);
  const isRecording = controller.phase === 'recording';
  const isBusy = ['requestingPermission', 'preparing', 'finalizing'].includes(controller.phase);
  const integratedHasRecording = variant === 'integrated' && Boolean(controller.asset);
  const error = recordingErrorMessage(controller.error, Boolean(controller.asset), isWeb);
  const playbackError = playbackErrorMessage(playback.error, isWeb);
  const usePermissionPrimer = isWeb && (controller.permissionPrimerRequired || controller.permissionPrimerActive);
  const primingPermission = isWeb && controller.permissionPrimerActive;
  const recordButtonDisabled = primingPermission || isBusy;
  const recordLabel = primingPermission
    ? '正在等待麦克风授权…'
    : controller.phase === 'requestingPermission' || controller.phase === 'preparing'
    ? '正在准备麦克风…'
    : controller.phase === 'finalizing'
      ? '正在保存录音…'
      : isRecording
        ? `点击停止 · ${formatDuration(controller.durationMillis)}`
        : controller.permissionPrimerRequired
          ? '启用麦克风'
          : controller.replacing || integratedHasRecording
            ? '点击重录'
            : '开始录音';
  const recordAccessibilityLabel = usePermissionPrimer
    ? '启用麦克风'
    : isRecording
    ? '停止录音'
    : controller.replacing || integratedHasRecording
      ? '点击重新录音'
      : mode === 'retell'
        ? '点击开始复述'
        : '开始录音';

  async function togglePlayback() {
    if (playback.status.playing || playback.status.playbackState === 'starting') {
      playback.pause();
      return;
    }
    if (isWeb) onPreviewPlaybackStart?.();
    const started = await playback.play();
    if (started && !isWeb) onPreviewPlaybackStart?.();
  }

  async function copyLink() {
    const copied = await copyCurrentWebLink();
    setCopyLinkFeedback(copied
      ? '链接已复制，请在推荐浏览器中粘贴打开。'
      : '请复制浏览器地址栏中的链接，再到推荐浏览器打开。');
  }

  function openRecordingDiagnosticFeedback() {
    const correlationId = controller.error?.diagnosticId;
    if (!correlationId) return;
    router.push({
      pathname: '/info/[slug]',
      params: {
        slug: 'feedback',
        source: 'profile',
        sourceRoute: '/question-bank/study',
        feature: 'recording',
        correlationId,
      },
    });
  }

  const nativeDiagnosticError = !isWeb && error ? (
    <View style={styles.diagnosticError}>
      <AppText color={colors.destructive} style={styles.diagnosticErrorCopy} variant="caption">{error}</AppText>
      {controller.error?.diagnosticId ? <Button accessibilityLabel="提交录音诊断" onPress={openRecordingDiagnosticFeedback} size="sm" variant="ghost">提交诊断</Button> : null}
    </View>
  ) : null;

  const webNotice = isWeb && (controller.permissionPrimerWaiting || error) ? (
    <View style={[styles.webNotice, variant === 'integrated' ? styles.webNoticeIntegrated : null]}>
      <ShieldAlert color={colors.accent} size={18} />
      <View style={styles.webNoticeCopy}>
        {controller.permissionPrimerWaiting ? (
          <>
            <AppText variant="button">仍在等待浏览器授权</AppText>
            <AppText variant="caption">请在浏览器弹窗中选择“允许”；也可以先取消，继续学习其它内容。</AppText>
          </>
        ) : (
          <AppText variant="caption">{error}</AppText>
        )}
        <View style={styles.webNoticeActions}>
          {controller.permissionPrimerWaiting ? (
            <Button accessibilityLabel="取消麦克风授权等待" onPress={controller.cancelPermissionPrimer} size="sm" variant="outline">取消并继续学习</Button>
          ) : controller.permissionPrimerRequired && controller.error?.code !== 'recording_browser_unsupported' ? (
            <Button onPress={() => { void controller.primePermission(); }} size="sm" variant="outline">重新检测</Button>
          ) : null}
        </View>
      </View>
    </View>
  ) : null;

  const compatibilityModal = isWeb ? (
    <AppModal
      animationType="fade"
      onRequestClose={() => {
        setCopyLinkFeedback(undefined);
        controller.dismissCompatibility();
      }}
      transparent
      visible={controller.compatibilityVisible}
    >
      <View style={styles.compatibilityOverlay}>
        <View accessibilityLabel="网页录音兼容提示" accessibilityViewIsModal style={styles.compatibilityDialog}>
          <AppText variant="sectionTitle">当前浏览器暂不支持网页录音</AppText>
          <AppText>题目、音频原文和参考答案仍可正常使用。iPhone/iPad 请使用最新版 Safari；Android/Windows 请使用最新版 Chrome 或 Edge；Mac 可使用 Safari 或 Chrome。</AppText>
          <AppText color={colors.mutedForeground} variant="caption">如果当前是在微信、QQ 等应用内打开，也可点击右上角，在浏览器中打开。</AppText>
          {copyLinkFeedback ? <AppText color={colors.accent} variant="caption">{copyLinkFeedback}</AppText> : null}
          <Button onPress={() => { void copyLink(); }}>复制链接</Button>
          <Button
            onPress={() => {
              setCopyLinkFeedback(undefined);
              controller.dismissCompatibility();
            }}
            variant="outline"
          >
            继续学习
          </Button>
        </View>
      </View>
    </AppModal>
  ) : null;

  const recordButton = (
    <Pressable
      accessibilityLabel={recordAccessibilityLabel}
      accessibilityState={{ disabled: recordButtonDisabled }}
      disabled={recordButtonDisabled}
      onPress={() => {
        if (recordButtonDisabled) return;
        if (isRecording) {
          void controller.pressOut();
          return;
        }
        playback.pause();
        onRecordingIntent?.();
        onInteractionChange?.(true);
        if (usePermissionPrimer) void controller.primePermission();
        else controller.pressIn();
      }}
      style={[styles.recordButton, variant === 'integrated' ? styles.integratedRecordButton : null, isRecording ? styles.recording : null, isBusy ? styles.recordButtonBusy : null]}
      testID={variant === 'integrated' ? 'integrated-record-button' : undefined}
    >
      <GuideAnchor id="sentence-record" />{isRecording ? <Square color={colors.primaryForeground} fill={colors.primaryForeground} size={17} /> : <Mic color={colors.primaryForeground} size={18} />}
      <AppText color={colors.primaryForeground} numberOfLines={1} style={variant === 'integrated' ? styles.integratedRecordLabel : null} variant="button">{recordLabel}</AppText>
    </Pressable>
  );

  if (variant === 'integrated') {
    const retryable = Boolean(controller.asset && playback.error && !isRecording && !isBusy && !controller.replacing);
    const playbackDisabled = !controller.asset || isRecording || isBusy || controller.replacing || (!playback.status.isLoaded && !retryable);
    return (
      <>
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

          {!isWeb && controller.permissionDenied && (!controller.asset || controller.replacing) ? (
            <View style={styles.integratedNotice}>
              <ShieldAlert color={colors.accent} size={18} />
              <View style={styles.permissionCopy}>
                <AppText variant="button">需要麦克风权限</AppText>
                <AppText variant="caption">允许后即可录制；其它学习内容仍可正常使用。</AppText>
              </View>
              <Button onPress={() => void controller.retryPermission()} size="sm" variant="outline">重试</Button>
            </View>
          ) : null}

          {webNotice}
          {nativeDiagnosticError}
          {playbackError ? <AppText color={isWeb ? colors.accent : colors.destructive} variant="caption">{playbackError}</AppText> : null}
        </View>
        {compatibilityModal}
      </>
    );
  }

  if (!isWeb && controller.permissionDenied && (!controller.asset || controller.replacing)) {
    return (
      <View style={styles.permission}>
        <ShieldAlert color={colors.accent} size={21} />
        <View style={styles.permissionCopy}>
          <AppText variant="button">需要麦克风权限</AppText>
          <AppText variant="caption">允许后即可录制；题目、原文和参考答案仍可正常学习。</AppText>
          <View style={styles.permissionActions}>
            <Button onPress={() => void controller.retryPermission()} size="sm" variant="outline">重试</Button>
            {controller.error?.diagnosticId ? <Button accessibilityLabel="提交录音诊断" onPress={openRecordingDiagnosticFeedback} size="sm" variant="ghost">提交诊断</Button> : null}
            {controller.replacing ? <Button onPress={controller.cancelReplacement} size="sm" variant="ghost">保留原录音</Button> : null}
          </View>
        </View>
      </View>
    );
  }

  const showResultCard = Boolean(controller.asset && !controller.replacing && !isBusy && !isRecording);

  return (
    <>
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

        {webNotice}
        {nativeDiagnosticError}
        {playbackError ? <AppText color={isWeb ? colors.accent : colors.destructive} variant="caption">{playbackError}</AppText> : null}
      </View>
      {compatibilityModal}
    </>
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
  diagnosticError: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  diagnosticErrorCopy: { flex: 1, paddingTop: spacing[2] },
  playbackRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  playbackButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  playbackPending: { opacity: 0.45 },
  rerecordButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, flexDirection: 'row', gap: spacing[1.5], minHeight: 36, paddingHorizontal: spacing[2.5] },
  replacementNote: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  replacementCopy: { flex: 1 },
  cancelReplacement: { alignItems: 'center', flexDirection: 'row', gap: spacing[1], minHeight: 36, paddingHorizontal: spacing[2] },
  permission: { alignItems: 'flex-start', backgroundColor: 'rgba(183,118,16,0.08)', borderRadius: radii.xl, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
  permissionCopy: { flex: 1 },
  permissionActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[2] },
  webNotice: { alignItems: 'flex-start', backgroundColor: 'rgba(183,118,16,0.08)', borderColor: 'rgba(183,118,16,0.2)', borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  webNoticeIntegrated: { padding: spacing[2.5] },
  webNoticeCopy: { flex: 1, gap: spacing[1.5] },
  webNoticeActions: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  compatibilityOverlay: { alignItems: 'center', backgroundColor: colors.overlay, flex: 1, justifyContent: 'center', padding: spacing[5] },
  compatibilityDialog: { backgroundColor: colors.card, borderRadius: radii.xl, gap: spacing[4], maxWidth: 440, padding: spacing[5], width: '100%', ...shadows.card },
  pressed: { opacity: 0.75, transform: [{ scale: 0.95 }] },
});
