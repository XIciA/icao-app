import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from '../ui';

export const GLOBAL_LOADING_ICON_SOURCE = require('../../../assets/images/icon.png');

export function GlobalLoadingScreen() {
  return (
    <View style={styles.root} testID="global-loading-screen">
      <View style={styles.mark} testID="global-loading-mark">
        <Image
          accessibilityLabel="听你五个 App 图标"
          resizeMode="contain"
          source={GLOBAL_LOADING_ICON_SOURCE}
          style={styles.icon}
          testID="global-loading-icon"
        />
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
  icon: {
    borderRadius: radii.lg,
    height: 80,
    width: 80,
  },
});
