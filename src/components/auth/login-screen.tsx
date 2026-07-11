import { useRouter } from 'expo-router';
import { MessageSquareCode } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { AuthShell, AuthHeading, AuthField, PasswordField, Checkbox, TextLink, Divider } from './auth-ui';

export function LoginScreen() {
  const router = useRouter();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');

  function submit() {
    if (!account.trim() || password.length < 6) { setError('请输入账号和至少 6 位密码'); return; }
    router.replace('/(tabs)/profile');
  }

  return (
    <AuthShell>
      <AuthHeading title="欢迎回来" subtitle="登录以继续你的 ICAO 备考进度" />
      <View style={styles.form}>
        <AuthField keyboardType="phone-pad" label="手机号 / 账号" onChangeText={setAccount} placeholder="请输入手机号或账号" value={account} />
        <PasswordField label="密码" onChangeText={setPassword} placeholder="请输入密码" value={password} />
        <View style={styles.inline}>
          <Checkbox checked={remember} label="记住我" onPress={() => setRemember(!remember)} />
          <TextLink label="忘记密码？" onPress={() => router.push('/auth/forgot-password')} />
        </View>
        {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button onPress={submit} size="lg">登录</Button>
      </View>
      <Divider label="其他方式" />
      <View style={styles.horizontalPad}>
        <Button leading={<MessageSquareCode color={colors.primary} size={16} />} onPress={() => router.push('/auth/phone-code')} size="lg" variant="outline">验证码登录</Button>
      </View>
      <View style={styles.bottomLink}>
        <AppText variant="caption">还没有账号？ </AppText>
        <TextLink label="立即注册" onPress={() => router.push('/auth/register')} />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing[4], marginTop: spacing[8] },
  inline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  horizontalPad: { marginTop: spacing[1] },
  bottomLink: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingBottom: spacing[3], paddingTop: spacing[8] },
});
