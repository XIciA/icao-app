import { maskChinaMobile, normalizeChinaMobile } from '@icao/contracts';
import * as AppleAuthentication from 'expo-apple-authentication';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { MessageCircle } from '@/components/ui/icons';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, radii, spacing } from '@/theme';

import { AuthField, AuthHeading, AuthShell, Checkbox, CodeField, Divider, PasswordField, TextLink } from './auth-ui';

type EntryView = 'login' | 'recovery';
type LoginMethod = 'otp' | 'password';
type CodePurpose = 'login' | 'recovery';

const RESEND_INTERVAL_MS = 60_000;

export function loginErrorMessage(code: string) {
  switch (code) {
    case 'invalid_phone_number': return '请输入正确的中国大陆手机号。';
    case 'invalid_phone_otp': return '验证码错误或已过期，请重新输入。';
    case 'invalid_phone_password': return '密码需为10–64位，并同时包含字母和数字。';
    case 'invalid_phone_or_password': return '手机号或密码不正确，请重新输入。';
    case 'phone_account_not_found': return '暂时无法发送验证码，请检查手机号或稍后重试。';
    case 'phone_not_confirmed': return '暂时无法完成密码登录，请改用验证码验证或稍后重试。';
    case 'phone_otp_rate_limited': return '验证码请求过于频繁，请稍后再试。';
    case 'phone_auth_unavailable': return '手机号登录暂时不可用，请稍后再试。';
    case 'apple_auth_unavailable': return '当前设备暂不支持 Apple 登录。';
    case 'apple_auth_failed':
    case 'apple_identity_token_missing': return 'Apple 登录未完成，请稍后重试。';
    case 'wechat_auth_unavailable': return '微信登录尚未完成平台配置，请稍后再试。';
    case 'wechat_not_installed': return '当前设备未安装微信，请先安装微信或改用手机号登录。';
    case 'wechat_authorization_invalid':
    case 'wechat_auth_failed': return '微信登录未完成，请稍后重试。';
    case 'social_auth_cancelled': return '已取消登录。';
    case 'social_auth_unavailable': return '该登录方式暂时不可用，请改用其他方式。';
    case 'auth_network_error': return '网络连接失败，请检查网络后重试。';
    case 'auth_service_unavailable': return '认证服务暂时不可用，请稍后重试。';
    case 'auth_session_storage_unavailable': return '设备无法安全保存登录状态，请检查存储权限后重试。';
    case 'auth_request_not_completed': return '登录请求未完成，请稍后重试。';
    case 'auth_not_configured': return '登录服务尚未配置。';
    default: return '登录失败，请稍后重试。';
  }
}

