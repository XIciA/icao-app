import { useRouter } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { colors, spacing } from '@/theme';
import { AuthShell, AuthHeading, AuthField, TextLink } from './auth-ui';

export function ForgotPasswordScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const ready = /^\S+@\S+\.\S+$/.test(email.trim());

  async function submit() {
    if (!ready) return;
    setSending(true);
    setError('');
    try {
      await auth.requestPasswordReset(email);
      setSent(true);
    } catch {
      setError('请求失败，请稍后重试。');
    } finally {
      setSending(false);
    }
  }

  return <AuthShell><AuthHeading title="找回密码" subtitle="通过内测邮件重置邮箱账号密码" /><View style={styles.notice}><KeyRound color={colors.primary} size={16} /><AppText style={styles.flex} variant="caption">邮件仅发送到 Mailpit 测试邮箱，不会投递到公网邮箱。</AppText></View><View style={styles.form}><AuthField keyboardType="email-address" label="邮箱" onChangeText={setEmail} placeholder="请输入注册邮箱" value={email} />{error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}{sent ? <AppText color={colors.primary} variant="caption">如该邮箱已注册，重置邮件已生成。请在 Mailpit 中打开。</AppText> : null}<Button disabled={!ready || sending} onPress={() => void submit()} size="lg">{sending ? '正在发送…' : '发送重置邮件'}</Button></View><View style={styles.bottomLink}><TextLink label="返回登录" onPress={() => router.replace('/auth/login')} /></View></AuthShell>;
}

const styles = StyleSheet.create({
  notice: { alignItems: 'center', backgroundColor: colors.primary10, flexDirection: 'row', gap: spacing[2], marginTop: spacing[5], padding: spacing[3] },
  flex: { flex: 1 },
  form: { gap: spacing[4], marginTop: spacing[6] },
  bottomLink: { alignItems: 'center', marginTop: 'auto', paddingBottom: spacing[3], paddingTop: spacing[8] },
});
