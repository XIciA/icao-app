import { useMemo, useRef, type ReactNode } from 'react';
import { PanResponder, StyleSheet, View, type PanResponderGestureState } from 'react-native';

export function startsEdgeBack(gesture: PanResponderGestureState, startX: number) {
  return gesture.numberActiveTouches === 1 && startX >= 0 && startX <= 24
    && gesture.dx > 12 && Math.abs(gesture.dy) < gesture.dx / 2;
}

export function completesEdgeBack(gesture: PanResponderGestureState) {
  return gesture.dx >= 80 && Math.abs(gesture.dy) < gesture.dx / 2;
}

/** Dispatch through React Navigation so local returns and pending saves can prevent removal. */
export function EdgeBackRegion({ children, enabled, navigation }: {
  children: ReactNode;
  enabled: boolean;
  navigation: { canGoBack(): boolean; goBack(): void };
}) {
  const startX = useRef(-1);
  const responder = useMemo(() => PanResponder.create({
    // PanResponder x0 is assigned only after grant; capture the initial touch separately.
    onStartShouldSetPanResponderCapture: event => { startX.current = event.nativeEvent.pageX; return false; },
    onMoveShouldSetPanResponderCapture: (_, gesture) => enabled && navigation.canGoBack() && startsEdgeBack(gesture, startX.current),
    onPanResponderRelease: (_, gesture) => {
      if (enabled && navigation.canGoBack() && completesEdgeBack(gesture)) navigation.goBack();
    },
    onPanResponderTerminationRequest: () => true,
  }), [enabled, navigation]);
  return <View style={styles.root} {...responder.panHandlers}>{children}</View>;
}
const styles = StyleSheet.create({ root: { flex: 1 } });
