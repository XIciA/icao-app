import { useCallback, useEffect, useState } from 'react';

import { embeddedQuestionBankRepository } from '../data/repository';
import type { QuestionBankDataset, QuestionBankId } from '../types';

type State =
  | { status: 'loading'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: QuestionBankDataset; error?: undefined }
  | { status: 'error'; data?: undefined; error: Error };

export function useQuestionBank(bankId: QuestionBankId | undefined) {
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

    void embeddedQuestionBankRepository
      .getDataset(bankId)
      .then((data) => {
        if (!active) return;
        setState(data ? { status: 'ready', data } : { status: 'error', error: new Error('question_bank_not_found') });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', error: error instanceof Error ? error : new Error('question_bank_load_failed') });
      });

    return () => {
      active = false;
    };
  }, [attempt, bankId]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
