import { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { CenteredState } from '@/components/states/CenteredState';
import { AppText, Button, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme';

export function AccountRestoreState({ retry, signOut }: { retry(): Promise<void>; signOut(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const actionRef = useRef(false);
  async function run(action: () => Promise<void>) {
    if (actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch { setError('操作未完成，请重试。'); }
    finally { actionRef.current = false; setBusy(false); }
  }
  return <Screen>
    <CenteredState title="暂时无法确认账号状态" description="请重新检查，或退出当前登录后重试。本机学习数据会保留。"
      secondary={<>
        {error ? <AppText color={colors.destructive} style={styles.action} variant="caption">{error}</AppText> : null}
        <Button disabled={busy} onPress={() => { void run(retry); }} style={styles.action}>重新检查</Button>
        <Button disabled={busy} onPress={() => { void run(signOut); }} style={styles.action} variant="outline">退出登录</Button>
      </>} />
  </Screen>;
}

const styles = StyleSheet.create({ action: { marginTop: spacing[4], minWidth: 160 } });
