import type { AudioStatus } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  audioSessionOrchestrator,
  emitAudioDiagnostic,
  type AudioLease,
  useSessionManagedAudioPlayer,
} from '@/platform/audio';

import { recordingRepository } from './recording-repository';
import type { RecordingAsset } from './types';

const LOAD_TIMEOUT_MS = 4_000;

type RecordingPlaybackStatus = Pick<
  AudioStatus,
  'currentTime' | 'didJustFinish' | 'duration' | 'isLoaded' | 'playbackState' | 'playing'
>;

const LOADING_STATUS: RecordingPlaybackStatus = {
  currentTime: 0,
  didJustFinish: false,
  duration: 0,
  isLoaded: false,
  playbackState: 'loading',
  playing: false,
};

export type RecordingPlaybackError = 'asset_missing' | 'playback_load_failed' | 'playback_start_failed';

export function useRecordingPlayback(asset?: RecordingAsset, pauseRequest = 0) {
  const [retryToken, setRetryToken] = useState(0);
  const sourceKey = asset ? `${asset.id}:${asset.uri}:${retryToken}` : `empty:${retryToken}`;
  const playerSource = useMemo(() => asset ? {
    name: `recording-${asset.id}-${retryToken}`,
    uri: asset.uri,
  } : null, [asset?.id, asset?.uri, retryToken]);
  const player = useSessionManagedAudioPlayer(playerSource, { updateInterval: 100 });
  const [statusSnapshot, setStatusSnapshot] = useState<{
    playerId: string;
    sourceKey: string;
    status: RecordingPlaybackStatus;
  }>();
  const [errorSnapshot, setErrorSnapshot] = useState<{
    error: RecordingPlaybackError;
    sourceKey: string;
  }>();
  const status = statusSnapshot?.sourceKey === sourceKey && statusSnapshot.playerId === player.id
    ? statusSnapshot.status
    : LOADING_STATUS;
  const error = errorSnapshot?.sourceKey === sourceKey ? errorSnapshot.error : undefined;
  const leaseRef = useRef<AudioLease | undefined>(undefined);
  const resumeAfterScrub = useRef(false);
  const operationGeneration = useRef(0);
  const sourceGeneration = useRef(0);
  const activePlayback = useRef<{
    generation: number;
    sourceGeneration: number;
    startedAt: number;
    sawProgress: boolean;
  } | undefined>(undefined);
  const appStateRef = useRef(AppState.currentState || 'active');

  const setCurrentError = useCallback((next?: RecordingPlaybackError) => {
    setErrorSnapshot(next ? { error: next, sourceKey } : undefined);
  }, [sourceKey]);

  useEffect(() => {
    let active = true;
    const acceptStatus = (next: AudioStatus) => {
      if (!active) return;
      setStatusSnapshot({ playerId: player.id, sourceKey, status: next });
    };
    const subscription = player.addListener('playbackStatusUpdate', acceptStatus);
    try {
      const currentStatus = player.currentStatus;
      if (currentStatus) acceptStatus(currentStatus);
    } catch {
      // The source remains explicitly loading until this player emits a status.
    }
    return () => {
      active = false;
      subscription.remove();
    };
  }, [player, sourceKey]);

  const tryPausePlayer = useCallback(() => {
    try {
      player.pause();
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const trySeekPlayer = useCallback(async (position: number) => {
    try {
      await player.seekTo(position);
      return true;
    } catch {
      return false;
    }
  }, [player]);

  const releaseLease = useCallback(async (lease = leaseRef.current) => {
    if (lease) await audioSessionOrchestrator.release(lease).catch(() => undefined);
    if (leaseRef.current?.token === lease?.token) leaseRef.current = undefined;
  }, []);

  const pause = useCallback(() => {
    operationGeneration.current += 1;
    activePlayback.current = undefined;
    const lease = leaseRef.current;
    tryPausePlayer();
    resumeAfterScrub.current = false;
    void releaseLease(lease);
  }, [releaseLease, tryPausePlayer]);

  useEffect(() => audioSessionOrchestrator.register('recordingPlayback', {
    deactivate: async () => {
      operationGeneration.current += 1;
      if (!tryPausePlayer()) throw new Error('recording_playback_pause_failed');
      leaseRef.current = undefined;
    },
  }), [tryPausePlayer]);

  useEffect(() => {
    pause();
    sourceGeneration.current += 1;
    setCurrentError(undefined);
  }, [asset, pause, player, retryToken, setCurrentError]);

  useEffect(() => {
    if (!asset) return;
    const generation = sourceGeneration.current;
    const timeout = setTimeout(() => {
      if (generation !== sourceGeneration.current) return;
      const loaded = status;
      if (!loaded.isLoaded || !Number.isFinite(loaded.duration) || loaded.duration <= 0) return;
      const playbackDurationMillis = loaded.duration * 1_000;
      const tolerance = Math.max(500, Math.max(playbackDurationMillis, asset.durationMillis) * 0.2);
      emitAudioDiagnostic({
        code: 'playback_media_loaded',
        level: 'info',
        phase: 'loading',
        playbackDurationMillis,
        scope: 'playback',
      });
      if (Math.abs(playbackDurationMillis - asset.durationMillis) <= tolerance) return;
      setCurrentError('playback_load_failed');
      emitAudioDiagnostic({
        code: 'playback_duration_mismatch',
        durationMillis: asset.durationMillis,
        level: 'error',
        phase: 'loading',
        playbackDurationMillis,
        scope: 'playback',
      });
    }, 150);
    return () => clearTimeout(timeout);
  }, [asset, retryToken, setCurrentError, status.duration, status.isLoaded]);

  useEffect(() => {
    if (!asset || status.isLoaded) return;
    const timeout = setTimeout(() => {
      const next = recordingRepository.assetExists(asset) ? 'playback_load_failed' : 'asset_missing';
      setCurrentError(next);
      emitAudioDiagnostic({ code: next, level: 'error', phase: 'loading', scope: 'playback' });
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [asset, retryToken, setCurrentError, status.isLoaded]);

  useEffect(() => {
    if (!asset || status.playbackState !== 'error') return;
    pause();
    const next = recordingRepository.assetExists(asset) ? 'playback_load_failed' : 'asset_missing';
    setCurrentError(next);
    emitAudioDiagnostic({ code: next, level: 'error', phase: 'loading', scope: 'playback' });
  }, [asset, pause, setCurrentError, status.playbackState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appStateRef.current = next;
      if (next !== 'active') pause();
    });
    return () => subscription.remove();
  }, [pause]);

  useEffect(() => {
    const active = activePlayback.current;
    if (active && active.generation === operationGeneration.current
      && active.sourceGeneration === sourceGeneration.current
      && !status.didJustFinish
      && (status.playing || status.currentTime > active.startedAt + 0.01)) {
      active.sawProgress = true;
    }
  }, [status.currentTime, status.didJustFinish, status.playing]);

  useEffect(() => {
    const active = activePlayback.current;
    if (!status.didJustFinish || !active?.sawProgress) return;
    operationGeneration.current += 1;
    activePlayback.current = undefined;
    emitAudioDiagnostic({ code: 'playback_completed', level: 'info', phase: 'ready', scope: 'playback' });
    void releaseLease();
  }, [releaseLease, status.didJustFinish]);

  useEffect(() => {
    if (pauseRequest > 0) pause();
  }, [pause, pauseRequest]);

  useEffect(() => () => pause(), [pause]);

  const play = useCallback(async () => {
    if (!asset || error === 'asset_missing') return false;
    if (!status.isLoaded) {
      setCurrentError('playback_load_failed');
      return false;
    }
    const generation = operationGeneration.current + 1;
    operationGeneration.current = generation;
    let lease: AudioLease | undefined;
    try {
      lease = await audioSessionOrchestrator.acquire('recordingPlayback', 'recording-preview');
      if (generation !== operationGeneration.current || appStateRef.current !== 'active') {
        await releaseLease(lease);
        return false;
      }
      leaseRef.current = lease;
      if ((status.didJustFinish || status.currentTime >= status.duration) && !await trySeekPlayer(0)) {
        throw new Error('recording_playback_seek_failed');
      }
      activePlayback.current = {
        generation,
        sawProgress: false,
        sourceGeneration: sourceGeneration.current,
        startedAt: status.currentTime,
      };
      player.play();
      setCurrentError(undefined);
      emitAudioDiagnostic({ code: 'playback_started', level: 'info', phase: 'playing', scope: 'playback' });
      return true;
    } catch {
      if (activePlayback.current?.generation === generation) activePlayback.current = undefined;
      if (lease) await releaseLease(lease);
      setCurrentError('playback_start_failed');
      emitAudioDiagnostic({ code: 'playback_start_failed', level: 'error', phase: 'ready', scope: 'playback' });
      return false;
    }
  }, [asset, error, player, releaseLease, setCurrentError, status.currentTime, status.didJustFinish, status.duration, status.isLoaded, trySeekPlayer]);

  return {
    beginScrub() {
      resumeAfterScrub.current = status.playing;
      if (status.playing) tryPausePlayer();
    },
    cancelScrub(onResume?: () => void) {
      const shouldResume = resumeAfterScrub.current;
      resumeAfterScrub.current = false;
      if (!shouldResume || appStateRef.current !== 'active') return;
      void play().then((started) => { if (started) onResume?.(); });
    },
    error,
    async finishScrub(position: number, onResume?: () => void) {
      const shouldResume = resumeAfterScrub.current;
      resumeAfterScrub.current = false;
      if (!await trySeekPlayer(position)) {
        await releaseLease();
        setCurrentError('playback_start_failed');
        return;
      }
      if (!shouldResume || appStateRef.current !== 'active') return;
      const started = await play();
      if (started) onResume?.();
    },
    pause,
    play,
    retry: () => setRetryToken((current) => current + 1),
    status,
  };
}
