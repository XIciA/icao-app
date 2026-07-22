import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useWebLayout } from './web-layout';

export function AppContentFrame({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { contentWidth } = useWebLayout();
  return <View style={[style, styles.frame, { width: contentWidth }]} testID="app-content-frame">{children}</View>;
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'center' },
});
