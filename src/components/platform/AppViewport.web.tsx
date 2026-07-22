import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { useWebLayout } from './web-layout';

export function AppViewport({ children }: PropsWithChildren) {
  const { mode } = useWebLayout();

  return (
    <View style={styles.root} testID={`app-viewport-${mode}`}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    flex: 1,
    overflow: 'hidden',
  },
});
