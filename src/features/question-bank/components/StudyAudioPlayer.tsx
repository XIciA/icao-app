import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { AlertCircle, Headphones, Pause, Play, RotateCcw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme';

const speeds = [0.75, 1, 1.25, 1.5];

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function StudyAudioPlayer({ uri, label, generatedAudio = false }: { uri?: string; label: string; generatedAudio?: boolean }) {
  const player = useAudioPlayer(null, { updateInterval: 250, preferredForwardBufferDuration: 10 });
  const status = useAudioPlayerStatus(player);
  const [speedIndex, setSpeedIndex] = useState(1);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
  }, []);

  useEffect(() => {
    player.pause();
    if (uri) player.replace(uri);
  }, [player, uri]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && player.playing) player.pause();
    });
    return () => subscription.remove();
  }, [player]);

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
    player.playbackRate = speeds[next];
  }

  function retry() {
    if (!uri) return;
    player.replace(uri);
    player.playbackRate = speeds[speedIndex];
    player.play();
  }

  const progress = status.duration ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;

  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Headphones color={colors.mutedForeground} size={14} />
        <AppText numberOfLines={1} style={styles.label} variant="caption">{label}</AppText>
      </View>

      {!uri && generatedAudio ? (
        <View style={styles.generated}>
          <Headphones color={colors.primary} size={18} />
          <View style={styles.errorCopy}>
            <AppText variant="button">生成语音预留</AppText>
            <AppText variant="caption">OPI 题目按既定方向使用生成语音，本阶段不捆绑本地问题音频。</AppText>
          </View>
        </View>
      ) : !uri || status.playbackState === 'error' ? (
        <View style={styles.error}>
          <AlertCircle color={colors.destructive} size={18} />
          <View style={styles.errorCopy}>
            <AppText variant="button">音频加载失败</AppText>
            <AppText variant="caption">原文与题目仍可继续学习。</AppText>
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
            disabled={!status.isLoaded && status.isBuffering}
            onPress={toggle}
            style={({ pressed }) => [styles.play, pressed ? styles.pressed : null]}
          >
            {!status.isLoaded && status.isBuffering ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : status.playing ? (
              <Pause color={colors.primaryForeground} fill={colors.primaryForeground} size={18} />
            ) : (
              <Play color={colors.primaryForeground} fill={colors.primaryForeground} size={18} style={styles.playIcon} />
            )}
          </Pressable>
          <View style={styles.timeline}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress}%` }]} />
            </View>
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
  playerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  play: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 42, justifyContent: 'center', width: 42 },
  playIcon: { marginLeft: 2 },
  timeline: { flex: 1 },
  track: { backgroundColor: colors.border, borderRadius: radii.full, height: 6, overflow: 'hidden' },
  fill: { backgroundColor: colors.primary, borderRadius: radii.full, height: '100%' },
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
