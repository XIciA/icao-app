import { clearProfile } from '@/features/account/profile-store.native';
import { clearPendingPrivacyActionsForAccount } from '@/features/account/privacy-action-state';
import { clearLocalAiConsent } from '@/features/ai/ai-client';
import { recordingRepository } from '@/features/question-bank/recording/recording-repository';
import { clearQuestionBankResourceCredentials } from '@/features/question-bank/platform/remote-resource-service';
import { clearRadioPlayerAccountData } from '@/features/radio-player/radio-player-storage';
import { clearPersonalLearningData } from '@/features/sync/learning-sync.native';
import { clearAudioDiagnostics } from '@/platform/audio/audio-diagnostics';
import { clearSafeDiagnostics } from '@/platform/diagnostics/safe-diagnostic-store';
import { clearLegalConsentReceipt } from '@/features/app-content/legal-consent.native';

export async function clearDeletedAccountLocalData(accountId?: string) {
  await clearPersonalLearningData(accountId);
  await clearLocalAiConsent();
  await clearProfile(accountId);
  if (accountId) await clearLegalConsentReceipt(accountId);
  await clearRadioPlayerAccountData();
  await clearQuestionBankResourceCredentials();
  recordingRepository.clearAll();
  clearAudioDiagnostics();
  await clearSafeDiagnostics();
  await clearPendingPrivacyActionsForAccount(accountId);
}
