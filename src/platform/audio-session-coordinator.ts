import { setAudioModeAsync } from 'expo-audio';

export type AudioOwner = 'radio' | 'study' | 'recording' | 'recordingPlayback';

const pauseHandlers = new Map<AudioOwner, () => void>();
let activeOwner: AudioOwner | undefined;
let transition = Promise.resolve();

const profiles = {
  radio: { allowsRecording: false, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: true, shouldRouteThroughEarpiece: false },
  study: { allowsRecording: false, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false },
  recording: { allowsRecording: true, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false },
  recordingPlayback: { allowsRecording: false, interruptionMode: 'doNotMix' as const, playsInSilentMode: true, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false },
};

export function registerAudioOwner(owner: AudioOwner, pause: () => void) {
  pauseHandlers.set(owner, pause);
  return () => {
    if (pauseHandlers.get(owner) === pause) pauseHandlers.delete(owner);
    if (activeOwner === owner) activeOwner = undefined;
  };
}

export function claimAudioSession(owner: AudioOwner) {
  transition = transition.catch(() => undefined).then(async () => {
    if (activeOwner && activeOwner !== owner) pauseHandlers.get(activeOwner)?.();
    await setAudioModeAsync(profiles[owner]);
    activeOwner = owner;
  });
  return transition;
}

export function releaseAudioSession(owner: AudioOwner) {
  if (activeOwner === owner) activeOwner = undefined;
}

export function resetAudioSessionCoordinatorForTests() {
  pauseHandlers.clear();
  activeOwner = undefined;
  transition = Promise.resolve();
}
