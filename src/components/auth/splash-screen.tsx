import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, spacing } from '@/theme';
import { BrandMark, TextLink } from './auth-ui';

export function SplashScreen() {
  const router = useRouter();
  return (
    <Screen contentStyle={styles.splash}>
      <SoftGlow intensity={0.9} size={350} style={styles.glow} />
      <View style={styles.splashMain}>
        <BrandMark large />
        <AppText style={styles.brandName} variant="pageTitle">听你五个</AppText>
        <AppText color={colors.primary} style={styles.brandEnglish} variant="micro">READ YOU 5 · AVIATION ENGLISH</AppText>
        <AppText style={styles.slogan} variant="caption">在职飞行员一站一站学，助你稳稳拿下{'\n'}ICAO 4 级</AppText>
      </View>
      <View style={styles.actions}>
        <Button onPress={() => router.replace('/auth/login')} size="lg">登录 / 注册</Button>
        <LegalLinks />
      </View>
    </Screen>
  );
}

function LegalLinks() {
  const router = useRouter();
  return (
    <View style={styles.legal}>
      <AppText variant="micro">登录即代表同意 </AppText>
      <TextLink label="《用户协议》" onPress={() => router.push('/legal/agreement')} />
      <AppText variant="micro"> 与 </AppText>
      <TextLink label="《隐私政策》" onPress={() => router.push('/legal/privacy')} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { paddingBottom: spacing[5], position: 'relative' },
  glow: { right: -155, top: -175 },
  splashMain: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  brandName: { marginTop: spacing[5] },
  brandEnglish: { letterSpacing: 3, marginTop: spacing[2] },
  slogan: { lineHeight: 21, marginTop: spacing[4], textAlign: 'center' },
  actions: { gap: spacing[3] },
  legal: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: spacing[1] },
});
