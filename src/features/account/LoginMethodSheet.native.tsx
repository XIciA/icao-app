import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText, BottomSheet, Button, TextField } from '@/components/ui';
import { useAuth, type AccountDeletionAuthentication } from '@/features/auth/AuthProvider';
import { colors, spacing } from '@/theme';

type Props = { onClose(): void } & ({ provider: 'apple' | 'wechat'; bound: boolean; onVerified?: never }
  | { provider: 'phone'; bound: true; onVerified(grantId: string): Promise<void> });

export function LoginMethodSheet({ provider, bound, onClose, onVerified }: Props) {
  const auth = useAuth();
  const providers = auth.account?.providers ?? [];
  const options: { method: AccountDeletionAuthentication['method']; label: string }[] = [
    ...(auth.account?.hasPassword ? [{ method: 'password' as const, label: '登录密码' }] : []),
    ...(auth.account?.phoneBound ? [{ method: 'phone_otp' as const, label: '短信验证码' }] : []),
    ...(Platform.OS === 'ios' && providers.includes('apple') ? [{ method: 'apple' as const, label: 'Apple' }] : []),
    ...(providers.includes('wechat') ? [{ method: 'wechat' as const, label: '微信' }] : []),
  ];
  const [method, setMethod] = useState(options[0]?.method);
  const [password, setPassword] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const action = bound ? 'unbind' : 'bind';
  const actionRef = useRef(false);
  const name = provider === 'apple' ? 'Apple' : '微信';
  const title = provider === 'phone' ? '验证当前账号' : `${bound ? '解除' : '绑定'}${name}登录`;
  const canUnbind = provider === 'phone' || !bound || providers.some((value) => value !== provider);
  const ready = canUnbind && !!method && (method === 'apple' || method === 'wechat'
    || method === 'password' && !!password || method === 'phone_otp' && /^\d{6}$/u.test(phoneOtp));
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => { const time = Date.now(); setNow(time); if (time >= resendAt) clearInterval(timer); }, 250);
    return () => clearInterval(timer);
  }, [resendAt]);

  async function requestOtp() {
    if (actionRef.current || seconds) return;
    actionRef.current = true;
    setSending(true); setError('');
    try {
      const challenge = provider === 'phone' ? await auth.requestPhoneBindingVerificationOtp()
        : await auth.requestLoginMethodPhoneOtp(provider, action);
      const time = Date.now();
      setResendAt(time + Math.max(0, challenge.resendAllowedAt - challenge.serverTime));
      setNow(time);
    } catch { setError('验证码发送失败，请稍后重试。'); }
    finally { actionRef.current = false; setSending(false); }
  }

  async function submit() {
    if (!ready || actionRef.current) return;
    actionRef.current = true;
    setBusy(true); setError('');
    try {
      const authentication = { method: method!, password, phoneOtp };
      if (provider === 'phone') await onVerified(await auth.authorizePhoneBinding(authentication));
      else await auth.changeLoginMethod(provider, action, authentication);
      onClose();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : '';
      if (code === 'social_auth_cancelled') return;
      if (code === 'login_method_already_owned' || code === 'identity_already_in_use') setError('该登录方式已绑定其他账号，当前账号未变更。');
      else if (code === 'last_login_method_required') setError('请先绑定另一种登录方式，再解除此绑定。');
      else if (code === 'invalid_phone_otp' || code === 'phone_reauthentication_required') setError('验证码错误或已过期，请重新获取。');
      else if (code === 'invalid_phone_or_password' || code === 'invalid_credentials') setError('登录密码不正确，请重新输入。');
      else if (code === 'wechat_not_installed') setError('当前设备未安装微信。');
      else setError('操作未完成，请稍后重试。');
    } finally { actionRef.current = false; setBusy(false); }
  }

  return <BottomSheet accessibilityLabel={title} onClose={() => { if (!busy && !sending) onClose(); }} visible>
    <View style={styles.content}>
      <AppText variant="sectionTitle">{title}</AppText>
      <AppText variant="caption">{!canUnbind ? '这是当前唯一的登录方式，请先绑定另一种登录方式。'
        : provider === 'phone' ? '先验证已有登录方式，再验证新手机号。账号和学习数据保持不变。'
        : bound ? `解除后将不能通过${name}进入此账号，学习数据和会员权益保留。`
          : `先验证当前账号，再授权${name}登录。`}</AppText>
      {canUnbind ? <>
        {options.length > 1 ? <View style={styles.options}>{options.map((option) =>
          <Button disabled={busy || sending} key={option.method} onPress={() => { setMethod(option.method); setError(''); }}
            style={styles.option} variant={method === option.method ? 'primary' : 'outline'}>{option.label}</Button>)}</View>
          : <AppText variant="caption">验证方式：{options[0]?.label ?? '暂无可用方式'}</AppText>}
        {method === 'password' ? <TextField accessibilityLabel="登录密码" editable={!busy} label="登录密码" onChangeText={setPassword} secureTextEntry value={password} /> : null}
        {method === 'phone_otp' ? <>
          <Button disabled={busy || sending || seconds > 0} onPress={() => void requestOtp()} variant="outline">
            {sending ? '正在发送…' : seconds ? `${seconds}秒后重新获取` : '获取验证码'}
          </Button>
          <TextField accessibilityLabel="短信验证码" editable={!busy} keyboardType="number-pad" label="短信验证码" maxLength={6}
            onChangeText={(text) => setPhoneOtp(text.replace(/\D/gu, ''))} value={phoneOtp} />
        </> : null}
        {error ? <AppText accessibilityRole="alert" color={colors.destructive} variant="caption">{error}</AppText> : null}
        <Button disabled={!ready || busy || sending} loading={busy} onPress={() => void submit()}
          variant={bound && provider !== 'phone' ? 'destructive' : 'primary'}>{bound && provider !== 'phone' ? '验证并解除绑定' : '验证并继续'}</Button>
      </> : null}
      <Button disabled={busy || sending} onPress={onClose} variant="outline">取消</Button>
    </View>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  content: { gap: spacing[4] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  option: { flexGrow: 1 },
});
