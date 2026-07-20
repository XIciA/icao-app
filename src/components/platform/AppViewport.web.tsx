import { useMemo, type PropsWithChildren } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { colors } from '@/theme';

const CANVAS_WIDTH = 375;
const CANVAS_HEIGHT = 812;
const SHELL_BORDER = 10;
const SHELL_WIDTH = CANVAS_WIDTH + SHELL_BORDER * 2;
const SHELL_HEIGHT = CANVAS_HEIGHT + SHELL_BORDER * 2;
const STAGE_GUTTER = 12;

export function AppViewport({ children }: PropsWithChildren) {
  const viewport = useWindowDimensions();
  const scale = useMemo(() => Math.min(
    1,
    Math.max(0.1, (viewport.width - STAGE_GUTTER * 2) / SHELL_WIDTH),
    Math.max(0.1, (viewport.height - STAGE_GUTTER * 2) / SHELL_HEIGHT),
  ), [viewport.height, viewport.width]);

  return (
    <View style={styles.stage}>
      <View style={{ height: SHELL_HEIGHT * scale, width: SHELL_WIDTH * scale }}>
        <View style={[styles.shell, { transform: [{ scale }], transformOrigin: 'top left' }]}>
          <View style={styles.canvas}>{children}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    backgroundColor: colors.secondary,
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shell: {
    backgroundColor: '#090B10',
    borderRadius: 54,
    height: SHELL_HEIGHT,
    padding: SHELL_BORDER,
    width: SHELL_WIDTH,
  },
  canvas: {
    backgroundColor: colors.background,
    borderRadius: 44,
    flex: 1,
    overflow: 'hidden',
  },
});
