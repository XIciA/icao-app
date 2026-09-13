import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  IOSCategoryMode,
} from 'react-native-track-player';

import { RadioOperationCoordinator } from './operation-coordinator';

import { isNativeRadioContentTrack, isNativeRadioIntervalTrack } from './native-queue';

type RadioRemoteHandlers = {
  next: () => Promise<void>;
  pause: () => void;
  play: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (position: number) => Promise<void>;
  stop: () => void;
};

const nativeMutations = new RadioOperationCoordinator();
export const mutateRadioPlayer = <T>(current: () => boolean, operation: () => Promise<T>) => nativeMutations.run(current, operation);

export type RadioPlaybackEvent = { type: Event; track?: unknown; code?: string; message?: string; paused?: boolean; permanent?: boolean };
let playbackHandler: ((event: RadioPlaybackEvent) => void) | undefined;
export function setRadioPlaybackHandler(handler?: (event: RadioPlaybackEvent) => void) { playbackHandler = handler; }

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
    autoHandleInterruptions: false,
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
  const attempt = setupPromise;
  void attempt.catch(() => { if (setupPromise === attempt) setupPromise = undefined; });
  return attempt;
}

async function safeRun(handler: (() => void | Promise<void>) | undefined, fallback: () => Promise<void>) {
  try {
    if (handler) await handler();
    else await fallback();
  } catch {
    playbackHandler?.({ type: Event.PlaybackError, code: 'radio_remote_command_failed' });
  }
}

export async function radioPlaybackService() {
  let transition = 0;
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
    const request = ++transition;
    const { track } = event;
    playbackHandler?.({ ...event, type: Event.PlaybackActiveTrackChanged });
    void mutateRadioPlayer(() => request === transition, async () => {
      if (isNativeRadioIntervalTrack(track)) {
        await TrackPlayer.setRate(1);
      } else if (isNativeRadioContentTrack(track)) {
        await TrackPlayer.setRate(radioContentPlaybackRate);
      }
    }).catch(() => playbackHandler?.({ type: Event.PlaybackError, code: 'radio_transition_failed' }));
  });
  TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
    playbackHandler?.({ ...event, type: Event.PlaybackError });
  });
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event) => {
    playbackHandler?.({ ...event, type: Event.PlaybackQueueEnded });
  });
  TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
    playbackHandler?.({ ...event, type: Event.RemoteDuck });
  });
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    void safeRun(remoteHandlers?.play, TrackPlayer.play);
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    void safeRun(remoteHandlers?.pause, TrackPlayer.pause);
  });
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    void safeRun(remoteHandlers?.next, async () => {
      try { await TrackPlayer.skipToNext(0); } catch { /* No prepared next track. */ }
    });
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    void safeRun(remoteHandlers?.previous, async () => {
      try { await TrackPlayer.skipToPrevious(0); } catch { /* No prepared previous track. */ }
    });
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
    const handler = remoteHandlers?.seek;
    void safeRun(handler ? () => handler(position) : undefined, () => TrackPlayer.seekTo(position));
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    void safeRun(remoteHandlers?.stop, TrackPlayer.stop);
  });
}
