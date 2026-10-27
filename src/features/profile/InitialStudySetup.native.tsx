import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/account/profile-store.native';
import { runLearningSync } from '@/features/sync/learning-sync.native';
import { StudyPreferencesSheet } from './StudyPreferencesSheet.native';

/** Only a server-created pending marker opts a new account into setup. */
export function InitialStudySetup() {
  const auth = useAuth();
  const accountId = auth.canAccessApp ? auth.account?.accountId : undefined;
  const profile = useProfile();
  const pending = profile.studySetup === 'pending';
  const [verifiedAccount, setVerifiedAccount] = useState<string>();
  useFocusEffect(useCallback(() => {
    let active = true;
    setVerifiedAccount(undefined);
    if (accountId && pending) {
      // Reconcile another device's completion before showing a cached prompt.
      void runLearningSync(accountId).then(status => {
        if (active && status.boundUserId === accountId && !status.lastError) setVerifiedAccount(accountId);
      }).catch(() => undefined);
    }
    return () => { active = false; setVerifiedAccount(undefined); };
  }, [accountId, pending]));
  return <StudyPreferencesSheet initialSetup visible={!!accountId && verifiedAccount === accountId && pending}
    accountId={accountId} profile={profile} onClose={() => undefined} />;
}
