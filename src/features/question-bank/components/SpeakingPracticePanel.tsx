import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Mic, Pause, Play, RotateCcw, ShieldAlert, Square } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SpeakingPracticePanel({
  mode,
  onRecorded,
}: {
  mode: 'speaking' | 'retell';
  onRecorded: (durationMillis: number) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const playback = useAudioPlayer(null, { updateInterval: 200 });
  const playbackStatus = useAudioPlayerStatus(playback);
  const [recordingUri, setRecordingUri] = useState<string>();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (recordingUri) playback.replace(recordingUri);
  }, [playback, recordingUri]);

  async function startRecording() {
    setError(undefined);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    try {
      playback.pause();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError('录音启动失败，请稍后重试。');
    }
  }

  async function stopRecording() {
    try {
      const duration = recorderState.durationMillis;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
      if (recorder.uri) {
        setRecordingUri(recorder.uri);
        onRecorded(duration);
      }
    } catch {
      setError('录音保存失败，请重新录制。');
    }
  }

  function togglePlayback() {
    if (!recordingUri) return;
    if (playbackStatus.playing) playback.pause();
    else {
      if (playbackStatus.didJustFinish) void playback.seekTo(0);
      playback.play();
    }
  }

  if (permissionDenied) {
    return (
      <View style={styles.permission}>
        <ShieldAlert color={colors.accent} size={21} />
        <View style={styles.permissionCopy}>
          <AppText variant="button">需要麦克风权限</AppText>
          <AppText variant="caption">允许后即可录制；题目、原文和参考答案仍可正常学习。</AppText>
        </View>
        <Button onPress={() => void startRecording()} size="sm" variant="outline">重试</Button>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <View style={styles.icon}><Mic color={colors.primary} size={18} /></View>
        <View style={styles.headingCopy}>
          <AppText variant="button">{mode === 'retell' ? '故事复述录音' : '口语作答录音'}</AppText>
          <AppText variant="micro">本地录音练习 · 当前阶段不上传、不调用 AI</AppText>
        </View>
      </View>

      <View style={styles.console}>
        <Pressable
          accessibilityLabel={recorderState.isRecording ? '停止录音' : '开始录音'}
          onPress={() => recorderState.isRecording ? void stopRecording() : void startRecording()}
          style={[styles.recordButton, recorderState.isRecording ? styles.recording : null]}
        >
          {recorderState.isRecording ? <Square color={colors.primaryForeground} fill={colors.primaryForeground} size={18} /> : <Mic color={colors.primaryForeground} size={20} />}
        </Pressable>
        <View style={styles.status}>
          <AppText color={recorderState.isRecording ? colors.destructive : colors.foreground} variant="button">
            {recorderState.isRecording ? '正在录音' : recordingUri ? '录音已保存在本机临时目录' : '点击开始录音'}
          </AppText>
          <AppText style={styles.duration} variant="micro">{formatDuration(recorderState.durationMillis)}</AppText>
        </View>
        {recordingUri ? (
          <Pressable accessibilityLabel={playbackStatus.playing ? '暂停我的录音' : '播放我的录音'} onPress={togglePlayback} style={styles.playbackButton}>
            {playbackStatus.playing ? <Pause color={colors.primary} size={18} /> : <Play color={colors.primary} fill={colors.primary} size={18} />}
          </Pressable>
        ) : null}
      </View>

      {recordingUri && !recorderState.isRecording ? (
        <Pressable accessibilityLabel="重新录音" onPress={() => void startRecording()} style={styles.retry}>
          <RotateCcw color={colors.mutedForeground} size={14} />
          <AppText variant="caption">重新录音</AppText>
        </Pressable>
      ) : null}
      {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.primary06, borderColor: colors.primary20, borderRadius: radii.xxl, borderWidth: 1, gap: spacing[3], padding: spacing[3] },
  heading: { alignItems: 'center', flexDirection: 'row', gap: spacing[2.5] },
  icon: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radii.lg, height: 36, justifyContent: 'center', width: 36 },
  headingCopy: { flex: 1 },
  console: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  recordButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 50, justifyContent: 'center', width: 50 },
  recording: { backgroundColor: colors.destructive },
  status: { flex: 1 },
  duration: { fontFamily: fonts.monoRegular, marginTop: spacing[1] },
  playbackButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.full, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  retry: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: spacing[1.5] },
  permission: { alignItems: 'flex-start', backgroundColor: 'rgba(183,118,16,0.08)', borderRadius: radii.xl, flexDirection: 'row', gap: spacing[2.5], padding: spacing[3] },
  permissionCopy: { flex: 1 },
});
