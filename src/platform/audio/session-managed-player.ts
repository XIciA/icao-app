import {
  createAudioPlayer,
  useAudioPlayer,
  type AudioPlayerOptions,
  type AudioSource,
} from 'expo-audio';

function withManagedAudioSession(options: AudioPlayerOptions = {}): AudioPlayerOptions {
  return {
    ...options,
    keepAudioSessionActive: true,
  };
}

export function useSessionManagedAudioPlayer(
  source: AudioSource | string | number | null = null,
  options: AudioPlayerOptions = {},
) {
  return useAudioPlayer(source, withManagedAudioSession(options));
}

export function createSessionManagedAudioPlayer(
  source: AudioSource | string | number | null = null,
  options: AudioPlayerOptions = {},
) {
  return createAudioPlayer(source, withManagedAudioSession(options));
}
