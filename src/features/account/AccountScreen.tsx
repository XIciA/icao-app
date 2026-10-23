import { useAppRouter as useRouter } from '@/components/navigation/useAppRouter';
import { DEFAULT_TENCENT_ASR_MODEL, maskChinaMobile, normalizeChinaMobile } from '@icao/contracts';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, ChevronRight, Cloud, FileText, Info, LogOut, Shield, Trash2, UserRound } from '@/components/ui/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { TopBar } from '@/components/navigation/TopBar';
import { NativeScreenBoundary } from '@/components/states/NativeScreenBoundary.native';
import { AuthField, CodeField, PasswordField } from '@/components/auth/auth-ui';
import { AppText, BottomSheet, Button, Card, Screen, TextField } from '@/components/ui';
import { useAuth, type AccountDeletionAuthentication } from '@/features/auth/AuthProvider';
import { isValidPhonePassword, PHONE_PASSWORD_MIN_LENGTH, PHONE_PASSWORD_MAX_LENGTH, type PhoneBindingChallenge } from '@/features/auth/auth-service';
import { getCachedAiConsentHint, hasAiConsent, withdrawAiConsent } from '@/features/ai/ai-client';
import { MembershipRoutePage } from '@/features/native-commercial-testflight/MembershipRoutePage';
import { ContactRow } from '@/features/profile/ContactRow.native';
import { AutoTranscriptionSetting } from '@/features/ai/AutoTranscriptionSetting';
import { sqliteLearningStore } from '@/features/question-bank/platform/learning-store';
import { getLearningSyncStatus, runLearningSync } from '@/features/sync/learning-sync';
import { colors, radii, spacing } from '@/theme';
import { AccountProfilePage } from './AccountProfilePage.native';
import { LoginMethodSheet } from './LoginMethodSheet.native';
import { WECHAT_LOGIN_ENABLED } from '@/features/auth/wechat-release-capability';
import { phoneOtpChallenge, phoneOtpServerNow, type PersistedPhoneOtpChallenge } from '@/features/auth/phone-otp-challenge-store';
import { clearLearningData, deleteAllAiResults } from './privacy-self-service.native';

type AccountSlug = 'profile' | 'edit-profile' | 'membership' | 'settings' | 'privacy' | 'sync' | 'security' | 'bind-phone' | 'password' | 'delete-account';
const pages: AccountSlug[] = ['profile', 'edit-profile', 'membership', 'settings', 'privacy', 'sync', 'security', 'bind-phone', 'password', 'delete-account'];

export function AccountScreen() {
  const { slug } = useLocalSearchParams<{ slug: AccountSlug }>();
  return <NativeScreenBoundary title="账号与设置" fallbackHref="/(tabs)/profile" resetKey={slug}><AccountContent /></NativeScreenBoundary>;
}

function AccountContent() {
  const { slug } = useLocalSearchParams<{ slug: AccountSlug }>();
  const page: AccountSlug = pages.includes(slug) ? slug : 'profile';
  if (page === 'profile' || page === 'edit-profile') return <AccountProfilePage />;
  if (page === 'membership') return <MembershipRoutePage />;
  if (page === 'settings') return <SettingsPage />;
  if (page === 'privacy') return <PrivacyPage />;
  if (page === 'sync') return <SettingsPage />;
  if (page === 'security') return <SecurityPage />;
  if (page === 'bind-phone') return <BindPhonePage />;
  if (page === 'password') return <PasswordPage />;
  if (page === 'delete-account') return <DeleteAccountPage />;
  return <AccountProfilePage />;
}

function Page({ title, children, scroll = true }: { title: string; children: React.ReactNode; scroll?: boolean }) {
  return <Screen contentStyle={styles.screen} scroll={scroll}><TopBar title={title} />{children}</Screen>;
}

