import { ReactNode, useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';

import { colors, motion, radii, shadows, spacing } from '@/theme';

const cardLayoutTransition = LinearTransition
  .duration(motion.standard)
  .reduceMotion(ReduceMotion.System);

export function StudyCardStack({
  revealed,
  primary,
  transcript,
  workbench,
  onReveal,
  onCollapse,
}: {
  revealed: boolean;
  primary: ReactNode;
  transcript: ReactNode;
  workbench: ReactNode;
  onReveal: () => void;
  onCollapse: () => void;
}) {
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 45) onReveal();
      if (gesture.dy < -45) onCollapse();
    },
  }), [onCollapse, onReveal]);

  return (
    <View style={styles.root}>
      <Animated.View
        {...panResponder.panHandlers}
        layout={cardLayoutTransition}
        style={[styles.primary, revealed ? null : styles.primaryCollapsed]}
      >
        {primary}
      </Animated.View>
      {revealed ? (
        <>
          <Animated.View
            entering={FadeInDown.duration(motion.standard).reduceMotion(ReduceMotion.System)}
            exiting={FadeOutUp.duration(motion.quick).reduceMotion(ReduceMotion.System)}
            layout={cardLayoutTransition}
            style={styles.transcript}
          >
            {transcript}
          </Animated.View>
          <Animated.View
            entering={FadeInDown.delay(55).duration(motion.standard).reduceMotion(ReduceMotion.System)}
            exiting={FadeOutUp.duration(motion.quick).reduceMotion(ReduceMotion.System)}
            layout={cardLayoutTransition}
            style={styles.workbench}
          >
            {workbench}
          </Animated.View>
        </>
      ) : (
        <Animated.View
          entering={FadeIn.duration(motion.standard).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(motion.quick).reduceMotion(ReduceMotion.System)}
          pointerEvents="none"
          style={styles.collapsedLayers}
        >
          <View style={styles.collapsedTranscript} />
          <View style={styles.collapsedWorkbench} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4], position: 'relative' },
  primary: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, flexShrink: 0, padding: spacing[4], zIndex: 3, ...shadows.card },
  primaryCollapsed: { marginBottom: spacing[8] },
  transcript: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, padding: spacing[4], zIndex: 2 },
  workbench: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, zIndex: 1, ...shadows.card },
  collapsedLayers: { bottom: 0, height: spacing[12] + spacing[3], left: 0, position: 'absolute', right: 0 },
  collapsedTranscript: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, bottom: spacing[3], height: spacing[12], left: spacing[1], position: 'absolute', right: spacing[1], zIndex: 2, ...shadows.card },
  collapsedWorkbench: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, bottom: 0, height: spacing[12], left: spacing[2], position: 'absolute', right: spacing[2], zIndex: 1, ...shadows.card },
});
