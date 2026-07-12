import { ReactNode, useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { colors, radii, shadows, spacing } from '@/theme';

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
      <View {...panResponder.panHandlers} style={[styles.primary, revealed ? null : styles.primaryCollapsed]}>{primary}</View>
      {revealed ? (
        <>
          <View style={styles.transcript}>{transcript}</View>
          <View style={styles.workbench}>{workbench}</View>
        </>
      ) : (
        <View pointerEvents="none" style={styles.collapsedLayers}>
          <View style={styles.collapsedTranscript} />
          <View style={styles.collapsedWorkbench} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[3], position: 'relative' },
  primary: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, flexShrink: 0, padding: spacing[3], zIndex: 3, ...shadows.card },
  primaryCollapsed: { marginBottom: spacing[8] },
  transcript: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, padding: spacing[4], zIndex: 2 },
  workbench: { backgroundColor: colors.card, borderColor: colors.primary20, borderRadius: radii.xxl, borderWidth: 1, zIndex: 1, ...shadows.card },
  collapsedLayers: { bottom: spacing[1], height: 58, left: 0, position: 'absolute', right: 0 },
  collapsedTranscript: { backgroundColor: colors.secondary, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, bottom: spacing[2], height: 50, left: spacing[1], position: 'absolute', right: spacing[1], ...shadows.card },
  collapsedWorkbench: { backgroundColor: colors.card, borderColor: colors.primary20, borderRadius: radii.xxl, borderWidth: 1, bottom: 0, height: 42, left: spacing[2], position: 'absolute', right: spacing[2], ...shadows.card },
});