function SettingsPage() {
  const router = useRouter();
  const auth = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  async function prepareLogout() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      if (auth.account) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            runLearningSync(auth.account.accountId).catch(() => undefined),
            new Promise<void>((resolve) => { timer = setTimeout(resolve, 5000); }),
          ]);
        } finally { if (timer) clearTimeout(timer); }
      }
      const status = await getLearningSyncStatus();
      setPendingChanges(status.pendingCount > 0);
      setConfirm(true);
    } catch { setSignOutError('暂时无法确认保存状态，请稍后重试。'); }
    finally { setSigningOut(false); }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await auth.signOut();
      setConfirm(false);
      router.replace('/(tabs)');
    } catch { setSignOutError('退出失败，请稍后重试。'); }
    finally { setSigningOut(false); }
  }

  return (
    <Page title="设置">
      <View style={styles.content}>
        <Section title="账号">
          <Row first icon={Shield} label="账号安全" onPress={() => router.push('/account/security')} />
          <Row icon={Shield} label="隐私与数据" onPress={() => router.push('/account/privacy')} />
        </Section>
        <Section title="AI">
          <AutoTranscriptionSetting />
          <Row first hint="当前由服务端统一使用通用英语模型" icon={Cloud} label="腾讯 ASR 模型" value={DEFAULT_TENCENT_ASR_MODEL} />
        </Section>
        <Section title="其他">
          <ContactRow />
          <Row icon={Info} label="关于听你五个" onPress={() => router.push('/info/about')} />
        </Section>
        {signOutError ? <AppText color={colors.destructive} variant="caption">{signOutError}</AppText> : null}
        <Button disabled={!auth.session || signingOut} loading={signingOut} leading={<LogOut color={colors.destructive} size={16} />} onPress={() => void prepareLogout()} variant="outline">退出登录</Button>
      </View>
      <BottomSheet onClose={() => { if (!signingOut) setConfirm(false); }} visible={confirm}>
        <View style={styles.formNoPad}>
          <AppText variant="sectionTitle">退出登录</AppText>
          <AppText variant="caption">{pendingChanges ? '还有未同步的记录，退出后会保留在此设备，重新登录同一账号后继续同步。' : '退出当前设备，已保存的学习数据仍保留。'}</AppText>
          {signOutError ? <AppText color={colors.destructive} variant="caption">{signOutError}</AppText> : null}
          <Button disabled={signingOut} loading={signingOut} onPress={() => void signOut()}>退出登录</Button>
          <Button disabled={signingOut} onPress={() => setConfirm(false)} variant="outline">取消</Button>
        </View>
      </BottomSheet>
    </Page>
  );
}

