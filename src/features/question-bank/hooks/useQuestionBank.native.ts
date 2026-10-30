import { canRetainContentOnAccessRefresh, commerceContentAccessSnapshot, subscribeCommerceEntitlementChanges } from '@/features/native-commercial-testflight/commerce-entitlement-events';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { normalizeStudyScope } from '@icao/contracts';
import { useProfile } from '@/features/account/profile-store.native';
import { scopeDataset } from '../lib/study-scope';

import {
  nativeCommerceEnvironmentSnapshot,
  subscribeNativeCommerceEnvironment,
} from '@/features/native-commercial-testflight/commerce-environment';
import { loadQuestionBank, subscribeQuestionBankCatalog, type QuestionBankSource } from '../data/repository.native';
import type { QuestionBankDataset, QuestionBankId } from '../types';

type State =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: QuestionBankDataset; source: QuestionBankSource; warning?: string; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

export function useQuestionBank(bankId: QuestionBankId | undefined, preserveSession = false) {
  const profile = useProfile();
  const environmentSnapshot = useSyncExternalStore(
    subscribeNativeCommerceEnvironment,
    nativeCommerceEnvironmentSnapshot,
    nativeCommerceEnvironmentSnapshot,
  );
  const accessSnapshot = useSyncExternalStore(subscribeCommerceEntitlementChanges, commerceContentAccessSnapshot, commerceContentAccessSnapshot);
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([bankId, environmentSnapshot, attempt, accessSnapshot]);
  const [response, setResponse] = useState<{ key: string; value: State }>();
  const state = useMemo<State>(() => response && (response.key === requestKey || JSON.parse(response.key)[0] === bankId && JSON.parse(response.key)[1] === environmentSnapshot && canRetainContentOnAccessRefresh(JSON.parse(response.key)[3], accessSnapshot)) ? response.value : { status: 'loading' }, [response, requestKey, bankId, environmentSnapshot, accessSnapshot]);

  useEffect(() => {
    let active = true;
    const setState = (value: State) => setResponse(previous => preserveSession && previous && JSON.parse(previous.key)[0] === bankId && JSON.parse(previous.key)[1] === environmentSnapshot && canRetainContentOnAccessRefresh(JSON.parse(previous.key)[3], accessSnapshot) && previous.value.status === 'ready' && value.status === 'ready' ? { key: requestKey, value: previous.value } : { key: requestKey, value });
    // Keep the same owner's usable content while revalidating.

    if (!bankId) {
      setState({ status: 'error', error: new Error('invalid_question_bank') });
      return () => {
        active = false;
      };
    }

    void loadQuestionBank(bankId)
      .then((result) => {
        if (!active) return;
        setState(result ? { status: 'ready', data: result.dataset, source: result.source, warning: result.warning } : { status: 'error', error: new Error('question_bank_not_found') });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', error: error instanceof Error ? error : new Error('question_bank_load_failed') });
      });

    const unsubscribe = subscribeQuestionBankCatalog(dataset => {
      if (active && dataset.id === bankId) setState({ status: 'ready', data: dataset, source: 'remote' });
    });
    return () => { active = false; unsubscribe(); };
  }, [attempt, bankId, environmentSnapshot, requestKey, preserveSession, accessSnapshot]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const projected = useMemo(() => state.status === 'ready'
    ? { ...state, catalog: state.data, data: scopeDataset(state.data, normalizeStudyScope(profile.studyScope), profile.target) }
    : state, [state, profile.studyScope, profile.target]);
  return { ...projected, retry };
}
