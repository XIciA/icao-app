import { useRouter } from 'expo-router';
import { Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { AuthShell, AuthHeading, AuthField, PasswordField, CodeField, Checkbox, TextLink } from './auth-ui';

export function RegisterScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const ready = agree && phone.length >= 11 && code.length >= 4 && password.length >= 6 && password === confirm;

  return (
    <AuthShell>
      <AuthHeading title="创建账号" subtitle="填写手机号即可开启 ICAO 学习之旅" />
      <View style={styles.form}>
        <AuthField keyboardType="phone-pad" label="手机号" maxLength={11} onChangeText={setPhone} placeholder="请输入手机号" prefix="+86" value={phone} />
        <CodeField value={code} onChangeText={setCode} />
        <PasswordField label="设置密码" onChangeText={setPassword} placeholder="8-20 位，含字母和数字" value={password} />
        <PasswordField label="确认密码" onChangeText={setConfirm} placeholder="请再次输入密码" value={confirm} />
        <View style={styles.agreement}>
          <Checkbox checked={agree} label="我已阅读并同意" onPress={() => setAgree(!agree)} />
          <TextLink label="《用户协议》" onPress={() => router.push('/info/agreement')} />
          <TextLink label="《隐私政策》" onPress={() => router.push('/info/privacy')} />
        </View>
        <Button disabled={!ready} onPress={() => router.replace('/(tabs)/profile')} size="lg">注册</Button>
      </View>
      <View style={styles.bottomLink}>
        <Smartphone color={colors.mutedForeground} size={14} />
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
