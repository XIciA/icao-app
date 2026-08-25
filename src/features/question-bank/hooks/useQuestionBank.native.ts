import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import {
  nativeCommerceEnvironmentSnapshot,
  subscribeNativeCommerceEnvironment,
} from '@/features/native-commercial-testflight/commerce-environment';
import { loadQuestionBank, type QuestionBankSource } from '../data/repository';
import type { QuestionBankDataset, QuestionBankId } from '../types';

type State =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: QuestionBankDataset; source: QuestionBankSource; warning?: string; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

export function useQuestionBank(bankId: QuestionBankId | undefined) {
  const environmentSnapshot = useSyncExternalStore(
    subscribeNativeCommerceEnvironment,
    nativeCommerceEnvironmentSnapshot,
    nativeCommerceEnvironmentSnapshot,
  );
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });

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

    return () => {
      active = false;
    };
  }, [attempt, bankId, environmentSnapshot]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
