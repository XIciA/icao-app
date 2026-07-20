import type { PropsWithChildren } from 'react';

import { RadioMiniPlayer } from '@/features/radio-player/RadioMiniPlayer';
import { RadioPlayerProvider } from '@/features/radio-player/RadioPlayerProvider';

export function AppRuntime({ children }: PropsWithChildren) {
  return <RadioPlayerProvider>{children}<RadioMiniPlayer /></RadioPlayerProvider>;
}
