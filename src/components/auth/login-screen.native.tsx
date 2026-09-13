import { maskChinaMobile, normalizeChinaMobile } from '@icao/contracts';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppBrandLogo } from '@/components/brand/AppBrandLogo';
import { AppText, Button, Screen, TextField } from '@/components/ui';
import { useAuth, type LoginLegalDocuments } from '@/features/auth/AuthProvider';
import { builtinAppContent, loadLegalDocuments } from '@/features/app-content/repository.native';
import { LegalDocumentBody } from '@/features/app-content/LegalDocumentBody.native';
import { AppModal } from '@/components/platform/AppModal';
import { TopBar } from '@/components/navigation/TopBar';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { resolveLoginAgeCopy } from '@/features/auth/login-release-surface';
import { WECHAT_LOGIN_ENABLED } from '@/features/auth/wechat-release-capability';
import {
  beginPhoneOtpChallengeMutation,
  clearPhoneOtpChallenge,
  invalidatePhoneOtpChallengeMutation,
  phoneOtpChallenge,
  phoneOtpServerNow,
  readPhoneOtpChallenge,
  type PersistedPhoneOtpChallenge,
  writePhoneOtpChallenge,
} from '@/features/auth/phone-otp-challenge-store';
import { colors, radii, spacing } from '@/theme';

import { AuthField, AuthHeading, AuthShell, Checkbox, CodeField, Divider, PasswordField, TextLink } from './auth-ui-native';

type EntryView = 'login' | 'recovery';
type LoginMethod = 'otp' | 'password';

export function createAuthActionGate() {
  let active = false;
  return {
    begin() {
      if (active) return false;
      active = true;
      return true;
    },
    end() { active = false; },
  };
}

