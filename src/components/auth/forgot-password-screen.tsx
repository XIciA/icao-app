import { useRouter } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { AuthShell, AuthHeading, AuthField, CodeField, PasswordField, TextLink } from './auth-ui';

export function ForgotPasswordScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const ready = phone.length >= 11 && code.length >= 4 && password.length >= 6 && password === confirm;

  return (
    <AuthShell>
      <AuthHeading title="找回账号" subtitle="验证手机号后即可重置登录密码" />
      <View style={styles.notice}>
        <KeyRound color={colors.primary} size={16} />
        <AppText style={styles.flex} variant="caption">为保障账号安全，重置密码前完成手机号验证</AppText>
      </View>
      <View style={styles.form}>
        <AuthField keyboardType="phone-pad" label="手机号" maxLength={11} onChangeText={setPhone} placeholder="请输入手机号" prefix="+86" value={phone} />
        <CodeField value={code} onChangeText={setCode} />
        <PasswordField label="新密码" onChangeText={setPassword} placeholder="8-20 位，含字母和数字" value={password} />
        <PasswordField label="确认新密码" onChangeText={setConfirm} placeholder="请再次输入新密码" value={confirm} />
        <Button disabled={!ready} onPress={() => router.replace('/auth/login')} size="lg">重置密码</Button>
      </View>
      <View style={styles.bottomLink}>
        <AppText variant="caption">想起来了？ </AppText>
        <TextLink label="返回登录" onPress={() => router.replace('/auth/login')} />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  notice: { alignItems: 'center', backgroundColor: colors.primary10, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing[2], marginTop: spacing[5], padding: spacing[3] },
  flex: { flex: 1 },
  form: { gap: spacing[4], marginTop: spacing[8] },
  bottomLink: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingBottom: spacing[3], paddingTop: spacing[8] },
});
