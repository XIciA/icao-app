import { useRouter } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { isValidPassword } from '@/features/auth/auth-service';
import { AuthShell, AuthHeading, AuthField, PasswordField, Checkbox, TextLink } from './auth-ui';

export function RegisterScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const ready = agree && /^\S+@\S+\.\S+$/.test(email.trim()) && isValidPassword(password) && password === confirm;

  async function submit() {
    if (!ready) return;
    setError('');
    setSubmitting(true);
    try {
      await auth.signUp(email, password);
      router.replace('/(tabs)/profile');
    } catch (value) {
      const code = value instanceof Error ? value.message : 'auth_failed';
      setError(code === 'email_already_registered' ? '该邮箱已经注册' : code === 'weak_password' ? '密码强度不足' : code === 'auth_not_configured' ? '注册服务尚未配置' : '注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading title="创建账号" subtitle="使用邮箱建立内测账号并同步学习数据" />
      <View style={styles.form}>
        <AuthField icon={Mail} keyboardType="email-address" label="邮箱" onChangeText={setEmail} placeholder="请输入邮箱" value={email} />
        <PasswordField label="设置密码" onChangeText={setPassword} placeholder="8-64 位，含字母和数字" value={password} />
        <PasswordField label="确认密码" onChangeText={setConfirm} placeholder="请再次输入密码" value={confirm} />
        <View style={styles.agreement}>
          <Checkbox checked={agree} label="我已阅读并同意" onPress={() => setAgree(!agree)} />
          <TextLink label="《用户协议》" onPress={() => router.push('/legal/agreement')} />
          <TextLink label="《隐私政策》" onPress={() => router.push('/legal/privacy')} />
        </View>
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={!ready || submitting} onPress={() => void submit()} size="lg">{submitting ? '注册中…' : '注册'}</Button>
        <AppText variant="micro">内测环境关闭邮箱确认；该邮箱仅用于测试账号归属。</AppText>
      </View>
      <View style={styles.bottomLink}>
        <Mail color={colors.mutedForeground} size={14} />
        <AppText variant="caption"> 已有账号？ </AppText>
        <TextLink label="去登录" onPress={() => router.replace('/auth/login')} />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[4], marginTop: spacing[8] },
  agreement: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1.5] },
  bottomLink: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingBottom: spacing[3], paddingTop: spacing[8] },
});