function PrivacyPage() {
  const auth = useAuth();
  const router = useRouter();
  const [aiConsent, setAiConsent] = useState(false);
  const [aiResultCount, setAiResultCount] = useState(0);
  const [busy, setBusy] = useState<'ai' | 'learning' | 'consent'>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [hint, records] = await Promise.all([
      getCachedAiConsentHint().catch(() => false),
      sqliteLearningStore.getRecords(),
    ]);
    setAiConsent(hint);
    setAiResultCount(records.filter((record) => record.recordType === 'ai_result').length);
    void hasAiConsent().then(setAiConsent).catch(() => undefined);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  function requireAccount() {
    const accountId = auth.account?.accountId;
    if (accountId) return accountId;
    router.push('/auth/login');
    return undefined;
  }

  async function revokeAi() {
    if (busy) return;
    setBusy('consent');
    setError('');
    setMessage('');
    try {
      await withdrawAiConsent();
      setAiConsent(false);
      setMessage('AI 数据处理同意已撤回，不影响非 AI 学习。');
    } catch {
      setError('AI 数据处理同意撤回失败，请登录并稍后重试。');
    } finally {
      setBusy(undefined);
    }
  }

  async function removeAllAiResults() {
    const accountId = requireAccount();
    if (!accountId || busy) return;
    setBusy('ai');
    setError('');
    setMessage('');
    try {
      const result = await deleteAllAiResults(accountId);
      setAiResultCount(0);
      setMessage(`已删除 ${result.deletedCount} 条云端 AI 结果，删除会同步到其他设备。`);
    } catch {
      setError('全部 AI 结果删除未完成，请保持登录并检查网络后重试。');
    } finally {
      setBusy(undefined);
    }
  }

  async function removeLearningData() {
    const accountId = requireAccount();
    if (!accountId || busy) return;
    setBusy('learning');
    setError('');
    setMessage('');
    try {
      const result = await clearLearningData(accountId);
      setAiResultCount(0);
      setMessage(`已清除 ${result.deletedCount} 项学习数据；账号、会员和订单仍保留。`);
    } catch {
      setError('学习数据清除未完成，请保持登录并重试；旧离线数据不会恢复已完成的云端清除。');
    } finally {
      setBusy(undefined);
    }
  }

  function confirmDeleteAllAiResults() {
    Alert.alert(
      '删除全部 AI 结果？',
      '将删除已保存的转写、语法反馈和润色结果，但保留其他学习进度、账号、会员和订单。',
      [
        { text: '取消', style: 'cancel' },
        { text: '删除全部AI结果', style: 'destructive', onPress: () => { void removeAllAiResults(); } },
      ],
    );
  }

  function confirmClearLearningData() {
    Alert.alert(
      '清除全部学习数据？',
      '将清除学习进度、记录、收藏、标注、笔记、回答和 AI 结果，并阻止旧离线设备恢复它们。账号、会员和订单不受影响。',
      [
        { text: '取消', style: 'cancel' },
        { text: '清除学习数据', style: 'destructive', onPress: () => { void removeLearningData(); } },
      ],
    );
  }

  return (
    <Page title="隐私与数据">
      <View style={styles.content}>
        <Section title="AI 同意">
          <Row first
            hint={aiConsent ? '撤回后停止新的上传和分析，已有 AI 结果不会自动删除' : '再次使用 AI 功能时可重新确认'}
            icon={Shield}
            label={aiConsent ? '撤回 AI 数据处理同意' : 'AI 数据处理同意'}
            onPress={aiConsent ? () => { void revokeAi(); } : undefined}
            value={aiConsent ? '已同意' : '未同意'}
          />
        </Section>
        <Section title="数据自助">
          <Row first danger hint="保留其他学习数据" icon={Trash2} label="删除全部 AI 结果" onPress={confirmDeleteAllAiResults} value={`${aiResultCount} 条`} />
          <Row danger hint="保留账号、会员和订单" icon={Trash2} label="清除全部学习数据" onPress={confirmClearLearningData} value={busy === 'learning' ? '清除中…' : undefined} />
        </Section>
        <Section title="政策与联系">
          <Row first icon={FileText} label="隐私政策" onPress={() => router.push('/info/privacy')} />
          <Row icon={FileText} label="用户协议" onPress={() => router.push('/info/agreement')} />
          <Row icon={FileText} label="第三方服务清单" onPress={() => router.push('/info/services')} />
          <Row hint="privacy@yunqihangke.com" icon={Info} label="隐私权利联系" onPress={() => { void Linking.openURL('mailto:privacy@yunqihangke.com'); }} />
        </Section>
        {message ? <AppText color={colors.primary} variant="caption">{message}</AppText> : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
      </View>
    </Page>
  );
}

function SecurityPage() {
  const auth = useAuth();
  const router = useRouter();
  const hasPassword = auth.account?.hasPassword === true;
  const phoneBound = auth.account?.phoneBound === true;
  const [loginMethod, setLoginMethod] = useState<'apple' | 'wechat'>();

  function openPasswordSettings() {
    if (!phoneBound) router.push('/account/bind-phone');
    else router.push(hasPassword ? '/account/password' : '/account/password?mode=verify');
  }

  return (
    <Page title="账号安全">
      <View style={styles.content}>
        <Section title="登录与绑定">
          <Row
            hint={phoneBound ? '更换手机号' : '可选绑定，稍后仍可使用已有第三方方式登录'}
            icon={UserRound}
            first
            label="手机号"
            onPress={() => router.push('/account/bind-phone')}
            value={maskChinaMobile(auth.account?.phone)}
          />
          <Row
            hint={!phoneBound ? '先绑定手机号后即可设置' : hasPassword ? '验证当前密码后设置新密码' : '短信验证后设置，可使用手机号和密码登录'}
            icon={Shield}
            label={hasPassword ? '修改登录密码' : '设置登录密码'}
            onPress={() => void openPasswordSettings()}
          />
          {Platform.OS === 'ios' ? <Row icon={Shield} label="Apple 登录"
            value={auth.account?.providers.includes('apple') ? '已绑定' : '未绑定'} onPress={() => setLoginMethod('apple')} /> : null}
          {Platform.OS !== 'web' && (WECHAT_LOGIN_ENABLED || auth.account?.providers.includes('wechat')) ? <Row icon={Shield} label="微信登录"
            value={auth.account?.providers.includes('wechat') ? '已绑定' : '未绑定'} onPress={() => setLoginMethod('wechat')} /> : null}
        </Section>
        {loginMethod ? <LoginMethodSheet provider={loginMethod} bound={auth.account?.providers.includes(loginMethod) === true}
          onClose={() => setLoginMethod(undefined)} /> : null}
        <Section title="危险操作">
          <Row danger first icon={Trash2} label="注销账号" hint="永久删除账号与活跃数据" onPress={() => router.push('/account/delete-account')} />
        </Section>
      </View>
    </Page>
  );
}

function BindPhonePage() {
  const auth = useAuth();
  const router = useRouter();
  const changingPhone = auth.account?.phoneBound === true;
  const [showVerification, setShowVerification] = useState(false);
  const grantRef = useRef<string | undefined>(undefined);
  const activeRef = useRef(true);
  const actionRef = useRef(false);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<PhoneBindingChallenge>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [recentAuthRequired, setRecentAuthRequired] = useState(false);
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

  const remainingSeconds = Math.max(0, Math.ceil((resendDeadline - clockNow) / 1_000));

  function startCountdown() {
    const now = Date.now();
    setClockNow(now);
    setResendDeadline(now + 60_000);
  }

  function updatePhone(value: string) {
    const digits = value.replace(/\D/gu, '');
    const next = (digits.startsWith('86') && digits.length > 11 ? digits.slice(2) : digits).slice(0, 11);
    setPhone(next);
    if (challenge && normalizeChinaMobile(next) !== challenge.phone) { setChallenge(undefined); setCode(''); }
  }

  async function requestCode() {
    if (!normalizeChinaMobile(phone)) { setError('请输入正确的中国大陆手机号'); return; }
    if (changingPhone && normalizeChinaMobile(phone) === auth.account?.phone) { setError('请输入新的手机号'); return; }
    if (changingPhone && !grantRef.current) { setShowVerification(true); return; }
    if (actionRef.current) return;
    actionRef.current = true;
    setSubmitting(true);
    setError('');
    setRecentAuthRequired(false);
    try {
      const next = await auth.requestPhoneBindingOtp(phone, grantRef.current);
      if (!activeRef.current) return;
      setChallenge(next);
      setCode('');
      startCountdown();
    } catch (cause) {
      if (!activeRef.current) return;
      const code = cause instanceof Error ? cause.message : '';
      setRecentAuthRequired(code === 'recent_social_auth_required');
      setError(code === 'recent_social_auth_required'
        ? '为保护账号安全，请先验证当前账号，再绑定手机号'
        : '暂时无法发送验证码，请检查手机号或稍后重试');
    } finally {
      actionRef.current = false;
      if (activeRef.current) setSubmitting(false);
    }
  }

  async function resendCode() {
    if (!challenge || remainingSeconds > 0) return;
    if (actionRef.current) return;
    actionRef.current = true;
    setSubmitting(true);
    setError('');
    setRecentAuthRequired(false);
    try {
      const next = await auth.resendPhoneBindingOtp(challenge);
      if (!activeRef.current) return;
      setChallenge(next);
      setCode('');
      startCountdown();
    } catch {
      if (!activeRef.current) return;
      setError('暂时无法重新发送验证码，请稍后重试');
    } finally {
      actionRef.current = false;
      if (activeRef.current) setSubmitting(false);
    }
  }

  async function verify() {
    if (!challenge || !/^\d{6}$/u.test(code)) { setError('请输入6位短信验证码'); return; }
    if (actionRef.current) return;
    actionRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      await auth.verifyPhoneBindingOtp(challenge, code);
      if (activeRef.current) router.dismissTo('/account/security');
    } catch (cause) {
      if (!activeRef.current) return;
      const code = cause instanceof Error ? cause.message : '';
      setRecentAuthRequired(code === 'recent_social_auth_required');
      setError(code === 'phone_already_registered'
        ? changingPhone ? '该手机号已绑定其他账号，请使用其他号码' : '该手机号已有账号，请退出后使用手机号登录'
        : code === 'recent_social_auth_required'
          ? '为保护账号安全，请先验证当前账号，再绑定手机号'
        : code === 'invalid_phone_otp'
          ? '验证码错误或已过期，请重新输入'
          : '绑定未完成，请稍后重试');
    } finally {
      actionRef.current = false;
      if (activeRef.current) setSubmitting(false);
    }
  }

  function reauthenticate() {
    grantRef.current = undefined;
    setShowVerification(true);
  }

  async function signOutToPhoneLogin() {
    if (actionRef.current) return;
    actionRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      await auth.signOut();
      if (activeRef.current) router.replace('/auth/login');
    } catch {
      if (!activeRef.current) return;
      setError('暂时无法退出，请稍后重试');
    } finally {
      actionRef.current = false;
      if (activeRef.current) setSubmitting(false);
    }
  }

  return (
    <Page title={changingPhone ? '更换手机号' : '绑定手机号'}>
      {showVerification ? <LoginMethodSheet provider="phone" bound onClose={() => setShowVerification(false)} onVerified={async (grantId) => {
        if (!activeRef.current) return;
        grantRef.current = grantId;
        await requestCode();
        if (activeRef.current) setShowVerification(false);
      }} /> : null}
      <View style={styles.form}>
        <View style={styles.passwordIntro}>
          <AppText variant="sectionTitle">{changingPhone ? '验证新手机号' : '绑定中国大陆手机号'}</AppText>
          <AppText variant="caption">{changingPhone ? `当前手机号 ${maskChinaMobile(auth.account?.phone)}。更换后可用新号码验证码登录；原登录密码需重新设置。账号、会员和学习数据保持不变。` : '绑定后可使用验证码或密码登录，也可用于账号找回。普通学习不强制绑定。'}</AppText>
        </View>
        <AuthField autoCapitalize="none" keyboardType="phone-pad" label="手机号" maxLength={14} onChangeText={updatePhone} placeholder="请输入11位手机号" prefix="+86" value={phone} />
        {challenge ? (
          <>
            <CodeField onChangeText={(value) => setCode(value.replace(/\D/gu, '').slice(0, 6))} value={code} />
            <AppText variant="caption">验证码已发送至 {maskChinaMobile(challenge.phone)}</AppText>
            <AppText variant="caption">验证成功后将安全绑定到你的听你五个账号，学习记录与权益保持不变。</AppText>
          </>
        ) : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        {recentAuthRequired ? <Button disabled={submitting} onPress={() => void reauthenticate()} variant="outline">重新验证身份</Button> : null}
        {error === '该手机号已有账号，请退出后使用手机号登录' ? <Button disabled={submitting} onPress={() => void signOutToPhoneLogin()} variant="outline">退出并使用手机号登录</Button> : null}
        {challenge ? (
          <>
            <Button disabled={submitting || code.length !== 6} loading={submitting} onPress={() => void verify()} size="lg">验证并完成绑定</Button>
            <Button disabled={submitting || remainingSeconds > 0} onPress={() => void resendCode()} variant="outline">
              {remainingSeconds > 0 ? `${remainingSeconds} 秒后可重新获取` : '重新获取验证码'}
            </Button>
            <Button disabled={submitting} onPress={() => { setChallenge(undefined); setCode(''); setError(''); setRecentAuthRequired(false); }} variant="ghost">更换手机号</Button>
          </>
        ) : (
          <Button disabled={submitting} loading={submitting} onPress={() => void requestCode()} size="lg">获取验证码</Button>
        )}
      </View>
    </Page>
  );
}

