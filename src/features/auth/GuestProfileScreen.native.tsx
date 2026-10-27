import { Image, StyleSheet, View } from 'react-native';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Avatar } from '@/components/account/account-ui';
import { SoftGlow } from '@/components/visual/SoftGlow';
import { UserRound } from '@/components/ui/icons';
import { colors, spacing } from '@/theme';
import { useLoginEntry } from './use-login-entry';
import { useAuth } from './AuthProvider';
import { accountEntryLabel, publicAccountStatus } from './public-account-status';
import { useRef, useState } from 'react';

export function GuestProfileScreen() {
  const login = useLoginEntry();
  const router = useAppRouter();
  const auth = useAuth();
  const status = publicAccountStatus(auth);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const retrying = useRef(false);
  async function retry() {
    if (retrying.current) return;
    retrying.current = true; setBusy(true); setError('');
    try { await auth.retryAccountRestore(); }
    catch { setError('检查未完成，请稍后重试。'); }
    finally { retrying.current = false; setBusy(false); }
  }
  if (status !== 'guest') return <Screen background={<SoftGlow intensity={0.8} size={320} style={styles.glow} />} scroll bottomInset contentStyle={styles.screen}>
    <AppText variant="pageTitle">我的</AppText>
    <Card style={styles.card}>
      <Avatar icon={UserRound} size={60} />
      <AppText variant="sectionTitle">{status === 'unavailable' ? '暂时无法确认账号状态' : accountEntryLabel(status)}</AppText>
      <AppText variant="caption" style={styles.caption}>
        {status === 'unavailable' ? '账号状态尚未确认，请重新检查。你可以继续浏览题库目录。'
          : status === 'deleting' ? '账号注销正在处理，你可以查看进度或继续浏览题库目录。'
            : status === 'confirmation-required' ? '请完成当前账号的协议确认，即可继续学习。'
              : '正在恢复已有登录，请稍候。题库目录仍可浏览。'}
      </AppText>
      {error ? <AppText color={colors.destructive} variant="caption">{error}</AppText> : null}
      {status !== 'restoring' ? <Button disabled={busy} onPress={status === 'unavailable' ? () => { void retry(); } : () => login('/account/profile')}>
        {busy ? '正在检查…' : accountEntryLabel(status)}
      </Button> : null}
      <Button variant="ghost" onPress={() => router.push('/(tabs)')}>浏览题库</Button>
    </Card>
  </Screen>;
  return <Screen background={<SoftGlow intensity={0.8} size={320} style={styles.glow} />} scroll bottomInset contentStyle={styles.guestScreen}>
    <View style={styles.invitation}>
      <Image accessibilityIgnoresInvertColors accessible={false} source={require('../../../assets/illustrations/guest-learning-bookmark.png')} style={styles.illustration} resizeMode="contain" />
      <AppText variant="pageTitle" style={styles.title}>{'让每一次学习，\n都有记录'}</AppText>
      <AppText variant="caption" style={styles.caption}>{'登录后，同步学习进度、\n收藏与标注。'}</AppText>
      <Button size="lg" style={styles.loginButton} onPress={() => login('/(tabs)/profile')}>登录 / 注册</Button>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  glow: { left: -170, top: -180 },
  screen: { gap: spacing[4], paddingTop: spacing[3] },
  card: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[6] },
  caption: { color: colors.mutedForeground, textAlign: 'center' },
  guestScreen: { flexGrow: 1, justifyContent: 'center', paddingTop: spacing[8] },
  invitation: { alignItems: 'center', gap: spacing[5], paddingBottom: spacing[6] },
  illustration: { width: 190, height: 200, marginBottom: spacing[2] },
  title: { textAlign: 'center' },
  loginButton: { alignSelf: 'center', width: '100%', maxWidth: 320, marginTop: spacing[1] },
});
