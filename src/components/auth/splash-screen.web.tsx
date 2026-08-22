import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Screen, Tag } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { isEdgeOneProductionWeb } from '@/config/web-runtime';
import { colors, spacing } from '@/theme';

import { BrandMark, TextLink } from './auth-ui';

export function SplashScreen() {
  const router = useRouter();
  const cloud = isEdgeOneProductionWeb();
  return (
    <Screen contentStyle={styles.splash}>
      <SoftGlow intensity={0.9} size={350} style={styles.glow} />
      <View style={styles.splashMain}>
        <BrandMark large />
        <AppText style={styles.brandName} variant="pageTitle">飞猪 ICAO</AppText>
        <AppText color={colors.primary} style={styles.brandEnglish} variant="micro">AVIATION ENGLISH</AppText>
        <Tag>{cloud ? '三端同步版' : 'Web 体验版'}</Tag>
        <AppText style={styles.slogan} variant="caption">
          {cloud ? <>与 iOS、Android 共用正式账号{'\n'}学习数据自动同步</> : <>对标 App 核心学习体验{'\n'}数据仅保存在当前浏览器</>}
        </AppText>
      </View>
      <View style={styles.actions}>
        <Button onPress={() => router.replace('/auth/login')} size="lg">{cloud ? '手机号登录 / 注册' : '输入邀请码进入'}</Button>
        <View style={styles.legal}>
          <AppText variant="micro">登录即代表同意 </AppText>
          <TextLink label="《用户协议》" onPress={() => router.push('/legal/agreement')} />
          <AppText variant="micro"> 与 </AppText>
          <TextLink label="《隐私政策》" onPress={() => router.push('/legal/privacy')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  splash: { paddingBottom: spacing[5], position: 'relative' },
  glow: { right: -155, top: -175 },
  splashMain: { alignItems: 'center', flex: 1, gap: spacing[2], justifyContent: 'center' },
  brandName: { marginTop: spacing[3] },
  brandEnglish: { letterSpacing: 3 },
  slogan: { lineHeight: 21, marginTop: spacing[2], textAlign: 'center' },
  actions: { gap: spacing[3] },
  legal: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: spacing[1] },
});
