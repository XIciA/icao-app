import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppBrandLogo } from '@/components/brand/AppBrandLogo';
import { colors, radii, spacing } from '@/theme';

import { AppText } from '../ui';

export function GlobalLoadingScreen() {
  return (
    <View style={styles.root} testID="global-loading-screen">
      <View style={styles.mark} testID="global-loading-mark">
        <AppBrandLogo accessibilityLabel="听你五个 App 标志" size="lg" testID="global-loading-logo" />
      </View>
      <ActivityIndicator color={colors.primary} size="small" />
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
  mark: {
    alignItems: 'center',
    backgroundColor: colors.primary10,
    borderRadius: radii.xl,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
});