export function loginErrorMessage(code: string) {
  switch (code) {
    case 'invalid_phone_number': return '请输入正确的中国大陆手机号。';
    case 'invalid_phone_otp': return '验证码错误或已过期，请重新输入。';
    case 'invalid_phone_password': return '密码需为8–32位，并同时包含字母和数字。';
    case 'invalid_phone_or_password': return '手机号或密码不正确，请重新输入。';
    case 'phone_account_not_found': return '暂时无法发送验证码，请检查手机号或稍后重试。';
    case 'phone_not_confirmed': return '暂时无法完成密码登录，请改用验证码验证或稍后重试。';
    case 'phone_otp_rate_limited': return '验证码请求过于频繁，请稍后再试。';
    case 'phone_auth_unavailable': return '手机号登录暂时不可用，请稍后再试。';
    case 'apple_auth_unavailable': return '当前设备暂不支持 Apple 登录。';
    case 'apple_auth_failed':
    case 'apple_identity_token_missing': return 'Apple 登录未完成，请稍后重试。';
    case 'wechat_not_installed': return Platform.OS === 'ios' ? '微信未安装，请使用其他方式登录' : '当前设备未安装微信，请改用其他方式登录。';
    case 'wechat_status_unavailable': return '暂时无法检查微信状态，请重试或使用其他方式登录。';
    case 'wechat_auth_unavailable': return Platform.OS === 'ios' ? '当前微信暂不支持授权，请使用其他方式登录。' : '登录失败，请稍后重试。';
    case 'wechat_auth_configuration_mismatch': return Platform.OS === 'ios' ? '微信登录正在配置，请改用手机号或 Apple 登录。' : '登录失败，请稍后重试。';
    case 'wechat_auth_configuration_pending': return '微信登录正在配置，请改用手机号或 Apple 登录。';
    case 'wechat_auth_timeout': return '微信授权已超时，请重新登录。';
    case 'wechat_auth_failed':
    case 'invalid_wechat_auth_response': return '微信登录未完成，请重试或改用其他方式。';
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
  return <NativeScreenBoundary title="登录 / 注册" allowExit={false}><LoginContent /></NativeScreenBoundary>;
}

function LoginContent() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const auth = useAuth();
  const loginAgeCopy = resolveLoginAgeCopy(Platform.OS);
  const [wechatInstalled, setWechatInstalled] = useState(false);
  const wechatLoginVisible = WECHAT_LOGIN_ENABLED && (Platform.OS !== 'ios' || wechatInstalled);
  const thirdPartyLoginAvailable = Platform.OS === 'ios' || wechatLoginVisible;
  const [entryView, setEntryView] = useState<EntryView>(mode === 'recovery' ? 'recovery' : 'login');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('otp');
  const [challenge, setChallenge] = useState<PersistedPhoneOtpChallenge>();
  const [challengeRestoring, setChallengeRestoring] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const actionGateRef = useRef(createAuthActionGate());
  const challengeRequestRef = useRef(0);
  const wechatStatusRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const consentPromiseRef = useRef<Promise<boolean> | undefined>(undefined);
  const acceptedRef = useRef(false);
  const [legalDocuments, setLegalDocuments] = useState<LoginLegalDocuments>(builtinAppContent.legal);

  useEffect(() => {
    let active = true;
    void loadLegalDocuments().then(({ documents }) => {
      if (active && !acceptedRef.current) setLegalDocuments(documents);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const queryWechatAvailability = auth.isWechatSignInAvailable;
  const refreshWechatAvailability = useCallback(async () => {
    const generation = ++wechatStatusRequestRef.current;
    try {
      const installed = await queryWechatAvailability();
      if (mountedRef.current && generation === wechatStatusRequestRef.current) setWechatInstalled(installed);
      return installed;
    } catch {
      // Preserve a confirmed result on transient query failure. The click path
      // reports the failure and never starts authorization without a fresh check.
      throw new Error('wechat_status_unavailable');
    }
  }, [queryWechatAvailability]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !WECHAT_LOGIN_ENABLED || entryView !== 'login') return;
    void refreshWechatAvailability().catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshWechatAvailability().catch(() => undefined);
      else wechatStatusRequestRef.current += 1;
    });
    return () => {
      wechatStatusRequestRef.current += 1;
      subscription.remove();
    };
  }, [entryView, refreshWechatAvailability]);

  const codePurpose = challenge?.purpose;
  const resendDeadline = challenge?.resendAllowedAt ?? 0;

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void readPhoneOtpChallenge().then((restored) => {
      if (!active || !restored) return;
      setChallenge(restored);
      setPhone(restored.phone.slice(3));
      setEntryView(restored.purpose === 'recovery' ? 'recovery' : 'login');
      setLoginMethod('otp');
      setClockNow(Date.now());
    }).catch((value: unknown) => {
      if (active) setError(loginErrorMessage(value instanceof Error ? value.message : 'auth_session_storage_unavailable'));
    }).finally(() => {
      if (active) setChallengeRestoring(false);
    });
    return () => {
      active = false;
      mountedRef.current = false;
      challengeRequestRef.current += 1;
      invalidatePhoneOtpChallengeMutation();
    };
  }, []);

  useEffect(() => {
    const deadline = challenge?.expiresAt ?? resendDeadline;
    if (!deadline) return undefined;
    const timer = setInterval(() => {
      const next = Date.now();
      setClockNow(next);
      if ((challenge ? phoneOtpServerNow(challenge, next) : next) >= deadline) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [challenge, resendDeadline]);

  const remainingSeconds = Math.max(0, Math.ceil((resendDeadline - (challenge ? phoneOtpServerNow(challenge, clockNow) : clockNow)) / 1000));
  const challengeExpired = Boolean(challenge && phoneOtpServerNow(challenge, clockNow) >= challenge.expiresAt);

  function updatePhone(value: string) {
    const digits = value.replace(/\D/gu, '');
    const next = (digits.startsWith('86') && digits.length > 11 ? digits.slice(2) : digits).slice(0, 11);
    setPhone(next);
    if (challenge?.purpose === 'login' && normalizeChinaMobile(next) !== challenge.phone) {
      challengeRequestRef.current += 1;
      setChallenge(undefined);
      setCode('');
      void clearPhoneOtpChallenge().catch(() => undefined);
    }
  }

  function beginAction() {
    if (!actionGateRef.current.begin()) return false;
    setSubmitting(true);
    return true;
  }

  function finishAction() {
    actionGateRef.current.end();
    setSubmitting(false);
  }

  function showLogin(method: LoginMethod = loginMethod) {
    challengeRequestRef.current += 1;
    setEntryView('login');
    setLoginMethod(method);
    setChallenge(undefined);
    setCode('');
    setPassword('');
    setError('');
    void clearPhoneOtpChallenge().catch(() => undefined);
  }

  async function showCode(
    next: PersistedPhoneOtpChallenge,
    requestGeneration: number,
    storageGeneration: number,
  ) {
    if (!mountedRef.current || requestGeneration !== challengeRequestRef.current) return;
    const persisted = await writePhoneOtpChallenge(next, storageGeneration);
    if (!persisted || !mountedRef.current || requestGeneration !== challengeRequestRef.current) return;
    setChallenge(next);
    setPhone(next.phone.slice(3));
    setCode('');
    setError('');
    setClockNow(Date.now());
  }

  function showError(value: unknown) {
    const errorCode = value instanceof Error ? value.message : 'auth_failed';
    setError(loginErrorMessage(errorCode));
  }

  function requireConsent(): Promise<boolean> {
    if (acceptedRef.current) return Promise.resolve(true);
    if (consentPromiseRef.current) return consentPromiseRef.current;
    const pending = new Promise<boolean>((resolve) => {
      Alert.alert('确认后继续', loginAgeCopy.consentError, [
        { text: '取消', style: 'cancel', onPress: () => resolve(false) },
        { text: '同意并继续', onPress: () => {
          if (!mountedRef.current) { resolve(false); return; }
          acceptedRef.current = true;
          auth.rememberLoginConsent(legalDocuments);
          setAccepted(true);
          setError('');
          resolve(true);
        } },
      ], { cancelable: true, onDismiss: () => resolve(false) });
    });
    consentPromiseRef.current = pending;
    void pending.finally(() => { if (consentPromiseRef.current === pending) consentPromiseRef.current = undefined; });
    return pending;
  }

  function validatePhone() {
    if (normalizeChinaMobile(phone)) return true;
    setError('请输入正确的中国大陆手机号。');
    return false;
  }

  async function socialLogin(provider: 'apple' | 'wechat') {
    if (!await requireConsent()) return;
    if (!beginAction()) return;
    setError('');
    try {
      if (provider === 'apple') await auth.signInWithApple();
      else {
        if (Platform.OS === 'ios' && !await refreshWechatAvailability()) throw new Error('wechat_not_installed');
        await auth.signInWithWechat();
      }
    } catch (value) {
      if (provider === 'wechat' && Platform.OS === 'ios' && value instanceof Error && value.message === 'wechat_not_installed') {
        wechatStatusRequestRef.current += 1;
        setWechatInstalled(false);
      }
      showError(value);
    } finally {
      finishAction();
    }
  }

  async function requestLoginCode() {
    if (!validatePhone() || !await requireConsent()) return;
    if (!beginAction()) return;
    setError('');
    const requestedPhone = normalizeChinaMobile(phone)!;
    const requestGeneration = ++challengeRequestRef.current;
    const storageGeneration = beginPhoneOtpChallengeMutation();
    try {
      const response = await auth.requestPhoneOtp(requestedPhone);
      await showCode(phoneOtpChallenge(requestedPhone, 'login', response), requestGeneration, storageGeneration);
    } catch (value) {
      showError(value);
    } finally {
      finishAction();
    }
  }

  async function submitPasswordLogin() {
    if (!validatePhone() || !await requireConsent()) return;
    if (!password) { setError('请输入登录密码。'); return; }
    if (!beginAction()) return;
    setError('');
    const requestedPhone = normalizeChinaMobile(phone)!;
    try {
      await auth.signInWithPhonePassword(requestedPhone, password);
      setPassword('');
    } catch (value) {
      showError(value);
    } finally {
      finishAction();
    }
  }

  async function requestRecoveryCode() {
    if (!validatePhone()) return;
    if (!beginAction()) return;
    setError('');
    const requestedPhone = normalizeChinaMobile(phone)!;
    const requestGeneration = ++challengeRequestRef.current;
    const storageGeneration = beginPhoneOtpChallengeMutation();
    try {
      const response = await auth.requestPasswordRecoveryOtp(requestedPhone);
      await showCode(phoneOtpChallenge(requestedPhone, 'recovery', response), requestGeneration, storageGeneration);
    } catch (value) {
      showError(value);
    } finally {
      finishAction();
    }
  }

  async function resendCode() {
    if (!challenge || remainingSeconds > 0) return;
    if (challenge.purpose === 'login' && !await requireConsent()) return;
    if (!beginAction()) return;
    setError('');
    const requestGeneration = ++challengeRequestRef.current;
    const storageGeneration = beginPhoneOtpChallengeMutation();
    try {
      const response = challenge.purpose === 'recovery'
        ? await auth.requestPasswordRecoveryOtp(challenge.phone)
        : await auth.requestPhoneOtp(challenge.phone);
      await showCode(phoneOtpChallenge(challenge.phone, challenge.purpose, response), requestGeneration, storageGeneration);
    } catch (value) {
      showError(value);
    } finally {
      finishAction();
    }
  }

  async function verifyCode() {
    if (!challenge) return;
    if (phoneOtpServerNow(challenge) >= challenge.expiresAt) {
      setClockNow(Date.now());
      setError('验证码已过期，请重新获取。');
      return;
    }
    if (!/^\d{6}$/u.test(code)) { setError('请输入6位短信验证码。'); return; }
    if (challenge.purpose === 'login' && !await requireConsent()) return;
    if (!beginAction()) return;
    setError('');
    try {
      await auth.verifyPhoneOtp(challenge, code);
      await clearPhoneOtpChallenge().catch(() => undefined);
      setChallenge(undefined);
    } catch (value) {
      showError(value);
    } finally {
      finishAction();
    }
  }

  function changePhone() {
    challengeRequestRef.current += 1;
    const purpose = challenge?.purpose;
    setChallenge(undefined);
    setCode('');
    setError('');
    setEntryView(purpose === 'recovery' ? 'recovery' : 'login');
    void clearPhoneOtpChallenge().catch(() => undefined);
  }

  if (challengeRestoring) {
    return <AuthShell showBack={false}><AuthHeading title="正在恢复验证" /></AuthShell>;
  }

  if (codePurpose === 'recovery') {
    const recovery = true;
    return (
      <AuthShell onBack={() => showLogin('password')}>
        <AuthHeading title={recovery ? '验证手机号' : '输入验证码'} subtitle={`验证码已发送至 ${maskChinaMobile(normalizeChinaMobile(phone))}`} />
        <View style={styles.form}>
          <CodeField onChangeText={(value) => setCode(value.replace(/\D/gu, '').slice(0, 6))} value={code} />
          <AppText color={challengeExpired ? colors.destructive : undefined} variant="caption">
            {challengeExpired ? '验证码已过期，请重新获取。' : '验证码5分钟内有效，请勿转发给他人。'}
          </AppText>
          {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
          <Button disabled={submitting || challengeExpired || code.length !== 6} loading={submitting} onPress={() => void verifyCode()} size="lg">
            {recovery ? '继续重置密码' : '验证并进入'}
          </Button>
          <Button disabled={submitting || remainingSeconds > 0} onPress={() => void resendCode()} variant="outline">
            {remainingSeconds > 0 ? `${remainingSeconds} 秒后可重新获取` : '重新获取验证码'}
          </Button>
          <Button disabled={submitting} onPress={changePhone} variant="ghost">更换手机号</Button>
        </View>
      </AuthShell>
    );
  }

  if (entryView === 'recovery') {
    return (
      <AuthShell onBack={() => showLogin('password')}>
        <AuthHeading title="重置密码" subtitle="验证已绑定手机号后，为同一个账号设置新密码" />
        <View style={styles.form}>
          <PhoneField onChangeText={updatePhone} value={phone} />
          <AppText variant="caption">找回密码不会为未知手机号创建新账号。</AppText>
          {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
          <Button disabled={submitting} loading={submitting} onPress={() => void requestRecoveryCode()} size="lg">获取重置验证码</Button>
          <View style={styles.inlineLinks}><TextLink label="返回密码登录" onPress={() => showLogin('password')} /></View>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell showBack={false}>
      <View style={styles.brandRow}>
        <AppBrandLogo decorative size="sm" testID="login-brand-logo" />
        <AuthHeading title="登录 / 注册" />
      </View>
      <LoginMethodTabs disabled={submitting} method={loginMethod} onChange={(method) => { setLoginMethod(method); setPassword(''); setError(''); }} />
      <View style={styles.form}>
        <PhoneField onChangeText={updatePhone} value={phone} />
        {loginMethod === 'otp' ? (
          <>
            <TextField
              accessibilityLabel="短信验证码"
              autoComplete={Platform.OS === 'android' ? 'sms-otp' : undefined}
              editable={Boolean(challenge) && !submitting}
              inputMode="numeric"
              keyboardType="number-pad"
              label="验证码"
              maxLength={6}
              onChangeText={(value) => setCode(value.replace(/\D/gu, '').slice(0, 6))}
              placeholder={challenge ? '请输入6位验证码' : '请先获取验证码'}
              textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : undefined}
              trailing={(
                <Pressable
                  accessibilityLabel={challenge && remainingSeconds > 0 ? `${remainingSeconds}秒后可重新获取` : '获取短信验证码'}
                  disabled={submitting || Boolean(challenge && remainingSeconds > 0)}
                  hitSlop={8}
                  onPress={() => void (challenge ? resendCode() : requestLoginCode())}
                >
                  <AppText color={challenge && remainingSeconds > 0 ? colors.mutedForeground : colors.primary} variant="caption">
                    {challenge && remainingSeconds > 0 ? `${remainingSeconds}s` : challenge ? '重新获取' : '获取验证码'}
                  </AppText>
                </Pressable>
              )}
              value={code}
            />
            {challengeExpired ? <AppText color={colors.destructive} variant="caption">验证码已过期，请重新获取。</AppText> : null}
            {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
            <Button disabled={submitting || !challenge || challengeExpired || code.length !== 6} loading={submitting} onPress={() => void verifyCode()} size="lg">登录 / 注册</Button>
          </>
        ) : (
          <>
            <PasswordField label="登录密码" onChangeText={setPassword} placeholder="请输入登录密码" value={password} />
            <View style={styles.endLink}><TextLink label="忘记密码" onPress={() => { setEntryView('recovery'); setError(''); }} /></View>
            {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
            <Button disabled={submitting} loading={submitting} onPress={() => void submitPasswordLogin()} size="lg">密码登录</Button>
          </>
        )}
        <Checkbox checked={accepted} label={loginAgeCopy.consentLabel} onPress={() => {
          if (!submitting) {
            acceptedRef.current = !acceptedRef.current;
            setAccepted(acceptedRef.current);
            auth.rememberLoginConsent(acceptedRef.current ? legalDocuments : undefined);
          }
        }} />
        <LegalLinks documents={legalDocuments} />
      </View>
{thirdPartyLoginAvailable ? (
        <>
          <Divider label="第三方快捷登录" />
          <View style={styles.socialSection}>
            {Platform.OS === 'ios' ? (
              <SocialButton accessibilityLabel="通过 Apple 登录" kind="apple" onPress={() => void socialLogin('apple')} />
            ) : null}
            {wechatLoginVisible ? (
              <SocialButton accessibilityLabel="通过微信登录" kind="wechat" onPress={() => void socialLogin('wechat')} />
            ) : null}
          </View>
        </>
      ) : null}
    </AuthShell>
  );
}

function SocialButton({ accessibilityLabel, kind, onPress }: { accessibilityLabel: string; kind: 'apple' | 'wechat'; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={onPress} style={[styles.socialButton, kind === 'apple' && styles.appleSocialButton]} testID={`${kind}-sign-in`}>
      {kind === 'apple'
        ? <Ionicons color={colors.primaryForeground} name="logo-apple" size={25} />
        : <MaterialCommunityIcons color={colors.foreground} name="wechat" size={27} />}
    </Pressable>
  );
}

function PhoneField({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return <AuthField autoCapitalize="none" keyboardType="phone-pad" label="中国大陆手机号" maxLength={14} onChangeText={onChangeText} placeholder="请输入11位手机号" prefix="+86" value={value} />;
}

function LoginMethodTabs({ disabled, method, onChange }: { disabled: boolean; method: LoginMethod; onChange: (method: LoginMethod) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.methodTabs}>
      {(['otp', 'password'] as const).map((item) => {
        const selected = item === method;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            disabled={disabled}
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

function LegalLinks({ documents }: { documents: LoginLegalDocuments }) {
  const [openDocument, setOpenDocument] = useState<'agreement' | 'privacy'>();
  return (
    <>
    <View style={styles.legalLinks}>
      <TextLink label="查看用户协议" onPress={() => setOpenDocument('agreement')} />
      <AppText variant="micro">·</AppText>
      <TextLink label="查看隐私政策" onPress={() => setOpenDocument('privacy')} />
    </View>
    {openDocument ? <AppModal animationType="slide" onRequestClose={() => setOpenDocument(undefined)} visible>
      <Screen contentStyle={{ paddingHorizontal: 0 }} scroll>
        <TopBar onBack={() => setOpenDocument(undefined)} title={documents[openDocument].title} />
        <LegalDocumentBody document={documents[openDocument]} />
      </Screen>
    </AppModal> : null}
    </>
  );
}

const styles = StyleSheet.create({
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], marginTop: spacing[1] },
  socialSection: { alignItems: 'center', flexDirection: 'row', gap: spacing[4], justifyContent: 'center' },
  socialButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 28, borderWidth: 1, height: 56, justifyContent: 'center', width: 56 },
  appleSocialButton: { backgroundColor: colors.foreground, borderColor: colors.foreground },
  methodTabs: { backgroundColor: colors.secondary, borderRadius: radii.lg, flexDirection: 'row', gap: spacing[1], padding: spacing[1] },
  methodTab: { alignItems: 'center', borderRadius: radii.md, flex: 1, minHeight: 42, justifyContent: 'center' },
  methodTabSelected: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
  form: { gap: spacing[4], marginTop: spacing[5] },
  inlineLinks: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], justifyContent: 'center' },
  endLink: { alignItems: 'flex-end' },
  legalLinks: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  scopeNote: { marginTop: spacing[6], textAlign: 'center' },
});
