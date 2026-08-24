import Storage from '@/platform/storage';

export const RADIO_PLAYER_STORAGE_KEY = 'icao.radio-player.v1';

let activeSession = false;
let resetRuntime: (() => Promise<void>) | undefined;
let lifecycleEpoch = 0;
let lifecycleQueue = Promise.resolve();

export async function activateRadioPlayerSession() {
  const activationEpoch = lifecycleEpoch += 1;
  try {
    await lifecycleQueue;
  } catch {
    return false;
  }
  if (activationEpoch !== lifecycleEpoch) return false;
  activeSession = true;
  return true;
}

export function registerRadioPlayerRuntimeReset(handler: () => Promise<void>) {
  resetRuntime = handler;
  return () => {
    if (resetRuntime === handler) resetRuntime = undefined;
  };
}

export function readRadioPlayerSnapshot() {
  if (!activeSession) return Promise.resolve(null);
  return Storage.getItem(RADIO_PLAYER_STORAGE_KEY);
}

export function saveRadioPlayerSnapshot(snapshot: string) {
  if (!activeSession) return Promise.resolve();
  return Storage.setItem(RADIO_PLAYER_STORAGE_KEY, snapshot);
}

export function clearRadioPlayerAccountData() {
  lifecycleEpoch += 1;
  activeSession = false;
  const operation = lifecycleQueue.catch(() => undefined).then(async () => {
    await resetRuntime?.();
    await Storage.removeItem(RADIO_PLAYER_STORAGE_KEY);
  });
  lifecycleQueue = operation;
  return operation;
}
