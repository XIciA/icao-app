import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { isValidPassword } from '@/features/auth/auth-service';
import { colors, spacing } from '@/theme';
import { AuthHeading, AuthShell, PasswordField } from './auth-ui';

export function RecoveryScreen() {
  const router = useRouter();
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const ready = isValidPassword(password) && password === confirmation;

  async function submit() {
    if (!ready) return;
    setSaving(true);
    setError('');
    try {
      await auth.completeRecovery(password);
      router.replace('/auth/login');
    } catch {
      setError('重置链接已失效或密码更新失败，请重新申请。');
    } finally {
      setSaving(false);
    }
  }

  return <AuthShell><AuthHeading title="设置新密码" subtitle="完成后所有旧设备需要重新登录" /><View style={styles.form}><PasswordField label="新密码" onChangeText={setPassword} placeholder="8-64 位，含字母和数字" value={password} /><PasswordField label="确认新密码" onChangeText={setConfirmation} placeholder="请再次输入新密码" value={confirmation} />{error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}<Button disabled={!ready || saving} onPress={() => void submit()} size="lg">{saving ? '正在更新…' : '更新密码'}</Button></View></AuthShell>;
}

const styles = StyleSheet.create({ form: { gap: spacing[4], marginTop: spacing[8] } });