export function LoginScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const auth = useAuth();
  const [entryView, setEntryView] = useState<EntryView>(mode === 'recovery' ? 'recovery' : 'login');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('otp');
  const [codePurpose, setCodePurpose] = useState<CodePurpose>();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendDeadline, setResendDeadline] = useState(0);
  const [clockNow, setClockNow] = useState(() => Date.now());

  useEffect(() => {
    if (!resendDeadline) return undefined;
    const timer = setInterval(() => {
      const next = Date.now();
      setClockNow(next);
      if (next >= resendDeadline) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [resendDeadline]);

  const remainingSeconds = Math.max(0, Math.ceil((resendDeadline - clockNow) / 1000));

  function updatePhone(value: string) {
    const digits = value.replace(/\D/gu, '');
    setPhone((digits.startsWith('86') && digits.length > 11 ? digits.slice(2) : digits).slice(0, 11));
  }

  function startCountdown() {
    const now = Date.now();
    setClockNow(now);
    setResendDeadline(now + RESEND_INTERVAL_MS);
  }

  function showLogin(method: LoginMethod = loginMethod) {
    setEntryView('login');
    setLoginMethod(method);
    setCodePurpose(undefined);
    setCode('');
    setPassword('');
    setError('');
  }

  function showCode(purpose: CodePurpose) {
    setCodePurpose(purpose);
    setCode('');
    setError('');
    startCountdown();
  }

  function showError(value: unknown) {
    const errorCode = value instanceof Error ? value.message : 'auth_failed';
    setError(loginErrorMessage(errorCode));
  }

  function requireConsent() {
    if (accepted) return true;
    setError('请确认已满14周岁，并同意用户协议与隐私政策。');
    return false;
  }

  function validatePhone() {
    if (normalizeChinaMobile(phone)) return true;
    setError('请输入正确的中国大陆手机号。');
    return false;
  }

  function enterApp() {
    router.replace((auth.consumePendingPath() ?? '/(tabs)') as Href);
  }

  async function socialLogin(provider: 'apple' | 'wechat') {
    if (!requireConsent()) return;
    setError('');
    setSubmitting(true);
    try {
      if (provider === 'apple') await auth.signInWithApple();
      else await auth.signInWithWechat();
      enterApp();
    } catch (value) {
      showError(value);
    } finally {
      setSubmitting(false);
    }
  }

  async function requestLoginCode() {
    if (!validatePhone() || !requireConsent()) return;
    setError('');
    setSubmitting(true);
    try {
      await auth.requestPhoneOtp(phone);
      showCode('login');
    } catch (value) {
      showError(value);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPasswordLogin() {
    if (!validatePhone()) return;
    if (!password) { setError('请输入登录密码。'); return; }
    setError('');
    setSubmitting(true);
    try {
      await auth.signInWithPhonePassword(phone, password);
      setPassword('');
      enterApp();
    } catch (value) {
      showError(value);
    } finally {
      setSubmitting(false);
    }
  }

  async function requestRecoveryCode() {
    if (!validatePhone()) return;
    setError('');
    setSubmitting(true);
    try {
      await auth.requestPasswordRecoveryOtp(phone);
      showCode('recovery');
    } catch (value) {
      showError(value);
    } finally {
      setSubmitting(false);
    }
  }

  async function resendCode() {
    if (!codePurpose || remainingSeconds > 0) return;
    setError('');
    setSubmitting(true);
    try {
      if (codePurpose === 'recovery') await auth.requestPasswordRecoveryOtp(phone);
      else await auth.requestPhoneOtp(phone);
      setCode('');
      startCountdown();
    } catch (value) {
      showError(value);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode() {
    if (!codePurpose) return;
    if (!/^\d{6}$/u.test(code)) { setError('请输入6位短信验证码。'); return; }
    setError('');
    setSubmitting(true);
    try {
      await auth.verifyPhoneOtp(phone, code, codePurpose);
      if (codePurpose === 'recovery') router.replace('/account/password?mode=recovery');
      else enterApp();
    } catch (value) {
      showError(value);
    } finally {
      setSubmitting(false);
    }
  }

  function changePhone() {
    const purpose = codePurpose;
    setCodePurpose(undefined);
    setCode('');
    setError('');
    setResendDeadline(0);
    setEntryView(purpose === 'recovery' ? 'recovery' : 'login');
  }

  if (codePurpose) {
    const recovery = codePurpose === 'recovery';
    return (
      <AuthShell>
        <AuthHeading title={recovery ? '验证手机号' : '输入验证码'} subtitle={`验证码已发送至 ${maskChinaMobile(normalizeChinaMobile(phone))}`} />
        <View style={styles.form}>
          <CodeField onChangeText={(value) => setCode(value.replace(/\D/gu, '').slice(0, 6))} value={code} />
          <AppText variant="caption">验证码5分钟内有效，请勿转发给他人。</AppText>
          {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
          <Button disabled={submitting || code.length !== 6} loading={submitting} onPress={() => void verifyCode()} size="lg">
            {recovery ? '继续重置密码' : '验证并进入'}
          </Button>
          <Button disabled={submitting || remainingSeconds > 0} onPress={() => void resendCode()} variant="outline">
            {remainingSeconds > 0 ? `${remainingSeconds} 秒后可重新获取` : '重新获取验证码'}
          </Button>
          <Button disabled={submitting} onPress={changePhone} variant="ghost">更换手机号</Button>
        </View>
        <ScopeNote />
      </AuthShell>
    );
  }

  if (entryView === 'recovery') {
    return (
      <AuthShell>
        <AuthHeading title="重置密码" subtitle="验证已绑定手机号后，为同一个账号设置新密码" />
        <View style={styles.form}>
          <PhoneField onChangeText={updatePhone} value={phone} />
          <AppText variant="caption">找回密码不会为未知手机号创建新账号。</AppText>
          {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
          <Button disabled={submitting} loading={submitting} onPress={() => void requestRecoveryCode()} size="lg">获取重置验证码</Button>
          <View style={styles.inlineLinks}><TextLink label="返回密码登录" onPress={() => showLogin('password')} /></View>
        </View>
        <ScopeNote />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading title="登录 / 注册" subtitle="选择一种方式继续你的 ICAO 备考进度" />
      <View style={styles.socialSection}>
        <Button
          disabled={submitting}
          leading={<MessageCircle color="#FFFFFF" size={19} />}
          onPress={() => void socialLogin('wechat')}
          size="lg"
          style={styles.wechatButton}
        >
          微信登录
        </Button>
        {Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            cornerRadius={radii.md}
            onPress={() => { if (!submitting) void socialLogin('apple'); }}
            style={styles.appleButton}
            testID="apple-sign-in"
          />
        ) : null}
      </View>
      <Divider label="或使用手机号" />
      <LoginMethodTabs method={loginMethod} onChange={(method) => { setLoginMethod(method); setPassword(''); setError(''); }} />
      <View style={styles.form}>
        <PhoneField onChangeText={updatePhone} value={phone} />
        {loginMethod === 'otp' ? (
          <>
            <AppText variant="caption">未注册手机号验证成功后会自动创建账号。</AppText>
            {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
            <Button disabled={submitting} loading={submitting} onPress={() => void requestLoginCode()} size="lg">获取验证码</Button>
          </>
        ) : (
          <>
            <PasswordField label="登录密码" onChangeText={setPassword} placeholder="请输入登录密码" value={password} />
            <View style={styles.endLink}><TextLink label="忘记密码" onPress={() => { setEntryView('recovery'); setError(''); }} /></View>
            {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
            <Button disabled={submitting} loading={submitting} onPress={() => void submitPasswordLogin()} size="lg">密码登录</Button>
          </>
        )}
        <Checkbox checked={accepted} label="我已年满14周岁，并同意用户协议与隐私政策" onPress={() => setAccepted((value) => !value)} />
        <LegalLinks router={router} />
      </View>
      <AppText style={styles.scopeNote} variant="caption">微信或 Apple 登录后可直接进入，手机号可稍后在账号安全中绑定。</AppText>
    </AuthShell>
  );
}

function PhoneField({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return <AuthField autoCapitalize="none" keyboardType="phone-pad" label="中国大陆手机号" maxLength={14} onChangeText={onChangeText} placeholder="请输入11位手机号" prefix="+86" value={value} />;
}

function LoginMethodTabs({ method, onChange }: { method: LoginMethod; onChange: (method: LoginMethod) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.methodTabs}>
      {(['otp', 'password'] as const).map((item) => {
        const selected = item === method;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item}
            onPress={() => onChange(item)}
            style={[styles.methodTab, selected && styles.methodTabSelected]}
          >
            <AppText color={selected ? colors.primary : colors.mutedForeground} variant="button">{item === 'otp' ? '验证码登录' : '密码登录'}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function LegalLinks({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={styles.legalLinks}>
      <TextLink label="查看用户协议" onPress={() => router.push('/legal/agreement')} />
      <AppText variant="micro">·</AppText>
      <TextLink label="查看隐私政策" onPress={() => router.push('/legal/privacy')} />
    </View>
  );
}

function ScopeNote() {
  return <AppText style={styles.scopeNote} variant="caption">手机号仅支持中国大陆 +86；iOS 与 Android 共用同一业务账号。</AppText>;
}

const styles = StyleSheet.create({
  socialSection: { gap: spacing[3], marginTop: spacing[6] },
  wechatButton: { backgroundColor: '#07C160', borderColor: '#07C160' },
  appleButton: { height: 48, width: '100%' },
  methodTabs: { backgroundColor: colors.secondary, borderRadius: radii.lg, flexDirection: 'row', gap: spacing[1], padding: spacing[1] },
  methodTab: { alignItems: 'center', borderRadius: radii.md, flex: 1, minHeight: 42, justifyContent: 'center' },
  methodTabSelected: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  form: { gap: spacing[4], marginTop: spacing[5] },
  inlineLinks: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], justifyContent: 'center' },
  endLink: { alignItems: 'flex-end' },
  legalLinks: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  scopeNote: { marginTop: spacing[6], textAlign: 'center' },
});