function PasswordPage() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const setup = mode === 'setup' && auth.passwordChangePurpose === 'setup';
  const recovery = auth.passwordChangePurpose === 'recovery';
  const hasPassword = auth.account?.hasPassword === true;
  const [smsMode, setSmsMode] = useState(mode === 'verify');
  const needsSms = smsMode && !recovery;
  const requiresCurrentPassword = hasPassword && !recovery && !setup;
  const title = needsSms ? '验证手机号' : recovery ? '重置登录密码' : hasPassword ? '修改登录密码' : '设置登录密码';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [challenge, setChallenge] = useState<PersistedPhoneOtpChallenge>();
  const [code, setCode] = useState('');
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState('');
  const actionRef = useRef(false);
  const activeRef = useRef(true);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);

  useEffect(() => {
    if (((mode === 'setup' || mode === 'recovery') && !setup && !recovery && !saving) || !auth.account?.phoneBound) {
      router.dismissTo('/account/security');
    }
  }, [auth.account?.phoneBound, mode, recovery, router, saving, setup]);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => {
      const next = Date.now(); setClock(next);
      if (phoneOtpServerNow(challenge, next) >= challenge.expiresAt) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [challenge]);
  const seconds = challenge ? Math.max(0, Math.ceil((challenge.resendAllowedAt - phoneOtpServerNow(challenge, clock)) / 1000)) : 0;
  const expired = !!challenge && phoneOtpServerNow(challenge, clock) >= challenge.expiresAt;
  const passwordError = getPasswordPolicyError(newPassword);
  const confirmationError = confirmation && confirmation !== newPassword ? '两次输入的密码不一致' : '';
  const ready = !needsSms && Boolean((!requiresCurrentPassword || currentPassword) && newPassword && !passwordError && confirmation === newPassword);

  async function sendCode() {
    if (!auth.account?.phone || actionRef.current || seconds) return;
    actionRef.current = true; setSaving(true); setError('');
    try {
      const phone = auth.account.phone;
      const result = await auth.requestPasswordRecoveryOtp(phone);
      if (activeRef.current) { setChallenge(phoneOtpChallenge(phone, 'recovery', result)); setClock(Date.now()); setCode(''); }
    } catch { if (activeRef.current) setError('验证码发送失败，请稍后重试。'); }
    finally { actionRef.current = false; if (activeRef.current) setSaving(false); }
  }

  async function verifyCode() {
    if (!challenge || expired || !/^\d{6}$/u.test(code) || actionRef.current) return;
    actionRef.current = true; setSaving(true); setError('');
    try {
      await auth.verifyCurrentAccountRecoveryOtp(challenge, code);
      if (activeRef.current) setCode('');
    } catch { if (activeRef.current) setError('验证未完成，请检查验证码或重新获取。'); }
    finally { actionRef.current = false; if (activeRef.current) setSaving(false); }
  }

  async function savePassword() {
    if (!ready || actionRef.current) return;
    actionRef.current = true; setSaving(true); setError('');
    const returnPath = recovery ? auth.passwordChangeReturnPath ?? '/account/security' : '/account/security';
    try {
      await auth.updatePassword(newPassword, requiresCurrentPassword ? currentPassword : undefined);
      if (activeRef.current) router.dismissTo(returnPath);
    } catch (cause) {
      if (activeRef.current) { setError(getPasswordUpdateError(cause)); if (recovery) setSmsMode(true); }
    } finally { actionRef.current = false; if (activeRef.current) setSaving(false); }
  }

  return <Page title={title}>
    <View style={styles.passwordForm}>
      {needsSms ? <>
        <AppText variant="sectionTitle">验证当前账号手机号</AppText>
        <AppText variant="caption">{maskChinaMobile(auth.account?.phone)}</AppText>
        <Button disabled={saving || seconds > 0} onPress={() => void sendCode()} variant="outline">
          {seconds > 0 ? `${seconds}秒后重新获取` : challenge ? '重新获取验证码' : '获取验证码'}
        </Button>
        {challenge ? <>
          <CodeField onChangeText={(text) => setCode(text.replace(/\D/gu, '').slice(0, 6))} value={code} />
          {expired ? <AppText color={colors.destructive} variant="caption">验证码已过期，请重新获取。</AppText> : null}
          <Button disabled={saving || expired || code.length !== 6} loading={saving} onPress={() => void verifyCode()}>验证并继续</Button>
        </> : null}
        {hasPassword ? <Button disabled={saving} onPress={() => { setSmsMode(false); setError(''); }} variant="ghost">使用当前密码验证</Button> : null}
      </> : <>
        {requiresCurrentPassword ? <>
          <PasswordField label="当前密码" onChangeText={setCurrentPassword} placeholder="请输入当前密码" value={currentPassword} />
          <Button disabled={saving} onPress={() => { setSmsMode(true); setError(''); }} variant="ghost">忘记当前密码？使用短信验证</Button>
        </> : null}
        <PasswordField label="新密码" onChangeText={setNewPassword} placeholder="请输入 8–32 位新密码" value={newPassword} />
        <AppText color={passwordError ? colors.destructive : colors.mutedForeground} variant="micro">
          {passwordError || '密码为 8–32 位，且至少包含一个字母和一个数字。'}
        </AppText>
        <PasswordField label="确认新密码" onChangeText={setConfirmation} placeholder="请再次输入新密码" value={confirmation} />
        {confirmationError ? <AppText color={colors.destructive} variant="caption">{confirmationError}</AppText> : null}
        <Button disabled={!ready || saving} loading={saving} onPress={() => void savePassword()} size="lg" testID="password-submit">保存密码</Button>
      </>}
      {error ? <AppText accessibilityRole="alert" color={colors.destructive} variant="caption">{error}</AppText> : null}
    </View>
  </Page>;
}

