import { useEffect, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { recordingRepository } from '@/features/question-bank/recording/recording-repository';
import { RadioMiniPlayer } from '@/features/radio-player/RadioMiniPlayer';
import { RadioPlayerProvider } from '@/features/radio-player/RadioPlayerProvider';
import { purgeExpiredSafeDiagnostics } from '@/platform/diagnostics/safe-diagnostic-store';

const DIAGNOSTIC_PURGE_INTERVAL_MS = 60 * 60 * 1_000;

export function AppRuntime({ children }: PropsWithChildren) {
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

  return <RadioPlayerProvider>{children}<RadioMiniPlayer /></RadioPlayerProvider>;
}
