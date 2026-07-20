import { useEffect, type PropsWithChildren } from 'react';

import { recordingRepository } from '@/features/question-bank/recording/recording-repository';
import { RadioMiniPlayer } from '@/features/radio-player/RadioMiniPlayer';
import { RadioPlayerProvider } from '@/features/radio-player/RadioPlayerProvider';

export function AppRuntime({ children }: PropsWithChildren) {
  useEffect(() => {
    recordingRepository.cleanupExpired();
  }, []);

  return <RadioPlayerProvider>{children}<RadioMiniPlayer /></RadioPlayerProvider>;
}