function getPasswordPolicyError(password: string) {
  if (!password) return '';
  if (isValidPhonePassword(password)) return '';
  const length = Array.from(password).length;
  if (length < PHONE_PASSWORD_MIN_LENGTH || length > PHONE_PASSWORD_MAX_LENGTH) return '密码长度需要为 8–32 位';
  if (!/[A-Za-z]/u.test(password) || !/[0-9]/u.test(password)) return '密码必须同时包含字母和数字';
  return '';
}

function getPasswordUpdateError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : '';
  if (code === 'invalid_phone_or_password' || code === 'invalid_current_password' || code === 'invalid_credentials') return '当前密码不正确，请重新输入';
  if (code === 'password_unchanged' || code === 'same_password') return '新密码不能与当前密码相同';
  if (code === 'invalid_phone_password' || code === 'password_too_weak') return '新密码不符合安全要求，请更换后重试';
  if (code === 'phone_reauthentication_required') return '登录验证已过期，请通过短信验证码验证后重试';
  return '密码保存失败，请稍后重试';
}

function DeleteAccountPage() {
  const router = useRouter();
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [authenticationMethod, setAuthenticationMethod] = useState<AccountDeletionAuthentication['method']>();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const hasApple = Platform.OS === 'ios' && auth.account?.providers.includes('apple') === true;
  const hasWechat = Platform.OS !== 'web' && auth.account?.providers.includes('wechat') === true;
  const hasPassword = auth.account?.hasPassword === true
    || (auth.session?.user.providers.includes('phone') === true && auth.session.user.hasPassword);
  const hasPhoneOtp = auth.account?.phoneBound === true;
  const authenticationOptions = useMemo<{ label: string; method: AccountDeletionAuthentication['method'] }[]>(() => [
    ...(hasApple ? [{ label: 'Apple', method: 'apple' as const }] : []),
    ...(hasWechat ? [{ label: '微信', method: 'wechat' as const }] : []),
    ...(hasPassword ? [{ label: '登录密码', method: 'password' as const }] : []),
    ...(hasPhoneOtp ? [{ label: '短信验证码', method: 'phone_otp' as const }] : []),
  ], [hasApple, hasPassword, hasPhoneOtp, hasWechat]);
  const selectedAuthentication = authenticationOptions.find(({ method }) => method === authenticationMethod);
  const authenticationReady = authenticationMethod === 'apple'
    || authenticationMethod === 'wechat'
    || (authenticationMethod === 'password' && password.length > 0)
    || (authenticationMethod === 'phone_otp' && /^\d{6}$/u.test(phoneOtp));
  const ready = authenticationReady;
  const risks = [
    '账号、学习记录、笔记、标注与 AI 内容将永久删除',
    '会员权益与 AI 额度将失效，依法保留的交易记录除外',
    '重新注册会获得新账号，无法恢复原数据',
  ];

  useEffect(() => {
    if (authenticationOptions.some(({ method }) => method === authenticationMethod)) return;
    setAuthenticationMethod(authenticationOptions[0]?.method);
  }, [authenticationMethod, authenticationOptions]);

  async function requestOtp() {
    setOtpSending(true);
    setError('');
    try {
      await auth.requestAccountDeletionPhoneOtp();
      setOtpSent(true);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      setError(code === 'phone_otp_rate_limited' ? '验证码请求过于频繁，请稍后重试' : '验证码发送失败，请稍后重试');
    } finally {
      setOtpSending(false);
    }
  }

  async function remove() {
    if (!ready || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await auth.deleteAccount({
        method: authenticationMethod!,
        ...(authenticationMethod === 'password' ? { password } : {}),
        ...(authenticationMethod === 'phone_otp' ? { phoneOtp } : {}),
      }, () => new Promise<boolean>((resolve) => {
        Alert.alert('确认永久注销账号？', '账号、学习数据和会员权益将无法恢复。', [
          { text: '取消', style: 'cancel', onPress: () => resolve(false) },
          { text: '永久注销', style: 'destructive', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
      }));
      router.replace('/(tabs)');
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      if (code === 'invalid_phone_or_password' || code === 'invalid_credentials') setError('登录密码不正确，请重新输入');
      else if (code === 'invalid_phone_otp') setError('验证码错误或已过期，请重新获取');
      else if (code === 'account_deletion_cancelled') return;
      else if (code === 'social_auth_cancelled') setError('已取消身份验证，账号未注销');
      else if (code === 'identity_already_in_use') setError('当前第三方身份与本账号不一致，账号未注销');
      else setError('暂时无法确认注销请求，请检查网络后重试；重复提交不会重复删除');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page title="注销账号">
      <View style={styles.delete}>
        <View style={styles.dangerHero}>
          <View style={styles.dangerIcon}><AlertTriangle color={colors.destructive} size={30} /></View>
          <AppText variant="sectionTitle">此操作不可撤销</AppText>
          <AppText style={styles.center}>注销账号会永久删除当前账号及其活跃数据。</AppText>
        </View>
        <Card style={styles.risks}>{risks.map((risk) => <View key={risk} style={styles.risk}><View style={styles.riskDot}><AppText color={colors.destructive} variant="micro">×</AppText></View><AppText style={styles.flex}>{risk}</AppText></View>)}</Card>
        {authenticationOptions.length > 0 ? (
          <Choice
            label="验证方式"
            onChange={(label) => setAuthenticationMethod(authenticationOptions.find((option) => option.label === label)?.method)}
            options={authenticationOptions.map(({ label }) => label)}
            value={selectedAuthentication?.label ?? ''}
          />
        ) : <AppText color={colors.destructive} variant="caption">当前账号没有可用的身份验证方式，请联系客服。</AppText>}
        {authenticationMethod === 'apple' ? <AppText variant="caption">提交时将由 Apple 弹窗再次验证你的身份。</AppText> : null}
        {authenticationMethod === 'wechat' ? <AppText variant="caption">提交时将跳转微信再次验证你的身份。</AppText> : null}
        {authenticationMethod === 'password' ? <TextField accessibilityLabel="登录密码" label="登录密码" onChangeText={setPassword} secureTextEntry value={password} /> : null}
        {authenticationMethod === 'phone_otp' ? (
          <View style={styles.formNoPad}>
            <Button disabled={otpSending || deleting} onPress={() => void requestOtp()} variant="outline">{otpSending ? '正在发送…' : otpSent ? '重新发送验证码' : '发送短信验证码'}</Button>
            <TextField keyboardType="number-pad" label="短信验证码" maxLength={6} onChangeText={setPhoneOtp} value={phoneOtp} />
          </View>
        ) : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={!ready || deleting} onPress={() => void remove()} size="lg" variant="destructive">{deleting ? '正在处理…' : '验证身份并继续'}</Button>
        <Button disabled={deleting} onPress={() => router.canGoBack() ? router.back() : router.dismissTo('/account/security')} size="lg" variant="outline">返回</Button>
      </View>
    </Page>
  );
}

function Choice({ label, options, value, onChange, compact = false }: { label: string; options: string[]; value: string; onChange: (value: string) => void; compact?: boolean }) { return <View style={styles.choice}><AppText variant="button">{label}</AppText><View style={styles.choiceRow}>{options.map((option) => <Pressable key={option} onPress={() => onChange(option)} style={[styles.choiceButton, value === option && styles.choiceSelected]}><AppText color={value === option ? colors.primary : colors.mutedForeground} variant={compact ? 'micro' : 'caption'}>{option}</AppText></Pressable>)}</View></View>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><AppText variant="caption">{title}</AppText><Card style={styles.rows}>{children}</Card></View>; }
function Row({ icon: Icon, label, hint, value, onPress, first = false, danger = false, trailing }: { icon: typeof UserRound; label: string; hint?: string; value?: string; onPress?: () => void; first?: boolean; danger?: boolean; trailing?: React.ReactNode }) { const content = <View style={[styles.row, !first && styles.rowBorder]}><View style={[styles.rowIcon, danger && styles.rowIconDanger]}><Icon color={danger ? colors.destructive : colors.primary} size={16} /></View><View style={styles.flex}><AppText color={danger ? colors.destructive : colors.foreground} variant="button">{label}</AppText>{hint ? <AppText variant="micro">{hint}</AppText> : null}</View>{value ? <AppText variant="caption">{value}</AppText> : null}{trailing}{onPress ? <ChevronRight color={colors.mutedForeground} size={16} /> : null}</View>; return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content; }

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 }, content: { gap: spacing[5], padding: spacing[5] }, profileHero: { alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[5], paddingTop: spacing[5] }, avatar: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.full, height: 74, justifyContent: 'center', overflow: 'hidden', position: 'relative', width: 74 }, avatarSmall: { height: 58, width: 58 }, avatarImage: { borderRadius: radii.full, height: 74, width: 74 }, avatarSmallImage: { height: 58, width: 58 }, editBadge: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.card, borderRadius: radii.full, borderWidth: 2, bottom: 0, height: 20, justifyContent: 'center', position: 'absolute', right: 0, width: 20, zIndex: 2 }, avatarEdit: { alignItems: 'center', gap: spacing[2], paddingTop: spacing[5] }, form: { gap: spacing[4], padding: spacing[5] }, formNoPad: { gap: spacing[4] }, passwordForm: { gap: spacing[4], padding: spacing[5] }, passwordIntro: { gap: spacing[2] }, textarea: { minHeight: 72, textAlignVertical: 'top' }, center: { textAlign: 'center' }, section: { gap: spacing[2] }, rows: { padding: 0 }, row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 58, paddingHorizontal: spacing[3] }, rowBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }, rowIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 34, justifyContent: 'center', width: 34 }, rowIconDanger: { backgroundColor: 'rgba(219,43,51,0.08)' }, flex: { flex: 1 }, choice: { gap: spacing[2] }, choiceRow: { flexDirection: 'row', gap: spacing[2] }, choiceButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.input, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing[1] }, choiceSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, modelSheet: { gap: spacing[4] }, modelOptions: { gap: spacing[2] }, modelOption: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing[3], minHeight: 68, padding: spacing[3] }, modelOptionSelected: { backgroundColor: colors.primary10, borderColor: colors.primary }, syncCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3] }, syncIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 44, justifyContent: 'center', width: 44 }, current: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] }, softIcon: { alignItems: 'center', backgroundColor: colors.primary10, borderRadius: radii.md, height: 40, justifyContent: 'center', width: 40 }, delete: { gap: spacing[3], padding: spacing[5] }, dangerHero: { alignItems: 'center', gap: spacing[2] }, dangerIcon: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 62, justifyContent: 'center', width: 62 }, risks: { backgroundColor: 'rgba(219,43,51,0.04)', borderColor: 'rgba(219,43,51,0.22)', gap: spacing[3] }, risk: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] }, riskDot: { alignItems: 'center', backgroundColor: 'rgba(219,43,51,0.10)', borderRadius: radii.full, height: 18, justifyContent: 'center', width: 18 }, consent: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] }, checkbox: { alignItems: 'center', borderColor: colors.input, borderRadius: radii.sm, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 }, checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary }, sheet: { alignItems: 'center', gap: spacing[3], paddingBottom: spacing[3] }, overlay: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' }, logout: { alignItems: 'stretch', backgroundColor: colors.card, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, gap: spacing[3], padding: spacing[5], paddingBottom: spacing[8] }, handle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: radii.full, height: 4, marginBottom: spacing[1], width: 40 },
});
