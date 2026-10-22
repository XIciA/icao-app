import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { AppUpdatePrompt } from '@/features/app-updates/AppUpdatePrompt';
import { nativeApplicationVersion } from 'expo-application';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppBrandLogo } from '@/components/brand/AppBrandLogo';
import { TopBar } from '@/components/navigation/TopBar';
import { AppText, Card, Screen } from '@/components/ui';
import { APP_DISPLAY_VERSION } from '@/config/app-version';
import { APP_FILING_NUMBER, APP_FILING_QUERY_URL } from '@/config/native-compliance';
import { colors, spacing } from '@/theme';

export function AboutPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  async function openFiling() {
    setError('');
    try { await Linking.openURL(APP_FILING_QUERY_URL); }
    catch { setError('暂时无法打开备案查询，请稍后重试。'); }
  }
  return (
    <Screen scroll>
      <TopBar title="关于听你五个" onBack={() => router.canGoBack() ? router.back() : router.replace('/account/settings')} />
      <View style={styles.content}>
        <View style={styles.brand}>
          <AppBrandLogo size="lg" />
          <AppText variant="sectionTitle">听你五个</AppText>
          <AppText>Read You 5</AppText>
          <AppText color={colors.mutedForeground}>版本 {nativeApplicationVersion || APP_DISPLAY_VERSION}</AppText>
        </View>
        <AppUpdatePrompt manual />
        <Card style={styles.details}>
          <AppText color={colors.mutedForeground} variant="caption">开发及运营主体</AppText>
          <AppText>云启航科（成都）科技有限公司</AppText>
          <Pressable accessibilityRole="link" accessibilityLabel={`查询 App 备案信息：${APP_FILING_NUMBER}`} onPress={() => void openFiling()} style={({ pressed }) => [styles.filing, pressed && { opacity: 0.7 }]}>
            <AppText color={colors.mutedForeground} variant="caption">App 备案号</AppText>
            <AppText color={colors.primary}>{APP_FILING_NUMBER}</AppText>
          </Pressable>
          {error ? <AppText accessibilityLiveRegion="polite" color={colors.destructive} variant="caption">{error}</AppText> : null}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[5], gap: spacing[6] },
  brand: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[6] },
  details: { padding: spacing[5], gap: spacing[3] },
  filing: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing[2], paddingTop: spacing[4], gap: spacing[2], minHeight: 48 },
});
