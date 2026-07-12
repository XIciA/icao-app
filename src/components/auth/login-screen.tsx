import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthShell, AuthHeading, AuthField, PasswordField, TextLink } from './auth-ui';

export function LoginScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(account.trim()) || password.length < 6) { setError('请输入有效邮箱和至少 6 位密码'); return; }
    setError('');
    setSubmitting(true);
    try {
      await auth.signIn(account, password);
      router.replace('/(tabs)/profile');
    } catch (value) {
      const code = value instanceof Error ? value.message : 'auth_failed';
      setError(code === 'invalid_email_or_password' ? '邮箱或密码错误' : code === 'auth_not_configured' ? '登录服务尚未配置' : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading title="欢迎回来" subtitle="登录以继续你的 ICAO 备考进度" />
      <View style={styles.form}>
        <AuthField keyboardType="email-address" label="邮箱" onChangeText={setAccount} placeholder="请输入邮箱" value={account} />
        <PasswordField label="密码" onChangeText={setPassword} placeholder="请输入密码" value={password} />
        <AppText variant="micro">登录状态安全保存在本机；内测阶段暂不提供找回密码。</AppText>
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={submitting} onPress={() => void submit()} size="lg">{submitting ? '登录中…' : '登录'}</Button>
      </View>
      <AppText style={styles.scopeNote} variant="caption">当前受控内测仅开放邮箱密码登录。</AppText>
      <View style={styles.bottomLink}>
        <AppText variant="caption">还没有账号？ </AppText>
        <TextLink label="立即注册" onPress={() => router.push('/auth/register')} />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[4], marginTop: spacing[8] },
  scopeNote: { marginTop: spacing[6], textAlign: 'center' },
  bottomLink: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingBottom: spacing[3], paddingTop: spacing[8] },
});
