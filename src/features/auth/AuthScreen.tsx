import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, MessageSquareCode, Plane, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button, Screen, TextField } from '@/components/ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { colors, fonts, radii, spacing } from '@/theme';

type AuthSlug = 'splash' | 'login' | 'register' | 'phone-code' | 'forgot-password';

export function AuthScreen() {
  const { slug } = useLocalSearchParams<{ slug: AuthSlug }>();
  const page: AuthSlug = ['splash', 'login', 'register', 'phone-code', 'forgot-password'].includes(slug) ? slug : 'login';
  if (page === 'splash') return <Splash />;
  if (page === 'login') return <Login />;
  if (page === 'register') return <Register />;
  if (page === 'phone-code') return <PhoneCode />;
  return <ForgotPassword />;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Screen keyboard scroll contentStyle={styles.screen}>
      <SoftGlow intensity={0.9} size={350} style={styles.glow} />
      <Pressable accessibilityLabel="返回" hitSlop={10} onPress={router.back} style={styles.back}>
        <ArrowLeft color={colors.foreground} size={19} />
      </Pressable>
      {children}
    </Screen>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.heading}><AppText variant="pageTitle">{title}</AppText><AppText variant="caption">{subtitle}</AppText></View>;
}

function Splash() {
  const router = useRouter();
  return (
    <Screen contentStyle={styles.splash}>
      <SoftGlow intensity={0.9} size={350} style={styles.glow} />
      <View style={styles.splashMain}>
        <BrandMark large />
        <AppText style={styles.brandName} variant="pageTitle">飞猪 ICAO</AppText>
        <AppText color={colors.primary} style={styles.brandEnglish} variant="micro">AVIATION ENGLISH</AppText>
        <AppText style={styles.slogan} variant="caption">在职飞行员一站一站学，助你稳稳拿下{`\n`}ICAO 4 级</AppText>
      </View>
      <View style={styles.actions}>
        <Button onPress={() => router.replace('/auth/login')} size="lg">登录</Button>
        <Button onPress={() => router.push('/auth/register')} size="lg" variant="outline">注册新账号</Button>
        <LegalLinks />
      </View>
    </Screen>
  );
}

function Login() {
  const router = useRouter();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  function submit() {
    if (!account.trim() || password.length < 6) { setError('请输入账号和至少 6 位密码'); return; }
    router.replace('/(tabs)/profile');
  }
  return (
    <AuthShell>
      <Heading title="欢迎回来" subtitle="登录以继续你的 ICAO 备考进度" />
      <View style={styles.form}>
        <TextField keyboardType="phone-pad" label="手机号 / 账号" onChangeText={setAccount} placeholder="请输入手机号或账号" value={account} />
        <TextField label="密码" onChangeText={setPassword} placeholder="请输入密码" secureTextEntry={!visible} trailing={<EyeButton visible={visible} onPress={() => setVisible(!visible)} />} value={password} />
        <View style={styles.inline}><CheckControl checked={remember} label="记住我" onPress={() => setRemember(!remember)} /><TextLink label="忘记密码？" onPress={() => router.push('/auth/forgot-password')} /></View>
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button onPress={submit} size="lg">登录</Button>
      </View>
      <Divider label="其他方式" />
      <View style={styles.horizontalPad}><Button leading={<MessageSquareCode color={colors.primary} size={16} />} onPress={() => router.push('/auth/phone-code')} size="lg" variant="outline">验证码登录</Button></View>
      <View style={styles.bottomLink}><AppText variant="caption">还没有账号？ </AppText><TextLink label="立即注册" onPress={() => router.push('/auth/register')} /></View>
    </AuthShell>
  );
}

