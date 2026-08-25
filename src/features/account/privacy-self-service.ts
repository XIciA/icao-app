import type { AccountDataExportResponse, PrivacyDeletionResponse } from '@icao/contracts';

import { readProfile } from '@/features/account/profile-store';
import { recordingRepository } from '@/features/question-bank/recording/recording-repository';
import { clearRadioPlayerAccountData } from '@/features/radio-player/radio-player-storage';
import {
  applyPrivacyAiResultReset,
  applyPrivacyLearningDataReset,
  deleteLocalAiResult,
  runLearningSync,
} from '@/features/sync/learning-sync';
import { apiRequest } from '@/platform/api-client';

export async function deleteAiResult(accountId: string | undefined, recordId: string) {
  if (!accountId) {
    await deleteLocalAiResult(recordId);
    return { deletedCount: 1 };
  }
  await runLearningSync(accountId);
  const response = await apiRequest<PrivacyDeletionResponse>(
    `/v1/account/privacy/ai-results/${encodeURIComponent(recordId)}`,
    { method: 'DELETE' },
  );
  await deleteLocalAiResult(recordId);
  await runLearningSync(accountId).catch(() => undefined);
  return response;
}

export async function deleteAllAiResults(accountId: string) {
  await runLearningSync(accountId).catch(() => undefined);
  const response = await apiRequest<PrivacyDeletionResponse>('/v1/account/privacy/ai-results', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmation: '删除全部AI结果' }),
  });
  await applyPrivacyAiResultReset(response);
  await runLearningSync(accountId).catch(() => undefined);
  return response;
}

export async function clearLearningData(accountId: string) {
  const response = await apiRequest<PrivacyDeletionResponse>('/v1/account/privacy/learning-data', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirmation: '清除学习数据' }),
  });
  await applyPrivacyLearningDataReset(response);
  recordingRepository.clearAll();
  await clearRadioPlayerAccountData();
  await runLearningSync(accountId).catch(() => undefined);
  return response;
}

export async function exportAccountAndLearningData(accountId: string) {
  await runLearningSync(accountId);
  const [cloudExport, localProfile] = await Promise.all([
    apiRequest<AccountDataExportResponse>('/v1/account/privacy/export'),
    readProfile(),
  ]);
  return {
    ...cloudExport,
    device: { localProfile },
  };
}
