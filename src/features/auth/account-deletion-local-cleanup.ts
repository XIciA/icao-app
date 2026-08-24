import { clearProfile } from '@/features/account/profile-store';
import { clearLocalAiConsent } from '@/features/ai/ai-client';
import { recordingRepository } from '@/features/question-bank/recording/recording-repository';
import { clearQuestionBankResourceCredentials } from '@/features/question-bank/platform/remote-resource-service';
import { clearRadioPlayerAccountData } from '@/features/radio-player/radio-player-storage';
import { clearPersonalLearningData } from '@/features/sync/learning-sync';
import { clearAudioDiagnostics } from '@/platform/audio/audio-diagnostics';
import { clearSafeDiagnostics } from '@/platform/diagnostics/safe-diagnostic-store';

export async function clearDeletedAccountLocalData() {
  await clearPersonalLearningData();
  await clearLocalAiConsent();
  await clearProfile();
  await clearRadioPlayerAccountData();
  await clearQuestionBankResourceCredentials();
  recordingRepository.clearAll();
  clearAudioDiagnostics();
  await clearSafeDiagnostics();
}
