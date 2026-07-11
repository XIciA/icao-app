import { useRouter } from 'expo-router';
import { KeyRound, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { AuthShell, AuthHeading, AuthField, CodeField } from './auth-ui';

export function PhoneCodeScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const ready = phone.length >= 11 && code.length === 6;

  return (
    <AuthShell>
      <AuthHeading title="验证码登录" subtitle="未注册的手机号将自动创建账号" />
      <View style={styles.formWideGap}>
        <AuthField keyboardType="phone-pad" label="手机号" maxLength={11} onChangeText={setPhone} placeholder="请输入手机号" prefix="+86" value={phone} />
        <View style={styles.codeGroup}>
          <View style={styles.inline}>
            <AppText variant="button">短信验证码</AppText>
            <AppText variant="caption">已发送至 138****8888</AppText>
          </View>
          <CodeField value={code} onChangeText={setCode} />
          <AppText variant="caption">没有收到？ <AppText color={colors.primary} variant="caption">重新获取（59s）</AppText></AppText>
        </View>
        <Button leading={<KeyRound color={colors.primaryForeground} size={16} />} disabled={!ready} onPress={() => router.replace('/(tabs)/profile')} size="lg">登录 / 注册</Button>
      </View>
      <Pressable accessibilityLabel="使用密码登录" onPress={() => router.replace('/auth/login')} style={styles.bottomLink}>
        <Smartphone color={colors.mutedForeground} size={14} />
        <AppText variant="caption"> 使用密码登录</AppText>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  formWideGap: { gap: spacing[5], marginTop: spacing[8] },
  codeGroup: { gap: spacing[2] },
  inline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  bottomLink: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingBottom: spacing[3], paddingTop: spacing[8] },
});