function Register() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const ready = agree && phone.length >= 11 && code.length >= 4 && password.length >= 6 && password === confirm;
  return (
    <AuthShell>
      <Heading title="创建账号" subtitle="填写手机号即可开启 ICAO 学习之旅" />
      <View style={styles.form}>
        <PhoneField onChangeText={setPhone} value={phone} />
        <CodeInput onChangeText={setCode} value={code} />
        <TextField label="设置密码" onChangeText={setPassword} placeholder="8-20 位，含字母和数字" secureTextEntry value={password} />
        <TextField label="确认密码" onChangeText={setConfirm} placeholder="请再次输入密码" secureTextEntry value={confirm} />
        <View style={styles.agreement}><CheckControl checked={agree} label="我已阅读并同意" onPress={() => setAgree(!agree)} /><TextLink label="《用户协议》" onPress={() => router.push('/info/agreement')} /><TextLink label="《隐私政策》" onPress={() => router.push('/info/privacy')} /></View>
        <Button disabled={!ready} onPress={() => router.replace('/(tabs)/profile')} size="lg">注册</Button>
      </View>
      <View style={styles.bottomLink}><Smartphone color={colors.mutedForeground} size={14} /><AppText variant="caption"> 已有账号？ </AppText><TextLink label="去登录" onPress={() => router.replace('/auth/login')} /></View>
    </AuthShell>
  );
}

function PhoneCode() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const ready = phone.length >= 11 && code.length === 6;
  return (
    <AuthShell>
      <Heading title="验证码登录" subtitle="未注册的手机号将自动创建账号" />
      <View style={styles.formWideGap}>
        <PhoneField onChangeText={setPhone} value={phone} />
        <View style={styles.codeGroup}>
          <View style={styles.inline}><AppText variant="button">短信验证码</AppText><AppText variant="caption">已发送至 138****8888</AppText></View>
          <Pressable style={styles.codeBoxes}>
            {Array.from({ length: 6 }).map((_, index) => <View key={index} style={[styles.codeBox, index === Math.min(code.length, 5) && styles.codeBoxActive]}><AppText style={styles.codeDigit}>{code[index] ?? ''}</AppText></View>)}
            <TextInput accessibilityLabel="短信验证码" keyboardType="number-pad" maxLength={6} onChangeText={setCode} style={styles.hiddenCode} value={code} />
          </Pressable>
          <AppText variant="caption">没有收到？ <AppText color={colors.primary} variant="caption">重新获取（59s）</AppText></AppText>
        </View>
        <Button leading={<KeyRound color={colors.primaryForeground} size={16} />} disabled={!ready} onPress={() => router.replace('/(tabs)/profile')} size="lg">登录 / 注册</Button>
      </View>
      <Pressable accessibilityLabel="使用密码登录" onPress={() => router.replace('/auth/login')} style={styles.bottomLink}><Smartphone color={colors.mutedForeground} size={14} /><AppText variant="caption"> 使用密码登录</AppText></Pressable>
    </AuthShell>
  );
}

function ForgotPassword() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const ready = phone.length >= 11 && code.length >= 4 && password.length >= 6 && password === confirm;
  return (
    <AuthShell>
      <Heading title="找回账号" subtitle="验证手机号后即可重置登录密码" />
      <View style={styles.notice}><KeyRound color={colors.primary} size={16} /><AppText style={styles.flex} variant="caption">为保障账号安全，重置密码前完成手机号验证</AppText></View>
      <View style={styles.form}>
        <PhoneField onChangeText={setPhone} value={phone} />
        <CodeInput onChangeText={setCode} value={code} />
        <TextField label="新密码" onChangeText={setPassword} placeholder="8-20 位，含字母和数字" secureTextEntry value={password} />
        <TextField label="确认新密码" onChangeText={setConfirm} placeholder="请再次输入新密码" secureTextEntry value={confirm} />
        <Button disabled={!ready} onPress={() => router.replace('/auth/login')} size="lg">重置密码</Button>
      </View>
      <View style={styles.bottomLink}><AppText variant="caption">想起来了？ </AppText><TextLink label="返回登录" onPress={() => router.replace('/auth/login')} /></View>
    </AuthShell>
  );
}

