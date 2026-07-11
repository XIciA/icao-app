import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, KeyRound, Plane, ShieldCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TopBar } from '@/components/navigation/TopBar';
import { AppText, BottomSheet, Button, Card, Screen, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type AuthSlug = 'splash' | 'login' | 'register' | 'phone-code' | 'forgot-password';

const titles: Record<AuthSlug, string> = {
  splash: '欢迎使用',
  login: '登录',
  register: '创建账户',
  'phone-code': '手机验证码登录',
  'forgot-password': '找回密码',
};

export function AuthScreen() {
  const { slug } = useLocalSearchParams<{ slug: AuthSlug }>();
  const router = useRouter();
  const page = titles[slug] ? slug : 'login';
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const primaryLabel = useMemo(() => ({
    login: '登录演示账户', register: '注册演示账户', 'phone-code': '验证并登录', 'forgot-password': '发送重置说明', splash: '开始使用',
  })[page], [page]);

  function submit() {
    if (page === 'splash') { router.replace('/auth/login'); return; }
    if (page === 'phone-code' && (!phone.trim() || code.length < 4)) { setError('请输入手机号和至少 4 位验证码'); return; }
    if (page === 'forgot-password' && !email.includes('@')) { setError('请输入有效邮箱'); return; }
    if ((page === 'login' || page === 'register') && (!email.includes('@') || password.length < 6)) { setError('请输入有效邮箱和至少 6 位密码'); return; }
    setError(undefined);
    setMessage(page === 'forgot-password' ? '重置说明已在本机模拟生成，没有发送真实邮件。' : '认证流程模拟成功，没有创建或连接云端账户。');
  }

  if (page === 'splash') return (
    <Screen contentStyle={styles.splash}>
      <View style={styles.brand}><Plane color={colors.primary} size={38} /></View>
      <AppText color={colors.primary} variant="micro">AVIATION ENGLISH</AppText>
      <AppText style={styles.center} variant="pageTitle">让每一次通话都更清晰</AppText>
      <AppText style={styles.center}>围绕 ICAO 听力、口语、词汇和模拟考试建立你的学习闭环。</AppText>
      <View style={styles.grow} />
      <Button onPress={submit} size="lg">{primaryLabel}</Button>
      <Button onPress={() => router.replace('/(tabs)/profile')} variant="ghost">暂不登录</Button>
    </Screen>
  );

  return (
    <Screen keyboard scroll contentStyle={styles.screen}>
      <TopBar title={titles[page]} />
      <View style={styles.hero}><View style={styles.heroIcon}>{page === 'phone-code' ? <KeyRound color={colors.primary} size={26} /> : <ShieldCheck color={colors.primary} size={26} />}</View><AppText variant="pageTitle">{titles[page]}</AppText><AppText style={styles.center}>当前为认证交互演示，不发送验证码、不创建真实账户。</AppText></View>
      <Card style={styles.form}>
        {page === 'phone-code' ? <><TextField keyboardType="phone-pad" label="手机号" onChangeText={setPhone} placeholder="请输入手机号" value={phone} /><TextField keyboardType="number-pad" label="验证码" onChangeText={setCode} placeholder="演示验证码（任意 4 位）" value={code} /></> : <TextField autoCapitalize="none" keyboardType="email-address" label="邮箱" onChangeText={setEmail} placeholder="name@example.com" value={email} />}
        {page === 'login' || page === 'register' ? <TextField label="密码" onChangeText={setPassword} placeholder="至少 6 位" secureTextEntry value={password} /> : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button onPress={submit} size="lg">{primaryLabel}</Button>
      </Card>
      <View style={styles.links}>
        {page === 'login' ? <><Link label="手机验证码登录" onPress={() => router.push('/auth/phone-code')} /><Link label="忘记密码" onPress={() => router.push('/auth/forgot-password')} /><Link label="注册账户" onPress={() => router.push('/auth/register')} /></> : <Link label="返回登录" onPress={() => router.replace('/auth/login')} />}
      </View>
      <AppText style={styles.legal} variant="caption">继续即表示同意 <AppText color={colors.primary} onPress={() => router.push('/info/agreement')} variant="caption">用户协议</AppText> 与 <AppText color={colors.primary} onPress={() => router.push('/info/privacy')} variant="caption">隐私政策</AppText></AppText>
      <BottomSheet onClose={() => setMessage(undefined)} visible={Boolean(message)}><View style={styles.sheet}><CheckCircle2 color={colors.primary} size={36} /><AppText variant="sectionTitle">演示完成</AppText><AppText style={styles.center}>{message}</AppText><Button onPress={() => { setMessage(undefined); router.replace('/(tabs)/profile'); }} size="lg">返回我的</Button></View></BottomSheet>
    </Screen>
  );
}

function Link({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress}><AppText color={colors.primary} variant="button">{label}</AppText></Pressable>; }

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, splash: { alignItems: 'stretch', paddingBottom: spacing[6], paddingTop: spacing[20] }, brand: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.primary10, borderRadius: radii.xxl, height: 88, justifyContent: 'center', marginBottom: spacing[5], width: 88 }, center: { textAlign: 'center' }, grow: { flex: 1 }, hero: { alignItems: 'center', gap: spacing[2], padding: spacing[6] }, heroIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.xl, height: 56, justifyContent: 'center', width: 56 }, form: { gap: spacing[4], marginHorizontal: spacing[5] }, links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[5], justifyContent: 'center', padding: spacing[5] }, legal: { paddingHorizontal: spacing[6], textAlign: 'center' }, sheet: { alignItems: 'center', gap: spacing[3], paddingBottom: spacing[4] },
});
