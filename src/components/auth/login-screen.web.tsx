import { type Href, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider.web';
import { colors, spacing } from '@/theme';

import { AuthField, AuthHeading, AuthShell, CodeField, TextLink } from './auth-ui';

export function loginErrorMessage(code: string) {
  switch (code) {
    case 'invalid_invite_code': return '邀请码无效，请检查后重试';
    case 'invalid_phone_number': return '请输入正确的中国大陆手机号。';
    case 'invalid_phone_otp':
    case 'otp_expired': return '验证码错误或已过期，请重新输入。';
    case 'otp_rate_limited': return '验证码发送过于频繁，请稍后再试。';
    case 'auth_network_error': return '网络连接失败，请检查网络后重试。';
    case 'web_session_required': return '登录状态已失效，请重新登录。';
    case 'web_session_not_configured':
    case 'web_invites_not_configured':
    case 'auth_service_unavailable': return '登录服务暂时不可用，请稍后重试。';
    case 'auth_session_storage_unavailable': return '浏览器禁止了本地存储，无法保存登录状态。请退出无痕模式后重试。';
    default: return `登录失败（错误代码：${code}）`;
  }
}

export function LoginScreen() {
  const auth = useAuth();
  return auth.mode === 'phone-otp' ? <PhoneOtpLogin /> : <LegacyInviteLogin />;
}

function PhoneOtpLogin() {
  const router = useRouter();
  const auth = useAuth();
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1_000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function requestCode() {
    if (!/^1[3-9]\d{9}$/u.test(phone.replace(/\D/gu, ''))) {
      setError('请输入正确的 11 位中国大陆手机号。');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await auth.requestPhoneOtp(phone);
      setCodeSent(true);
      setCountdown(60);
    } catch (value) {
      setError(loginErrorMessage(value instanceof Error ? value.message : 'auth_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyCode() {
    if (!/^\d{6}$/u.test(token)) {
      setError('请输入 6 位短信验证码。');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await auth.verifyPhoneOtp(phone, token);
      router.replace((auth.consumePendingPath() ?? '/(tabs)') as Href);
    } catch (value) {
      setError(loginErrorMessage(value instanceof Error ? value.message : 'auth_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  function enterUiAcceptanceMode() {
    auth.enterUiAcceptanceMode();
    router.replace('/(tabs)');
  }

  return (
    <AuthShell>
      <AuthHeading title="欢迎回来" subtitle="手机号登录后，学习数据会与 iOS、Android 自动同步" />
      <View style={styles.form}>
        <AuthField
          keyboardType="phone-pad"
          label="手机号"
          maxLength={11}
          onChangeText={(value) => setPhone(value.replace(/\D/gu, ''))}
          placeholder="请输入手机号"
          prefix="+86"
          value={phone}
        />
        {codeSent ? <CodeField onChangeText={(value) => setToken(value.replace(/\D/gu, ''))} value={token} /> : null}
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        {codeSent ? (
          <>
            <Button disabled={submitting || token.length !== 6} onPress={() => void verifyCode()} size="lg">
              {submitting ? '登录中…' : '登录 / 自动注册'}
            </Button>
            <Button disabled={submitting || countdown > 0} onPress={() => void requestCode()} variant="outline">
              {countdown > 0 ? `${countdown} 秒后可重新发送` : '重新发送验证码'}
            </Button>
          </>
        ) : (
          <Button disabled={submitting} onPress={() => void requestCode()} size="lg">
            {submitting ? '发送中…' : '获取短信验证码'}
          </Button>
        )}
        <View style={styles.legalRow}>
          <AppText variant="micro">登录即代表同意</AppText>
          <TextLink label="《用户协议》" onPress={() => router.push('/legal/agreement')} />
          <AppText variant="micro">和</AppText>
          <TextLink label="《隐私政策》" onPress={() => router.push('/legal/privacy')} />
        </View>
      </View>
      {auth.uiAcceptanceAvailable ? (
        <Pressable
          accessibilityLabel="进入 UI 验收模式"
          accessibilityRole="button"
          onPress={enterUiAcceptanceMode}
          style={({ pressed }) => [styles.acceptanceEntry, pressed ? styles.acceptanceEntryPressed : null]}
        >
          <AppText color={colors.accent} variant="micro">开发者 · 免登录验收</AppText>
        </Pressable>
      ) : null}
    </AuthShell>
  );
}

function LegacyInviteLogin() {
  const router = useRouter();
  const auth = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!/^[\u3400-\u9fff]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/u.test(inviteCode.trim())) {
      setError('请输入完整邀请码，例如：体验名称-XXXX-XXXX');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await auth.signIn(inviteCode);
      router.replace((auth.consumePendingPath() ?? '/(tabs)') as Href);
    } catch (value) {
      setError(loginErrorMessage(value instanceof Error ? value.message : 'auth_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  function enterUiAcceptanceMode() {
    auth.enterUiAcceptanceMode();
    router.replace('/(tabs)');
  }

  return (
    <AuthShell>
      <AuthHeading title="欢迎体验" subtitle="输入 Web 独立邀请码，开始体验 ICAO 核心学习功能" />
      <View style={styles.form}>
        <AuthField autoCapitalize="characters" label="邀请码" onChangeText={setInviteCode} placeholder="例如：体验名称-XXXX-XXXX" value={inviteCode} />
        <AppText variant="micro">Web 体验版仅在当前浏览器保存学习记录，不与 App 同步。</AppText>
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={submitting} onPress={() => void submit()} size="lg">{submitting ? '登录中…' : '进入 Web 体验版'}</Button>
      </View>
      {auth.uiAcceptanceAvailable ? (
        <Pressable
          accessibilityLabel="进入 UI 验收模式"
          accessibilityRole="button"
          onPress={enterUiAcceptanceMode}
          style={({ pressed }) => [styles.acceptanceEntry, pressed ? styles.acceptanceEntryPressed : null]}
        >
          <AppText color={colors.accent} variant="micro">开发者 · 免登录验收</AppText>
        </Pressable>
      ) : null}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[4], marginTop: spacing[8] },
  legalRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1] },
  acceptanceEntry: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    bottom: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    position: 'absolute',
    right: spacing[5],
  },
  acceptanceEntryPressed: { opacity: 0.75 },
});
