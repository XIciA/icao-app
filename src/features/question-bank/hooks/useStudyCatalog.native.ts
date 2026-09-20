import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { normalizeStudyScope } from '@icao/contracts';
import { useProfile } from '@/features/account/profile-store.native';
import { nativeCommerceEnvironmentSnapshot, subscribeNativeCommerceEnvironment } from '@/features/native-commercial-testflight/commerce-environment';
import { getEmbeddedQuestionBanks, loadQuestionBank } from '../data/repository.native';
import { scopeDataset } from '../lib/study-scope';

export function useStudyCatalog() {
  const profile = useProfile();
  const owner = useSyncExternalStore(subscribeNativeCommerceEnvironment, nativeCommerceEnvironmentSnapshot, nativeCommerceEnvironmentSnapshot);
  const [loaded, setLoaded] = useState<{ owner: string; datasets: ReturnType<typeof getEmbeddedQuestionBanks> }>();
  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all(getEmbeddedQuestionBanks().map(async (bank) => (await loadQuestionBank(bank.id))?.dataset ?? bank))
      .then((datasets) => { if (active) setLoaded({ owner, datasets }); })
      .catch(() => { /* The built-in directory remains usable offline. */ });
    return () => { active = false; };
  }, [owner]));
  return useMemo(() => (loaded?.owner === owner ? loaded.datasets : getEmbeddedQuestionBanks())
    .map((bank) => scopeDataset(bank, normalizeStudyScope(profile.studyScope), profile.target))
    .filter((bank) => bank.declaredCardCount > 0), [loaded, owner, profile.studyScope, profile.target]);
}
