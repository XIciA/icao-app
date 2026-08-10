import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthShell, AuthHeading, AuthField } from './auth-ui';

export function loginErrorMessage(code: string) {
  switch (code) {
    case 'invalid_invite_code': return '邀请码无效或已停用';
    case 'invite_login_rate_limited': return '尝试过于频繁，请 15 分钟后再试。';
    case 'auth_network_error': return '网络连接失败，请检查网络后重试。';
    case 'auth_service_unavailable': return '认证服务暂时不可用，请稍后重试。';
    case 'auth_session_storage_unavailable': return '浏览器禁止了本地存储，无法保存登录状态。请关闭无痕模式或允许本站点数据后重试。';
    case 'auth_request_not_completed': return '认证请求未到达服务端。请刷新页面、关闭内容拦截或切换网络后重试。（诊断码：auth_failed）';
    case 'auth_not_configured': return '登录服务尚未配置';
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
    if (!/^[\u3400-\u9fff]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/u.test(inviteCode.trim())) { setError('请输入完整邀请码，例如：起落平安-7K4M-2Q9X'); return; }
    setError('');
    setSubmitting(true);
    try {
      await auth.signIn(inviteCode);
      router.replace((auth.consumePendingPath() ?? '/(tabs)') as Href);
    } catch (value) {
      const code = value instanceof Error ? value.message : 'auth_failed';
      setError(loginErrorMessage(code));
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
      <AuthHeading title="欢迎回来" subtitle="登录以继续你的 ICAO 备考进度" />
      <View style={styles.form}>
        <AuthField autoCapitalize="characters" label="邀请码" onChangeText={setInviteCode} placeholder="例如：起落平安-7K4M-2Q9X" value={inviteCode} />
        <AppText variant="micro">邀请码可在多台设备登录，学习数据会自动同步。</AppText>
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={submitting} onPress={() => void submit()} size="lg">{submitting ? '登录中…' : '登录'}</Button>
      </View>
      <AppText style={styles.scopeNote} variant="caption">当前使用专属邀请码登录，请向管理员获取邀请码。</AppText>
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
