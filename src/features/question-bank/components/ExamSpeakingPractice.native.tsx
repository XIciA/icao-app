import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { Mic, Square } from '@/components/ui/icons';
import { AppText, Button } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { SpeakingRecordingControllerHost, type SpeakingRecordingController } from '../recording/use-speaking-recording-controller';
import type { RecordingAsset } from '../recording/types';

type Props = { cardId: string; sessionId: string; recording?: RecordingAsset; onRecorded: (asset: RecordingAsset) => void; onClear: () => void; onInteractionChange?: (active: boolean) => void; onRecordingIntent?: () => void; interactionGesture?: GestureType };
export function ExamSpeakingPractice(props: Props) {
  return <SpeakingRecordingControllerHost cardId={props.cardId} sessionId={props.sessionId} recording={props.recording} onClear={props.onClear} onRecorded={props.onRecorded} onInteractionChange={props.onInteractionChange}>
    {(controller) => <ExamRecordingControl {...props} controller={controller} />}
  </SpeakingRecordingControllerHost>;
}
function ExamRecordingControl({ controller, onRecordingIntent, onInteractionChange, interactionGesture }: Props & { controller: SpeakingRecordingController }) {
  const recording = controller.phase === 'recording';
  const busy = ['requestingPermission', 'preparing', 'finalizing'].includes(controller.phase);
  const label = busy ? (controller.phase === 'finalizing' ? '正在保存…' : '正在准备…') : recording ? `点击停止 · ${Math.floor(controller.durationMillis / 1000)} 秒` : controller.asset ? '点击重录' : '开始录音';
  const control = <Pressable accessibilityRole="button" accessibilityLabel={recording ? '停止录音' : controller.asset ? '点击重新录音' : '开始录音'} disabled={busy} onPress={() => { if (busy) return; if (recording) { void controller.pressOut(); return; } onRecordingIntent?.(); onInteractionChange?.(true); controller.pressIn(); }} style={[styles.record, recording && styles.recording]}>
    {recording ? <Square color={colors.primaryForeground} size={18} /> : <Mic color={colors.primaryForeground} size={18} />}<AppText color={colors.primaryForeground} variant="button">{label}</AppText>
  </Pressable>;
  return <View style={styles.root}>{interactionGesture ? <GestureDetector gesture={interactionGesture}>{control}</GestureDetector> : control}
    {controller.error ? <AppText color={colors.destructive} variant="caption">{controller.permissionDenied ? '需要麦克风权限；也可以不作答，继续下一题。' : controller.asset ? '重录未完成，原录音已保留，可以重试或继续。' : '录音未完成，可以重试或继续下一题。'}</AppText> : controller.asset && !recording ? <AppText variant="caption">本题已录音 · {Math.floor(controller.asset.durationMillis / 1000)} 秒</AppText> : null}
    {controller.permissionDenied ? <Button variant="outline" size="sm" onPress={() => { void controller.retryPermission(); }}>重新授权麦克风</Button> : null}
  </View>;
}
const styles = StyleSheet.create({ root: { gap: spacing[2] }, record: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing[2], backgroundColor: colors.primary, minHeight: 48, borderRadius: radii.full, paddingHorizontal: spacing[4] }, recording: { backgroundColor: colors.destructive } });
