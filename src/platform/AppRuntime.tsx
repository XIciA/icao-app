import { StartupBrandScreen } from '@/components/states/StartupBrandScreen';
import { DownloadRuntime } from '@/features/question-bank/downloads/DownloadRuntime';
import { AppUpdatePrompt } from '@/features/app-updates/AppUpdatePrompt';
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
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
  const [startupPending, setStartupPending] = useState(Platform.OS === 'android');
  const finishStartup = useCallback(() => setStartupPending(false), []);
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
      {!startupPending ? <DownloadRuntime key={auth.account?.accountId} /> : null}
      {!startupPending && auth.canAccessApp ? <NativeAiRecovery key={auth.account?.accountId} /> : null}
      <AppUpdatePrompt startup={startupPending} onStartupComplete={finishStartup} />
      <RadioPlayerProvider>{startupPending ? <StartupBrandScreen /> : children}{!startupPending && auth.canAccessApp ? <RadioMiniPlayer /> : null}</RadioPlayerProvider>
    </CommerceRuntimeProvider>
  );
}
