import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import {
  nativeCommerceEnvironmentSnapshot,
  subscribeNativeCommerceEnvironment,
} from '@/features/native-commercial-testflight/commerce-environment';
import { ApiClientError } from '@/platform/api-client';
import { questionBankRepository } from '../data/repository';
import type { QuestionBankId, QuestionBankTopic } from '../types';

type State =
  | { status: 'loading'; topic?: undefined; error?: undefined }
  | { status: 'ready'; topic: QuestionBankTopic; error?: undefined }
  | { status: 'membership-required'; topic?: undefined; error?: undefined }
  | { status: 'error'; topic?: undefined; error: Error };

export function useQuestionBankTopic(bankId: QuestionBankId | undefined, categoryId: string | undefined, topicId: string | undefined) {
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
    if (!bankId || !categoryId || !topicId) {
      setState({ status: 'error', error: new Error('invalid_question_bank_topic') });
      return () => { active = false; };
    }
    void questionBankRepository.getTopic(bankId, categoryId, topicId)
      .then((topic) => {
        if (!active) return;
        setState(topic ? { status: 'ready', topic } : { status: 'error', error: new Error('question_bank_topic_not_found') });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiClientError && error.code === 'membership_required') {
          setState({ status: 'membership-required' });
          return;
        }
        setState({ status: 'error', error: error instanceof Error ? error : new Error('question_bank_topic_load_failed') });
      });
    return () => { active = false; };
  }, [attempt, bankId, categoryId, environmentSnapshot, topicId]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
