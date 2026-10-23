import { AppUpdatePrompt } from '@/features/app-updates/AppUpdatePrompt';
import { useEffect, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { NativeAiRecovery } from '@/features/ai/NativeAiRecovery.native';

import { recordingRepository } from '@/features/question-bank/recording/recording-repository';
import { CommerceRuntimeProvider } from '@/features/native-commercial-testflight/CommerceRuntimeProvider';
import { RadioMiniPlayer } from '@/features/radio-player/RadioMiniPlayer';
import { RadioPlayerProvider } from '@/features/radio-player/RadioPlayerProvider';
import { purgeExpiredSafeDiagnostics } from '@/platform/diagnostics/safe-diagnostic-store';

const DIAGNOSTIC_PURGE_INTERVAL_MS = 60 * 60 * 1_000;

export function AppRuntime({ children }: PropsWithChildren) {
  const auth = useAuth();
  useEffect(() => {
    recordingRepository.cleanupExpired();
    void purgeExpiredSafeDiagnostics();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void purgeExpiredSafeDiagnostics();
    });
    const interval = setInterval(() => { void purgeExpiredSafeDiagnostics(); }, DIAGNOSTIC_PURGE_INTERVAL_MS);
    return () => {
      appState.remove();
      clearInterval(interval);
    };
  }, []);

  return (
    <CommerceRuntimeProvider>
      {auth.canAccessApp ? <NativeAiRecovery key={auth.account?.accountId} /> : null}
      {auth.canAccessApp ? <AppUpdatePrompt /> : null}
      <RadioPlayerProvider>{children}{auth.canAccessApp ? <RadioMiniPlayer /> : null}</RadioPlayerProvider>
    </CommerceRuntimeProvider>
  );
}
