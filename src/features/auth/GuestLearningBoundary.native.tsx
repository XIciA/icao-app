import { useEffect, useState, type PropsWithChildren } from 'react';
import { useAuth } from './AuthProvider';
import { switchLearningSyncToGuest } from '@/features/sync/learning-sync.native';
import { GlobalLoadingScreen } from '@/components/states/GlobalLoadingScreen';
import { CenteredState } from '@/components/states/CenteredState';
import { Screen } from '@/components/ui';

/** Never expose the previous account workspace while booting or entering guest learning. */
export function GuestLearningBoundary({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const guest = !auth.canAccessApp && !auth.restoring && !auth.session && !auth.accountRestoreUnavailable && !auth.accountDeletionPending;
  useEffect(() => {
    let current = true;
    setReady(false); setFailed(false);
    if (guest) void switchLearningSyncToGuest().then(() => { if (current) setReady(true); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [guest, attempt]);
  if (auth.canAccessApp || (guest && ready)) return children;
  if (failed) return <Screen><CenteredState title="本机学习记录暂未准备好" description="原有记录已保留，请重试。" actionLabel="重新检查" onAction={() => setAttempt(value => value + 1)} /></Screen>;
  return <GlobalLoadingScreen />;
}