function BrandMark({ large = false }: { large?: boolean }) { return <View style={[styles.brand, large && styles.brandLarge]}><Plane color={colors.primaryForeground} size={large ? 30 : 22} style={{ transform: [{ rotate: '-45deg' }] }} /></View>; }
function PhoneField(props: { value: string; onChangeText: (value: string) => void }) { return <View style={styles.phoneField}><AppText variant="button">手机号</AppText><View style={styles.phoneInput}><AppText variant="caption">+86</AppText><TextInput keyboardType="phone-pad" maxLength={11} onChangeText={props.onChangeText} placeholder="请输入手机号" placeholderTextColor={colors.mutedForeground} style={styles.rawInput} value={props.value} /></View></View>; }
function CodeInput(props: { value: string; onChangeText: (value: string) => void }) { return <TextField keyboardType="number-pad" label="验证码" maxLength={6} onChangeText={props.onChangeText} placeholder="6 位验证码" trailing={<View style={styles.codeButton}><AppText color={colors.primary} variant="micro">获取验证码</AppText></View>} value={props.value} />; }
function EyeButton({ visible, onPress }: { visible: boolean; onPress: () => void }) { return <Pressable hitSlop={10} onPress={onPress}>{visible ? <EyeOff color={colors.mutedForeground} size={17} /> : <Eye color={colors.mutedForeground} size={17} />}</Pressable>; }
function CheckControl({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.checkControl}><View style={[styles.checkbox, checked && styles.checkboxChecked]}>{checked ? <Check color={colors.primaryForeground} size={12} /> : null}</View><AppText variant="caption">{label}</AppText></Pressable>; }
function TextLink({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress}><AppText color={colors.primary} variant="caption">{label}</AppText></Pressable>; }
function Divider({ label }: { label: string }) { return <View style={styles.divider}><View style={styles.line} /><AppText variant="micro">{label}</AppText><View style={styles.line} /></View>; }
function LegalLinks() { const router = useRouter(); return <View style={styles.legal}><AppText variant="micro">登录即代表同意 </AppText><TextLink label="《用户协议》" onPress={() => router.push('/info/agreement')} /><AppText variant="micro"> 与 </AppText><TextLink label="《隐私政策》" onPress={() => router.push('/info/privacy')} /></View>; }

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing[5], position: 'relative' }, glow: { right: -155, top: -175 }, back: { alignItems: 'center', height: 42, justifyContent: 'center', marginLeft: -spacing[2], marginTop: spacing[1], width: 42 }, heading: { gap: spacing[1.5], marginTop: spacing[1] }, form: { gap: spacing[4], marginTop: spacing[8] }, formWideGap: { gap: spacing[5], marginTop: spacing[8] }, inline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, horizontalPad: { marginTop: spacing[1] }, bottomLink: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingBottom: spacing[3], paddingTop: spacing[8] }, flex: { flex: 1 }, checkControl: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, checkbox: { alignItems: 'center', borderColor: colors.input, borderRadius: radii.sm, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 }, checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary }, divider: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], marginVertical: spacing[6] }, line: { backgroundColor: colors.border, flex: 1, height: 1 }, agreement: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] }, codeButton: { backgroundColor: colors.primary10, borderRadius: radii.full, paddingHorizontal: spacing[3], paddingVertical: spacing[1.5] }, phoneField: { gap: spacing[2] }, phoneInput: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing[2], minHeight: 48, paddingHorizontal: spacing[3.5] }, rawInput: { color: colors.foreground, flex: 1, fontFamily: fonts.sansRegular, fontSize: 14, paddingVertical: spacing[3] }, notice: { alignItems: 'center', backgroundColor: colors.primary10, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing[2], marginTop: spacing[5], padding: spacing[3] }, codeGroup: { gap: spacing[2] }, codeBoxes: { flexDirection: 'row', gap: spacing[2], position: 'relative' }, codeBox: { alignItems: 'center', aspectRatio: 1, backgroundColor: colors.card, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center' }, codeBoxActive: { borderColor: colors.primary, borderWidth: 2 }, codeDigit: { fontFamily: fonts.monoRegular, fontSize: 20 }, hiddenCode: { ...StyleSheet.absoluteFillObject, opacity: 0 }, splash: { paddingBottom: spacing[5], position: 'relative' }, splashMain: { alignItems: 'center', flex: 1, justifyContent: 'center' }, brand: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radii.full, height: 54, justifyContent: 'center', width: 54 }, brandLarge: { height: 68, width: 68 }, brandName: { marginTop: spacing[5] }, brandEnglish: { letterSpacing: 3, marginTop: spacing[2] }, slogan: { lineHeight: 21, marginTop: spacing[4], textAlign: 'center' }, actions: { gap: spacing[3] }, legal: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: spacing[1] },
});
