import { requireOptionalNativeModule } from 'expo-modules-core';
export type AudioInterruptionEvent = { phase: 'began' | 'ended'; isCall: boolean };
type Observer = { addListener(name: 'interruption', listener: (event: AudioInterruptionEvent) => void): { remove(): void } };
const observer = requireOptionalNativeModule<Observer>('IcaoAudioInterruption');
export function observeAudioInterruption(listener: (event: AudioInterruptionEvent) => void) {
  return observer?.addListener('interruption', listener) ?? { remove() {} };
}
