import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  IOSCategoryMode,
} from 'react-native-track-player';

import { isNativeRadioContentTrack, isNativeRadioIntervalTrack, radioIntervalStartPosition } from './native-queue';

type RadioRemoteHandlers = {
  next: () => Promise<void>;
  pause: () => void;
  play: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  stop: () => void;
};

let setupPromise: Promise<void> | undefined;
let remoteHandlers: RadioRemoteHandlers | undefined;
let radioContentPlaybackRate = 1;

export function setRadioContentPlaybackRate(rate: number) {
  radioContentPlaybackRate = rate;
}

export function setRadioRemoteHandlers(handlers?: RadioRemoteHandlers) {
  remoteHandlers = handlers;
}

export function ensureRadioTrackPlayer() {
  setupPromise ??= TrackPlayer.setupPlayer({
    autoHandleInterruptions: true,
    autoUpdateMetadata: true,
    backBuffer: 30,
    iosCategory: IOSCategory.Playback,
    iosCategoryMode: IOSCategoryMode.SpokenAudio,
    maxBuffer: 60,
    minBuffer: 10,
    playBuffer: 2,
  }).catch((error: unknown) => {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    if (!code.includes('already_initialized')) throw error;
  }).then(() => TrackPlayer.updateOptions({
    android: {
      alwaysPauseOnInterruption: true,
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SeekTo,
      Capability.SkipToPrevious,
      Capability.SkipToNext,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SeekTo,
      Capability.SkipToPrevious,
      Capability.SkipToNext,
    ],
    progressUpdateEventInterval: 1,
  }));
  return setupPromise;
}

async function run(handler: (() => void | Promise<void>) | undefined, fallback: () => Promise<void>) {
  if (handler) {
    await handler();
    return;
  }
  await fallback();
}

export async function radioPlaybackService() {
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, ({ track }) => {
    if (isNativeRadioIntervalTrack(track)) {
      void TrackPlayer.setRate(1)
        .then(() => TrackPlayer.seekTo(radioIntervalStartPosition(track.radioIntervalSeconds)))
        .catch(async () => {
          try {
            await TrackPlayer.skipToNext(0);
            await TrackPlayer.play();
          } catch {
            // The provider reports content errors. A broken interval must not stop a prepared next track.
          }
        });
      return;
    }
    if (isNativeRadioContentTrack(track)) void TrackPlayer.setRate(radioContentPlaybackRate);
  });
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    void run(remoteHandlers?.play, TrackPlayer.play);
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    void run(remoteHandlers?.pause, TrackPlayer.pause);
  });
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    void run(remoteHandlers?.next, async () => {
      try { await TrackPlayer.skipToNext(0); } catch { /* No prepared next track. */ }
    });
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    void run(remoteHandlers?.previous, async () => {
      try { await TrackPlayer.skipToPrevious(0); } catch { /* No prepared previous track. */ }
    });
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    const handler = remoteHandlers?.seek;
    void run(handler ? () => handler(position) : undefined, () => TrackPlayer.seekTo(position));
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    void run(remoteHandlers?.stop, TrackPlayer.stop);
  });
}
