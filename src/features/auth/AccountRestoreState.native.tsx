import { useRef, useState } from 'react';
import { CenteredState } from '@/components/states/CenteredState';
import { Screen } from '@/components/ui';

export function AccountRestoreState({ retry, signOut }: { retry(): Promise<void>; signOut(): Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const actionRef = useRef(false);
  async function run(action: () => Promise<void>) {
    if (actionRef.current) return;
    actionRef.current = true;
    setBusy(true);
    try { await action(); }
    catch { /* Keep the failure surface available for another attempt. */ }
    finally { actionRef.current = false; setBusy(false); }
  }
  return <Screen><CenteredState kind="account" busy={busy}
    actionLabel="重新检查" onAction={() => { void run(retry); }}
    secondaryLabel="退出登录" onSecondary={() => { void run(signOut); }} /></Screen>;
}
