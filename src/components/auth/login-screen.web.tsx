import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, spacing } from '@/theme';

import { AuthField, AuthHeading, AuthShell } from './auth-ui';

export function loginErrorMessage(code: string) {
  switch (code) {
    case 'invalid_invite_code': return '邀请码无效，请检查后重试';
    case 'auth_network_error': return '网络连接失败，请检查网络后重试。';
    case 'web_session_required': return '登录状态已失效，请重新输入邀请码。';
    case 'web_session_not_configured':
    case 'web_invites_not_configured':
    case 'auth_service_unavailable': return 'Web 登录服务暂时不可用，请稍后重试。';
    default: return `登录失败（错误代码：${code}）`;
  }
}

export function LoginScreen() {
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
      <AppText style={styles.scopeNote} variant="caption">App 是正式学习产品；当前网页为独立体验环境。</AppText>
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
  scopeNote: { marginTop: spacing[6], textAlign: 'center' },
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
