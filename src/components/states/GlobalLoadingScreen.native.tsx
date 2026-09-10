import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { AppText } from '../ui';

export function GlobalLoadingScreen() {
  return (
    <View style={styles.root} testID="global-loading-screen">
      <ActivityIndicator color={colors.primary} size="small" testID="global-loading-spinner" />
      <AppText variant="caption">正在准备学习空间…</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing[4],
    justifyContent: 'center',
  },
});
