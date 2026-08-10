import type { AudioStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { audioSessionOrchestrator, emitAudioDiagnostic, type AudioLease } from '@/platform/audio';

import { recordingRepository } from './recording-repository';
import type { RecordingAsset } from './types';

export const RECORDING_PLAYBACK_START_TIMEOUT_MS = 4_000;

export type RecordingPlaybackError = 'asset_missing' | 'playback_load_failed' | 'playback_start_failed';

const STATUS_ID = 'recording-playback-web';

function initialStatus(asset?: RecordingAsset): AudioStatus {
  return {
    currentTime: 0,
    didJustFinish: false,
    duration: asset ? asset.durationMillis / 1_000 : 0,
    id: STATUS_ID,
    isBuffering: false,
    // A committed Blob URL is immediately user-controllable on Web. Metadata
    // readiness is tracked independently so Safari can load it from play().
    isLoaded: Boolean(asset),
    loop: false,
    mute: false,
    playbackRate: 1,
    playbackState: asset ? 'loading' : 'idle',
    playing: false,
    reasonForWaitingToPlay: '',
    shouldCorrectPitch: true,
    timeControlStatus: 'paused',
  };
}

function loadedDuration(media: HTMLAudioElement, fallback: number) {
  return Number.isFinite(media.duration) && media.duration > 0 ? media.duration : fallback;
}

function normalizedMediaUri(uri: string) {
  if (typeof document === 'undefined') return uri;
  try {
    return new URL(uri, document.baseURI).href;
  } catch {
    return uri;
  }
}

export function useRecordingPlayback(asset?: RecordingAsset, pauseRequest = 0) {
  const [error, setError] = useState<RecordingPlaybackError>();
  const [retryToken, setRetryToken] = useState(0);
  const [status, setStatus] = useState<AudioStatus>(() => initialStatus(asset));
  const mediaRef = useRef<HTMLAudioElement | undefined>(undefined);
  const leaseRef = useRef<AudioLease | undefined>(undefined);
  const resumeAfterScrubRef = useRef(false);
  const sourceGenerationRef = useRef(0);
  const operationGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const currentAppState = AppState.currentState;
  const appStateRef = useRef(typeof currentAppState === 'string' ? currentAppState : 'active');

  const pauseMedia = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return true;
    try {
      media.pause();
      return true;
    } catch {
      return false;
    }
  }, []);

  const releaseLease = useCallback(async (lease = leaseRef.current) => {
    if (lease) await audioSessionOrchestrator.release(lease).catch(() => undefined);
    if (leaseRef.current?.token === lease?.token) leaseRef.current = undefined;
  }, []);

  const pause = useCallback(() => {
    operationGenerationRef.current += 1;
    resumeAfterScrubRef.current = false;
    const lease = leaseRef.current;
    pauseMedia();
    if (mountedRef.current) {
      setStatus((current) => ({
        ...current,
        isBuffering: false,
        playbackState: current.isLoaded ? 'paused' : current.playbackState,
        playing: false,
        timeControlStatus: 'paused',
      }));
    }
    void releaseLease(lease);
  }, [pauseMedia, releaseLease]);

  const failPlayback = useCallback((
    nextError: RecordingPlaybackError,
    operationGeneration: number,
    phase: 'loading' | 'ready',
  ) => {
    if (
      operationGeneration !== operationGenerationRef.current
      || !mountedRef.current
    ) return;
    operationGenerationRef.current += 1;
    resumeAfterScrubRef.current = false;
    pauseMedia();
    setError(nextError);
    setStatus((current) => ({
      ...current,
      isBuffering: false,
      isLoaded: false,
      playbackState: 'error',
      playing: false,
      timeControlStatus: 'paused',
    }));
    emitAudioDiagnostic({ code: nextError, level: 'error', phase, scope: 'playback' });
    void releaseLease();
  }, [pauseMedia, releaseLease]);

  useEffect(() => audioSessionOrchestrator.register('recordingPlayback', {
    deactivate: async () => {
      operationGenerationRef.current += 1;
      resumeAfterScrubRef.current = false;
      if (!pauseMedia()) throw new Error('recording_playback_pause_failed');
      // The orchestrator is already transferring ownership while this callback
      // runs. Releasing here would enqueue behind that same transfer.
      leaseRef.current = undefined;
      if (mountedRef.current) {
        setStatus((current) => ({
          ...current,
          isBuffering: false,
          playbackState: current.isLoaded ? 'paused' : current.playbackState,
          playing: false,
          timeControlStatus: 'paused',
        }));
      }
    },
  }), [pauseMedia]);

  useEffect(() => {
    // React Strict Mode replays effect setup after a simulated cleanup.
    mountedRef.current = true;
    const sourceGeneration = sourceGenerationRef.current + 1;
    sourceGenerationRef.current = sourceGeneration;
    operationGenerationRef.current += 1;
    resumeAfterScrubRef.current = false;
    pauseMedia();
    void releaseLease();
    setError(undefined);
    setStatus(initialStatus(asset));

    const previousMedia = mediaRef.current;
    if (!asset) {
      if (previousMedia) {
        previousMedia.removeAttribute('src');
        try {
          previousMedia.load();
        } catch {
          // Clearing an already-detached Web element is best effort.
        }
      }
      return;
    }

    const operationGeneration = operationGenerationRef.current;
    const failCurrentLoad = () => {
      if (sourceGeneration !== sourceGenerationRef.current) return;
      const nextError = recordingRepository.assetExists(asset)
        ? 'playback_load_failed'
        : 'asset_missing';
      failPlayback(nextError, operationGenerationRef.current, 'loading');
    };

    if (!recordingRepository.assetExists(asset)) {
      failPlayback('asset_missing', operationGeneration, 'loading');
      return;
    }
    if (typeof Audio === 'undefined') {
      failPlayback('playback_load_failed', operationGeneration, 'loading');
      return;
    }

    const media = previousMedia ?? new Audio();
    mediaRef.current = media;
    const expectedUri = normalizedMediaUri(asset.uri);
    const isCurrentSource = () => (
      mountedRef.current
      && sourceGeneration === sourceGenerationRef.current
      && normalizedMediaUri(media.currentSrc || media.src) === expectedUri
    );
    const markSourceReady = () => {
      if (!isCurrentSource()) return;
      setError(undefined);
      setStatus((current) => ({
        ...current,
        duration: loadedDuration(media, current.duration),
        isBuffering: false,
        isLoaded: true,
        playbackState: current.playing ? 'playing' : 'readyToPlay',
        reasonForWaitingToPlay: '',
      }));
    };
    const updateTiming = () => {
      if (!isCurrentSource()) return;
      setStatus((current) => ({
        ...current,
        currentTime: Number.isFinite(media.currentTime) ? media.currentTime : current.currentTime,
        duration: loadedDuration(media, current.duration),
      }));
    };
    const onPlaying = () => {
      if (!isCurrentSource() || media.paused) return;
      markSourceReady();
      setStatus((current) => ({
        ...current,
        didJustFinish: false,
        isBuffering: false,
        playbackState: 'playing',
        playing: true,
        timeControlStatus: 'playing',
      }));
    };
    const onWaiting = () => {
      if (!isCurrentSource() || media.paused) return;
      setStatus((current) => ({
        ...current,
        isBuffering: true,
        playbackState: 'buffering',
        playing: true,
        reasonForWaitingToPlay: 'buffering',
        timeControlStatus: 'waiting',
      }));
    };
    const onPause = () => {
      if (!isCurrentSource() || media.ended || !media.paused) return;
      operationGenerationRef.current += 1;
      setStatus((current) => ({
        ...current,
        isBuffering: false,
        playbackState: current.isLoaded ? 'paused' : current.playbackState,
        playing: false,
        reasonForWaitingToPlay: '',
        timeControlStatus: 'paused',
      }));
      void releaseLease();
    };
    const onEnded = () => {
      if (!isCurrentSource() || !media.ended) return;
      operationGenerationRef.current += 1;
      resumeAfterScrubRef.current = false;
      pauseMedia();
      updateTiming();
      setStatus((current) => ({
        ...current,
        currentTime: loadedDuration(media, current.duration),
        didJustFinish: true,
        isBuffering: false,
        playbackState: 'ended',
        playing: false,
        timeControlStatus: 'paused',
      }));
      emitAudioDiagnostic({ code: 'playback_completed', level: 'info', phase: 'ready', scope: 'playback' });
      void releaseLease();
    };
    const onError = () => {
      if (isCurrentSource()) failCurrentLoad();
    };

    media.addEventListener('loadedmetadata', markSourceReady);
    media.addEventListener('loadeddata', markSourceReady);
    media.addEventListener('canplay', markSourceReady);
    media.addEventListener('durationchange', updateTiming);
    media.addEventListener('timeupdate', updateTiming);
    media.addEventListener('playing', onPlaying);
    media.addEventListener('waiting', onWaiting);
    media.addEventListener('stalled', onWaiting);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onEnded);
    media.addEventListener('error', onError);

    media.preload = 'metadata';
    media.src = asset.uri;
    try {
      media.load();
    } catch {
      failCurrentLoad();
    }

    return () => {
      media.removeEventListener('loadedmetadata', markSourceReady);
      media.removeEventListener('loadeddata', markSourceReady);
      media.removeEventListener('canplay', markSourceReady);
      media.removeEventListener('durationchange', updateTiming);
      media.removeEventListener('timeupdate', updateTiming);
      media.removeEventListener('playing', onPlaying);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('stalled', onWaiting);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onEnded);
      media.removeEventListener('error', onError);
    };
  }, [asset, failPlayback, pauseMedia, releaseLease, retryToken]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active') pause();
    });
    return () => subscription.remove();
  }, [pause]);

  useEffect(() => {
    if (pauseRequest > 0) pause();
  }, [pause, pauseRequest]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sourceGenerationRef.current += 1;
      operationGenerationRef.current += 1;
      resumeAfterScrubRef.current = false;
      pauseMedia();
      void releaseLease();
      const media = mediaRef.current;
      if (!media) return;
      media.removeAttribute('src');
      try {
        media.load();
      } catch {
        // Unmount cleanup must remain best effort.
      }
    };
  }, [pauseMedia, releaseLease]);

  const play = useCallback(async () => {
    const media = mediaRef.current;
    if (!asset || !media || error === 'asset_missing') return false;
    if (!recordingRepository.assetExists(asset)) {
      failPlayback('asset_missing', operationGenerationRef.current, 'ready');
      return false;
    }
    if (!status.isLoaded || appStateRef.current !== 'active') return false;

    const operationGeneration = operationGenerationRef.current + 1;
    operationGenerationRef.current = operationGeneration;
    if (
      status.didJustFinish
      || media.ended
      || (Number.isFinite(media.duration) && media.duration > 0 && media.currentTime >= media.duration)
    ) {
      try {
        media.currentTime = 0;
        setStatus((current) => ({ ...current, currentTime: 0, didJustFinish: false }));
      } catch {
        // A source without metadata can still restart from its natural beginning.
      }
    }

    setStatus((current) => ({
      ...current,
      didJustFinish: false,
      isBuffering: true,
      playbackState: 'starting',
      reasonForWaitingToPlay: 'starting',
      timeControlStatus: 'waiting',
    }));

    // Mobile Safari preserves audible-media permission only while this user
    // activation callback remains on the stack. Start the lease first, then
    // deliberately call play() without awaiting the lease.
    const leasePromise = audioSessionOrchestrator.acquire('recordingPlayback', 'recording-preview');
    let playPromise: Promise<void>;
    try {
      playPromise = Promise.resolve(media.play());
    } catch {
      failPlayback('playback_start_failed', operationGeneration, 'ready');
      void leasePromise.then((lease) => releaseLease(lease), () => undefined);
      return false;
    }

    const guardedLeasePromise = leasePromise.then(async (lease) => {
      if (
        operationGeneration !== operationGenerationRef.current
        || appStateRef.current !== 'active'
        || !mountedRef.current
      ) {
        await releaseLease(lease);
        return undefined;
      }
      leaseRef.current = lease;
      return lease;
    }, () => {
      failPlayback('playback_start_failed', operationGeneration, 'ready');
      return undefined;
    });

    let startTimeout: ReturnType<typeof setTimeout> | undefined;
    const startTimeoutPromise = new Promise<never>((_resolve, reject) => {
      startTimeout = setTimeout(
        () => reject(new Error('recording_playback_start_timeout')),
        RECORDING_PLAYBACK_START_TIMEOUT_MS,
      );
    });
    let lease: AudioLease | undefined;
    try {
      const result = await Promise.race([
        Promise.all([playPromise, guardedLeasePromise]),
        startTimeoutPromise,
      ]);
      lease = result[1];
    } catch {
      failPlayback('playback_start_failed', operationGeneration, 'ready');
      return false;
    } finally {
      if (startTimeout) clearTimeout(startTimeout);
    }

    if (
      !lease
      || operationGeneration !== operationGenerationRef.current
      || appStateRef.current !== 'active'
      || !mountedRef.current
    ) {
      if (lease) await releaseLease(lease);
      return false;
    }

    setError(undefined);
    setStatus((current) => ({
      ...current,
      duration: loadedDuration(media, current.duration),
      isBuffering: false,
      isLoaded: true,
      playbackState: 'playing',
      playing: true,
      reasonForWaitingToPlay: '',
      timeControlStatus: 'playing',
    }));
    emitAudioDiagnostic({ code: 'playback_started', level: 'info', phase: 'playing', scope: 'playback' });
    return true;
  }, [asset, error, failPlayback, releaseLease, status.didJustFinish, status.isLoaded]);

  const beginScrub = useCallback(() => {
    const media = mediaRef.current;
    resumeAfterScrubRef.current = Boolean(media && !media.paused);
    if (!resumeAfterScrubRef.current) return;
    operationGenerationRef.current += 1;
    const lease = leaseRef.current;
    pauseMedia();
    void releaseLease(lease);
  }, [pauseMedia, releaseLease]);

  const cancelScrub = useCallback((onResume?: () => void) => {
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    if (!shouldResume || appStateRef.current !== 'active') return;
    void play().then((started) => { if (started) onResume?.(); });
  }, [play]);

  const finishScrub = useCallback(async (position: number, onResume?: () => void) => {
    const media = mediaRef.current;
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;
    if (!media) return;
    try {
      media.currentTime = position;
      setStatus((current) => ({ ...current, currentTime: position, didJustFinish: false }));
    } catch {
      failPlayback('playback_start_failed', operationGenerationRef.current, 'ready');
      return;
    }
    if (!shouldResume || appStateRef.current !== 'active') return;
    const started = await play();
    if (started) onResume?.();
  }, [failPlayback, play]);

  return {
    beginScrub,
    cancelScrub,
    error,
    finishScrub,
    pause,
    play,
    retry: () => setRetryToken((current) => current + 1),
    status,
  };
}
