import type { PrivacyDeletionResponse } from '@icao/contracts';

import { recordingRepository } from '@/features/question-bank/recording/recording-repository';
import { clearRadioPlayerAccountData } from '@/features/radio-player/radio-player-storage';
import {
  assertLearningWriteContext,
  captureLearningWriteContext,
  applyPrivacyAiResultReset,
  applyPrivacyLearningDataReset,
  deleteLocalAiResult,
  runLearningSync,
} from '@/features/sync/learning-sync.native';
import { apiAccessToken, apiRequestWithAccessToken } from '@/platform/api-client';
import { completePrivacyAction, pendingPrivacyActionFor } from './privacy-action-state';

async function privacyRequestContext(accountId: string) {
  const context = captureLearningWriteContext(accountId);
  const token = await apiAccessToken();
  assertLearningWriteContext(context);
  if (!token) throw new Error('auth_request_not_completed');
  return { context, token };
}

export async function deleteAiResult(accountId: string | undefined, recordId: string) {
  if (!accountId) throw new Error('auth_request_not_completed');
  const { context, token } = await privacyRequestContext(accountId);
  await runLearningSync(accountId);
  assertLearningWriteContext(context);
  const response = await apiRequestWithAccessToken<PrivacyDeletionResponse>(
    `/v1/account/privacy/ai-results/${encodeURIComponent(recordId)}`,
    token, { method: 'DELETE' },
  );
  await deleteLocalAiResult(recordId, context);
  await runLearningSync(accountId).catch(() => undefined);
  return response;
}

export async function deleteAllAiResults(accountId: string) {
  const { context, token } = await privacyRequestContext(accountId);
  await runLearningSync(accountId).catch(() => undefined);
  const pending = await pendingPrivacyActionFor(accountId, 'delete_all_ai_results');
  assertLearningWriteContext(context);
  const response = await apiRequestWithAccessToken<PrivacyDeletionResponse>('/v1/account/privacy/ai-results', token, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmation: '删除全部AI结果', idempotencyKey: pending.idempotencyKey }),
  });
  await applyPrivacyAiResultReset(response, context);
  await completePrivacyAction(pending);
  await runLearningSync(accountId).catch(() => undefined);
  return response;
}

export async function clearLearningData(accountId: string) {
  const { context, token } = await privacyRequestContext(accountId);
  const pending = await pendingPrivacyActionFor(accountId, 'clear_learning_data');
  assertLearningWriteContext(context);
  const response = await apiRequestWithAccessToken<PrivacyDeletionResponse>('/v1/account/privacy/learning-data', token, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmation: '清除学习数据', idempotencyKey: pending.idempotencyKey }),
  });
  await applyPrivacyLearningDataReset(response, context, async () => {
    recordingRepository.clearAll();
    await clearRadioPlayerAccountData();
  });
  await completePrivacyAction(pending);
  await runLearningSync(accountId).catch(() => undefined);
  return response;
}

