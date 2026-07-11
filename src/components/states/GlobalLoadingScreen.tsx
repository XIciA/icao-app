import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';

import { AppText } from '../ui';

export function GlobalLoadingScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.mark}>
        <AppText color={colors.primary} style={styles.letter} variant="sectionTitle">
          ICAO
        </AppText>
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
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  letter: { fontSize: 15 },
});
