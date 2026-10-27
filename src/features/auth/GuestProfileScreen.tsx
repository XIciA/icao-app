import { StyleSheet, View } from 'react-native';
import { useAppRouter } from '@/components/navigation/useAppRouter';
import { AppText, Button, Card, Screen } from '@/components/ui';
import { Avatar } from '@/components/account/account-ui';
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
  if (status !== 'guest') return <Screen scroll bottomInset contentStyle={styles.screen}>
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
  return <Screen scroll bottomInset contentStyle={styles.screen}>
    <AppText variant="pageTitle">我的</AppText>
    <Card style={styles.card}>
      <Avatar icon={UserRound} size={60} />
      <AppText variant="sectionTitle">登录，开启你的学习记录</AppText>
      <AppText variant="caption" style={styles.caption}>保存学习进度、收藏与标注，随时接着学习。</AppText>
      <Button onPress={() => login('/(tabs)/profile')}>登录 / 注册</Button>
    </Card>
    <Button variant="outline" onPress={() => login('/info/guide', '登录后体验使用指南')}>使用指南</Button>
    <View style={styles.links}>
      <Button variant="ghost" onPress={() => router.push('/legal/agreement')}>用户协议</Button>
      <Button variant="ghost" onPress={() => router.push('/legal/privacy')}>隐私政策</Button>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  screen: { gap: spacing[4], paddingTop: spacing[3] },
  card: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[6] },
  caption: { color: colors.mutedForeground, textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
