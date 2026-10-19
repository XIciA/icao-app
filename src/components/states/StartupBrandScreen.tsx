import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

const startedAt = Date.now();

/** Identical, precomposed artwork before and after the native splash handoff. */
export function StartupBrandScreen({ error, description, onRetry, busy = false }: { error?: string; description?: string; onRetry?: () => void; busy?: boolean } = {}) {
  const [showHint, setShowHint] = useState(Date.now() - startedAt >= 1500);
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(true), Math.max(0, 1500 - (Date.now() - startedAt)));
    return () => clearTimeout(timer);
  }, []);
  const size = Platform.OS === 'android' ? 216 : 320;
  return (
    <View style={styles.root} testID={error ? 'startup-recovery-screen' : 'global-loading-screen'}>
      <Image onLoad={() => { if (Platform.OS !== 'web') void SplashScreen.hideAsync().catch(() => undefined); }} accessibilityLabel="听你五个" resizeMode="contain"
        source={require('../../../assets/images/startup-brand.png')}
        style={{ width: size, height: size }} testID="startup-brand" />
      <View style={[styles.hint, { marginTop: size / 2 + 3, opacity: error || showHint ? 1 : 0 }]}
        accessibilityElementsHidden={!error && !showHint} importantForAccessibility={error || showHint ? 'auto' : 'no-hide-descendants'}>
        {error ? <>
          <Text accessibilityRole="header" style={styles.error}>{error}</Text>
          {description ? <Text style={[styles.caption, styles.description]}>{description}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={onRetry} style={styles.retry}>
            <Text style={styles.retryLabel}>{busy ? '正在检查…' : '重新尝试'}</Text>
          </Pressable>
        </> : <>
          <ActivityIndicator color={colors.primary} size="small" testID="global-loading-spinner" />
          <Text style={styles.caption}>正在打开…</Text>
        </>}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  hint: { position: 'absolute', top: '50%', alignItems: 'center', gap: 16 },
  error: { color: colors.foreground, fontSize: 15, fontWeight: '600' },
  description: { textAlign: 'center', maxWidth: 300 },
  retry: { backgroundColor: colors.primary, borderRadius: 13, paddingHorizontal: 32, paddingVertical: 12 },
  retryLabel: { color: colors.primaryForeground, fontSize: 14, fontWeight: '600' },
  caption: { color: colors.mutedForeground, fontSize: 12, lineHeight: 19 },
});
